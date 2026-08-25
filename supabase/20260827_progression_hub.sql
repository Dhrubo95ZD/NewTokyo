-- Unified character progression, armory recycling, AFK dungeons and co-op expeditions.
-- Apply after schema.sql, 20260824_district_one_progression.sql and
-- 20260825_neo_exchange.sql.

do $$ begin
  if to_regprocedure('public.require_google_player()') is null
    or to_regprocedure('public.ensure_exchange_wallet(uuid)') is null then
    raise exception 'Apply the account progression and Neo Exchange migrations first';
  end if;
end $$;

create table if not exists public.dungeon_catalog (
  id text primary key,
  level_required integer not null check (level_required between 1 and 99),
  name text not null,
  district text not null,
  recommended_cp integer not null check (recommended_cp >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 120),
  shards_per_hour integer not null check (shards_per_hour > 0),
  rarity_label text not null,
  boss_name text not null
);

insert into public.dungeon_catalog(id,level_required,name,district,recommended_cp,duration_minutes,shards_per_hour,rarity_label,boss_name) values
('street-drain',1,'Street Drain','Ward 09',0,10,8,'Green → Blue','Drain Warden'),
('service-tunnels',5,'Neon Service Tunnels','East Market',220,12,12,'Green → Blue','Tunnel Keeper'),
('market-vaults',10,'East Market Vaults','District One',450,15,18,'Green → Yellow','Vault Sentinel'),
('flooded-metro',20,'Flooded Metro','Lowline',900,18,28,'Blue → Yellow','Tide Engine'),
('glassworks',30,'Shattered Glassworks','South Ring',1500,20,42,'Blue → Orange','Kiln Guardian'),
('iron-ward',40,'Iron Ward Bastion','Ward 12',2400,24,60,'Yellow → Orange','Bastion Marshal'),
('orbital-freight',50,'Orbital Freight Spine','Skyrail',3600,28,82,'Yellow → Orange','Freight Colossus'),
('storm-archive',60,'Storm Archive','Data Quarter',5200,32,110,'Yellow → Orange','Archive Tempest'),
('ember-citadel',70,'Ember Citadel','Foundry Crown',7200,36,145,'Orange','Citadel Regent'),
('aurora-rift',80,'Aurora Rift','Northern Verge',9600,40,190,'Orange → Prismatic','Rift Custodian'),
('crownless-tower',90,'Crownless Tower','Central Spire',12500,45,250,'Orange → Prismatic','Tower Arbiter'),
('prism-core',99,'Prism Core','City Heart',16000,50,340,'Prismatic chase','Core Sovereign')
on conflict (id) do update set
  level_required=excluded.level_required,name=excluded.name,district=excluded.district,
  recommended_cp=excluded.recommended_cp,duration_minutes=excluded.duration_minutes,
  shards_per_hour=excluded.shards_per_hour,rarity_label=excluded.rarity_label,boss_name=excluded.boss_name;

create table if not exists public.player_dungeon_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_level integer not null default 0,
  clears jsonb not null default '{}'::jsonb,
  afk_dungeon_id text references public.dungeon_catalog(id),
  afk_started_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.dungeon_parties (
  id uuid primary key default gen_random_uuid(),
  dungeon_id text not null references public.dungeon_catalog(id),
  leader_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'waiting' check (state in ('waiting','active','complete','closed')),
  member_count integer not null default 1 check (member_count between 1 and 3),
  started_at timestamptz,
  completes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dungeon_party_members (
  party_id uuid not null references public.dungeon_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  combat_power integer not null check (combat_power >= 0),
  joined_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (party_id,user_id),
  unique (user_id)
);

alter table public.dungeon_catalog enable row level security;
alter table public.player_dungeon_progress enable row level security;
alter table public.dungeon_parties enable row level security;
alter table public.dungeon_party_members enable row level security;
drop policy if exists "signed users read dungeons" on public.dungeon_catalog;
drop policy if exists "users read own dungeon progress" on public.player_dungeon_progress;
drop policy if exists "signed users read dungeon parties" on public.dungeon_parties;
drop policy if exists "signed users read dungeon party members" on public.dungeon_party_members;
create policy "signed users read dungeons" on public.dungeon_catalog for select to authenticated using (true);
create policy "users read own dungeon progress" on public.player_dungeon_progress for select to authenticated using (auth.uid()=user_id);
create policy "signed users read dungeon parties" on public.dungeon_parties for select to authenticated using (true);
create policy "signed users read dungeon party members" on public.dungeon_party_members for select to authenticated using (true);
revoke insert,update,delete on public.dungeon_catalog,public.player_dungeon_progress,public.dungeon_parties,public.dungeon_party_members from anon,authenticated;
grant select on public.dungeon_catalog,public.player_dungeon_progress,public.dungeon_parties,public.dungeon_party_members to authenticated;

create or replace function public.armory_item_combat_power(p_item_id text,p_level integer default 0)
returns integer language plpgsql immutable set search_path=public,pg_temp as $$
declare
  set_id text:=split_part(p_item_id,':',1); rarity text:=split_part(p_item_id,':',2); slot_id text:=split_part(p_item_id,':',3);
  set_index integer; rarity_rank integer; tier numeric; factor numeric; raw_total integer:=0; enhanced_total integer:=0; boost numeric:=1+greatest(0,least(20,p_level))*.06;
  sets text[]:=array['street-ronin','neon-sentinel','void-reaver','crimson-oni','ghost-protocol','chrome-wraith','biohazard-lotus','solar-shogun','glacier-viper','storm-circuit'];
begin
  set_index:=array_position(sets,set_id);
  if set_index is null or slot_id not in ('weapon','helmet','armor','boots') then return 0; end if;
  rarity_rank:=case rarity when 'green' then 1 when 'blue' then 2 when 'yellow' then 3 when 'orange' then 4 when 'prismatic' then 5 else 0 end;
  tier:=case rarity when 'green' then 1 when 'blue' then 1.7 when 'yellow' then 2.8 when 'orange' then 4.5 when 'prismatic' then 7.5 else 0 end;
  factor:=tier*(1+(set_index-1)*.025);
  if slot_id='weapon' then enhanced_total:=round(round(7*factor)*boost);
  elsif slot_id='helmet' then enhanced_total:=round(round(3*factor)*boost)+round(round(2*factor)*boost);
  elsif slot_id='armor' then enhanced_total:=round(round(8*factor)*boost);
  else enhanced_total:=round(round(5*factor)*boost)+round(round(1*factor)*boost);
  end if;
  return greatest(0,enhanced_total*14+rarity_rank*18);
end $$;
revoke all on function public.armory_item_combat_power(text,integer) from public,anon,authenticated;

create or replace function public.calculate_player_combat_power(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb; core jsonb; slot_id text; item_id text; item_level integer; result integer;
begin
  select state into s from public.player_armories where user_id=p_user_id;
  select coalesce(save_data->'core','{}'::jsonb) into core from public.player_saves where user_id=p_user_id;
  result:=greatest(1,coalesce((core->>'level')::integer,1))*30+
    (greatest(0,coalesce((core#>>'{stats,str}')::integer,0))+greatest(0,coalesce((core#>>'{stats,def}')::integer,0))+
     greatest(0,coalesce((core#>>'{stats,spd}')::integer,0))+greatest(0,coalesce((core#>>'{stats,dex}')::integer,0)))*8;
  foreach slot_id in array array['weapon','helmet','armor','boots'] loop
    item_id:=s#>>array['equipped',slot_id];
    if item_id is not null then
      item_level:=coalesce((s#>>array['enhancement',item_id])::integer,0);
      result:=result+public.armory_item_combat_power(item_id,item_level);
    end if;
  end loop;
  return greatest(0,result);
end $$;
revoke all on function public.calculate_player_combat_power(uuid) from public,anon,authenticated;

create or replace function public.manage_my_armory(p_equipped jsonb default null,p_item_ids text[] default array[]::text[],p_mode text default 'salvage')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  player_id uuid:=public.require_google_player(); row public.player_armories; s jsonb; loadout jsonb; owned jsonb; enhancements jsonb;
  item_id text; slot_id text; rarity text; level integer; base integer; gain integer; shard_gain integer:=0; yen_gain bigint:=0; wallet public.player_wallets;
begin
  select * into row from public.player_armories where user_id=player_id for update;
  if row.user_id is null then row:=public.ensure_armory(); end if;
  s:=row.state; loadout:=coalesce(p_equipped,s->'equipped','{}'::jsonb); owned:=coalesce(s->'owned','[]'::jsonb); enhancements:=coalesce(s->'enhancement','{}'::jsonb);
  foreach slot_id in array array['weapon','helmet','armor','boots'] loop
    item_id:=loadout->>slot_id;
    if item_id is not null and (not (owned ? item_id) or split_part(item_id,':',3)<>slot_id) then raise exception 'invalid item in % slot',slot_id; end if;
  end loop;
  if lower(p_mode) not in ('salvage','sell','equip') then raise exception 'invalid armory action'; end if;
  foreach item_id in array coalesce(p_item_ids,array[]::text[]) loop
    if not (owned ? item_id) then raise exception 'item is not owned'; end if;
    if item_id=any(array[loadout->>'weapon',loadout->>'helmet',loadout->>'armor',loadout->>'boots']) then raise exception 'equipped items are protected'; end if;
    rarity:=split_part(item_id,':',2); level:=coalesce((enhancements->>item_id)::integer,0);
    base:=case rarity when 'green' then 4 when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 when 'prismatic' then 300 else 0 end;
    gain:=base+floor(base*level*.35)::integer;
    if lower(p_mode)='sell' then yen_gain:=yen_gain+gain*75; else shard_gain:=shard_gain+gain; end if;
    owned:=owned-item_id; enhancements:=enhancements-item_id;
  end loop;
  s:=jsonb_set(s,'{owned}',owned,true);
  s:=jsonb_set(s,'{enhancement}',enhancements,true);
  s:=jsonb_set(s,'{equipped}',loadout,true);
  s:=jsonb_set(s,'{shards}',to_jsonb(greatest(0,coalesce((s->>'shards')::integer,0)+shard_gain)),true);
  update public.player_armories set state=s,updated_at=now() where user_id=player_id;
  if yen_gain>0 then
    wallet:=public.ensure_exchange_wallet(player_id);
    update public.player_wallets set balance=balance+yen_gain,version=version+1,updated_at=now() where user_id=player_id returning * into wallet;
    insert into public.exchange_ledger(user_id,event,amount,balance_after,idempotency,metadata)
      values(player_id,'gear_sale',yen_gain,wallet.balance,gen_random_uuid(),jsonb_build_object('items',cardinality(p_item_ids)));
    perform public.mirror_wallet_to_save(player_id,wallet.balance);
  end if;
  return jsonb_build_object('state',s,'shards',shard_gain,'yen',yen_gain,'balance',case when yen_gain>0 then wallet.balance else null end);
end $$;

create or replace function public.roll_dungeon_drop(p_state jsonb,p_level integer,p_coop boolean default false)
returns jsonb language plpgsql volatile set search_path=public,pg_temp as $$
declare
  s jsonb:=p_state; roll numeric:=random()*100; rarity text; set_id text; slot_id text; item_id text; duplicate boolean; shard_gain integer:=0; pity integer:=coalesce((s->>'prismPity')::integer,0);
  sets text[]:=array['street-ronin','neon-sentinel','void-reaver','crimson-oni','ghost-protocol','chrome-wraith','biohazard-lotus','solar-shogun','glacier-viper','storm-circuit'];
  slots text[]:=array['weapon','helmet','armor','boots'];
begin
  if pity>=999 or (p_level>=99 and roll>=case when p_coop then 99 else 99.5 end) then rarity:='prismatic';
  elsif p_level>=70 and roll>=82 then rarity:='orange';
  elsif p_level>=40 and roll>=70 then rarity:='orange';
  elsif p_level>=20 and roll>=55 then rarity:='yellow';
  elsif roll>=60 then rarity:='blue'; else rarity:='green'; end if;
  set_id:=sets[1+floor(random()*array_length(sets,1))::integer]; slot_id:=slots[1+floor(random()*array_length(slots,1))::integer];
  item_id:=set_id||':'||rarity||':'||slot_id; duplicate:=coalesce(s->'owned','[]'::jsonb)?item_id;
  if duplicate then shard_gain:=case rarity when 'green' then 4 when 'blue' then 10 when 'yellow' then 25 when 'orange' then 80 else 300 end;
  else s:=jsonb_set(s,'{owned}',coalesce(s->'owned','[]'::jsonb)||to_jsonb(item_id),true); end if;
  s:=jsonb_set(s,'{shards}',to_jsonb(coalesce((s->>'shards')::integer,0)+shard_gain),true);
  s:=jsonb_set(s,'{prismPity}',to_jsonb(case when rarity='prismatic' then 0 else pity+1 end),true);
  s:=jsonb_set(s,'{history}',(jsonb_build_array(jsonb_build_object('id',item_id,'duplicate',duplicate,'at',extract(epoch from now())*1000))||coalesce(s->'history','[]'::jsonb))#-'{12}',true);
  return jsonb_build_object('state',s,'drop',jsonb_build_object('id',item_id,'rarity',rarity,'duplicate',duplicate,'shards',shard_gain));
end $$;
revoke all on function public.roll_dungeon_drop(jsonb,integer,boolean) from public,anon,authenticated;

create or replace function public.get_my_progression_state()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); progress public.player_dungeon_progress; party jsonb; roster jsonb; cp integer;
begin
  insert into public.player_dungeon_progress(user_id) values(player_id) on conflict(user_id) do nothing;
  select * into progress from public.player_dungeon_progress where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  select to_jsonb(p) into party from public.dungeon_parties p join public.dungeon_party_members m on m.party_id=p.id where m.user_id=player_id limit 1;
  if party is not null then
    select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(pr.display_name,'Runner'),'cp',m.combat_power,'claimedAt',m.claimed_at) order by m.joined_at),'[]'::jsonb)
      into roster from public.dungeon_party_members m left join public.profiles pr on pr.id=m.user_id where m.party_id=(party->>'id')::uuid;
    party:=party||jsonb_build_object('roster',roster);
  end if;
  return jsonb_build_object('combatPower',cp,'bestLevel',progress.best_level,'clears',progress.clears,'afk',case when progress.afk_dungeon_id is null then null else jsonb_build_object('dungeonId',progress.afk_dungeon_id,'startedAt',progress.afk_started_at) end,'party',party);
end $$;

create or replace function public.start_afk_dungeon(p_dungeon_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); dungeon public.dungeon_catalog; progress public.player_dungeon_progress; cp integer; player_level integer;
begin
  select * into dungeon from public.dungeon_catalog where id=p_dungeon_id;
  if dungeon.id is null then raise exception 'unknown dungeon'; end if;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<dungeon.level_required then raise exception 'runner level is too low'; end if;
  if cp<dungeon.recommended_cp then raise exception 'combat power is too low'; end if;
  insert into public.player_dungeon_progress(user_id) values(player_id) on conflict(user_id) do nothing;
  select * into progress from public.player_dungeon_progress where user_id=player_id for update;
  if progress.afk_dungeon_id is not null then raise exception 'an AFK dungeon is already active'; end if;
  update public.player_dungeon_progress set afk_dungeon_id=dungeon.id,afk_started_at=now(),updated_at=now() where user_id=player_id;
  return jsonb_build_object('dungeonId',dungeon.id,'startedAt',now(),'combatPower',cp);
end $$;

create or replace function public.claim_afk_dungeon()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  player_id uuid:=public.require_google_player(); progress public.player_dungeon_progress; dungeon public.dungeon_catalog; armory public.player_armories;
  elapsed_seconds integer; cycles integer; shard_gain integer; reward jsonb; s jsonb; clear_count integer;
begin
  select * into progress from public.player_dungeon_progress where user_id=player_id for update;
  if progress.afk_dungeon_id is null then raise exception 'no AFK dungeon is active'; end if;
  select * into dungeon from public.dungeon_catalog where id=progress.afk_dungeon_id;
  elapsed_seconds:=least(28800,greatest(0,extract(epoch from now()-progress.afk_started_at)::integer)); cycles:=floor(elapsed_seconds/600);
  if cycles<1 then raise exception 'AFK rewards unlock after 10 minutes'; end if;
  shard_gain:=greatest(1,floor(dungeon.shards_per_hour*elapsed_seconds/3600.0)::integer);
  select * into armory from public.player_armories where user_id=player_id for update; s:=armory.state;
  s:=jsonb_set(s,'{shards}',to_jsonb(coalesce((s->>'shards')::integer,0)+shard_gain),true);
  reward:=public.roll_dungeon_drop(s,dungeon.level_required,false); s:=reward->'state';
  s:=jsonb_set(s,'{dungeon,bestLevel}',to_jsonb(greatest(coalesce((s#>>'{dungeon,bestLevel}')::integer,0),dungeon.level_required)),true);
  update public.player_armories set state=s,updated_at=now() where user_id=player_id;
  clear_count:=coalesce((progress.clears->>dungeon.id)::integer,0)+cycles;
  update public.player_dungeon_progress set best_level=greatest(best_level,dungeon.level_required),clears=jsonb_set(public.player_dungeon_progress.clears,array[dungeon.id],to_jsonb(clear_count),true),afk_dungeon_id=null,afk_started_at=null,updated_at=now() where user_id=player_id;
  return jsonb_build_object('state',s,'dungeonId',dungeon.id,'cycles',cycles,'shards',shard_gain,'drop',reward->'drop');
end $$;

create or replace function public.queue_coop_dungeon(p_dungeon_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  player_id uuid:=public.require_google_player(); dungeon public.dungeon_catalog; party public.dungeon_parties; cp integer; player_level integer; members integer; total_cp bigint;
begin
  delete from public.dungeon_party_members m using public.dungeon_parties p
    where m.party_id=p.id and m.user_id=player_id and p.state in ('complete','closed');
  if exists(select 1 from public.dungeon_party_members where user_id=player_id) then return public.get_my_progression_state(); end if;
  select * into dungeon from public.dungeon_catalog where id=p_dungeon_id;
  if dungeon.id is null then raise exception 'unknown dungeon'; end if;
  select greatest(1,coalesce((save_data#>>'{core,level}')::integer,1)) into player_level from public.player_saves where user_id=player_id;
  cp:=public.calculate_player_combat_power(player_id);
  if player_level<dungeon.level_required then raise exception 'runner level is too low'; end if;
  if cp<ceil(dungeon.recommended_cp*.75) then raise exception 'co-op requires 75 percent of recommended combat power'; end if;
  select * into party from public.dungeon_parties where dungeon_id=dungeon.id and state='waiting' and member_count<3 and created_at>now()-interval '15 minutes' order by created_at for update skip locked limit 1;
  if party.id is null then
    insert into public.dungeon_parties(dungeon_id,leader_id) values(dungeon.id,player_id) returning * into party;
  end if;
  insert into public.dungeon_party_members(party_id,user_id,combat_power) values(party.id,player_id,cp);
  select count(*),sum(combat_power) into members,total_cp from public.dungeon_party_members where party_id=party.id;
  update public.dungeon_parties set member_count=members,updated_at=now(),
    state=case when members>=2 and total_cp>=dungeon.recommended_cp then 'active' else 'waiting' end,
    started_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now() else null end,
    completes_at=case when members>=2 and total_cp>=dungeon.recommended_cp then now()+make_interval(mins=>dungeon.duration_minutes) else null end
    where id=party.id;
  return public.get_my_progression_state();
end $$;

create or replace function public.leave_coop_dungeon()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare player_id uuid:=public.require_google_player(); party public.dungeon_parties; members integer;
begin
  select p.* into party from public.dungeon_parties p join public.dungeon_party_members m on m.party_id=p.id where m.user_id=player_id for update;
  if party.id is null then return public.get_my_progression_state(); end if;
  if party.state<>'waiting' then raise exception 'active expeditions cannot be abandoned'; end if;
  delete from public.dungeon_party_members where party_id=party.id and user_id=player_id;
  select count(*) into members from public.dungeon_party_members where party_id=party.id;
  if members=0 then delete from public.dungeon_parties where id=party.id; else update public.dungeon_parties set member_count=members,updated_at=now() where id=party.id; end if;
  return public.get_my_progression_state();
end $$;

create or replace function public.claim_coop_dungeon()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  player_id uuid:=public.require_google_player(); party public.dungeon_parties; member public.dungeon_party_members; dungeon public.dungeon_catalog;
  armory public.player_armories; progress public.player_dungeon_progress; reward jsonb; s jsonb; shard_gain integer;
begin
  select p.* into party from public.dungeon_parties p join public.dungeon_party_members m on m.party_id=p.id where m.user_id=player_id for update of p;
  select * into member from public.dungeon_party_members where user_id=player_id for update;
  if party.id is null or party.state<>'active' or party.completes_at>now() then raise exception 'co-op expedition is not complete'; end if;
  if member.claimed_at is not null then raise exception 'co-op reward already claimed'; end if;
  select * into dungeon from public.dungeon_catalog where id=party.dungeon_id;
  select * into armory from public.player_armories where user_id=player_id for update; s:=armory.state;
  shard_gain:=greatest(5,round(dungeon.shards_per_hour*dungeon.duration_minutes/45.0)::integer);
  s:=jsonb_set(s,'{shards}',to_jsonb(coalesce((s->>'shards')::integer,0)+shard_gain),true);
  reward:=public.roll_dungeon_drop(s,dungeon.level_required,true); s:=reward->'state';
  s:=jsonb_set(s,'{dungeon,bestLevel}',to_jsonb(greatest(coalesce((s#>>'{dungeon,bestLevel}')::integer,0),dungeon.level_required)),true);
  update public.player_armories set state=s,updated_at=now() where user_id=player_id;
  insert into public.player_dungeon_progress(user_id,best_level,clears) values(player_id,dungeon.level_required,jsonb_build_object(dungeon.id,1))
    on conflict(user_id) do update set best_level=greatest(public.player_dungeon_progress.best_level,dungeon.level_required),
      clears=jsonb_set(public.player_dungeon_progress.clears,array[dungeon.id],to_jsonb(coalesce((public.player_dungeon_progress.clears->>dungeon.id)::integer,0)+1),true),updated_at=now();
  update public.dungeon_party_members set claimed_at=now() where party_id=party.id and user_id=player_id;
  if not exists(select 1 from public.dungeon_party_members where party_id=party.id and claimed_at is null) then update public.dungeon_parties set state='complete',updated_at=now() where id=party.id; end if;
  return jsonb_build_object('state',s,'dungeonId',dungeon.id,'shards',shard_gain,'drop',reward->'drop');
end $$;

revoke all on function public.manage_my_armory(jsonb,text[],text) from public,anon;
revoke all on function public.get_my_progression_state() from public,anon;
revoke all on function public.start_afk_dungeon(text) from public,anon;
revoke all on function public.claim_afk_dungeon() from public,anon;
revoke all on function public.queue_coop_dungeon(text) from public,anon;
revoke all on function public.leave_coop_dungeon() from public,anon;
revoke all on function public.claim_coop_dungeon() from public,anon;
grant execute on function public.manage_my_armory(jsonb,text[],text) to authenticated;
grant execute on function public.get_my_progression_state() to authenticated;
grant execute on function public.start_afk_dungeon(text) to authenticated;
grant execute on function public.claim_afk_dungeon() to authenticated;
grant execute on function public.queue_coop_dungeon(text) to authenticated;
grant execute on function public.leave_coop_dungeon() to authenticated;
grant execute on function public.claim_coop_dungeon() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dungeon_parties') then
    alter publication supabase_realtime add table public.dungeon_parties;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dungeon_party_members') then
    alter publication supabase_realtime add table public.dungeon_party_members;
  end if;
end $$;
