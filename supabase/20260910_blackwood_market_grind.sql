-- Blackwood Market and unlimited street-hustle progression.
-- Apply after 20260909_live_floating_pnl.sql. Safe to run again.

create table if not exists public.bw_market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.bw_items(id),
  quantity integer not null check (quantity between 1 and 100),
  remaining integer not null check (remaining between 0 and 100),
  unit_price bigint not null check (unit_price > 0),
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_market_sales (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.bw_market_listings(id),
  seller_id uuid not null references auth.users(id),
  buyer_id uuid not null references auth.users(id),
  item_id text not null references public.bw_items(id),
  quantity integer not null check (quantity > 0),
  unit_price bigint not null check (unit_price > 0),
  fee bigint not null default 0 check (fee >= 0),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (buyer_id, request_id)
);

create table if not exists public.bw_hustle_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mastery integer not null default 0 check (mastery >= 0),
  heat numeric(6,2) not null default 0 check (heat between 0 and 100),
  total_runs integer not null default 0 check (total_runs >= 0),
  total_cash bigint not null default 0 check (total_cash >= 0),
  loot_found integer not null default 0 check (loot_found >= 0),
  last_action_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_hustle_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  hustle text not null check (hustle in ('dock_courier','backroom_cards','garage_parts','information')),
  cash_reward bigint not null check (cash_reward >= 0),
  xp_reward integer not null check (xp_reward >= 0),
  item_id text references public.bw_items(id),
  heat_after numeric(6,2) not null,
  reward_multiplier numeric(6,3) not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists bw_market_active_idx on public.bw_market_listings(status, item_id, unit_price, created_at);
create index if not exists bw_market_seller_idx on public.bw_market_listings(seller_id, created_at desc);
create index if not exists bw_market_sales_item_idx on public.bw_market_sales(item_id, created_at desc);
create index if not exists bw_hustle_runs_user_idx on public.bw_hustle_runs(user_id, created_at desc);

alter table public.bw_market_listings enable row level security;
alter table public.bw_market_sales enable row level security;
alter table public.bw_hustle_profiles enable row level security;
alter table public.bw_hustle_runs enable row level security;
revoke all on public.bw_market_listings, public.bw_market_sales, public.bw_hustle_profiles, public.bw_hustle_runs from anon, authenticated;

create or replace function public.bw_market_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  wallet public.player_wallets;
begin
  perform public.bw_ensure_player(uid);
  wallet := public.ensure_exchange_wallet(uid);
  return jsonb_build_object(
    'walletBalance', wallet.balance,
    'feePercent', 5,
    'listings', coalesce((
      select jsonb_agg(result.payload order by result.unit_price, result.created_at)
      from (
        select l.unit_price, l.created_at, jsonb_build_object(
          'id', l.id, 'sellerId', l.seller_id, 'sellerName', p.display_name,
          'itemId', l.item_id, 'name', i.name, 'kind', i.kind, 'slot', i.slot,
          'rarity', i.rarity, 'attack', i.attack, 'defense', i.defense,
          'speed', i.speed, 'dexterity', i.dexterity, 'levelRequired', i.level_required,
          'quantity', l.quantity, 'remaining', l.remaining, 'unitPrice', l.unit_price,
          'createdAt', l.created_at, 'expiresAt', l.expires_at, 'mine', l.seller_id = uid
        ) payload
        from public.bw_market_listings l
        join public.bw_items i on i.id = l.item_id
        join public.profiles p on p.id = l.seller_id
        where l.status = 'active' and l.remaining > 0 and l.expires_at > now()
        order by l.unit_price, l.created_at
        limit 150
      ) result
    ), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(result.payload order by result.created_at desc)
      from (
        select l.created_at, jsonb_build_object(
          'id', l.id, 'itemId', l.item_id, 'name', i.name, 'rarity', i.rarity,
          'quantity', l.quantity, 'remaining', l.remaining, 'unitPrice', l.unit_price,
          'status', l.status, 'createdAt', l.created_at, 'expiresAt', l.expires_at
        ) payload
        from public.bw_market_listings l
        join public.bw_items i on i.id = l.item_id
        where l.seller_id = uid
        order by l.created_at desc
        limit 60
      ) result
    ), '[]'::jsonb),
    'sellable', coalesce((
      select jsonb_agg(result.payload order by result.name)
      from (
        select i.name, jsonb_build_object(
          'itemId', v.item_id, 'name', i.name, 'kind', i.kind, 'slot', i.slot,
          'rarity', i.rarity, 'basePrice', i.price, 'attack', i.attack,
          'defense', i.defense, 'speed', i.speed, 'dexterity', i.dexterity,
          'available', greatest(0, v.quantity - case when e.item_id is null then 0 else 1 end)
        ) payload
        from public.bw_inventory v
        join public.bw_items i on i.id = v.item_id
        left join public.bw_equipment e on e.user_id = v.user_id and e.item_id = v.item_id
        where v.user_id = uid and v.quantity - case when e.item_id is null then 0 else 1 end > 0
      ) result
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(result.payload order by result.volume desc, result.name)
      from (
        select i.name, sum(s.quantity) volume, jsonb_build_object(
          'itemId', s.item_id, 'name', i.name, 'rarity', i.rarity,
          'volume', sum(s.quantity), 'low', min(s.unit_price), 'high', max(s.unit_price),
          'average', round(avg(s.unit_price)), 'lastSaleAt', max(s.created_at)
        ) payload
        from public.bw_market_sales s
        join public.bw_items i on i.id = s.item_id
        where s.created_at > now() - interval '30 days'
        group by s.item_id, i.name, i.rarity
        order by sum(s.quantity) desc
        limit 80
      ) result
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.bw_market_list(p_item_id text, p_quantity integer, p_unit_price bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  item public.bw_items;
  owned public.bw_inventory;
  quantity_to_list integer := least(100, greatest(1, p_quantity));
  available integer;
begin
  perform public.bw_ensure_player(uid);
  select * into item from public.bw_items where id = p_item_id;
  if item.id is null then raise exception 'item not found'; end if;
  if p_unit_price < greatest(1, item.price / 10) or p_unit_price > item.price * 100 then
    raise exception 'price must be between $% and $%', greatest(1, item.price / 10), item.price * 100;
  end if;
  select * into owned from public.bw_inventory where user_id = uid and item_id = p_item_id for update;
  available := coalesce(owned.quantity, 0) - case when exists(
    select 1 from public.bw_equipment where user_id = uid and item_id = p_item_id
  ) then 1 else 0 end;
  if available < quantity_to_list then raise exception 'only % available to list', greatest(0, available); end if;

  update public.bw_inventory set quantity = quantity - quantity_to_list
  where user_id = uid and item_id = p_item_id;
  delete from public.bw_inventory where user_id = uid and item_id = p_item_id and quantity = 0;
  insert into public.bw_market_listings(seller_id, item_id, quantity, remaining, unit_price)
  values(uid, p_item_id, quantity_to_list, quantity_to_list, p_unit_price);
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values(uid, 'market', 'Listed ' || quantity_to_list || ' × ' || item.name,
    jsonb_build_object('quantity', quantity_to_list, 'unitPrice', p_unit_price));
  return jsonb_build_object('market', public.bw_market_snapshot(), 'state', public.bw_get_state());
end;
$$;

create or replace function public.bw_market_buy(p_listing_id uuid, p_quantity integer, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  listing public.bw_market_listings;
  item public.bw_items;
  buyer_wallet public.player_wallets;
  quantity_to_buy integer := least(100, greatest(1, p_quantity));
  total bigint;
  fee bigint;
begin
  if exists(select 1 from public.bw_market_sales where buyer_id = uid and request_id = p_request_id) then
    return jsonb_build_object('market', public.bw_market_snapshot(), 'state', public.bw_get_state());
  end if;
  select * into listing from public.bw_market_listings
  where id = p_listing_id and status = 'active' and expires_at > now() for update;
  if listing.id is null then raise exception 'listing is no longer available'; end if;
  if listing.seller_id = uid then raise exception 'cancel your own listing instead'; end if;
  if listing.remaining < quantity_to_buy then raise exception 'only % remaining', listing.remaining; end if;
  select * into item from public.bw_items where id = listing.item_id;
  perform public.ensure_exchange_wallet(uid);
  perform public.ensure_exchange_wallet(listing.seller_id);
  perform 1 from public.player_wallets where user_id in (uid, listing.seller_id) order by user_id for update;
  select * into buyer_wallet from public.player_wallets where user_id = uid;
  total := listing.unit_price * quantity_to_buy;
  fee := ceil(total * .05)::bigint;
  if buyer_wallet.balance < total then raise exception 'insufficient cash'; end if;

  update public.player_wallets set balance = balance - total, version = version + 1, updated_at = now() where user_id = uid;
  update public.player_wallets set balance = balance + total - fee, version = version + 1, updated_at = now() where user_id = listing.seller_id;
  insert into public.bw_inventory(user_id, item_id, quantity, equipped)
  values(uid, listing.item_id, quantity_to_buy, false)
  on conflict(user_id, item_id) do update set quantity = bw_inventory.quantity + excluded.quantity;
  update public.bw_market_listings set remaining = remaining - quantity_to_buy,
    status = case when remaining - quantity_to_buy = 0 then 'sold' else 'active' end, updated_at = now()
  where id = listing.id;
  insert into public.bw_market_sales(listing_id, seller_id, buyer_id, item_id, quantity, unit_price, fee, request_id)
  values(listing.id, listing.seller_id, uid, listing.item_id, quantity_to_buy, listing.unit_price, fee, p_request_id);
  perform public.mirror_wallet_to_save(uid, (select balance from public.player_wallets where user_id = uid));
  perform public.mirror_wallet_to_save(listing.seller_id, (select balance from public.player_wallets where user_id = listing.seller_id));
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values(uid, 'market', 'Bought ' || quantity_to_buy || ' × ' || item.name,
    jsonb_build_object('total', total, 'seller', listing.seller_id));
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values(listing.seller_id, 'market', 'Sold ' || quantity_to_buy || ' × ' || item.name,
    jsonb_build_object('gross', total, 'fee', fee, 'buyer', uid));
  return jsonb_build_object('market', public.bw_market_snapshot(), 'state', public.bw_get_state());
end;
$$;

create or replace function public.bw_market_cancel(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  listing public.bw_market_listings;
begin
  select * into listing from public.bw_market_listings
  where id = p_listing_id and seller_id = uid and status = 'active' for update;
  if listing.id is null then raise exception 'active listing not found'; end if;
  if listing.remaining > 0 then
    insert into public.bw_inventory(user_id, item_id, quantity, equipped)
    values(uid, listing.item_id, listing.remaining, false)
    on conflict(user_id, item_id) do update set quantity = bw_inventory.quantity + excluded.quantity;
  end if;
  update public.bw_market_listings set status = 'cancelled', remaining = 0, updated_at = now() where id = listing.id;
  return jsonb_build_object('market', public.bw_market_snapshot(), 'state', public.bw_get_state());
end;
$$;

create or replace function public.bw_hustle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  profile public.bw_hustle_profiles;
  wallet public.player_wallets;
  heat_now numeric;
  daily_runs integer;
  heat_factor numeric;
  daily_factor numeric;
  multiplier numeric;
begin
  perform public.bw_ensure_player(uid);
  wallet := public.ensure_exchange_wallet(uid);
  insert into public.bw_hustle_profiles(user_id) values(uid) on conflict do nothing;
  select * into profile from public.bw_hustle_profiles where user_id = uid;
  heat_now := greatest(0, profile.heat - coalesce(extract(epoch from (now() - profile.last_action_at)) / 60, 0));
  select count(*) into daily_runs from public.bw_hustle_runs where user_id = uid and created_at > now() - interval '24 hours';
  heat_factor := case when heat_now <= 25 then 1 when heat_now <= 60 then 1 - (heat_now - 25) * .008 when heat_now <= 85 then .72 - (heat_now - 60) * .008 else .45 end;
  daily_factor := greatest(.40, 1 - greatest(0, daily_runs - 75) * .004);
  multiplier := greatest(.25, least(1, heat_factor * daily_factor));
  return jsonb_build_object(
    'walletBalance', wallet.balance,
    'profile', jsonb_build_object(
      'mastery', profile.mastery, 'heat', round(heat_now, 1), 'totalRuns', profile.total_runs,
      'totalCash', profile.total_cash, 'lootFound', profile.loot_found,
      'dailyRuns', daily_runs, 'rewardMultiplier', round(multiplier, 2),
      'lastActionAt', profile.last_action_at
    ),
    'activities', jsonb_build_array(
      jsonb_build_object('id','dock_courier','name','Dockside Courier','district','Harbor','description','Move sealed parcels between warehouses. Low heat, steady pay.','cashMin',40,'cashMax',80,'heatGain',2,'lootChance',3),
      jsonb_build_object('id','backroom_cards','name','Backroom Card Runner','district','Little Italy','description','Carry markers and settle private-table tabs. Higher heat, better pay.','cashMin',65,'cashMax',145,'heatGain',5,'lootChance',3),
      jsonb_build_object('id','garage_parts','name','Garage Parts Sort','district','Southside','description','Strip useful parts and identify valuable equipment. Best loot chance.','cashMin',45,'cashMax',105,'heatGain',3,'lootChance',8),
      jsonb_build_object('id','information','name','Street Information','district','Downtown','description','Trade rumors between bartenders, drivers and doormen. Slowest heat build.','cashMin',30,'cashMax',70,'heatGain',1,'lootChance',2)
    ),
    'recent', coalesce((
      select jsonb_agg(result.payload order by result.created_at desc)
      from (
        select r.created_at, jsonb_build_object(
          'id', r.id, 'hustle', r.hustle, 'cash', r.cash_reward, 'xp', r.xp_reward,
          'itemId', r.item_id, 'itemName', i.name, 'heatAfter', r.heat_after,
          'multiplier', r.reward_multiplier, 'createdAt', r.created_at
        ) payload
        from public.bw_hustle_runs r
        left join public.bw_items i on i.id = r.item_id
        where r.user_id = uid
        order by r.created_at desc limit 25
      ) result
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.bw_do_hustle(p_hustle text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  state public.bw_player_states;
  profile public.bw_hustle_profiles;
  base_min integer;
  base_max integer;
  heat_gain numeric;
  loot_chance numeric;
  heat_now numeric;
  daily_runs integer;
  heat_factor numeric;
  daily_factor numeric;
  multiplier numeric;
  mastery_boost numeric;
  reward bigint;
  xp_gain integer;
  drop_item text;
  drop_name text;
begin
  if exists(select 1 from public.bw_hustle_runs where user_id = uid and request_id = p_request_id) then
    return jsonb_build_object('event', jsonb_build_object('duplicate', true), 'hustle', public.bw_hustle_snapshot(), 'state', public.bw_get_state());
  end if;
  select * into state from public.bw_refresh_player(uid);
  if state.status <> 'okay' then raise exception 'street work is unavailable while %', state.status; end if;
  insert into public.bw_hustle_profiles(user_id) values(uid) on conflict do nothing;
  select * into profile from public.bw_hustle_profiles where user_id = uid for update;
  if profile.last_action_at is not null and profile.last_action_at > now() - interval '3 seconds' then
    raise exception 'slow down—the next contact is not ready yet';
  end if;
  case p_hustle
    when 'dock_courier' then base_min := 40; base_max := 80; heat_gain := 2; loot_chance := .03;
    when 'backroom_cards' then base_min := 65; base_max := 145; heat_gain := 5; loot_chance := .03;
    when 'garage_parts' then base_min := 45; base_max := 105; heat_gain := 3; loot_chance := .08;
    when 'information' then base_min := 30; base_max := 70; heat_gain := 1; loot_chance := .02;
    else raise exception 'unknown hustle';
  end case;
  heat_now := greatest(0, profile.heat - coalesce(extract(epoch from (now() - profile.last_action_at)) / 60, 0));
  select count(*) into daily_runs from public.bw_hustle_runs where user_id = uid and created_at > now() - interval '24 hours';
  heat_factor := case when heat_now <= 25 then 1 when heat_now <= 60 then 1 - (heat_now - 25) * .008 when heat_now <= 85 then .72 - (heat_now - 60) * .008 else .45 end;
  daily_factor := greatest(.40, 1 - greatest(0, daily_runs - 75) * .004);
  multiplier := greatest(.25, least(1, heat_factor * daily_factor));
  mastery_boost := 1 + least(.50, profile.mastery::numeric / 1000);
  reward := greatest(10, floor((base_min + random() * (base_max - base_min + 1)) * multiplier * mastery_boost)::bigint);
  xp_gain := greatest(1, floor((2 + random() * 4) * multiplier)::integer);
  if random() < loot_chance * multiplier then
    select id, name into drop_item, drop_name from public.bw_items
    where rarity in ('common','uncommon') order by random() limit 1;
  end if;

  update public.player_wallets set balance = balance + reward, version = version + 1, updated_at = now() where user_id = uid;
  if drop_item is not null then
    insert into public.bw_inventory(user_id, item_id, quantity, equipped) values(uid, drop_item, 1, false)
    on conflict(user_id, item_id) do update set quantity = bw_inventory.quantity + 1;
  end if;
  update public.bw_hustle_profiles set mastery = mastery + 1, heat = least(100, heat_now + heat_gain),
    total_runs = total_runs + 1, total_cash = total_cash + reward,
    loot_found = loot_found + case when drop_item is null then 0 else 1 end,
    last_action_at = now(), updated_at = now() where user_id = uid;
  insert into public.bw_hustle_runs(user_id, hustle, cash_reward, xp_reward, item_id, heat_after, reward_multiplier, request_id)
  values(uid, p_hustle, reward, xp_gain, drop_item, least(100, heat_now + heat_gain), multiplier, p_request_id);
  perform public.bw_gain_xp(uid, xp_gain);
  perform public.mirror_wallet_to_save(uid, (select balance from public.player_wallets where user_id = uid));
  insert into public.bw_action_logs(user_id, kind, summary, data)
  values(uid, 'hustle', 'Completed ' || replace(p_hustle, '_', ' '),
    jsonb_build_object('cash', reward, 'xp', xp_gain, 'item', drop_item, 'heat', least(100, heat_now + heat_gain), 'multiplier', multiplier));
  return jsonb_build_object(
    'event', jsonb_build_object('cash', reward, 'xp', xp_gain, 'itemId', drop_item, 'itemName', drop_name),
    'hustle', public.bw_hustle_snapshot(),
    'state', public.bw_get_state()
  );
end;
$$;

revoke all on function public.bw_market_snapshot(), public.bw_market_list(text,integer,bigint),
  public.bw_market_buy(uuid,integer,uuid), public.bw_market_cancel(uuid),
  public.bw_hustle_snapshot(), public.bw_do_hustle(text,uuid) from public, anon;
grant execute on function public.bw_market_snapshot(), public.bw_market_list(text,integer,bigint),
  public.bw_market_buy(uuid,integer,uuid), public.bw_market_cancel(uuid),
  public.bw_hustle_snapshot(), public.bw_do_hustle(text,uuid) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_market_listings') then
    alter publication supabase_realtime add table public.bw_market_listings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_market_sales') then
    alter publication supabase_realtime add table public.bw_market_sales;
  end if;
end;
$$;

create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),'career',public.bw_job_snapshot(),
    'forex',public.bw_broker_snapshot('XAU/USD','1min'),'loadout',public.bw_get_loadout(),
    'family',public.bw_family_snapshot(),'market',public.bw_market_snapshot(),'hustles',public.bw_hustle_snapshot(),
    'available_pages',array['home','crimes','hustles','combat','gym','work','missions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','economy','arcade']
  );
end;
$$;
grant execute on function public.bw_adviser_context() to authenticated;
