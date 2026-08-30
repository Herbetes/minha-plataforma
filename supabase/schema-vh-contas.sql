-- ============================================================================
-- minha-plataforma · Módulo VH — contas, padrões de pagador e sócios
-- Cole no SQL Editor do Supabase e execute UMA vez, depois do schema-vh.sql.
-- É idempotente: rodar de novo não quebra nada.
--
-- Vem da leitura da skill "agente-contabil-vh": os aluguéis da VH caem em três
-- contas do BB (VH, Herbetes e Cláudia), e cada imóvel tem a sua. Sem saber a
-- conta, duas coisas ficam impossíveis: conferir o saldo de cada extrato e
-- distinguir um DARF pago pela empresa de um pago por pessoa física — que é
-- empréstimo do sócio.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- accounts: as contas bancárias que recebem.
-- ----------------------------------------------------------------------------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  apelido     text not null,
  titular     text,
  tipo        text not null default 'pj' check (tipo in ('pj', 'pf')),
  banco       text,
  agencia     text,
  numero      text,
  ativa       boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists accounts_user_apelido_idx
  on public.accounts (user_id, lower(btrim(apelido)));

-- ----------------------------------------------------------------------------
-- partners: os sócios, para reconhecer dividendos.
-- ----------------------------------------------------------------------------
create table if not exists public.partners (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  nome        text not null,
  documento   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists partners_user_nome_idx
  on public.partners (user_id, lower(btrim(nome)));

-- ----------------------------------------------------------------------------
-- Contrato ganha conta destino e padrões de pagador.
--
-- `padroes` guarda os nomes como aparecem no extrato. O locatário assina o
-- contrato como "João da Silva Souza" e paga como "J S SOUZA" ou pela empresa
-- dele — comparar só com o nome do contrato erra justamente nesses casos.
-- ----------------------------------------------------------------------------
alter table public.contracts
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

alter table public.contracts
  add column if not exists padroes text[] not null default '{}';

alter table public.contracts
  add column if not exists tipo_imovel text;

alter table public.contracts
  add column if not exists garantia text;

alter table public.contracts
  add column if not exists condominio_centavos bigint;

alter table public.contracts
  add column if not exists iptu_centavos bigint;

create index if not exists contracts_account_idx
  on public.contracts (user_id, account_id);

-- ----------------------------------------------------------------------------
-- Extrato e lançamento passam a saber de que conta vieram.
-- ----------------------------------------------------------------------------
alter table public.statements
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

alter table public.transactions
  add column if not exists account_id uuid references public.accounts (id) on delete set null;

create index if not exists transactions_account_idx
  on public.transactions (user_id, account_id, data desc);

-- A impressão digital passa a incluir a conta: o mesmo valor no mesmo dia em
-- duas contas diferentes são dois lançamentos reais, não uma duplicata.
--
-- Índice nas colunas exatas, sem expressão: o ON CONFLICT da importação só
-- reconhece índice assim. Com `coalesce` o Postgres recusa a gravação inteira.
-- `nulls not distinct` faz o lançamento sem conta também não duplicar.
drop index if exists transactions_impressao_idx;
drop index if exists transactions_impressao_conta_idx;
create unique index if not exists transactions_impressao_conta_idx
  on public.transactions (user_id, account_id, impressao) nulls not distinct;

-- ----------------------------------------------------------------------------
-- RLS nas tabelas novas.
-- ----------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.partners enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'partners'] loop
    execute format('drop policy if exists %I on public.%I', t || '_proprios', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_proprios', t
    );
  end loop;
end $$;
