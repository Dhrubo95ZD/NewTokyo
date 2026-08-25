-- Co-op room browser and Gridhold asynchronous PvP base building.
-- Apply after 20260827_progression_hub.sql.

do $$ begin
  if to_regprocedure('public.get_my_progression_state()') is null then
    raise exception 'Apply 20260827_progression_hub.sql first';
  end if;
end $$;

alter table public.dungeon_parties add column if not exists room_code text;
alter table public.dungeon_parties add column if not exists visibility text not null default 'public' check (visibility in ('public','code'));
create unique index if not exists dungeon_parties_room_code_key on public.dungeon_parties(room_code) where room_code is not null;

create or replace function public.generate_coop_room_code()
returns text language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare alphabet text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text; i integer;
begin
  loop
    result:='';
    for i in 1..6 loop result:=result||substr(alphabet,1+floor(random()*length(alphabet))::integer,1); end loop;
    exit when not exists(select 1 from public.dungeon_parties where room_code=result);
  end loop;
  return result;
end $$;
revoke all on function public.generate_coop_room_code() from public,anon,authenticated;

create or replace function public.create_coop_room(p_dungeon_id text,p_visibility text default 'public')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); dungeon public.dungeon_catalog; party public.dungeon_parties; cp integer; player_level integer;
begin
  delete from public.dungeon_party_members m using public.dungeon_parties p where m.party_id=p.id and m.user_id=player_id and p.state in ('complete','closed');
  if exists(select 1 from public.dungeon_party_members where user_id=player_id) then return public.get_my_progression_state(); end if;
  select * into dungeon from public.dungeon_catalog where id=p_dungeon_id;
  if dungeon.id is null then raise exception 'unknown dungeon'; end if;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<dungeon.level_required then raise exception 'runner level is too low'; end if;
  if cp<ceil(dungeon.recommended_cp*.75) then raise exception 'co-op requires 75 percent of recommended combat power'; end if;
  insert into public.dungeon_parties(dungeon_id,leader_id,member_count,room_code,visibility)
    values(dungeon.id,player_id,1,public.generate_coop_room_code(),case when lower(p_visibility)='code' then 'code' else 'public' end) returning * into party;
  insert into public.dungeon_party_members(party_id,user_id,combat_power) values(party.id,player_id,cp);
  return public.get_my_progression_state();
end $$;

create or replace function public.join_coop_room(p_room_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.dungeon_parties; dungeon public.dungeon_catalog; cp integer; player_level integer; members integer; total_cp bigint;
begin
  delete from public.dungeon_party_members m using public.dungeon_parties p where m.party_id=p.id and m.user_id=player_id and p.state in ('complete','closed');
  if exists(select 1 from public.dungeon_party_members where user_id=player_id) then return public.get_my_progression_state(); end if;
  select * into party from public.dungeon_parties where room_code=upper(trim(p_room_code)) and state='waiting' and member_count<3 and created_at>now()-interval '20 minutes' for update;
  if party.id is null then raise exception 'room not found or no longer open'; end if;
  select * into dungeon from public.dungeon_catalog where id=party.dungeon_id;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<dungeon.level_required or cp<ceil(dungeon.recommended_cp*.75) then raise exception 'level or combat power is too low for this room'; end if;
  insert into public.dungeon_party_members(party_id,user_id,combat_power) values(party.id,player_id,cp);
  select count(*),sum(combat_power) into members,total_cp from public.dungeon_party_members where party_id=party.id;
  update public.dungeon_parties set member_count=members,updated_at=now(),
    state=case when members>=2 and total_cp>=dungeon.recommended_cp then 'active' else 'waiting' end,
    started_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now() else null end,
    completes_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now()+make_interval(mins=>dungeon.duration_minutes) else null end where id=party.id;
  return public.get_my_progression_state();
end $$;

create or replace function public.list_coop_rooms(p_dungeon_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'roomCode',p.room_code,'dungeonId',p.dungeon_id,'dungeonName',d.name,'leader',coalesce(pr.display_name,'Runner'),
    'members',p.member_count,'capacity',3,'recommendedCp',d.recommended_cp,
    'teamCp',coalesce((select sum(m.combat_power) from public.dungeon_party_members m where m.party_id=p.id),0),
    'createdAt',p.created_at
  ) order by p.created_at),'[]'::jsonb) into result
  from public.dungeon_parties p join public.dungeon_catalog d on d.id=p.dungeon_id left join public.profiles pr on pr.id=p.leader_id
  where p.state='waiting' and p.visibility='public' and p.member_count<3 and p.created_at>now()-interval '20 minutes'
    and (p_dungeon_id is null or p.dungeon_id=p_dungeon_id);
  return result;
end $$;

create or replace function public.queue_coop_dungeon(p_dungeon_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); dungeon public.dungeon_catalog; party public.dungeon_parties; cp integer; player_level integer; members integer; total_cp bigint;
begin
  delete from public.dungeon_party_members m using public.dungeon_parties p where m.party_id=p.id and m.user_id=player_id and p.state in ('complete','closed');
  if exists(select 1 from public.dungeon_party_members where user_id=player_id) then return public.get_my_progression_state(); end if;
  select * into dungeon from public.dungeon_catalog where id=p_dungeon_id;
  if dungeon.id is null then raise exception 'unknown dungeon'; end if;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<dungeon.level_required then raise exception 'runner level is too low'; end if;
  if cp<ceil(dungeon.recommended_cp*.75) then raise exception 'co-op requires 75 percent of recommended combat power'; end if;
  select * into party from public.dungeon_parties where dungeon_id=dungeon.id and state='waiting' and visibility='public' and member_count<3 and created_at>now()-interval '20 minutes' order by created_at for update skip locked limit 1;
  if party.id is null then
    insert into public.dungeon_parties(dungeon_id,leader_id,member_count,room_code,visibility) values(dungeon.id,player_id,1,public.generate_coop_room_code(),'public') returning * into party;
  end if;
  insert into public.dungeon_party_members(party_id,user_id,combat_power) values(party.id,player_id,cp);
  select count(*),sum(combat_power) into members,total_cp from public.dungeon_party_members where party_id=party.id;
  update public.dungeon_parties set room_code=coalesce(room_code,public.generate_coop_room_code()),member_count=members,updated_at=now(),
    state=case when members>=2 and total_cp>=dungeon.recommended_cp then 'active' else 'waiting' end,
    started_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now() else null end,
    completes_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now()+make_interval(mins=>dungeon.duration_minutes) else null end where id=party.id;
  return public.get_my_progression_state();
end $$;

update public.dungeon_parties set room_code=public.generate_coop_room_code() where room_code is null;

create table if not exists public.gridhold_building_catalog (
  kind text primary key,name text not null,role text not null check(role in ('hq','economy','defense','offense','support')),
  width integer not null check(width between 1 and 2),height integer not null check(height between 1 and 2),
  unlock_hq integer not null,max_count integer not null,max_level integer not null,
  base_alloy integer not null,base_cells integer not null,defense_power integer not null default 0,attack_power integer not null default 0
);
insert into public.gridhold_building_catalog(kind,name,role,width,height,unlock_hq,max_count,max_level,base_alloy,base_cells,defense_power,attack_power) values
('command-core','Command Core','hq',2,2,1,1,10,0,0,230,120),
('alloy-extractor','Alloy Extractor','economy',1,1,1,3,10,180,0,35,0),
('cell-reactor','Cell Reactor','economy',1,1,1,3,10,220,0,35,0),
('pulse-turret','Pulse Turret','defense',1,1,1,5,10,260,40,190,0),
('barrier-node','Barrier Node','defense',1,1,2,4,10,430,90,225,0),
('runner-bay','Runner Bay','offense',2,1,2,2,10,520,120,75,180),
('rail-cannon','Rail Cannon','defense',2,1,3,2,10,950,260,410,0),
('signal-array','Signal Array','support',1,1,3,2,10,760,310,105,80),
('repair-depot','Repair Depot','support',2,1,4,1,10,1400,480,250,0)
on conflict(kind) do update set name=excluded.name,role=excluded.role,width=excluded.width,height=excluded.height,unlock_hq=excluded.unlock_hq,max_count=excluded.max_count,max_level=excluded.max_level,base_alloy=excluded.base_alloy,base_cells=excluded.base_cells,defense_power=excluded.defense_power,attack_power=excluded.attack_power;

create table if not exists public.gridhold_rank_rewards (
  id text primary key,rank_name text not null,min_rating integer not null unique,title_reward text not null,decor_reward text not null,color text not null
);
insert into public.gridhold_rank_rewards(id,rank_name,min_rating,title_reward,decor_reward,color) values
('ward-scout','Ward Scout',0,'Ward Builder','Signal Lanterns','#7f94a9'),
('grid-sentinel','Grid Sentinel',200,'Grid Sentinel','Azure Gate','#37a7ff'),
('district-vanguard','District Vanguard',500,'District Vanguard','Skyline Beacon','#5c73ff'),
('city-guardian','City Guardian',900,'City Guardian','Garden Array','#a65de8'),
('apex-architect','Apex Architect',1400,'Apex Architect','Aurora Beacon','#ff9d39'),
('prism-commander','Prism Commander',2000,'Prism Commander','Prism Fountain','#ef62dd')
on conflict(id) do update set rank_name=excluded.rank_name,min_rating=excluded.min_rating,title_reward=excluded.title_reward,decor_reward=excluded.decor_reward,color=excluded.color;

create table if not exists public.player_gridholds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout jsonb not null,
  hq_level integer not null default 1,
  alloy bigint not null default 1400 check(alloy>=0),
  cells bigint not null default 500 check(cells>=0),
  rating integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  shield_until timestamptz,
  last_collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gridhold_battles (
  id uuid primary key default gen_random_uuid(),attacker_id uuid not null references auth.users(id) on delete cascade,
  defender_id uuid not null references auth.users(id) on delete cascade,tactic text not null,
  attacker_power integer not null,defender_power integer not null,stars integer not null check(stars between 0 and 3),
  rating_delta integer not null,alloy_loot integer not null default 0,cells_loot integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists player_gridholds_rating_idx on public.player_gridholds(rating desc);
create index if not exists gridhold_battles_attacker_created_idx on public.gridhold_battles(attacker_id,created_at desc);
create index if not exists gridhold_battles_defender_created_idx on public.gridhold_battles(defender_id,created_at desc);
create table if not exists public.player_gridhold_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,reward_id text not null references public.gridhold_rank_rewards(id),
  unlocked_at timestamptz not null default now(),primary key(user_id,reward_id)
);

alter table public.gridhold_building_catalog enable row level security;
alter table public.gridhold_rank_rewards enable row level security;
alter table public.player_gridholds enable row level security;
alter table public.gridhold_battles enable row level security;
alter table public.player_gridhold_rewards enable row level security;
drop policy if exists "signed users read gridhold catalog" on public.gridhold_building_catalog;
drop policy if exists "signed users read gridhold ranks" on public.gridhold_rank_rewards;
drop policy if exists "users read own gridhold" on public.player_gridholds;
drop policy if exists "users read own gridhold battles" on public.gridhold_battles;
drop policy if exists "users read own gridhold rewards" on public.player_gridhold_rewards;
create policy "signed users read gridhold catalog" on public.gridhold_building_catalog for select to authenticated using(true);
create policy "signed users read gridhold ranks" on public.gridhold_rank_rewards for select to authenticated using(true);
create policy "users read own gridhold" on public.player_gridholds for select to authenticated using(auth.uid()=user_id);
create policy "users read own gridhold battles" on public.gridhold_battles for select to authenticated using(auth.uid() in (attacker_id,defender_id));
create policy "users read own gridhold rewards" on public.player_gridhold_rewards for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.gridhold_building_catalog,public.gridhold_rank_rewards,public.player_gridholds,public.gridhold_battles,public.player_gridhold_rewards from anon,authenticated;
grant select on public.gridhold_building_catalog,public.gridhold_rank_rewards,public.player_gridholds,public.gridhold_battles,public.player_gridhold_rewards to authenticated;

create or replace function public.ensure_my_gridhold()
returns public.player_gridholds language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); result public.player_gridholds;
begin
  insert into public.player_gridholds(user_id,layout) values(player_id,'[
    {"id":"core","kind":"command-core","level":1,"x":3,"y":3},
    {"id":"alloy-1","kind":"alloy-extractor","level":1,"x":1,"y":5},
    {"id":"cells-1","kind":"cell-reactor","level":1,"x":6,"y":5},
    {"id":"turret-1","kind":"pulse-turret","level":1,"x":1,"y":2},
    {"id":"turret-2","kind":"pulse-turret","level":1,"x":6,"y":2}
  ]'::jsonb) on conflict(user_id) do nothing;
  insert into public.player_gridhold_rewards(user_id,reward_id) values(player_id,'ward-scout') on conflict do nothing;
  select * into result from public.player_gridholds where user_id=player_id;
  return result;
end $$;
revoke all on function public.ensure_my_gridhold() from public,anon,authenticated;

create or replace function public.gridhold_defense_power(p_layout jsonb)
returns integer language sql stable set search_path=public,pg_temp as $$
  select coalesce(round(sum(c.defense_power*greatest(1,(e->>'level')::integer)*(1+greatest(1,(e->>'level')::integer)*.12))),0)::integer
  from jsonb_array_elements(coalesce(p_layout,'[]'::jsonb)) e join public.gridhold_building_catalog c on c.kind=e->>'kind'
$$;
revoke all on function public.gridhold_defense_power(jsonb) from public,anon,authenticated;

create or replace function public.gridhold_can_place(p_layout jsonb,p_building_id text,p_kind text,p_x integer,p_y integer)
returns boolean language plpgsql stable set search_path=public,pg_temp as $$
declare target public.gridhold_building_catalog; occupied boolean;
begin
  select * into target from public.gridhold_building_catalog where kind=p_kind;
  if target.kind is null or p_x<0 or p_y<0 or p_x+target.width>8 or p_y+target.height>8 then return false; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(p_layout,'[]'::jsonb)) e join public.gridhold_building_catalog c on c.kind=e->>'kind'
    where e->>'id'<>coalesce(p_building_id,'') and not (
      p_x+target.width <= (e->>'x')::integer or (e->>'x')::integer+c.width <= p_x or
      p_y+target.height <= (e->>'y')::integer or (e->>'y')::integer+c.height <= p_y
    )) into occupied;
  return not occupied;
end $$;
revoke all on function public.gridhold_can_place(jsonb,text,text,integer,integer) from public,anon,authenticated;

create or replace function public.unlock_gridhold_rewards(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.player_gridhold_rewards(user_id,reward_id)
    select p_user_id,r.id from public.gridhold_rank_rewards r join public.player_gridholds b on b.user_id=p_user_id where r.min_rating<=b.rating on conflict do nothing;
end $$;
revoke all on function public.unlock_gridhold_rewards(uuid) from public,anon,authenticated;

create or replace function public.get_my_gridhold_state()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base public.player_gridholds; rewards jsonb; logs jsonb; rank jsonb; next_rank jsonb;
begin
  base:=public.ensure_my_gridhold(); perform public.unlock_gridhold_rewards(base.user_id);
  select to_jsonb(r) into rank from public.gridhold_rank_rewards r where r.min_rating<=base.rating order by r.min_rating desc limit 1;
  select to_jsonb(r) into next_rank from public.gridhold_rank_rewards r where r.min_rating>base.rating order by r.min_rating limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'rankName',r.rank_name,'title',r.title_reward,'decor',r.decor_reward,'color',r.color,'unlockedAt',u.unlocked_at) order by r.min_rating),'[]'::jsonb) into rewards
    from public.player_gridhold_rewards u join public.gridhold_rank_rewards r on r.id=u.reward_id where u.user_id=base.user_id;
  select coalesce(jsonb_agg(entry order by (entry->>'createdAt')::timestamptz desc),'[]'::jsonb) into logs from (
    select jsonb_build_object('id',b.id,'attack',b.attacker_id=base.user_id,'opponent',coalesce(p.display_name,'Runner'),'stars',b.stars,'ratingDelta',case when b.attacker_id=base.user_id then b.rating_delta else -greatest(0,floor(b.rating_delta*.65)::integer) end,'alloy',b.alloy_loot,'cells',b.cells_loot,'createdAt',b.created_at) entry
    from public.gridhold_battles b left join public.profiles p on p.id=case when b.attacker_id=base.user_id then b.defender_id else b.attacker_id end
    where base.user_id in (b.attacker_id,b.defender_id) order by b.created_at desc limit 20
  ) recent;
  return jsonb_build_object('layout',base.layout,'hqLevel',base.hq_level,'alloy',base.alloy,'cells',base.cells,'trophies',base.rating,'wins',base.wins,'losses',base.losses,'shieldUntil',base.shield_until,'lastCollectedAt',base.last_collected_at,'defensePower',public.gridhold_defense_power(base.layout),'rank',rank,'nextRank',next_rank,'unlockedRewards',rewards,'battleLog',logs);
end $$;

create or replace function public.claim_gridhold_income()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base public.player_gridholds; hours numeric; alloy_gain integer; cell_gain integer;
begin
  base:=public.ensure_my_gridhold(); select * into base from public.player_gridholds where user_id=base.user_id for update;
  hours:=least(12,greatest(0,extract(epoch from now()-base.last_collected_at)/3600.0));
  select floor(coalesce(sum(case when e->>'kind'='alloy-extractor' then 65*greatest(1,(e->>'level')::integer) else 0 end),0)*hours)::integer,
    floor(coalesce(sum(case when e->>'kind'='cell-reactor' then 24*greatest(1,(e->>'level')::integer) else 0 end),0)*hours)::integer into alloy_gain,cell_gain from jsonb_array_elements(base.layout) e;
  update public.player_gridholds set alloy=alloy+alloy_gain,cells=cells+cell_gain,last_collected_at=now(),updated_at=now() where user_id=base.user_id;
  return jsonb_build_object('alloy',alloy_gain,'cells',cell_gain,'base',public.get_my_gridhold_state());
end $$;

create or replace function public.move_gridhold_building(p_building_id text,p_x integer,p_y integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base public.player_gridholds; building jsonb; next_layout jsonb;
begin
  base:=public.ensure_my_gridhold(); select * into base from public.player_gridholds where user_id=base.user_id for update;
  select e into building from jsonb_array_elements(base.layout) e where e->>'id'=p_building_id;
  if building is null then raise exception 'building not found'; end if;
  if not public.gridhold_can_place(base.layout,p_building_id,building->>'kind',p_x,p_y) then raise exception 'that grid space is blocked'; end if;
  select jsonb_agg(case when e->>'id'=p_building_id then jsonb_set(jsonb_set(e,'{x}',to_jsonb(p_x),true),'{y}',to_jsonb(p_y),true) else e end) into next_layout from jsonb_array_elements(base.layout) e;
  update public.player_gridholds set layout=next_layout,updated_at=now() where user_id=base.user_id;
  return public.get_my_gridhold_state();
end $$;

create or replace function public.upgrade_gridhold_building(p_building_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base public.player_gridholds; building jsonb; catalog public.gridhold_building_catalog; current_level integer; alloy_cost integer; cell_cost integer; next_layout jsonb;
begin
  base:=public.ensure_my_gridhold(); select * into base from public.player_gridholds where user_id=base.user_id for update;
  select e into building from jsonb_array_elements(base.layout) e where e->>'id'=p_building_id;
  if building is null then raise exception 'building not found'; end if;
  select * into catalog from public.gridhold_building_catalog where kind=building->>'kind'; current_level:=greatest(1,(building->>'level')::integer);
  if current_level>=catalog.max_level then raise exception 'building is already at maximum level'; end if;
  if catalog.role<>'hq' and current_level>=base.hq_level then raise exception 'upgrade the Command Core first'; end if;
  if catalog.role='hq' then alloy_cost:=650*(current_level+1)*(current_level+1); cell_cost:=180*(current_level+1)*(current_level+1);
  else alloy_cost:=round(catalog.base_alloy*(current_level+1)*(1+(current_level+1)*.18)); cell_cost:=round(catalog.base_cells*(current_level+1)*(1+(current_level+1)*.15)); end if;
  if base.alloy<alloy_cost or base.cells<cell_cost then raise exception 'not enough Gridhold resources'; end if;
  select jsonb_agg(case when e->>'id'=p_building_id then jsonb_set(e,'{level}',to_jsonb(current_level+1),true) else e end) into next_layout from jsonb_array_elements(base.layout) e;
  update public.player_gridholds set layout=next_layout,hq_level=case when catalog.role='hq' then current_level+1 else hq_level end,alloy=alloy-alloy_cost,cells=cells-cell_cost,updated_at=now() where user_id=base.user_id;
  return public.get_my_gridhold_state();
end $$;

create or replace function public.construct_gridhold_building(p_kind text,p_x integer,p_y integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base public.player_gridholds; catalog public.gridhold_building_catalog; count_existing integer; building_id text:=gen_random_uuid()::text;
begin
  base:=public.ensure_my_gridhold(); select * into base from public.player_gridholds where user_id=base.user_id for update;
  select * into catalog from public.gridhold_building_catalog where kind=p_kind;
  if catalog.kind is null or catalog.role='hq' then raise exception 'building cannot be constructed'; end if;
  if base.hq_level<catalog.unlock_hq then raise exception 'Command Core level is too low'; end if;
  select count(*) into count_existing from jsonb_array_elements(base.layout) e where e->>'kind'=p_kind;
  if count_existing>=catalog.max_count then raise exception 'building limit reached'; end if;
  if base.alloy<catalog.base_alloy or base.cells<catalog.base_cells then raise exception 'not enough Gridhold resources'; end if;
  if not public.gridhold_can_place(base.layout,null,p_kind,p_x,p_y) then raise exception 'that grid space is blocked'; end if;
  update public.player_gridholds set layout=layout||jsonb_build_array(jsonb_build_object('id',building_id,'kind',p_kind,'level',1,'x',p_x,'y',p_y)),alloy=alloy-catalog.base_alloy,cells=cells-catalog.base_cells,updated_at=now() where user_id=base.user_id;
  return public.get_my_gridhold_state();
end $$;

create or replace function public.find_gridhold_opponents()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); mine public.player_gridholds; result jsonb;
begin
  mine:=public.ensure_my_gridhold();
  select coalesce(jsonb_agg(jsonb_build_object('userId',b.user_id,'name',coalesce(p.display_name,'Runner'),'hqLevel',b.hq_level,'trophies',b.rating,'defensePower',public.gridhold_defense_power(b.layout),'layout',b.layout,'alloyAvailable',least(b.alloy,500),'cellsAvailable',least(b.cells,220)) order by abs(b.rating-mine.rating),random()),'[]'::jsonb) into result
  from (select * from public.player_gridholds where user_id<>player_id and (shield_until is null or shield_until<now()) and abs(rating-mine.rating)<=600 order by abs(rating-mine.rating),random() limit 8) b left join public.profiles p on p.id=b.user_id;
  return result;
end $$;

create or replace function public.attack_gridhold(p_defender_id uuid,p_tactic text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); attacker public.player_gridholds; defender public.player_gridholds; attacker_cp integer; defender_cp integer; attack_bonus integer; defense integer; modifier numeric:=1; west integer; center_lane integer; east integer; barriers integer; ratio numeric; stars integer; delta integer; alloy_taken integer:=0; cells_taken integer:=0; report jsonb;
begin
  if p_tactic not in ('west-breach','center-push','east-flank','signal-cut') then raise exception 'unknown tactic'; end if;
  if p_defender_id=player_id then raise exception 'cannot attack your own Gridhold'; end if;
  if exists(select 1 from public.gridhold_battles where attacker_id=player_id and created_at>now()-interval '45 seconds') then raise exception 'attack systems are recharging'; end if;
  attacker:=public.ensure_my_gridhold(); select * into attacker from public.player_gridholds where user_id=player_id for update;
  select * into defender from public.player_gridholds where user_id=p_defender_id for update;
  if defender.user_id is null or (defender.shield_until is not null and defender.shield_until>now()) then raise exception 'opponent is unavailable'; end if;
  attacker_cp:=public.calculate_player_combat_power(player_id); defender_cp:=public.calculate_player_combat_power(p_defender_id);
  select coalesce(sum(c.attack_power*greatest(1,(e->>'level')::integer)),0) into attack_bonus from jsonb_array_elements(attacker.layout) e join public.gridhold_building_catalog c on c.kind=e->>'kind';
  select coalesce(sum(case when (e->>'x')::integer<3 then c.defense_power*greatest(1,(e->>'level')::integer) else 0 end),0),coalesce(sum(case when (e->>'x')::integer between 3 and 4 then c.defense_power*greatest(1,(e->>'level')::integer) else 0 end),0),coalesce(sum(case when (e->>'x')::integer>4 then c.defense_power*greatest(1,(e->>'level')::integer) else 0 end),0),count(*) filter(where e->>'kind'='barrier-node') into west,center_lane,east,barriers from jsonb_array_elements(defender.layout) e join public.gridhold_building_catalog c on c.kind=e->>'kind';
  if p_tactic='west-breach' then modifier:=case when west<east then 1.12 else .94 end;
  elsif p_tactic='east-flank' then modifier:=case when east<west then 1.12 else .94 end;
  elsif p_tactic='signal-cut' then modifier:=case when barriers>0 then 1.1 else .96 end;
  else modifier:=case when center_lane<greatest(west,east) then 1.06 else 1 end; end if;
  defense:=greatest(200,public.gridhold_defense_power(defender.layout)+round(defender_cp*.25));
  ratio:=(attacker_cp+attack_bonus)*modifier*(.9+random()*.2)/defense;
  stars:=case when ratio>=1.35 then 3 when ratio>=1.05 then 2 when ratio>=.8 then 1 else 0 end;
  delta:=case stars when 3 then 28 when 2 then 18 when 1 then 9 else -10 end;
  if stars>0 then alloy_taken:=least(defender.alloy,floor(80+stars*90+attacker.hq_level*30)::bigint)::integer; cells_taken:=least(defender.cells,floor(25+stars*35+attacker.hq_level*12)::bigint)::integer; end if;
  update public.player_gridholds set rating=greatest(0,rating+delta),wins=wins+case when stars>0 then 1 else 0 end,losses=losses+case when stars=0 then 1 else 0 end,alloy=alloy+alloy_taken,cells=cells+cells_taken,updated_at=now() where user_id=player_id;
  update public.player_gridholds set rating=greatest(0,rating-case when stars>0 then greatest(1,floor(delta*.65)::integer) else -4 end),losses=losses+case when stars>0 then 1 else 0 end,wins=wins+case when stars=0 then 1 else 0 end,alloy=alloy-alloy_taken,cells=cells-cells_taken,shield_until=case when stars>=2 then now()+interval '10 minutes' else shield_until end,updated_at=now() where user_id=p_defender_id;
  insert into public.gridhold_battles(attacker_id,defender_id,tactic,attacker_power,defender_power,stars,rating_delta,alloy_loot,cells_loot)
    values(player_id,p_defender_id,p_tactic,attacker_cp+attack_bonus,defense,stars,delta,alloy_taken,cells_taken)
    returning jsonb_build_object('id',gridhold_battles.id,'stars',gridhold_battles.stars,'ratingDelta',gridhold_battles.rating_delta,'alloy',gridhold_battles.alloy_loot,'cells',gridhold_battles.cells_loot,'attackerPower',gridhold_battles.attacker_power,'defenderPower',gridhold_battles.defender_power) into report;
  perform public.unlock_gridhold_rewards(player_id);
  return report||jsonb_build_object('base',public.get_my_gridhold_state());
end $$;

revoke all on function public.create_coop_room(text,text) from public,anon;
revoke all on function public.join_coop_room(text) from public,anon;
revoke all on function public.list_coop_rooms(text) from public,anon;
revoke all on function public.queue_coop_dungeon(text) from public,anon;
revoke all on function public.get_my_gridhold_state() from public,anon;
revoke all on function public.claim_gridhold_income() from public,anon;
revoke all on function public.move_gridhold_building(text,integer,integer) from public,anon;
revoke all on function public.upgrade_gridhold_building(text) from public,anon;
revoke all on function public.construct_gridhold_building(text,integer,integer) from public,anon;
revoke all on function public.find_gridhold_opponents() from public,anon;
revoke all on function public.attack_gridhold(uuid,text) from public,anon;
grant execute on function public.create_coop_room(text,text),public.join_coop_room(text),public.list_coop_rooms(text),public.queue_coop_dungeon(text),public.get_my_gridhold_state(),public.claim_gridhold_income(),public.move_gridhold_building(text,integer,integer),public.upgrade_gridhold_building(text),public.construct_gridhold_building(text,integer,integer),public.find_gridhold_opponents(),public.attack_gridhold(uuid,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='player_gridholds') then alter publication supabase_realtime add table public.player_gridholds; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gridhold_battles') then alter publication supabase_realtime add table public.gridhold_battles; end if;
end $$;
