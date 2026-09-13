-- Rise to Power: district bosses, targeted loot and deterministic workshop progression.
-- Apply after 20260924_blackwood_supporter_store.sql. Safe to re-run.

create table if not exists public.bw_rise_materials(
  user_id uuid primary key references auth.users(id) on delete cascade,
  workshop_parts bigint not null default 0 check(workshop_parts>=0),updated_at timestamptz not null default now()
);
create table if not exists public.bw_rise_bosses(
  id text primary key,district_id text not null references public.bw_operation_districts(id),name text not null,title text not null,
  briefing text not null,weakness text not null check(weakness in('careful','direct','social')),
  required_level integer not null,required_mastery integer not null,required_clears integer not null,
  base_power integer not null,reward_item_id text not null references public.bw_items(id),parts_reward integer not null,
  cooldown_hours integer not null default 4,sort_order integer not null
);
insert into public.bw_rise_bosses values
('boss-harbor','harbor','Silas Rook','The Dockmaster','Break Rook''s control of the sealed manifests before the next tide.','careful',4,30,3,25,'relic-harbor-iron',35,4,1),
('boss-quarter','old-quarter','Mara Venn','The Ward Knife','Trace Venn through the old passages and end her protection ring.','social',7,55,5,38,'relic-ward-stiletto',50,4,2),
('boss-north','northside','Elias Crow','The Ash Crown','Corner Crow without putting the neighbourhood volunteers at risk.','careful',11,85,7,55,'relic-ash-crown',70,4,3),
('boss-rail','railway','Marshal Kade','The Night Watch','Take the signal house and recover Kade''s coded timetable.','direct',15,120,9,76,'relic-night-watch',95,4,4),
('boss-south','southside','Driver Knox','The Copperhead','Stop Knox''s parts convoy before it reaches the hidden workshop.','direct',20,165,12,104,'relic-copperhead-gloves',125,4,5),
('boss-finance','financial','Auditor Sloan','The False Capo','Expose Sloan''s forged accounts and seize the signet used to open private rooms.','social',25,220,15,138,'relic-capo-signet',165,4,6),
('boss-narrows','narrows','Broker Wren','The Listener','Turn Wren''s own information network against the Narrows command post.','social',31,290,18,180,'relic-bellini-typewriter',215,4,7),
('boss-heights','heights','Commander Roth','The Last Gate','Take the Heights estate and recover the city oath from Roth''s vault.','careful',38,380,22,235,'relic-blackwood-oath',300,4,8)
on conflict(id) do update set district_id=excluded.district_id,name=excluded.name,title=excluded.title,briefing=excluded.briefing,
 weakness=excluded.weakness,required_level=excluded.required_level,required_mastery=excluded.required_mastery,
 required_clears=excluded.required_clears,base_power=excluded.base_power,reward_item_id=excluded.reward_item_id,
 parts_reward=excluded.parts_reward,cooldown_hours=excluded.cooldown_hours,sort_order=excluded.sort_order;

create table if not exists public.bw_rise_boss_records(
  user_id uuid not null references auth.users(id) on delete cascade,boss_id text not null references public.bw_rise_bosses(id),
  wins integer not null default 0,losses integer not null default 0,target_drops integer not null default 0,last_attempt_at timestamptz,
  primary key(user_id,boss_id)
);
create table if not exists public.bw_rise_boss_attempts(
  id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
  boss_id text not null references public.bw_rise_bosses(id),request_id uuid not null,success boolean not null,
  chance integer not null,parts_awarded integer not null default 0,item_id text references public.bw_items(id),event jsonb not null,
  created_at timestamptz not null default now(),unique(user_id,request_id)
);
create table if not exists public.bw_item_upgrades(
  user_id uuid not null references auth.users(id) on delete cascade,item_id text not null references public.bw_items(id),
  rank integer not null default 1 check(rank between 1 and 3),updated_at timestamptz not null default now(),primary key(user_id,item_id)
);
create table if not exists public.bw_rise_recipes(
  id text primary key,item_id text not null references public.bw_items(id),parts_cost integer not null,
  required_level integer not null,required_boss_id text references public.bw_rise_bosses(id),sort_order integer not null
);
insert into public.bw_rise_recipes values
('field-revolver','catalog-07-revolver',60,12,'boss-harbor',1),('quiet-blade','catalog-09-switchblade',80,16,'boss-quarter',2),
('ward-coat','catalog-11-overcoat',110,20,'boss-north',3),('rail-watch','catalog-13-watch',150,24,'boss-rail',4),
('south-gloves','catalog-15-knuckles',210,28,'boss-south',5),('trust-signet','catalog-17-ring',290,32,'boss-finance',6),
('midnight-sidearm','catalog-19-pistol',400,36,'boss-narrows',7),('sovereign-coat','catalog-20-overcoat',550,40,'boss-heights',8)
on conflict(id) do update set item_id=excluded.item_id,parts_cost=excluded.parts_cost,required_level=excluded.required_level,
 required_boss_id=excluded.required_boss_id,sort_order=excluded.sort_order;
create table if not exists public.bw_rise_actions(
  id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,kind text not null check(kind in('dismantle','craft','upgrade')),item_id text references public.bw_items(id),
  quantity integer not null default 1,parts_delta bigint not null,event jsonb not null,created_at timestamptz not null default now(),
  unique(user_id,request_id)
);

alter table public.bw_rise_materials enable row level security; alter table public.bw_rise_bosses enable row level security;
alter table public.bw_rise_boss_records enable row level security; alter table public.bw_rise_boss_attempts enable row level security;
alter table public.bw_item_upgrades enable row level security; alter table public.bw_rise_recipes enable row level security; alter table public.bw_rise_actions enable row level security;
drop policy if exists "read rise bosses" on public.bw_rise_bosses; create policy "read rise bosses" on public.bw_rise_bosses for select to authenticated using(true);
drop policy if exists "read rise recipes" on public.bw_rise_recipes; create policy "read rise recipes" on public.bw_rise_recipes for select to authenticated using(true);
drop policy if exists "read own rise materials" on public.bw_rise_materials; create policy "read own rise materials" on public.bw_rise_materials for select to authenticated using(auth.uid()=user_id);
drop policy if exists "read own boss records" on public.bw_rise_boss_records; create policy "read own boss records" on public.bw_rise_boss_records for select to authenticated using(auth.uid()=user_id);
drop policy if exists "read own boss attempts" on public.bw_rise_boss_attempts; create policy "read own boss attempts" on public.bw_rise_boss_attempts for select to authenticated using(auth.uid()=user_id);
drop policy if exists "read own item upgrades" on public.bw_item_upgrades; create policy "read own item upgrades" on public.bw_item_upgrades for select to authenticated using(auth.uid()=user_id);
drop policy if exists "read own rise actions" on public.bw_rise_actions; create policy "read own rise actions" on public.bw_rise_actions for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_rise_materials,public.bw_rise_bosses,public.bw_rise_boss_records,public.bw_rise_boss_attempts,public.bw_item_upgrades,public.bw_rise_recipes,public.bw_rise_actions from authenticated,anon;
grant select on public.bw_rise_materials,public.bw_rise_bosses,public.bw_rise_boss_records,public.bw_rise_boss_attempts,public.bw_item_upgrades,public.bw_rise_recipes,public.bw_rise_actions to authenticated;

create or replace function public.bw_rise_upgrade_cost(p_rarity text,p_next_rank integer) returns integer language sql immutable as $$
 select (case p_rarity when 'legendary' then 240 when 'epic' then 140 when 'rare' then 80 when 'uncommon' then 45 else 25 end)*greatest(1,p_next_rank)
$$;
create or replace function public.bw_rise_parts_yield(p_rarity text) returns integer language sql immutable as $$
 select case p_rarity when 'legendary' then 140 when 'epic' then 55 when 'rare' then 22 when 'uncommon' then 9 else 4 end
$$;

create or replace function public.bw_rise_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; parts bigint; begin
 s:=public.bw_refresh_player(uid); insert into public.bw_rise_materials(user_id) values(uid) on conflict do nothing;
 select workshop_parts into parts from public.bw_rise_materials where user_id=uid;
 return jsonb_build_object('authority',true,'parts',parts,'player',to_jsonb(s),
  'bosses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'districtId',b.district_id,'districtName',d.name,'accent',d.accent,
   'name',b.name,'title',b.title,'briefing',b.briefing,'weakness',b.weakness,'requiredLevel',b.required_level,'requiredMastery',b.required_mastery,
   'requiredClears',b.required_clears,'basePower',b.base_power,'partsReward',b.parts_reward,'rewardItemId',i.id,'rewardName',i.name,'rewardRarity',i.rarity,
   'wins',coalesce(r.wins,0),'losses',coalesce(r.losses,0),'targetDrops',coalesce(r.target_drops,0),'mastery',coalesce(dp.mastery,0),'clears',coalesce(dp.clears,0),
   'unlocked',s.level>=b.required_level and coalesce(dp.mastery,0)>=b.required_mastery and coalesce(dp.clears,0)>=b.required_clears,
   'cooldownSeconds',greatest(0,coalesce(extract(epoch from (r.last_attempt_at+make_interval(hours=>b.cooldown_hours)-now()))::integer,0))) order by b.sort_order)
   from public.bw_rise_bosses b join public.bw_operation_districts d on d.id=b.district_id join public.bw_items i on i.id=b.reward_item_id
   left join public.bw_rise_boss_records r on r.user_id=uid and r.boss_id=b.id left join public.bw_district_progress dp on dp.user_id=uid and dp.district_id=b.district_id),'[]'::jsonb),
  'recipes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'partsCost',r.parts_cost,'requiredLevel',r.required_level,'requiredBossId',r.required_boss_id,
   'bossDefeated',coalesce(br.wins,0)>0,'item',to_jsonb(i),'owned',coalesce(v.quantity,0)) order by r.sort_order) from public.bw_rise_recipes r join public.bw_items i on i.id=r.item_id
   left join public.bw_rise_boss_records br on br.user_id=uid and br.boss_id=r.required_boss_id left join public.bw_inventory v on v.user_id=uid and v.item_id=i.id),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('item_id',i.id,'quantity',v.quantity,'equipped',v.equipped,'available',v.quantity-case when e.item_id is null then 0 else 1 end,
   'upgradeRank',coalesce(u.rank,0),'upgradeCost',case when coalesce(u.rank,0)<3 then public.bw_rise_upgrade_cost(i.rarity,coalesce(u.rank,0)+1) end) order by i.rarity,i.name)
   from public.bw_inventory v join public.bw_items i on i.id=v.item_id left join public.bw_equipment e on e.user_id=uid and e.item_id=i.id
   left join public.bw_item_upgrades u on u.user_id=uid and u.item_id=i.id where v.user_id=uid and i.slot is not null),'[]'::jsonb));
end $$;

create or replace function public.bw_challenge_district_boss(p_boss_id text,p_approach text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); b public.bw_rise_bosses; s public.bw_player_states; dp public.bw_district_progress; r public.bw_rise_boss_records;
 prior jsonb; chance integer; won boolean; parts integer; found text; ev jsonb; crew uuid; power numeric; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 if p_approach not in('careful','direct','social') then raise exception 'invalid approach'; end if;
 select event into prior from public.bw_rise_boss_attempts where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 select * into b from public.bw_rise_bosses where id=p_boss_id; if b.id is null then raise exception 'boss not found'; end if;
 s:=public.bw_refresh_player(uid); if s.status<>'okay' then raise exception 'you are currently %',s.status; end if;
 select * into dp from public.bw_district_progress where user_id=uid and district_id=b.district_id; if s.level<b.required_level or coalesce(dp.mastery,0)<b.required_mastery or coalesce(dp.clears,0)<b.required_clears then raise exception 'district mastery requirements not met'; end if;
 insert into public.bw_rise_boss_records(user_id,boss_id) values(uid,b.id) on conflict do nothing; select * into r from public.bw_rise_boss_records where user_id=uid and boss_id=b.id for update;
 if r.last_attempt_at is not null and r.last_attempt_at+make_interval(hours=>b.cooldown_hours)>now() then raise exception 'boss recon is still on cooldown'; end if;
 if coalesce(dp.heat,0)>85 then raise exception 'district heat must fall to 85 or lower'; end if;
 power:=(s.strength+s.defense+s.speed+s.dexterity+public.bw_equipment_power(uid))/5;
 chance:=greatest(20,least(90,round(52+(power-b.base_power)*.32+least(12,greatest(0,coalesce(dp.mastery,0)-b.required_mastery)/10)+case when p_approach=b.weakness then 10 else 0 end)::integer));
 won:=floor(random()*100)+1<=chance; parts:=case when won then b.parts_reward else greatest(5,floor(b.parts_reward*.2)::integer) end;
 if won and (mod(r.wins+1,5)=0 or random()<.20) then found:=b.reward_item_id; insert into public.bw_inventory(user_id,item_id,quantity) values(uid,found,1) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1; end if;
 insert into public.bw_rise_materials(user_id,workshop_parts) values(uid,parts) on conflict(user_id) do update set workshop_parts=bw_rise_materials.workshop_parts+excluded.workshop_parts,updated_at=now();
 update public.bw_rise_boss_records set wins=wins+case when won then 1 else 0 end,losses=losses+case when won then 0 else 1 end,target_drops=target_drops+case when found is null then 0 else 1 end,last_attempt_at=now() where user_id=uid and boss_id=b.id;
 update public.bw_district_progress set heat=least(100,heat+12),last_played_at=now(),last_heat_at=now() where user_id=uid and district_id=b.district_id;
 if won then select crew_id into crew from public.runner_crew_members where user_id=uid; if crew is not null then update public.runner_crew_members set contribution=contribution+8 where user_id=uid; update public.runner_crews set xp=xp+8,updated_at=now() where id=crew; end if; perform public.bw_gain_xp(uid,20+b.sort_order*8); end if;
 ev:=jsonb_build_object('success',won,'title',case when won then b.name||' defeated' else b.name||' held the district' end,'message',case when won then 'Target secured. The next district tier is closer.' else 'The crew withdrew with useful workshop salvage.' end,'chance',chance,'parts',parts,'itemId',found,'itemName',(select name from public.bw_items where id=found));
 insert into public.bw_rise_boss_attempts(user_id,boss_id,request_id,success,chance,parts_awarded,item_id,event) values(uid,b.id,p_request_id,won,chance,parts,found,ev);
 insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'district-boss',case when won then 'Defeated ' else 'Lost to ' end||b.name,ev);
 return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_dismantle_item(p_item_id text,p_quantity integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; v public.bw_inventory; prior jsonb; available integer; gained bigint; ev jsonb; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 if p_quantity<1 or p_quantity>99 then raise exception 'quantity must be between 1 and 99'; end if;
 select * into i from public.bw_items where id=p_item_id; select * into v from public.bw_inventory where user_id=uid and item_id=p_item_id for update;
 if i.id is null or i.slot is null or v.item_id is null then raise exception 'equipment not found'; end if;
 available:=v.quantity-case when exists(select 1 from public.bw_equipment where user_id=uid and item_id=p_item_id) then 1 else 0 end; if available<p_quantity then raise exception 'not enough unequipped copies'; end if;
 gained:=public.bw_rise_parts_yield(i.rarity)*p_quantity; update public.bw_inventory set quantity=quantity-p_quantity where user_id=uid and item_id=p_item_id;
 delete from public.bw_inventory where user_id=uid and item_id=p_item_id and quantity<=0; insert into public.bw_rise_materials(user_id,workshop_parts) values(uid,gained) on conflict(user_id) do update set workshop_parts=bw_rise_materials.workshop_parts+excluded.workshop_parts,updated_at=now();
 ev:=jsonb_build_object('success',true,'title','Equipment dismantled','message',i.name||' became reusable workshop parts.','parts',gained);
 insert into public.bw_rise_actions(user_id,request_id,kind,item_id,quantity,parts_delta,event) values(uid,p_request_id,'dismantle',i.id,p_quantity,gained,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

create or replace function public.bw_craft_rise_item(p_recipe_id text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); r public.bw_rise_recipes; s public.bw_player_states; prior jsonb; ev jsonb; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 select * into r from public.bw_rise_recipes where id=p_recipe_id; s:=public.bw_refresh_player(uid); if r.id is null then raise exception 'recipe not found'; end if; if s.level<r.required_level then raise exception 'level % required',r.required_level; end if;
 if not exists(select 1 from public.bw_rise_boss_records where user_id=uid and boss_id=r.required_boss_id and wins>0) then raise exception 'defeat the linked district boss first'; end if;
 update public.bw_rise_materials set workshop_parts=workshop_parts-r.parts_cost,updated_at=now() where user_id=uid and workshop_parts>=r.parts_cost; if not found then raise exception 'not enough workshop parts'; end if;
 insert into public.bw_inventory(user_id,item_id,quantity) values(uid,r.item_id,1) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1;
 ev:=jsonb_build_object('success',true,'title','Workshop build complete','message',(select name from public.bw_items where id=r.item_id)||' added to inventory.');
 insert into public.bw_rise_actions(user_id,request_id,kind,item_id,parts_delta,event) values(uid,p_request_id,'craft',r.item_id,-r.parts_cost,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

create or replace function public.bw_upgrade_rise_item(p_item_id text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; current_rank integer; next_rank integer; cost integer; prior jsonb; ev jsonb; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 select c.* into i from public.bw_items c join public.bw_inventory v on v.item_id=c.id and v.user_id=uid and v.quantity>0 where c.id=p_item_id and c.slot is not null; if i.id is null then raise exception 'owned equipment not found'; end if;
 select coalesce(rank,0) into current_rank from public.bw_item_upgrades where user_id=uid and item_id=i.id; current_rank:=coalesce(current_rank,0); if current_rank>=3 then raise exception 'item is already rank 3'; end if; next_rank:=current_rank+1; cost:=public.bw_rise_upgrade_cost(i.rarity,next_rank);
 update public.bw_rise_materials set workshop_parts=workshop_parts-cost,updated_at=now() where user_id=uid and workshop_parts>=cost; if not found then raise exception 'not enough workshop parts'; end if;
 insert into public.bw_item_upgrades(user_id,item_id,rank) values(uid,i.id,next_rank) on conflict(user_id,item_id) do update set rank=excluded.rank,updated_at=now();
 ev:=jsonb_build_object('success',true,'title','Equipment improved','message',i.name||' reached workshop rank '||next_rank||'.','rank',next_rank);
 insert into public.bw_rise_actions(user_id,request_id,kind,item_id,parts_delta,event) values(uid,p_request_id,'upgrade',i.id,-cost,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

-- One rank adds 6% to every stat. All combat systems use this server-side function.
create or replace function public.bw_equipment_power(p_uid uuid) returns numeric language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum((i.attack+i.defense+i.speed+i.dexterity)*(1+coalesce(u.rank,0)*.06)),0) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=p_uid
$$;
create or replace function public.bw_get_loadout() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); begin perform public.bw_ensure_player(uid);
 insert into public.bw_equipment(user_id,slot,item_id) select v.user_id,i.slot,v.item_id from public.bw_inventory v join public.bw_items i on i.id=v.item_id where v.user_id=uid and v.equipped and i.slot is not null on conflict do nothing;
 return jsonb_build_object(
  'equipment',coalesce((select jsonb_agg(to_jsonb(e)||to_jsonb(i)||jsonb_build_object('upgradeRank',coalesce(u.rank,0),'effectiveAttack',round(i.attack*(1+coalesce(u.rank,0)*.06)),'effectiveDefense',round(i.defense*(1+coalesce(u.rank,0)*.06)),'effectiveSpeed',round(i.speed*(1+coalesce(u.rank,0)*.06)),'effectiveDexterity',round(i.dexterity*(1+coalesce(u.rank,0)*.06))) order by e.slot) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=uid),'[]'::jsonb),
  'inventory',coalesce((select jsonb_agg(to_jsonb(v)||to_jsonb(i)||jsonb_build_object('upgradeRank',coalesce(u.rank,0),'effectiveAttack',round(i.attack*(1+coalesce(u.rank,0)*.06)),'effectiveDefense',round(i.defense*(1+coalesce(u.rank,0)*.06)),'effectiveSpeed',round(i.speed*(1+coalesce(u.rank,0)*.06)),'effectiveDexterity',round(i.dexterity*(1+coalesce(u.rank,0)*.06))) order by i.kind,i.name) from public.bw_inventory v join public.bw_items i on i.id=v.item_id left join public.bw_item_upgrades u on u.user_id=v.user_id and u.item_id=v.item_id where v.user_id=uid),'[]'::jsonb),
  'bonuses',jsonb_build_object('attack',coalesce((select sum(round(i.attack*(1+coalesce(u.rank,0)*.06))) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=uid),0),'defense',coalesce((select sum(round(i.defense*(1+coalesce(u.rank,0)*.06))) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=uid),0),'speed',coalesce((select sum(round(i.speed*(1+coalesce(u.rank,0)*.06))) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=uid),0),'dexterity',coalesce((select sum(round(i.dexterity*(1+coalesce(u.rank,0)*.06))) from public.bw_equipment e join public.bw_items i on i.id=e.item_id left join public.bw_item_upgrades u on u.user_id=e.user_id and u.item_id=e.item_id where e.user_id=uid),0)));
end $$;
revoke all on function public.bw_rise_upgrade_cost(text,integer),public.bw_rise_parts_yield(text),public.bw_rise_snapshot(),public.bw_challenge_district_boss(text,text,uuid),public.bw_dismantle_item(text,integer,uuid),public.bw_craft_rise_item(text,uuid),public.bw_upgrade_rise_item(text,uuid) from public,anon;
grant execute on function public.bw_rise_snapshot(),public.bw_challenge_district_boss(text,text,uuid),public.bw_dismantle_item(text,integer,uuid),public.bw_craft_rise_item(text,uuid),public.bw_upgrade_rise_item(text,uuid) to authenticated;
