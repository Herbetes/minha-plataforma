-- ============================================================================
-- minha-plataforma · Pastas do Cofre
-- Cole no SQL Editor do Supabase e execute UMA vez, depois do schema-cofre.sql.
-- É idempotente: rodar de novo não quebra nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- folders: um nível só, de propósito.
--
-- Hierarquia profunda dá trabalho de manter e, na prática, ninguém lembra onde
-- arquivou. Se um dia faltar, acrescentamos subpasta sem refazer nada.
-- ----------------------------------------------------------------------------
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now()
);

-- Duas pastas com o mesmo nome confundem mais do que ajudam — e "VH" e "vh"
-- são a mesma pasta na cabeça de quem usa.
create unique index if not exists folders_user_name_idx
  on public.folders (user_id, lower(btrim(name)));

-- ----------------------------------------------------------------------------
-- Liga documento à pasta.
--
-- `on delete set null`: apagar a pasta NÃO apaga os documentos dela. Eles
-- voltam para "Sem pasta". Apagar arquivo por tabela deletada seria uma perda
-- silenciosa e irreversível.
-- ----------------------------------------------------------------------------
alter table public.documents
  add column if not exists folder_id uuid references public.folders (id) on delete set null;

create index if not exists documents_folder_idx
  on public.documents (user_id, folder_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.folders enable row level security;

drop policy if exists "pastas próprias" on public.folders;
create policy "pastas próprias"
  on public.folders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- buscar_trechos, agora com mira: dá para procurar só dentro de uma pasta.
--
-- Com muitos documentos, procurar em tudo piora a resposta — o trecho certo
-- compete com ruído de outros assuntos. Limitar o alcance melhora o resultado,
-- não só a organização.
--
-- Precisa de DROP antes: acrescentar parâmetro cria uma função irmã em vez de
-- substituir a antiga, e a chamada com dois argumentos ficaria ambígua.
-- ----------------------------------------------------------------------------
drop function if exists public.buscar_trechos(text, integer);
drop function if exists public.buscar_trechos(text, integer, uuid);
drop function if exists public.buscar_trechos(text, integer, uuid, boolean);

create function public.buscar_trechos(
  consulta   text,
  limite     integer default 8,
  pasta_id   uuid default null,
  sem_pasta  boolean default false
)
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
     and (
           -- Três alcances possíveis, e o seletor da tela usa os três:
           -- tudo, uma pasta específica, ou só o que não foi arquivado ainda.
           case
             when sem_pasta      then d.folder_id is null
             when pasta_id is not null then d.folder_id = pasta_id
             else true
           end
         )
   order by score desc, c.ordinal asc
   limit least(greatest(coalesce(limite, 8), 1), 20);
$$;
