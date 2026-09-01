-- Blackwood Combat 2.0: contracts, bounties, anti-farming and grindable relics.
-- Apply after 20260910_blackwood_market_grind.sql. Safe to re-run.

alter table public.bw_items add column if not exists drop_only boolean not null default false;

insert into public.bw_items
  (id,name,kind,price,power,description,usable,slot,rarity,attack,defense,speed,dexterity,level_required,drop_only)
values
  ('relic-harbor-iron','Harbor Iron','weapon',48000,42,'A salt-darkened revolver recovered from a sealed dock cache.',false,'primary','rare',38,2,5,3,8,true),
  ('relic-ward-stiletto','Ward Stiletto','weapon',52000,45,'A narrow blade once carried by Blackwood intelligence runners.',false,'melee','rare',31,1,12,10,8,true),
  ('relic-copperhead-gloves','Copperhead Gloves','armor',46000,38,'Weighted gloves stitched with copper wire and old family marks.',false,'gloves','rare',24,8,4,4,8,true),
  ('relic-night-watch','Night Watch','accessory',60000,44,'A silent pocket watch whose ledger records vanished names.',false,'accessory','rare',8,8,14,14,10,true),
  ('relic-st-mercy-coat','St. Mercy Coat','armor',65000,49,'A reinforced medical overcoat from the city war years.',false,'armor','rare',2,39,4,4,10,true),
  ('relic-ash-crown','Ash Crown Fedora','armor',56000,43,'A smoke-stained fedora worn by an unknown Northside boss.',false,'helmet','rare',5,22,7,9,10,true),
  ('relic-bellini-typewriter','Bellini Typewriter','weapon',175000,78,'A compact machine pistol hidden inside a customs typewriter.',false,'secondary','epic',64,2,8,4,18,true),
  ('relic-velvet-bulwark','Velvet Bulwark','armor',190000,82,'Ballistic tailoring made for a boss who expected betrayal.',false,'armor','epic',4,68,4,6,18,true),
  ('relic-gilded-oxfords','Gilded Oxfords','armor',155000,72,'Armoured dress shoes built for fast exits and hard landings.',false,'boots','epic',3,22,30,24,18,true),
  ('relic-capo-signet','Capo Signet','accessory',210000,86,'A heavy signet that opens doors before its owner speaks.',false,'accessory','epic',22,18,22,24,20,true),
  ('relic-moretti-peacemaker','Moretti Peacemaker','weapon',900000,145,'The engraved family revolver said to have ended the Five Night War.',false,'primary','legendary',118,6,12,9,30,true),
  ('relic-blackwood-oath','Blackwood Oath','armor',1000000,150,'A legendary coat assembled from the city founding families colours.',false,'armor','legendary',10,122,8,10,30,true)
on conflict(id) do update set
  name=excluded.name,kind=excluded.kind,price=excluded.price,power=excluded.power,
  description=excluded.description,usable=excluded.usable,slot=excluded.slot,rarity=excluded.rarity,
  attack=excluded.attack,defense=excluded.defense,speed=excluded.speed,dexterity=excluded.dexterity,
  level_required=excluded.level_required,drop_only=true;

create table if not exists public.bw_combat_contracts (
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_date date not null default (now() at time zone 'utc')::date,
  kind text not null check(kind in ('wins','leave','hospitalize')),
  title text not null,
  description text not null,
  progress integer not null default 0 check(progress >= 0),
  target_count integer not null check(target_count > 0),
  cash_reward bigint not null check(cash_reward >= 0),
  xp_reward integer not null check(xp_reward >= 0),
  intel_reward integer not null check(intel_reward >= 0),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(user_id,contract_date,kind)
);

create table if not exists public.bw_bounties (
  id uuid primary key default gen_random_uuid(),
  placer_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null check(amount >= 1000),
  status text not null default 'active' check(status in ('active','claimed','cancelled')),
  claimed_by uuid references auth.users(id),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  claimed_at timestamptz,
  unique(placer_id,request_id),
  check(placer_id <> target_id)
);

create table if not exists public.bw_relic_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intel integer not null default 0 check(intel between 0 and 99),
  searches bigint not null default 0 check(searches >= 0),
  relics_found integer not null default 0 check(relics_found >= 0),
  last_search_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_relic_searches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  intel_gained integer not null check(intel_gained > 0),
  efficiency numeric(5,2) not null check(efficiency between .25 and 1),
  item_id text references public.bw_items(id),
  created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

alter table public.bw_attack_logs add column if not exists request_id uuid;
alter table public.bw_attack_logs add column if not exists reward_multiplier numeric(5,2) not null default 1;
alter table public.bw_attack_logs add column if not exists rare_drop text references public.bw_items(id);
alter table public.bw_attack_logs add column if not exists bounty_claimed bigint not null default 0;
alter table public.bw_attack_logs add column if not exists combat_log jsonb not null default '[]'::jsonb;
create unique index if not exists bw_attack_request_unique on public.bw_attack_logs(attacker_id,request_id) where request_id is not null;
create index if not exists bw_attack_pair_recent_idx on public.bw_attack_logs(attacker_id,defender_id,created_at desc);
create index if not exists bw_bounties_target_active_idx on public.bw_bounties(target_id,status,expires_at);
create index if not exists bw_relic_search_recent_idx on public.bw_relic_searches(user_id,created_at desc);

alter table public.bw_combat_contracts enable row level security;
alter table public.bw_bounties enable row level security;
alter table public.bw_relic_progress enable row level security;
alter table public.bw_relic_searches enable row level security;

drop policy if exists "users read own combat contracts" on public.bw_combat_contracts;
create policy "users read own combat contracts" on public.bw_combat_contracts for select to authenticated using(auth.uid()=user_id);
drop policy if exists "players read bounties" on public.bw_bounties;
create policy "players read bounties" on public.bw_bounties for select to authenticated using(true);
drop policy if exists "users read own relic progress" on public.bw_relic_progress;
create policy "users read own relic progress" on public.bw_relic_progress for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own relic searches" on public.bw_relic_searches;
create policy "users read own relic searches" on public.bw_relic_searches for select to authenticated using(auth.uid()=user_id);

revoke insert,update,delete on public.bw_combat_contracts,public.bw_bounties,public.bw_relic_progress,public.bw_relic_searches from authenticated,anon;
grant select on public.bw_combat_contracts,public.bw_bounties,public.bw_relic_progress,public.bw_relic_searches to authenticated;

create or replace function public.bw_ensure_daily_contracts(p_uid uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare today date := (now() at time zone 'utc')::date;
begin
  insert into public.bw_combat_contracts(user_id,contract_date,kind,title,description,target_count,cash_reward,xp_reward,intel_reward)
  values
    (p_uid,today,'wins','Settle the Street','Win three fights against real players.',3,3000,80,18),
    (p_uid,today,'leave','Measured Force','Win and leave two defeated opponents.',2,2600,65,15),
    (p_uid,today,'hospitalize','Send a Message','Hospitalize one opponent.',1,4200,110,25)
  on conflict(user_id,contract_date,kind) do nothing;
end $$;
revoke all on function public.bw_ensure_daily_contracts(uuid) from public,anon,authenticated;

create or replace function public.bw_award_relic(p_uid uuid,p_rarity text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare found text;
begin
  select id into found from public.bw_items
  where drop_only and rarity=p_rarity and level_required <= coalesce((select level+12 from public.bw_player_states where user_id=p_uid),12)
  order by random() limit 1;
  if found is null then select id into found from public.bw_items where drop_only and rarity=p_rarity order by level_required,id limit 1; end if;
  if found is not null then
    insert into public.bw_inventory(user_id,item_id,quantity,equipped) values(p_uid,found,1,false)
    on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1;
  end if;
  return found;
end $$;
revoke all on function public.bw_award_relic(uuid,text) from public,anon,authenticated;

create or replace function public.bw_combat_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); state public.bw_player_states; today date:=(now() at time zone 'utc')::date; result jsonb;
begin
  state:=public.bw_refresh_player(uid);
  perform public.bw_ensure_daily_contracts(uid);
  insert into public.bw_relic_progress(user_id) values(uid) on conflict(user_id) do nothing;
  select jsonb_build_object(
    'player',to_jsonb(state)||jsonb_build_object('cash',(public.ensure_exchange_wallet(uid)).balance),
    'bonuses',jsonb_build_object(
      'attack',coalesce((select sum(i.attack) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),
      'defense',coalesce((select sum(i.defense) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),
      'speed',coalesce((select sum(i.speed) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),
      'dexterity',coalesce((select sum(i.dexterity) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0)
    ),
    'opponents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.display_name,'level',coalesce(s.level,1),'respect',coalesce(s.respect,0),
      'status',coalesce(case when s.status_until<=now() then 'okay' else s.status end,'okay'),'statusUntil',s.status_until,
      'newProtected',p.created_at>now()-interval '24 hours',
      'attacksThisHour',(select count(*) from public.bw_attack_logs a where a.attacker_id=uid and a.defender_id=p.id and a.created_at>now()-interval '1 hour'),
      'repeatWins',(select count(*) from public.bw_attack_logs a where a.attacker_id=uid and a.defender_id=p.id and a.winner_id=uid and a.created_at>now()-interval '24 hours'),
      'bounty',coalesce((select sum(b.amount) from public.bw_bounties b where b.target_id=p.id and b.status='active' and b.expires_at>now()),0)
    ) order by coalesce(s.level,1),p.display_name) from public.profiles p left join public.bw_player_states s on s.user_id=p.id where p.id<>uid),'[]'::jsonb),
    'contracts',coalesce((select jsonb_agg(jsonb_build_object('kind',c.kind,'title',c.title,'description',c.description,'progress',c.progress,'target',c.target_count,'cash',c.cash_reward,'xp',c.xp_reward,'intel',c.intel_reward,'claimedAt',c.claimed_at) order by c.created_at,c.kind) from public.bw_combat_contracts c where c.user_id=uid and c.contract_date=today),'[]'::jsonb),
    'bounties',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'targetId',b.target_id,'targetName',tp.display_name,'placerName',pp.display_name,'amount',b.amount,'expiresAt',b.expires_at) order by b.amount desc,b.created_at) from public.bw_bounties b join public.profiles tp on tp.id=b.target_id join public.profiles pp on pp.id=b.placer_id where b.status='active' and b.expires_at>now()),'[]'::jsonb),
    'myBounties',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'targetName',tp.display_name,'amount',b.amount,'status',b.status,'expiresAt',b.expires_at) order by b.created_at desc) from public.bw_bounties b join public.profiles tp on tp.id=b.target_id where b.placer_id=uid limit 30),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'attackerName',ap.display_name,'defenderName',dp.display_name,'won',a.winner_id=a.attacker_id,'outcome',a.outcome,'cash',a.cash_moved,'bounty',a.bounty_claimed,'dropId',a.rare_drop,'dropName',ri.name,'multiplier',a.reward_multiplier,'createdAt',a.created_at,'mine',a.attacker_id=uid) order by a.created_at desc) from public.bw_attack_logs a join public.profiles ap on ap.id=a.attacker_id join public.profiles dp on dp.id=a.defender_id left join public.bw_items ri on ri.id=a.rare_drop where uid in(a.attacker_id,a.defender_id) and a.created_at>now()-interval '30 days' limit 30),'[]'::jsonb),
    'relic',coalesce((select jsonb_build_object('intel',r.intel,'searches',r.searches,'found',r.relics_found,'lastSearchAt',r.last_search_at,'todaySearches',(select count(*) from public.bw_relic_searches x where x.user_id=uid and x.created_at>date_trunc('day',now() at time zone 'utc'))) from public.bw_relic_progress r where r.user_id=uid),'{}'::jsonb),
    'relicCatalog',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'rarity',i.rarity,'slot',i.slot,'attack',i.attack,'defense',i.defense,'speed',i.speed,'dexterity',i.dexterity,'level',i.level_required,'owned',coalesce(v.quantity,0)) order by case i.rarity when 'rare' then 1 when 'epic' then 2 else 3 end,i.name) from public.bw_items i left join public.bw_inventory v on v.user_id=uid and v.item_id=i.id where i.drop_only),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.bw_search_relic_cache(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); state public.bw_player_states; profile public.bw_relic_progress; today_runs integer; efficiency numeric; raw_intel integer; gained integer; total integer; found text; rarity text; prior public.bw_relic_searches;
begin
  if p_request_id is null then raise exception 'request id required'; end if;
  select * into prior from public.bw_relic_searches where user_id=uid and request_id=p_request_id;
  if prior.id is not null then return jsonb_build_object('event',jsonb_build_object('intel',prior.intel_gained,'dropId',prior.item_id,'duplicate',true),'combat',public.bw_combat_snapshot()); end if;
  state:=public.bw_refresh_player(uid);
  if state.status<>'okay' then raise exception 'cache search unavailable while %',state.status; end if;
  insert into public.bw_relic_progress(user_id) values(uid) on conflict(user_id) do nothing;
  select * into profile from public.bw_relic_progress where user_id=uid for update;
  if profile.last_search_at is not null and profile.last_search_at>now()-interval '10 seconds' then raise exception 'wait a few seconds before searching again'; end if;
  select count(*) into today_runs from public.bw_relic_searches where user_id=uid and created_at>date_trunc('day',now() at time zone 'utc');
  efficiency:=greatest(.25,case when today_runs<30 then 1 when today_runs<60 then .7 when today_runs<100 then .45 else .25 end);
  raw_intel:=2+floor(random()*4)::integer;
  gained:=greatest(1,floor(raw_intel*efficiency)::integer);
  total:=profile.intel+gained;
  if total>=100 then
    rarity:=case when random()<.01 then 'legendary' when random()<.12 then 'epic' else 'rare' end;
    found:=public.bw_award_relic(uid,rarity);
    total:=total-100;
  end if;
  update public.bw_relic_progress set intel=total,searches=searches+1,relics_found=relics_found+case when found is null then 0 else 1 end,last_search_at=now(),updated_at=now() where user_id=uid;
  insert into public.bw_relic_searches(user_id,request_id,intel_gained,efficiency,item_id) values(uid,p_request_id,gained,efficiency,found);
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'relic',case when found is null then 'Recovered underworld intel' else 'Recovered '||(select name from public.bw_items where id=found) end,jsonb_build_object('intel',gained,'item',found,'efficiency',efficiency));
  return jsonb_build_object('event',jsonb_build_object('intel',gained,'dropId',found,'dropName',(select name from public.bw_items where id=found),'rarity',rarity,'efficiency',efficiency),'combat',public.bw_combat_snapshot());
end $$;

create or replace function public.bw_place_bounty(p_target uuid,p_amount bigint,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); wallet public.player_wallets; amount bigint:=greatest(1000,p_amount);
begin
  if p_target=uid then raise exception 'you cannot place a bounty on yourself'; end if;
  if not exists(select 1 from public.profiles where id=p_target) then raise exception 'player not found'; end if;
  if p_request_id is null then raise exception 'request id required'; end if;
  if exists(select 1 from public.bw_bounties where placer_id=uid and request_id=p_request_id) then return public.bw_combat_snapshot(); end if;
  wallet:=public.ensure_exchange_wallet(uid);
  if wallet.balance<amount then raise exception 'insufficient cash'; end if;
  update public.player_wallets set balance=balance-amount,version=version+1,updated_at=now() where user_id=uid;
  insert into public.bw_bounties(placer_id,target_id,amount,request_id) values(uid,p_target,amount,p_request_id);
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'bounty','Placed a bounty',jsonb_build_object('target',p_target,'amount',amount));
  return public.bw_combat_snapshot();
end $$;

create or replace function public.bw_cancel_bounty(p_bounty uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); bounty public.bw_bounties;
begin
  select * into bounty from public.bw_bounties where id=p_bounty and placer_id=uid and status='active' for update;
  if bounty.id is null then raise exception 'active bounty not found'; end if;
  update public.bw_bounties set status='cancelled' where id=bounty.id;
  update public.player_wallets set balance=balance+bounty.amount,version=version+1,updated_at=now() where user_id=uid;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  return public.bw_combat_snapshot();
end $$;

create or replace function public.bw_claim_combat_contract(p_kind text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); today date:=(now() at time zone 'utc')::date; contract public.bw_combat_contracts; relic public.bw_relic_progress; total integer; found text; rarity text;
begin
  perform public.bw_ensure_daily_contracts(uid);
  select * into contract from public.bw_combat_contracts where user_id=uid and contract_date=today and kind=p_kind for update;
  if contract.kind is null then raise exception 'contract not found'; end if;
  if contract.claimed_at is not null then raise exception 'contract already claimed'; end if;
  if contract.progress<contract.target_count then raise exception 'contract incomplete'; end if;
  update public.bw_combat_contracts set claimed_at=now() where user_id=uid and contract_date=today and kind=p_kind;
  update public.player_wallets set balance=balance+contract.cash_reward,version=version+1,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,contract.xp_reward);
  insert into public.bw_relic_progress(user_id) values(uid) on conflict(user_id) do nothing;
  select * into relic from public.bw_relic_progress where user_id=uid for update;
  total:=relic.intel+contract.intel_reward;
  if total>=100 then rarity:=case when random()<.02 then 'legendary' when random()<.15 then 'epic' else 'rare' end; found:=public.bw_award_relic(uid,rarity); total:=total-100; end if;
  update public.bw_relic_progress set intel=total,relics_found=relics_found+case when found is null then 0 else 1 end,updated_at=now() where user_id=uid;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'contract','Completed '||contract.title,jsonb_build_object('cash',contract.cash_reward,'xp',contract.xp_reward,'intel',contract.intel_reward,'item',found));
  return jsonb_build_object('event',jsonb_build_object('cash',contract.cash_reward,'xp',contract.xp_reward,'intel',contract.intel_reward,'dropId',found,'dropName',(select name from public.bw_items where id=found)),'combat',public.bw_combat_snapshot());
end $$;

create or replace function public.bw_combat_attack(p_target uuid,p_outcome text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); a public.bw_player_states; d public.bw_player_states; ap numeric; dp numeric; win boolean; moved bigint:=0; bounty_total bigint:=0; target_wallet public.player_wallets; repeats integer; recent integer; multiplier numeric; drop_id text; drop_rarity text; roll numeric; log_rows jsonb; prior public.bw_attack_logs;
begin
  if p_request_id is null then raise exception 'request id required'; end if;
  select * into prior from public.bw_attack_logs where attacker_id=uid and request_id=p_request_id;
  if prior.id is not null then return jsonb_build_object('event',jsonb_build_object('won',prior.winner_id=uid,'cash',prior.cash_moved,'bounty',prior.bounty_claimed,'dropId',prior.rare_drop,'log',prior.combat_log,'duplicate',true),'combat',public.bw_combat_snapshot()); end if;
  if p_target=uid then raise exception 'you cannot attack yourself'; end if;
  if p_outcome not in('leave','mug','hospitalize') then raise exception 'invalid outcome'; end if;
  if not exists(select 1 from public.profiles where id=p_target) then raise exception 'player not found'; end if;
  if exists(select 1 from public.profiles where id=p_target and created_at>now()-interval '24 hours') then raise exception 'new player protection is active'; end if;
  select count(*) into recent from public.bw_attack_logs where attacker_id=uid and defender_id=p_target and created_at>now()-interval '1 hour';
  if recent>=3 then raise exception 'target protection: choose someone else for a while'; end if;
  a:=public.bw_refresh_player(uid); d:=public.bw_refresh_player(p_target);
  if a.status<>'okay' then raise exception 'you are currently %',a.status; end if;
  if d.status<>'okay' then raise exception 'target is currently %',d.status; end if;
  if a.energy<25 then raise exception '25 energy required'; end if;
  perform 1 from public.bw_player_states where user_id in(uid,p_target) order by user_id for update;
  select count(*) into repeats from public.bw_attack_logs where attacker_id=uid and defender_id=p_target and winner_id=uid and created_at>now()-interval '24 hours';
  multiplier:=greatest(.10,1-(repeats*.25));
  ap:=(a.strength*.45+a.speed*.25+a.dexterity*.20+a.defense*.10+
      coalesce((select sum(i.attack*2+i.speed+i.dexterity) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0))*(.88+random()*.24);
  dp:=(d.defense*.45+d.dexterity*.25+d.speed*.20+d.strength*.10+
      coalesce((select sum(i.defense*2+i.dexterity+i.speed) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=p_target),0))*(.88+random()*.24);
  win:=ap>=dp;
  update public.bw_player_states set energy=energy-25,updated_at=now() where user_id=uid;
  log_rows:=jsonb_build_array(
    jsonb_build_object('round',1,'text','You pressed the attack through the opening exchange.','attacker',round(ap*.34),'defender',round(dp*.31)),
    jsonb_build_object('round',2,'text',case when ap>=dp then 'Your loadout created the decisive advantage.' else 'The defender read your approach and countered.' end,'attacker',round(ap*.33),'defender',round(dp*.34)),
    jsonb_build_object('round',3,'text',case when win then 'The opponent went down.' else 'You were forced out of the fight.' end,'attacker',round(ap*.33),'defender',round(dp*.35))
  );
  if win then
    update public.bw_player_states set fights_won=fights_won+1,respect=respect+greatest(1,floor((case p_outcome when 'hospitalize' then 4 else 2 end)*multiplier)::integer) where user_id=uid;
    update public.bw_player_states set status='hospital',status_until=now()+case p_outcome when 'hospitalize' then interval '3 hours' when 'mug' then interval '40 minutes' else interval '20 minutes' end,health=greatest(1,health-floor(ap/15)::integer) where user_id=p_target;
    perform public.bw_gain_xp(uid,greatest(3,floor(30*multiplier)::integer));
    if p_outcome='mug' then
      target_wallet:=public.ensure_exchange_wallet(p_target);
      moved:=least(target_wallet.balance,floor(target_wallet.balance*(.03+random()*.04)*multiplier)::bigint,250000);
      update public.player_wallets set balance=balance-moved,version=version+1,updated_at=now() where user_id=p_target;
      update public.player_wallets set balance=balance+moved,version=version+1,updated_at=now() where user_id=uid;
      perform public.mirror_wallet_to_save(p_target,(select balance from public.player_wallets where user_id=p_target));
    end if;
    perform 1 from public.bw_bounties where target_id=p_target and placer_id<>uid and status='active' and expires_at>now() for update;
    select coalesce(sum(amount),0) into bounty_total from public.bw_bounties where target_id=p_target and placer_id<>uid and status='active' and expires_at>now();
    if bounty_total>0 then
      update public.bw_bounties set status='claimed',claimed_by=uid,claimed_at=now() where target_id=p_target and placer_id<>uid and status='active' and expires_at>now();
      update public.player_wallets set balance=balance+bounty_total,version=version+1,updated_at=now() where user_id=uid;
    end if;
    if repeats=0 then
      roll:=random();
      if roll<.0005 then drop_rarity:='legendary'; elsif roll<.004 then drop_rarity:='epic'; elsif roll<.03 then drop_rarity:='rare'; end if;
      if drop_rarity is not null then drop_id:=public.bw_award_relic(uid,drop_rarity); end if;
    end if;
    perform public.bw_ensure_daily_contracts(uid);
    update public.bw_combat_contracts set progress=least(target_count,progress+1) where user_id=uid and contract_date=(now() at time zone 'utc')::date and claimed_at is null and (kind='wins' or kind=p_outcome);
  else
    update public.bw_player_states set fights_lost=fights_lost+1,status='hospital',status_until=now()+interval '30 minutes',health=1 where user_id=uid;
    update public.bw_player_states set fights_won=fights_won+1 where user_id=p_target;
  end if;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_attack_logs(attacker_id,defender_id,winner_id,outcome,cash_moved,attacker_power,defender_power,request_id,reward_multiplier,rare_drop,bounty_claimed,combat_log)
  values(uid,p_target,case when win then uid else p_target end,p_outcome,moved,round(ap),round(dp),p_request_id,multiplier,drop_id,bounty_total,log_rows);
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'combat',case when win then 'Defeated ' else 'Lost to ' end||(select display_name from public.profiles where id=p_target),jsonb_build_object('won',win,'outcome',p_outcome,'cash',moved,'bounty',bounty_total,'item',drop_id,'multiplier',multiplier));
  perform public.bw_check_awards(uid);
  return jsonb_build_object('event',jsonb_build_object('won',win,'cash',moved,'bounty',bounty_total,'attackerPower',round(ap),'defenderPower',round(dp),'multiplier',multiplier,'dropId',drop_id,'dropName',(select name from public.bw_items where id=drop_id),'rarity',drop_rarity,'log',log_rows),'combat',public.bw_combat_snapshot());
end $$;

-- Drop-only relics cannot be purchased from the city catalog. They remain tradable player assets.
create or replace function public.bw_buy_item(p_item_id text,p_quantity integer default 1) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; w public.player_wallets; q integer:=least(100,greatest(1,p_quantity)); total bigint;
begin
  perform public.bw_ensure_player(uid);
  select * into i from public.bw_items where id=p_item_id;
  if i.id is null then raise exception 'item not found'; end if;
  if i.drop_only then raise exception 'this relic can only be found or traded by players'; end if;
  total:=i.price*q; w:=public.ensure_exchange_wallet(uid);
  if w.balance<total then raise exception 'insufficient cash'; end if;
  update public.player_wallets set balance=balance-total,version=version+1,updated_at=now() where user_id=uid;
  insert into public.bw_inventory(user_id,item_id,quantity) values(uid,i.id,q) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+excluded.quantity;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'shop','Purchased '||q||' × '||i.name,jsonb_build_object('cost',total));
  return public.bw_get_state();
end $$;

revoke all on function public.bw_combat_snapshot(),public.bw_search_relic_cache(uuid),public.bw_place_bounty(uuid,bigint,uuid),public.bw_cancel_bounty(uuid),public.bw_claim_combat_contract(text),public.bw_combat_attack(uuid,text,uuid) from public,anon;
grant execute on function public.bw_combat_snapshot(),public.bw_search_relic_cache(uuid),public.bw_place_bounty(uuid,bigint,uuid),public.bw_cancel_bounty(uuid),public.bw_claim_combat_contract(text),public.bw_combat_attack(uuid,text,uuid) to authenticated;
revoke all on function public.bw_buy_item(text,integer) from public,anon;
grant execute on function public.bw_buy_item(text,integer) to authenticated;

create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),'career',public.bw_job_snapshot(),
    'forex',public.bw_broker_snapshot('XAU/USD','1min'),'loadout',public.bw_get_loadout(),
    'family',public.bw_family_snapshot(),'market',public.bw_market_snapshot(),'hustles',public.bw_hustle_snapshot(),
    'combat',public.bw_combat_snapshot(),
    'available_pages',array['home','crimes','hustles','combat','gym','work','missions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','economy','arcade']
  );
end;
$$;
grant execute on function public.bw_adviser_context() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_bounties') then alter publication supabase_realtime add table public.bw_bounties; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_combat_contracts') then alter publication supabase_realtime add table public.bw_combat_contracts; end if;
end $$;
