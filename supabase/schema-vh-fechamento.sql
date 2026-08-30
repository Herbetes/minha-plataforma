-- ============================================================================
-- minha-plataforma · Módulo VH — fechamento mensal
-- Cole no SQL Editor do Supabase e execute UMA vez, depois do schema-vh-contas.sql.
-- É idempotente: rodar de novo não quebra nada.
--
-- Na operação da VH a unidade é o mês. Sem isso, um ano depois sobra uma lista
-- de lançamentos sem contexto e ninguém responde "o que aconteceu em agosto".
-- ============================================================================

create table if not exists public.closings (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  competencia              text not null check (competencia ~ '^\d{4}-\d{2}$'),
  status                   text not null default 'aberto'
                           check (status in ('aberto', 'conferencia', 'fechado')),
  receita_bruta_centavos   bigint not null default 0,
  condominio_centavos      bigint not null default 0,
  iptu_centavos            bigint not null default 0,
  pendencias               integer not null default 0,
  relatorio_md             text,
  observacoes              text,
  fechado_em               timestamptz,
  created_at               timestamptz not null default now()
);

create unique index if not exists closings_user_competencia_idx
  on public.closings (user_id, competencia);

-- ----------------------------------------------------------------------------
-- closing_files: tudo que entra e tudo que sai, preso ao mês.
--
-- É o que impede arquivo gerado de se perder numa pasta de Downloads.
-- ----------------------------------------------------------------------------
create table if not exists public.closing_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  closing_id    uuid not null references public.closings (id) on delete cascade,
  direcao       text not null check (direcao in ('entrada', 'saida')),
  tipo          text not null
                check (tipo in ('extrato', 'planilha', 'contrato', 'relatorio', 'desconhecido')),
  account_id    uuid references public.accounts (id) on delete set null,
  nome          text not null,
  storage_path  text,
  bytes         integer,
  status        text not null default 'pendente'
                check (status in ('pendente', 'processado', 'erro')),
  detalhe       text,
  created_at    timestamptz not null default now()
);

create index if not exists closing_files_closing_idx
  on public.closing_files (closing_id, direcao, created_at);

-- ----------------------------------------------------------------------------
-- expenses: condomínio e IPTU por imóvel, por mês.
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  closing_id      uuid not null references public.closings (id) on delete cascade,
  contract_id     uuid references public.contracts (id) on delete set null,
  tipo            text not null check (tipo in ('condominio', 'iptu', 'outro')),
  descricao       text,
  valor_centavos  bigint not null,
  origem          text,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_closing_idx on public.expenses (closing_id, tipo);

-- ----------------------------------------------------------------------------
-- O que já existia passa a pertencer a um mês.
-- ----------------------------------------------------------------------------
alter table public.statements
  add column if not exists closing_id uuid references public.closings (id) on delete set null;

alter table public.transactions
  add column if not exists closing_id uuid references public.closings (id) on delete set null;

alter table public.reconciliations
  add column if not exists closing_id uuid references public.closings (id) on delete set null;

alter table public.agent_runs
  add column if not exists closing_id uuid references public.closings (id) on delete set null;

create index if not exists transactions_closing_idx
  on public.transactions (user_id, closing_id, data);

-- ----------------------------------------------------------------------------
-- Balde dos arquivos do VH, privado e por usuário.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vh', 'vh', false)
on conflict (id) do nothing;

drop policy if exists "vh próprios: ler"    on storage.objects;
drop policy if exists "vh próprios: enviar" on storage.objects;
drop policy if exists "vh próprios: apagar" on storage.objects;

create policy "vh próprios: ler"
  on storage.objects for select
  using (bucket_id = 'vh' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vh próprios: enviar"
  on storage.objects for insert
  with check (bucket_id = 'vh' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "vh próprios: apagar"
  on storage.objects for delete
  using (bucket_id = 'vh' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.closings      enable row level security;
alter table public.closing_files enable row level security;
alter table public.expenses      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['closings', 'closing_files', 'expenses'] loop
    execute format('drop policy if exists %I on public.%I', t || '_proprios', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_proprios', t
    );
  end loop;
end $$;
