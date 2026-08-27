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
