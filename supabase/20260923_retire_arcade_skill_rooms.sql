-- Retire the experimental Arcade skill rooms.
-- Apply after 20260922_progression_concurrency_hardening.sql.
--
-- Existing Blackjack, Slots and Roulette remain unchanged. Historical challenge
-- rows are retained for audit, but no client or server path can create or play
-- Signal Lock/Courier Grid after this migration.

update public.bw_arcade_challenges
   set status = 'expired',
       completed_at = coalesce(completed_at, now())
 where status = 'open';

delete from public.bw_progression_guardrails
 where track = 'arcade_skill';

-- Keep the old table for historical records, but remove player access and its
-- realtime publication. No new challenge can be started without these RPCs.
drop policy if exists "users read own arcade challenges" on public.bw_arcade_challenges;
revoke all on public.bw_arcade_challenges from public, anon, authenticated;

drop function if exists public.bw_arcade_minigame_submit(uuid, text, uuid);
drop function if exists public.bw_arcade_minigame_start(text, uuid);
drop function if exists public.bw_arcade_challenge_view(public.bw_arcade_challenges);

do $$
begin
  if exists(
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'bw_arcade_challenges'
  ) then
    alter publication supabase_realtime drop table public.bw_arcade_challenges;
  end if;
end $$;

-- Historical round rows keep their original game labels, but new inserts for
-- retired rooms are rejected even if a privileged maintenance path is used.
create or replace function public.bw_reject_retired_arcade_game()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp as $$
begin
  if new.game in ('signal_lock', 'courier_grid') then
    raise exception 'Arcade skill rooms are retired; use Blackjack, Slots, or Roulette';
  end if;
  return new;
end $$;

drop trigger if exists bw_reject_retired_arcade_game on public.bw_casino_rounds;
create trigger bw_reject_retired_arcade_game
before insert on public.bw_casino_rounds
for each row execute function public.bw_reject_retired_arcade_game();
revoke all on function public.bw_reject_retired_arcade_game() from public, anon, authenticated;

-- Return one canonical list of the three remaining Arcade rooms.
create or replace function public.bw_casino_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
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
    'rooms', jsonb_build_array(
      jsonb_build_object('id', 'blackjack', 'name', 'Blackjack'),
      jsonb_build_object('id', 'slots', 'name', 'Slots'),
      jsonb_build_object('id', 'roulette', 'name', 'Roulette')
    ),
    'minigames', '[]'::jsonb,
    'blackjack', public.bw_blackjack_view(uid)
  );
end $$;
