-- Blackwood City — Daily Life: server-authoritative check-ins and objectives.
-- Requires the city core, progression, operations, market and hustle migrations.

create table if not exists public.bw_daily_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak between 0 and 7),
  best_streak integer not null default 0 check (best_streak >= 0),
  total_claims integer not null default 0 check (total_claims >= 0),
  last_claim_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_daily_reward_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_date date not null,
  reward_step integer not null check (reward_step between 1 and 7),
  cash_reward bigint not null default 0,
  xp_reward integer not null default 0,
  energy_reward integer not null default 0,
  nerve_reward integer not null default 0,
  merit_reward integer not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, reward_date)
);

create table if not exists public.bw_daily_objective_templates (
  id text primary key,
  title text not null,
  description text not null,
  metric text not null,
  target integer not null check (target > 0),
  cash_reward bigint not null default 0,
  xp_reward integer not null default 0,
  merit_reward integer not null default 0,
  sort_order integer not null
);

insert into public.bw_daily_objective_templates(id,title,description,metric,target,cash_reward,xp_reward,merit_reward,sort_order) values
('crime-run','Make three clean scores','Complete successful crimes and let the city record the result.','crimes',3,600,20,0,1),
('city-shift','Clock one shift','Finish one available career shift at the Employment Office.','jobs',1,800,24,0,2),
('street-shift','Work the late shift','Complete two Street Work runs without spending energy.','hustles',2,500,20,0,3),
('sharpen-tools','Sharpen your tools','Train any stat twice at the Northside Athletic Club.','training',2,400,18,0,4),
('district-run','Move a district','Complete one District Operations dossier.','operations',1,850,28,1,5),
('faction-call','Answer a faction call','Complete one successful faction assignment.','factions',1,750,24,1,6),
('market-deal','Make a market move','Buy or sell one item through the Blackwood Exchange.','market',1,650,22,0,7)
on conflict(id) do update set title=excluded.title,description=excluded.description,metric=excluded.metric,target=excluded.target,cash_reward=excluded.cash_reward,xp_reward=excluded.xp_reward,merit_reward=excluded.merit_reward,sort_order=excluded.sort_order;

create table if not exists public.bw_daily_objective_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  objective_date date not null,
  objective_id text not null references public.bw_daily_objective_templates(id),
  claimed_at timestamptz not null default now(),
  primary key (user_id, objective_date, objective_id)
);

create table if not exists public.bw_weekly_objective_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.bw_daily_streaks enable row level security;
alter table public.bw_daily_reward_claims enable row level security;
alter table public.bw_daily_objective_templates enable row level security;
alter table public.bw_daily_objective_claims enable row level security;
alter table public.bw_weekly_objective_claims enable row level security;

drop policy if exists "authenticated read daily objective templates" on public.bw_daily_objective_templates;
create policy "authenticated read daily objective templates" on public.bw_daily_objective_templates for select to authenticated using (true);
drop policy if exists "users read own daily streak" on public.bw_daily_streaks;
create policy "users read own daily streak" on public.bw_daily_streaks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users read own daily reward claims" on public.bw_daily_reward_claims;
create policy "users read own daily reward claims" on public.bw_daily_reward_claims for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users read own daily objective claims" on public.bw_daily_objective_claims;
create policy "users read own daily objective claims" on public.bw_daily_objective_claims for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users read own weekly objective claims" on public.bw_weekly_objective_claims;
create policy "users read own weekly objective claims" on public.bw_weekly_objective_claims for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.bw_daily_streaks, public.bw_daily_reward_claims, public.bw_daily_objective_templates, public.bw_daily_objective_claims, public.bw_weekly_objective_claims from anon, authenticated;
grant select on public.bw_daily_objective_templates to authenticated;

create or replace function public.bw_daily_metric(p_uid uuid, p_metric text, p_since timestamptz)
returns integer
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result integer := 0;
begin
  case p_metric
    when 'crimes' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='crime' and created_at>=p_since and data->>'success'='true';
    when 'jobs' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='job' and created_at>=p_since and summary ilike 'Completed a shift%';
    when 'hustles' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='hustle' and created_at>=p_since and summary ilike 'Completed %';
    when 'training' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='training' and created_at>=p_since;
    when 'operations' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='operation' and created_at>=p_since and summary ilike 'Completed %';
    when 'factions' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='faction' and created_at>=p_since and summary ilike 'Completed %';
    when 'market' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='market' and created_at>=p_since;
    when 'weekly_actions' then
      select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and created_at>=p_since and kind in ('crime','job','hustle','training','operation','faction','market','combat','contract','relic','shop','equipment') and summary not ilike 'Started %';
    else result := 0;
  end case;
  return greatest(0,coalesce(result,0));
end $$;

create or replace function public.bw_daily_life_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  s public.bw_player_states;
  w public.player_wallets;
  today date := current_date;
  v_week_start date := date_trunc('week', now() at time zone 'utc')::date;
  streak public.bw_daily_streaks;
  current_day integer;
  claimed_today boolean;
  objective_ids text[];
  state jsonb;
begin
  s := public.bw_refresh_player(uid);
  w := public.ensure_exchange_wallet(uid);
  insert into public.bw_daily_streaks(user_id) values(uid) on conflict do nothing;
  select * into streak from public.bw_daily_streaks where user_id=uid;
  claimed_today := exists(select 1 from public.bw_daily_reward_claims where user_id=uid and reward_date=today);
  current_day := case when streak.last_claim_date=today-1 then case when streak.current_streak>=7 then 1 else streak.current_streak+1 end when streak.last_claim_date=today then streak.current_streak when streak.last_claim_date is null then 1 else 1 end;
  objective_ids := case mod(extract(doy from today)::integer,3) when 0 then array['crime-run','city-shift','street-shift'] when 1 then array['sharpen-tools','district-run','faction-call'] else array['crime-run','district-run','market-deal'] end;
  state := public.bw_get_state();
  return jsonb_build_object(
    'authority',true,
    'date',today,
    'player',state->'player',
    'claimedToday',claimed_today,
    'currentDay',current_day,
    'streak',jsonb_build_object('current',streak.current_streak,'best',streak.best_streak,'total',streak.total_claims,'lastClaimDate',streak.last_claim_date),
    'rewards',jsonb_build_array(
      jsonb_build_object('day',1,'cash',500,'xp',15,'energy',10,'nerve',1,'merits',0,'claimed',claimed_today and current_day>1),
      jsonb_build_object('day',2,'cash',750,'xp',20,'energy',15,'nerve',2,'merits',0,'claimed',claimed_today and current_day>2),
      jsonb_build_object('day',3,'cash',1000,'xp',30,'energy',20,'nerve',2,'merits',1,'claimed',claimed_today and current_day>3),
      jsonb_build_object('day',4,'cash',1250,'xp',35,'energy',25,'nerve',3,'merits',0,'claimed',claimed_today and current_day>4),
      jsonb_build_object('day',5,'cash',1500,'xp',45,'energy',30,'nerve',3,'merits',1,'claimed',claimed_today and current_day>5),
      jsonb_build_object('day',6,'cash',2000,'xp',60,'energy',40,'nerve',4,'merits',1,'claimed',claimed_today and current_day>6),
      jsonb_build_object('day',7,'cash',3000,'xp',90,'energy',50,'nerve',6,'merits',2,'claimed',claimed_today and current_day=7)
    ),
    'objectives',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'metric',t.metric,'target',t.target,'progress',least(t.target,public.bw_daily_metric(uid,t.metric,today::timestamptz)),'cash',t.cash_reward,'xp',t.xp_reward,'merits',t.merit_reward,'claimedAt',c.claimed_at) order by t.sort_order) from public.bw_daily_objective_templates t left join public.bw_daily_objective_claims c on c.user_id=uid and c.objective_date=today and c.objective_id=t.id where t.id=any(objective_ids)),'[]'::jsonb),
    'weekly',jsonb_build_object('weekStart',v_week_start,'target',10,'progress',least(10,public.bw_daily_metric(uid,'weekly_actions',v_week_start::timestamptz)),'cash',3000,'xp',80,'merits',1,'claimedAt',(select wc.claimed_at from public.bw_weekly_objective_claims wc where wc.user_id=uid and wc.week_start=v_week_start)),
    'resetNote','Rewards and daily objectives reset at midnight UTC.'
  );
end $$;

create or replace function public.bw_claim_daily_reward()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  today date := current_date;
  streak public.bw_daily_streaks;
  step integer;
  cash_reward bigint;
  xp_reward integer;
  energy_reward integer;
  nerve_reward integer;
  merit_reward integer;
begin
  perform public.bw_refresh_player(uid);
  insert into public.bw_daily_streaks(user_id) values(uid) on conflict do nothing;
  select * into streak from public.bw_daily_streaks where user_id=uid for update;
  if exists(select 1 from public.bw_daily_reward_claims where user_id=uid and reward_date=today) then
    return jsonb_build_object('event',jsonb_build_object('alreadyClaimed',true),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
  end if;
  step := case when streak.last_claim_date=today-1 then case when streak.current_streak>=7 then 1 else streak.current_streak+1 end else 1 end;
  cash_reward := case step when 1 then 500 when 2 then 750 when 3 then 1000 when 4 then 1250 when 5 then 1500 when 6 then 2000 else 3000 end;
  xp_reward := case step when 1 then 15 when 2 then 20 when 3 then 30 when 4 then 35 when 5 then 45 when 6 then 60 else 90 end;
  energy_reward := case step when 1 then 10 when 2 then 15 when 3 then 20 when 4 then 25 when 5 then 30 when 6 then 40 else 50 end;
  nerve_reward := case step when 1 then 1 when 2 then 2 when 3 then 2 when 4 then 3 when 5 then 3 when 6 then 4 else 6 end;
  merit_reward := case when step in(3,5,6) then 1 when step=7 then 2 else 0 end;
  insert into public.bw_daily_reward_claims(user_id,reward_date,reward_step,cash_reward,xp_reward,energy_reward,nerve_reward,merit_reward) values(uid,today,step,cash_reward,xp_reward,energy_reward,nerve_reward,merit_reward);
  update public.player_wallets set balance=balance+cash_reward,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_player_states set energy=least(max_energy,energy+energy_reward),nerve=least(max_nerve,nerve+nerve_reward),merits=merits+merit_reward,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,xp_reward);
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  update public.bw_daily_streaks set current_streak=step,best_streak=greatest(best_streak,step),total_claims=total_claims+1,last_claim_date=today,updated_at=now() where user_id=uid;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'daily','Claimed day '||step||' daily bonus',jsonb_build_object('day',step,'cash',cash_reward,'xp',xp_reward,'energy',energy_reward,'nerve',nerve_reward,'merits',merit_reward));
  return jsonb_build_object('event',jsonb_build_object('day',step,'cash',cash_reward,'xp',xp_reward),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_claim_daily_objective(p_objective_id text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  today date := current_date;
  objective public.bw_daily_objective_templates;
  progress integer;
begin
  select * into objective from public.bw_daily_objective_templates where id=p_objective_id;
  if objective.id is null then raise exception 'daily objective not found'; end if;
  if exists(select 1 from public.bw_daily_objective_claims where user_id=uid and objective_date=today and objective_id=objective.id) then
    raise exception 'objective already claimed';
  end if;
  progress := public.bw_daily_metric(uid,objective.metric,today::timestamptz);
  if progress<objective.target then raise exception 'objective is not complete'; end if;
  insert into public.bw_daily_objective_claims(user_id,objective_date,objective_id) values(uid,today,objective.id);
  update public.player_wallets set balance=balance+objective.cash_reward,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_player_states set merits=merits+objective.merit_reward,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,objective.xp_reward);
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'daily','Claimed objective: '||objective.title,jsonb_build_object('objective',objective.id,'cash',objective.cash_reward,'xp',objective.xp_reward,'merits',objective.merit_reward));
  return jsonb_build_object('event',jsonb_build_object('objective',objective.id,'cash',objective.cash_reward,'xp',objective.xp_reward),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_claim_weekly_objective()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); v_week_start date:=date_trunc('week',now() at time zone 'utc')::date; progress integer;
begin
  if exists(select 1 from public.bw_weekly_objective_claims wc where wc.user_id=uid and wc.week_start=v_week_start) then raise exception 'weekly objective already claimed'; end if;
  progress:=public.bw_daily_metric(uid,'weekly_actions',v_week_start::timestamptz);
  if progress<10 then raise exception 'weekly objective is not complete'; end if;
  insert into public.bw_weekly_objective_claims(user_id,week_start) values(uid,v_week_start);
  update public.player_wallets set balance=balance+3000,version=version+1,updated_at=now() where user_id=uid;
  update public.bw_player_states set merits=merits+1,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,80);
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'daily','Claimed weekly objective',jsonb_build_object('weekStart',v_week_start,'cash',3000,'xp',80,'merits',1));
  return jsonb_build_object('event',jsonb_build_object('cash',3000,'xp',80),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
end $$;

revoke all on function public.bw_daily_metric(uuid,text,timestamptz),public.bw_daily_life_snapshot(),public.bw_claim_daily_reward(),public.bw_claim_daily_objective(text),public.bw_claim_weekly_objective() from public,anon;
grant execute on function public.bw_daily_life_snapshot(),public.bw_claim_daily_reward(),public.bw_claim_daily_objective(text),public.bw_claim_weekly_objective() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_daily_streaks') then alter publication supabase_realtime add table public.bw_daily_streaks; end if;
end $$;

-- Keep the adviser aware of the same server-authoritative daily state shown in the UI.
create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),
    'career',public.bw_job_snapshot(),
    'forex',public.bw_fx_snapshot('EUR/USD'),
    'loadout',public.bw_get_loadout(),
    'progression',public.bw_progression_snapshot(),
    'operations',public.bw_operations_snapshot(),
    'daily',public.bw_daily_life_snapshot(),
    'available_pages',array['home','daily','crimes','hustles','operations','combat','gym','work','missions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']
  );
end $$;

revoke all on function public.bw_adviser_context() from public,anon;
grant execute on function public.bw_adviser_context() to authenticated;
