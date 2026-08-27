-- Neon Depths procedural expeditions. Apply after the existing schema and 20260824-20260831 migrations.

do $$ begin
  if to_regclass('public.player_armories') is null
    or to_regprocedure('public.require_google_player()') is null
    or to_regprocedure('public.calculate_player_combat_power(uuid)') is null
    or to_regprocedure('public.roll_dungeon_drop(jsonb,integer,boolean)') is null then
    raise exception 'Apply the existing NewTokyo migrations before Neon Depths';
  end if;
end $$;

create table if not exists public.neon_depths_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  highest_tier integer not null default 1 check(highest_tier between 1 and 99),
  rooms_cleared bigint not null default 0,
  extractions bigint not null default 0,
  bosses_defeated bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.neon_depths_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seed bigint not null,
  tier integer not null check(tier between 1 and 99),
  route jsonb not null check(jsonb_typeof(route)='array'),
  room_index integer not null default 0,
  backpack jsonb not null default '[]'::jsonb check(jsonb_typeof(backpack)='array'),
  party_mode text not null check(party_mode in ('solo','bots','public')),
  bots integer not null default 0 check(bots between 0 and 2),
  status text not null default 'active' check(status in ('active','extracted','defeated','abandoned')),
  room_started_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_neon_depths_run on public.neon_depths_runs(user_id) where status='active';
create index if not exists neon_depths_run_owner on public.neon_depths_runs(user_id,updated_at desc);

alter table public.neon_depths_progress enable row level security;
alter table public.neon_depths_runs enable row level security;
drop policy if exists "users read own depths progress" on public.neon_depths_progress;
create policy "users read own depths progress" on public.neon_depths_progress for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own depths runs" on public.neon_depths_runs;
create policy "users read own depths runs" on public.neon_depths_runs for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.neon_depths_progress,public.neon_depths_runs from anon,authenticated;
grant select on public.neon_depths_progress,public.neon_depths_runs to authenticated;

create or replace function public.depths_recommended_cp(p_tier integer) returns integer
language sql immutable set search_path=public,pg_temp as $$
  select round(420*power(greatest(1,least(99,p_tier)),1.48))::integer
$$;
revoke all on function public.depths_recommended_cp(integer) from public,anon,authenticated;

create or replace function public.build_neon_depths_route(p_seed bigint,p_tier integer) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare room_count integer:=least(12,7+floor(greatest(1,p_tier)/3.0)::integer); result jsonb:='[]'::jsonb; i integer; selector integer; room_type text; elite boolean; accent text; branch text;
begin
  for i in 0..room_count-1 loop
    selector:=abs(((p_seed%(2147483647-i*17))+i*7919)::bigint)::integer;
    room_type:=case when i=room_count-1 then 'boss' when i=0 then 'combat' else (array['combat','shootout','breach','salvage'])[(selector%4)+1] end;
    elite:=room_type<>'boss' and i>1 and selector%5=0;
    accent:=(array['cyan','magenta','amber','violet'])[((selector/7)%4)+1];
    branch:=case when selector%2=0 then 'Freight Spine' else 'Flooded Relay' end;
    result:=result||jsonb_build_array(jsonb_build_object('index',i,'type',room_type,'elite',elite,'canExtract',(i>0 and (i%3=2 or i=room_count-1)),'accent',accent,'branch',branch));
  end loop;
  return result;
end $$;
revoke all on function public.build_neon_depths_route(bigint,integer) from public,anon,authenticated;

create or replace function public.get_my_neon_depths_state() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); run public.neon_depths_runs; progress public.neon_depths_progress;
begin
  insert into public.neon_depths_progress(user_id) values(uid) on conflict do nothing;
  select * into progress from public.neon_depths_progress where user_id=uid;
  select * into run from public.neon_depths_runs where user_id=uid and status='active' order by started_at desc limit 1;
  if run.id is null then return jsonb_build_object('authority',true,'active',false,'status','idle','highestTier',progress.highest_tier,'extractions',progress.extractions); end if;
  return jsonb_build_object('authority',true,'active',true,'id',run.id,'status',run.status,'seed',run.seed::text,'tier',run.tier,'route',run.route,'roomIndex',run.room_index,'backpack',run.backpack,'partyMode',run.party_mode,'bots',run.bots,'highestTier',progress.highest_tier,'extractions',progress.extractions,'recommendedCp',public.depths_recommended_cp(run.tier));
end $$;
revoke all on function public.get_my_neon_depths_state() from public,anon;
grant execute on function public.get_my_neon_depths_state() to authenticated;

create or replace function public.start_neon_depths(p_tier integer,p_party_mode text default 'solo') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); chosen_tier integer:=greatest(1,least(99,coalesce(p_tier,1))); mode text:=lower(coalesce(p_party_mode,'solo')); run_seed bigint; run_id uuid;
begin
  if mode not in ('solo','bots','public') then raise exception 'Unknown expedition squad mode'; end if;
  if exists(select 1 from public.neon_depths_runs where user_id=uid and status='active') then raise exception 'Extract or abandon the current descent first'; end if;
  insert into public.neon_depths_progress(user_id) values(uid) on conflict do nothing;
  run_seed:=floor(random()*9000000000000000)::bigint+extract(epoch from clock_timestamp())::bigint;
  insert into public.neon_depths_runs(user_id,seed,tier,route,party_mode,bots) values(uid,run_seed,chosen_tier,public.build_neon_depths_route(run_seed,chosen_tier),mode,case when mode='bots' then 2 when mode='public' then 0 else 0 end) returning id into run_id;
  return jsonb_build_object('state',public.get_my_neon_depths_state(),'runId',run_id,'cp',public.calculate_player_combat_power(uid),'overreach',public.calculate_player_combat_power(uid)<public.depths_recommended_cp(chosen_tier));
end $$;
revoke all on function public.start_neon_depths(integer,text) from public,anon;
grant execute on function public.start_neon_depths(integer,text) to authenticated;

create or replace function public.advance_neon_depths(p_run_id uuid,p_room_index integer,p_outcome text,p_choice text default 'direct') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); run public.neon_depths_runs; room jsonb; reward jsonb; rarity text; next_index integer;
begin
  select * into run from public.neon_depths_runs where id=p_run_id and user_id=uid and status='active' for update;
  if run.id is null then raise exception 'Active descent not found'; end if;
  if run.room_index<>p_room_index then raise exception 'Room checkpoint is out of order'; end if;
  if now()<run.room_started_at+interval '3 seconds' then raise exception 'Room resolved too quickly'; end if;
  if lower(p_outcome)='defeat' then
    update public.neon_depths_runs set status='defeated',backpack='[]'::jsonb,updated_at=now() where id=run.id;
    return jsonb_build_object('state',public.get_my_neon_depths_state(),'lost',jsonb_array_length(run.backpack));
  end if;
  if lower(p_outcome)<>'clear' then raise exception 'Unknown room outcome'; end if;
  room:=run.route->run.room_index;
  rarity:=case when room->>'type'='boss' then 'apex' when coalesce((room->>'elite')::boolean,false) then 'legendary' when room->>'type'='breach' then 'rare' else 'uncommon' end;
  reward:=jsonb_build_object('id',gen_random_uuid(),'type',room->>'type','rarity',rarity,'tier',run.tier,'choice',left(coalesce(p_choice,'direct'),24),'secured',false);
  next_index:=least(jsonb_array_length(run.route)-1,run.room_index+1);
  update public.neon_depths_runs set backpack=backpack||jsonb_build_array(reward),room_index=next_index,room_started_at=now(),updated_at=now() where id=run.id;
  update public.neon_depths_progress set rooms_cleared=rooms_cleared+1,bosses_defeated=bosses_defeated+case when room->>'type'='boss' then 1 else 0 end,updated_at=now() where user_id=uid;
  return jsonb_build_object('state',public.get_my_neon_depths_state(),'drop',reward);
end $$;
revoke all on function public.advance_neon_depths(uuid,integer,text,text) from public,anon;
grant execute on function public.advance_neon_depths(uuid,integer,text,text) to authenticated;

create or replace function public.extract_neon_depths(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); run public.neon_depths_runs; armory public.player_armories; room jsonb; reward jsonb; drops jsonb:='[]'::jsonb; token jsonb; can_extract boolean;
begin
  select * into run from public.neon_depths_runs where id=p_run_id and user_id=uid and status='active' for update;
  if run.id is null then raise exception 'Active descent not found'; end if;
  room:=run.route->run.room_index; can_extract:=coalesce((room->>'canExtract')::boolean,false) or (run.room_index>0 and coalesce(((run.route->(run.room_index-1))->>'canExtract')::boolean,false)) or run.room_index=jsonb_array_length(run.route)-1;
  if not can_extract then raise exception 'Reach an extraction room first'; end if;
  if jsonb_array_length(run.backpack)=0 then raise exception 'The backpack is empty'; end if;
  select * into armory from public.player_armories where user_id=uid for update; if armory.user_id is null then raise exception 'Armory unavailable'; end if;
  for token in select value from jsonb_array_elements(run.backpack) loop
    reward:=public.roll_dungeon_drop(armory.state,least(99,greatest(1,run.tier*8)),run.party_mode='public'); armory.state:=reward->'state'; drops:=drops||jsonb_build_array(reward->'drop');
  end loop;
  update public.player_armories set state=armory.state,updated_at=now() where user_id=uid;
  update public.neon_depths_runs set status='extracted',updated_at=now() where id=run.id;
  update public.neon_depths_progress set highest_tier=greatest(highest_tier,run.tier+case when run.room_index=jsonb_array_length(run.route)-1 then 1 else 0 end),extractions=extractions+1,updated_at=now() where user_id=uid;
  return jsonb_build_object('state',public.get_my_neon_depths_state(),'armory',armory.state,'drops',drops,'secured',jsonb_array_length(run.backpack));
end $$;
revoke all on function public.extract_neon_depths(uuid) from public,anon;
grant execute on function public.extract_neon_depths(uuid) to authenticated;

create or replace function public.abandon_neon_depths(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); lost integer;
begin
  update public.neon_depths_runs set status='abandoned',updated_at=now() where id=p_run_id and user_id=uid and status='active' returning jsonb_array_length(backpack) into lost;
  if lost is null then raise exception 'Active descent not found'; end if;
  return jsonb_build_object('state',public.get_my_neon_depths_state(),'lost',lost);
end $$;
revoke all on function public.abandon_neon_depths(uuid) from public,anon;
grant execute on function public.abandon_neon_depths(uuid) to authenticated;
