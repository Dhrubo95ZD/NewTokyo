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

-- Ranking writes are derived from the signed-in account save rather than accepting
-- arbitrary level/money values in a leaderboard request.
drop policy if exists "users create own leaderboard row" on public.leaderboard_entries;
drop policy if exists "users update own leaderboard row" on public.leaderboard_entries;
revoke insert, update, delete on public.leaderboard_entries from authenticated;
create or replace function public.sync_my_leaderboard()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s jsonb; c jsonb; runner_name text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select save_data into s from public.player_saves where user_id=auth.uid();
  c := case when coalesce((s->>'schemaVersion')::integer,0) >= 3 then s->'core' else s end;
  select display_name into runner_name from public.profiles where id=auth.uid();
  insert into public.leaderboard_entries(user_id,display_name,level,money,wins,title,evolution,updated_at)
  values(auth.uid(),coalesce(runner_name,'Runner'),least(1000,greatest(1,coalesce((c->>'level')::integer,1))),least(1000000000000000,greatest(0,coalesce((c->>'money')::bigint,0))),least(100000000,greatest(0,coalesce((c->'counters'->>'fightsWon')::integer,0))),left(c->>'title',64),least(1000,greatest(0,coalesce((c->>'evo')::integer,0))),now())
  on conflict(user_id) do update set display_name=excluded.display_name,level=excluded.level,money=excluded.money,wins=excluded.wins,title=excluded.title,evolution=excluded.evolution,updated_at=now();
end;
$$;
grant execute on function public.sync_my_leaderboard() to authenticated;

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

-- Server-owned Armory progression. Clients may read their row, but all rewards,
-- pity and enhancement mutations go through the functions below.
create table if not exists public.player_armories (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"version":2,"owned":[],"equipped":{"weapon":null,"helmet":null,"armor":null,"boots":null},"enhancement":{},"shards":0,"runs":0,"prismPity":0,"history":[],"tutorialStep":0}'::jsonb,
  run_token uuid,
  run_started_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.player_armories enable row level security;
drop policy if exists "users read own armory" on public.player_armories;
create policy "users read own armory" on public.player_armories for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.player_armories from authenticated;
grant select on public.player_armories to authenticated;

create or replace function public.ensure_armory()
returns public.player_armories
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.player_armories;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.player_armories(user_id, state)
  select auth.uid(), coalesce(save_data->'armory', '{"version":2,"owned":[],"equipped":{"weapon":null,"helmet":null,"armor":null,"boots":null},"enhancement":{},"shards":0,"runs":0,"prismPity":0,"history":[],"tutorialStep":0}'::jsonb)
  from public.player_saves where user_id = auth.uid()
  on conflict (user_id) do nothing;
  insert into public.player_armories(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into result from public.player_armories where user_id = auth.uid();
  return result;
end;
$$;

create or replace function public.get_armory_state()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.player_armories;
begin row := public.ensure_armory(); return row.state; end;
$$;

create or replace function public.start_district_run()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.player_armories; token uuid := gen_random_uuid();
begin
  row := public.ensure_armory();
  if row.run_started_at is not null and row.run_started_at > now() - interval '8 seconds' then raise exception 'run already active'; end if;
  update public.player_armories set run_token = token, run_started_at = now(), updated_at = now() where user_id = auth.uid();
  return jsonb_build_object('token', token, 'state', row.state);
end;
$$;

create or replace function public.complete_district_run(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.player_armories; s jsonb; rarity text; set_id text; slot_id text; item_id text;
  roll double precision := random() * 100; pity integer; run_count integer; duplicate boolean; shard_gain integer := 0;
  sets text[] := array['street-ronin','neon-sentinel','void-reaver','crimson-oni','ghost-protocol','chrome-wraith','biohazard-lotus','solar-shogun','glacier-viper','storm-circuit'];
  slots text[] := array['weapon','helmet','armor','boots'];
begin
  select * into row from public.player_armories where user_id = auth.uid() for update;
  if row.user_id is null or row.run_token is distinct from p_token then raise exception 'invalid district run'; end if;
  if row.run_started_at > now() - interval '8 seconds' then raise exception 'district run completed too quickly'; end if;
  if row.run_started_at < now() - interval '15 minutes' then raise exception 'district run expired'; end if;
  s := row.state; pity := coalesce((s->>'prismPity')::integer, 0); run_count := coalesce((s->>'runs')::integer, 0);
  if run_count = 0 then rarity := 'green'; slot_id := 'weapon';
  elsif pity >= 999 or roll >= 99.9 then rarity := 'prismatic';
  elsif roll >= 97.5 then rarity := 'orange'; elsif roll >= 88 then rarity := 'yellow'; elsif roll >= 60 then rarity := 'blue'; else rarity := 'green'; end if;
  set_id := sets[1 + floor(random() * array_length(sets, 1))::integer];
  if slot_id is null then slot_id := slots[1 + floor(random() * array_length(slots, 1))::integer]; end if;
  item_id := set_id || ':' || rarity || ':' || slot_id;
  duplicate := coalesce(s->'owned', '[]'::jsonb) ? item_id;
  if duplicate then shard_gain := case rarity when 'green' then 4 when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 else 300 end;
  else s := jsonb_set(s, '{owned}', coalesce(s->'owned','[]'::jsonb) || to_jsonb(item_id), true); end if;
  s := jsonb_set(s, '{runs}', to_jsonb(run_count + 1), true);
  s := jsonb_set(s, '{prismPity}', to_jsonb(case when rarity = 'prismatic' then 0 else pity + 1 end), true);
  s := jsonb_set(s, '{shards}', to_jsonb(greatest(coalesce((s->>'shards')::integer, 0) + shard_gain, case when run_count = 0 then 12 else 0 end)), true);
  if run_count = 0 then s := jsonb_set(s, '{tutorialStep}', '1'::jsonb, true); end if;
  s := jsonb_set(s, '{history}', jsonb_build_array(jsonb_build_object('id',item_id,'duplicate',duplicate,'at',extract(epoch from now())*1000)) || coalesce(s->'history','[]'::jsonb), true);
  update public.player_armories set state=s, run_token=null, run_started_at=null, updated_at=now() where user_id=auth.uid();
  return jsonb_build_object('state',s,'drop',jsonb_build_object('id',item_id,'duplicate',duplicate,'shards',shard_gain));
end;
$$;

create or replace function public.save_armory_loadout(p_equipped jsonb, p_tutorial_step integer default 0)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.player_armories; s jsonb; slot text; item text;
begin
  row := public.ensure_armory(); s := row.state;
  foreach slot in array array['weapon','helmet','armor','boots'] loop
    item := p_equipped->>slot;
    if item is not null and not (coalesce(s->'owned','[]'::jsonb) ? item) then raise exception 'item is not owned'; end if;
  end loop;
  s := jsonb_set(s,'{equipped}',p_equipped,true);
  s := jsonb_set(s,'{tutorialStep}',to_jsonb(greatest(coalesce((s->>'tutorialStep')::integer,0),p_tutorial_step)),true);
  update public.player_armories set state=s,updated_at=now() where user_id=auth.uid(); return s;
end;
$$;

create or replace function public.enhance_armory_item(p_item_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.player_armories; s jsonb; rarity text; level integer; shards integer; base_cost integer; cost integer; chance double precision; success boolean;
begin
  select * into row from public.player_armories where user_id=auth.uid() for update;
  if row.user_id is null or not (coalesce(row.state->'owned','[]'::jsonb) ? p_item_id) then raise exception 'item is not owned'; end if;
  s := row.state; rarity := split_part(p_item_id,':',2); level := coalesce((s->'enhancement'->>p_item_id)::integer,0);
  if level >= 20 then raise exception 'maximum enhancement reached'; end if;
  base_cost := case rarity when 'green' then 2 when 'blue' then 5 when 'yellow' then 12 when 'orange' then 30 else 75 end;
  cost := base_cost * (level + 1); shards := coalesce((s->>'shards')::integer,0);
  if shards < cost then raise exception 'not enough Nano Shards'; end if;
  chance := case when level < 5 then 1 when level < 10 then .82 when level < 15 then .58 when level < 19 then .32 else .16 end;
  success := random() <= chance; s := jsonb_set(s,'{shards}',to_jsonb(shards-cost),true);
  if success then s := jsonb_set(s,array['enhancement',p_item_id],to_jsonb(level+1),true); end if;
  if success and coalesce((s->>'tutorialStep')::integer,0)=2 then s := jsonb_set(s,'{tutorialStep}','3'::jsonb,true); end if;
  update public.player_armories set state=s,updated_at=now() where user_id=auth.uid();
  return jsonb_build_object('state',s,'success',success,'level',case when success then level+1 else level end);
end;
$$;

grant execute on function public.get_armory_state() to authenticated;
grant execute on function public.start_district_run() to authenticated;
grant execute on function public.complete_district_run(uuid) to authenticated;
grant execute on function public.save_armory_loadout(jsonb,integer) to authenticated;
grant execute on function public.enhance_armory_item(text) to authenticated;
