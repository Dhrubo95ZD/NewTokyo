-- Moretti: Blackwood City — connected RPG progression.
-- Apply after 20260914_play_release_safety.sql.

create table if not exists public.bw_factions (
  id text primary key,
  name text not null,
  district text not null,
  description text not null,
  specialty text not null,
  sort_order integer not null
);

insert into public.bw_factions(id,name,district,description,specialty,sort_order) values
('moretti-circle','The Moretti Circle','Old Quarter','A private network built on loyalty, discretion and keeping promises.','Combat and respect',1),
('harbor-union','Harbor Union','Docks','Freight crews, warehouse stewards and dispatchers who keep Blackwood supplied.','Cash and manual work',2),
('federal-trust','Federal Trust','Financial Ward','Auditors and market professionals who reward discipline and accurate records.','Careers and intelligence',3),
('northside-aid','Northside Aid Society','Northside','Volunteers and clinic staff keeping vulnerable streets supplied and safe.','Health and endurance',4)
on conflict(id) do update set name=excluded.name,district=excluded.district,description=excluded.description,specialty=excluded.specialty,sort_order=excluded.sort_order;

create table if not exists public.bw_faction_assignments (
  id text primary key,
  faction_id text not null references public.bw_factions(id),
  name text not null,
  description text not null,
  base_chance integer not null check(base_chance between 10 and 100),
  cash_reward integer not null,
  xp_reward integer not null,
  reputation_reward integer not null,
  level_required integer not null default 1,
  sort_order integer not null
);

insert into public.bw_faction_assignments values
('quiet-collection','moretti-circle','Quiet collection','Recover an overdue business payment without causing a public scene.',78,850,12,4,1,1),
('settle-dispute','moretti-circle','Settle a dispute','Convince two crews to resolve a disagreement before it becomes a street fight.',64,1800,22,7,6,2),
('night-manifest','harbor-union','Night manifest','Reconcile late freight against the warehouse ledger.',88,700,10,4,1,1),
('priority-cargo','harbor-union','Priority cargo','Move a time-sensitive shipment through a congested depot.',70,1650,20,7,5,2),
('ledger-audit','federal-trust','Ledger audit','Find discrepancies in a stack of market settlement records.',84,900,14,5,2,1),
('risk-brief','federal-trust','Risk brief','Prepare a concise exposure report for the morning desk.',68,2100,25,8,8,2),
('supply-round','northside-aid','Supply round','Deliver sealed medical and food supplies to neighborhood volunteers.',92,620,11,5,1,1),
('clinic-escort','northside-aid','Clinic escort','Escort an evening clinic team safely through a difficult block.',72,1500,21,7,6,2)
on conflict(id) do update set faction_id=excluded.faction_id,name=excluded.name,description=excluded.description,base_chance=excluded.base_chance,cash_reward=excluded.cash_reward,xp_reward=excluded.xp_reward,reputation_reward=excluded.reputation_reward,level_required=excluded.level_required,sort_order=excluded.sort_order;

-- Extend every profession from a short three-step ladder to a five-rank career.
insert into public.bw_job_positions values
('docks-4','docks',4,'Port Superintendent',10500,13,4,3,3,145,100,120,120,'Claim contraband'),
('docks-5','docks',5,'Director of Logistics',19000,18,5,4,4,230,160,195,210,'Claim contraband'),
('casino-4','casino',4,'Operations Manager',11500,14,1,4,3,100,155,120,125,'Collect house tips'),
('casino-5','casino',5,'Club Director',20500,19,1,6,4,155,245,190,220,'Collect house tips'),
('medical-4','medical',4,'Clinical Director',13000,15,1,7,3,85,210,155,140,'Medical supplies'),
('medical-5','medical',5,'Hospital Administrator',22000,20,1,8,4,130,310,235,240,'Medical supplies'),
('education-4','education',4,'Department Chair',11800,14,1,7,2,60,215,120,130,'Private study'),
('education-5','education',5,'College Provost',21000,19,1,9,3,90,325,185,225,'Private study'),
('law-4','law',4,'Managing Counsel',14000,16,1,7,3,70,225,135,145,'Legal intervention'),
('law-5','law',5,'Senior Partner',24000,21,1,9,4,110,340,205,250,'Legal intervention'),
('banking-4','banking',4,'Treasury Director',21000,17,1,7,3,55,280,155,165,'Market brief'),
('banking-5','banking',5,'Chief Market Officer',35000,23,1,10,4,85,420,240,285,'Market brief')
on conflict(id) do update set name=excluded.name,daily_pay=excluded.daily_pay,point_gain=excluded.point_gain,manual_gain=excluded.manual_gain,intelligence_gain=excluded.intelligence_gain,endurance_gain=excluded.endurance_gain,manual_required=excluded.manual_required,intelligence_required=excluded.intelligence_required,endurance_required=excluded.endurance_required,promotion_cost=excluded.promotion_cost,special_name=excluded.special_name;

create table if not exists public.bw_faction_reputation (
  user_id uuid not null references auth.users(id) on delete cascade,
  faction_id text not null references public.bw_factions(id),
  reputation integer not null default 0 check(reputation >= 0),
  assignments_completed integer not null default 0 check(assignments_completed >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,faction_id)
);

create table if not exists public.bw_faction_assignment_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id text not null references public.bw_faction_assignments(id),
  request_id uuid not null,
  success boolean not null,
  cash_reward integer not null,
  xp_reward integer not null,
  reputation_reward integer not null,
  efficiency numeric(5,4) not null,
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

create table if not exists public.bw_story_missions (
  id text primary key,
  chapter integer not null,
  sequence integer not null,
  title text not null,
  briefing text not null,
  objective text not null,
  objective_type text not null,
  objective_target integer not null,
  objective_faction text references public.bw_factions(id),
  prerequisite_id text references public.bw_story_missions(id),
  cash_reward integer not null default 0,
  xp_reward integer not null default 0,
  merit_reward integer not null default 0,
  respect_reward integer not null default 0,
  faction_reward integer not null default 0,
  reward_item_id text references public.bw_items(id),
  unique(chapter,sequence)
);

insert into public.bw_story_missions values
('arrival-1',1,1,'A Name on the Ledger','Salvatore Moretti has agreed to hear your name—after you prove you can finish ordinary work.','Complete five successful crimes.','crimes',5,'moretti-circle',null,3500,45,1,8,10,null),
('arrival-2',1,2,'Clock In','A reputation without discipline is noise. Hold a real position and finish a shift.','Complete one career shift.','career_shifts',1,'harbor-union','arrival-1',4200,55,1,8,12,null),
('arrival-3',1,3,'Stand Your Ground','The streets respect preparation. Win a server-resolved fight against another player.','Win one player fight.','wins',1,'moretti-circle','arrival-2',6500,80,1,15,15,'first-aid'),
('harbor-1',2,1,'The Missing Manifest','Three numbered crates vanished between the dock gate and Warehouse Nine.','Complete five Harbor Union assignments.','assignments',5,'harbor-union','arrival-3',9000,110,1,18,25,null),
('harbor-2',2,2,'People Who Show Up','The union trusts consistent workers, not loud promises.','Reach 75 reputation with the Harbor Union.','faction_rep',75,'harbor-union','harbor-1',12000,140,2,24,30,'tailored-vest'),
('harbor-3',2,3,'A Seat at the Table','Important work needs a real crew. Join or found a player family.','Become a member of a player family.','family_member',1,'moretti-circle','harbor-2',18000,180,2,35,35,null),
('ledger-1',3,1,'Clean Books','Federal Trust noticed your record. They want evidence that you understand restraint.','Complete three Federal Trust assignments.','assignments',3,'federal-trust','harbor-3',16000,170,2,25,24,null),
('ledger-2',3,2,'Professional Standing','A senior title opens doors that street money cannot.','Reach career tier three.','career_tier',3,'federal-trust','ledger-1',24000,230,2,35,35,null),
('ledger-3',3,3,'Known Across Blackwood','Your decisions now carry weight outside your own district.','Reach 500 respect.','respect',500,'moretti-circle','ledger-2',32000,300,3,60,45,'service-revolver'),
('city-1',4,1,'The Long Week','Build a record broad enough that every district recognizes it.','Reach player level 15.','level',15,'northside-aid','ledger-3',40000,400,3,75,50,null),
('city-2',4,2,'Reliable Hands','Keep working after the easy rewards have passed.','Complete twenty faction assignments.','all_assignments',20,'harbor-union','city-1',55000,520,4,90,60,null),
('city-3',4,3,'Made in Blackwood','You are no longer waiting outside the room. Your record speaks before you enter.','Reach city standing score 2,500.','standing',2500,'moretti-circle','city-2',100000,850,5,150,100,null)
on conflict(id) do update set chapter=excluded.chapter,sequence=excluded.sequence,title=excluded.title,briefing=excluded.briefing,objective=excluded.objective,objective_type=excluded.objective_type,objective_target=excluded.objective_target,objective_faction=excluded.objective_faction,prerequisite_id=excluded.prerequisite_id,cash_reward=excluded.cash_reward,xp_reward=excluded.xp_reward,merit_reward=excluded.merit_reward,respect_reward=excluded.respect_reward,faction_reward=excluded.faction_reward,reward_item_id=excluded.reward_item_id;

create table if not exists public.bw_player_story_missions (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.bw_story_missions(id),
  claimed_at timestamptz,
  primary key(user_id,mission_id)
);

create table if not exists public.bw_progression_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_career_credit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bw_factions enable row level security;
alter table public.bw_faction_assignments enable row level security;
alter table public.bw_faction_reputation enable row level security;
alter table public.bw_faction_assignment_runs enable row level security;
alter table public.bw_story_missions enable row level security;
alter table public.bw_player_story_missions enable row level security;
alter table public.bw_progression_profiles enable row level security;

drop policy if exists "authenticated read factions" on public.bw_factions;
create policy "authenticated read factions" on public.bw_factions for select to authenticated using(true);
drop policy if exists "authenticated read faction assignments" on public.bw_faction_assignments;
create policy "authenticated read faction assignments" on public.bw_faction_assignments for select to authenticated using(true);
drop policy if exists "authenticated read story missions" on public.bw_story_missions;
create policy "authenticated read story missions" on public.bw_story_missions for select to authenticated using(true);
drop policy if exists "users read own faction reputation" on public.bw_faction_reputation;
create policy "users read own faction reputation" on public.bw_faction_reputation for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own faction runs" on public.bw_faction_assignment_runs;
create policy "users read own faction runs" on public.bw_faction_assignment_runs for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own story missions" on public.bw_player_story_missions;
create policy "users read own story missions" on public.bw_player_story_missions for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own progression" on public.bw_progression_profiles;
create policy "users read own progression" on public.bw_progression_profiles for select to authenticated using(auth.uid()=user_id);

revoke insert,update,delete on public.bw_factions,public.bw_faction_assignments,public.bw_faction_reputation,public.bw_faction_assignment_runs,public.bw_story_missions,public.bw_player_story_missions,public.bw_progression_profiles from anon,authenticated;
grant select on public.bw_factions,public.bw_faction_assignments,public.bw_faction_reputation,public.bw_faction_assignment_runs,public.bw_story_missions,public.bw_player_story_missions,public.bw_progression_profiles to authenticated;

create or replace function public.bw_standing_score(p_uid uuid) returns bigint
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; mission_count integer; rep_total integer; career_tier integer;
begin
  select * into s from public.bw_player_states where user_id=p_uid;
  if s.user_id is null then return 0; end if;
  select count(*) into mission_count from public.bw_player_story_missions where user_id=p_uid and claimed_at is not null;
  select coalesce(sum(reputation),0) into rep_total from public.bw_faction_reputation where user_id=p_uid;
  select coalesce(j.tier,0) into career_tier from public.bw_job_careers c join public.bw_job_positions j on j.id=c.position_id where c.user_id=p_uid;
  career_tier:=coalesce(career_tier,0);
  return s.level*25+s.crime_skill*10+s.respect+s.fights_won*25+mission_count*100+rep_total*2+career_tier*75;
end $$;

create or replace function public.bw_story_metric(p_uid uuid,p_type text,p_faction text) returns bigint
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; result bigint:=0;
begin
  select * into s from public.bw_player_states where user_id=p_uid;
  result:=case p_type
    when 'crimes' then s.crimes_completed
    when 'wins' then s.fights_won
    when 'respect' then s.respect
    when 'level' then s.level
    when 'standing' then public.bw_standing_score(p_uid)
    when 'career_shifts' then (select count(*) from public.bw_action_logs where user_id=p_uid and kind='job' and summary like 'Completed a shift%')
    when 'career_tier' then coalesce((select j.tier from public.bw_job_careers c join public.bw_job_positions j on j.id=c.position_id where c.user_id=p_uid),0)
    when 'family_member' then case when exists(select 1 from public.runner_crew_members where user_id=p_uid) then 1 else 0 end
    when 'assignments' then (select count(*) from public.bw_faction_assignment_runs r join public.bw_faction_assignments a on a.id=r.assignment_id where r.user_id=p_uid and r.success and a.faction_id=p_faction)
    when 'all_assignments' then (select count(*) from public.bw_faction_assignment_runs where user_id=p_uid and success)
    when 'faction_rep' then coalesce((select reputation from public.bw_faction_reputation where user_id=p_uid and faction_id=p_faction),0)
    else 0 end;
  return coalesce(result,0);
end $$;

create or replace function public.bw_progression_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; score bigint; current_rank text; next_rank text; next_score bigint; today_count integer; last_run timestamptz;
begin
  s:=public.bw_refresh_player(uid);
  insert into public.bw_progression_profiles(user_id) values(uid) on conflict do nothing;
  insert into public.bw_faction_reputation(user_id,faction_id) select uid,id from public.bw_factions on conflict do nothing;
  score:=public.bw_standing_score(uid);
  current_rank:=case when score>=10000 then 'City Power' when score>=6500 then 'Underboss' when score>=4000 then 'Captain' when score>=2500 then 'Made Member' when score>=1400 then 'Soldier' when score>=700 then 'Operator' when score>=250 then 'Associate' else 'New Arrival' end;
  next_score:=case when score<250 then 250 when score<700 then 700 when score<1400 then 1400 when score<2500 then 2500 when score<4000 then 4000 when score<6500 then 6500 when score<10000 then 10000 else score end;
  next_rank:=case when score<250 then 'Associate' when score<700 then 'Operator' when score<1400 then 'Soldier' when score<2500 then 'Made Member' when score<4000 then 'Captain' when score<6500 then 'Underboss' when score<10000 then 'City Power' else 'Maximum standing reached' end;
  select count(*),max(created_at) into today_count,last_run from public.bw_faction_assignment_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  return jsonb_build_object(
    'player',to_jsonb(s)||jsonb_build_object('cash',(select balance from public.player_wallets where user_id=uid)),
    'rank',jsonb_build_object('name',current_rank,'score',score,'nextName',next_rank,'nextScore',next_score),
    'breakdown',jsonb_build_object('level',s.level*25,'crime',s.crime_skill*10,'respect',s.respect,'combat',s.fights_won*25,'missions',(select count(*)*100 from public.bw_player_story_missions where user_id=uid and claimed_at is not null),'factions',coalesce((select sum(reputation)*2 from public.bw_faction_reputation where user_id=uid),0),'career',coalesce((select j.tier*75 from public.bw_job_careers c join public.bw_job_positions j on j.id=c.position_id where c.user_id=uid),0)),
    'combat',jsonb_build_object('wins',s.fights_won,'losses',s.fights_lost,'mastery',case when s.fights_won>=100 then 'Elite' when s.fights_won>=50 then 'Veteran' when s.fights_won>=20 then 'Enforcer' when s.fights_won>=5 then 'Scrapper' else 'Untested' end,'nextWins',case when s.fights_won<5 then 5 when s.fights_won<20 then 20 when s.fights_won<50 then 50 when s.fights_won<100 then 100 else s.fights_won end),
    'grind',jsonb_build_object('today',today_count,'lastRunAt',last_run,'fullEfficiencyRuns',20,'minimumEfficiency',35,'cooldownSeconds',20),
    'careerCreditReady',coalesce((select c.last_shift_at is not null and (p.last_career_credit_at is null or p.last_career_credit_at<c.last_shift_at) from public.bw_progression_profiles p left join public.bw_job_careers c on c.user_id=p.user_id where p.user_id=uid),false),
    'missions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'chapter',m.chapter,'sequence',m.sequence,'title',m.title,'briefing',m.briefing,'objective',m.objective,'target',m.objective_target,'progress',least(m.objective_target,public.bw_story_metric(uid,m.objective_type,m.objective_faction)),'unlocked',m.prerequisite_id is null or exists(select 1 from public.bw_player_story_missions q where q.user_id=uid and q.mission_id=m.prerequisite_id and q.claimed_at is not null),'claimedAt',pm.claimed_at,'cash',m.cash_reward,'xp',m.xp_reward,'merits',m.merit_reward,'respect',m.respect_reward,'factionId',m.objective_faction,'factionReward',m.faction_reward,'itemName',(select name from public.bw_items where id=m.reward_item_id)) order by m.chapter,m.sequence) from public.bw_story_missions m left join public.bw_player_story_missions pm on pm.user_id=uid and pm.mission_id=m.id),'[]'::jsonb),
    'factions',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'district',f.district,'description',f.description,'specialty',f.specialty,'reputation',r.reputation,'completed',r.assignments_completed,'standing',case when r.reputation>=1000 then 'Trusted' when r.reputation>=500 then 'Respected' when r.reputation>=200 then 'Known' when r.reputation>=75 then 'Accepted' else 'Unknown' end,'nextReputation',case when r.reputation<75 then 75 when r.reputation<200 then 200 when r.reputation<500 then 500 when r.reputation<1000 then 1000 else r.reputation end,'assignments',(select jsonb_agg(to_jsonb(a) order by a.sort_order) from public.bw_faction_assignments a where a.faction_id=f.id)) order by f.sort_order) from public.bw_factions f join public.bw_faction_reputation r on r.user_id=uid and r.faction_id=f.id),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select assignment_id,success,cash_reward,xp_reward,reputation_reward,efficiency,created_at from public.bw_faction_assignment_runs where user_id=uid order by created_at desc limit 12)x),'[]'::jsonb)
  );
end $$;

create or replace function public.bw_run_faction_assignment(p_assignment_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; a public.bw_faction_assignments; prior public.bw_faction_assignment_runs; rep integer; runs_today integer; efficiency numeric; chance numeric; won boolean; cash integer; gained_xp integer; gained_rep integer; last_time timestamptz;
begin
  select * into prior from public.bw_faction_assignment_runs where user_id=uid and request_id=p_request_id;
  if prior.id is not null then return jsonb_build_object('event',to_jsonb(prior)||jsonb_build_object('duplicate',true),'progression',public.bw_progression_snapshot()); end if;
  s:=public.bw_refresh_player(uid);
  if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if;
  select * into a from public.bw_faction_assignments where id=p_assignment_id;
  if a.id is null then raise exception 'assignment not found'; end if;
  if s.level<a.level_required then raise exception 'level % required',a.level_required; end if;
  select max(created_at) into last_time from public.bw_faction_assignment_runs where user_id=uid;
  if last_time>now()-interval '20 seconds' then raise exception 'your contact needs a few seconds before the next assignment'; end if;
  insert into public.bw_faction_reputation(user_id,faction_id) values(uid,a.faction_id) on conflict do nothing;
  select reputation into rep from public.bw_faction_reputation where user_id=uid and faction_id=a.faction_id for update;
  select count(*) into runs_today from public.bw_faction_assignment_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  efficiency:=greatest(.35,1-greatest(0,runs_today-19)*.025);
  chance:=least(96,a.base_chance+least(15,rep/50.0));
  won:=random()*100<chance;
  cash:=case when won then greatest(1,floor(a.cash_reward*efficiency)::integer) else greatest(25,floor(a.cash_reward*.08)::integer) end;
  gained_xp:=case when won then greatest(2,floor(a.xp_reward*efficiency)::integer) else 2 end;
  gained_rep:=case when won then greatest(1,floor(a.reputation_reward*efficiency)::integer) else 1 end;
  update public.player_wallets set balance=balance+cash,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_faction_reputation set reputation=reputation+gained_rep,assignments_completed=assignments_completed+(won::integer),updated_at=now() where user_id=uid and faction_id=a.faction_id;
  update public.bw_player_states set respect=respect+case when won then 2 else 0 end,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,gained_xp);
  insert into public.bw_faction_assignment_runs(user_id,assignment_id,request_id,success,cash_reward,xp_reward,reputation_reward,efficiency) values(uid,a.id,p_request_id,won,cash,gained_xp,gained_rep,efficiency);
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'faction',case when won then 'Completed ' else 'Attempted ' end||a.name,jsonb_build_object('faction',a.faction_id,'success',won,'cash',cash,'xp',gained_xp,'reputation',gained_rep));
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  return jsonb_build_object('event',jsonb_build_object('assignment',a.name,'factionId',a.faction_id,'success',won,'cash',cash,'xp',gained_xp,'reputation',gained_rep,'efficiency',efficiency,'chance',round(chance)),'progression',public.bw_progression_snapshot());
end $$;

create or replace function public.bw_claim_story_mission(p_mission_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); m public.bw_story_missions; progress bigint;
begin
  select * into m from public.bw_story_missions where id=p_mission_id;
  if m.id is null then raise exception 'story mission not found'; end if;
  if exists(select 1 from public.bw_player_story_missions where user_id=uid and mission_id=m.id and claimed_at is not null) then raise exception 'mission already claimed'; end if;
  if m.prerequisite_id is not null and not exists(select 1 from public.bw_player_story_missions where user_id=uid and mission_id=m.prerequisite_id and claimed_at is not null) then raise exception 'finish the previous chapter first'; end if;
  progress:=public.bw_story_metric(uid,m.objective_type,m.objective_faction);
  if progress<m.objective_target then raise exception 'mission objective is incomplete'; end if;
  insert into public.bw_player_story_missions(user_id,mission_id,claimed_at) values(uid,m.id,now()) on conflict(user_id,mission_id) do update set claimed_at=excluded.claimed_at;
  update public.player_wallets set balance=balance+m.cash_reward,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_player_states set merits=merits+m.merit_reward,respect=respect+m.respect_reward,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,m.xp_reward);
  if m.objective_faction is not null and m.faction_reward>0 then insert into public.bw_faction_reputation(user_id,faction_id,reputation) values(uid,m.objective_faction,m.faction_reward) on conflict(user_id,faction_id) do update set reputation=bw_faction_reputation.reputation+excluded.reputation,updated_at=now(); end if;
  if m.reward_item_id is not null then insert into public.bw_inventory(user_id,item_id,quantity,equipped) values(uid,m.reward_item_id,1,false) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1; end if;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'story','Completed '||m.title,jsonb_build_object('chapter',m.chapter,'cash',m.cash_reward,'xp',m.xp_reward));
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  return jsonb_build_object('event',jsonb_build_object('mission',m.title,'cash',m.cash_reward,'xp',m.xp_reward,'merits',m.merit_reward,'respect',m.respect_reward,'itemName',(select name from public.bw_items where id=m.reward_item_id)),'progression',public.bw_progression_snapshot());
end $$;

create or replace function public.bw_claim_career_influence() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); c public.bw_job_careers; p public.bw_progression_profiles; faction text;
begin
  select * into c from public.bw_job_careers where user_id=uid;
  if c.user_id is null or c.last_shift_at is null then raise exception 'complete a career shift first'; end if;
  insert into public.bw_progression_profiles(user_id) values(uid) on conflict do nothing;
  select * into p from public.bw_progression_profiles where user_id=uid for update;
  if p.last_career_credit_at is not null and p.last_career_credit_at>=c.last_shift_at then raise exception 'this shift influence was already claimed'; end if;
  faction:=case c.profession_id when 'docks' then 'harbor-union' when 'banking' then 'federal-trust' when 'medical' then 'northside-aid' else 'moretti-circle' end;
  insert into public.bw_faction_reputation(user_id,faction_id,reputation) values(uid,faction,8) on conflict(user_id,faction_id) do update set reputation=bw_faction_reputation.reputation+8,updated_at=now();
  update public.bw_player_states set respect=respect+3 where user_id=uid;
  update public.bw_progression_profiles set last_career_credit_at=c.last_shift_at,updated_at=now() where user_id=uid;
  return jsonb_build_object('event',jsonb_build_object('factionId',faction,'reputation',8,'respect',3),'progression',public.bw_progression_snapshot());
end $$;

create or replace function public.bw_job_resign() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); old_position text;
begin
  select j.name into old_position from public.bw_job_careers c join public.bw_job_positions j on j.id=c.position_id where c.user_id=uid for update;
  if old_position is null then raise exception 'you do not have a career to leave'; end if;
  delete from public.bw_job_careers where user_id=uid;
  update public.bw_job_interviews set status='abandoned',completed_at=now() where user_id=uid and status='open';
  insert into public.bw_action_logs(user_id,kind,summary) values(uid,'job','Resigned as '||old_position);
  return public.bw_job_snapshot();
end $$;

create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin return jsonb_build_object('city',public.bw_get_state(),'career',public.bw_job_snapshot(),'forex',public.bw_fx_snapshot('EUR/USD'),'loadout',public.bw_get_loadout(),'progression',public.bw_progression_snapshot(),'available_pages',array['home','crimes','hustles','combat','gym','work','missions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']); end $$;

revoke all on function public.bw_standing_score(uuid),public.bw_story_metric(uuid,text,text),public.bw_progression_snapshot(),public.bw_run_faction_assignment(text,uuid),public.bw_claim_story_mission(text),public.bw_claim_career_influence(),public.bw_job_resign() from public,anon;
grant execute on function public.bw_progression_snapshot(),public.bw_run_faction_assignment(text,uuid),public.bw_claim_story_mission(text),public.bw_claim_career_influence(),public.bw_job_resign() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_faction_reputation') then alter publication supabase_realtime add table public.bw_faction_reputation; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_player_story_missions') then alter publication supabase_realtime add table public.bw_player_story_missions; end if;
end $$;
