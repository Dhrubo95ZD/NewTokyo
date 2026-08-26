-- Neo Economy: authoritative life skills, crafting, secure auction escrow and Megachips.
-- Apply after schema.sql, 20260825_neo_exchange.sql and 20260827_progression_hub.sql.
do $$ begin
  if to_regprocedure('public.require_google_player()') is null or to_regprocedure('public.ensure_exchange_wallet(uuid)') is null then
    raise exception 'Apply the account, exchange and progression migrations first';
  end if;
end $$;

create table if not exists public.player_economies(
  user_id uuid primary key references auth.users(id) on delete cascade,
  materials jsonb not null default '{}'::jsonb,
  skills jsonb not null default '{"scavenging":{"level":1,"xp":0},"prospecting":{"level":1,"xp":0},"surveying":{"level":1,"xp":0},"synthesis":{"level":1,"xp":0}}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.life_skill_jobs(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null check(skill in('scavenging','prospecting','surveying','synthesis')),
  state text not null default 'working' check(state in('working','claimed','cancelled')),
  completes_at timestamptz not null, created_at timestamptz not null default now(), claimed_at timestamptz
);
create unique index if not exists one_working_life_job on public.life_skill_jobs(user_id) where state='working';
create table if not exists public.auction_listings(
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid references auth.users(id), item_id text not null, enhancement integer not null default 0 check(enhancement between 0 and 20),
  price bigint not null check(price between 100 and 100000000), status text not null default 'active' check(status in('active','sold','cancelled','expired')),
  expires_at timestamptz not null, created_at timestamptz not null default now(), closed_at timestamptz
);
create index if not exists auction_active_idx on public.auction_listings(status,created_at desc);
create table if not exists public.auction_ledger(
  id bigint generated always as identity primary key, listing_id uuid not null, seller_id uuid not null, buyer_id uuid,
  event text not null, price bigint not null default 0, fee bigint not null default 0, created_at timestamptz not null default now()
);

alter table public.player_economies enable row level security; alter table public.life_skill_jobs enable row level security;
alter table public.auction_listings enable row level security; alter table public.auction_ledger enable row level security;
drop policy if exists "own economy" on public.player_economies; create policy "own economy" on public.player_economies for select to authenticated using(auth.uid()=user_id);
drop policy if exists "own jobs" on public.life_skill_jobs; create policy "own jobs" on public.life_skill_jobs for select to authenticated using(auth.uid()=user_id);
drop policy if exists "active auctions" on public.auction_listings; create policy "active auctions" on public.auction_listings for select to authenticated using(status='active' or auth.uid()=seller_id or auth.uid()=buyer_id);
revoke insert,update,delete on public.player_economies,public.life_skill_jobs,public.auction_listings,public.auction_ledger from authenticated;
grant select on public.player_economies,public.life_skill_jobs,public.auction_listings to authenticated;

create or replace function public.ensure_my_economy() returns public.player_economies language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); result public.player_economies;
begin insert into public.player_economies(user_id) values(uid) on conflict do nothing; select * into result from public.player_economies where user_id=uid; return result; end $$;

create or replace function public.get_my_economy_state() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); e public.player_economies;
begin e:=public.ensure_my_economy();
 return jsonb_build_object('materials',e.materials,'skills',e.skills,
  'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'skill',skill,'completesAt',completes_at)) from public.life_skill_jobs where user_id=uid and state='working'),'[]'::jsonb),
  'listings',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'itemId',a.item_id,'enhancement',a.enhancement,'price',a.price,'sellerName',p.display_name,'expiresAt',a.expires_at) order by a.created_at desc) from public.auction_listings a left join public.profiles p on p.id=a.seller_id where a.status='active' and a.expires_at>now() and a.seller_id<>uid),'[]'::jsonb),
  'myListings',coalesce((select jsonb_agg(jsonb_build_object('id',id,'itemId',item_id,'enhancement',enhancement,'price',price,'expiresAt',expires_at) order by created_at desc) from public.auction_listings where seller_id=uid and status='active'),'[]'::jsonb));
end $$;

create or replace function public.start_life_skill_job(p_skill text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); job public.life_skill_jobs;
begin perform public.ensure_my_economy(); if p_skill not in('scavenging','prospecting','surveying','synthesis') then raise exception 'Unknown life skill'; end if;
 if exists(select 1 from public.life_skill_jobs where user_id=uid and state='working') then raise exception 'Claim the current work order first'; end if;
 insert into public.life_skill_jobs(user_id,skill,completes_at) values(uid,p_skill,now()+interval '45 seconds') returning * into job;
 return jsonb_build_object('jobId',job.id,'completesAt',job.completes_at); end $$;

create or replace function public.claim_life_skill_job(p_job_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); job public.life_skill_jobs; e public.player_economies; mats text[]; a integer; b integer; c integer; skill jsonb; lvl integer; xp integer;
begin select * into job from public.life_skill_jobs where id=p_job_id and user_id=uid and state='working' for update; if not found then raise exception 'Work order not found'; end if; if job.completes_at>now() then raise exception 'Work order is still running'; end if;
 select * into e from public.player_economies where user_id=uid for update;
 mats:=case job.skill when 'scavenging' then array['alloy','mechanism','nano-fiber'] when 'prospecting' then array['ore','flux-crystal','conductive-metal'] when 'surveying' then array['data-pattern','circuit-plan','signal-glass'] else array['coolant','polymer','bio-gel'] end;
 a:=3+floor(random()*4)::int; b:=2+floor(random()*3)::int; c:=1+floor(random()*2)::int;
 e.materials:=jsonb_set(jsonb_set(jsonb_set(e.materials,array[mats[1]],to_jsonb(coalesce((e.materials->>mats[1])::int,0)+a),true),array[mats[2]],to_jsonb(coalesce((e.materials->>mats[2])::int,0)+b),true),array[mats[3]],to_jsonb(coalesce((e.materials->>mats[3])::int,0)+c),true);
 skill:=coalesce(e.skills->job.skill,'{"level":1,"xp":0}'::jsonb); lvl:=coalesce((skill->>'level')::int,1); xp:=coalesce((skill->>'xp')::int,0)+25; while xp>=lvl*100 loop xp:=xp-lvl*100; lvl:=lvl+1; end loop;
 e.skills:=jsonb_set(e.skills,array[job.skill],jsonb_build_object('level',lvl,'xp',xp),true); update public.player_economies set materials=e.materials,skills=e.skills,updated_at=now() where user_id=uid; update public.life_skill_jobs set state='claimed',claimed_at=now() where id=job.id;
 return jsonb_build_object('materials',e.materials,'skills',e.skills,'reward',jsonb_build_object(mats[1],a,mats[2],b,mats[3],c)); end $$;

create or replace function public.craft_economy_recipe(p_recipe_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); e public.player_economies; arm public.player_armories; discipline text; idx int; set_id text; slot_id text; rarity text; primary_mat text; secondary_mat text; item_id text; primary_cost int; secondary_cost int; data_cost int; duplicate bool; new_state jsonb;
begin discipline:=regexp_replace(p_recipe_id,'-[0-9]+$',''); idx:=substring(p_recipe_id from '([0-9]+)$')::int; if idx not between 1 and 20 then raise exception 'Invalid recipe'; end if;
 select * into e from public.player_economies where user_id=uid for update; select * into arm from public.player_armories where user_id=uid for update; if e.user_id is null or arm.user_id is null then raise exception 'Economy or armory unavailable'; end if;
 case discipline when 'weaponsmithing' then set_id:='foundry-breaker'; primary_mat:='alloy';secondary_mat:='ore'; when 'armor-fabrication' then set_id:='signal-bastion';primary_mat:='polymer';secondary_mat:='alloy'; when 'circuit-engineering' then set_id:='aurora-relay';primary_mat:='circuit-plan';secondary_mat:='signal-glass'; when 'field-synthesis' then set_id:='flux-weaver';primary_mat:='bio-gel';secondary_mat:='coolant'; else raise exception 'Invalid recipe'; end case;
 slot_id:=(array['weapon','helmet','armor','boots'])[((idx-1)%4)+1]; rarity:=(array['green','blue','yellow','orange','prismatic'])[least(5,ceil(idx/4.0)::int)]; primary_cost:=idx+1; secondary_cost:=1+floor((idx-1)/2.0)::int; data_cost:=1+floor((idx-1)/5.0)::int;
 if coalesce((e.materials->>primary_mat)::int,0)<primary_cost or coalesce((e.materials->>secondary_mat)::int,0)<secondary_cost or coalesce((e.materials->>'data-pattern')::int,0)<data_cost then raise exception 'Not enough materials'; end if;
 e.materials:=jsonb_set(jsonb_set(jsonb_set(e.materials,array[primary_mat],to_jsonb((e.materials->>primary_mat)::int-primary_cost)),array[secondary_mat],to_jsonb((e.materials->>secondary_mat)::int-secondary_cost)),array['data-pattern'],to_jsonb((e.materials->>'data-pattern')::int-data_cost)); item_id:=set_id||':'||rarity||':'||slot_id; new_state:=arm.state; duplicate:=coalesce(new_state->'owned','[]'::jsonb)?item_id;
 if duplicate then new_state:=jsonb_set(new_state,'{shards}',to_jsonb(coalesce((new_state->>'shards')::int,0)+case rarity when 'green' then 4 when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 else 300 end),true); else new_state:=jsonb_set(new_state,'{owned}',coalesce(new_state->'owned','[]'::jsonb)||to_jsonb(item_id),true); end if;
 update public.player_economies set materials=e.materials,updated_at=now() where user_id=uid; update public.player_armories set state=new_state,updated_at=now() where user_id=uid;
 return jsonb_build_object('itemId',item_id,'duplicate',duplicate,'materials',e.materials,'armory',new_state); end $$;

create or replace function public.create_auction_listing(p_item_id text,p_price bigint,p_hours int default 24) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); arm public.player_armories; wallet public.player_wallets; new_state jsonb; enhancement int; listing public.auction_listings; deposit bigint;
begin if p_price not between 100 and 100000000 then raise exception 'Price must be between 100 and 100,000,000'; end if; select * into arm from public.player_armories where user_id=uid for update; wallet:=public.ensure_exchange_wallet(uid); select * into wallet from public.player_wallets where user_id=uid for update; new_state:=arm.state;
 if not coalesce(new_state->'owned','[]'::jsonb)?p_item_id then raise exception 'Item is not owned'; end if; if exists(select 1 from jsonb_each_text(coalesce(new_state->'equipped','{}'::jsonb)) where value=p_item_id) then raise exception 'Unequip the item first'; end if;
 deposit:=greatest(1,ceil(p_price*.01)::bigint); if wallet.balance<deposit then raise exception 'Not enough yen for listing deposit'; end if; enhancement:=coalesce((new_state->'enhancement'->>p_item_id)::int,0);
 new_state:=jsonb_set(new_state,'{owned}',coalesce((select jsonb_agg(v) from jsonb_array_elements(coalesce(new_state->'owned','[]'::jsonb)) v where v<>to_jsonb(p_item_id)),'[]'::jsonb),true); new_state:=jsonb_set(new_state,'{enhancement}',coalesce(new_state->'enhancement','{}'::jsonb)-p_item_id,true);
 update public.player_armories set state=new_state,updated_at=now() where user_id=uid; update public.player_wallets set balance=balance-deposit,version=version+1,updated_at=now() where user_id=uid returning * into wallet; perform public.mirror_wallet_to_save(uid,wallet.balance);
 insert into public.auction_listings(seller_id,item_id,enhancement,price,expires_at) values(uid,p_item_id,enhancement,p_price,now()+make_interval(hours=>least(72,greatest(1,p_hours)))) returning * into listing;
 insert into public.auction_ledger(listing_id,seller_id,event,price,fee) values(listing.id,uid,'listed',p_price,deposit); return jsonb_build_object('listingId',listing.id,'armory',new_state,'balance',wallet.balance); end $$;

create or replace function public.cancel_auction_listing(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); listing public.auction_listings; arm public.player_armories; new_state jsonb;
begin select * into listing from public.auction_listings where id=p_listing_id and seller_id=uid and status='active' for update; if not found then raise exception 'Active listing not found'; end if; select * into arm from public.player_armories where user_id=uid for update; new_state:=jsonb_set(arm.state,'{owned}',coalesce(arm.state->'owned','[]'::jsonb)||to_jsonb(listing.item_id),true); new_state:=jsonb_set(new_state,array['enhancement',listing.item_id],to_jsonb(listing.enhancement),true); update public.player_armories set state=new_state,updated_at=now() where user_id=uid; update public.auction_listings set status='cancelled',closed_at=now() where id=listing.id; insert into public.auction_ledger(listing_id,seller_id,event) values(listing.id,uid,'cancelled'); return jsonb_build_object('armory',new_state); end $$;

create or replace function public.buy_auction_listing(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.require_google_player(); listing public.auction_listings; buyer_arm public.player_armories; buyer_wallet public.player_wallets; seller_wallet public.player_wallets; new_state jsonb; fee bigint;
begin select * into listing from public.auction_listings where id=p_listing_id and status='active' for update; if not found or listing.expires_at<=now() then raise exception 'Listing is no longer available'; end if; if listing.seller_id=uid then raise exception 'You cannot buy your own listing'; end if;
 select * into buyer_arm from public.player_armories where user_id=uid for update; buyer_wallet:=public.ensure_exchange_wallet(uid); seller_wallet:=public.ensure_exchange_wallet(listing.seller_id); select * into buyer_wallet from public.player_wallets where user_id=uid for update; select * into seller_wallet from public.player_wallets where user_id=listing.seller_id for update;
 if buyer_wallet.balance<listing.price then raise exception 'Not enough yen'; end if; new_state:=buyer_arm.state; if coalesce(new_state->'owned','[]'::jsonb)?listing.item_id then raise exception 'That exact item is already owned'; end if; fee:=greatest(1,ceil(listing.price*.05)::bigint);
 new_state:=jsonb_set(new_state,'{owned}',coalesce(new_state->'owned','[]'::jsonb)||to_jsonb(listing.item_id),true); new_state:=jsonb_set(new_state,array['enhancement',listing.item_id],to_jsonb(listing.enhancement),true); update public.player_armories set state=new_state,updated_at=now() where user_id=uid;
 update public.player_wallets set balance=balance-listing.price,version=version+1,updated_at=now() where user_id=uid returning * into buyer_wallet; update public.player_wallets set balance=balance+listing.price-fee,version=version+1,updated_at=now() where user_id=listing.seller_id returning * into seller_wallet; perform public.mirror_wallet_to_save(uid,buyer_wallet.balance); perform public.mirror_wallet_to_save(listing.seller_id,seller_wallet.balance);
 update public.auction_listings set status='sold',buyer_id=uid,closed_at=now() where id=listing.id; insert into public.auction_ledger(listing_id,seller_id,buyer_id,event,price,fee) values(listing.id,listing.seller_id,uid,'sold',listing.price,fee); return jsonb_build_object('armory',new_state,'balance',buyer_wallet.balance); end $$;

revoke all on function public.ensure_my_economy(),public.get_my_economy_state(),public.start_life_skill_job(text),public.claim_life_skill_job(uuid),public.craft_economy_recipe(text),public.create_auction_listing(text,bigint,int),public.cancel_auction_listing(uuid),public.buy_auction_listing(uuid) from public,anon;
grant execute on function public.get_my_economy_state(),public.start_life_skill_job(text),public.claim_life_skill_job(uuid),public.craft_economy_recipe(text),public.create_auction_listing(text,bigint,int),public.cancel_auction_listing(uuid),public.buy_auction_listing(uuid) to authenticated;

do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='auction_listings') then alter publication supabase_realtime add table public.auction_listings; end if; end $$;

-- All battle reward callers automatically gain the expanded side-grade catalogue and
-- independent Megachip roll. No loot-stat can modify these chip odds.
create or replace function public.roll_dungeon_drop(p_state jsonb,p_level integer,p_coop boolean default false)
returns jsonb language plpgsql volatile set search_path=public,pg_temp as $$
declare s jsonb:=p_state; roll numeric:=random()*100; chip_roll numeric:=random()*100; rarity text; set_id text; slot_id text; item_id text; duplicate boolean; shard_gain integer:=0; pity integer:=coalesce((s->>'prismPity')::integer,0); chip_tier text; family text;
 sets text[]:=array['street-ronin','neon-sentinel','void-reaver','crimson-oni','ghost-protocol','chrome-wraith','biohazard-lotus','solar-shogun','glacier-viper','storm-circuit','kinetic-courier','signal-bastion','foundry-breaker','aurora-relay','flux-weaver','crown-circuit'];
 slots text[]:=array['weapon','helmet','armor','boots']; families text[]:=array['redline','abundance','bastion','velocity','overclock','assault','vital','insight','null-clock','echo','guardian','prism'];
begin
 if p_level>=10 and chip_roll<2.46 then
  chip_tier:=case when chip_roll<.01 then 'apex' when chip_roll<.06 then 'relic' when chip_roll<.46 then 'prototype' else 'standard' end;
  rarity:=case chip_tier when 'apex' then 'prismatic' when 'relic' then 'orange' when 'prototype' then 'yellow' else 'blue' end;
  family:=families[1+floor(random()*array_length(families,1))::integer]; item_id:='chip-'||family||':'||chip_tier||':megachip'; duplicate:=coalesce(s->'owned','[]'::jsonb)?item_id;
  if duplicate then shard_gain:=case rarity when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 else 300 end; else s:=jsonb_set(s,'{owned}',coalesce(s->'owned','[]'::jsonb)||to_jsonb(item_id),true); end if;
 else
  if pity>=999 or (p_level>=99 and roll>=case when p_coop then 99 else 99.5 end) then rarity:='prismatic'; elsif p_level>=70 and roll>=82 then rarity:='orange'; elsif p_level>=40 and roll>=70 then rarity:='orange'; elsif p_level>=20 and roll>=55 then rarity:='yellow'; elsif roll>=60 then rarity:='blue'; else rarity:='green'; end if;
  set_id:=sets[1+floor(random()*array_length(sets,1))::integer]; slot_id:=slots[1+floor(random()*array_length(slots,1))::integer]; item_id:=set_id||':'||rarity||':'||slot_id; duplicate:=coalesce(s->'owned','[]'::jsonb)?item_id;
  if duplicate then shard_gain:=case rarity when 'green' then 4 when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 else 300 end; else s:=jsonb_set(s,'{owned}',coalesce(s->'owned','[]'::jsonb)||to_jsonb(item_id),true); end if;
  s:=jsonb_set(s,'{prismPity}',to_jsonb(case when rarity='prismatic' then 0 else pity+1 end),true);
 end if;
 s:=jsonb_set(s,'{shards}',to_jsonb(coalesce((s->>'shards')::integer,0)+shard_gain),true); s:=jsonb_set(s,'{history}',(jsonb_build_array(jsonb_build_object('id',item_id,'duplicate',duplicate,'at',extract(epoch from now())*1000))||coalesce(s->'history','[]'::jsonb))#-'{12}',true);
 return jsonb_build_object('state',s,'drop',jsonb_build_object('id',item_id,'rarity',rarity,'duplicate',duplicate,'shards',shard_gain));
end $$;
revoke all on function public.roll_dungeon_drop(jsonb,integer,boolean) from public,anon,authenticated;
