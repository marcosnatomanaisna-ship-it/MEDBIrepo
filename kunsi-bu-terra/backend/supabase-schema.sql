-- ============================================================================
-- Kunsi bu Terra — schema novo/atualizado do Supabase
-- Corre isto no SQL Editor do teu projeto Supabase.
-- ============================================================================

-- 1) TORNAR O LEADERBOARD ATUAL MAIS SEGURO
--    Hoje o browser escreve DIRETO na tabela com a "anon key", o que significa
--    que qualquer pessoa com o site aberto consegue abrir a consola do
--    telemóvel/PC e enviar um XP falso enorme. A partir de agora, só o
--    backend (com a service_role key, que nunca vai para o telemóvel) pode
--    escrever. O browser só lê (para mostrar o ranking).
drop policy if exists "escrita publica" on public.leaderboard;
drop policy if exists "atualizacao publica" on public.leaderboard;
-- a policy de leitura pública mantém-se (não a apagues):
--   create policy "leitura publica" on public.leaderboard for select using (true);

alter table public.leaderboard enable row level security;

-- 2) LOG DE SUBMISSÕES — histórico de tudo o que foi enviado, aceite ou não.
--    Serve para auditoria e para detetares padrões suspeitos (ex.: um
--    device_id a tentar enviar XP muitas vezes seguidas).
create table if not exists public.score_submissions (
  id bigint generated always as identity primary key,
  device_id text not null,
  xp integer not null,
  xp_delta integer not null,
  played integer not null,
  total_correct integer not null,
  accepted boolean not null,
  reject_reason text,
  created_at timestamptz default now()
);
alter table public.score_submissions enable row level security;
-- sem políticas públicas: só o backend acede (via service_role key).

create index if not exists score_submissions_device_idx
  on public.score_submissions (device_id, created_at desc);

-- 3) SUBSCRIÇÕES PUSH — para o lembrete diário de streak.
create table if not exists public.push_subscriptions (
  device_id text primary key,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  timezone text,
  last_played_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
-- sem políticas públicas: só o backend acede.
