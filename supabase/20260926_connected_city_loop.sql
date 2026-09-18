-- Connected City Loop: one guided campaign across existing Blackwood systems.
-- Apply after 20260925_rise_to_power.sql. Safe to re-run.

alter table public.bw_story_missions add column if not exists action_page text not null default 'missions';
alter table public.bw_story_missions add column if not exists unlock_text text not null default 'Advances your Blackwood record.';

update public.bw_story_missions set action_page=case objective_type
 when 'crimes' then 'crimes' when 'career_shifts' then 'work' when 'career_tier' then 'work'
 when 'wins' then 'combat' when 'assignments' then 'factions' when 'all_assignments' then 'factions'
 when 'faction_rep' then 'factions' when 'family_member' then 'family' else 'missions' end,
 unlock_text=case id
 when 'arrival-1' then 'Unlocks the career step.' when 'arrival-2' then 'Unlocks combat preparation.'
 when 'arrival-3' then 'Opens the Harbor campaign.' when 'harbor-3' then 'Opens Federal Trust work.'
 when 'ledger-3' then 'Opens the city standing chapter.' when 'city-3' then 'Opens Rise to Power.'
 else 'Advances the next campaign objective.' end;

insert into public.bw_story_missions
 (id,chapter,sequence,title,briefing,objective,objective_type,objective_target,objective_faction,prerequisite_id,cash_reward,xp_reward,merit_reward,respect_reward,faction_reward,reward_item_id,action_page,unlock_text) values
('rise-1',5,1,'Work the Districts','Your standing now needs evidence from the field office. Complete successful operations across Blackwood.','Complete twelve successful district operations.','operations',12,'harbor-union','city-3',60000,600,3,90,50,null,'operations','Unlocks the district boss campaign.'),
('rise-2',5,2,'Break the First Gate','Master a district and defeat one named boss. Preparation and equipment both count.','Defeat one district boss.','boss_wins',1,'moretti-circle','rise-1',75000,720,3,110,60,'relic-harbor-iron','operations','Unlocks the Blackwood Workshop objective.'),
('rise-3',5,3,'Built, Not Bought','Turn field salvage into dependable equipment and improve one owned item.','Reach workshop rank two on any item.','upgrade_rank',2,'federal-trust','rise-2',90000,850,4,130,70,null,'operations','Opens the citywide Takeover chapter.'),
('power-1',6,1,'A Family Name','Build enough strength to defeat four district bosses. Family-supported victories count toward the same record.','Defeat four district bosses.','boss_wins',4,'moretti-circle','rise-3',120000,1000,4,160,90,'relic-capo-signet','operations','Unlocks the city influence objective.'),
('power-2',6,2,'Move the Map','Pledge to an active Takeover faction and contribute through operations, assignments and boss victories.','Earn 250 Takeover points.','takeover_points',250,'harbor-union','power-1',150000,1200,5,200,110,null,'takeover','Unlocks the final standing test.'),
('power-3',6,3,'A City Remembers','Complete a broad Blackwood record. Every earlier system contributes to this final standing.','Reach city standing score 6,000.','standing',6000,'moretti-circle','power-2',250000,1800,7,300,150,'relic-blackwood-oath','missions','Completes the current Blackwood campaign.')
on conflict(id) do update set chapter=excluded.chapter,sequence=excluded.sequence,title=excluded.title,briefing=excluded.briefing,
 objective=excluded.objective,objective_type=excluded.objective_type,objective_target=excluded.objective_target,
 objective_faction=excluded.objective_faction,prerequisite_id=excluded.prerequisite_id,cash_reward=excluded.cash_reward,
 xp_reward=excluded.xp_reward,merit_reward=excluded.merit_reward,respect_reward=excluded.respect_reward,
 faction_reward=excluded.faction_reward,reward_item_id=excluded.reward_item_id,action_page=excluded.action_page,unlock_text=excluded.unlock_text;

create or replace function public.bw_story_metric(p_uid uuid,p_type text,p_faction text) returns bigint
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; result bigint:=0; begin
 select * into s from public.bw_player_states where user_id=p_uid;
 result:=case p_type
  when 'crimes' then s.crimes_completed when 'wins' then s.fights_won when 'respect' then s.respect when 'level' then s.level
  when 'career_shifts' then coalesce((select shifts_completed from public.bw_job_careers where user_id=p_uid),0)
  when 'career_tier' then coalesce((select j.tier from public.bw_job_careers c join public.bw_job_positions j on j.id=c.position_id where c.user_id=p_uid),0)
  when 'family_member' then case when exists(select 1 from public.runner_crew_members where user_id=p_uid) then 1 else 0 end
  when 'assignments' then (select count(*) from public.bw_faction_assignment_runs r join public.bw_faction_assignments a on a.id=r.assignment_id where r.user_id=p_uid and r.success and a.faction_id=p_faction)
  when 'all_assignments' then (select count(*) from public.bw_faction_assignment_runs where user_id=p_uid and success)
  when 'faction_rep' then coalesce((select reputation from public.bw_faction_reputation where user_id=p_uid and faction_id=p_faction),0)
  when 'operations' then (select count(*) from public.bw_district_operation_runs where user_id=p_uid and success)
  when 'boss_wins' then coalesce((select sum(wins) from public.bw_rise_boss_records where user_id=p_uid),0)
  when 'upgrade_rank' then coalesce((select max(rank) from public.bw_item_upgrades where user_id=p_uid),0)
  when 'takeover_points' then coalesce((select sum(points) from public.bw_takeover_contributions where user_id=p_uid),0)
  when 'standing' then public.bw_standing_score(p_uid) else 0 end;
 return coalesce(result,0);
end $$;

create or replace function public.bw_currency_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); wallet public.bw_ledger_wallets; deposited bigint:=0; begin
 wallet:=public.bw_ensure_ledger(uid); select coalesce(balance,0) into deposited from public.bw_broker_accounts where user_id=uid and status='active';
 return jsonb_build_object('currency','ARCADE_DOLLARS','currencyName','Arcade Dollars','displaySymbol','$',
  'available',wallet.balance,'tradingDeposited',coalesce(deposited,0),'totalPlayBalance',wallet.balance+coalesce(deposited,0),
  'redeemableWinnings',wallet.arcade_winnings,'purchasable',false,'cashValue',false,
  'conversionText','100 Arcade Dollars = $50 city cash from verified net Arcade wins only');
end $$;

create or replace function public.bw_connected_progression_snapshot() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); base jsonb; missions jsonb; current_mission jsonb; completed integer; begin
 base:=public.bw_progression_snapshot();
 select coalesce(jsonb_agg(x.mission||jsonb_build_object('actionPage',m.action_page,'unlockText',m.unlock_text) order by m.chapter,m.sequence),'[]'::jsonb)
 into missions from jsonb_array_elements(base->'missions') x(mission) join public.bw_story_missions m on m.id=x.mission->>'id';
 select mission into current_mission from jsonb_array_elements(missions) q(mission)
  where (mission->>'unlocked')::boolean and mission->>'claimedAt' is null order by (mission->>'chapter')::integer,(mission->>'sequence')::integer limit 1;
 select count(*) into completed from public.bw_player_story_missions where user_id=uid and claimed_at is not null;
 return jsonb_set(base,'{missions}',missions)||jsonb_build_object(
  'journey',jsonb_build_object('completed',completed,'total',jsonb_array_length(missions),'currentChapter',coalesce((current_mission->>'chapter')::integer,6),
   'next',case when current_mission is null then null else current_mission end),
  'currency',public.bw_currency_snapshot());
end $$;

-- Boss victories now move the same Takeover map as operations and assignments.
alter table public.bw_takeover_contributions drop constraint if exists bw_takeover_contributions_source_check;
alter table public.bw_takeover_contributions add constraint bw_takeover_contributions_source_check check(source in('operation','faction','civic','boss'));
create or replace function public.bw_takeover_record_boss() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare season public.bw_takeover_seasons; pledged text; district text; boss_order integer; begin
 if not new.success then return new; end if;
 select * into season from public.bw_takeover_seasons where active and starts_at<=new.created_at and ends_at>new.created_at order by starts_at desc limit 1;
 if season.id is null then return new; end if;
 select faction_id into pledged from public.bw_takeover_pledges where user_id=new.user_id and season_id=season.id; if pledged is null then return new; end if;
 select district_id,sort_order into district,boss_order from public.bw_rise_bosses where id=new.boss_id;
 insert into public.bw_takeover_contributions(user_id,season_id,faction_id,district_id,source,source_id,points,created_at)
 values(new.user_id,season.id,pledged,district,'boss',new.id,20+boss_order*5,new.created_at) on conflict(season_id,source,source_id) do nothing;
 return new;
end $$;
drop trigger if exists bw_takeover_boss_contribution on public.bw_rise_boss_attempts;
create trigger bw_takeover_boss_contribution after insert on public.bw_rise_boss_attempts for each row execute function public.bw_takeover_record_boss();

-- Correct zero-quantity dismantles and serialize simultaneous item upgrades.
create or replace function public.bw_dismantle_item(p_item_id text,p_quantity integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; v public.bw_inventory; prior jsonb; available integer; gained bigint; remaining integer; ev jsonb; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 if p_quantity<1 or p_quantity>99 then raise exception 'quantity must be between 1 and 99'; end if;
 select * into i from public.bw_items where id=p_item_id; select * into v from public.bw_inventory where user_id=uid and item_id=p_item_id for update;
 if i.id is null or i.slot is null or v.item_id is null then raise exception 'equipment not found'; end if;
 available:=v.quantity-case when exists(select 1 from public.bw_equipment where user_id=uid and item_id=p_item_id) then 1 else 0 end; if available<p_quantity then raise exception 'not enough unequipped copies'; end if;
 gained:=public.bw_rise_parts_yield(i.rarity)*p_quantity; remaining:=v.quantity-p_quantity;
 if remaining=0 then delete from public.bw_inventory where user_id=uid and item_id=p_item_id; else update public.bw_inventory set quantity=remaining where user_id=uid and item_id=p_item_id; end if;
 insert into public.bw_rise_materials(user_id,workshop_parts) values(uid,gained) on conflict(user_id) do update set workshop_parts=bw_rise_materials.workshop_parts+excluded.workshop_parts,updated_at=now();
 ev:=jsonb_build_object('success',true,'title','Equipment dismantled','message',i.name||' became reusable workshop parts.','parts',gained);
 insert into public.bw_rise_actions(user_id,request_id,kind,item_id,quantity,parts_delta,event) values(uid,p_request_id,'dismantle',i.id,p_quantity,gained,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

create or replace function public.bw_upgrade_rise_item(p_item_id text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; current_rank integer; next_rank integer; cost integer; prior jsonb; ev jsonb; begin
 if p_request_id is null then raise exception 'request id required'; end if;
 select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
 select c.* into i from public.bw_items c join public.bw_inventory v on v.item_id=c.id and v.user_id=uid and v.quantity>0 where c.id=p_item_id and c.slot is not null for update of v;
 if i.id is null then raise exception 'owned equipment not found'; end if;
 insert into public.bw_rise_materials(user_id) values(uid) on conflict do nothing; perform 1 from public.bw_rise_materials where user_id=uid for update;
 select coalesce(rank,0) into current_rank from public.bw_item_upgrades where user_id=uid and item_id=i.id; current_rank:=coalesce(current_rank,0); if current_rank>=3 then raise exception 'item is already rank 3'; end if;
 next_rank:=current_rank+1; cost:=public.bw_rise_upgrade_cost(i.rarity,next_rank);
 update public.bw_rise_materials set workshop_parts=workshop_parts-cost,updated_at=now() where user_id=uid and workshop_parts>=cost; if not found then raise exception 'not enough workshop parts'; end if;
 insert into public.bw_item_upgrades(user_id,item_id,rank) values(uid,i.id,next_rank) on conflict(user_id,item_id) do update set rank=excluded.rank,updated_at=now();
 ev:=jsonb_build_object('success',true,'title','Equipment improved','message',i.name||' reached workshop rank '||next_rank||'.','rank',next_rank);
 insert into public.bw_rise_actions(user_id,request_id,kind,item_id,parts_delta,event) values(uid,p_request_id,'upgrade',i.id,-cost,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

revoke all on function public.bw_currency_snapshot(),public.bw_connected_progression_snapshot() from public,anon;
grant execute on function public.bw_currency_snapshot(),public.bw_connected_progression_snapshot() to authenticated;
revoke all on function public.bw_takeover_record_boss() from public,anon,authenticated;
