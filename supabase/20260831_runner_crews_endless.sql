-- Runner Crews, weekly City Crisis, and Endless Circuit.
-- Apply after 20260824 through 20260830 migrations.

create table if not exists public.runner_crews (
  id uuid primary key default gen_random_uuid(),
  name text not null, tag text not null, color text not null default '#48dfff',
  leader_id uuid not null references auth.users(id) on delete cascade,
  level integer not null default 1 check(level between 1 and 99),
  xp bigint not null default 0 check(xp >= 0),
  visibility text not null default 'public' check(visibility in ('public','private')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists runner_crews_name_ci on public.runner_crews(lower(name));
create unique index if not exists runner_crews_tag_ci on public.runner_crews(upper(tag));

create table if not exists public.runner_crew_members (
  crew_id uuid not null references public.runner_crews(id) on delete cascade,
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'runner' check(role in ('leader','officer','runner')),
  contribution bigint not null default 0 check(contribution >= 0),
  joined_at timestamptz not null default now()
);
create index if not exists runner_crew_members_crew_idx on public.runner_crew_members(crew_id);

create table if not exists public.crew_crisis_progress (
  crew_id uuid not null references public.runner_crews(id) on delete cascade,
  cycle date not null,
  logistics integer not null default 0, intel integer not null default 0, security integer not null default 0,
  boss_hp integer not null default 5000, boss_max integer not null default 5000,
  cleared_at timestamptz, updated_at timestamptz not null default now(),
  primary key(crew_id,cycle)
);
create table if not exists public.crew_crisis_actions (
  id uuid primary key default gen_random_uuid(), crew_id uuid not null references public.runner_crews(id) on delete cascade,
  cycle date not null, user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check(action in ('logistics','intel','security','strike')),
  points integer not null check(points > 0), created_at timestamptz not null default now()
);
create index if not exists crew_crisis_actions_lookup on public.crew_crisis_actions(crew_id,cycle,user_id,action);
create table if not exists public.crew_crisis_claims (
  crew_id uuid not null references public.runner_crews(id) on delete cascade, cycle date not null,
  user_id uuid not null references auth.users(id) on delete cascade, claimed_at timestamptz not null default now(),
  primary key(crew_id,cycle,user_id)
);

create table if not exists public.endless_grinds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage integer not null default 1 check(stage between 1 and 999),
  highest_stage integer not null default 1 check(highest_stage between 1 and 999),
  active boolean not null default false,
  last_resolved_at timestamptz not null default now(), total_clears bigint not null default 0,
  total_failures bigint not null default 0, updated_at timestamptz not null default now()
);

alter table public.runner_crews enable row level security;
alter table public.runner_crew_members enable row level security;
alter table public.crew_crisis_progress enable row level security;
alter table public.crew_crisis_actions enable row level security;
alter table public.crew_crisis_claims enable row level security;
alter table public.endless_grinds enable row level security;
revoke insert,update,delete on public.runner_crews,public.runner_crew_members,public.crew_crisis_progress,public.crew_crisis_actions,public.crew_crisis_claims,public.endless_grinds from anon,authenticated;
grant select on public.runner_crews,public.runner_crew_members,public.crew_crisis_progress,public.endless_grinds to authenticated;

create or replace function public.current_crisis_cycle() returns date language sql stable set search_path=public,pg_temp as $$
  select date_trunc('week',now() at time zone 'utc')::date
$$;
revoke all on function public.current_crisis_cycle() from public,anon,authenticated;

create or replace function public.endless_stage_cp(p_stage integer) returns integer language sql immutable set search_path=public,pg_temp as $$
  select round(90 * power(greatest(1,least(999,p_stage)),1.42))::integer
$$;
revoke all on function public.endless_stage_cp(integer) from public,anon,authenticated;

create or replace function public.ensure_crisis(p_crew uuid) returns public.crew_crisis_progress
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.crew_crisis_progress; current_cycle date:=public.current_crisis_cycle();
begin
  insert into public.crew_crisis_progress(crew_id,cycle) values(p_crew,current_cycle) on conflict do nothing;
  select * into result from public.crew_crisis_progress where crew_id=p_crew and cycle=current_cycle;
  return result;
end $$;
revoke all on function public.ensure_crisis(uuid) from public,anon,authenticated;

create or replace function public.get_my_crew_state() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); membership public.runner_crew_members; crew public.runner_crews; crisis public.crew_crisis_progress; result jsonb; member_rows jsonb; public_rows jsonb; ranks jsonb; action_count integer:=0; strike_count integer:=0; mine bigint:=0;
begin
  select * into membership from public.runner_crew_members where user_id=uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'tag',c.tag,'color',c.color,'level',c.level,'memberCount',(select count(*) from public.runner_crew_members m where m.crew_id=c.id)) order by c.level desc,c.xp desc),'[]'::jsonb) into public_rows
    from (select * from public.runner_crews c where c.visibility='public' and (select count(*) from public.runner_crew_members m where m.crew_id=c.id)<24 order by c.level desc,c.xp desc limit 20) c;
  select coalesce(jsonb_agg(jsonb_build_object('crewId',c.id,'name',c.name,'tag',c.tag,'score',c.xp+coalesce((p.logistics+p.intel+p.security)*5+(p.boss_max-p.boss_hp)*2,0),'progress',case when p.boss_max>0 then round((1-p.boss_hp::numeric/p.boss_max)*100) else 0 end,'cleared',p.cleared_at is not null) order by (c.xp+coalesce((p.logistics+p.intel+p.security)*5+(p.boss_max-p.boss_hp)*2,0)) desc),'[]'::jsonb) into ranks
    from (select * from public.runner_crews order by xp desc limit 20) c left join public.crew_crisis_progress p on p.crew_id=c.id and p.cycle=public.current_crisis_cycle();
  if membership.user_id is null then return jsonb_build_object('authority',true,'crew',null,'crisis',null,'publicCrews',public_rows,'rankings',ranks); end if;
  select * into crew from public.runner_crews where id=membership.crew_id;
  crisis:=public.ensure_crisis(crew.id);
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(p.display_name,'Runner'),'role',m.role,'contribution',m.contribution,'combatPower',public.calculate_player_combat_power(m.user_id)) order by case m.role when 'leader' then 0 when 'officer' then 1 else 2 end,m.contribution desc),'[]'::jsonb) into member_rows from public.runner_crew_members m left join public.profiles p on p.id=m.user_id where m.crew_id=crew.id;
  select count(*) filter(where action<>'strike'),count(*) filter(where action='strike'),coalesce(sum(points),0) into action_count,strike_count,mine from public.crew_crisis_actions where crew_id=crew.id and cycle=crisis.cycle and user_id=uid;
  result:=jsonb_build_object('authority',true,'crew',jsonb_build_object('id',crew.id,'name',crew.name,'tag',crew.tag,'color',crew.color,'level',crew.level,'xp',crew.xp,'role',membership.role,'memberCount',jsonb_array_length(member_rows),'members',member_rows),'crisis',jsonb_build_object('cycle',crisis.cycle,'name','Signal Blackout','detail','Restore supply, recon and ward defense, then disable the hostile command unit.','endsAt',(crisis.cycle+7)::timestamptz,'prep',jsonb_build_object('logistics',crisis.logistics,'intel',crisis.intel,'security',crisis.security),'threshold',300,'bossHp',crisis.boss_hp,'bossMax',crisis.boss_max,'cleared',crisis.cleared_at is not null,'rewardClaimed',exists(select 1 from public.crew_crisis_claims where crew_id=crew.id and cycle=crisis.cycle and user_id=uid),'myActions',action_count,'myStrikes',strike_count,'myContribution',mine),'publicCrews',public_rows,'rankings',ranks);
  return result;
end $$;

create or replace function public.create_runner_crew(p_name text,p_tag text,p_color text default '#48dfff') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); cid uuid; clean_name text:=btrim(coalesce(p_name,'')); clean_tag text:=upper(btrim(coalesce(p_tag,''))); clean_color text:=lower(btrim(coalesce(p_color,'')));
begin
  if exists(select 1 from public.runner_crew_members where user_id=uid) then raise exception 'Leave your current Crew first'; end if;
  if clean_name!~'^[A-Za-z0-9 _-]{3,24}$' then raise exception 'Crew name must be 3-24 simple characters'; end if;
  if clean_tag!~'^[A-Z0-9]{2,5}$' then raise exception 'Crew tag must be 2-5 letters or numbers'; end if;
  if clean_color!~'^#[0-9a-f]{6}$' then clean_color:='#48dfff'; end if;
  insert into public.runner_crews(name,tag,color,leader_id) values(clean_name,clean_tag,clean_color,uid) returning id into cid;
  insert into public.runner_crew_members(crew_id,user_id,role) values(cid,uid,'leader'); perform public.ensure_crisis(cid); return public.get_my_crew_state();
end $$;

create or replace function public.join_runner_crew(p_crew_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); target public.runner_crews;
begin
  if exists(select 1 from public.runner_crew_members where user_id=uid) then raise exception 'You already belong to a Crew'; end if;
  select * into target from public.runner_crews where id=p_crew_id and visibility='public' for update;
  if target.id is null then raise exception 'Crew not found'; end if;
  if (select count(*) from public.runner_crew_members where crew_id=target.id)>=24 then raise exception 'Crew is full'; end if;
  insert into public.runner_crew_members(crew_id,user_id) values(target.id,uid); return public.get_my_crew_state();
end $$;

create or replace function public.leave_runner_crew() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); member public.runner_crew_members; successor uuid;
begin
  select * into member from public.runner_crew_members where user_id=uid for update;
  if member.user_id is null then return public.get_my_crew_state(); end if;
  if member.role='leader' then
    select user_id into successor from public.runner_crew_members where crew_id=member.crew_id and user_id<>uid order by joined_at limit 1;
    if successor is null then delete from public.runner_crews where id=member.crew_id; return public.get_my_crew_state(); end if;
    update public.runner_crew_members set role='leader' where user_id=successor; update public.runner_crews set leader_id=successor,updated_at=now() where id=member.crew_id;
  end if;
  delete from public.runner_crew_members where user_id=uid; return public.get_my_crew_state();
end $$;

create or replace function public.contribute_city_crisis(p_track text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); member public.runner_crew_members; crisis public.crew_crisis_progress; actions integer; cp integer; points integer;
begin
  if p_track not in ('logistics','intel','security') then raise exception 'Unknown crisis track'; end if;
  select * into member from public.runner_crew_members where user_id=uid; if member.user_id is null then raise exception 'Join a Crew first'; end if;
  crisis:=public.ensure_crisis(member.crew_id); select count(*) into actions from public.crew_crisis_actions where crew_id=member.crew_id and cycle=crisis.cycle and user_id=uid and action<>'strike';
  if actions>=12 then raise exception 'Weekly preparation action limit reached'; end if;
  cp:=public.calculate_player_combat_power(uid); points:=greatest(18,least(55,18+floor(cp/450.0)::integer));
  if p_track='logistics' then update public.crew_crisis_progress set logistics=least(300,logistics+points),updated_at=now() where crew_id=member.crew_id and cycle=crisis.cycle;
  elsif p_track='intel' then update public.crew_crisis_progress set intel=least(300,intel+points),updated_at=now() where crew_id=member.crew_id and cycle=crisis.cycle;
  else update public.crew_crisis_progress set security=least(300,security+points),updated_at=now() where crew_id=member.crew_id and cycle=crisis.cycle; end if;
  insert into public.crew_crisis_actions(crew_id,cycle,user_id,action,points) values(member.crew_id,crisis.cycle,uid,p_track,points);
  update public.runner_crew_members set contribution=contribution+points where user_id=uid; update public.runner_crews set xp=xp+points,level=least(99,1+floor((xp+points)/2500.0)::integer),updated_at=now() where id=member.crew_id; return public.get_my_crew_state();
end $$;

create or replace function public.strike_city_crisis() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); member public.runner_crew_members; crisis public.crew_crisis_progress; strikes integer; damage integer; cp integer;
begin
  select * into member from public.runner_crew_members where user_id=uid; if member.user_id is null then raise exception 'Join a Crew first'; end if;
  crisis:=public.ensure_crisis(member.crew_id); if least(crisis.logistics,crisis.intel,crisis.security)<300 then raise exception 'Complete every preparation track first'; end if;
  if crisis.cleared_at is not null then raise exception 'Crisis already cleared'; end if;
  select count(*) into strikes from public.crew_crisis_actions where crew_id=member.crew_id and cycle=crisis.cycle and user_id=uid and action='strike'; if strikes>=6 then raise exception 'Weekly strike limit reached'; end if;
  cp:=public.calculate_player_combat_power(uid); damage:=greatest(100,least(900,100+floor(cp/55.0)::integer));
  update public.crew_crisis_progress set boss_hp=greatest(0,boss_hp-damage),cleared_at=case when boss_hp-damage<=0 then now() else null end,updated_at=now() where crew_id=member.crew_id and cycle=crisis.cycle;
  insert into public.crew_crisis_actions(crew_id,cycle,user_id,action,points) values(member.crew_id,crisis.cycle,uid,'strike',damage); update public.runner_crew_members set contribution=contribution+damage where user_id=uid; update public.runner_crews set xp=xp+damage,updated_at=now() where id=member.crew_id; return public.get_my_crew_state();
end $$;

create or replace function public.claim_city_crisis_reward() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); member public.runner_crew_members; crisis public.crew_crisis_progress; mine bigint; wallet public.player_wallets; armory public.player_armories; s jsonb;
begin
  select * into member from public.runner_crew_members where user_id=uid; if member.user_id is null then raise exception 'Join a Crew first'; end if; crisis:=public.ensure_crisis(member.crew_id);
  if crisis.cleared_at is null then raise exception 'Clear the City Crisis first'; end if; select coalesce(sum(points),0) into mine from public.crew_crisis_actions where crew_id=member.crew_id and cycle=crisis.cycle and user_id=uid;
  if mine<100 then raise exception 'Contribute at least 100 points first'; end if;
  insert into public.crew_crisis_claims(crew_id,cycle,user_id) values(member.crew_id,crisis.cycle,uid); wallet:=public.ensure_exchange_wallet(uid); update public.player_wallets set balance=balance+5000,version=version+1,updated_at=now() where user_id=uid returning * into wallet; perform public.mirror_wallet_to_save(uid,wallet.balance);
  select * into armory from public.player_armories where user_id=uid for update; s:=jsonb_set(armory.state,'{shards}',to_jsonb(coalesce((armory.state->>'shards')::integer,0)+150),true); update public.player_armories set state=s,updated_at=now() where user_id=uid;
  return jsonb_build_object('balance',wallet.balance,'armory',s,'crewState',public.get_my_crew_state());
exception when unique_violation then raise exception 'Crisis reward already claimed';
end $$;

create or replace function public.get_my_endless_state() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); grind public.endless_grinds;
begin
  insert into public.endless_grinds(user_id) values(uid) on conflict do nothing; select * into grind from public.endless_grinds where user_id=uid;
  return jsonb_build_object('authority',true,'active',grind.active,'stage',grind.stage,'highestStage',grind.highest_stage,'totalClears',grind.total_clears,'totalFailures',grind.total_failures,'lastResolvedAt',grind.last_resolved_at,'nextResolveAt',grind.last_resolved_at+interval '30 seconds','requiredCp',public.endless_stage_cp(grind.stage));
end $$;

create or replace function public.start_endless_grind(p_stage integer default 1) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); target integer:=greatest(1,least(999,coalesce(p_stage,1)));
begin insert into public.endless_grinds(user_id,stage,highest_stage,active,last_resolved_at) values(uid,target,1,true,now()) on conflict(user_id) do update set stage=target,active=true,last_resolved_at=now(),updated_at=now(); return public.get_my_endless_state(); end $$;

create or replace function public.stop_endless_grind() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); begin update public.endless_grinds set active=false,updated_at=now() where user_id=uid; return public.get_my_endless_state(); end $$;

create or replace function public.resolve_endless_grind() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); grind public.endless_grinds; armory public.player_armories; cp integer; ticks integer; i integer; req integer; won boolean; roll numeric; reward jsonb; drops jsonb:='[]'::jsonb; events jsonb:='[]'::jsonb; current_stage integer; next_stage integer;
begin
  select * into grind from public.endless_grinds where user_id=uid for update; if grind.user_id is null then return public.get_my_endless_state(); end if; if not grind.active then return jsonb_build_object('state',public.get_my_endless_state(),'drops',drops,'events',events); end if;
  ticks:=least(960,floor(extract(epoch from(now()-grind.last_resolved_at))/30)::integer); if ticks<1 then return jsonb_build_object('state',public.get_my_endless_state(),'drops',drops,'events',events); end if;
  select * into armory from public.player_armories where user_id=uid for update; if armory.user_id is null then raise exception 'Armory is not ready'; end if; cp:=public.calculate_player_combat_power(uid); current_stage:=grind.stage;
  for i in 1..ticks loop
    req:=public.endless_stage_cp(current_stage); roll:=random(); won:=case when cp>=req then true else roll<greatest(.08,least(.92,cp::numeric/req)) end;
    if won then reward:=public.roll_dungeon_drop(armory.state,least(99,greatest(1,ceil(current_stage/10.0)::integer)),false); armory.state:=reward->'state'; drops:=drops||jsonb_build_array(reward->'drop'); next_stage:=least(999,current_stage+1); grind.total_clears:=grind.total_clears+1; grind.highest_stage:=greatest(grind.highest_stage,next_stage);
    else next_stage:=greatest(1,current_stage-1); grind.total_failures:=grind.total_failures+1; end if;
    events:=(events||jsonb_build_array(jsonb_build_object('stage',current_stage,'win',won,'nextStage',next_stage)))#-'{20}'; current_stage:=next_stage;
  end loop;
  update public.player_armories set state=armory.state,updated_at=now() where user_id=uid; update public.endless_grinds set stage=current_stage,highest_stage=grind.highest_stage,total_clears=grind.total_clears,total_failures=grind.total_failures,last_resolved_at=last_resolved_at+(ticks*interval '30 seconds'),updated_at=now() where user_id=uid;
  return jsonb_build_object('state',public.get_my_endless_state(),'armory',armory.state,'drops',drops,'events',events);
end $$;

revoke all on function public.get_my_crew_state(),public.create_runner_crew(text,text,text),public.join_runner_crew(uuid),public.leave_runner_crew(),public.contribute_city_crisis(text),public.strike_city_crisis(),public.claim_city_crisis_reward(),public.get_my_endless_state(),public.start_endless_grind(integer),public.stop_endless_grind(),public.resolve_endless_grind() from public,anon;
grant execute on function public.get_my_crew_state(),public.create_runner_crew(text,text,text),public.join_runner_crew(uuid),public.leave_runner_crew(),public.contribute_city_crisis(text),public.strike_city_crisis(),public.claim_city_crisis_reward(),public.get_my_endless_state(),public.start_endless_grind(integer),public.stop_endless_grind(),public.resolve_endless_grind() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='runner_crew_members') then alter publication supabase_realtime add table public.runner_crew_members; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='crew_crisis_progress') then alter publication supabase_realtime add table public.crew_crisis_progress; end if;
end $$;
