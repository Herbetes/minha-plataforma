-- ============================================================================
-- minha-plataforma · Módulo Radar (Projeto 3 — automação agendada)
-- Faz parte do schema-completo.sql. É idempotente: rodar de novo não quebra nada.
--
-- O Radar roda sozinho, sem ninguém olhando. Isso muda duas coisas em relação
-- aos módulos anteriores:
--
-- 1. Precisa de PREFERÊNCIA explícita: automação que começa a mandar e-mail sem
--    alguém ter pedido é spam, mesmo quando o conteúdo é útil.
-- 2. Precisa de MEMÓRIA do que já enviou: um job que roda duas vezes por
--    qualquer motivo (retry, deploy, clique no botão de teste) manda a mesma
--    cobrança duas vezes. O índice único por dia abaixo é o que impede isso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- radar_prefs: uma linha por usuário. Sem linha, o Radar não envia nada.
-- ----------------------------------------------------------------------------
create table if not exists public.radar_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  ativo       boolean not null default false,
  email       text,
  -- Guardado só para exibir na tela; quem agenda de fato é o cron da Vercel.
  dia_semana  integer not null default 1 check (dia_semana between 0 and 6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- radar_runs: o que o Radar viu e o que fez a respeito.
--
-- Fica gravado mesmo quando não envia e-mail — "não havia nada para avisar" é
-- informação, e sem ela é impossível distinguir semana calma de job quebrado.
-- ----------------------------------------------------------------------------
create table if not exists public.radar_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Data da execução (AAAA-MM-DD). É a chave da idempotência diária.
  chave        text not null check (chave ~ '^\d{4}-\d{2}-\d{2}$'),
  origem       text not null default 'cron' check (origem in ('cron', 'manual')),
  alertas      jsonb not null default '[]'::jsonb,
  criticos     integer not null default 0,
  atencoes     integer not null default 0,
  resumo       text,
  enviado      boolean not null default false,
  email        text,
  erro         text,
  created_at   timestamptz not null default now()
);

-- Uma execução AGENDADA por usuário por dia. É esta linha que impede o mesmo
-- aviso sair duas vezes — o cron tenta gravar antes de mandar o e-mail e, se a
-- gravação esbarrar aqui, o envio nem começa.
--
-- O índice é parcial de propósito: só vale para origem 'cron'. O botão "enviar
-- agora" da tela é um teste, e teste que só funciona uma vez por dia não serve
-- para testar.
drop index if exists radar_runs_dia_idx;
create unique index if not exists radar_runs_dia_cron_idx
  on public.radar_runs (user_id, chave)
  where origem = 'cron';

create index if not exists radar_runs_historico_idx
  on public.radar_runs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS. O cron usa a service role e passa por cima disto de propósito: ele roda
-- sem sessão de usuário nenhuma. Pelo navegador, cada um só vê o seu.
-- ----------------------------------------------------------------------------
alter table public.radar_prefs enable row level security;
alter table public.radar_runs  enable row level security;

drop policy if exists radar_prefs_proprios on public.radar_prefs;
create policy radar_prefs_proprios on public.radar_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists radar_runs_proprios on public.radar_runs;
create policy radar_runs_proprios on public.radar_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
