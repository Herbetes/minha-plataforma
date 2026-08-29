-- ============================================================================
-- minha-plataforma · Módulo VH (Projeto 2 — agente com ferramentas)
-- Cole no SQL Editor do Supabase e execute UMA vez.
-- É idempotente: rodar de novo não quebra nada.
--
-- Dinheiro é guardado em CENTAVOS, como número inteiro. Valor decimal em ponto
-- flutuante acumula erro de arredondamento, e numa conciliação de aluguel um
-- centavo de diferença vira divergência que ninguém consegue explicar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- contracts: o cadastro de imóveis e contratos. É contra isto que o extrato
-- será conciliado — sem ele o agente não tem com o que comparar.
-- ----------------------------------------------------------------------------
create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  imovel           text not null,
  locatario        text not null,
  documento        text,
  valor_centavos   bigint not null check (valor_centavos > 0),
  dia_vencimento   integer check (dia_vencimento between 1 and 31),
  indice_reajuste  text,
  mes_reajuste     integer check (mes_reajuste between 1 and 12),
  vigencia_inicio  date,
  vigencia_fim     date,
  ativo            boolean not null default true,
  observacoes      text,
  created_at       timestamptz not null default now()
);

create index if not exists contracts_user_idx on public.contracts (user_id, ativo, locatario);

-- ----------------------------------------------------------------------------
-- statements / transactions: o extrato e seus lançamentos.
-- ----------------------------------------------------------------------------
create table if not exists public.statements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  conta          text,
  arquivo_nome   text,
  origem         text not null check (origem in ('csv', 'ofx')),
  periodo_inicio date,
  periodo_fim    date,
  total          integer not null default 0,
  novos          integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  statement_id    uuid references public.statements (id) on delete set null,
  data            date not null,
  historico       text not null,
  documento       text,
  valor_centavos  bigint not null,
  impressao       text not null,
  created_at      timestamptz not null default now()
);

-- Idempotência: reenviar o mesmo extrato não duplica lançamento. Sem isto,
-- subir o arquivo duas vezes dobraria a receita do mês.
create unique index if not exists transactions_impressao_idx
  on public.transactions (user_id, impressao);

create index if not exists transactions_user_data_idx
  on public.transactions (user_id, data desc);

-- ----------------------------------------------------------------------------
-- reconciliations: a PROPOSTA do agente.
--
-- Nada aqui é verdade contábil até você aprovar. O agente só escreve linhas com
-- status 'proposta'; virar 'aprovada' exige um clique seu.
-- ----------------------------------------------------------------------------
create table if not exists public.reconciliations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  transaction_id  uuid not null references public.transactions (id) on delete cascade,
  contract_id     uuid references public.contracts (id) on delete set null,
  categoria       text not null default 'aluguel'
                  check (categoria in ('aluguel', 'dividendo', 'darf', 'outro')),
  competencia     text,
  confianca       integer not null check (confianca between 0 and 100),
  justificativa   text not null,
  status          text not null default 'proposta'
                  check (status in ('proposta', 'aprovada', 'rejeitada')),
  run_id          uuid,
  decidido_em     timestamptz,
  created_at      timestamptz not null default now()
);

-- Um lançamento tem no máximo uma proposta viva por vez.
create unique index if not exists reconciliations_transacao_idx
  on public.reconciliations (transaction_id);

create index if not exists reconciliations_status_idx
  on public.reconciliations (user_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- agent_runs / agent_steps: memória de trabalho e trilha de auditoria.
--
-- É o que permite responder "por que o agente decidiu isso?" seis meses depois.
-- Sem isso, um agente é uma caixa preta que mexe nos seus números.
-- ----------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  agente         text not null,
  statement_id   uuid references public.statements (id) on delete set null,
  status         text not null default 'executando'
                 check (status in ('executando', 'concluido', 'erro')),
  modelo         text,
  input_tokens   integer,
  output_tokens  integer,
  iteracoes      integer not null default 0,
  propostas      integer not null default 0,
  erro           text,
  iniciado_em    timestamptz not null default now(),
  terminado_em   timestamptz
);

create table if not exists public.agent_steps (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.agent_runs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  ordem       integer not null,
  ferramenta  text not null,
  entrada     jsonb,
  saida       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists agent_steps_run_idx on public.agent_steps (run_id, ordem);

-- ----------------------------------------------------------------------------
-- Row Level Security em tudo.
-- ----------------------------------------------------------------------------
alter table public.contracts       enable row level security;
alter table public.statements      enable row level security;
alter table public.transactions    enable row level security;
alter table public.reconciliations enable row level security;
alter table public.agent_runs      enable row level security;
alter table public.agent_steps     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'contracts', 'statements', 'transactions',
    'reconciliations', 'agent_runs', 'agent_steps'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_proprios', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_proprios', t
    );
  end loop;
end $$;
