-- Neo-Tokyo production online schema.
-- Run in a new Supabase project's SQL editor.

-- Lock the legacy prototype store. It remains only so old builds fail closed.
create table if not exists public.game_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.game_kv enable row level security;
drop policy if exists "game shared read" on public.game_kv;
drop policy if exists "game shared insert" on public.game_kv;
drop policy if exists "game shared update" on public.game_kv;
drop policy if exists "game shared delete probes" on public.game_kv;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_url text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.player_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 240),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.leaderboard_entries (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  level integer not null default 1 check (level >= 1),
  money bigint not null default 0 check (money >= 0),
  wins integer not null default 0 check (wins >= 0),
  title text,
  evolution integer not null default 0 check (evolution >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_created_idx on public.chat_messages(created_at desc);
alter table public.profiles enable row level security;
alter table public.player_saves enable row level security;
alter table public.chat_messages enable row level security;
alter table public.leaderboard_entries enable row level security;

drop policy if exists "profiles are visible" on public.profiles;
drop policy if exists "users create own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users read own save" on public.player_saves;
drop policy if exists "users create own save" on public.player_saves;
drop policy if exists "users update own save" on public.player_saves;
drop policy if exists "signed in users read chat" on public.chat_messages;
drop policy if exists "signed in users send chat" on public.chat_messages;
drop policy if exists "signed in users read leaderboard" on public.leaderboard_entries;
drop policy if exists "users create own leaderboard row" on public.leaderboard_entries;
drop policy if exists "users update own leaderboard row" on public.leaderboard_entries;

create policy "profiles are visible" on public.profiles for select to authenticated using (true);
create policy "users create own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users read own save" on public.player_saves for select to authenticated using (auth.uid() = user_id);
create policy "users create own save" on public.player_saves for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own save" on public.player_saves for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "signed in users read chat" on public.chat_messages for select to authenticated using (deleted_at is null);
create policy "signed in users send chat" on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);
create policy "signed in users read leaderboard" on public.leaderboard_entries for select to authenticated using (true);
create policy "users create own leaderboard row" on public.leaderboard_entries for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own leaderboard row" on public.leaderboard_entries for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_player_save()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists player_saves_touch on public.player_saves;
create trigger player_saves_touch before update on public.player_saves
for each row execute function public.touch_player_save();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
