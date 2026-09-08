-- Blackwood City — Supporter Store and Google Play entitlement ledger.
-- Requires 20260923_retire_arcade_skill_rooms.sql and 20260918_character_collection.sql.
--
-- This migration intentionally has no cash, equipment, XP, stat, Arcade Dollar,
-- Ledger Credit, or chance-based product. Real-money products are only a
-- deterministic cosmetic entitlement or the optional monthly membership.

create table if not exists public.bw_store_products (
  id text primary key,
  play_product_id text not null unique,
  product_type text not null check (product_type in ('one_time','subscription')),
  category text not null check (category in ('cosmetic','membership')),
  name text not null,
  short_description text not null,
  detail text not null,
  benefits jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.bw_store_products(id,play_product_id,product_type,category,name,short_description,detail,benefits,sort_order) values
('patron-amber','blackwood_patron_amber','one_time','cosmetic','Amber Patron Seal','A warm brass frame for your public character card.','Permanent character-card frame. Cosmetic only; it never changes combat, crime, economy, or progression.',jsonb_build_object('kind','cosmetic','entitlements',jsonb_build_array('character_frame:patron-amber')),1),
('patron-midnight','blackwood_patron_midnight','one_time','cosmetic','Midnight Patron Seal','A deep-blue frame for a quieter Blackwood record.','Permanent character-card frame. Cosmetic only; it never changes combat, crime, economy, or progression.',jsonb_build_object('kind','cosmetic','entitlements',jsonb_build_array('character_frame:patron-midnight')),2),
('night-paper','blackwood_night_paper','one_time','cosmetic','Night Ledger Paper','A dark paper treatment for your public character card.','Permanent character-card paper treatment. Cosmetic only; it never changes combat, crime, economy, or progression.',jsonb_build_object('kind','cosmetic','entitlements',jsonb_build_array('card_background:night')),3),
('monthly-membership','blackwood_membership_monthly','subscription','membership','Moretti Monthly','A modest monthly membership for collectors who want a little more room to style their record.','Renews monthly through Google Play. Includes one cosmetic Style Ticket per UTC day, a member badge, early access to cosmetic rotations, and one extra public showcase slot. No cash, Arcade Dollars, stats, XP, equipment, loot, or gameplay power.',jsonb_build_object('kind','membership','entitlements',jsonb_build_array('membership:monthly'),'daily',jsonb_build_object('styleTickets',1),'showcaseLimit',4),4)
on conflict(id) do update set play_product_id=excluded.play_product_id,product_type=excluded.product_type,category=excluded.category,name=excluded.name,short_description=excluded.short_description,detail=excluded.detail,benefits=excluded.benefits,sort_order=excluded.sort_order,active=excluded.active,updated_at=now();

create table if not exists public.bw_store_purchase_intents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.bw_store_products(id),
  platform text not null default 'google_play' check (platform = 'google_play'),
  status text not null default 'created' check (status in ('created','submitted','completed','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create table if not exists public.bw_store_purchase_events (
  purchase_token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.bw_store_products(id),
  platform_purchase_id text,
  purchase_state text not null check (purchase_state in ('pending','purchased','active','grace','on_hold','paused','expired','cancelled','refunded')),
  quantity integer not null default 1 check (quantity between 1 and 20),
  purchase_time timestamptz,
  expires_at timestamptz,
  acknowledged boolean not null default false,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_store_entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  product_id text references public.bw_store_products(id),
  source_purchase_id text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,entitlement_key,source_purchase_id)
);

create index if not exists bw_store_entitlements_active_idx
  on public.bw_store_entitlements(user_id,entitlement_key,status,expires_at);

create table if not exists public.bw_store_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  style_tickets integer not null default 0 check (style_tickets between 0 and 10000),
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_store_daily_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_date date not null,
  style_tickets integer not null default 1 check (style_tickets = 1),
  claimed_at timestamptz not null default now(),
  primary key(user_id,reward_date)
);

create table if not exists public.bw_store_style_catalog (
  id text primary key,
  name text not null,
  description text not null,
  entitlement_key text not null unique,
  ticket_cost integer not null check (ticket_cost between 1 and 1000),
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.bw_store_style_catalog(id,name,description,entitlement_key,ticket_cost,sort_order) values
('member-olive-seal','Olive Member Seal','A member-only character-card frame earned with Style Tickets.','character_frame:member-olive',7,1),
('member-ink-seal','Ink Member Seal','A member-only character-card frame earned with Style Tickets.','character_frame:member-ink',7,2),
('member-night-paper','Member Night Paper','A member-only paper treatment earned with Style Tickets.','card_background:member-night',14,3)
on conflict(id) do update set name=excluded.name,description=excluded.description,entitlement_key=excluded.entitlement_key,ticket_cost=excluded.ticket_cost,sort_order=excluded.sort_order,active=excluded.active;

-- Purchased frames are still shown in the same canonical character-card editor.
insert into public.bw_profile_frames(id,name,rarity,accent,requirement,sort_order) values
('patron-amber','Amber Patron Seal','rare','#c27d2d','Supporter Store · permanent cosmetic',6),
('patron-midnight','Midnight Patron Seal','epic','#3d557d','Supporter Store · permanent cosmetic',7),
('member-olive','Olive Member Seal','rare','#6f8f70','Redeem with 7 Style Tickets',8),
('member-ink','Ink Member Seal','epic','#394355','Redeem with 7 Style Tickets',9)
on conflict(id) do update set name=excluded.name,rarity=excluded.rarity,accent=excluded.accent,requirement=excluded.requirement,sort_order=excluded.sort_order;

alter table public.bw_character_showcases drop constraint if exists bw_character_showcases_background_key_check;
alter table public.bw_character_showcases add constraint bw_character_showcases_background_key_check check(background_key in ('ivory','sand','sage','night','member-night'));

alter table public.bw_store_purchase_intents enable row level security;
alter table public.bw_store_purchase_events enable row level security;
alter table public.bw_store_entitlements enable row level security;
alter table public.bw_store_wallets enable row level security;
alter table public.bw_store_daily_claims enable row level security;
alter table public.bw_store_style_catalog enable row level security;
alter table public.bw_store_products enable row level security;

drop policy if exists "authenticated read store products" on public.bw_store_products;
create policy "authenticated read store products" on public.bw_store_products for select to authenticated using(active);
drop policy if exists "authenticated read style catalog" on public.bw_store_style_catalog;
create policy "authenticated read style catalog" on public.bw_store_style_catalog for select to authenticated using(active);
drop policy if exists "users read own store intents" on public.bw_store_purchase_intents;
create policy "users read own store intents" on public.bw_store_purchase_intents for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own store entitlements" on public.bw_store_entitlements;
create policy "users read own store entitlements" on public.bw_store_entitlements for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own store wallet" on public.bw_store_wallets;
create policy "users read own store wallet" on public.bw_store_wallets for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own store claims" on public.bw_store_daily_claims;
create policy "users read own store claims" on public.bw_store_daily_claims for select to authenticated using(auth.uid()=user_id);

revoke insert,update,delete on public.bw_store_products,public.bw_store_purchase_intents,public.bw_store_purchase_events,public.bw_store_entitlements,public.bw_store_wallets,public.bw_store_daily_claims,public.bw_store_style_catalog from anon,authenticated;
grant select on public.bw_store_products,public.bw_store_style_catalog,public.bw_store_purchase_intents,public.bw_store_entitlements,public.bw_store_wallets,public.bw_store_daily_claims to authenticated;

create or replace function public.bw_store_membership_active(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.bw_store_entitlements
    where user_id=p_uid and entitlement_key='membership:monthly' and status='active'
      and (expires_at is null or expires_at>now())
  )
$$;
revoke all on function public.bw_store_membership_active(uuid) from public,anon,authenticated;

create or replace function public.bw_store_has_entitlement(p_uid uuid,p_key text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.bw_store_entitlements
    where user_id=p_uid and entitlement_key=p_key and status='active'
      and (expires_at is null or expires_at>now())
  )
$$;
revoke all on function public.bw_store_has_entitlement(uuid,text) from public,anon,authenticated;

create or replace function public.bw_store_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  wallet public.bw_store_wallets;
  member boolean;
  claimed boolean;
  limit_count integer;
begin
  perform public.bw_ensure_player(uid);
  insert into public.bw_store_wallets(user_id) values(uid) on conflict do nothing;
  select * into wallet from public.bw_store_wallets where user_id=uid;
  member:=public.bw_store_membership_active(uid);
  claimed:=exists(select 1 from public.bw_store_daily_claims where user_id=uid and reward_date=(now() at time zone 'UTC')::date);
  limit_count:=case when member then 4 else 3 end;
  return jsonb_build_object(
    'authority',true,
    'billing',jsonb_build_object('provider','google_play','nativePurchaseRequired',true,'priceSource','Google Play localized product details','realMoneyArcadeConversion',false,'cashPacks',false,'randomizedProducts',false),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'playProductId',p.play_product_id,'productType',p.product_type,'category',p.category,'name',p.name,'shortDescription',p.short_description,'detail',p.detail,'benefits',p.benefits,'owned',case when p.product_type='subscription' then member else exists(select 1 from public.bw_store_entitlements e where e.user_id=uid and e.product_id=p.id and e.status='active' and (e.expires_at is null or e.expires_at>now())) end) order by p.sort_order) from public.bw_store_products p where p.active),'[]'::jsonb),
    'membership',jsonb_build_object('active',member,'expiresAt',(select max(e.expires_at) from public.bw_store_entitlements e where e.user_id=uid and e.entitlement_key='membership:monthly' and e.status='active'),'showcaseLimit',limit_count,'dailyReward',jsonb_build_object('styleTickets',1)),
    'wallet',jsonb_build_object('styleTickets',coalesce(wallet.style_tickets,0)),
    'daily',jsonb_build_object('date',(now() at time zone 'UTC')::date,'eligible',member and not claimed,'claimed',claimed,'reward',jsonb_build_object('styleTickets',1)),
    'styleCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'ticketCost',s.ticket_cost,'owned',public.bw_store_has_entitlement(uid,s.entitlement_key),'canRedeem',member and not public.bw_store_has_entitlement(uid,s.entitlement_key) and coalesce(wallet.style_tickets,0)>=s.ticket_cost) order by s.sort_order) from public.bw_store_style_catalog s where s.active),'[]'::jsonb),
    'entitlements',coalesce((select jsonb_agg(jsonb_build_object('key',e.entitlement_key,'productId',e.product_id,'status',e.status,'startsAt',e.starts_at,'expiresAt',e.expires_at) order by e.created_at desc) from public.bw_store_entitlements e where e.user_id=uid and e.status='active' and (e.expires_at is null or e.expires_at>now())),'[]'::jsonb)
  );
end $$;

create or replace function public.bw_store_begin_purchase(p_product_id text,p_request_id uuid default gen_random_uuid()) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); p public.bw_store_products; intent public.bw_store_purchase_intents;
begin
  select * into p from public.bw_store_products where id=p_product_id and active;
  if p.id is null then raise exception 'store product unavailable'; end if;
  if p.product_type='one_time' and exists(select 1 from public.bw_store_entitlements where user_id=uid and product_id=p.id and status='active' and (expires_at is null or expires_at>now())) then raise exception 'product already owned'; end if;
  insert into public.bw_store_purchase_intents(id,user_id,product_id) values(p_request_id,uid,p.id) on conflict(id) do update set status='created',expires_at=now()+interval '30 minutes';
  select * into intent from public.bw_store_purchase_intents where id=p_request_id;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'store','Started Google Play purchase',jsonb_build_object('product',p.id,'requestId',p_request_id,'provider','google_play'));
  return jsonb_build_object('requestId',intent.id,'productId',p.id,'playProductId',p.play_product_id,'productType',p.product_type,'status',intent.status,'expiresAt',intent.expires_at);
end $$;

create or replace function public.bw_store_claim_daily() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); today date:=(now() at time zone 'UTC')::date; member boolean; wallet public.bw_store_wallets;
begin
  member:=public.bw_store_membership_active(uid);
  if not member then raise exception 'active Moretti Monthly membership required'; end if;
  insert into public.bw_store_wallets(user_id) values(uid) on conflict do nothing;
  select * into wallet from public.bw_store_wallets where user_id=uid for update;
  if exists(select 1 from public.bw_store_daily_claims where user_id=uid and reward_date=today) then
    return jsonb_build_object('event',jsonb_build_object('alreadyClaimed',true),'store',public.bw_store_snapshot());
  end if;
  insert into public.bw_store_daily_claims(user_id,reward_date,style_tickets) values(uid,today,1);
  update public.bw_store_wallets set style_tickets=style_tickets+1,updated_at=now() where user_id=uid;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'store','Claimed Moretti Monthly daily Style Ticket',jsonb_build_object('date',today,'styleTickets',1));
  return jsonb_build_object('event',jsonb_build_object('styleTickets',1,'date',today),'store',public.bw_store_snapshot());
end $$;

create or replace function public.bw_store_redeem_style_ticket(p_style_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); style public.bw_store_style_catalog; wallet public.bw_store_wallets; source_id text:=gen_random_uuid()::text;
begin
  if not public.bw_store_membership_active(uid) then raise exception 'active Moretti Monthly membership required'; end if;
  select * into style from public.bw_store_style_catalog where id=p_style_id and active;
  if style.id is null then raise exception 'style rotation unavailable'; end if;
  if public.bw_store_has_entitlement(uid,style.entitlement_key) then raise exception 'style already owned'; end if;
  select * into wallet from public.bw_store_wallets where user_id=uid for update;
  if wallet.style_tickets<style.ticket_cost then raise exception '% Style Tickets required',style.ticket_cost; end if;
  update public.bw_store_wallets set style_tickets=style_tickets-style.ticket_cost,updated_at=now() where user_id=uid;
  insert into public.bw_store_entitlements(user_id,entitlement_key,source_purchase_id,status,metadata) values(uid,style.entitlement_key,source_id,'active',jsonb_build_object('source','style_ticket','style',style.id));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'store','Redeemed Style Tickets',jsonb_build_object('style',style.id,'cost',style.ticket_cost));
  return jsonb_build_object('event',jsonb_build_object('style',style.id,'cost',style.ticket_cost),'store',public.bw_store_snapshot());
end $$;

-- Called only by the trusted Google Play verification function. No client role
-- can grant itself an entitlement or submit a purchase token here.
create or replace function public.bw_store_apply_verified_purchase(
  p_user_id uuid,
  p_product_id text,
  p_platform_purchase_id text,
  p_purchase_token_hash text,
  p_purchase_state text,
  p_quantity integer default 1,
  p_purchase_time timestamptz default now(),
  p_expires_at timestamptz default null,
  p_acknowledged boolean default false,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.bw_store_products; key text; existing public.bw_store_purchase_events;
begin
  if p_user_id is null or p_purchase_token_hash is null or char_length(p_purchase_token_hash)<32 then raise exception 'verified purchase identity is incomplete'; end if;
  select * into p from public.bw_store_products where id=p_product_id and active;
  if p.id is null then raise exception 'store product unavailable'; end if;
  if p.benefits ?| array['city_cash','cash','arcade_dollars','ledger_credits','stats','power','loot'] then raise exception 'real-money product benefit is prohibited'; end if;
  if p_purchase_state not in('purchased','active','grace') then
    update public.bw_store_purchase_events
      set purchase_state=case when p_purchase_state in('pending','expired','on_hold','paused','cancelled','refunded') then p_purchase_state else 'cancelled' end,
          expires_at=p_expires_at,acknowledged=p_acknowledged,updated_at=now()
      where purchase_token_hash=p_purchase_token_hash;
    update public.bw_store_entitlements set status='revoked',updated_at=now() where user_id=p_user_id and source_purchase_id=p_purchase_token_hash;
    return jsonb_build_object('verified',false,'revoked',true,'productId',p_product_id);
  end if;
  select * into existing from public.bw_store_purchase_events where purchase_token_hash=p_purchase_token_hash;
  if existing.purchase_token_hash is not null and existing.user_id<>p_user_id then raise exception 'purchase token is already linked'; end if;
  insert into public.bw_store_purchase_events(purchase_token_hash,user_id,product_id,platform_purchase_id,purchase_state,quantity,purchase_time,expires_at,acknowledged,verified_at,metadata,updated_at)
  values(p_purchase_token_hash,p_user_id,p.id,p_platform_purchase_id,p_purchase_state,least(20,greatest(1,p_quantity)),p_purchase_time,p_expires_at,p_acknowledged,now(),coalesce(p_metadata,'{}'::jsonb),now())
  on conflict(purchase_token_hash) do update set platform_purchase_id=excluded.platform_purchase_id,purchase_state=excluded.purchase_state,quantity=excluded.quantity,purchase_time=excluded.purchase_time,expires_at=excluded.expires_at,acknowledged=excluded.acknowledged,verified_at=now(),revoked_at=null,metadata=excluded.metadata,updated_at=now();
  for key in select value from jsonb_array_elements_text(coalesce(p.benefits->'entitlements','[]'::jsonb)) loop
    if p.product_type='one_time' and exists(select 1 from public.bw_store_entitlements where user_id=p_user_id and entitlement_key=key and status='active' and (expires_at is null or expires_at>now())) then
      continue;
    end if;
    insert into public.bw_store_entitlements(user_id,entitlement_key,product_id,source_purchase_id,status,starts_at,expires_at,metadata)
    values(p_user_id,key,p.id,p_purchase_token_hash,'active',coalesce(p_purchase_time,now()),case when p.product_type='subscription' then p_expires_at else null end,coalesce(p_metadata,'{}'::jsonb))
    on conflict(user_id,entitlement_key,source_purchase_id) do update set status='active',starts_at=excluded.starts_at,expires_at=excluded.expires_at,metadata=excluded.metadata,updated_at=now();
  end loop;
  update public.bw_store_purchase_intents set status='completed' where user_id=p_user_id and product_id=p.id and status in('created','submitted') and expires_at>now();
  insert into public.bw_action_logs(user_id,kind,summary,data) values(p_user_id,'store','Verified Google Play entitlement',jsonb_build_object('product',p.id,'purchaseId',p_platform_purchase_id,'state',p_purchase_state,'expiresAt',p_expires_at));
  return jsonb_build_object('verified',true,'productId',p.id,'purchaseState',p_purchase_state,'expiresAt',p_expires_at);
end $$;

create or replace function public.bw_store_revoke_purchase(p_purchase_token_hash text,p_reason text default 'revoked') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare event_row public.bw_store_purchase_events;
begin
  select * into event_row from public.bw_store_purchase_events where purchase_token_hash=p_purchase_token_hash for update;
  if event_row.purchase_token_hash is null then return jsonb_build_object('revoked',false,'missing',true); end if;
  update public.bw_store_purchase_events set purchase_state=case when p_reason='refunded' then 'refunded' else 'cancelled' end,revoked_at=now(),updated_at=now() where purchase_token_hash=p_purchase_token_hash;
  update public.bw_store_entitlements set status='revoked',updated_at=now() where source_purchase_id=p_purchase_token_hash;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(event_row.user_id,'store','Revoked Google Play entitlement',jsonb_build_object('product',event_row.product_id,'reason',p_reason));
  return jsonb_build_object('revoked',true,'productId',event_row.product_id);
end $$;

-- Extend the canonical character-card rules; purchased styles never enter the
-- combat/economy item catalog.
create or replace function public.bw_character_frame_unlocked(p_frame_id text,p_uid uuid) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states;
begin
  select * into s from public.bw_player_states where user_id=p_uid;
  return case p_frame_id
    when 'starter' then true
    when 'rookie' then coalesce(s.level,1)>=5
    when 'collector' then coalesce(s.respect,0)>=250
    when 'district' then coalesce(s.level,1)>=15
    when 'legend' then coalesce(s.level,1)>=30
    else public.bw_store_has_entitlement(p_uid,'character_frame:'||p_frame_id)
  end;
end $$;

create or replace function public.bw_character_collection_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; p public.profiles; c public.bw_character_showcases; member boolean;
begin
  s:=public.bw_ensure_player(uid);
  select * into p from public.profiles where id=uid;
  select * into c from public.bw_character_showcases where user_id=uid;
  member:=public.bw_store_membership_active(uid);
  return jsonb_build_object(
    'authority',true,
    'card',jsonb_build_object('displayName',coalesce(p.display_name,'Associate'),'avatarUrl',p.avatar_url,'title','Associate','level',s.level,'respect',s.respect,'portraitKey',coalesce(c.portrait_key,'monogram'),'frameId',coalesce(c.frame_id,'starter'),'layoutId',coalesce(c.layout_id,'ledger'),'backgroundKey',coalesce(c.background_key,'ivory'),'featuredItemIds',coalesce(c.featured_item_ids,'{}'::text[]),'showcaseLimit',case when member then 4 else 3 end),
    'frames',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'rarity',f.rarity,'accent',f.accent,'requirement',f.requirement,'unlocked',public.bw_character_frame_unlocked(f.id,uid)) order by f.sort_order) from public.bw_profile_frames f),'[]'::jsonb),
    'collectionCount',coalesce((select count(*) from public.bw_inventory v where v.user_id=uid and v.quantity>0),0),
    'showcaseLimit',case when member then 4 else 3 end
  );
end $$;

create or replace function public.bw_save_character_showcase(
  p_portrait_key text default 'monogram',p_frame_id text default 'starter',p_layout_id text default 'ledger',p_background_key text default 'ivory',p_featured_item_ids text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); ids text[]:=coalesce(p_featured_item_ids,'{}'::text[]); max_items integer:=case when public.bw_store_membership_active(uid) then 4 else 3 end;
begin
  perform public.bw_ensure_player(uid);
  if p_portrait_key not in('monogram','seal','crown') then raise exception 'invalid portrait'; end if;
  if p_layout_id not in('ledger','gallery','vault') then raise exception 'invalid card layout'; end if;
  if p_background_key not in('ivory','sand','sage','night','member-night') then raise exception 'invalid card background'; end if;
  if p_background_key='night' and not public.bw_store_has_entitlement(uid,'card_background:night') then raise exception 'night paper is locked'; end if;
  if p_background_key='member-night' and not public.bw_store_has_entitlement(uid,'card_background:member-night') then raise exception 'member night paper is locked'; end if;
  if not exists(select 1 from public.bw_profile_frames where id=p_frame_id) then raise exception 'frame not found'; end if;
  if not public.bw_character_frame_unlocked(p_frame_id,uid) then raise exception 'frame is still locked'; end if;
  if coalesce(array_length(ids,1),0)>max_items then raise exception 'choose up to % featured items',max_items; end if;
  if exists(select 1 from unnest(ids) chosen(id) where not exists(select 1 from public.bw_inventory v where v.user_id=uid and v.item_id=chosen.id and v.quantity>0)) then raise exception 'featured item is not owned'; end if;
  insert into public.bw_character_showcases(user_id,portrait_key,frame_id,layout_id,background_key,featured_item_ids,updated_at) values(uid,p_portrait_key,p_frame_id,p_layout_id,p_background_key,ids,now())
  on conflict(user_id) do update set portrait_key=excluded.portrait_key,frame_id=excluded.frame_id,layout_id=excluded.layout_id,background_key=excluded.background_key,featured_item_ids=excluded.featured_item_ids,updated_at=now();
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'profile','Updated public character card',jsonb_build_object('frame',p_frame_id,'layout',p_layout_id,'background',p_background_key,'featured',ids));
  return public.bw_character_collection_snapshot();
end $$;

revoke all on function public.bw_store_membership_active(uuid),public.bw_store_has_entitlement(uuid,text),public.bw_store_snapshot(),public.bw_store_begin_purchase(text,uuid),public.bw_store_claim_daily(),public.bw_store_redeem_style_ticket(text),public.bw_store_apply_verified_purchase(uuid,text,text,text,text,integer,timestamptz,timestamptz,boolean,jsonb),public.bw_store_revoke_purchase(text,text),public.bw_character_frame_unlocked(text,uuid),public.bw_character_collection_snapshot(),public.bw_save_character_showcase(text,text,text,text,text[]) from public,anon;
grant execute on function public.bw_store_snapshot(),public.bw_store_begin_purchase(text,uuid),public.bw_store_claim_daily(),public.bw_store_redeem_style_ticket(text),public.bw_character_collection_snapshot(),public.bw_save_character_showcase(text,text,text,text,text[]) to authenticated;
grant execute on function public.bw_store_apply_verified_purchase(uuid,text,text,text,text,integer,timestamptz,timestamptz,boolean,jsonb),public.bw_store_revoke_purchase(text,text) to service_role;
