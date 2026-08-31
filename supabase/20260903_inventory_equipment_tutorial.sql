-- Blackwood inventory, equipment and guided onboarding upgrade.
-- Apply after 20260901_blackwood_city_core.sql. Safe to re-run.

alter table public.bw_items add column if not exists slot text;
alter table public.bw_items add column if not exists rarity text not null default 'common';
alter table public.bw_items add column if not exists attack integer not null default 0;
alter table public.bw_items add column if not exists defense integer not null default 0;
alter table public.bw_items add column if not exists speed integer not null default 0;
alter table public.bw_items add column if not exists dexterity integer not null default 0;
alter table public.bw_items add column if not exists level_required integer not null default 1;
alter table public.bw_player_states add column if not exists tutorial_step integer not null default 0;
alter table public.bw_player_states add column if not exists tutorial_done boolean not null default false;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='bw_items_slot_check') then
    alter table public.bw_items add constraint bw_items_slot_check check(slot is null or slot in('primary','secondary','melee','armor','helmet','boots','gloves','accessory'));
  end if;
  if not exists(select 1 from pg_constraint where conname='bw_items_rarity_check') then
    alter table public.bw_items add constraint bw_items_rarity_check check(rarity in('common','uncommon','rare','epic','legendary'));
  end if;
end $$;

-- Twenty collections across ten archetypes creates exactly 200 distinct pieces.
with collections as (
  select * from unnest(array['Worn','Street','Dockside','Union','Oak','Ash','Iron','Brass','Blackwood','Bellini','Moretti','Midnight','Ivory','Velvet','Viper','Saint','Crown','Monarch','Gilded','Sovereign']) with ordinality as c(label,tier)
), archetypes(code,name,kind,slot,atk,def,spd,dex) as (values
  ('revolver','Revolver','weapon','primary',9,0,1,0),
  ('shotgun','Shotgun','weapon','primary',12,0,0,0),
  ('pistol','Pistol','weapon','secondary',7,0,2,1),
  ('switchblade','Switchblade','weapon','melee',5,0,3,2),
  ('knuckles','Knuckles','weapon','gloves',6,1,0,0),
  ('fedora','Fedora','armor','helmet',0,4,0,1),
  ('overcoat','Overcoat','armor','armor',0,8,0,0),
  ('shoes','Dress Shoes','armor','boots',0,2,3,1),
  ('ring','Signet Ring','accessory','accessory',2,1,1,1),
  ('watch','Pocket Watch','accessory','accessory',1,1,2,2)
)
insert into public.bw_items(id,name,kind,price,power,description,usable,slot,rarity,attack,defense,speed,dexterity,level_required)
select 'catalog-'||lpad(c.tier::text,2,'0')||'-'||a.code,
  c.label||' '||a.name,a.kind,(350+c.tier*725+(a.atk+a.def+a.spd+a.dex)*90)::integer,
  ((a.atk+a.def+a.spd+a.dex)*(1+floor((c.tier-1)/4.0)))::integer,
  'A '||lower(c.label)||' collection '||lower(a.name)||' from Blackwood''s equipment catalog.',false,a.slot,
  case when c.tier<=6 then 'common' when c.tier<=11 then 'uncommon' when c.tier<=15 then 'rare' when c.tier<=18 then 'epic' else 'legendary' end,
  (a.atk*(1+floor((c.tier-1)/4.0)))::integer,(a.def*(1+floor((c.tier-1)/4.0)))::integer,
  (a.spd*(1+floor((c.tier-1)/4.0)))::integer,(a.dex*(1+floor((c.tier-1)/4.0)))::integer,
  greatest(1,(c.tier-1)*2)
from collections c cross join archetypes a
on conflict(id) do update set name=excluded.name,kind=excluded.kind,price=excluded.price,power=excluded.power,
 description=excluded.description,slot=excluded.slot,rarity=excluded.rarity,attack=excluded.attack,defense=excluded.defense,
 speed=excluded.speed,dexterity=excluded.dexterity,level_required=excluded.level_required;

update public.bw_items set slot='gloves',rarity='common',attack=6,defense=1 where id='brass-knuckles';
update public.bw_items set slot='melee',rarity='common',attack=8,speed=2,dexterity=2 where id='switchblade';
update public.bw_items set slot='secondary',rarity='uncommon',attack=18,speed=3,dexterity=1,level_required=4 where id='service-revolver';
update public.bw_items set slot='armor',rarity='common',defense=12 where id='tailored-vest';

create table if not exists public.bw_equipment (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null check(slot in('primary','secondary','melee','armor','helmet','boots','gloves','accessory')),
  item_id text not null references public.bw_items(id), equipped_at timestamptz not null default now(),
  primary key(user_id,slot), unique(user_id,item_id)
);
alter table public.bw_equipment enable row level security;
drop policy if exists "users read own equipment" on public.bw_equipment;
create policy "users read own equipment" on public.bw_equipment for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_equipment from authenticated,anon;
grant select on public.bw_equipment to authenticated;

-- Preserve the original starter loadout for existing characters.
insert into public.bw_equipment(user_id,slot,item_id)
select i.user_id,c.slot,i.item_id from public.bw_inventory i join public.bw_items c on c.id=i.item_id
where i.equipped and c.slot is not null
on conflict(user_id,slot) do nothing;

create or replace function public.bw_get_loadout() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); begin perform public.bw_ensure_player(uid);
  insert into public.bw_equipment(user_id,slot,item_id) select v.user_id,i.slot,v.item_id from public.bw_inventory v join public.bw_items i on i.id=v.item_id where v.user_id=uid and v.equipped and i.slot is not null on conflict do nothing;
  return jsonb_build_object(
    'equipment',coalesce((select jsonb_agg(to_jsonb(e)||to_jsonb(i) order by e.slot) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),'[]'::jsonb),
    'inventory',coalesce((select jsonb_agg(to_jsonb(v)||to_jsonb(i) order by i.kind,i.name) from public.bw_inventory v join public.bw_items i on i.id=v.item_id where v.user_id=uid),'[]'::jsonb),
    'bonuses',jsonb_build_object('attack',coalesce((select sum(i.attack) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),'defense',coalesce((select sum(i.defense) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),'speed',coalesce((select sum(i.speed) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0),'dexterity',coalesce((select sum(i.dexterity) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid),0))
  );
end $$;

create or replace function public.bw_equip_item(p_item_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; s public.bw_player_states; begin s:=public.bw_refresh_player(uid);
  select c.* into i from public.bw_items c join public.bw_inventory v on v.item_id=c.id and v.user_id=uid and v.quantity>0 where c.id=p_item_id;
  if i.id is null or i.slot is null then raise exception 'item cannot be equipped'; end if;
  if s.level<i.level_required then raise exception 'level % required',i.level_required; end if;
  delete from public.bw_equipment where user_id=uid and item_id=i.id;
  insert into public.bw_equipment(user_id,slot,item_id) values(uid,i.slot,i.id) on conflict(user_id,slot) do update set item_id=excluded.item_id,equipped_at=now();
  update public.bw_inventory set equipped=(item_id=i.id) where user_id=uid and item_id in(select id from public.bw_items where slot=i.slot);
  insert into public.bw_action_logs(user_id,kind,summary) values(uid,'equipment','Equipped '||i.name); return public.bw_get_loadout();
end $$;

create or replace function public.bw_unequip_slot(p_slot text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); removed text; begin
  if p_slot not in('primary','secondary','melee','armor','helmet','boots','gloves','accessory') then raise exception 'invalid equipment slot'; end if;
  delete from public.bw_equipment where user_id=uid and slot=p_slot returning item_id into removed;
  if removed is not null then update public.bw_inventory set equipped=false where user_id=uid and item_id=removed; end if;
  return public.bw_get_loadout();
end $$;

create or replace function public.bw_advance_tutorial(p_step integer,p_dismiss boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; begin s:=public.bw_ensure_player(uid);
  update public.bw_player_states set tutorial_step=case when p_dismiss then tutorial_step else least(7,greatest(tutorial_step,p_step)) end,
    tutorial_done=p_dismiss or p_step>=7,updated_at=now() where user_id=uid;
  return public.bw_get_state();
end $$;

create or replace function public.bw_equipment_power(p_uid uuid) returns numeric language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(sum(i.attack+i.defense+i.speed+i.dexterity),0) from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=p_uid
$$;
revoke all on function public.bw_equipment_power(uuid) from public,anon,authenticated;

-- Equipment is included in authoritative combat calculations, never trusted from the client.
create or replace function public.bw_attack(p_target uuid,p_outcome text default 'leave') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); a public.bw_player_states; d public.bw_player_states; ap numeric; dp numeric; win boolean; moved bigint:=0; target_wallet public.player_wallets;
begin if p_target=uid then raise exception 'you cannot attack yourself'; end if; if p_outcome not in('leave','mug','hospitalize') then raise exception 'invalid outcome'; end if; if not exists(select 1 from public.profiles where id=p_target) then raise exception 'player not found'; end if; if exists(select 1 from public.profiles where id=p_target and created_at>now()-interval '24 hours') then raise exception 'new player protection is active'; end if; a:=public.bw_refresh_player(uid); d:=public.bw_refresh_player(p_target); if a.status<>'okay' then raise exception 'you are currently %',a.status; end if; if d.status<>'okay' then raise exception 'target is currently %',d.status; end if; if a.energy<25 then raise exception '25 energy required'; end if;
  perform 1 from public.bw_player_states where user_id in(uid,p_target) order by user_id for update;
  ap:=(a.strength+a.speed+a.dexterity+a.defense+public.bw_equipment_power(uid))*(0.85+random()*.3);
  dp:=(d.strength+d.speed+d.dexterity+d.defense+public.bw_equipment_power(p_target))*(0.85+random()*.3); win:=ap>=dp; update public.bw_player_states set energy=energy-25 where user_id=uid;
  if win then update public.bw_player_states set fights_won=fights_won+1,respect=respect+case p_outcome when 'hospitalize' then 4 else 2 end where user_id=uid; update public.bw_player_states set status='hospital',status_until=now()+case p_outcome when 'hospitalize' then interval '3 hours' when 'mug' then interval '40 minutes' else interval '20 minutes' end,health=greatest(1,health-floor(ap/20)::integer) where user_id=p_target; perform public.bw_gain_xp(uid,25);
    if p_outcome='mug' then target_wallet:=public.ensure_exchange_wallet(p_target); moved:=least(target_wallet.balance,floor(target_wallet.balance*(.05+random()*.05))::bigint); update public.player_wallets set balance=balance-moved,version=version+1,updated_at=now() where user_id=p_target; update public.player_wallets set balance=balance+moved,version=version+1,updated_at=now() where user_id=uid; perform public.mirror_wallet_to_save(p_target,(select balance from public.player_wallets where user_id=p_target)); perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); end if;
  else update public.bw_player_states set fights_lost=fights_lost+1,status='hospital',status_until=now()+interval '30 minutes',health=1 where user_id=uid; update public.bw_player_states set fights_won=fights_won+1 where user_id=p_target; end if;
  insert into public.bw_attack_logs(attacker_id,defender_id,winner_id,outcome,cash_moved,attacker_power,defender_power) values(uid,p_target,case when win then uid else p_target end,p_outcome,moved,round(ap),round(dp)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'combat',case when win then 'Defeated ' else 'Lost to ' end||(select display_name from public.profiles where id=p_target),jsonb_build_object('won',win,'outcome',p_outcome,'cash',moved)); perform public.bw_check_awards(uid); return jsonb_build_object('event',jsonb_build_object('won',win,'cash',moved,'attackerPower',round(ap),'defenderPower',round(dp)),'state',public.bw_get_state()); end $$;

revoke all on function public.bw_get_loadout(),public.bw_equip_item(text),public.bw_unequip_slot(text),public.bw_advance_tutorial(integer,boolean) from public,anon;
grant execute on function public.bw_get_loadout(),public.bw_equip_item(text),public.bw_unequip_slot(text),public.bw_advance_tutorial(integer,boolean) to authenticated;
