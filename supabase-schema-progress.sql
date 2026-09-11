-- Run this in the Supabase SQL editor. It's additive -- it only adds a new
-- column to `lobbies` (if missing) and a new `lobby_progress` table; it does
-- not touch your existing `lobbies` rows or RLS policies.

-- Which word (by index into lobbies.words) the whole room is currently on.
-- Every student's browser watches this column via the same realtime
-- subscription they already use for `status`, so when the teacher clicks
-- "Next word", everyone advances together.
alter table lobbies add column if not exists current_word_index int not null default 0;

-- One row per (lobby, student, word). This is what makes guessing real:
-- each student's own browser writes to their own row as they guess letters,
-- and the teacher's dashboard subscribes to all rows for the lobby and
-- renders whichever one just changed.
create table if not exists lobby_progress (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references lobbies(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  word_index int not null default 0,
  guessed text[] not null default '{}',
  misses int not null default 0,
  done boolean not null default false,
  won boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (lobby_id, player_id, word_index)
);

alter table lobby_progress enable row level security;

-- Same trust model as your existing `lobbies.players` jsonb column: anyone
-- holding the publishable key can read/write. Fine for a live classroom
-- room with a short-lived, hard-to-guess code. Anyone with the room code
-- and access to devtools could technically inspect the word in
-- `lobbies.words` too, exactly as they already could -- this doesn't change
-- that trust boundary, just extends it to per-guess data.
create policy "lobby_progress_select" on lobby_progress
  for select using (true);

create policy "lobby_progress_insert" on lobby_progress
  for insert with check (true);

create policy "lobby_progress_update" on lobby_progress
  for update using (true);

-- Make sure Supabase Realtime actually broadcasts changes on this table.
-- (Skip this line if your project already added it, or if it errors saying
-- the table is already a member -- that means it's already on.)
alter publication supabase_realtime add table lobby_progress;
