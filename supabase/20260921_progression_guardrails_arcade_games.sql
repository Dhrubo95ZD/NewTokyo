-- Blackwood progression guardrails + skill Arcade rooms.
-- Apply after 20260920_city_services.sql. Safe to run again.
--
-- Arcade Dollars remain a closed, play-only game wallet. The new conversion is
-- 100 Arcade Dollars = $50 ordinary in-game city cash. This is never real-money
-- value, cannot be purchased with city cash, and cannot be withdrawn.

-- ---------------------------------------------------------------------------
-- Arcade conversion (one-way, verified net wins only)
-- ---------------------------------------------------------------------------

create or replace function public.bw_redeem_arcade_winnings(
  p_credits bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp as $$
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
      'gameCashOnly', true,
      'redeemRate', 2,
      'cityCashPer100', 50,
      'conversionText', '100 Arcade Dollars = $50 city cash'
    );
  end if;

  perform public.bw_ensure_ledger(uid);
  select * into wallet from public.bw_ledger_wallets where user_id = uid for update;
  if wallet.arcade_winnings < p_credits then
    raise exception 'not enough redeemable Arcade Dollars';
  end if;
  if wallet.balance < p_credits then
    raise exception 'play more Arcade rounds before redeeming these winnings';
  end if;

  -- p_credits is always a whole 100-credit block, so this is exact integer math.
  cash_awarded := (p_credits / 100) * 50;

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
          jsonb_build_object('credits', p_credits, 'cash', cash_awarded,
            'rate', '100:50', 'cashValue', false));

  return jsonb_build_object(
    'balance', wallet.balance,
    'redeemable', wallet.arcade_winnings,
    'cashBalance', cash_balance,
    'cashAwarded', cash_awarded,
    'currency', 'LC',
    'currencyName', 'Arcade Dollars',
    'displaySymbol', '$',
    'cashValue', false,
    'gameCashOnly', true,
    'redeemRate', 2,
    'cityCashPer100', 50,
    'conversionText', '100 Arcade Dollars = $50 city cash'
  );
end $$;

create or replace function public.bw_casino_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp as $$
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
    'redeemRate', 2,
    'cityCashPer100', 50,
    'conversionText', '100 Arcade Dollars = $50 city cash',
    'minigames', jsonb_build_array(
      jsonb_build_object('id','signal_lock','name','Signal Lock','entry',100,'winPayout',200,'dailyAttempts',8),
      jsonb_build_object('id','courier_grid','name','Courier Grid','entry',100,'winPayout',300,'dailyAttempts',8)
    ),
    'blackjack', public.bw_blackjack_view(uid)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Finite, visible budgets for repeatable no-energy systems
-- ---------------------------------------------------------------------------

create table if not exists public.bw_progression_guardrails (
  track text primary key,
  window_name text not null,
  limit_count integer not null check (limit_count > 0),
  description text not null
);
insert into public.bw_progression_guardrails(track,window_name,limit_count,description) values
  ('hustle','rolling 24 hours',240,'Street Work keeps a generous daily budget while preventing unattended automation.'),
  ('faction','UTC day',72,'Faction assignments remain repeatable, but standing cannot be rushed indefinitely.'),
  ('operation','UTC day',20,'District operations retain their first-ten full-efficiency loop and then stop for the day.'),
  ('relic','UTC day',180,'Relic searches remain a regular activity without turning rare loot into an unattended farm.'),
  ('arcade_skill','UTC day',8,'Each skill room allows eight server-checked attempts per day.')
on conflict(track) do update set window_name=excluded.window_name,limit_count=excluded.limit_count,description=excluded.description;

alter table public.bw_progression_guardrails enable row level security;
drop policy if exists "authenticated read progression guardrails" on public.bw_progression_guardrails;
create policy "authenticated read progression guardrails" on public.bw_progression_guardrails
  for select to authenticated using (true);
revoke insert, update, delete on public.bw_progression_guardrails from anon, authenticated;
grant select on public.bw_progression_guardrails to authenticated;

create or replace function public.bw_progression_guardrail_limit(p_track text)
returns integer
language sql
stable
security definer
set search_path = public,pg_temp as $$
  select limit_count from public.bw_progression_guardrails where track = p_track
$$;
revoke all on function public.bw_progression_guardrail_limit(text) from public, anon, authenticated;

-- Triggers are deliberately placed on the server-owned reward ledgers. They
-- protect every existing RPC, including retries and clients that skip the UI.
create or replace function public.bw_enforce_progression_guardrail()
returns trigger
language plpgsql
security definer
set search_path = public,pg_temp as $$
declare
  used_count integer;
  max_count integer;
  track text := tg_argv[0];
  uid uuid := new.user_id;
begin
  max_count := public.bw_progression_guardrail_limit(track);
  if max_count is null then raise exception 'unknown progression guardrail'; end if;

  if track = 'hustle' then
    select count(*) into used_count from public.bw_hustle_runs
     where user_id = uid and created_at > now() - interval '24 hours';
  elsif track = 'faction' then
    select count(*) into used_count from public.bw_faction_assignment_runs
     where user_id = uid and created_at >= (now() at time zone 'utc')::date;
  elsif track = 'operation' then
    select count(*) into used_count from public.bw_district_operation_runs
     where user_id = uid and created_at >= (now() at time zone 'utc')::date;
  elsif track = 'relic' then
    select count(*) into used_count from public.bw_relic_searches
     where user_id = uid and created_at >= (now() at time zone 'utc')::date;
  else
    raise exception 'unsupported progression guardrail';
  end if;

  if used_count >= max_count then
    raise exception '% budget reached (% runs). Come back after the reset.', track, max_count;
  end if;
  return new;
end $$;

drop trigger if exists bw_guard_hustle_budget on public.bw_hustle_runs;
create trigger bw_guard_hustle_budget before insert on public.bw_hustle_runs
for each row execute function public.bw_enforce_progression_guardrail('hustle');
drop trigger if exists bw_guard_faction_budget on public.bw_faction_assignment_runs;
create trigger bw_guard_faction_budget before insert on public.bw_faction_assignment_runs
for each row execute function public.bw_enforce_progression_guardrail('faction');
drop trigger if exists bw_guard_operation_budget on public.bw_district_operation_runs;
create trigger bw_guard_operation_budget before insert on public.bw_district_operation_runs
for each row execute function public.bw_enforce_progression_guardrail('operation');
drop trigger if exists bw_guard_relic_budget on public.bw_relic_searches;
create trigger bw_guard_relic_budget before insert on public.bw_relic_searches
for each row execute function public.bw_enforce_progression_guardrail('relic');

-- A concurrent story-claim request used to be able to hit the ON CONFLICT
-- UPDATE branch after the first request committed and pay the reward twice.
create or replace function public.bw_guard_story_claim_write()
returns trigger
language plpgsql
security definer
set search_path = public,pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.claimed_at is not null and new.claimed_at is not null then
    raise exception 'mission already claimed';
  end if;
  return new;
end $$;
drop trigger if exists bw_guard_story_claim_write on public.bw_player_story_missions;
create trigger bw_guard_story_claim_write before update on public.bw_player_story_missions
for each row execute function public.bw_guard_story_claim_write();
revoke all on function public.bw_guard_story_claim_write() from public, anon, authenticated;

-- Do not hand a player an epic/legendary relic that is still outside the
-- account's level window. The old fallback selected the lowest item of a
-- rarity even when nothing in that rarity was eligible.
create or replace function public.bw_award_relic(p_uid uuid,p_rarity text)
returns text
language plpgsql
security definer
set search_path=public,pg_temp as $$
declare
  found text;
  player_level integer;
begin
  select level into player_level from public.bw_player_states where user_id=p_uid;
  select id into found from public.bw_items
   where drop_only and rarity=p_rarity and level_required <= coalesce(player_level + 12, 12)
   order by random() limit 1;
  if found is null then return null; end if;
  insert into public.bw_inventory(user_id,item_id,quantity,equipped)
  values(p_uid,found,1,false)
  on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1;
  return found;
end $$;
revoke all on function public.bw_award_relic(uuid,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-issued Arcade skill challenges
-- ---------------------------------------------------------------------------

alter table public.bw_casino_rounds drop constraint if exists bw_casino_rounds_game_check;
alter table public.bw_casino_rounds add constraint bw_casino_rounds_game_check
  check(game in('blackjack','slots','roulette','signal_lock','courier_grid'));

create table if not exists public.bw_arcade_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check(game in('signal_lock','courier_grid')),
  entry bigint not null default 100 check(entry = 100),
  answer text not null,
  prompt jsonb not null,
  request_id uuid not null,
  status text not null default 'open' check(status in('open','won','lost','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 seconds',
  completed_at timestamptz,
  unique(user_id,request_id)
);
create unique index if not exists bw_arcade_open_challenge_idx
  on public.bw_arcade_challenges(user_id) where status='open';
alter table public.bw_arcade_challenges enable row level security;
drop policy if exists "users read own arcade challenges" on public.bw_arcade_challenges;
create policy "users read own arcade challenges" on public.bw_arcade_challenges
  for select to authenticated using(auth.uid()=user_id);
revoke insert, update, delete on public.bw_arcade_challenges from anon, authenticated;
grant select on public.bw_arcade_challenges to authenticated;

create or replace function public.bw_arcade_challenge_view(p_challenge public.bw_arcade_challenges)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'id', p_challenge.id,
    'game', p_challenge.game,
    'entry', p_challenge.entry,
    'prompt', p_challenge.prompt,
    'expiresAt', p_challenge.expires_at
  )
$$;
revoke all on function public.bw_arcade_challenge_view(public.bw_arcade_challenges) from public, anon, authenticated;

create or replace function public.bw_arcade_minigame_start(p_game text,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  existing public.bw_arcade_challenges;
  open_challenge public.bw_arcade_challenges;
  today_attempts integer;
  answer text;
  prompt jsonb;
begin
  if p_game not in ('signal_lock','courier_grid') then raise exception 'unknown Arcade room'; end if;
  if p_request_id is null then raise exception 'request id is required'; end if;

  select * into existing from public.bw_arcade_challenges
   where user_id=uid and request_id=p_request_id;
  if existing.id is not null then
    return public.bw_casino_snapshot() || jsonb_build_object('challenge',public.bw_arcade_challenge_view(existing));
  end if;

  select * into open_challenge from public.bw_arcade_challenges
   where user_id=uid and status='open' order by created_at desc limit 1 for update;
  if open_challenge.id is not null then
    if open_challenge.expires_at <= now() then
      update public.bw_arcade_challenges set status='expired',completed_at=now() where id=open_challenge.id;
    else
      raise exception 'finish your open Arcade challenge first';
    end if;
  end if;

  select count(*) into today_attempts from public.bw_arcade_challenges
   where user_id=uid and created_at >= (now() at time zone 'utc')::date;
  if today_attempts >= public.bw_progression_guardrail_limit('arcade_skill') then
    raise exception 'Arcade skill budget reached (8 attempts). Come back after the reset.';
  end if;

  if p_game='signal_lock' then
    answer := (array['A','B','C','D','E','F'])[1+floor(random()*6)::integer] || '-' ||
      (array['A','B','C','D','E','F'])[1+floor(random()*6)::integer] || '-' ||
      (array['A','B','C','D','E','F'])[1+floor(random()*6)::integer] || '-' ||
      (array['A','B','C','D','E','F'])[1+floor(random()*6)::integer];
    prompt := jsonb_build_object('kind','sequence','title','Signal Lock','instruction','Memorise the four signals, then repeat them in order.','symbols',string_to_array(answer,'-'));
  else
    answer := (array['1,5,9','3,5,7','1,2,5','9,8,5','2,6,8'])[1+floor(random()*5)::integer];
    prompt := jsonb_build_object('kind','grid','title','Courier Grid','instruction','Memorise the route, then tap the cells in order.','cells',string_to_array(answer,','),'rows',3,'cols',3);
  end if;

  insert into public.bw_arcade_challenges(user_id,game,answer,prompt,request_id)
  values(uid,p_game,answer,prompt,p_request_id)
  returning * into existing;
  return public.bw_casino_snapshot() || jsonb_build_object('challenge',public.bw_arcade_challenge_view(existing));
end $$;

create or replace function public.bw_arcade_minigame_submit(p_challenge_id uuid,p_answer text,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp as $$
declare
  uid uuid := public.bw_uid();
  challenge public.bw_arcade_challenges;
  won boolean;
  payout bigint := 0;
  balance_now bigint;
  snapshot jsonb;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  select * into challenge from public.bw_arcade_challenges
   where id=p_challenge_id and user_id=uid for update;
  if challenge.id is null then raise exception 'Arcade challenge not found'; end if;
  if challenge.status <> 'open' then
    return public.bw_casino_snapshot() || jsonb_build_object('event',jsonb_build_object('duplicate',true,'status',challenge.status));
  end if;
  if challenge.expires_at <= now() then
    update public.bw_arcade_challenges set status='expired',completed_at=now() where id=challenge.id;
    return public.bw_casino_snapshot() || jsonb_build_object('event',jsonb_build_object('success',false,'expired',true,'game',challenge.game));
  end if;

  perform public.bw_casino_debit(uid,challenge.entry);
  won := lower(trim(coalesce(p_answer,''))) = lower(challenge.answer);
  if won then
    payout := case challenge.game when 'signal_lock' then 200 else 300 end;
    perform public.bw_casino_credit(uid,payout);
  end if;
  update public.bw_arcade_challenges set status=case when won then 'won' else 'lost' end,completed_at=now() where id=challenge.id;
  insert into public.bw_casino_rounds(user_id,game,request_id,bet,payout,outcome)
  values(uid,challenge.game,p_request_id,challenge.entry,payout,
    jsonb_build_object('success',won,'game',challenge.game,'payout',payout));
  select balance into balance_now from public.bw_ledger_wallets where user_id=uid;
  snapshot := public.bw_casino_snapshot();
  return snapshot || jsonb_build_object('event',jsonb_build_object(
    'success',won,'game',challenge.game,'payout',payout,
    'message',case when won then 'Clean run. The room pays your Arcade Dollars.' else 'The route breaks. Study the pattern and try again tomorrow.' end
  ));
end $$;

revoke all on function public.bw_arcade_minigame_start(text,uuid),public.bw_arcade_minigame_submit(uuid,text,uuid) from public,anon;
grant execute on function public.bw_arcade_minigame_start(text,uuid),public.bw_arcade_minigame_submit(uuid,text,uuid) to authenticated;

-- Keep the adviser and client-facing metadata aligned with the new rooms.
create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),
    'career',public.bw_job_snapshot(),
    'forex',public.bw_fx_snapshot('EUR/USD'),
    'loadout',public.bw_get_loadout(),
    'progression',public.bw_progression_snapshot(),
    'operations',public.bw_operations_snapshot(),
    'arcade',public.bw_casino_snapshot(),
    'available_pages',array['home','daily','crimes','hustles','operations','combat','gym','work','missions','factions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']
  );
end $$;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_arcade_challenges') then
    alter publication supabase_realtime add table public.bw_arcade_challenges;
  end if;
end $$;
