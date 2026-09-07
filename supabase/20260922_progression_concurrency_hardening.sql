-- Blackwood concurrency hardening for progression guardrails.
-- Apply after 20260921_progression_guardrails_arcade_games.sql.
--
-- The row triggers already reject the next run over each budget. This version
-- also serializes the count-and-insert decision per player/activity, so two
-- simultaneous RPC calls cannot both observe the same remaining slot.

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
  if uid is null then
    raise exception 'progression owner is required';
  end if;
  if track is null or track not in ('hustle','faction','operation','relic') then
    raise exception 'unsupported progression guardrail';
  end if;

  -- Advisory transaction locks are released automatically on commit/rollback.
  -- hashtextextended gives each player/activity pair a stable 64-bit key.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || track, 0));

  max_count := public.bw_progression_guardrail_limit(track);
  if max_count is null then
    raise exception 'unknown progression guardrail';
  end if;

  if track = 'hustle' then
    select count(*) into used_count
      from public.bw_hustle_runs
     where user_id = uid
       and created_at > now() - interval '24 hours';
  elsif track = 'faction' then
    select count(*) into used_count
      from public.bw_faction_assignment_runs
     where user_id = uid
       and created_at >= (now() at time zone 'utc')::date;
  elsif track = 'operation' then
    select count(*) into used_count
      from public.bw_district_operation_runs
     where user_id = uid
       and created_at >= (now() at time zone 'utc')::date;
  else
    select count(*) into used_count
      from public.bw_relic_searches
     where user_id = uid
       and created_at >= (now() at time zone 'utc')::date;
  end if;

  if used_count >= max_count then
    raise exception '% budget reached (% runs). Come back after the reset.', track, max_count;
  end if;
  return new;
end $$;

revoke all on function public.bw_enforce_progression_guardrail() from public,anon,authenticated;
