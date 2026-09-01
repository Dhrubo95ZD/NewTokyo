-- Blackwood City: server-authoritative RPG core.
-- Requires schema.sql and 20260825_neo_exchange.sql.

create table if not exists public.bw_player_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level integer not null default 1 check (level between 1 and 1000),
  xp bigint not null default 0 check (xp >= 0),
  bank bigint not null default 0 check (bank >= 0),
  energy integer not null default 100, max_energy integer not null default 100,
  nerve integer not null default 20, max_nerve integer not null default 20,
  health integer not null default 500, max_health integer not null default 500,
  happy integer not null default 250, max_happy integer not null default 250,
  strength numeric(18,2) not null default 10, defense numeric(18,2) not null default 10,
  speed numeric(18,2) not null default 10, dexterity numeric(18,2) not null default 10,
  crime_skill integer not null default 1, respect bigint not null default 0,
  merits integer not null default 0, job_id text not null default 'dockhand', job_points integer not null default 0,
  status text not null default 'okay' check (status in ('okay','jail','hospital','travel')),
  status_until timestamptz, last_work_at timestamptz,
  last_energy_at timestamptz not null default now(), last_nerve_at timestamptz not null default now(), last_health_at timestamptz not null default now(),
  crimes_completed integer not null default 0, crimes_failed integer not null default 0,
  fights_won integer not null default 0, fights_lost integer not null default 0,
  property_id text not null default 'room', education_id text, education_ends_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.bw_crimes (
  id text primary key, name text not null, category text not null, nerve_cost integer not null,
  skill_required integer not null default 1, base_chance integer not null,
  reward_min integer not null, reward_max integer not null, xp_reward integer not null,
  jail_seconds integer not null default 120, description text not null, sort_order integer not null
);

insert into public.bw_crimes(id,name,category,nerve_cost,skill_required,base_chance,reward_min,reward_max,xp_reward,jail_seconds,description,sort_order) values
('cash-trash','Search the train depot','Theft',2,1,94,45,140,4,45,'Search unattended platforms and lockers for loose cash.',1),
('shoplift','Lift from a corner store','Theft',3,2,88,120,360,7,75,'Pocket small goods while the clerk is distracted.',2),
('pickpocket','Work the theatre crowd','Theft',4,4,81,260,700,11,100,'Choose a mark in the evening crowd and take their wallet.',3),
('bootleg','Move untaxed luxury tea','Smuggling',5,6,76,500,1200,16,140,'Move sealed tea crates through a friendly warehouse.',4),
('numbers','Run a numbers slip','Fraud',6,8,71,850,1900,22,180,'Collect street bets without drawing the vice squad.',5),
('burglary','Burgle a townhouse','Theft',7,11,65,1400,3300,30,240,'Enter quietly, find the safe, and leave no witnesses.',6),
('graffiti','Mark rival territory','Vandalism',8,14,61,1900,4100,38,300,'Send a message on a wall the whole neighborhood can see.',7),
('skimming','Clone event-hall passes','Fraud',9,17,57,2700,6200,48,360,'Copy access passes during a crowded exhibition and leave unseen.',8),
('autotheft','Steal a luxury sedan','Auto Theft',10,20,53,4200,9000,62,450,'Lift a high-value car and deliver it to the chop shop.',9),
('arson','Burn a rival warehouse','Arson',12,25,47,7500,15000,80,600,'Destroy a rival shipment without being caught in the blaze.',10),
('hijack','Hijack a cargo truck','Organized Crime',14,31,42,12000,26000,105,780,'Take a guarded truck before it reaches the waterfront.',11),
('vault','Crack the Bellini vault','Grand Larceny',18,40,34,25000,65000,150,1200,'Defeat a modern vault inside the city oldest private bank.',12)
on conflict(id) do update set name=excluded.name,category=excluded.category,nerve_cost=excluded.nerve_cost,skill_required=excluded.skill_required,base_chance=excluded.base_chance,reward_min=excluded.reward_min,reward_max=excluded.reward_max,xp_reward=excluded.xp_reward,jail_seconds=excluded.jail_seconds,description=excluded.description,sort_order=excluded.sort_order;

create table if not exists public.bw_jobs (
  id text primary key, name text not null, company text not null, level_required integer not null,
  pay integer not null, energy_cost integer not null default 10, points integer not null default 5, description text not null, sort_order integer not null
);
insert into public.bw_jobs values
('dockhand','Dock Hand','Blackwood & Sons Shipping',1,900,8,3,'Unload legitimate freight and learn which crates never enter the ledger.',1),
('bookkeeper','Bookkeeper','Blackwood & Sons Shipping',3,1850,10,5,'Balance manifests and smooth over discrepancies.',2),
('bouncer','Venue Steward','The Gilded Hall',6,3200,12,7,'Keep the exhibition hall orderly and its guests protected.',3),
('detective','Private Detective','Bell & Ward Agency',10,5200,14,9,'Find people who would prefer to remain missing.',4),
('attorney','Defense Attorney','Moretti, Vale & Cross',15,8500,16,12,'Keep clients out of jail and inconvenient evidence out of court.',5)
on conflict(id) do update set name=excluded.name,company=excluded.company,level_required=excluded.level_required,pay=excluded.pay,energy_cost=excluded.energy_cost,points=excluded.points,description=excluded.description,sort_order=excluded.sort_order;

create table if not exists public.bw_items (
  id text primary key, name text not null, kind text not null, price integer not null,
  power integer not null default 0, description text not null, usable boolean not null default false
);
insert into public.bw_items values
('brass-knuckles','Brass Knuckles','weapon',850,8,'A close-range weapon that adds attack power.',false),
('switchblade','Switchblade','weapon',2200,14,'Quick, concealable and unpleasant.',false),
('service-revolver','Service Revolver','weapon',9500,28,'A dependable sidearm with a questionable history.',false),
('tailored-vest','Tailored Protective Vest','armor',3800,12,'Protection sewn beneath a respectable suit.',false),
('first-aid','First Aid Kit','medical',650,120,'Restores 120 health when used.',true),
('morphine','Emergency Med Injector','medical',2400,300,'A regulated emergency aid that restores 300 health.',true),
('bourbon','Blackwood Malt Tonic','booster',420,35,'An alcohol-free malt tonic that restores 35 happiness.',true),
('cannoli','Box of Cannoli','booster',280,25,'Restores 25 happiness.',true)
on conflict(id) do update set name=excluded.name,kind=excluded.kind,price=excluded.price,power=excluded.power,description=excluded.description,usable=excluded.usable;

create table if not exists public.bw_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.bw_items(id), quantity integer not null default 1 check(quantity > 0),
  equipped boolean not null default false, acquired_at timestamptz not null default now(),
  primary key(user_id,item_id)
);

create table if not exists public.bw_action_logs (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, summary text not null, data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.bw_attack_logs (
  id bigint generated always as identity primary key, attacker_id uuid not null references auth.users(id), defender_id uuid not null references auth.users(id),
  winner_id uuid references auth.users(id), outcome text not null, cash_moved bigint not null default 0,
  attacker_power numeric not null, defender_power numeric not null, created_at timestamptz not null default now()
);

create table if not exists public.bw_relations (
  owner_id uuid not null references auth.users(id) on delete cascade, target_id uuid not null references auth.users(id) on delete cascade,
  relation text not null check(relation in ('friend','enemy','target','blocked')), note text not null default '', created_at timestamptz not null default now(),
  primary key(owner_id,target_id), check(owner_id<>target_id)
);

create table if not exists public.bw_mail (
  id bigint generated always as identity primary key, sender_id uuid not null references auth.users(id), recipient_id uuid not null references auth.users(id),
  subject text not null check(char_length(subject) between 1 and 80), body text not null check(char_length(body) between 1 and 2000),
  read_at timestamptz, deleted_by_sender boolean not null default false, deleted_by_recipient boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists public.bw_forum_threads (
  id bigint generated always as identity primary key, author_id uuid not null references auth.users(id), title text not null check(char_length(title) between 3 and 100),
  category text not null default 'general' check(category in ('general','trade','factions','help')), locked boolean not null default false, created_at timestamptz not null default now(), bumped_at timestamptz not null default now()
);
create table if not exists public.bw_forum_posts (
  id bigint generated always as identity primary key, thread_id bigint not null references public.bw_forum_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id), body text not null check(char_length(body) between 1 and 4000), created_at timestamptz not null default now(), edited_at timestamptz
);

create table if not exists public.bw_missions (
  id text primary key, name text not null, description text not null, metric text not null,
  target integer not null, cash_reward integer not null default 0, xp_reward integer not null default 0, merit_reward integer not null default 0, sort_order integer not null
);
insert into public.bw_missions values
('first-score','First Score','Complete five successful crimes.','crimes',5,2500,35,1,1),
('known-name','A Known Name','Earn fifty family respect.','respect',50,5000,60,1,2),
('street-muscle','Street Muscle','Win three fights against real players.','wins',3,8500,90,1,3),
('rainy-day','Rainy Day Fund','Hold twenty-five thousand dollars in the bank.','bank',25000,4000,50,1,4),
('made-progress','Made Progress','Reach player level ten.','level',10,15000,150,2,5)
on conflict(id) do update set name=excluded.name,description=excluded.description,metric=excluded.metric,target=excluded.target,cash_reward=excluded.cash_reward,xp_reward=excluded.xp_reward,merit_reward=excluded.merit_reward,sort_order=excluded.sort_order;

create table if not exists public.bw_player_missions (
  user_id uuid not null references auth.users(id) on delete cascade, mission_id text not null references public.bw_missions(id),
  claimed_at timestamptz, assigned_at timestamptz not null default now(), primary key(user_id,mission_id)
);

create table if not exists public.bw_awards (
  id text primary key, name text not null, description text not null, metric text not null, target integer not null, merit_reward integer not null default 1
);
insert into public.bw_awards values
('petty-crook','Petty Crook','Complete 10 crimes.','crimes',10,1),
('career-criminal','Career Criminal','Complete 100 crimes.','crimes',100,2),
('first-blood','First Blood','Win your first player fight.','wins',1,1),
('contender','Contender','Win 25 player fights.','wins',25,2),
('respected','Respected','Earn 250 respect.','respect',250,2),
('millionaire','Millionaire','Control $1,000,000 across cash and bank.','wealth',1000000,3)
on conflict(id) do update set name=excluded.name,description=excluded.description,metric=excluded.metric,target=excluded.target,merit_reward=excluded.merit_reward;
create table if not exists public.bw_player_awards (
  user_id uuid not null references auth.users(id) on delete cascade, award_id text not null references public.bw_awards(id), earned_at timestamptz not null default now(), primary key(user_id,award_id)
);

create table if not exists public.bw_properties (
  id text primary key, name text not null, price bigint not null, max_happy integer not null, vault_capacity bigint not null, description text not null, sort_order integer not null
);
insert into public.bw_properties values
('room','Rented Room',0,250,10000,'A narrow room above a shop. It is private enough.',1),
('flat','Northside Flat',45000,400,100000,'A clean flat with a lock that works and neighbors who mind their business.',2),
('townhouse','Bellini Townhouse',240000,650,1000000,'Three floors, a discreet garage and a reinforced basement.',3),
('villa','Lakeside Villa',1200000,950,10000000,'A guarded estate beyond the reach of street noise.',4),
('compound','Moretti Compound',8000000,1500,100000000,'A fortified family residence with staff quarters and a private vault.',5)
on conflict(id) do update set name=excluded.name,price=excluded.price,max_happy=excluded.max_happy,vault_capacity=excluded.vault_capacity,description=excluded.description,sort_order=excluded.sort_order;

create table if not exists public.bw_owned_properties (
  user_id uuid not null references auth.users(id) on delete cascade, property_id text not null references public.bw_properties(id),
  purchased_at timestamptz not null default now(), primary key(user_id,property_id)
);

create or replace function public.bw_json_num(p_doc jsonb,p_key text,p_default numeric) returns numeric language plpgsql immutable as $$ declare v text:=p_doc->>p_key; begin if v is not null and v~'^-?[0-9]+([.][0-9]+)?$' then return v::numeric; end if; return p_default; end $$;
revoke all on function public.bw_json_num(jsonb,text,numeric) from public,anon,authenticated;

-- One-time legacy import occurs while the migration runs. After this statement,
-- lazy player creation never trusts client-writable save values.
insert into public.bw_player_states(user_id,level,xp,bank,energy,max_energy,nerve,max_nerve,health,max_health,happy,max_happy,strength,defense,speed,dexterity,crime_skill,respect,merits,job_id,job_points)
select ps.user_id,least(100,greatest(1,public.bw_json_num(c,'level',1)::integer)),least(1000000000,greatest(0,public.bw_json_num(c,'xp',0)::bigint)),least(1000000000000,greatest(0,public.bw_json_num(c,'bank',0)::bigint)),least(250,greatest(0,public.bw_json_num(c,'energy',100)::integer)),least(250,greatest(100,public.bw_json_num(c,'maxEnergy',100)::integer)),least(100,greatest(0,public.bw_json_num(c,'nerve',20)::integer)),least(100,greatest(20,public.bw_json_num(c,'maxNerve',20)::integer)),least(100000,greatest(1,public.bw_json_num(c,'health',500)::integer)),least(100000,greatest(500,public.bw_json_num(c,'maxHealth',500)::integer)),least(10000,greatest(0,public.bw_json_num(c,'happy',250)::integer)),least(10000,greatest(250,public.bw_json_num(c,'maxHappy',250)::integer)),least(1000000000,greatest(10,public.bw_json_num(c,'strength',10))),least(1000000000,greatest(10,public.bw_json_num(c,'defense',10))),least(1000000000,greatest(10,public.bw_json_num(c,'speed',10))),least(1000000000,greatest(10,public.bw_json_num(c,'dexterity',10))),least(100,greatest(1,public.bw_json_num(c,'crimeSkill',1)::integer)),least(1000000000,greatest(0,public.bw_json_num(c,'respect',0)::bigint)),least(10000,greatest(0,public.bw_json_num(c,'merits',0)::integer)),case when c->>'job' ilike '%book%' then 'bookkeeper' else 'dockhand' end,least(1000000,greatest(0,public.bw_json_num(c,'jobPoints',0)::integer))
from public.player_saves ps cross join lateral(select case when coalesce(public.bw_json_num(ps.save_data,'schemaVersion',0)::integer,0)>=3 then ps.save_data->'core' else ps.save_data end c)x on conflict(user_id) do nothing;

insert into public.player_wallets(user_id,balance)
select ps.user_id,least(1000000000000,greatest(0,public.bw_json_num(c,'money',public.bw_json_num(c,'cash',2500))::bigint)) from public.player_saves ps cross join lateral(select case when coalesce(public.bw_json_num(ps.save_data,'schemaVersion',0)::integer,0)>=3 then ps.save_data->'core' else ps.save_data end c)x on conflict(user_id) do nothing;

alter table public.bw_player_states enable row level security;
alter table public.bw_crimes enable row level security; alter table public.bw_jobs enable row level security; alter table public.bw_items enable row level security;
alter table public.bw_inventory enable row level security; alter table public.bw_action_logs enable row level security; alter table public.bw_attack_logs enable row level security;
alter table public.bw_relations enable row level security; alter table public.bw_mail enable row level security; alter table public.bw_forum_threads enable row level security; alter table public.bw_forum_posts enable row level security;
alter table public.bw_missions enable row level security; alter table public.bw_player_missions enable row level security; alter table public.bw_awards enable row level security; alter table public.bw_player_awards enable row level security;
alter table public.bw_properties enable row level security; alter table public.bw_owned_properties enable row level security;

do $$ declare t text; begin
  foreach t in array array['bw_crimes','bw_jobs','bw_items','bw_missions','bw_awards','bw_properties'] loop execute format('drop policy if exists "authenticated read %s" on public.%I',t,t); execute format('create policy "authenticated read %s" on public.%I for select to authenticated using (true)',t,t); end loop;
end $$;
drop policy if exists "users read own city state" on public.bw_player_states; create policy "users read own city state" on public.bw_player_states for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own inventory" on public.bw_inventory; create policy "users read own inventory" on public.bw_inventory for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own action log" on public.bw_action_logs; create policy "users read own action log" on public.bw_action_logs for select to authenticated using(auth.uid()=user_id);
drop policy if exists "combatants read attacks" on public.bw_attack_logs; create policy "combatants read attacks" on public.bw_attack_logs for select to authenticated using(auth.uid() in(attacker_id,defender_id));
drop policy if exists "users read own relations" on public.bw_relations; create policy "users read own relations" on public.bw_relations for select to authenticated using(auth.uid()=owner_id);
drop policy if exists "users read own mail" on public.bw_mail; create policy "users read own mail" on public.bw_mail for select to authenticated using(auth.uid() in(sender_id,recipient_id));
drop policy if exists "authenticated read threads" on public.bw_forum_threads; create policy "authenticated read threads" on public.bw_forum_threads for select to authenticated using(true);
drop policy if exists "authenticated read posts" on public.bw_forum_posts; create policy "authenticated read posts" on public.bw_forum_posts for select to authenticated using(true);
drop policy if exists "users read own missions" on public.bw_player_missions; create policy "users read own missions" on public.bw_player_missions for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own awards" on public.bw_player_awards; create policy "users read own awards" on public.bw_player_awards for select to authenticated using(auth.uid()=user_id);
drop policy if exists "users read own properties" on public.bw_owned_properties; create policy "users read own properties" on public.bw_owned_properties for select to authenticated using(auth.uid()=user_id);

revoke insert,update,delete on public.bw_player_states,public.bw_inventory,public.bw_action_logs,public.bw_attack_logs,public.bw_relations,public.bw_mail,public.bw_forum_threads,public.bw_forum_posts,public.bw_player_missions,public.bw_player_awards,public.bw_owned_properties from authenticated,anon;
grant select on public.bw_crimes,public.bw_jobs,public.bw_items,public.bw_missions,public.bw_awards,public.bw_properties,public.bw_player_states,public.bw_inventory,public.bw_action_logs,public.bw_attack_logs,public.bw_relations,public.bw_mail,public.bw_forum_threads,public.bw_forum_posts,public.bw_player_missions,public.bw_player_awards,public.bw_owned_properties to authenticated;

create or replace function public.bw_uid() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$ begin if auth.uid() is null then raise exception 'authentication required'; end if; return auth.uid(); end $$;
revoke all on function public.bw_uid() from public,anon,authenticated;

create or replace function public.bw_ensure_player(p_uid uuid default auth.uid()) returns public.bw_player_states
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bw_player_states;
begin
  if p_uid is null then raise exception 'authentication required'; end if;
  insert into public.bw_player_states(user_id) values(p_uid) on conflict(user_id) do nothing;
  insert into public.bw_inventory(user_id,item_id,quantity,equipped) values(p_uid,'brass-knuckles',1,true),(p_uid,'tailored-vest',1,true),(p_uid,'first-aid',1,false),(p_uid,'bourbon',1,false) on conflict do nothing;
  insert into public.bw_owned_properties(user_id,property_id) values(p_uid,'room') on conflict do nothing;
  insert into public.bw_player_missions(user_id,mission_id) select p_uid,id from public.bw_missions on conflict do nothing;
  insert into public.player_wallets(user_id,balance) values(p_uid,2500) on conflict(user_id) do nothing;
  select * into result from public.bw_player_states where user_id=p_uid; return result;
end $$;
revoke all on function public.bw_ensure_player(uuid) from public,anon,authenticated;

create or replace function public.bw_create_character(p_name text,p_role text,p_avatar text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); n text:=btrim(coalesce(p_name,'')); role_name text; core jsonb;
begin
  if n!~'^[A-Za-z0-9_ ]{3,18}$' then raise exception 'name must be 3-18 letters, numbers, spaces or underscores'; end if;
  if p_role not in('enforcer','operator','fixer') then raise exception 'invalid specialty'; end if;
  if exists(select 1 from public.player_saves where user_id=uid and (save_data?'character' or save_data?'characterProfile')) then raise exception 'character already exists'; end if;
  role_name:=case p_role when 'enforcer' then 'Enforcer' when 'operator' then 'Operator' else 'Fixer' end;
  insert into public.profiles(id,display_name,avatar_url,last_seen_at) values(uid,n,left(p_avatar,500),now()) on conflict(id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url,last_seen_at=now();
  core:=jsonb_build_object('name',n,'title',role_name,'level',1,'xp',0,'money',2500,'cash',2500,'bank',0,'energy',100,'maxEnergy',100,'nerve',20,'maxNerve',case when p_role='fixer' then 28 else 20 end,'health',500,'maxHealth',500,'happy',250,'maxHappy',250,'strength',case when p_role='enforcer' then 28 else 10 end,'defense',case when p_role='enforcer' then 18 else 10 end,'speed',case when p_role='operator' then 26 else 10 end,'dexterity',case when p_role='operator' then 22 else 10 end,'crimeSkill',case when p_role='fixer' then 5 else 1 end,'respect',0,'merits',0,'job','Dock Hand','jobPoints',0);
  insert into public.player_saves(user_id,save_data) values(uid,jsonb_build_object('schemaVersion',5,'core',core,'character',jsonb_build_object('codename',n,'role',p_role,'portrait',0,'creationVersion',4),'meta',jsonb_build_object('createdAt',extract(epoch from now())*1000,'updatedAt',extract(epoch from now())*1000))) on conflict(user_id) do update set save_data=excluded.save_data,updated_at=now();
  insert into public.bw_player_states(user_id,max_nerve,strength,defense,speed,dexterity,crime_skill) values(uid,case when p_role='fixer' then 28 else 20 end,case when p_role='enforcer' then 28 else 10 end,case when p_role='enforcer' then 18 else 10 end,case when p_role='operator' then 26 else 10 end,case when p_role='operator' then 22 else 10 end,case when p_role='fixer' then 5 else 1 end) on conflict(user_id) do update set level=1,xp=0,bank=0,energy=100,max_energy=100,nerve=20,max_nerve=excluded.max_nerve,health=500,max_health=500,happy=250,max_happy=250,strength=excluded.strength,defense=excluded.defense,speed=excluded.speed,dexterity=excluded.dexterity,crime_skill=excluded.crime_skill,respect=0,merits=0,job_id='dockhand',job_points=0,status='okay',status_until=null,crimes_completed=0,crimes_failed=0,fights_won=0,fights_lost=0,property_id='room',updated_at=now();
  insert into public.player_wallets(user_id,balance) values(uid,2500) on conflict(user_id) do update set balance=2500,reserved=0,realized_pnl=0,version=player_wallets.version+1,updated_at=now();
  insert into public.bw_inventory(user_id,item_id,quantity,equipped) values(uid,'brass-knuckles',1,true),(uid,'tailored-vest',1,true),(uid,'first-aid',1,false),(uid,'bourbon',1,false) on conflict(user_id,item_id) do update set quantity=excluded.quantity,equipped=excluded.equipped;
  insert into public.bw_owned_properties(user_id,property_id) values(uid,'room') on conflict do nothing;
  insert into public.bw_player_missions(user_id,mission_id) select uid,id from public.bw_missions on conflict do nothing;
  return public.bw_get_state();
end $$;
revoke all on function public.bw_create_character(text,text,text) from public,anon; grant execute on function public.bw_create_character(text,text,text) to authenticated;

create or replace function public.bw_refresh_player(p_uid uuid) returns public.bw_player_states
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; e integer; n integer; h integer;
begin
  s:=public.bw_ensure_player(p_uid);
  e:=greatest(0,floor(extract(epoch from(now()-s.last_energy_at))/300)::integer);
  n:=greatest(0,floor(extract(epoch from(now()-s.last_nerve_at))/300)::integer);
  h:=greatest(0,floor(extract(epoch from(now()-s.last_health_at))/300)::integer)*5;
  update public.bw_player_states set energy=least(max_energy,energy+e),nerve=least(max_nerve,nerve+n),health=least(max_health,health+h),last_energy_at=case when e>0 then last_energy_at+(e*interval '5 minutes') else last_energy_at end,last_nerve_at=case when n>0 then last_nerve_at+(n*interval '5 minutes') else last_nerve_at end,last_health_at=case when h>0 then last_health_at+((h/5)*interval '5 minutes') else last_health_at end,status=case when status_until is not null and status_until<=now() then 'okay' else status end,status_until=case when status_until is not null and status_until<=now() then null else status_until end,updated_at=now() where user_id=p_uid returning * into s;
  return s;
end $$;
revoke all on function public.bw_refresh_player(uuid) from public,anon,authenticated;

create or replace function public.bw_metric(s public.bw_player_states,p_metric text,p_cash bigint) returns bigint language plpgsql immutable as $$ begin return case p_metric when 'crimes' then s.crimes_completed when 'wins' then s.fights_won when 'respect' then s.respect when 'bank' then s.bank when 'level' then s.level when 'wealth' then s.bank+p_cash else 0 end; end $$;

create or replace function public.bw_check_awards(p_uid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; cash bigint; gained integer;
begin s:=public.bw_refresh_player(p_uid); select balance into cash from public.player_wallets where user_id=p_uid;
  with earned as (select a.id,a.merit_reward from public.bw_awards a where public.bw_metric(s,a.metric,cash)>=a.target), ins as (insert into public.bw_player_awards(user_id,award_id) select p_uid,id from earned on conflict do nothing returning award_id)
  select coalesce(sum(a.merit_reward),0) into gained from ins i join public.bw_awards a on a.id=i.award_id;
  if gained>0 then update public.bw_player_states set merits=merits+gained where user_id=p_uid; end if;
end $$;
revoke all on function public.bw_check_awards(uuid) from public,anon,authenticated;

create or replace function public.bw_get_state() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; w public.player_wallets; result jsonb;
begin s:=public.bw_refresh_player(uid); w:=public.ensure_exchange_wallet(uid); perform public.bw_check_awards(uid); select * into s from public.bw_player_states where user_id=uid;
  select jsonb_build_object('authority',true,'player',to_jsonb(s)||jsonb_build_object('cash',w.balance),'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('name',c.name,'kind',c.kind,'power',c.power,'description',c.description,'usable',c.usable) order by c.kind,c.name) from public.bw_inventory i join public.bw_items c on c.id=i.item_id where i.user_id=uid),'[]'::jsonb),'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.kind,i.price,i.name) from public.bw_items i),'[]'::jsonb),'crimes',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order) from public.bw_crimes c),'[]'::jsonb),'jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.sort_order) from public.bw_jobs j),'[]'::jsonb),'missions',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('progress',least(m.target,public.bw_metric(s,m.metric,w.balance)),'claimedAt',pm.claimed_at) order by m.sort_order) from public.bw_player_missions pm join public.bw_missions m on m.id=pm.mission_id where pm.user_id=uid),'[]'::jsonb),'awards',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('earnedAt',pa.earned_at) order by pa.earned_at desc) from public.bw_player_awards pa join public.bw_awards a on a.id=pa.award_id where pa.user_id=uid),'[]'::jsonb),'properties',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('owned',op.user_id is not null,'active',s.property_id=p.id) order by p.sort_order) from public.bw_properties p left join public.bw_owned_properties op on op.property_id=p.id and op.user_id=uid),'[]'::jsonb),'recent',coalesce((select jsonb_agg(x order by x.created_at desc) from(select id,kind,summary,data,created_at from public.bw_action_logs where user_id=uid order by created_at desc limit 20)x),'[]'::jsonb)) into result; return result;
end $$;

create or replace function public.bw_gain_xp(p_uid uuid,p_amount integer) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; need bigint;
begin update public.bw_player_states set xp=xp+greatest(0,p_amount) where user_id=p_uid returning * into s; loop need:=100+s.level*65; exit when s.xp<need or s.level>=1000; update public.bw_player_states set xp=xp-need,level=level+1,max_health=max_health+25,health=max_health+25 where user_id=p_uid returning * into s; end loop; end $$;
revoke all on function public.bw_gain_xp(uuid,integer) from public,anon,authenticated;

create or replace function public.bw_do_crime(p_crime_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; c public.bw_crimes; chance numeric; won boolean; jailed boolean; take integer; event jsonb;
begin s:=public.bw_refresh_player(uid); select * into c from public.bw_crimes where id=p_crime_id; if c.id is null then raise exception 'crime not found'; end if; if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if; if s.nerve<c.nerve_cost then raise exception 'not enough nerve'; end if; if s.crime_skill<c.skill_required then raise exception 'crime skill % required',c.skill_required; end if;
  chance:=least(96,greatest(8,c.base_chance+(s.crime_skill-c.skill_required)*0.7)); won:=random()*100<chance; update public.bw_player_states set nerve=nerve-c.nerve_cost,updated_at=now() where user_id=uid;
  if won then take:=floor(c.reward_min+random()*(c.reward_max-c.reward_min+1)); update public.player_wallets set balance=balance+take,version=version+1,updated_at=now() where user_id=uid; perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); update public.bw_player_states set crime_skill=crime_skill+case when random()<.35 then 1 else 0 end,respect=respect+greatest(1,c.nerve_cost/2),crimes_completed=crimes_completed+1 where user_id=uid; perform public.bw_gain_xp(uid,c.xp_reward); event:=jsonb_build_object('success',true,'cash',take,'chance',round(chance));
  else jailed:=random()<.45; update public.bw_player_states set crimes_failed=crimes_failed+1,status=case when jailed then 'jail' else status end,status_until=case when jailed then now()+make_interval(secs=>c.jail_seconds) else status_until end where user_id=uid; event:=jsonb_build_object('success',false,'cash',0,'chance',round(chance),'jailed',jailed); end if;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'crime',case when won then c.name||' succeeded' else c.name||' failed' end,event); perform public.bw_check_awards(uid); return jsonb_build_object('event',event,'state',public.bw_get_state());
end $$;

create or replace function public.bw_train(p_stat text,p_reps integer default 1) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; reps integer:=least(20,greatest(1,p_reps)); gain numeric;
begin if p_stat not in('strength','defense','speed','dexterity') then raise exception 'invalid stat'; end if; s:=public.bw_refresh_player(uid); if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if; if s.energy<reps*5 then raise exception 'not enough energy'; end if; gain:=round((reps*(1.5+2.5*s.happy::numeric/s.max_happy))::numeric,2); execute format('update public.bw_player_states set %I=%I+$1,energy=energy-$2,happy=greatest(0,happy-$3),updated_at=now() where user_id=$4',p_stat,p_stat) using gain,reps*5,reps*2,uid; insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'training','Trained '||p_stat,jsonb_build_object('stat',p_stat,'gain',gain,'reps',reps)); return jsonb_build_object('event',jsonb_build_object('gain',gain,'stat',p_stat),'state',public.bw_get_state()); end $$;

create or replace function public.bw_take_job(p_job_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; j public.bw_jobs; begin s:=public.bw_refresh_player(uid); select * into j from public.bw_jobs where id=p_job_id; if j.id is null then raise exception 'job not found'; end if; if s.level<j.level_required then raise exception 'level % required',j.level_required; end if; update public.bw_player_states set job_id=j.id,job_points=0,updated_at=now() where user_id=uid; insert into public.bw_action_logs(user_id,kind,summary) values(uid,'job','Started work as '||j.name); return public.bw_get_state(); end $$;

create or replace function public.bw_work() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; j public.bw_jobs; begin s:=public.bw_refresh_player(uid); select * into j from public.bw_jobs where id=s.job_id; if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if; if s.last_work_at is not null and s.last_work_at>now()-interval '8 hours' then raise exception 'next shift is not ready'; end if; if s.energy<j.energy_cost then raise exception 'not enough energy'; end if; update public.bw_player_states set energy=energy-j.energy_cost,job_points=job_points+j.points,last_work_at=now(),updated_at=now() where user_id=uid; update public.player_wallets set balance=balance+j.pay,version=version+1,updated_at=now() where user_id=uid; perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); perform public.bw_gain_xp(uid,j.points*2); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'job','Completed a shift at '||j.company,jsonb_build_object('pay',j.pay,'points',j.points)); return jsonb_build_object('event',jsonb_build_object('pay',j.pay),'state',public.bw_get_state()); end $$;

create or replace function public.bw_bank_transfer(p_direction text,p_amount bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; w public.player_wallets; amount bigint:=greatest(1,p_amount); begin s:=public.bw_refresh_player(uid); w:=public.ensure_exchange_wallet(uid); if p_direction='deposit' then if w.balance<amount then raise exception 'insufficient cash'; end if; update public.player_wallets set balance=balance-amount,version=version+1,updated_at=now() where user_id=uid; update public.bw_player_states set bank=bank+amount where user_id=uid; elsif p_direction='withdraw' then if s.bank<amount then raise exception 'insufficient bank balance'; end if; update public.bw_player_states set bank=bank-amount where user_id=uid; update public.player_wallets set balance=balance+amount,version=version+1,updated_at=now() where user_id=uid; else raise exception 'invalid transfer direction'; end if; perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); perform public.bw_check_awards(uid); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'bank',initcap(p_direction)||'ed funds',jsonb_build_object('amount',amount)); return public.bw_get_state(); end $$;

create or replace function public.bw_directory() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); begin perform public.bw_ensure_player(uid); return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'avatar',p.avatar_url,'lastSeenAt',p.last_seen_at,'level',coalesce(s.level,1),'status',coalesce(case when s.status_until<=now() then 'okay' else s.status end,'okay'),'statusUntil',s.status_until,'relation',r.relation,'fightsWon',coalesce(s.fights_won,0),'respect',coalesce(s.respect,0)) order by p.last_seen_at desc) from public.profiles p left join public.bw_player_states s on s.user_id=p.id left join public.bw_relations r on r.owner_id=uid and r.target_id=p.id),'[]'::jsonb); end $$;

create or replace function public.bw_attack(p_target uuid,p_outcome text default 'leave') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); a public.bw_player_states; d public.bw_player_states; ap numeric; dp numeric; win boolean; moved bigint:=0; target_wallet public.player_wallets;
begin if p_target=uid then raise exception 'you cannot attack yourself'; end if; if p_outcome not in('leave','mug','hospitalize') then raise exception 'invalid outcome'; end if; if not exists(select 1 from public.profiles where id=p_target) then raise exception 'player not found'; end if; if exists(select 1 from public.profiles where id=p_target and created_at>now()-interval '24 hours') then raise exception 'new player protection is active'; end if; a:=public.bw_refresh_player(uid); d:=public.bw_refresh_player(p_target); if a.status<>'okay' then raise exception 'you are currently %',a.status; end if; if d.status<>'okay' then raise exception 'target is currently %',d.status; end if; if a.energy<25 then raise exception '25 energy required'; end if;
  perform 1 from public.bw_player_states where user_id in(uid,p_target) order by user_id for update; ap:=(a.strength+a.speed+a.dexterity+a.defense)*(0.85+random()*.3); dp:=(d.strength+d.speed+d.dexterity+d.defense)*(0.85+random()*.3); win:=ap>=dp; update public.bw_player_states set energy=energy-25 where user_id=uid;
  if win then update public.bw_player_states set fights_won=fights_won+1,respect=respect+case p_outcome when 'hospitalize' then 4 else 2 end where user_id=uid; update public.bw_player_states set status='hospital',status_until=now()+case p_outcome when 'hospitalize' then interval '3 hours' when 'mug' then interval '40 minutes' else interval '20 minutes' end,health=greatest(1,health-floor(ap/20)::integer) where user_id=p_target; perform public.bw_gain_xp(uid,25);
    if p_outcome='mug' then target_wallet:=public.ensure_exchange_wallet(p_target); moved:=least(target_wallet.balance,floor(target_wallet.balance*(.05+random()*.05))::bigint); update public.player_wallets set balance=balance-moved,version=version+1,updated_at=now() where user_id=p_target; update public.player_wallets set balance=balance+moved,version=version+1,updated_at=now() where user_id=uid; perform public.mirror_wallet_to_save(p_target,(select balance from public.player_wallets where user_id=p_target)); perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); end if;
  else update public.bw_player_states set fights_lost=fights_lost+1,status='hospital',status_until=now()+interval '30 minutes',health=1 where user_id=uid; update public.bw_player_states set fights_won=fights_won+1 where user_id=p_target; end if;
  insert into public.bw_attack_logs(attacker_id,defender_id,winner_id,outcome,cash_moved,attacker_power,defender_power) values(uid,p_target,case when win then uid else p_target end,p_outcome,moved,round(ap),round(dp)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'combat',case when win then 'Defeated ' else 'Lost to ' end||(select display_name from public.profiles where id=p_target),jsonb_build_object('won',win,'outcome',p_outcome,'cash',moved)); perform public.bw_check_awards(uid); return jsonb_build_object('event',jsonb_build_object('won',win,'cash',moved,'attackerPower',round(ap),'defenderPower',round(dp)),'state',public.bw_get_state()); end $$;

create or replace function public.bw_set_relation(p_target uuid,p_relation text,p_note text default '') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin if p_target=uid then raise exception 'invalid target'; end if; if p_relation is null or p_relation='none' then delete from public.bw_relations where owner_id=uid and target_id=p_target; else if p_relation not in('friend','enemy','target','blocked') then raise exception 'invalid relation'; end if; insert into public.bw_relations(owner_id,target_id,relation,note) values(uid,p_target,p_relation,left(coalesce(p_note,''),120)) on conflict(owner_id,target_id) do update set relation=excluded.relation,note=excluded.note; end if; return public.bw_directory(); end $$;

create or replace function public.bw_get_mail() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'subject',m.subject,'body',m.body,'createdAt',m.created_at,'readAt',m.read_at,'senderId',m.sender_id,'senderName',sp.display_name,'recipientId',m.recipient_id,'recipientName',rp.display_name,'direction',case when m.sender_id=uid then 'sent' else 'received' end) order by m.created_at desc) from public.bw_mail m join public.profiles sp on sp.id=m.sender_id join public.profiles rp on rp.id=m.recipient_id where (m.sender_id=uid and not m.deleted_by_sender) or(m.recipient_id=uid and not m.deleted_by_recipient)),'[]'::jsonb); end $$;
create or replace function public.bw_send_mail(p_recipient uuid,p_subject text,p_body text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin if p_recipient=uid then raise exception 'choose another player'; end if; if exists(select 1 from public.bw_relations where owner_id=p_recipient and target_id=uid and relation='blocked') then raise exception 'recipient is unavailable'; end if; insert into public.bw_mail(sender_id,recipient_id,subject,body) values(uid,p_recipient,left(btrim(p_subject),80),left(btrim(p_body),2000)); return public.bw_get_mail(); end $$;

create or replace function public.bw_get_forums(p_thread bigint default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin return jsonb_build_object('threads',coalesce((select jsonb_agg(x order by x.bumped_at desc) from(select t.id,t.title,t.category,t.created_at,t.bumped_at,p.display_name author_name,(select count(*) from public.bw_forum_posts fp where fp.thread_id=t.id) replies from public.bw_forum_threads t join public.profiles p on p.id=t.author_id order by t.bumped_at desc limit 50)x),'[]'::jsonb),'posts',case when p_thread is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',fp.id,'body',fp.body,'createdAt',fp.created_at,'authorId',fp.author_id,'authorName',p.display_name) order by fp.created_at) from public.bw_forum_posts fp join public.profiles p on p.id=fp.author_id where fp.thread_id=p_thread),'[]'::jsonb) end); end $$;
create or replace function public.bw_create_thread(p_title text,p_category text,p_body text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); tid bigint; begin if p_category not in('general','trade','factions','help') then raise exception 'invalid category'; end if; insert into public.bw_forum_threads(author_id,title,category) values(uid,left(btrim(p_title),100),p_category) returning id into tid; insert into public.bw_forum_posts(thread_id,author_id,body) values(tid,uid,left(btrim(p_body),4000)); return public.bw_get_forums(tid); end $$;
create or replace function public.bw_reply_thread(p_thread bigint,p_body text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin if not exists(select 1 from public.bw_forum_threads where id=p_thread and not locked) then raise exception 'thread unavailable'; end if; insert into public.bw_forum_posts(thread_id,author_id,body) values(p_thread,uid,left(btrim(p_body),4000)); update public.bw_forum_threads set bumped_at=now() where id=p_thread; return public.bw_get_forums(p_thread); end $$;

create or replace function public.bw_claim_mission(p_mission_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); s public.bw_player_states; m public.bw_missions; w public.player_wallets; begin s:=public.bw_refresh_player(uid); w:=public.ensure_exchange_wallet(uid); select * into m from public.bw_missions where id=p_mission_id; if m.id is null then raise exception 'mission not found'; end if; if exists(select 1 from public.bw_player_missions where user_id=uid and mission_id=m.id and claimed_at is not null) then raise exception 'already claimed'; end if; if public.bw_metric(s,m.metric,w.balance)<m.target then raise exception 'mission incomplete'; end if; update public.bw_player_missions set claimed_at=now() where user_id=uid and mission_id=m.id; update public.player_wallets set balance=balance+m.cash_reward,version=version+1,updated_at=now() where user_id=uid; update public.bw_player_states set merits=merits+m.merit_reward where user_id=uid; perform public.bw_gain_xp(uid,m.xp_reward); perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'mission','Completed '||m.name,jsonb_build_object('cash',m.cash_reward,'xp',m.xp_reward,'merits',m.merit_reward)); return public.bw_get_state(); end $$;

create or replace function public.bw_buy_property(p_property_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); p public.bw_properties; w public.player_wallets; begin perform public.bw_ensure_player(uid); select * into p from public.bw_properties where id=p_property_id; if p.id is null then raise exception 'property not found'; end if; if exists(select 1 from public.bw_owned_properties where user_id=uid and property_id=p.id) then update public.bw_player_states set property_id=p.id,max_happy=p.max_happy,happy=least(happy,p.max_happy) where user_id=uid; else w:=public.ensure_exchange_wallet(uid); if w.balance<p.price then raise exception 'insufficient cash'; end if; update public.player_wallets set balance=balance-p.price,version=version+1,updated_at=now() where user_id=uid; insert into public.bw_owned_properties(user_id,property_id) values(uid,p.id); update public.bw_player_states set property_id=p.id,max_happy=p.max_happy where user_id=uid; perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); end if; insert into public.bw_action_logs(user_id,kind,summary) values(uid,'property','Moved into '||p.name); return public.bw_get_state(); end $$;

create or replace function public.bw_use_item(p_item_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); i public.bw_items; q integer; begin perform public.bw_ensure_player(uid); select * into i from public.bw_items where id=p_item_id and usable; select quantity into q from public.bw_inventory where user_id=uid and item_id=p_item_id for update; if i.id is null or coalesce(q,0)<1 then raise exception 'item unavailable'; end if; if i.kind='medical' then update public.bw_player_states set health=least(max_health,health+i.power) where user_id=uid; elsif i.kind='booster' then update public.bw_player_states set happy=least(max_happy,happy+i.power) where user_id=uid; end if; if q=1 then delete from public.bw_inventory where user_id=uid and item_id=p_item_id; else update public.bw_inventory set quantity=quantity-1 where user_id=uid and item_id=p_item_id; end if; insert into public.bw_action_logs(user_id,kind,summary) values(uid,'item','Used '||i.name); return public.bw_get_state(); end $$;

create or replace function public.bw_buy_item(p_item_id text,p_quantity integer default 1) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); i public.bw_items; w public.player_wallets; q integer:=least(100,greatest(1,p_quantity)); total bigint; begin perform public.bw_ensure_player(uid); select * into i from public.bw_items where id=p_item_id; if i.id is null then raise exception 'item not found'; end if; total:=i.price*q; w:=public.ensure_exchange_wallet(uid); if w.balance<total then raise exception 'insufficient cash'; end if; update public.player_wallets set balance=balance-total,version=version+1,updated_at=now() where user_id=uid; insert into public.bw_inventory(user_id,item_id,quantity) values(uid,i.id,q) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+excluded.quantity; perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'shop','Purchased '||q||' × '||i.name,jsonb_build_object('cost',total)); return public.bw_get_state(); end $$;

revoke all on function public.bw_get_state(),public.bw_do_crime(text),public.bw_train(text,integer),public.bw_take_job(text),public.bw_work(),public.bw_bank_transfer(text,bigint),public.bw_directory(),public.bw_attack(uuid,text),public.bw_set_relation(uuid,text,text),public.bw_get_mail(),public.bw_send_mail(uuid,text,text),public.bw_get_forums(bigint),public.bw_create_thread(text,text,text),public.bw_reply_thread(bigint,text),public.bw_claim_mission(text),public.bw_buy_property(text),public.bw_use_item(text),public.bw_buy_item(text,integer) from public,anon;
grant execute on function public.bw_get_state(),public.bw_do_crime(text),public.bw_train(text,integer),public.bw_take_job(text),public.bw_work(),public.bw_bank_transfer(text,bigint),public.bw_directory(),public.bw_attack(uuid,text),public.bw_set_relation(uuid,text,text),public.bw_get_mail(),public.bw_send_mail(uuid,text,text),public.bw_get_forums(bigint),public.bw_create_thread(text,text,text),public.bw_reply_thread(bigint,text),public.bw_claim_mission(text),public.bw_buy_property(text),public.bw_use_item(text),public.bw_buy_item(text,integer) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_mail') then alter publication supabase_realtime add table public.bw_mail; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_forum_posts') then alter publication supabase_realtime add table public.bw_forum_posts; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_attack_logs') then alter publication supabase_realtime add table public.bw_attack_logs; end if;
end $$;

-- Real families. This is compatible with databases that already installed the
-- former Runner Crews migration and restores the required source to the repo.
create table if not exists public.runner_crews (
  id uuid primary key default gen_random_uuid(), name text not null, tag text not null,
  color text not null default '#b99654', leader_id uuid not null references auth.users(id),
  visibility text not null default 'public', level integer not null default 1,
  xp bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists runner_crews_name_ci on public.runner_crews(lower(name));
create unique index if not exists runner_crews_tag_ci on public.runner_crews(upper(tag));
create table if not exists public.runner_crew_members (
  crew_id uuid not null references public.runner_crews(id) on delete cascade,
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'runner' check(role in('leader','officer','runner')),
  contribution bigint not null default 0, joined_at timestamptz not null default now()
);
alter table public.runner_crews enable row level security; alter table public.runner_crew_members enable row level security;
drop policy if exists "authenticated view families" on public.runner_crews; create policy "authenticated view families" on public.runner_crews for select to authenticated using(true);
drop policy if exists "authenticated view family members" on public.runner_crew_members; create policy "authenticated view family members" on public.runner_crew_members for select to authenticated using(true);
revoke insert,update,delete on public.runner_crews,public.runner_crew_members from authenticated,anon; grant select on public.runner_crews,public.runner_crew_members to authenticated;

create or replace function public.get_my_crew_state() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); membership public.runner_crew_members; crew public.runner_crews; members jsonb; public_rows jsonb;
begin select * into membership from public.runner_crew_members where user_id=uid;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'tag',c.tag,'color',c.color,'level',c.level,'memberCount',(select count(*) from public.runner_crew_members m where m.crew_id=c.id)) order by c.level desc,c.xp desc),'[]'::jsonb) into public_rows from(select * from public.runner_crews where visibility='public' order by level desc,xp desc limit 30)c;
  if membership.user_id is null then return jsonb_build_object('authority',true,'crew',null,'publicCrews',public_rows); end if;
  select * into crew from public.runner_crews where id=membership.crew_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',coalesce(p.display_name,'Associate'),'role',m.role,'contribution',m.contribution) order by case m.role when 'leader' then 0 when 'officer' then 1 else 2 end,m.contribution desc),'[]'::jsonb) into members from public.runner_crew_members m left join public.profiles p on p.id=m.user_id where m.crew_id=crew.id;
  return jsonb_build_object('authority',true,'crew',jsonb_build_object('id',crew.id,'name',crew.name,'tag',crew.tag,'color',crew.color,'level',crew.level,'xp',crew.xp,'role',membership.role,'memberCount',jsonb_array_length(members),'members',members),'publicCrews',public_rows);
end $$;
create or replace function public.create_runner_crew(p_name text,p_tag text,p_color text default '#b99654') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); cid uuid; n text:=btrim(p_name); t text:=upper(btrim(p_tag)); begin if exists(select 1 from public.runner_crew_members where user_id=uid) then raise exception 'leave your current family first'; end if; if n!~'^[A-Za-z0-9 _-]{3,24}$' or t!~'^[A-Z0-9]{2,5}$' then raise exception 'invalid family name or tag'; end if; insert into public.runner_crews(name,tag,color,leader_id) values(n,t,case when p_color~'^#[0-9a-fA-F]{6}$' then lower(p_color) else '#b99654' end,uid) returning id into cid; insert into public.runner_crew_members(crew_id,user_id,role) values(cid,uid,'leader'); return public.get_my_crew_state(); end $$;
create or replace function public.join_runner_crew(p_crew_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); begin if exists(select 1 from public.runner_crew_members where user_id=uid) then raise exception 'already in a family'; end if; if not exists(select 1 from public.runner_crews where id=p_crew_id and visibility='public') then raise exception 'family unavailable'; end if; if(select count(*) from public.runner_crew_members where crew_id=p_crew_id)>=24 then raise exception 'family is full'; end if; insert into public.runner_crew_members(crew_id,user_id) values(p_crew_id,uid); return public.get_my_crew_state(); end $$;
create or replace function public.leave_runner_crew() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare uid uuid:=public.bw_uid(); m public.runner_crew_members; successor uuid; begin select * into m from public.runner_crew_members where user_id=uid for update; if m.user_id is null then return public.get_my_crew_state(); end if; if m.role='leader' then select user_id into successor from public.runner_crew_members where crew_id=m.crew_id and user_id<>uid order by joined_at limit 1; if successor is null then delete from public.runner_crews where id=m.crew_id; return public.get_my_crew_state(); end if; update public.runner_crew_members set role='leader' where user_id=successor; update public.runner_crews set leader_id=successor where id=m.crew_id; end if; delete from public.runner_crew_members where user_id=uid; return public.get_my_crew_state(); end $$;
revoke all on function public.get_my_crew_state(),public.create_runner_crew(text,text,text),public.join_runner_crew(uuid),public.leave_runner_crew() from public,anon; grant execute on function public.get_my_crew_state(),public.create_runner_crew(text,text,text),public.join_runner_crew(uuid),public.leave_runner_crew() to authenticated;

-- Rankings are derived from authoritative city state and the shared Exchange wallet.
create or replace function public.sync_my_leaderboard() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; w public.player_wallets; player_name text;
begin s:=public.bw_refresh_player(uid); w:=public.ensure_exchange_wallet(uid); select display_name into player_name from public.profiles where id=uid;
  insert into public.leaderboard_entries(user_id,display_name,level,money,wins,title,evolution,updated_at) values(uid,coalesce(player_name,'Associate'),s.level,w.balance+s.bank,s.fights_won,'Associate',s.crime_skill,now()) on conflict(user_id) do update set display_name=excluded.display_name,level=excluded.level,money=excluded.money,wins=excluded.wins,title=excluded.title,evolution=excluded.evolution,updated_at=now();
end $$;
grant execute on function public.sync_my_leaderboard() to authenticated;

do $$ begin if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='runner_crew_members') then alter publication supabase_realtime add table public.runner_crew_members; end if; end $$;
