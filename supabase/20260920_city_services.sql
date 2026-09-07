-- Blackwood City Services + Arcade Dollar boundary.
-- Apply after 20260919_blackwood_takeover.sql. Safe to re-run.
--
-- City Services is lawful civic work: no interest, leverage, cash purchase of arcade
-- currency, or chance-based rewards. The existing Arcade games remain unchanged.
-- Arcade Dollars are play-earned and separate from ordinary city cash. Only verified
-- net arcade winnings may be redeemed one-way into ordinary in-game cash.

-- ---------------------------------------------------------------------------
-- Wallet boundary
-- ---------------------------------------------------------------------------

alter table public.bw_ledger_wallets
  add column if not exists arcade_winnings bigint not null default 0 check (arcade_winnings >= 0);

create table if not exists public.bw_arcade_redemptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  credits bigint not null check (credits >= 100 and credits % 100 = 0),
  cash_awarded bigint not null check (cash_awarded > 0),
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);
alter table public.bw_arcade_redemptions enable row level security;
drop policy if exists "users read own arcade redemptions" on public.bw_arcade_redemptions;
create policy "users read own arcade redemptions" on public.bw_arcade_redemptions
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.bw_arcade_redemptions from anon, authenticated;
grant select on public.bw_arcade_redemptions to authenticated;

-- Record only net casino wins as redeemable. Stakes returned on a push are not
-- treated as winnings, and ordinary missions/jobs/Forex credits never become
-- redeemable arcade proceeds.
create or replace function public.bw_record_arcade_winnings()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare net_win bigint := greatest(0, new.payout - new.bet);
begin
  if net_win > 0 then
    perform public.bw_ensure_ledger(new.user_id);
    update public.bw_ledger_wallets
       set arcade_winnings = arcade_winnings + net_win,
           updated_at = now()
     where user_id = new.user_id;
  end if;
  return new;
end $$;

drop trigger if exists bw_arcade_winnings on public.bw_casino_rounds;
create trigger bw_arcade_winnings
after insert on public.bw_casino_rounds
for each row execute function public.bw_record_arcade_winnings();

create or replace function public.bw_redeem_arcade_winnings(
  p_credits bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  wallet public.bw_ledger_wallets;
  existing public.bw_arcade_redemptions;
  cash_awarded bigint;
  cash_balance bigint;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_credits < 100 or p_credits % 100 <> 0 then
    raise exception 'redeem Arcade Dollars in whole 100-credit blocks';
  end if;

  select * into existing
    from public.bw_arcade_redemptions
   where user_id = uid and request_id = p_request_id;
  if existing.id is not null then
    select balance into cash_balance from public.player_wallets where user_id = uid;
    select * into wallet from public.bw_ledger_wallets where user_id = uid;
    return jsonb_build_object(
      'balance', wallet.balance,
      'redeemable', wallet.arcade_winnings,
      'cashBalance', cash_balance,
      'currency', 'LC',
      'currencyName', 'Arcade Dollars',
      'displaySymbol', '$',
      'cashValue', false,
      'gameCashOnly', true
    );
  end if;

  wallet := public.bw_ensure_ledger(uid);
  if wallet.arcade_winnings < p_credits then
    raise exception 'not enough redeemable Arcade Dollars';
  end if;
  cash_awarded := p_credits / 100;

  perform public.ensure_exchange_wallet(uid);
  update public.bw_ledger_wallets
     set balance = balance - p_credits,
         arcade_winnings = arcade_winnings - p_credits,
         updated_at = now()
   where user_id = uid;
  update public.player_wallets
     set balance = balance + cash_awarded,
         version = version + 1,
         updated_at = now()
   where user_id = uid
   returning balance into cash_balance;
  insert into public.bw_arcade_redemptions(user_id, request_id, credits, cash_awarded)
  values (uid, p_request_id, p_credits, cash_awarded);
  perform public.mirror_wallet_to_save(uid, cash_balance);
  select * into wallet from public.bw_ledger_wallets where user_id = uid;

  insert into public.bw_action_logs(user_id, kind, summary, data)
  values (uid, 'arcade_redemption', 'Redeemed Arcade Dollars into city cash',
          jsonb_build_object('credits', p_credits, 'cash', cash_awarded, 'rate', '100:1'));

  return jsonb_build_object(
    'balance', wallet.balance,
    'redeemable', wallet.arcade_winnings,
    'cashBalance', cash_balance,
    'cashAwarded', cash_awarded,
    'currency', 'LC',
    'currencyName', 'Arcade Dollars',
    'displaySymbol', '$',
    'cashValue', false,
    'gameCashOnly', true
  );
end $$;

-- Keep the existing Arcade and broker APIs compatible while making the display
-- boundary explicit. There is intentionally no city-cash -> Arcade Dollar RPC.
create or replace function public.bw_casino_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  wallet public.bw_ledger_wallets;
begin
  wallet := public.bw_ensure_ledger(uid);
  return jsonb_build_object(
    'balance', wallet.balance,
    'currency', 'LC',
    'currencyName', 'Arcade Dollars',
    'displaySymbol', '$',
    'purchasable', false,
    'cashValue', false,
    'gameCashOnly', true,
    'redeemable', wallet.arcade_winnings,
    'redeemRate', 100,
    'blackjack', public.bw_blackjack_view(uid)
  );
end $$;

-- Job rewards are ordinary city cash, not Arcade Dollars. This closes the
-- wallet overlap introduced when the old casino credit helper was repurposed.
create or replace function public.bw_cash_credit(p_uid uuid, p_amount bigint)
returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare balance_now bigint;
begin
  perform public.ensure_exchange_wallet(p_uid);
  update public.player_wallets
     set balance = balance + greatest(0, p_amount),
         version = version + 1,
         updated_at = now()
   where user_id = p_uid
   returning balance into balance_now;
  perform public.mirror_wallet_to_save(p_uid, balance_now);
  return balance_now;
end $$;

create or replace function public.bw_job_work()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  c public.bw_job_careers;
  j public.bw_job_positions;
begin
  select * into c from public.bw_job_careers where user_id = uid for update;
  if c.user_id is null then raise exception 'you are not employed'; end if;
  if c.last_shift_at > now() - interval '20 hours' then raise exception 'next shift is not ready'; end if;
  select * into j from public.bw_job_positions where id = c.position_id;
  update public.bw_job_careers
     set job_points = job_points + j.point_gain, last_shift_at = now()
   where user_id = uid;
  update public.bw_player_states
     set manual = manual + j.manual_gain,
         intelligence = intelligence + j.intelligence_gain,
         endurance = endurance + j.endurance_gain,
         last_work_at = now()
   where user_id = uid;
  perform public.bw_cash_credit(uid, j.daily_pay);
  insert into public.bw_action_logs(user_id, kind, summary)
  values (uid, 'job', 'Completed a shift as ' || j.name);
  return public.bw_job_snapshot();
end $$;

create or replace function public.bw_job_special()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  c public.bw_job_careers;
begin
  select * into c from public.bw_job_careers where user_id = uid for update;
  if c.user_id is null then raise exception 'you are not employed'; end if;
  if c.last_special_at > now() - interval '24 hours' then raise exception 'special is still on cooldown'; end if;
  if c.profession_id = 'casino' then
    perform public.bw_cash_credit(uid, 1200);
  elsif c.profession_id = 'education' then
    update public.bw_player_states set intelligence = intelligence + 3 where user_id = uid;
  elsif c.profession_id = 'law' then
    update public.bw_player_states set status = 'okay', status_until = null where user_id = uid and status = 'jail';
  else
    insert into public.bw_inventory(user_id, item_id, quantity)
    values (uid, case when c.profession_id = 'medical' then 'first-aid' else 'first-aid' end, 1)
    on conflict(user_id, item_id) do update set quantity = bw_inventory.quantity + 1;
  end if;
  update public.bw_job_careers set last_special_at = now() where user_id = uid;
  return public.bw_job_snapshot();
end $$;

-- ---------------------------------------------------------------------------
-- Civic contracts and Community Fund
-- ---------------------------------------------------------------------------

create table if not exists public.bw_civic_contracts (
  id text primary key,
  district_id text not null references public.bw_operation_districts(id),
  category text not null,
  title text not null,
  summary text not null,
  icon text not null default '◆',
  reward_cash bigint not null check (reward_cash > 0),
  reward_xp integer not null check (reward_xp > 0),
  reward_respect integer not null check (reward_respect > 0),
  sort_order integer not null,
  active boolean not null default true
);
insert into public.bw_civic_contracts
  (id, district_id, category, title, summary, icon, reward_cash, reward_xp, reward_respect, sort_order)
values
  ('clinic-supplies','northside','Health','Clinic supply run','Deliver sealed medical supplies to St. Mercy before the next ward change.','+','$650',20,3,1),
  ('archive-restoration','old-quarter','Records','Restore an archive room','Move public records out of a damaged room and preserve the city history.','▤',550,22,4,2),
  ('harbor-manifest','harbor','Logistics','Verify the harbor manifest','Reconcile a public shipment record with the dock ledger.','◇',700,24,4,3),
  ('railway-repair','railway','Repair','Coordinate a repair crew','Keep a service route open for families and workers in the Railway Quarter.','⚙',800,28,5,4),
  ('financial-courier','financial','Courier','Secure a records transfer','Carry a sealed city record between Federal Trust offices with a clean receipt.','✉',900,31,5,5),
  ('neighborhood-repair','southside','Repair','Repair a community workshop','Return a shared workshop to safe working order.','⌂',750,26,4,6)
on conflict(id) do update set
  district_id = excluded.district_id,
  category = excluded.category,
  title = excluded.title,
  summary = excluded.summary,
  icon = excluded.icon,
  reward_cash = excluded.reward_cash,
  reward_xp = excluded.reward_xp,
  reward_respect = excluded.reward_respect,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- Correct the one text literal above for PostgreSQL integer typing on re-runs.
update public.bw_civic_contracts set reward_cash = 650 where id = 'clinic-supplies';

create table if not exists public.bw_civic_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_id text not null references public.bw_civic_contracts(id),
  request_id uuid not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'active' check (status in ('active','completed','expired')),
  unique(user_id, request_id)
);
create unique index if not exists bw_civic_one_active_run
  on public.bw_civic_runs(user_id) where status = 'active';
alter table public.bw_civic_runs enable row level security;
drop policy if exists "users read own civic runs" on public.bw_civic_runs;
create policy "users read own civic runs" on public.bw_civic_runs
  for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.bw_civic_runs from anon, authenticated;
grant select on public.bw_civic_runs to authenticated;

create table if not exists public.bw_civic_projects (
  id text primary key,
  name text not null,
  description text not null,
  target bigint not null check (target > 0),
  sort_order integer not null,
  active boolean not null default true
);
insert into public.bw_civic_projects(id,name,description,target,sort_order)
values
  ('clinic-renovation','St. Mercy clinic wing','Fund equipment and repairs for the community clinic.',25000,1),
  ('archive-preservation','Chronicle preservation','Protect public records and restore the city archive.',30000,2),
  ('harbor-safety','Harbor safety works','Improve safe lighting and marked routes around the docks.',35000,3)
on conflict(id) do update set name=excluded.name,description=excluded.description,target=excluded.target,sort_order=excluded.sort_order,active=true;

create table if not exists public.bw_civic_donations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.bw_civic_projects(id),
  request_id uuid not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);
alter table public.bw_civic_projects enable row level security;
alter table public.bw_civic_donations enable row level security;
drop policy if exists "authenticated read civic projects" on public.bw_civic_projects;
create policy "authenticated read civic projects" on public.bw_civic_projects for select to authenticated using (active);
drop policy if exists "users read own civic donations" on public.bw_civic_donations;
create policy "users read own civic donations" on public.bw_civic_donations for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.bw_civic_projects, public.bw_civic_donations from anon, authenticated;
grant select on public.bw_civic_projects, public.bw_civic_donations to authenticated;

create or replace function public.bw_civic_services_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  cash_balance bigint;
begin
  perform public.bw_ensure_player(uid);
  perform public.ensure_exchange_wallet(uid);
  select balance into cash_balance from public.player_wallets where user_id = uid;
  return jsonb_build_object(
    'authority', true,
    'cashBalance', cash_balance,
    'contracts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'district', c.district_id,
        'category', c.category,
        'title', c.title,
        'summary', c.summary,
        'icon', c.icon,
        'rewardCash', c.reward_cash,
        'rewardXp', c.reward_xp,
        'rewardRespect', c.reward_respect,
        'available', not exists(select 1 from public.bw_civic_runs r where r.user_id = uid and r.status = 'active')
      ) order by c.sort_order)
      from public.bw_civic_contracts c where c.active
    ), '[]'::jsonb),
    'active', (
      select jsonb_build_object(
        'id', r.id,
        'requestId', r.request_id,
        'contractId', r.contract_id,
        'district', c.district_id,
        'category', c.category,
        'title', c.title,
        'summary', c.summary,
        'startedAt', r.started_at
      )
      from public.bw_civic_runs r
      join public.bw_civic_contracts c on c.id = r.contract_id
      where r.user_id = uid and r.status = 'active'
      order by r.started_at desc
      limit 1
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'target', p.target,
        'total', coalesce((select sum(d.amount) from public.bw_civic_donations d where d.project_id = p.id), 0),
        'complete', coalesce((select sum(d.amount) from public.bw_civic_donations d where d.project_id = p.id), 0) >= p.target
      ) order by p.sort_order)
      from public.bw_civic_projects p where p.active
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.bw_civic_contract_start(
  p_contract_id text,
  p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  contract_row public.bw_civic_contracts;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  select * into contract_row from public.bw_civic_contracts where id = p_contract_id and active;
  if contract_row.id is null then raise exception 'civic contract not found'; end if;
  if exists(select 1 from public.bw_civic_runs where user_id = uid and request_id = p_request_id) then
    return public.bw_civic_services_snapshot();
  end if;
  if exists(select 1 from public.bw_civic_runs where user_id = uid and status = 'active') then
    raise exception 'finish your active civic contract first';
  end if;
  insert into public.bw_civic_runs(user_id, contract_id, request_id)
  values (uid, p_contract_id, p_request_id);
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values (uid, 'civic_contract', 'Started ' || contract_row.title,
          jsonb_build_object('contract', p_contract_id, 'district', contract_row.district_id));
  return public.bw_civic_services_snapshot();
end $$;

create or replace function public.bw_civic_contract_complete(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  run_row public.bw_civic_runs;
  contract_row public.bw_civic_contracts;
  season public.bw_takeover_seasons;
  pledged text;
  cash_balance bigint;
  points integer;
  event jsonb;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  select * into run_row from public.bw_civic_runs where user_id = uid and request_id = p_request_id for update;
  if run_row.id is null then raise exception 'civic contract not found'; end if;
  select * into contract_row from public.bw_civic_contracts where id = run_row.contract_id;
  if run_row.status = 'completed' then
    return jsonb_build_object('event', jsonb_build_object('success', true, 'alreadySettled', true),
      'services', public.bw_civic_services_snapshot(), 'state', public.bw_get_state());
  end if;
  if run_row.status <> 'active' then raise exception 'civic contract expired'; end if;
  if run_row.started_at > now() - interval '8 seconds' then raise exception 'the contract is still in progress'; end if;
  if run_row.started_at < now() - interval '30 minutes' then
    update public.bw_civic_runs set status = 'expired', completed_at = now() where id = run_row.id;
    raise exception 'civic contract expired';
  end if;

  perform public.ensure_exchange_wallet(uid);
  update public.player_wallets
     set balance = balance + contract_row.reward_cash,
         version = version + 1,
         updated_at = now()
   where user_id = uid
   returning balance into cash_balance;
  perform public.mirror_wallet_to_save(uid, cash_balance);
  perform public.bw_gain_xp(uid, contract_row.reward_xp);
  update public.bw_player_states
     set respect = respect + contract_row.reward_respect
   where user_id = uid;

  event := jsonb_build_object(
    'success', true,
    'cash', contract_row.reward_cash,
    'xp', contract_row.reward_xp,
    'respect', contract_row.reward_respect,
    'contractId', contract_row.id,
    'title', contract_row.title
  );
  update public.bw_civic_runs
     set status = 'completed', completed_at = now()
   where id = run_row.id;
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values (uid, 'civic_contract', 'Completed ' || contract_row.title, event);

  -- Civic work counts for the active Takeover only after it is completed.
  select * into season
    from public.bw_takeover_seasons
   where active and starts_at <= now() and ends_at > now()
   order by starts_at desc limit 1;
  if season.id is not null then
    select faction_id into pledged
      from public.bw_takeover_pledges
     where user_id = uid and season_id = season.id;
    if pledged is not null then
      points := greatest(1, contract_row.reward_xp / 4 + contract_row.reward_respect);
      insert into public.bw_takeover_contributions(user_id, season_id, faction_id, district_id, source, source_id, points)
      values (uid, season.id, pledged, contract_row.district_id, 'civic', run_row.id, points)
      on conflict(season_id, source, source_id) do nothing;
    end if;
  end if;

  return jsonb_build_object('event', event, 'services', public.bw_civic_services_snapshot(), 'state', public.bw_get_state());
end $$;

create or replace function public.bw_civic_donate(
  p_project_id text,
  p_amount bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  project_row public.bw_civic_projects;
  existing public.bw_civic_donations;
  balance_now bigint;
  current_total bigint;
  effective_amount bigint;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_amount < 1 or p_amount > 50000 then raise exception 'donation must be between $1 and $50,000'; end if;
  select * into project_row from public.bw_civic_projects where id = p_project_id and active for update;
  if project_row.id is null then raise exception 'community project not found'; end if;
  select * into existing from public.bw_civic_donations where user_id = uid and request_id = p_request_id;
  if existing.id is not null then
    return jsonb_build_object('donation', to_jsonb(existing), 'services', public.bw_civic_services_snapshot(), 'state', public.bw_get_state());
  end if;
  select coalesce(sum(amount), 0) into current_total from public.bw_civic_donations where project_id = p_project_id;
  if current_total >= project_row.target then raise exception 'community project is already complete'; end if;
  effective_amount := least(p_amount, project_row.target - current_total);
  perform public.ensure_exchange_wallet(uid);
  update public.player_wallets
     set balance = balance - effective_amount,
         version = version + 1,
         updated_at = now()
   where user_id = uid and balance >= effective_amount
   returning balance into balance_now;
  if balance_now is null then raise exception 'insufficient city cash'; end if;
  insert into public.bw_civic_donations(user_id, project_id, request_id, amount)
  values (uid, p_project_id, p_request_id, effective_amount);
  perform public.mirror_wallet_to_save(uid, balance_now);
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values (uid, 'civic_donation', 'Contributed to ' || project_row.name,
          jsonb_build_object('project', p_project_id, 'amount', effective_amount));
  return jsonb_build_object('donation', jsonb_build_object('project', p_project_id, 'amount', effective_amount),
    'services', public.bw_civic_services_snapshot(), 'state', public.bw_get_state());
end $$;

-- Allow the civic contribution source to feed the same Takeover ledger.
alter table public.bw_takeover_contributions drop constraint if exists bw_takeover_contributions_source_check;
alter table public.bw_takeover_contributions
  add constraint bw_takeover_contributions_source_check check (source in ('operation','faction','civic'));

revoke all on function
  public.bw_record_arcade_winnings(),
  public.bw_redeem_arcade_winnings(bigint,uuid),
  public.bw_civic_services_snapshot(),
  public.bw_civic_contract_start(text,uuid),
  public.bw_civic_contract_complete(uuid),
  public.bw_civic_donate(text,bigint,uuid),
  public.bw_cash_credit(uuid,bigint)
from public, anon, authenticated;

grant execute on function
  public.bw_casino_snapshot(),
  public.bw_redeem_arcade_winnings(bigint,uuid),
  public.bw_civic_services_snapshot(),
  public.bw_civic_contract_start(text,uuid),
  public.bw_civic_contract_complete(uuid),
  public.bw_civic_donate(text,bigint,uuid)
to authenticated;
