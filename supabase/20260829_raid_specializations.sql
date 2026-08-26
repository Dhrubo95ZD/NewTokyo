-- Four-runner raid specializations, human matchmaking and optional bot fill.
-- Apply after schema.sql and 20260827_progression_hub.sql.

do $$ begin
  if to_regprocedure('public.require_google_player()') is null
    or to_regprocedure('public.calculate_player_combat_power(uuid)') is null
    or to_regprocedure('public.roll_dungeon_drop(jsonb,integer,boolean)') is null then
    raise exception 'Apply the account and Progression Hub migrations first';
  end if;
end $$;

create table if not exists public.raid_catalog (
  id text primary key,
  level_required integer not null check(level_required between 1 and 99),
  name text not null,
  district text not null,
  boss_name text not null,
  recommended_cp integer not null check(recommended_cp>0),
  shard_reward integer not null check(shard_reward>0),
  rarity_label text not null
);
insert into public.raid_catalog(id,level_required,name,district,boss_name,recommended_cp,shard_reward,rarity_label) values
('skyrail-lock',20,'Skyrail Lockdown','High Transit Ring','Rail Command Unit',1800,45,'Blue → Yellow'),
('storm-carrier',50,'Storm Carrier','Upper Freight Belt','Carrier Marshal',6200,120,'Yellow → Orange'),
('prism-array',99,'Prism Array','City Signal Crown','Array Custodian',18000,320,'Orange → Prismatic')
on conflict(id) do update set level_required=excluded.level_required,name=excluded.name,district=excluded.district,boss_name=excluded.boss_name,recommended_cp=excluded.recommended_cp,shard_reward=excluded.shard_reward,rarity_label=excluded.rarity_label;

create table if not exists public.player_raid_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  specialization text not null default 'vanguard' check(specialization in ('vanguard','striker','technician')),
  clears jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.raid_parties (
  id uuid primary key default gen_random_uuid(),
  raid_id text not null references public.raid_catalog(id),
  leader_id uuid not null references auth.users(id) on delete cascade,
  room_code text not null unique,
  state text not null default 'waiting' check(state in ('waiting','active','victory','failed','closed')),
  human_count integer not null default 1 check(human_count between 0 and 4),
  bot_count integer not null default 0 check(bot_count between 0 and 3),
  boss_hp integer not null,
  boss_max_hp integer not null,
  phase integer not null default 1 check(phase between 1 and 3),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.raid_party_members (
  party_id uuid not null references public.raid_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  specialization text not null check(specialization in ('vanguard','striker','technician')),
  combat_power integer not null check(combat_power>=0),
  contribution integer not null default 0 check(contribution>=0),
  joined_at timestamptz not null default now(),
  last_action_at timestamptz,
  claimed_at timestamptz,
  primary key(party_id,user_id)
);
create index if not exists raid_parties_match_idx on public.raid_parties(raid_id,state,created_at);
create index if not exists raid_party_members_user_idx on public.raid_party_members(user_id,joined_at desc);

alter table public.raid_catalog enable row level security;
alter table public.player_raid_profiles enable row level security;
alter table public.raid_parties enable row level security;
alter table public.raid_party_members enable row level security;
drop policy if exists "signed users read raid catalog" on public.raid_catalog;
drop policy if exists "users read own raid profile" on public.player_raid_profiles;
drop policy if exists "signed users read raid rooms" on public.raid_parties;
drop policy if exists "signed users read raid rosters" on public.raid_party_members;
create policy "signed users read raid catalog" on public.raid_catalog for select to authenticated using(true);
create policy "users read own raid profile" on public.player_raid_profiles for select to authenticated using(auth.uid()=user_id);
create policy "signed users read raid rooms" on public.raid_parties for select to authenticated using(true);
create policy "signed users read raid rosters" on public.raid_party_members for select to authenticated using(true);
revoke insert,update,delete on public.raid_catalog,public.player_raid_profiles,public.raid_parties,public.raid_party_members from anon,authenticated;
grant select on public.raid_catalog,public.player_raid_profiles,public.raid_parties,public.raid_party_members to authenticated;

create or replace function public.ensure_my_raid_profile()
returns public.player_raid_profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); result public.player_raid_profiles;
begin
  insert into public.player_raid_profiles(user_id) values(player_id) on conflict(user_id) do nothing;
  select * into result from public.player_raid_profiles where user_id=player_id;
  return result;
end $$;
revoke all on function public.ensure_my_raid_profile() from public,anon,authenticated;

create or replace function public.generate_raid_room_code()
returns text language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text; i integer;
begin
  loop
    result:='';
    for i in 1..6 loop result:=result||substr(alphabet,1+floor(random()*length(alphabet))::integer,1); end loop;
    exit when not exists(select 1 from public.raid_parties where room_code=result);
  end loop;
  return result;
end $$;
revoke all on function public.generate_raid_room_code() from public,anon,authenticated;

create or replace function public.get_my_raid_state()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); profile public.player_raid_profiles; party public.raid_parties; member public.raid_party_members; human_roster jsonb; bot_roster jsonb; roster jsonb;
begin
  profile:=public.ensure_my_raid_profile();
  select p.* into party from public.raid_parties p join public.raid_party_members m on m.party_id=p.id
    where m.user_id=player_id and p.state in ('waiting','active','victory') order by p.created_at desc limit 1;
  if party.id is null then return jsonb_build_object('specialization',profile.specialization,'clears',profile.clears,'party',null); end if;
  select * into member from public.raid_party_members where party_id=party.id and user_id=player_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(pr.display_name,'Runner'),'specialization',m.specialization,'cp',m.combat_power,'contribution',m.contribution,'bot',false,'claimedAt',m.claimed_at) order by m.joined_at),'[]'::jsonb)
    into human_roster from public.raid_party_members m left join public.profiles pr on pr.id=m.user_id where m.party_id=party.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id','bot-'||n,'name',(array['Amanah Unit','Sabr Unit','Hikmah Unit'])[n],
    'specialization',(array['vanguard','striker','technician'])[n],
    'cp',round(party.boss_max_hp/4.0),'contribution',round((party.boss_max_hp-party.boss_hp)*.45/greatest(1,party.bot_count)),'bot',true
  )),'[]'::jsonb) into bot_roster from generate_series(1,party.bot_count) n;
  roster:=human_roster||bot_roster;
  return jsonb_build_object('specialization',profile.specialization,'clears',profile.clears,'party',jsonb_build_object(
    'id',party.id,'raidId',party.raid_id,'roomCode',party.room_code,'state',party.state,'humanCount',party.human_count,'botCount',party.bot_count,
    'bossHp',party.boss_hp,'bossMaxHp',party.boss_max_hp,'phase',party.phase,'startedAt',party.started_at,'completedAt',party.completed_at,
    'claimedAt',member.claimed_at,'lootModifier',case when party.bot_count>0 then .5 else 1 end,'roster',roster));
end $$;

create or replace function public.set_my_raid_specialization(p_specialization text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); normalized text:=lower(trim(p_specialization));
begin
  if normalized not in ('vanguard','striker','technician') then raise exception 'unknown specialization'; end if;
  if exists(select 1 from public.raid_party_members m join public.raid_parties p on p.id=m.party_id where m.user_id=player_id and p.state='active') then raise exception 'specialization is locked during an active raid'; end if;
  insert into public.player_raid_profiles(user_id,specialization) values(player_id,normalized) on conflict(user_id) do update set specialization=excluded.specialization,updated_at=now();
  update public.raid_party_members m set specialization=normalized from public.raid_parties p where m.party_id=p.id and m.user_id=player_id and p.state='waiting';
  return public.get_my_raid_state();
end $$;

create or replace function public.queue_raid(p_raid_id text,p_allow_bots boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); profile public.player_raid_profiles; raid public.raid_catalog; party public.raid_parties; cp integer; player_level integer; humans integer;
begin
  profile:=public.ensure_my_raid_profile();
  if exists(select 1 from public.raid_party_members m join public.raid_parties p on p.id=m.party_id where m.user_id=player_id and p.state in ('waiting','active','victory')) then return public.get_my_raid_state(); end if;
  select * into raid from public.raid_catalog where id=p_raid_id;
  if raid.id is null then raise exception 'unknown raid'; end if;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<raid.level_required then raise exception 'runner level is too low'; end if;
  if cp<ceil(raid.recommended_cp*.25) then raise exception 'personal combat power is too low'; end if;
  if p_allow_bots then
    insert into public.raid_parties(raid_id,leader_id,room_code,state,human_count,bot_count,boss_hp,boss_max_hp,started_at)
      values(raid.id,player_id,public.generate_raid_room_code(),'active',1,3,raid.recommended_cp,raid.recommended_cp,now()) returning * into party;
  else
    select * into party from public.raid_parties where raid_id=raid.id and state='waiting' and bot_count=0 and human_count<4 and created_at>now()-interval '30 minutes' order by created_at for update skip locked limit 1;
    if party.id is null then insert into public.raid_parties(raid_id,leader_id,room_code,boss_hp,boss_max_hp) values(raid.id,player_id,public.generate_raid_room_code(),raid.recommended_cp,raid.recommended_cp) returning * into party; end if;
  end if;
  insert into public.raid_party_members(party_id,user_id,specialization,combat_power) values(party.id,player_id,profile.specialization,cp);
  if not p_allow_bots then
    select count(*) into humans from public.raid_party_members where party_id=party.id;
    update public.raid_parties set human_count=humans,state=case when humans=4 then 'active' else 'waiting' end,started_at=case when humans=4 then now() else null end,updated_at=now() where id=party.id;
  end if;
  return public.get_my_raid_state();
end $$;

create or replace function public.join_raid_room(p_room_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); profile public.player_raid_profiles; party public.raid_parties; raid public.raid_catalog; cp integer; player_level integer; humans integer; normalized_code text:=upper(trim(p_room_code));
begin
  profile:=public.ensure_my_raid_profile();
  if exists(select 1 from public.raid_party_members m join public.raid_parties p on p.id=m.party_id where m.user_id=player_id and p.state in ('waiting','active','victory')) then return public.get_my_raid_state(); end if;
  if normalized_code !~ '^[A-Z0-9]{6}$' then raise exception 'room code must contain six letters or numbers'; end if;
  select * into party from public.raid_parties where room_code=normalized_code and state='waiting' and bot_count=0 and human_count<4 and created_at>now()-interval '30 minutes' for update;
  if party.id is null then raise exception 'human raid room was not found or is already full'; end if;
  select * into raid from public.raid_catalog where id=party.raid_id;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<raid.level_required then raise exception 'runner level is too low for this room'; end if;
  if cp<ceil(raid.recommended_cp*.25) then raise exception 'personal combat power is too low for this room'; end if;
  insert into public.raid_party_members(party_id,user_id,specialization,combat_power) values(party.id,player_id,profile.specialization,cp);
  select count(*) into humans from public.raid_party_members where party_id=party.id;
  update public.raid_parties set human_count=humans,state=case when humans=4 then 'active' else 'waiting' end,started_at=case when humans=4 then now() else null end,updated_at=now() where id=party.id;
  return public.get_my_raid_state();
end $$;

create or replace function public.fill_raid_with_bots()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.raid_parties; humans integer;
begin
  select p.* into party from public.raid_parties p join public.raid_party_members m on m.party_id=p.id where m.user_id=player_id and p.state='waiting' for update of p;
  if party.id is null then raise exception 'no waiting raid room'; end if;
  select count(*) into humans from public.raid_party_members where party_id=party.id;
  update public.raid_parties set human_count=humans,bot_count=greatest(0,4-humans),state='active',started_at=now(),updated_at=now() where id=party.id;
  return public.get_my_raid_state();
end $$;

create or replace function public.advance_raid_phase(p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.raid_parties; member public.raid_party_members; normalized text:=lower(trim(p_action)); multiplier numeric:=1; damage integer; remaining integer; next_phase integer;
begin
  if normalized not in ('assault','guard','override') then raise exception 'unknown raid action'; end if;
  select p.* into party from public.raid_parties p join public.raid_party_members m on m.party_id=p.id where m.user_id=player_id and p.state='active' for update of p;
  select * into member from public.raid_party_members where party_id=party.id and user_id=player_id for update;
  if party.id is null then raise exception 'no active raid'; end if;
  if member.last_action_at is not null and member.last_action_at>now()-interval '700 milliseconds' then raise exception 'link recharging'; end if;
  if (member.specialization='striker' and normalized='assault') or (member.specialization='vanguard' and normalized='guard') or (member.specialization='technician' and normalized='override') then multiplier:=1.3; end if;
  damage:=greatest(12,round(member.combat_power*.16*multiplier+party.boss_max_hp*(party.bot_count/4.0)*.04));
  remaining:=greatest(0,party.boss_hp-damage);
  next_phase:=case when remaining<=party.boss_max_hp/3 then 3 when remaining<=party.boss_max_hp*2/3 then 2 else 1 end;
  update public.raid_party_members set contribution=contribution+least(damage,party.boss_hp),last_action_at=now() where party_id=party.id and user_id=player_id;
  update public.raid_parties set boss_hp=remaining,phase=next_phase,state=case when remaining=0 then 'victory' else 'active' end,completed_at=case when remaining=0 then now() else null end,updated_at=now() where id=party.id;
  return public.get_my_raid_state();
end $$;

create or replace function public.leave_raid_room()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.raid_parties; humans integer;
begin
  select p.* into party from public.raid_parties p join public.raid_party_members m on m.party_id=p.id where m.user_id=player_id and p.state='waiting' for update of p;
  if party.id is null then raise exception 'only a waiting raid room can be left'; end if;
  delete from public.raid_party_members where party_id=party.id and user_id=player_id;
  select count(*) into humans from public.raid_party_members where party_id=party.id;
  if humans=0 then update public.raid_parties set state='closed',human_count=0,updated_at=now() where id=party.id;
  else update public.raid_parties set human_count=humans,leader_id=(select user_id from public.raid_party_members where party_id=party.id order by joined_at limit 1),updated_at=now() where id=party.id; end if;
  return public.get_my_raid_state();
end $$;

create or replace function public.claim_raid_rewards()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.raid_parties; member public.raid_party_members; raid public.raid_catalog; profile public.player_raid_profiles; armory public.player_armories; s jsonb; reward jsonb:=null; gear_awarded boolean; clear_count integer; shard_gain integer;
begin
  select p.* into party from public.raid_parties p join public.raid_party_members m on m.party_id=p.id where m.user_id=player_id and p.state='victory' for update of p;
  select * into member from public.raid_party_members where party_id=party.id and user_id=player_id for update;
  if party.id is null then raise exception 'raid victory is not ready'; end if;
  if member.claimed_at is not null then raise exception 'raid reward already claimed'; end if;
  select * into raid from public.raid_catalog where id=party.raid_id;
  select * into armory from public.player_armories where user_id=player_id for update; s:=armory.state;
  shard_gain:=case when party.bot_count>0 then floor(raid.shard_reward*.5)::integer else raid.shard_reward end;
  s:=jsonb_set(s,'{shards}',to_jsonb(coalesce((s->>'shards')::integer,0)+shard_gain),true);
  gear_awarded:=party.bot_count=0 or random()<.5;
  if gear_awarded then reward:=public.roll_dungeon_drop(s,raid.level_required,true); s:=reward->'state'; end if;
  update public.player_armories set state=s,updated_at=now() where user_id=player_id;
  profile:=public.ensure_my_raid_profile(); clear_count:=coalesce((profile.clears->>raid.id)::integer,0)+1;
  update public.player_raid_profiles set clears=jsonb_set(clears,array[raid.id],to_jsonb(clear_count),true),updated_at=now() where user_id=player_id;
  update public.raid_party_members set claimed_at=now() where party_id=party.id and user_id=player_id;
  if not exists(select 1 from public.raid_party_members where party_id=party.id and claimed_at is null) then update public.raid_parties set state='closed',updated_at=now() where id=party.id; end if;
  return jsonb_build_object('armory',s,'raidId',raid.id,'shards',shard_gain,'gearAwarded',gear_awarded,'drop',case when reward is null then null else reward->'drop' end,'lootModifier',case when party.bot_count>0 then .5 else 1 end);
end $$;

revoke all on function public.get_my_raid_state() from public,anon;
revoke all on function public.set_my_raid_specialization(text) from public,anon;
revoke all on function public.queue_raid(text,boolean) from public,anon;
revoke all on function public.join_raid_room(text) from public,anon;
revoke all on function public.fill_raid_with_bots() from public,anon;
revoke all on function public.advance_raid_phase(text) from public,anon;
revoke all on function public.leave_raid_room() from public,anon;
revoke all on function public.claim_raid_rewards() from public,anon;
grant execute on function public.get_my_raid_state() to authenticated;
grant execute on function public.set_my_raid_specialization(text) to authenticated;
grant execute on function public.queue_raid(text,boolean) to authenticated;
grant execute on function public.join_raid_room(text) to authenticated;
grant execute on function public.fill_raid_with_bots() to authenticated;
grant execute on function public.advance_raid_phase(text) to authenticated;
grant execute on function public.leave_raid_room() to authenticated;
grant execute on function public.claim_raid_rewards() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raid_parties') then alter publication supabase_realtime add table public.raid_parties; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raid_party_members') then alter publication supabase_realtime add table public.raid_party_members; end if;
end $$;
