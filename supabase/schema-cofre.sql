-- ============================================================================
-- minha-plataforma · Cofre de documentos (Projeto 1)
-- Cole no SQL Editor do Supabase e execute UMA vez, depois do schema.sql.
-- É idempotente: rodar de novo não quebra nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- documents: um arquivo enviado por você.
-- O PDF em si mora no Storage; aqui fica o registro e o estado do processamento.
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  storage_path  text not null unique,
  bytes         integer,
  pages         integer,
  chunk_count   integer not null default 0,
  status        text not null default 'processando'
                check (status in ('processando', 'pronto', 'erro')),
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists documents_user_idx
  on public.documents (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- chunks: o documento partido em trechos pesquisáveis.
--
-- `tsv` é uma coluna gerada: o Postgres mantém sozinho o índice de busca do
-- texto, em português (reconhece plural, acento e conjugação — "reajustes"
-- encontra "reajuste").
-- ----------------------------------------------------------------------------
create table if not exists public.chunks (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references public.documents (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  ordinal      integer not null,
  page         integer,
  content      text not null,
  tsv          tsvector generated always as (to_tsvector('portuguese', content)) stored,
  created_at   timestamptz not null default now()
);

create index if not exists chunks_tsv_idx on public.chunks using gin (tsv);
create index if not exists chunks_document_idx on public.chunks (document_id, ordinal);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só alcança os próprios documentos.
-- ----------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.chunks    enable row level security;

drop policy if exists "documentos próprios" on public.documents;
create policy "documentos próprios"
  on public.documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "trechos próprios" on public.chunks;
create policy "trechos próprios"
  on public.chunks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- buscar_trechos: a busca em si.
--
-- Roda como "security invoker" (o padrão), então o RLS acima continua valendo:
-- a função só enxerga os trechos de quem chamou.
-- ----------------------------------------------------------------------------
create or replace function public.buscar_trechos(consulta text, limite integer default 8)
returns table (
  chunk_id     bigint,
  document_id  uuid,
  documento    text,
  pagina       integer,
  ordinal      integer,
  conteudo     text,
  score        real
)
language sql
stable
as $$
  select c.id, c.document_id, d.title, c.page, c.ordinal, c.content,
         ts_rank(c.tsv, to_tsquery('portuguese', consulta)) as score
    from public.chunks c
    join public.documents d on d.id = c.document_id
   where c.tsv @@ to_tsquery('portuguese', consulta)
   order by score desc, c.ordinal asc
   limit least(greatest(coalesce(limite, 8), 1), 20);
$$;

-- ----------------------------------------------------------------------------
-- Storage: o balde onde os PDFs ficam. Privado — nada é servido publicamente.
-- Cada usuário só mexe na própria pasta, que leva o id dele no caminho.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "arquivos próprios: ler"     on storage.objects;
drop policy if exists "arquivos próprios: enviar"  on storage.objects;
drop policy if exists "arquivos próprios: apagar"  on storage.objects;

create policy "arquivos próprios: ler"
  on storage.objects for select
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "arquivos próprios: enviar"
  on storage.objects for insert
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "arquivos próprios: apagar"
  on storage.objects for delete
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
