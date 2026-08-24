-- District One server-authoritative progression.
-- Apply after supabase/schema.sql. This migration is additive and keeps all
-- legacy save/armory RPCs available for older clients.

do $$
begin
  if to_regclass('public.player_armories') is null then
    raise exception 'Apply supabase/schema.sql before this migration (player_armories is missing)';
  end if;
end $$;

create table if not exists public.player_campaign_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  codename text not null,
  role text not null,
  district_one_state text not null default 'not_started',
  run_token uuid,
  run_stage smallint not null default 0,
  run_started_at timestamptz,
  stage_updated_at timestamptz,
  completed_at timestamptz,
  reward_claimed_at timestamptz,
  reward_receipt uuid,
  updated_at timestamptz not null default now(),
  constraint campaign_codename_format check (codename ~ '^[A-Za-z0-9_]{3,14}$'),
  constraint campaign_role_valid check (role in ('striker','guardian','technician','ghost','samurai','netrunner','fixer')),
  constraint district_one_state_valid check (district_one_state in ('not_started','active','completed','reward_claimed')),
  constraint district_one_stage_valid check (run_stage between 0 and 3)
);

create table if not exists public.campaign_reward_claims (
  receipt_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null,
  reward_key text not null,
  item_id text not null,
  reward_payload jsonb not null,
  claimed_at timestamptz not null default now(),
  unique (user_id, campaign_id, reward_key)
);

create index if not exists campaign_reward_claims_user_idx
  on public.campaign_reward_claims(user_id, claimed_at desc);

alter table public.player_campaign_progress enable row level security;
alter table public.campaign_reward_claims enable row level security;

drop policy if exists "users read own campaign progress" on public.player_campaign_progress;
drop policy if exists "users read own campaign rewards" on public.campaign_reward_claims;
create policy "users read own campaign progress"
  on public.player_campaign_progress for select to authenticated
  using (auth.uid() = user_id);
create policy "users read own campaign rewards"
  on public.campaign_reward_claims for select to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.player_campaign_progress from anon, authenticated;
revoke insert, update, delete on public.campaign_reward_claims from anon, authenticated;
grant select on public.player_campaign_progress to authenticated;
grant select on public.campaign_reward_claims to authenticated;

-- Signed provider claims are used instead of a client-supplied user id. This
-- accepts accounts whose primary provider is Google and linked Google accounts.
create or replace function public.require_google_player()
returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  primary_provider text;
  linked_providers jsonb;
begin
  if player_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  primary_provider := coalesce(claims #>> '{app_metadata,provider}', '');
  linked_providers := coalesce(claims #> '{app_metadata,providers}', '[]'::jsonb);
  if primary_provider <> 'google' and not (linked_providers ? 'google') then
    raise exception 'Google sign-in required' using errcode = '28000';
  end if;
  return player_id;
end;
$$;
revoke all on function public.require_google_player() from public, anon, authenticated;

create or replace function public.set_my_runner_identity(p_codename text, p_role text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := public.require_google_player();
  clean_name text := btrim(coalesce(p_codename, ''));
  clean_role text := lower(btrim(coalesce(p_role, '')));
  current_row public.player_campaign_progress;
begin
  if clean_name !~ '^[A-Za-z0-9_]{3,14}$' then
    raise exception 'codename must be 3-14 letters, numbers, or underscores';
  end if;
  if clean_role not in ('striker','guardian','technician','ghost','samurai','netrunner','fixer') then
    raise exception 'unsupported runner role';
  end if;

  select * into current_row from public.player_campaign_progress
    where user_id = player_id for update;
  if current_row.user_id is not null
     and current_row.run_stage > 0
     and current_row.role <> clean_role then
    raise exception 'runner role is locked after District One begins';
  end if;

  insert into public.player_campaign_progress(user_id, codename, role, updated_at)
  values (player_id, clean_name, clean_role, now())
  on conflict (user_id) do update
    set codename = excluded.codename,
        role = excluded.role,
        updated_at = now();

  -- Keep the public profile label aligned without trusting an arbitrary user id.
  update public.profiles set display_name = clean_name, last_seen_at = now()
    where id = player_id;

  return jsonb_build_object('codename', clean_name, 'role', clean_role);
end;
$$;

create or replace function public.get_my_campaign_progress()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := public.require_google_player();
  progress public.player_campaign_progress;
begin
  select * into progress from public.player_campaign_progress where user_id = player_id;
  if progress.user_id is null then return null; end if;
  return jsonb_build_object(
    'codename', progress.codename,
    'role', progress.role,
    'state', progress.district_one_state,
    'stage', progress.run_stage,
    'completedAt', progress.completed_at,
    'rewardClaimedAt', progress.reward_claimed_at,
    'receipt', progress.reward_receipt
  );
end;
$$;

create or replace function public.start_district_one()
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := public.require_google_player();
  progress public.player_campaign_progress;
  token uuid := gen_random_uuid();
begin
  select * into progress from public.player_campaign_progress
    where user_id = player_id for update;
  if progress.user_id is null then raise exception 'create a runner identity first'; end if;

  if progress.district_one_state in ('completed', 'reward_claimed') then
    return jsonb_build_object('state', progress.district_one_state, 'stage', progress.run_stage,
      'completedAt', progress.completed_at, 'rewardClaimedAt', progress.reward_claimed_at);
  end if;

  -- Network retries receive the existing token. Expired attempts may restart.
  if progress.district_one_state = 'active'
     and progress.run_started_at > now() - interval '30 minutes' then
    return jsonb_build_object('token', progress.run_token, 'state', 'active', 'stage', progress.run_stage);
  end if;

  update public.player_campaign_progress
    set district_one_state = 'active', run_token = token, run_stage = 0,
        run_started_at = now(), stage_updated_at = now(), completed_at = null,
        updated_at = now()
    where user_id = player_id;
  return jsonb_build_object('token', token, 'state', 'active', 'stage', 0);
end;
$$;

create or replace function public.advance_district_one(p_token uuid, p_checkpoint text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := public.require_google_player();
  progress public.player_campaign_progress;
  target_stage smallint;
  required_wait interval;
  checkpoint text := lower(btrim(coalesce(p_checkpoint, '')));
begin
  select * into progress from public.player_campaign_progress
    where user_id = player_id for update;
  target_stage := case checkpoint when 'arrival' then 1 when 'skirmish' then 2 when 'boss' then 3 else 0 end;
  if target_stage = 0 then raise exception 'unknown District One checkpoint'; end if;
  if progress.user_id is null then raise exception 'no active District One attempt'; end if;
  if progress.district_one_state = 'completed' and target_stage = 3
     and progress.run_token is not distinct from p_token then
    return jsonb_build_object('state', 'completed', 'stage', 3,
      'completedAt', progress.completed_at);
  end if;
  if progress.district_one_state <> 'active' then raise exception 'no active District One attempt'; end if;
  if progress.run_token is distinct from p_token then raise exception 'invalid District One token'; end if;
  if progress.run_started_at < now() - interval '30 minutes' then raise exception 'District One attempt expired'; end if;

  if target_stage <= progress.run_stage then
    return jsonb_build_object('state', progress.district_one_state, 'stage', progress.run_stage,
      'completedAt', progress.completed_at);
  end if;
  if target_stage <> progress.run_stage + 1 then raise exception 'District One checkpoint out of order'; end if;

  -- These are lower bounds, not encounter durations. The client still runs the
  -- full interactive stages, while the server rejects impossible instant skips.
  required_wait := case target_stage when 1 then interval '3 seconds'
    when 2 then interval '8 seconds' else interval '12 seconds' end;
  if progress.stage_updated_at > now() - required_wait then
    raise exception 'District One checkpoint completed too quickly';
  end if;

  update public.player_campaign_progress
    set run_stage = target_stage,
        stage_updated_at = now(),
        district_one_state = case when target_stage = 3 then 'completed' else 'active' end,
        completed_at = case when target_stage = 3 then now() else completed_at end,
        updated_at = now()
    where user_id = player_id;

  return jsonb_build_object('state', case when target_stage = 3 then 'completed' else 'active' end,
    'stage', target_stage, 'completedAt', case when target_stage = 3 then now() else null end);
end;
$$;

create or replace function public.claim_first_campaign_reward(p_token uuid, p_weapon_id text default null)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid := public.require_google_player();
  progress public.player_campaign_progress;
  armory public.player_armories;
  armory_state jsonb;
  reward_item text;
  receipt uuid := gen_random_uuid();
  payload jsonb;
  existing_claim public.campaign_reward_claims;
begin
  select * into progress from public.player_campaign_progress
    where user_id = player_id for update;
  if progress.user_id is null then raise exception 'runner identity not configured'; end if;

  -- Idempotent retries return the original receipt and never mint another item.
  if progress.reward_claimed_at is not null then
    select * into existing_claim from public.campaign_reward_claims
      where user_id = player_id and campaign_id = 'district-one' and reward_key = 'first-clear';
    return jsonb_build_object('alreadyClaimed', true, 'receipt', existing_claim.receipt_id,
      'reward', existing_claim.reward_payload);
  end if;

  if progress.district_one_state <> 'completed' or progress.run_stage <> 3 then
    raise exception 'District One is not complete';
  end if;
  if progress.run_token is distinct from p_token then raise exception 'invalid District One token'; end if;

  reward_item := coalesce(nullif(btrim(p_weapon_id), ''), case progress.role
    when 'guardian' then 'neon-sentinel:green:weapon'
    when 'technician' then 'ghost-protocol:green:weapon'
    when 'netrunner' then 'ghost-protocol:green:weapon'
    when 'fixer' then 'storm-circuit:green:weapon'
    else 'street-ronin:green:weapon'
  end);
  if reward_item not in ('street-ronin:green:weapon','neon-sentinel:green:weapon','ghost-protocol:green:weapon') then
    raise exception 'unsupported District One weapon';
  end if;

  armory := public.ensure_armory();
  select * into armory from public.player_armories where user_id = player_id for update;
  armory_state := armory.state;
  if not (coalesce(armory_state->'owned', '[]'::jsonb) ? reward_item) then
    armory_state := jsonb_set(armory_state, '{owned}',
      coalesce(armory_state->'owned', '[]'::jsonb) || to_jsonb(reward_item), true);
  end if;
  armory_state := jsonb_set(armory_state, '{equipped,weapon}', to_jsonb(reward_item), true);
  armory_state := jsonb_set(armory_state, '{shards}',
    to_jsonb(greatest(coalesce((armory_state->>'shards')::integer, 0), 12)), true);
  armory_state := jsonb_set(armory_state, '{tutorialStep}',
    to_jsonb(greatest(coalesce((armory_state->>'tutorialStep')::integer, 0), 2)), true);
  armory_state := jsonb_set(armory_state, '{history}',
    jsonb_build_array(jsonb_build_object('id', reward_item, 'duplicate', false,
      'source', 'district-one-first-clear', 'at', extract(epoch from now()) * 1000))
      || coalesce(armory_state->'history', '[]'::jsonb), true);

  payload := jsonb_build_object('itemId', reward_item, 'minimumShards', 12,
    'campaign', 'district-one', 'rewardKey', 'first-clear');

  update public.player_armories set state = armory_state, updated_at = now()
    where user_id = player_id;
  insert into public.campaign_reward_claims(receipt_id, user_id, campaign_id, reward_key, item_id, reward_payload)
    values (receipt, player_id, 'district-one', 'first-clear', reward_item, payload);
  update public.player_campaign_progress
    set district_one_state = 'reward_claimed', reward_claimed_at = now(),
        reward_receipt = receipt, run_token = null, updated_at = now()
    where user_id = player_id;

  return jsonb_build_object('alreadyClaimed', false, 'receipt', receipt,
    'reward', payload, 'armoryState', armory_state);
end;
$$;

revoke all on function public.set_my_runner_identity(text,text) from public, anon;
revoke all on function public.get_my_campaign_progress() from public, anon;
revoke all on function public.start_district_one() from public, anon;
revoke all on function public.advance_district_one(uuid,text) from public, anon;
revoke all on function public.claim_first_campaign_reward(uuid,text) from public, anon;
grant execute on function public.set_my_runner_identity(text,text) to authenticated;
grant execute on function public.get_my_campaign_progress() to authenticated;
grant execute on function public.start_district_one() to authenticated;
grant execute on function public.advance_district_one(uuid,text) to authenticated;
grant execute on function public.claim_first_campaign_reward(uuid,text) to authenticated;
