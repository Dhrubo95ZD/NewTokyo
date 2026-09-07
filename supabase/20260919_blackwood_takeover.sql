-- Blackwood Takeover: server-backed citywide faction season.
-- Apply after 20260918_character_collection.sql. Safe to re-run.

create table if not exists public.bw_takeover_seasons (
  id text primary key,
  name text not null,
  description text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  finale_name text not null,
  active boolean not null default true
);

insert into public.bw_takeover_seasons(id,name,description,starts_at,ends_at,finale_name,active)
values (
  'blackwood-takeover-01',
  'Blackwood Takeover',
  'Choose a side, move the districts and decide who owns the city when the lights come on.',
  '2026-09-07T00:00:00Z',
  '2026-09-29T00:00:00Z',
  'The Blackout',
  true
)
on conflict(id) do update set name=excluded.name,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,finale_name=excluded.finale_name,active=excluded.active;

create table if not exists public.bw_takeover_pledges (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null references public.bw_takeover_seasons(id) on delete cascade,
  faction_id text not null references public.bw_factions(id),
  pledged_at timestamptz not null default now(),
  primary key(user_id,season_id)
);

create table if not exists public.bw_takeover_contributions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null references public.bw_takeover_seasons(id) on delete cascade,
  faction_id text not null references public.bw_factions(id),
  district_id text not null references public.bw_operation_districts(id),
  source text not null check(source in ('operation','faction')),
  source_id bigint not null,
  points integer not null check(points > 0),
  created_at timestamptz not null default now(),
  unique(season_id,source,source_id)
);

create table if not exists public.bw_takeover_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  season_id text not null references public.bw_takeover_seasons(id) on delete cascade,
  tier integer not null check(tier in (1,2,3)),
  claimed_at timestamptz not null default now(),
  primary key(user_id,season_id,tier)
);

alter table public.bw_takeover_seasons enable row level security;
alter table public.bw_takeover_pledges enable row level security;
alter table public.bw_takeover_contributions enable row level security;
alter table public.bw_takeover_claims enable row level security;

drop policy if exists "authenticated read takeover seasons" on public.bw_takeover_seasons;
create policy "authenticated read takeover seasons" on public.bw_takeover_seasons for select to authenticated using(true);
drop policy if exists "users read own takeover pledge" on public.bw_takeover_pledges;
create policy "users read own takeover pledge" on public.bw_takeover_pledges for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own takeover contributions" on public.bw_takeover_contributions;
create policy "users read own takeover contributions" on public.bw_takeover_contributions for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own takeover claims" on public.bw_takeover_claims;
create policy "users read own takeover claims" on public.bw_takeover_claims for select to authenticated using(auth.uid()=user_id);

revoke insert,update,delete on public.bw_takeover_seasons,public.bw_takeover_pledges,public.bw_takeover_contributions,public.bw_takeover_claims from anon,authenticated;
grant select on public.bw_takeover_seasons,public.bw_takeover_pledges,public.bw_takeover_contributions,public.bw_takeover_claims to authenticated;

create or replace function public.bw_takeover_district_for_faction(p_faction_id text)
returns text
language sql immutable as $$
  select case p_faction_id
    when 'moretti-circle' then 'old-quarter'
    when 'harbor-union' then 'harbor'
    when 'federal-trust' then 'financial'
    when 'northside-aid' then 'northside'
    else 'old-quarter'
  end
$$;

create or replace function public.bw_takeover_record_operation()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  season public.bw_takeover_seasons;
  pledged text;
  district text;
begin
  select * into season
  from public.bw_takeover_seasons
  where active and starts_at<=new.created_at and ends_at>new.created_at
  order by starts_at desc limit 1;
  if season.id is null then return new; end if;
  select faction_id into pledged from public.bw_takeover_pledges where user_id=new.user_id and season_id=season.id;
  if pledged is null then return new; end if;
  select district_id into district from public.bw_district_operations where id=new.operation_id;
  if district is null then return new; end if;
  insert into public.bw_takeover_contributions(user_id,season_id,faction_id,district_id,source,source_id,points,created_at)
  values(new.user_id,season.id,pledged,district,'operation',new.id,
    greatest(1,case when new.success then (new.xp_reward/2)+new.mastery_reward else greatest(1,new.xp_reward/4) end),
    new.created_at)
  on conflict(season_id,source,source_id) do nothing;
  return new;
end $$;

create or replace function public.bw_takeover_record_faction_assignment()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  season public.bw_takeover_seasons;
  pledged text;
  district text;
begin
  select * into season
  from public.bw_takeover_seasons
  where active and starts_at<=new.created_at and ends_at>new.created_at
  order by starts_at desc limit 1;
  if season.id is null then return new; end if;
  select faction_id into pledged from public.bw_takeover_pledges where user_id=new.user_id and season_id=season.id;
  if pledged is null then return new; end if;
  district:=public.bw_takeover_district_for_faction(pledged);
  insert into public.bw_takeover_contributions(user_id,season_id,faction_id,district_id,source,source_id,points,created_at)
  values(new.user_id,season.id,pledged,district,'faction',new.id,
    greatest(1,case when new.success then (new.xp_reward/4)+new.reputation_reward*2 else 1 end),
    new.created_at)
  on conflict(season_id,source,source_id) do nothing;
  return new;
end $$;

drop trigger if exists bw_takeover_operation_contribution on public.bw_district_operation_runs;
create trigger bw_takeover_operation_contribution
after insert on public.bw_district_operation_runs
for each row execute function public.bw_takeover_record_operation();

drop trigger if exists bw_takeover_faction_contribution on public.bw_faction_assignment_runs;
create trigger bw_takeover_faction_contribution
after insert on public.bw_faction_assignment_runs
for each row execute function public.bw_takeover_record_faction_assignment();

create or replace function public.bw_takeover_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  season public.bw_takeover_seasons;
  pledged text;
  personal_points integer:=0;
  total_points integer:=0;
  personal_rank integer:=1;
  run_count integer:=0;
  days_left integer:=0;
begin
  perform public.bw_ensure_player(uid);
  select * into season from public.bw_takeover_seasons where active and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if season.id is null then
    return jsonb_build_object('authority',true,'status','between-seasons','season',null,'pledge',null,'factions','[]'::jsonb,'districts','[]'::jsonb,'personal',jsonb_build_object('points',0,'rank',0,'runs',0),'rewards','[]'::jsonb);
  end if;

  select faction_id into pledged from public.bw_takeover_pledges where user_id=uid and season_id=season.id;
  select coalesce(sum(points),0),count(*) into personal_points,run_count from public.bw_takeover_contributions where user_id=uid and season_id=season.id;
  select coalesce(sum(points),0) into total_points from public.bw_takeover_contributions where season_id=season.id;
  select coalesce(1+count(*),1) into personal_rank from (
    select user_id,sum(points) points from public.bw_takeover_contributions where season_id=season.id group by user_id
  ) scores where scores.points>personal_points;
  days_left:=greatest(0,ceil(extract(epoch from(season.ends_at-now()))/86400)::integer);

  return jsonb_build_object(
    'authority',true,
    'status','active',
    'season',jsonb_build_object('id',season.id,'name',season.name,'description',season.description,'startsAt',season.starts_at,'endsAt',season.ends_at,'daysLeft',days_left,'finaleName',season.finale_name),
    'pledge',coalesce((select jsonb_build_object('factionId',f.id,'name',f.name,'district',f.district,'specialty',f.specialty) from public.bw_factions f where f.id=pledged),'null'::jsonb),
    'personal',jsonb_build_object('points',personal_points,'rank',personal_rank,'runs',run_count,'totalPoints',total_points),
    'factions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',f.id,'name',f.name,'district',f.district,'description',f.description,'specialty',f.specialty,
        'accent',case f.id when 'moretti-circle' then '#a9792a' when 'harbor-union' then '#4d8190' when 'federal-trust' then '#3f82b0' else '#59806a' end,
        'points',coalesce(sum(c.points),0),'members',count(distinct c.user_id),
        'share',round((coalesce(sum(c.points),0)::numeric/greatest(1,total_points)*100),1),
        'pledged',f.id=pledged
      ) order by coalesce(sum(c.points),0) desc,f.sort_order)
      from public.bw_factions f left join public.bw_takeover_contributions c on c.faction_id=f.id and c.season_id=season.id
      group by f.id,f.name,f.district,f.description,f.specialty,f.sort_order
    ),'[]'::jsonb),
    'districts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'name',d.name,'zone',d.zone,'accent',d.accent,
        'points',coalesce((select sum(c.points) from public.bw_takeover_contributions c where c.season_id=season.id and c.district_id=d.id),0),
        'controlFactionId',(select c.faction_id from public.bw_takeover_contributions c where c.season_id=season.id and c.district_id=d.id group by c.faction_id order by sum(c.points) desc limit 1),
        'controlFactionName',(select f.name from public.bw_factions f where f.id=(select c.faction_id from public.bw_takeover_contributions c where c.season_id=season.id and c.district_id=d.id group by c.faction_id order by sum(c.points) desc limit 1))
      ) order by d.sort_order)
      from public.bw_operation_districts d
    ),'[]'::jsonb),
    'rewards',jsonb_build_array(
      jsonb_build_object('tier',1,'label','Street signal','target',20,'cash',2500,'xp',40,'merits',0,'claimed',exists(select 1 from public.bw_takeover_claims where user_id=uid and season_id=season.id and tier=1)),
      jsonb_build_object('tier',2,'label','District mark','target',60,'cash',6500,'xp',100,'merits',1,'claimed',exists(select 1 from public.bw_takeover_claims where user_id=uid and season_id=season.id and tier=2)),
      jsonb_build_object('tier',3,'label','Blackwood key','target',120,'cash',15000,'xp',240,'merits',2,'claimed',exists(select 1 from public.bw_takeover_claims where user_id=uid and season_id=season.id and tier=3))
    )
  );
end $$;

create or replace function public.bw_takeover_pledge(p_faction_id text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  season public.bw_takeover_seasons;
  current_faction text;
begin
  perform public.bw_ensure_player(uid);
  select * into season from public.bw_takeover_seasons where active and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if season.id is null then raise exception 'takeover is between seasons'; end if;
  if not exists(select 1 from public.bw_factions where id=p_faction_id) then raise exception 'faction not found'; end if;
  select faction_id into current_faction from public.bw_takeover_pledges where user_id=uid and season_id=season.id;
  if current_faction is not null and exists(select 1 from public.bw_takeover_contributions where user_id=uid and season_id=season.id) and current_faction<>p_faction_id then
    raise exception 'allegiance is locked after your first contribution';
  end if;
  insert into public.bw_takeover_pledges(user_id,season_id,faction_id,pledged_at) values(uid,season.id,p_faction_id,now())
  on conflict(user_id,season_id) do update set faction_id=excluded.faction_id,pledged_at=now();
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'takeover','Pledged to '||(select name from public.bw_factions where id=p_faction_id),jsonb_build_object('season',season.id,'faction',p_faction_id));
  return public.bw_takeover_snapshot();
end $$;

create or replace function public.bw_takeover_claim(p_tier integer)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  season public.bw_takeover_seasons;
  target integer;
  cash integer;
  xp integer;
  v_merits integer;
  points integer;
begin
  select * into season from public.bw_takeover_seasons where active and starts_at<=now() and ends_at>now() order by starts_at desc limit 1;
  if season.id is null then raise exception 'takeover is between seasons'; end if;
  if p_tier not in(1,2,3) then raise exception 'invalid takeover reward'; end if;
  select case p_tier when 1 then 20 when 2 then 60 else 120 end,
    case p_tier when 1 then 2500 when 2 then 6500 else 15000 end,
    case p_tier when 1 then 40 when 2 then 100 else 240 end,
    case p_tier when 1 then 0 when 2 then 1 else 2 end
  into target,cash,xp,v_merits;
  select coalesce(sum(points),0) into points from public.bw_takeover_contributions where user_id=uid and season_id=season.id;
  if points<target then raise exception 'takeover reward is not ready'; end if;
  if exists(select 1 from public.bw_takeover_claims where user_id=uid and season_id=season.id and tier=p_tier) then raise exception 'takeover reward already claimed'; end if;
  insert into public.bw_takeover_claims(user_id,season_id,tier) values(uid,season.id,p_tier);
  update public.player_wallets set balance=balance+cash,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_player_states set merits=merits+v_merits,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,xp);
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'takeover','Claimed '||(select label from (values (1,'Street signal'),(2,'District mark'),(3,'Blackwood key')) labels(tier,label) where tier=p_tier),jsonb_build_object('season',season.id,'tier',p_tier,'cash',cash,'xp',xp,'merits',v_merits));
  return jsonb_build_object('event',jsonb_build_object('cash',cash,'xp',xp,'merits',v_merits,'tier',p_tier),'takeover',public.bw_takeover_snapshot(),'state',public.bw_get_state());
end $$;

revoke all on function public.bw_takeover_snapshot(),public.bw_takeover_pledge(text),public.bw_takeover_claim(integer),public.bw_takeover_district_for_faction(text),public.bw_takeover_record_operation(),public.bw_takeover_record_faction_assignment() from public,anon,authenticated;
grant execute on function public.bw_takeover_snapshot(),public.bw_takeover_pledge(text),public.bw_takeover_claim(integer) to authenticated;


-- Keep the adviser aware of the same server-backed city contest shown in the UI.
create or replace function public.bw_adviser_context() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),
    'career',public.bw_job_snapshot(),
    'forex',public.bw_fx_snapshot('EUR/USD'),
    'loadout',public.bw_get_loadout(),
    'progression',public.bw_progression_snapshot(),
    'operations',public.bw_operations_snapshot(),
    'daily',public.bw_daily_life_snapshot(),
    'takeover',public.bw_takeover_snapshot(),
    'available_pages',array['home','daily','dispatch','takeover','crimes','hustles','operations','combat','gym','work','missions','factions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']
  );
end $$;

revoke all on function public.bw_adviser_context() from public,anon;
grant execute on function public.bw_adviser_context() to authenticated;
