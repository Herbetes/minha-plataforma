-- ============================================================================
-- minha-plataforma · SCHEMA COMPLETO
--
-- ESTE É O ÚNICO ARQUIVO QUE VOCÊ PRECISA RODAR.
--
-- Cole tudo no SQL Editor do Supabase e execute. É idempotente: rodar de novo
-- não apaga nada nem quebra nada — pode rodar sempre que eu publicar novidade.
--
-- Gerado a partir dos arquivos individuais, na ordem em que dependem uns dos
-- outros. Não edite este arquivo à mão: edite o original e gere de novo com
--     npm run schema
-- ============================================================================


-- ============================================================================
-- origem: supabase/schema.sql
-- ============================================================================

-- ============================================================================
-- minha-plataforma · schema inicial (Projeto 0)
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute uma vez.
-- É idempotente: rodar de novo não quebra nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- conversations: uma linha por conversa de um usuário.
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Nova conversa',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ----------------------------------------------------------------------------
-- messages: memória de conversa (tipo 1 dos quatro do roadmap).
-- Guardamos tokens e custo desde o primeiro dia — sem isso você nunca
-- descobre para onde foi o dinheiro.
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  model            text,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, id);

-- ----------------------------------------------------------------------------
-- Row Level Security.
-- Sem isto, a anon key deixaria qualquer pessoa ler as conversas de todo mundo.
-- Com isto, cada usuário só enxerga as próprias linhas — o banco garante,
-- não o código da aplicação.
-- ----------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "conversas próprias" on public.conversations;
create policy "conversas próprias"
  on public.conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "mensagens próprias" on public.messages;
create policy "mensagens próprias"
  on public.messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- updated_at automático na conversa.
-- ----------------------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();


-- ============================================================================
-- origem: supabase/schema-cofre.sql
-- ============================================================================

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


-- ============================================================================
-- origem: supabase/schema-pastas.sql
-- ============================================================================

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


-- ============================================================================
-- origem: supabase/schema-vh.sql
-- ============================================================================

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


-- ============================================================================
-- origem: supabase/schema-vh-contas.sql
-- ============================================================================

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


-- ============================================================================
-- origem: supabase/schema-vh-fechamento.sql
-- ============================================================================

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


-- ============================================================================
-- origem: supabase/schema-radar.sql
-- ============================================================================

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

