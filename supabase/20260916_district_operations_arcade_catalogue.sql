-- Moretti: district operations, player-facing Arcade terminology and catalogue clarity.
-- Apply after 20260915_core_rpg_progression.sql. Safe to re-run.

-- Compatibility: historical ids and RPC names containing "casino" stay unchanged.
-- Only player-facing names change, which protects existing careers, logs and saves.
update public.bw_professions set name='Arcade Operations',company='Rossi Recreation Hall',description='Hospitality, security and play-credit arcade operations.' where id='casino';
update public.bw_job_positions set name=case id
  when 'casino-1' then 'Arcade Attendant' when 'casino-2' then 'Game Supervisor'
  when 'casino-3' then 'Arcade Director' when 'casino-4' then 'Operations Manager'
  when 'casino-5' then 'Recreation Director' else name end,
  special_name='Collect recreation bonus' where profession_id='casino';
update public.bw_job_questions set question=case id
  when 'c1' then 'A guest disputes a recorded game result.'
  when 'c2' then 'You notice a cabinet has been tampered with.'
  when 'c3' then 'A fair recreation hall depends on…' else question end,
  options=case id
  when 'c1' then '["Check the server record","Argue","Change the result"]'::jsonb
  when 'c2' then '["Secure it and alert the supervisor","Use it","Ignore it"]'::jsonb
  when 'c3' then '["Consistent published rules","Changing results","Unlogged credits"]'::jsonb else options end
where profession_id='casino';

create table if not exists public.bw_operation_districts(
  id text primary key,name text not null,zone text not null,summary text not null,
  threat integer not null check(threat between 1 and 5),required_level integer not null default 1,
  accent text not null default '#9b6742',sort_order integer not null
);
insert into public.bw_operation_districts values
('harbor','The Harbor','WATERFRONT','Container yards, union depots and narrow service roads where every manifest matters.',1,1,'#4d8190',1),
('old-quarter','Old Quarter','CENTRAL','Courtyards, archives and family businesses threaded through Blackwood history.',1,2,'#9a6745',2),
('northside','Northside','RESIDENTIAL','Clinics, tenements and community stores that need discreet protection.',2,4,'#59806a',3),
('railway','Railway Quarter','INDUSTRIAL','Freight spurs and repair sheds controlled by organized salvage crews.',2,6,'#807153',4),
('southside','Southside','WORKSHOPS','Garages, fenced yards and rival workshops running after dark.',3,9,'#9a5546',5),
('financial','Financial Ward','DOWNTOWN','Records, secure couriers and high-rise service corridors.',3,12,'#8b7048',6),
('narrows','The Narrows','EAST END','Dense alleys and back rooms where information travels faster than cars.',4,16,'#715d78',7),
('heights','The Heights','UPTOWN','Private estates and guarded galleries above the city lights.',5,22,'#876949',8)
on conflict(id) do update set name=excluded.name,zone=excluded.zone,summary=excluded.summary,threat=excluded.threat,required_level=excluded.required_level,accent=excluded.accent,sort_order=excluded.sort_order;

create table if not exists public.bw_district_operations(
  id text primary key,district_id text not null references public.bw_operation_districts(id),
  name text not null,briefing text not null,captain_name text not null,
  difficulty integer not null check(difficulty between 1 and 10),required_level integer not null,
  base_cash integer not null,base_xp integer not null,base_mastery integer not null,
  faction_id text references public.bw_factions(id),rare_chance numeric(6,5) not null check(rare_chance between 0 and 1),sort_order integer not null
);
insert into public.bw_district_operations values
('harbor-manifest','harbor','The Missing Manifest','Trace a diverted freight manifest before the morning inspection.','Foreman Pike',1,1,1150,16,8,'harbor-union',.018,1),
('harbor-cranes','harbor','Crane Row Recovery','Recover marked cargo from an NPC salvage crew working Crane Row.','Captain Rusk',2,3,1850,23,11,'harbor-union',.024,2),
('quarter-ledger','old-quarter','The Quiet Ledger','Locate a copied account book without alarming the neighborhood.','Archivist Venn',2,2,1450,20,10,'moretti-circle',.021,1),
('quarter-courtyard','old-quarter','Courtyard Watch','Disrupt an NPC crew scouting protected family businesses.','Captain Orso',3,5,2300,29,13,'moretti-circle',.029,2),
('north-supplies','northside','Clinic Supply Run','Escort sealed supplies through blocks watched by opportunistic NPC raiders.','Captain Hale',3,4,2100,27,13,'northside-aid',.028,1),
('north-switchboard','northside','Night Switchboard','Identify false emergency calls drawing volunteers away from their posts.','Operator Crowe',4,7,3100,36,16,'northside-aid',.036,2),
('rail-signal','railway','Signal House','Retake a signal room from an NPC theft crew without stopping freight.','Captain Flint',4,6,2850,34,16,'harbor-union',.034,1),
('rail-midnight','railway','Midnight Freight','Shadow an unlisted train and recover its sealed dispatch case.','Marshal Kade',5,9,4100,45,20,'harbor-union',.043,2),
('south-chopshop','southside','Workshop Sweep','Secure evidence from an NPC chop crew before they clear the garage.','Captain Vale',5,9,4300,47,21,'moretti-circle',.045,1),
('south-convoy','southside','Parts Convoy','Intercept a convoy of stolen machine parts crossing Southside.','Driver Knox',6,13,6200,61,25,'moretti-circle',.055,2),
('finance-courier','financial','Secure Courier','Find a missing Federal Trust courier and recover the sealed case.','Auditor Sloan',6,12,5900,59,25,'federal-trust',.052,1),
('finance-records','financial','The Red File','Enter a records floor and retrieve a forged settlement archive.','Captain Mercer',7,16,8200,76,30,'federal-trust',.064,2),
('narrows-listener','narrows','The Listener','Map an NPC information ring through the Narrows without exposing sources.','Broker Wren',7,16,8500,79,31,'moretti-circle',.066,1),
('narrows-blackout','narrows','Block by Block','Restore three protected businesses during a coordinated blackout.','Captain Morrow',8,20,11200,96,37,'northside-aid',.078,2),
('heights-gallery','heights','Gallery Recovery','Recover a documented collection taken by an elite NPC burglary crew.','Curator Slate',9,22,14500,118,44,'federal-trust',.091,1),
('heights-estate','heights','The Hill Estate','Break an elite NPC captain''s hold over the Heights service roads.','Commander Roth',10,28,21000,155,55,'moretti-circle',.115,2)
on conflict(id) do update set district_id=excluded.district_id,name=excluded.name,briefing=excluded.briefing,captain_name=excluded.captain_name,difficulty=excluded.difficulty,required_level=excluded.required_level,base_cash=excluded.base_cash,base_xp=excluded.base_xp,base_mastery=excluded.base_mastery,faction_id=excluded.faction_id,rare_chance=excluded.rare_chance,sort_order=excluded.sort_order;

create table if not exists public.bw_district_progress(
  user_id uuid not null references auth.users(id) on delete cascade,district_id text not null references public.bw_operation_districts(id),
  heat integer not null default 0 check(heat between 0 and 100),mastery integer not null default 0,
  clears integer not null default 0,failures integer not null default 0,last_played_at timestamptz,last_heat_at timestamptz not null default now(),
  primary key(user_id,district_id)
);
create table if not exists public.bw_active_district_operations(
  user_id uuid primary key references auth.users(id) on delete cascade,operation_id text not null references public.bw_district_operations(id),
  approach text not null check(approach in('careful','direct','social')),mode text not null check(mode in('solo','family')),
  current_stage integer not null default 1 check(current_stage between 1 and 4),condition integer not null default 100 check(condition between 0 and 100),
  successes integer not null default 0,failures integer not null default 0,supporters integer not null default 1,
  started_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours'
);
create table if not exists public.bw_district_operation_actions(
  id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,operation_id text not null references public.bw_district_operations(id),stage integer not null,
  success boolean not null,event jsonb not null,created_at timestamptz not null default now(),unique(user_id,request_id)
);
create table if not exists public.bw_district_operation_runs(
  id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null references public.bw_district_operations(id),success boolean not null,approach text not null,mode text not null,
  stage_reached integer not null,cash_reward integer not null,xp_reward integer not null,mastery_reward integer not null,
  efficiency numeric(5,4) not null,rare_item_id text references public.bw_items(id),created_at timestamptz not null default now()
);

alter table public.bw_operation_districts enable row level security;
alter table public.bw_district_operations enable row level security;
alter table public.bw_district_progress enable row level security;
alter table public.bw_active_district_operations enable row level security;
alter table public.bw_district_operation_actions enable row level security;
alter table public.bw_district_operation_runs enable row level security;
drop policy if exists "authenticated read operation districts" on public.bw_operation_districts; create policy "authenticated read operation districts" on public.bw_operation_districts for select to authenticated using(true);
drop policy if exists "authenticated read operations" on public.bw_district_operations; create policy "authenticated read operations" on public.bw_district_operations for select to authenticated using(true);
drop policy if exists "users read own district progress" on public.bw_district_progress; create policy "users read own district progress" on public.bw_district_progress for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own active operation" on public.bw_active_district_operations; create policy "users read own active operation" on public.bw_active_district_operations for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own operation actions" on public.bw_district_operation_actions; create policy "users read own operation actions" on public.bw_district_operation_actions for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own operation runs" on public.bw_district_operation_runs; create policy "users read own operation runs" on public.bw_district_operation_runs for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_operation_districts,public.bw_district_operations,public.bw_district_progress,public.bw_active_district_operations,public.bw_district_operation_actions,public.bw_district_operation_runs from anon,authenticated;
grant select on public.bw_operation_districts,public.bw_district_operations,public.bw_district_progress,public.bw_active_district_operations,public.bw_district_operation_actions,public.bw_district_operation_runs to authenticated;

create or replace function public.bw_decay_district_heat(p_uid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.bw_district_progress set heat=greatest(0,heat-(floor(extract(epoch from(now()-last_heat_at))/3600)::integer*5)),
    last_heat_at=last_heat_at+make_interval(hours=>floor(extract(epoch from(now()-last_heat_at))/3600)::integer)
  where user_id=p_uid and last_heat_at<=now()-interval '1 hour';
end $$;

create or replace function public.bw_operations_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();s public.bw_player_states;today_count integer;family_count integer:=1;
begin
  s:=public.bw_refresh_player(uid);
  perform public.bw_decay_district_heat(uid);
  insert into public.bw_district_progress(user_id,district_id) select uid,id from public.bw_operation_districts on conflict do nothing;
  select count(*) into today_count from public.bw_district_operation_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  select greatest(1,count(*)) into family_count from public.runner_crew_members where crew_id=(select crew_id from public.runner_crew_members where user_id=uid);
  return jsonb_build_object(
    'player',to_jsonb(s)||jsonb_build_object('cash',(select balance from public.player_wallets where user_id=uid)),
    'grind',jsonb_build_object('today',today_count,'fullEfficiencyRuns',10,'nextEfficiency',greatest(.40,1-greatest(0,today_count-9)*.03),'minimumEfficiency',.40,'heatDecayPerHour',5),
    'family',jsonb_build_object('memberCount',family_count,'eligible',family_count>=2),
    'active',(select jsonb_build_object('operationName',o.name,'districtName',d.name,'briefing',o.briefing,'captainName',o.captain_name,'difficulty',o.difficulty,'accent',d.accent,'approach',a.approach,'mode',a.mode,'currentStage',a.current_stage,'condition',a.condition,'successes',a.successes,'failures',a.failures,'supporters',a.supporters,
      'stageTitle',(array['Survey the ground','Prepare the route','Meet the NPC crew','Leave cleanly'])[a.current_stage],
      'stageBrief',(array['Gather current intelligence and identify the safest opening.','Secure transport, tools and a fallback route.','Carry out the plan against the operation captain.','Extract the team and recover the documented objective.'])[a.current_stage]) from public.bw_active_district_operations a join public.bw_district_operations o on o.id=a.operation_id join public.bw_operation_districts d on d.id=o.district_id where a.user_id=uid),
    'districts',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'zone',d.zone,'summary',d.summary,'threat',d.threat,'requiredLevel',d.required_level,'accent',d.accent,'heat',p.heat,'mastery',p.mastery,'clears',p.clears,'failures',p.failures,'operations',(select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'briefing',o.briefing,'captainName',o.captain_name,'difficulty',o.difficulty,'requiredLevel',o.required_level,'baseCash',o.base_cash,'baseXp',o.base_xp,'baseMastery',o.base_mastery,'rareChance',o.rare_chance) order by o.sort_order) from public.bw_district_operations o where o.district_id=d.id)) order by d.sort_order) from public.bw_operation_districts d join public.bw_district_progress p on p.district_id=d.id and p.user_id=uid),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(x order by x.created_at desc) from(select r.created_at,r.success,r.cash_reward as cash,r.xp_reward as xp,r.rare_item_id,i.name as item_name,o.name as operation_name from public.bw_district_operation_runs r join public.bw_district_operations o on o.id=r.operation_id left join public.bw_items i on i.id=r.rare_item_id where r.user_id=uid order by r.created_at desc limit 10)x),'[]'::jsonb)
  );
end $$;

create or replace function public.bw_begin_district_operation(p_operation_id text,p_approach text,p_mode text default 'solo') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();s public.bw_player_states;o public.bw_district_operations;member_count integer:=1;
begin
  if p_approach not in('careful','direct','social') or p_mode not in('solo','family') then raise exception 'invalid operation plan'; end if;
  if exists(select 1 from public.bw_active_district_operations where user_id=uid) then raise exception 'finish your active operation first'; end if;
  s:=public.bw_refresh_player(uid); if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if;
  select * into o from public.bw_district_operations where id=p_operation_id; if o.id is null then raise exception 'operation not found'; end if;
  if s.level<o.required_level then raise exception 'level % required',o.required_level; end if;
  if p_mode='family' then
    select count(*) into member_count from public.runner_crew_members where crew_id=(select crew_id from public.runner_crew_members where user_id=uid);
    if member_count<2 then raise exception 'join a family with at least two real members for family support'; end if;
  end if;
  insert into public.bw_active_district_operations(user_id,operation_id,approach,mode,supporters) values(uid,o.id,p_approach,p_mode,case when p_mode='family' then least(4,member_count) else 1 end);
  return public.bw_operations_snapshot();
end $$;

create or replace function public.bw_advance_district_operation(p_choice text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();a public.bw_active_district_operations;o public.bw_district_operations;s public.bw_player_states;p public.bw_district_progress;
  existing jsonb;power numeric;chance numeric;won boolean;next_condition integer;completed boolean:=false;run_won boolean:=false;
  today_count integer;efficiency numeric(5,4);cash integer:=0;gained_xp integer:=0;gained_mastery integer:=0;drop_id text;drop_rarity text;v_event jsonb;
begin
  if p_choice not in('careful','direct','social') then raise exception 'invalid stage choice'; end if;
  select e.event into existing from public.bw_district_operation_actions e where e.user_id=uid and e.request_id=p_request_id;
  if existing is not null then return jsonb_build_object('event',existing,'operations',public.bw_operations_snapshot()); end if;
  select * into a from public.bw_active_district_operations where user_id=uid for update; if a.user_id is null then raise exception 'no active operation'; end if;
  if a.expires_at<now() then delete from public.bw_active_district_operations where user_id=uid; raise exception 'operation dossier expired'; end if;
  select * into o from public.bw_district_operations where id=a.operation_id; s:=public.bw_refresh_player(uid);
  perform public.bw_decay_district_heat(uid); insert into public.bw_district_progress(user_id,district_id) values(uid,o.district_id) on conflict do nothing;
  select * into p from public.bw_district_progress where user_id=uid and district_id=o.district_id for update;
  power:=case p_choice when 'direct' then (s.strength+s.defense)/2 when 'careful' then (s.speed+s.dexterity)/2 else s.crime_skill*4+s.intelligence end;
  power:=power+coalesce(public.bw_equipment_power(uid),0)/4;
  chance:=greatest(22,least(94,70+least(18,power/18)+case when p_choice=a.approach then 9 else 0 end+case when a.mode='family' then least(12,(a.supporters-1)*4) else 0 end-o.difficulty*5-p.heat*.20));
  won:=random()*100<chance; next_condition:=greatest(0,a.condition-case when won then 0 else 25 end);
  if a.current_stage=4 or next_condition=0 then completed:=true; run_won:=won and next_condition>0; end if;
  v_event:=jsonb_build_object('success',won,'completed',completed,'title',case when won then 'Stage secured' else 'Operation setback' end,'message',case when won then 'The plan held. Your team can move to the next objective.' when completed then 'The operation ended, but the intelligence gained still counts.' else 'The route became harder, but the operation continues.' end,'chance',round(chance),'condition',next_condition);
  insert into public.bw_district_operation_actions(user_id,request_id,operation_id,stage,success,event) values(uid,p_request_id,o.id,a.current_stage,won,v_event);
  if not completed then update public.bw_active_district_operations set current_stage=current_stage+1,condition=next_condition,successes=successes+(won::integer),failures=failures+((not won)::integer) where user_id=uid; return jsonb_build_object('event',v_event,'operations',public.bw_operations_snapshot()); end if;
  select count(*) into today_count from public.bw_district_operation_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  efficiency:=greatest(.40,1-greatest(0,today_count-9)*.03);
  cash:=case when run_won then greatest(100,floor(o.base_cash*efficiency*(.75+random()*.5))::integer) else greatest(50,floor(o.base_cash*.08)::integer) end;
  gained_xp:=case when run_won then greatest(3,floor(o.base_xp*efficiency)::integer) else greatest(2,floor(o.base_xp*.12)::integer) end;
  gained_mastery:=case when run_won then greatest(2,floor(o.base_mastery*efficiency)::integer) else 1 end;
  if run_won and random()<o.rare_chance then drop_rarity:=case when o.difficulty>=9 and random()<.08 then 'legendary' when o.difficulty>=6 and random()<.24 then 'epic' else 'rare' end; drop_id:=public.bw_award_relic(uid,drop_rarity); end if;
  update public.player_wallets set balance=balance+cash,version=version+1,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,gained_xp);
  update public.bw_player_states set respect=respect+case when run_won then greatest(1,o.difficulty) else 0 end,updated_at=now() where user_id=uid;
  update public.bw_district_progress set heat=least(100,heat+6+o.difficulty*2),mastery=mastery+gained_mastery,clears=clears+(run_won::integer),failures=failures+((not run_won)::integer),last_played_at=now(),last_heat_at=now() where user_id=uid and district_id=o.district_id;
  if o.faction_id is not null then insert into public.bw_faction_reputation(user_id,faction_id,reputation,assignments_completed) values(uid,o.faction_id,case when run_won then greatest(2,o.difficulty) else 1 end,run_won::integer) on conflict(user_id,faction_id) do update set reputation=bw_faction_reputation.reputation+excluded.reputation,assignments_completed=bw_faction_reputation.assignments_completed+excluded.assignments_completed,updated_at=now(); end if;
  insert into public.bw_district_operation_runs(user_id,operation_id,success,approach,mode,stage_reached,cash_reward,xp_reward,mastery_reward,efficiency,rare_item_id) values(uid,o.id,run_won,a.approach,a.mode,a.current_stage,cash,gained_xp,gained_mastery,efficiency,drop_id);
  delete from public.bw_active_district_operations where user_id=uid;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  v_event:=v_event||jsonb_build_object('success',run_won,'completed',true,'title',case when run_won then 'Operation complete' else 'Dossier closed' end,'message',case when run_won then 'Extraction complete. Rewards and district standing were recorded.' else 'You left with partial intelligence and permanent mastery progress.' end,'cash',cash,'xp',gained_xp,'mastery',gained_mastery,'efficiency',efficiency,'itemId',drop_id,'itemName',(select name from public.bw_items where id=drop_id));
  update public.bw_district_operation_actions x set event=v_event where x.user_id=uid and x.request_id=p_request_id;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'operation',case when run_won then 'Completed ' else 'Attempted ' end||o.name,v_event);
  return jsonb_build_object('event',v_event,'operations',public.bw_operations_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin return jsonb_build_object('city',public.bw_get_state(),'career',public.bw_job_snapshot(),'forex',public.bw_fx_snapshot('EUR/USD'),'loadout',public.bw_get_loadout(),'progression',public.bw_progression_snapshot(),'operations',public.bw_operations_snapshot(),'available_pages',array['home','crimes','hustles','operations','combat','gym','work','missions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']); end $$;

revoke all on function public.bw_decay_district_heat(uuid),public.bw_operations_snapshot(),public.bw_begin_district_operation(text,text,text),public.bw_advance_district_operation(text,uuid) from public,anon;
grant execute on function public.bw_operations_snapshot(),public.bw_begin_district_operation(text,text,text),public.bw_advance_district_operation(text,uuid) to authenticated;
