-- Make Your Mark V1: server-authoritative decisions, permanent goals and safe progression.
-- Apply after 20260926_connected_city_loop.sql. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Operation dossiers: a prepared plan informs the run, but every stage asks a
-- different question. The scenario is persisted so reopening cannot reroll it.
-- ---------------------------------------------------------------------------

alter table public.bw_active_district_operations
  add column if not exists scenario_id text not null default 'standard';
alter table public.bw_district_operation_runs
  add column if not exists scenario_id text not null default 'standard';

create or replace function public.bw_operation_scenario_label(p_scenario text)
returns text language sql immutable as $$
  select case p_scenario
    when 'fog' then 'Low visibility'
    when 'patrol' then 'Extra patrols'
    when 'fragile-cargo' then 'Fragile cargo'
    when 'local-contact' then 'Reliable local contact'
    else 'Standard conditions'
  end
$$;

create or replace function public.bw_operation_scenario_clue(p_scenario text)
returns text language sql immutable as $$
  select case p_scenario
    when 'fog' then 'Visibility is poor. Information and careful movement are worth more than speed.'
    when 'patrol' then 'Patrols are moving early. A clean route or a controlled confrontation will matter.'
    when 'fragile-cargo' then 'The objective will not survive a rough extraction. Protect the route before chasing time.'
    when 'local-contact' then 'A trusted local can open one shortcut, but only if you use the information at the right moment.'
    else 'The dossier is stable. Read each stage before choosing how to proceed.'
  end
$$;

create or replace function public.bw_operation_stage_options(p_stage integer, p_scenario text)
returns jsonb language sql immutable as $$
  select case p_stage
    when 1 then jsonb_build_array(
      jsonb_build_object('id','careful','label','Inspect the route','detail','Reveal patrol timing before committing.','clue','Safer intel route.','success','You identify the cleanest opening.','failure','The map was incomplete and the crew loses time.'),
      jsonb_build_object('id','social','label','Follow a contact','detail','Ask a local source for a quiet entrance.','clue','Standing can open a shortcut.','success','A local contact points out an overlooked service road.','failure','The contact gives you a stale lead.'),
      jsonb_build_object('id','direct','label','Move immediately','detail','Take the first opening and keep momentum.','clue','Fast, but uncertainty remains.','success','The crew gets ahead of the first patrol.','failure','You move before the route is clear.')
    )
    when 2 then jsonb_build_array(
      jsonb_build_object('id','careful','label','Use a suitable tool','detail','Spend time preparing a precise entry.','clue','Preserves condition.','success','The access point opens without noise.','failure','The tool slips and costs condition.'),
      jsonb_build_object('id','social','label','Reserve supplies','detail','Call in a favour and keep resources for extraction.','clue','Protects the final stage.','success','A quiet resupply keeps the route flexible.','failure','The reserve arrives with strings attached.'),
      jsonb_build_object('id','direct','label','Bring protective equipment','detail','Accept attention in exchange for control.','clue','Strong against a hard obstacle.','success','The barrier gives way without stopping the team.','failure','The impact draws more attention than expected.')
    )
    when 3 then jsonb_build_array(
      jsonb_build_object('id','careful','label','Avoid the patrol','detail','Use timing and the information already gathered.','clue','Best when the route is known.','success','The patrol passes without seeing the objective.','failure','The timing window closes.'),
      jsonb_build_object('id','social','label','Use the information','detail','Turn a captain''s routine against the crew.','clue','Rewards a good read of the dossier.','success','A precise message splits the opposing crew.','failure','The opposing captain recognises the signal.'),
      jsonb_build_object('id','direct','label','Force a route','detail','Take control before the opposition can regroup.','clue','Reliable when condition is high.','success','The route is secured by pressure.','failure','The confrontation costs condition.')
    )
    else jsonb_build_array(
      jsonb_build_object('id','careful','label','Secure the objective','detail','Leave with the documented objective intact.','clue','Safest extraction.','success','The objective is secured and the route stays quiet.','failure','The team reaches extraction too late.'),
      jsonb_build_object('id','social','label','Call the contact','detail','Use a local exit and keep the city record clean.','clue','A flexible exit.','success','A trusted door opens at exactly the right moment.','failure','The exit has already been watched.'),
      jsonb_build_object('id','direct','label','Push through','detail','Trade attention for speed on the way out.','clue','Fast, but exposes the crew.','success','The crew clears the zone before it closes.','failure','The final push damages the route.')
    )
  end
$$;

-- A single pinned goal is enough to make the collection loop legible. It is
-- deliberately not another currency or progression track.
create table if not exists public.bw_collection_targets(
  user_id uuid primary key references auth.users(id) on delete cascade,
  item_id text not null references public.bw_items(id),
  pinned_at timestamptz not null default now()
);
alter table public.bw_collection_targets enable row level security;
drop policy if exists "users read own collection target" on public.bw_collection_targets;
create policy "users read own collection target" on public.bw_collection_targets for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_collection_targets from anon,authenticated;
grant select on public.bw_collection_targets to authenticated;

create or replace function public.bw_collection_target_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  target public.bw_collection_targets;
  item public.bw_items;
  boss public.bw_rise_bosses;
  boss_record public.bw_rise_boss_records;
begin
  select * into target from public.bw_collection_targets where user_id=uid;
  if target.item_id is null then
    return jsonb_build_object('pinned',false,'item',null,'route',null);
  end if;
  select * into item from public.bw_items where id=target.item_id;
  select b.* into boss from public.bw_rise_bosses b where b.reward_item_id=target.item_id order by b.sort_order limit 1;
  if boss.id is not null then
    select * into boss_record from public.bw_rise_boss_records where user_id=uid and boss_id=boss.id;
  end if;
  return jsonb_build_object(
    'pinned',true,
    'item',to_jsonb(item),
    'route',case when boss.id is null then jsonb_build_object('kind','catalogue','source','Blackwood collection','detail','Check the item record for its available routes.')
      else jsonb_build_object('kind','boss','source',boss.title,'districtId',boss.district_id,'detail','A qualifying victory guarantees this target on every fifth win.','wins',coalesce(boss_record.wins,0),'winsToGuarantee',greatest(0,5-mod(coalesce(boss_record.wins,0),5))) end,
    'pinnedAt',target.pinned_at
  );
end $$;

create or replace function public.bw_set_collection_target(p_item_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); item public.bw_items;
begin
  select * into item from public.bw_items where id=p_item_id;
  if item.id is null then raise exception 'collection item not found'; end if;
  insert into public.bw_collection_targets(user_id,item_id,pinned_at) values(uid,item.id,now())
  on conflict(user_id) do update set item_id=excluded.item_id,pinned_at=now();
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'collection','Pinned '||item.name,jsonb_build_object('itemId',item.id));
  return public.bw_collection_target_snapshot();
end $$;

create or replace function public.bw_clear_collection_target()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();
begin
  delete from public.bw_collection_targets where user_id=uid;
  return public.bw_collection_target_snapshot();
end $$;

create or replace function public.bw_operations_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; today_count integer; family_count integer:=1;
begin
  s:=public.bw_refresh_player(uid);
  perform public.bw_decay_district_heat(uid);
  insert into public.bw_district_progress(user_id,district_id) select uid,id from public.bw_operation_districts on conflict do nothing;
  select count(*) into today_count from public.bw_district_operation_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  select greatest(1,count(*)) into family_count from public.runner_crew_members where crew_id=(select crew_id from public.runner_crew_members where user_id=uid);
  return jsonb_build_object(
    'authority',true,
    'player',to_jsonb(s)||jsonb_build_object('cash',(select balance from public.player_wallets where user_id=uid)),
    'grind',jsonb_build_object('today',today_count,'fullEfficiencyRuns',10,'nextEfficiency',greatest(.40,1-greatest(0,today_count-9)*.03),'minimumEfficiency',.40,'heatDecayPerHour',5),
    'family',jsonb_build_object('memberCount',family_count,'eligible',family_count>=2),
    'target',public.bw_collection_target_snapshot(),
    'active',(select jsonb_build_object(
      'operationName',o.name,'districtName',d.name,'briefing',o.briefing,'captainName',o.captain_name,'difficulty',o.difficulty,'accent',d.accent,
      'approach',a.approach,'preparedApproach',a.approach,'mode',a.mode,'scenarioId',a.scenario_id,
      'scenarioLabel',public.bw_operation_scenario_label(a.scenario_id),'scenarioClue',public.bw_operation_scenario_clue(a.scenario_id),
      'currentStage',a.current_stage,'condition',a.condition,'successes',a.successes,'failures',a.failures,'supporters',a.supporters,
      'stageTitle',(array['Survey the ground','Prepare the route','Meet the NPC crew','Leave cleanly'])[a.current_stage],
      'stageBrief',(array['Gather current intelligence and identify the safest opening.','Secure transport, tools and a fallback route.','Carry out the plan against the operation captain.','Extract the team and recover the documented objective.'])[a.current_stage],
      'stageOptions',public.bw_operation_stage_options(a.current_stage,a.scenario_id)
    ) from public.bw_active_district_operations a join public.bw_district_operations o on o.id=a.operation_id join public.bw_operation_districts d on d.id=o.district_id where a.user_id=uid),
    'districts',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'zone',d.zone,'summary',d.summary,'threat',d.threat,'requiredLevel',d.required_level,'accent',d.accent,'heat',p.heat,'mastery',p.mastery,'clears',p.clears,'failures',p.failures,'operations',(select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'briefing',o.briefing,'captainName',o.captain_name,'difficulty',o.difficulty,'requiredLevel',o.required_level,'baseCash',o.base_cash,'baseXp',o.base_xp,'baseMastery',o.base_mastery,'rareChance',o.rare_chance) order by o.sort_order) from public.bw_district_operations o where o.district_id=d.id)) order by d.sort_order) from public.bw_operation_districts d join public.bw_district_progress p on p.district_id=d.id and p.user_id=uid),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(x order by x.created_at desc) from(select r.created_at,r.success,r.cash_reward as cash,r.xp_reward as xp,r.rare_item_id,i.name as item_name,o.name as operation_name from public.bw_district_operation_runs r join public.bw_district_operations o on o.id=r.operation_id left join public.bw_items i on i.id=r.rare_item_id where r.user_id=uid order by r.created_at desc limit 10)x),'[]'::jsonb)
  );
end $$;

create or replace function public.bw_begin_district_operation(p_operation_id text,p_approach text,p_mode text default 'solo')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; o public.bw_district_operations; member_count integer:=1; scenario text; scenarios text[]:=array['fog','patrol','fragile-cargo','local-contact'];
begin
  if p_approach not in('careful','direct','social') or p_mode not in('solo','family') then raise exception 'invalid operation plan'; end if;
  if exists(select 1 from public.bw_active_district_operations where user_id=uid) then raise exception 'finish your active operation first'; end if;
  s:=public.bw_refresh_player(uid); if s.status<>'okay' then raise exception 'unavailable while %',s.status; end if;
  select * into o from public.bw_district_operations where id=p_operation_id; if o.id is null then raise exception 'operation not found'; end if;
  if s.level<o.required_level then raise exception 'level % required',o.required_level; end if;
  if p_mode='family' then
    select count(*) into member_count from public.runner_crew_members where crew_id=(select crew_id from public.runner_crew_members where user_id=uid);
    if member_count<2 then raise exception 'join a family with at least two real members for family support'; end if;
  end if;
  scenario:=scenarios[1+mod(abs(hashtext(uid::text||':'||o.id||':'||(now() at time zone 'utc')::date::text)::bigint),4)::integer];
  insert into public.bw_active_district_operations(user_id,operation_id,approach,mode,supporters,scenario_id) values(uid,o.id,p_approach,p_mode,case when p_mode='family' then least(4,member_count) else 1 end,scenario);
  return public.bw_operations_snapshot();
end $$;

create or replace function public.bw_advance_district_operation(p_choice text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); a public.bw_active_district_operations; o public.bw_district_operations; s public.bw_player_states; p public.bw_district_progress;
  existing jsonb; selected jsonb; power numeric; chance numeric; won boolean; next_condition integer; completed boolean:=false; run_won boolean:=false;
  today_count integer; efficiency numeric(5,4); cash integer:=0; gained_xp integer:=0; gained_mastery integer:=0; drop_id text; drop_rarity text; v_event jsonb; choice_bonus integer; scenario_bonus integer;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_choice not in('careful','direct','social') then raise exception 'invalid stage choice'; end if;
  select e.event into existing from public.bw_district_operation_actions e where e.user_id=uid and e.request_id=p_request_id;
  if existing is not null then return jsonb_build_object('event',existing,'operations',public.bw_operations_snapshot()); end if;
  select * into a from public.bw_active_district_operations where user_id=uid for update; if a.user_id is null then raise exception 'no active operation'; end if;
  if a.expires_at<now() then delete from public.bw_active_district_operations where user_id=uid; raise exception 'operation dossier expired'; end if;
  select * into o from public.bw_district_operations where id=a.operation_id; s:=public.bw_refresh_player(uid);
  selected:=(select choice_json from jsonb_array_elements(public.bw_operation_stage_options(a.current_stage,a.scenario_id)) as choices(choice_json) where choice_json->>'id'=p_choice);
  if selected is null then raise exception 'choice is not available for this stage'; end if;
  perform public.bw_decay_district_heat(uid); insert into public.bw_district_progress(user_id,district_id) values(uid,o.district_id) on conflict do nothing;
  select * into p from public.bw_district_progress where user_id=uid and district_id=o.district_id for update;
  power:=case p_choice when 'direct' then (s.strength+s.defense)/2 when 'careful' then (s.speed+s.dexterity)/2 else s.crime_skill*4+s.intelligence end;
  power:=power+coalesce(public.bw_equipment_power(uid),0)/4;
  choice_bonus:=case a.current_stage when 1 then case p_choice when 'careful' then 10 when 'social' then 7 else 3 end when 2 then case p_choice when 'direct' then 10 when 'careful' then 8 else 6 end when 3 then case p_choice when 'direct' then 10 when 'careful' then 8 else 7 end else case p_choice when 'careful' then 10 when 'social' then 8 else 5 end end;
  scenario_bonus:=case a.scenario_id when 'fog' then case when p_choice='careful' then 6 else 0 end when 'patrol' then case when p_choice in('careful','direct') then 4 else 0 end when 'fragile-cargo' then case when a.current_stage=4 and p_choice='careful' then 8 when a.current_stage=2 and p_choice='direct' then -5 else 0 end when 'local-contact' then case when p_choice='social' then 7 else 0 end else 0 end;
  chance:=greatest(22,least(94,64+least(18,power/18)+choice_bonus+scenario_bonus+case when a.current_stage=2 and p_choice=a.approach then 4 else 0 end+case when a.mode='family' then least(12,(a.supporters-1)*4) else 0 end-o.difficulty*5-p.heat*.20));
  won:=random()*100<chance; next_condition:=greatest(0,a.condition-case when won then 0 else 25 end);
  if a.current_stage=4 or next_condition=0 then completed:=true; run_won:=won and next_condition>0; end if;
  v_event:=jsonb_build_object('success',won,'completed',completed,'stage',a.current_stage,'choice',p_choice,'choiceLabel',selected->>'label','clue',selected->>'clue','consequence',case when won then selected->>'success' else selected->>'failure' end,'title',case when won then 'Stage secured' else 'Operation setback' end,'message',case when won then selected->>'success' when completed then 'The dossier closed with partial intelligence. Your next attempt has a clearer lesson.' else selected->>'failure' end,'chance',round(chance),'condition',next_condition,'scenario',public.bw_operation_scenario_label(a.scenario_id));
  insert into public.bw_district_operation_actions(user_id,request_id,operation_id,stage,success,event) values(uid,p_request_id,o.id,a.current_stage,won,v_event);
  if not completed then update public.bw_active_district_operations set current_stage=current_stage+1,condition=next_condition,successes=successes+(won::integer),failures=failures+((not won)::integer) where user_id=uid; return jsonb_build_object('event',v_event,'operations',public.bw_operations_snapshot()); end if;
  select count(*) into today_count from public.bw_district_operation_runs where user_id=uid and created_at>=(now() at time zone 'utc')::date;
  efficiency:=greatest(.40,1-greatest(0,today_count-9)*.03);
  cash:=case when run_won then greatest(100,floor(o.base_cash*efficiency*(.75+random()*.5))::integer) else greatest(50,floor(o.base_cash*.08)::integer) end;
  gained_xp:=case when run_won then greatest(3,floor(o.base_xp*efficiency)::integer) else greatest(2,floor(o.base_xp*.12)::integer) end;
  gained_mastery:=case when run_won then greatest(2,floor(o.base_mastery*efficiency)::integer) else 1 end;
  if run_won and random()<o.rare_chance then drop_rarity:=case when o.difficulty>=9 and random()<.08 then 'legendary' when o.difficulty>=6 and random()<.24 then 'epic' else 'rare' end; drop_id:=public.bw_award_relic(uid,drop_rarity); end if;
  update public.player_wallets set balance=balance+cash,version=version+1,updated_at=now() where user_id=uid;
  perform public.bw_gain_xp(uid,gained_xp);
  update public.bw_player_states set respect=respect+case when run_won then greatest(1,o.difficulty) else 0 end,updated_at=now() where user_id=uid;
  update public.bw_district_progress set heat=least(100,heat+6+o.difficulty*2),mastery=mastery+gained_mastery,clears=clears+(run_won::integer),failures=failures+((not run_won)::integer),last_played_at=now(),last_heat_at=now() where user_id=uid and district_id=o.district_id;
  if o.faction_id is not null then insert into public.bw_faction_reputation(user_id,faction_id,reputation,assignments_completed) values(uid,o.faction_id,case when run_won then greatest(2,o.difficulty) else 1 end,run_won::integer) on conflict(user_id,faction_id) do update set reputation=bw_faction_reputation.reputation+excluded.reputation,assignments_completed=bw_faction_reputation.assignments_completed+excluded.assignments_completed,updated_at=now(); end if;
  insert into public.bw_district_operation_runs(user_id,operation_id,success,approach,mode,stage_reached,cash_reward,xp_reward,mastery_reward,efficiency,rare_item_id,scenario_id) values(uid,o.id,run_won,a.approach,a.mode,a.current_stage,cash,gained_xp,gained_mastery,efficiency,drop_id,a.scenario_id);
  delete from public.bw_active_district_operations where user_id=uid;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  v_event:=v_event||jsonb_build_object('success',run_won,'completed',true,'title',case when run_won then 'Operation complete' else 'Dossier closed' end,'message',case when run_won then 'Extraction complete. Rewards and district standing were recorded.' else 'You left with partial intelligence and permanent mastery progress.' end,'cash',cash,'xp',gained_xp,'mastery',gained_mastery,'efficiency',efficiency,'itemId',drop_id,'itemName',(select name from public.bw_items where id=drop_id),'nextAction',case when run_won then 'Use the new mastery to prepare for the district boss.' else 'Review the stage choice and try a different route when the dossier is ready.' end);
  update public.bw_district_operation_actions x set event=v_event where x.user_id=uid and x.request_id=p_request_id;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'operation',case when run_won then 'Completed ' else 'Attempted ' end||o.name,v_event);
  return jsonb_build_object('event',v_event,'operations',public.bw_operations_snapshot(),'state',public.bw_get_state());
end $$;

-- ---------------------------------------------------------------------------
-- Bosses: a three-stage encounter with a distinct preparation pattern per boss.
-- ---------------------------------------------------------------------------

alter table public.bw_rise_bosses add column if not exists mechanic text not null default 'Read the room';
alter table public.bw_rise_bosses add column if not exists entry_approach text not null default 'careful';
alter table public.bw_rise_bosses add column if not exists pressure_approach text not null default 'direct';
alter table public.bw_rise_bosses add column if not exists extraction_approach text not null default 'careful';
alter table public.bw_rise_bosses add column if not exists failure_hint text not null default 'Change one preparation choice before trying again.';
alter table public.bw_rise_boss_attempts add column if not exists plan jsonb not null default '{}'::jsonb;

update public.bw_rise_bosses set
  mechanic=case id when 'boss-harbor' then 'Information and controlled extraction' when 'boss-quarter' then 'Precision and unnecessary confrontation' when 'boss-north' then 'Protection and resource management' when 'boss-rail' then 'Timing and route selection' when 'boss-south' then 'Equipment preparation and direct pressure' when 'boss-finance' then 'Intelligence and faction knowledge' when 'boss-narrows' then 'Adaptation to revealed information' else 'A combined test of every district lesson' end,
  entry_approach=case id when 'boss-harbor' then 'careful' when 'boss-quarter' then 'social' when 'boss-north' then 'careful' when 'boss-rail' then 'careful' when 'boss-south' then 'direct' when 'boss-finance' then 'social' when 'boss-narrows' then 'social' else 'careful' end,
  pressure_approach=case id when 'boss-harbor' then 'social' when 'boss-quarter' then 'careful' when 'boss-north' then 'direct' when 'boss-rail' then 'direct' when 'boss-south' then 'direct' when 'boss-finance' then 'careful' when 'boss-narrows' then 'social' else 'direct' end,
  extraction_approach=case id when 'boss-harbor' then 'careful' when 'boss-quarter' then 'social' when 'boss-north' then 'careful' when 'boss-rail' then 'careful' when 'boss-south' then 'careful' when 'boss-finance' then 'social' when 'boss-narrows' then 'careful' else 'social' end,
  failure_hint=case id when 'boss-harbor' then 'Protect the extraction or gather more information.' when 'boss-quarter' then 'Use precision and avoid a needless confrontation.' when 'boss-north' then 'Bring protection and preserve supplies.' when 'boss-rail' then 'Read the timing window before forcing the route.' when 'boss-south' then 'A direct approach needs the right equipment behind it.' when 'boss-finance' then 'Use faction knowledge before applying pressure.' when 'boss-narrows' then 'Adapt after the first signal instead of repeating it.' else 'Mix the approaches you learned across the city.' end
where id in('boss-harbor','boss-quarter','boss-north','boss-rail','boss-south','boss-finance','boss-narrows','boss-heights');

create or replace function public.bw_challenge_district_boss_plan(p_boss_id text,p_plan jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); b public.bw_rise_bosses; s public.bw_player_states; dp public.bw_district_progress; r public.bw_rise_boss_records; prior jsonb; ev jsonb; found text; crew uuid;
  eq_attack numeric:=0; eq_defense numeric:=0; eq_speed numeric:=0; eq_dexterity numeric:=0; entry_score numeric; pressure_score numeric; extraction_score numeric;
  entry_chance integer; pressure_chance integer; extraction_chance integer; entry_won boolean; pressure_won boolean; extraction_won boolean; won boolean; parts integer; phase_count integer;
begin
  if p_request_id is null then raise exception 'request id required'; end if;
  if coalesce(p_plan->>'entry','') not in('careful','direct','social') or coalesce(p_plan->>'pressure','') not in('careful','direct','social') or coalesce(p_plan->>'extraction','') not in('careful','direct','social') then raise exception 'boss plan needs three valid approaches'; end if;
  select event into prior from public.bw_rise_boss_attempts where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
  select * into b from public.bw_rise_bosses where id=p_boss_id; if b.id is null then raise exception 'boss not found'; end if;
  s:=public.bw_refresh_player(uid); if s.status<>'okay' then raise exception 'you are currently %',s.status; end if;
  select * into dp from public.bw_district_progress where user_id=uid and district_id=b.district_id; if s.level<b.required_level or coalesce(dp.mastery,0)<b.required_mastery or coalesce(dp.clears,0)<b.required_clears then raise exception 'district mastery requirements not met'; end if;
  insert into public.bw_rise_boss_records(user_id,boss_id) values(uid,b.id) on conflict do nothing; select * into r from public.bw_rise_boss_records where user_id=uid and boss_id=b.id for update;
  if r.last_attempt_at is not null and r.last_attempt_at+make_interval(hours=>b.cooldown_hours)>now() then raise exception 'boss recon is still on cooldown'; end if;
  if coalesce(dp.heat,0)>85 then raise exception 'district heat must fall to 85 or lower'; end if;
  select coalesce(sum(i.attack),0),coalesce(sum(i.defense),0),coalesce(sum(i.speed),0),coalesce(sum(i.dexterity),0) into eq_attack,eq_defense,eq_speed,eq_dexterity from public.bw_equipment e join public.bw_items i on i.id=e.item_id where e.user_id=uid;
  entry_score:=case p_plan->>'entry' when 'careful' then s.speed+eq_speed+s.dexterity+eq_dexterity when 'direct' then s.strength+eq_attack+s.defense+eq_defense else s.intelligence+s.crime_skill end;
  pressure_score:=case p_plan->>'pressure' when 'careful' then s.dexterity+eq_dexterity+s.speed+eq_speed when 'direct' then s.strength+eq_attack+s.defense+eq_defense else s.intelligence+s.crime_skill+s.manual end;
  extraction_score:=case p_plan->>'extraction' when 'careful' then s.speed+eq_speed+s.dexterity+eq_dexterity when 'direct' then s.defense+eq_defense+s.strength+eq_attack else s.intelligence+s.crime_skill+s.speed end;
  entry_chance:=greatest(25,least(92,round(48+(entry_score-b.base_power)*.28+case when p_plan->>'entry'=b.entry_approach then 14 else -5 end)::integer));
  pressure_chance:=greatest(25,least(92,round(48+(pressure_score-b.base_power)*.28+case when p_plan->>'pressure'=b.pressure_approach then 14 else -5 end)::integer));
  extraction_chance:=greatest(25,least(92,round(48+(extraction_score-b.base_power)*.28+case when p_plan->>'extraction'=b.extraction_approach then 14 else -5 end)::integer));
  entry_won:=floor(random()*100)+1<=entry_chance; pressure_won:=floor(random()*100)+1<=pressure_chance; extraction_won:=floor(random()*100)+1<=extraction_chance; phase_count:=(entry_won::integer)+(pressure_won::integer)+(extraction_won::integer); won:=phase_count>=2;
  parts:=case when won then b.parts_reward else greatest(5,floor(b.parts_reward*.2)::integer) end;
  if won and (mod(r.wins+1,5)=0 or random()<.20) then found:=b.reward_item_id; insert into public.bw_inventory(user_id,item_id,quantity) values(uid,found,1) on conflict(user_id,item_id) do update set quantity=bw_inventory.quantity+1; end if;
  insert into public.bw_rise_materials(user_id,workshop_parts) values(uid,parts) on conflict(user_id) do update set workshop_parts=bw_rise_materials.workshop_parts+excluded.workshop_parts,updated_at=now();
  update public.bw_rise_boss_records set wins=wins+case when won then 1 else 0 end,losses=losses+case when won then 0 else 1 end,target_drops=target_drops+case when found is null then 0 else 1 end,last_attempt_at=now() where user_id=uid and boss_id=b.id;
  update public.bw_district_progress set heat=least(100,heat+12),last_played_at=now(),last_heat_at=now() where user_id=uid and district_id=b.district_id;
  if won then select crew_id into crew from public.runner_crew_members where user_id=uid; if crew is not null then update public.runner_crew_members set contribution=contribution+8 where user_id=uid; update public.runner_crews set xp=xp+8,updated_at=now() where id=crew; end if; perform public.bw_gain_xp(uid,20+b.sort_order*8); end if;
  ev:=jsonb_build_object('success',won,'title',case when won then b.name||' defeated' else b.name||' held the district' end,'message',case when won then 'Two of three encounter stages held. The district record has changed.' else b.failure_hint end,'chance',greatest(entry_chance,pressure_chance,extraction_chance),'parts',parts,'itemId',found,'itemName',(select name from public.bw_items where id=found),'mechanic',b.mechanic,'plan',p_plan,'stages',jsonb_build_array(jsonb_build_object('name','Entry','approach',p_plan->>'entry','chance',entry_chance,'success',entry_won),jsonb_build_object('name','Pressure','approach',p_plan->>'pressure','chance',pressure_chance,'success',pressure_won),jsonb_build_object('name','Extraction','approach',p_plan->>'extraction','chance',extraction_chance,'success',extraction_won)),'firstClear',won and r.wins=0,'nextAction',case when won then 'Use the blueprint or prepare the next district.' else b.failure_hint end);
  insert into public.bw_rise_boss_attempts(user_id,boss_id,request_id,success,chance,parts_awarded,item_id,event,plan) values(uid,b.id,p_request_id,won,greatest(entry_chance,pressure_chance,extraction_chance),parts,found,ev,p_plan);
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'district-boss',case when won then 'Defeated ' else 'Lost to ' end||b.name,ev);
  return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_challenge_district_boss(p_boss_id text,p_approach text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return public.bw_challenge_district_boss_plan(p_boss_id,jsonb_build_object('entry',p_approach,'pressure',p_approach,'extraction',p_approach),p_request_id);
end $$;

create or replace function public.bw_rise_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; parts bigint;
begin
  s:=public.bw_refresh_player(uid); insert into public.bw_rise_materials(user_id) values(uid) on conflict do nothing; select workshop_parts into parts from public.bw_rise_materials where user_id=uid;
  return jsonb_build_object('authority',true,'parts',parts,'player',to_jsonb(s),'target',public.bw_collection_target_snapshot(),
    'bosses',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'districtId',b.district_id,'districtName',d.name,'accent',d.accent,'name',b.name,'title',b.title,'briefing',b.briefing,'weakness',b.weakness,'mechanic',b.mechanic,'entryApproach',b.entry_approach,'pressureApproach',b.pressure_approach,'extractionApproach',b.extraction_approach,'failureHint',b.failure_hint,'requiredLevel',b.required_level,'requiredMastery',b.required_mastery,'requiredClears',b.required_clears,'basePower',b.base_power,'partsReward',b.parts_reward,'rewardItemId',i.id,'rewardName',i.name,'rewardRarity',i.rarity,'wins',coalesce(r.wins,0),'losses',coalesce(r.losses,0),'targetDrops',coalesce(r.target_drops,0),'mastery',coalesce(dp.mastery,0),'clears',coalesce(dp.clears,0),'unlocked',s.level>=b.required_level and coalesce(dp.mastery,0)>=b.required_mastery and coalesce(dp.clears,0)>=b.required_clears,'cooldownSeconds',greatest(0,coalesce(extract(epoch from (r.last_attempt_at+make_interval(hours=>b.cooldown_hours)-now()))::integer,0)) order by b.sort_order) from public.bw_rise_bosses b join public.bw_operation_districts d on d.id=b.district_id join public.bw_items i on i.id=b.reward_item_id left join public.bw_rise_boss_records r on r.user_id=uid and r.boss_id=b.id left join public.bw_district_progress dp on dp.user_id=uid and dp.district_id=b.district_id),'[]'::jsonb),
    'recipes',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'partsCost',r.parts_cost,'requiredLevel',r.required_level,'requiredBossId',r.required_boss_id,'bossDefeated',coalesce(br.wins,0)>0,'item',to_jsonb(i),'owned',coalesce(v.quantity,0)) order by r.sort_order) from public.bw_rise_recipes r join public.bw_items i on i.id=r.item_id left join public.bw_rise_boss_records br on br.user_id=uid and br.boss_id=r.required_boss_id left join public.bw_inventory v on v.user_id=uid and v.item_id=i.id),'[]'::jsonb),
    'inventory',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('item_id',i.id,'quantity',v.quantity,'equipped',v.equipped,'locked',v.locked,'favourite',v.favourite,'available',v.quantity-case when e.item_id is null then 0 else 1 end,'upgradeRank',coalesce(u.rank,0),'upgradeCost',case when coalesce(u.rank,0)<3 then public.bw_rise_upgrade_cost(i.rarity,coalesce(u.rank,0)+1) end) order by i.rarity,i.name) from public.bw_inventory v join public.bw_items i on i.id=v.item_id left join public.bw_equipment e on e.user_id=uid and e.item_id=i.id left join public.bw_item_upgrades u on u.user_id=uid and u.item_id=i.id where v.user_id=uid and i.slot is not null),'[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Equipment identity: lock/favourite flags and two saved loadout presets.
-- ---------------------------------------------------------------------------

alter table public.bw_inventory add column if not exists locked boolean not null default false;
alter table public.bw_inventory add column if not exists favourite boolean not null default false;

create table if not exists public.bw_loadout_presets(
  user_id uuid not null references auth.users(id) on delete cascade,
  preset_no smallint not null check(preset_no between 1 and 2),
  name text not null default 'Saved build',
  slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(user_id,preset_no)
);
alter table public.bw_loadout_presets enable row level security;
drop policy if exists "users read own loadout presets" on public.bw_loadout_presets;
create policy "users read own loadout presets" on public.bw_loadout_presets for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_loadout_presets from anon,authenticated;
grant select on public.bw_loadout_presets to authenticated;

create or replace function public.bw_loadout_presets_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();
begin
  insert into public.bw_loadout_presets(user_id,preset_no,name) values(uid,1,'Direct build'),(uid,2,'Careful build') on conflict do nothing;
  return jsonb_build_object('presets',coalesce((select jsonb_agg(jsonb_build_object('slot',p.preset_no,'name',p.name,'slots',p.slots,'updatedAt',p.updated_at) order by p.preset_no) from public.bw_loadout_presets p where p.user_id=uid),'[]'::jsonb));
end $$;

create or replace function public.bw_save_loadout_preset(p_preset_no smallint,p_name text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); slots jsonb; label text:=left(nullif(trim(p_name),''),40);
begin
  if p_preset_no not between 1 and 2 then raise exception 'preset must be one or two'; end if;
  select coalesce(jsonb_object_agg(slot,item_id),'{}'::jsonb) into slots from public.bw_equipment where user_id=uid;
  insert into public.bw_loadout_presets(user_id,preset_no,name,slots,updated_at) values(uid,p_preset_no,coalesce(label,case p_preset_no when 1 then 'Direct build' else 'Careful build' end),slots,now()) on conflict(user_id,preset_no) do update set name=excluded.name,slots=excluded.slots,updated_at=now();
  return public.bw_loadout_presets_snapshot();
end $$;

create or replace function public.bw_apply_loadout_preset(p_preset_no smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); preset public.bw_loadout_presets; invalid_slot text; invalid_item text; s public.bw_player_states;
begin
  if p_preset_no not between 1 and 2 then raise exception 'preset must be one or two'; end if;
  s:=public.bw_refresh_player(uid); select * into preset from public.bw_loadout_presets where user_id=uid and preset_no=p_preset_no for update;
  if preset.user_id is null then raise exception 'loadout preset is empty'; end if;
  select key into invalid_slot from jsonb_each_text(preset.slots) where key not in('primary','secondary','melee','armor','helmet','boots','gloves','accessory') limit 1;
  if invalid_slot is not null then raise exception 'saved preset has an invalid slot'; end if;
  select pair.value into invalid_item from jsonb_each_text(preset.slots) as pair(key,value) where not exists(select 1 from public.bw_inventory v join public.bw_items i on i.id=v.item_id where v.user_id=uid and v.item_id=pair.value and v.quantity>0 and i.slot=pair.key and s.level>=i.level_required) limit 1;
  if invalid_item is not null then raise exception 'saved preset contains unavailable equipment'; end if;
  delete from public.bw_equipment where user_id=uid;
  insert into public.bw_equipment(user_id,slot,item_id) select uid,key,value from jsonb_each_text(preset.slots);
  update public.bw_inventory set equipped=false where user_id=uid;
  update public.bw_inventory set equipped=true where user_id=uid and item_id in(select value from jsonb_each_text(preset.slots));
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'equipment','Applied loadout preset '||p_preset_no,jsonb_build_object('preset',p_preset_no));
  return jsonb_build_object('loadout',public.bw_get_loadout(),'presets',public.bw_loadout_presets_snapshot());
end $$;

create or replace function public.bw_set_item_flags(p_item_id text,p_locked boolean,p_favourite boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); item public.bw_items;
begin
  select i.* into item from public.bw_items i join public.bw_inventory v on v.item_id=i.id and v.user_id=uid where i.id=p_item_id for update;
  if item.id is null or item.slot is null then raise exception 'owned equipment not found'; end if;
  update public.bw_inventory set locked=coalesce(p_locked,false),favourite=coalesce(p_favourite,false) where user_id=uid and item_id=p_item_id;
  return public.bw_get_loadout();
end $$;

create or replace function public.bw_dismantle_item(p_item_id text,p_quantity integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); i public.bw_items; v public.bw_inventory; prior jsonb; available integer; gained bigint; remaining integer; ev jsonb;
begin
  if p_request_id is null then raise exception 'request id required'; end if;
  select event into prior from public.bw_rise_actions where user_id=uid and request_id=p_request_id; if prior is not null then return jsonb_build_object('event',prior,'rise',public.bw_rise_snapshot()); end if;
  if p_quantity<1 or p_quantity>99 then raise exception 'quantity must be between 1 and 99'; end if;
  select * into i from public.bw_items where id=p_item_id; select * into v from public.bw_inventory where user_id=uid and item_id=p_item_id for update;
  if i.id is null or i.slot is null or v.item_id is null then raise exception 'equipment not found'; end if;
  if v.locked then raise exception 'unlock this item before dismantling it'; end if;
  available:=v.quantity-case when exists(select 1 from public.bw_equipment where user_id=uid and item_id=p_item_id) then 1 else 0 end; if available<p_quantity then raise exception 'not enough unequipped copies'; end if;
  gained:=public.bw_rise_parts_yield(i.rarity)*p_quantity; remaining:=v.quantity-p_quantity;
  if remaining=0 then delete from public.bw_inventory where user_id=uid and item_id=p_item_id; else update public.bw_inventory set quantity=remaining where user_id=uid and item_id=p_item_id; end if;
  insert into public.bw_rise_materials(user_id,workshop_parts) values(uid,gained) on conflict(user_id) do update set workshop_parts=bw_rise_materials.workshop_parts+excluded.workshop_parts,updated_at=now();
  ev:=jsonb_build_object('success',true,'title','Equipment dismantled','message',i.name||' became reusable workshop parts.','parts',gained);
  insert into public.bw_rise_actions(user_id,request_id,kind,item_id,quantity,parts_delta,event) values(uid,p_request_id,'dismantle',i.id,p_quantity,gained,ev); return jsonb_build_object('event',ev,'rise',public.bw_rise_snapshot());
end $$;

-- ---------------------------------------------------------------------------
-- Campaign and Daily Life: breadth and permanent city contribution.
-- ---------------------------------------------------------------------------

create or replace function public.bw_story_metric(p_uid uuid,p_type text,p_faction text)
returns bigint language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states; result bigint:=0;
begin
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
    when 'unique_boss_wins' then (select count(*) from public.bw_rise_boss_records where user_id=p_uid and wins>0)
    when 'upgrade_rank' then coalesce((select max(rank) from public.bw_item_upgrades where user_id=p_uid),0)
    when 'takeover_points' then coalesce((select sum(points) from public.bw_takeover_contributions where user_id=p_uid),0)
    when 'city_contribution' then coalesce((select count(*)*10 from public.bw_district_operation_runs where user_id=p_uid and success),0)+coalesce((select count(*)*6 from public.bw_faction_assignment_runs where user_id=p_uid and success),0)+coalesce((select count(*)*30 from public.bw_rise_boss_records where user_id=p_uid and wins>0),0)+coalesce((select count(*)*8 from public.bw_civic_runs where user_id=p_uid and status='completed'),0)
    when 'standing' then public.bw_standing_score(p_uid) else 0 end;
  return coalesce(result,0);
end $$;

update public.bw_story_missions set objective='Defeat four different district bosses.',objective_type='unique_boss_wins',objective_target=4,unlock_text='Unlocks the permanent city influence objective.' where id='power-1';
update public.bw_story_missions set objective='Earn 250 permanent city contribution points.',objective_type='city_contribution',objective_target=250,action_page='operations',unlock_text='Takeover can accelerate this record, but the campaign never waits for a season.' where id='power-2';

create or replace function public.bw_daily_objective_is_eligible(p_uid uuid,p_objective_id text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.bw_player_states;
begin
  select * into s from public.bw_player_states where user_id=p_uid;
  return case p_objective_id
    when 'city-shift' then exists(select 1 from public.bw_job_careers where user_id=p_uid)
    when 'training' then s.status='okay'
    when 'district-run' then s.level>=1 and exists(select 1 from public.bw_district_operations where required_level<=s.level)
    when 'faction-call' then exists(select 1 from public.bw_faction_assignments where level_required<=s.level)
    else true
  end;
end $$;

create or replace function public.bw_daily_objective_ids(p_uid uuid,p_day date)
returns text[] language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(array_agg(id order by rotation,sort_order),'{}'::text[]) from (
    select t.id,t.sort_order,mod(t.sort_order+extract(doy from p_day)::integer,7) rotation
    from public.bw_daily_objective_templates t
    where public.bw_daily_objective_is_eligible(p_uid,t.id)
    order by rotation,t.sort_order limit 3
  ) chosen
$$;

create or replace function public.bw_daily_metric(p_uid uuid,p_metric text,p_since timestamptz)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result integer:=0;
begin
  case p_metric
    when 'crimes' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='crime' and created_at>=p_since and data->>'success'='true';
    when 'jobs' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='job' and created_at>=p_since and summary ilike 'Completed a shift%';
    when 'hustles' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='hustle' and created_at>=p_since and summary ilike 'Completed %';
    when 'training' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='training' and created_at>=p_since;
    when 'operations' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='operation' and created_at>=p_since and summary ilike 'Completed %';
    when 'factions' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='faction' and created_at>=p_since and summary ilike 'Completed %';
    when 'market' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and kind='market' and created_at>=p_since;
    when 'weekly_actions' then select count(*)::integer into result from public.bw_action_logs where user_id=p_uid and created_at>=p_since and kind in('crime','job','hustle','training','operation','faction','market','combat','contract','relic','shop','civic_contract','district-boss') and summary not ilike 'Started %' and summary not ilike 'Equipped %' and summary not ilike 'Unequipped %';
    else result:=0;
  end case;
  return greatest(0,coalesce(result,0));
end $$;

create or replace function public.bw_daily_life_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; today date:=(now() at time zone 'utc')::date; v_week_start date:=date_trunc('week',now() at time zone 'utc')::date; streak public.bw_daily_streaks; current_day integer; claimed_today boolean; objective_ids text[]; state jsonb;
begin
  s:=public.bw_refresh_player(uid); perform public.ensure_exchange_wallet(uid); insert into public.bw_daily_streaks(user_id) values(uid) on conflict do nothing; select * into streak from public.bw_daily_streaks where user_id=uid;
  claimed_today:=exists(select 1 from public.bw_daily_reward_claims where user_id=uid and reward_date=today); current_day:=case when streak.last_claim_date=today-1 then case when streak.current_streak>=7 then 1 else streak.current_streak+1 end when streak.last_claim_date=today then streak.current_streak when streak.last_claim_date is null then 1 else 1 end; objective_ids:=public.bw_daily_objective_ids(uid,today); state:=public.bw_get_state();
  return jsonb_build_object('authority',true,'date',today,'player',state->'player','claimedToday',claimed_today,'currentDay',current_day,'streak',jsonb_build_object('current',streak.current_streak,'best',streak.best_streak,'total',streak.total_claims,'lastClaimDate',streak.last_claim_date),'rewards',jsonb_build_array(jsonb_build_object('day',1,'cash',500,'xp',15,'energy',10,'nerve',1,'merits',0,'claimed',claimed_today and current_day>1),jsonb_build_object('day',2,'cash',750,'xp',20,'energy',15,'nerve',2,'merits',0,'claimed',claimed_today and current_day>2),jsonb_build_object('day',3,'cash',1000,'xp',30,'energy',20,'nerve',2,'merits',1,'claimed',claimed_today and current_day>3),jsonb_build_object('day',4,'cash',1250,'xp',35,'energy',25,'nerve',3,'merits',0,'claimed',claimed_today and current_day>4),jsonb_build_object('day',5,'cash',1500,'xp',45,'energy',30,'nerve',3,'merits',1,'claimed',claimed_today and current_day>5),jsonb_build_object('day',6,'cash',2000,'xp',60,'energy',40,'nerve',4,'merits',1,'claimed',claimed_today and current_day>6),jsonb_build_object('day',7,'cash',3000,'xp',90,'energy',50,'nerve',6,'merits',2,'claimed',claimed_today and current_day=7)),'objectives',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'metric',t.metric,'target',t.target,'progress',least(t.target,public.bw_daily_metric(uid,t.metric,today::timestamp at time zone 'utc')),'cash',t.cash_reward,'xp',t.xp_reward,'merits',t.merit_reward,'claimedAt',c.claimed_at) order by t.sort_order) from public.bw_daily_objective_templates t left join public.bw_daily_objective_claims c on c.user_id=uid and c.objective_date=today and c.objective_id=t.id where t.id=any(objective_ids)),'[]'::jsonb),'weekly',jsonb_build_object('weekStart',v_week_start,'target',10,'progress',least(10,public.bw_daily_metric(uid,'weekly_actions',v_week_start::timestamp at time zone 'utc')),'cash',3000,'xp',80,'merits',1,'claimedAt',(select wc.claimed_at from public.bw_weekly_objective_claims wc where wc.user_id=uid and wc.week_start=v_week_start)),'resetNote','Rewards and daily objectives reset at midnight UTC. Only eligible objectives are assigned.');
end $$;

create or replace function public.bw_claim_daily_objective(p_objective_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); today date:=(now() at time zone 'utc')::date; objective public.bw_daily_objective_templates; progress integer;
begin
  if p_objective_id is null or not p_objective_id=any(public.bw_daily_objective_ids(uid,today)) then raise exception 'objective is not assigned today'; end if;
  select * into objective from public.bw_daily_objective_templates where id=p_objective_id; if objective.id is null then raise exception 'daily objective not found'; end if;
  if exists(select 1 from public.bw_daily_objective_claims where user_id=uid and objective_date=today and objective_id=objective.id) then raise exception 'objective already claimed'; end if;
  progress:=public.bw_daily_metric(uid,objective.metric,today::timestamp at time zone 'utc'); if progress<objective.target then raise exception 'objective is not complete'; end if;
  insert into public.bw_daily_objective_claims(user_id,objective_date,objective_id) values(uid,today,objective.id); update public.player_wallets set balance=balance+objective.cash_reward,version=version+1,updated_at=now() where user_id=uid; update public.bw_player_states set merits=merits+objective.merit_reward,updated_at=now() where user_id=uid; perform public.bw_gain_xp(uid,objective.xp_reward); perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'daily','Claimed objective: '||objective.title,jsonb_build_object('objective',objective.id,'cash',objective.cash_reward,'xp',objective.xp_reward,'merits',objective.merit_reward)); return jsonb_build_object('event',jsonb_build_object('objective',objective.id,'cash',objective.cash_reward,'xp',objective.xp_reward),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
end $$;

create or replace function public.bw_claim_weekly_objective()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); v_week_start date:=date_trunc('week',now() at time zone 'utc')::date; progress integer;
begin
  if exists(select 1 from public.bw_weekly_objective_claims wc where wc.user_id=uid and wc.week_start=v_week_start) then raise exception 'weekly objective already claimed'; end if;
  progress:=public.bw_daily_metric(uid,'weekly_actions',v_week_start::timestamp at time zone 'utc'); if progress<10 then raise exception 'weekly objective is not complete'; end if;
  insert into public.bw_weekly_objective_claims(user_id,week_start) values(uid,v_week_start); update public.player_wallets set balance=balance+3000,version=version+1,updated_at=now() where user_id=uid; update public.bw_player_states set merits=merits+1,updated_at=now() where user_id=uid; perform public.bw_gain_xp(uid,80); perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid)); insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'daily','Claimed weekly objective',jsonb_build_object('weekStart',v_week_start,'cash',3000,'xp',80,'merits',1)); return jsonb_build_object('event',jsonb_build_object('cash',3000,'xp',80),'daily',public.bw_daily_life_snapshot(),'state',public.bw_get_state());
end $$;

-- ---------------------------------------------------------------------------
-- Arcade accounting: losses reduce the redeemable running net; retries stay
-- idempotent, and the lifetime P/L is visible for audit without becoming cash.
-- ---------------------------------------------------------------------------

alter table public.bw_ledger_wallets add column if not exists arcade_net_profit bigint not null default 0;
alter table public.bw_blackjack_games add column if not exists last_action_request_id uuid;

create or replace function public.bw_record_arcade_winnings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare net_result bigint:=new.payout-new.bet;
begin
  perform public.bw_ensure_ledger(new.user_id);
  update public.bw_ledger_wallets set arcade_net_profit=arcade_net_profit+net_result,arcade_winnings=greatest(0,arcade_winnings+net_result),updated_at=now() where user_id=new.user_id;
  return new;
end $$;
drop trigger if exists bw_arcade_winnings on public.bw_casino_rounds;
create trigger bw_arcade_winnings after insert on public.bw_casino_rounds for each row execute function public.bw_record_arcade_winnings();

create or replace function public.bw_blackjack_action_v1(p_action text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); g public.bw_blackjack_games; pv int; dv int; v_payout bigint:=0; result text;
begin
  if p_request_id is null then raise exception 'request id is required'; end if;
  if p_action not in('hit','stand') then raise exception 'invalid action'; end if;
  if exists(select 1 from public.bw_casino_rounds where user_id=uid and request_id=p_request_id) then return public.bw_casino_snapshot(); end if;
  select * into g from public.bw_blackjack_games where user_id=uid and status='active' for update;
  if g.id is null then raise exception 'no active hand'; end if;
  if g.last_action_request_id=p_request_id then return public.bw_casino_snapshot(); end if;
  if p_action='hit' then g.player_hand:=array_append(g.player_hand,g.deck[1]); g.deck:=g.deck[2:array_length(g.deck,1)]; pv:=public.bw_card_value(g.player_hand); if pv>21 then result:='lost'; else update public.bw_blackjack_games set player_hand=g.player_hand,deck=g.deck,last_action_request_id=p_request_id where id=g.id; return public.bw_casino_snapshot(); end if;
  else pv:=public.bw_card_value(g.player_hand); while public.bw_card_value(g.dealer_hand)<17 loop g.dealer_hand:=array_append(g.dealer_hand,g.deck[1]); g.deck:=g.deck[2:array_length(g.deck,1)]; end loop; dv:=public.bw_card_value(g.dealer_hand); if dv>21 or pv>dv then result:='won'; v_payout:=g.bet*2; elsif pv=dv then result:='push'; v_payout:=g.bet; else result:='lost'; end if; end if;
  update public.bw_blackjack_games set player_hand=g.player_hand,dealer_hand=g.dealer_hand,deck=g.deck,status=result,payout=v_payout,finished_at=now(),last_action_request_id=p_request_id where id=g.id;
  if v_payout>0 then perform public.bw_casino_credit(uid,v_payout); end if;
  insert into public.bw_casino_rounds(user_id,game,request_id,bet,payout,outcome) values(uid,'blackjack',p_request_id,g.bet,v_payout,jsonb_build_object('result',result));
  return public.bw_casino_snapshot();
end $$;

create or replace function public.bw_blackjack_action(p_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return public.bw_blackjack_action_v1(p_action,gen_random_uuid());
end $$;

create or replace function public.bw_casino_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); wallet public.bw_ledger_wallets;
begin
  wallet:=public.bw_ensure_ledger(uid);
  return jsonb_build_object('balance',wallet.balance,'currency','LC','currencyName','Arcade Dollars','displaySymbol','$','purchasable',false,'cashValue',false,'gameCashOnly',true,'redeemable',wallet.arcade_winnings,'netArcadeProfit',wallet.arcade_net_profit,'redeemRate',2,'cityCashPer100',50,'conversionText','100 Arcade Dollars = $50 city cash; losses reduce the current redeemable net.','blackjack',public.bw_blackjack_view(uid));
end $$;

create or replace function public.bw_currency_snapshot()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); wallet public.bw_ledger_wallets; deposited bigint:=0;
begin
  wallet:=public.bw_ensure_ledger(uid); select coalesce(balance,0) into deposited from public.bw_broker_accounts where user_id=uid and status='active';
  return jsonb_build_object('currency','ARCADE_DOLLARS','currencyName','Arcade Dollars','displaySymbol','$','available',wallet.balance,'tradingDeposited',coalesce(deposited,0),'totalPlayBalance',wallet.balance+coalesce(deposited,0),'redeemableWinnings',wallet.arcade_winnings,'netArcadeProfit',wallet.arcade_net_profit,'purchasable',false,'cashValue',false,'conversionText','100 Arcade Dollars = $50 city cash from verified net Arcade wins only; losses reduce the current redeemable net.');
end $$;

-- Keep the latest adviser contract aware of the same goal and daily eligibility.
create or replace function public.bw_adviser_context()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object('city',public.bw_get_state(),'career',public.bw_job_snapshot(),'forex',public.bw_fx_snapshot('EUR/USD'),'loadout',public.bw_get_loadout(),'progression',public.bw_connected_progression_snapshot(),'operations',public.bw_operations_snapshot(),'daily',public.bw_daily_life_snapshot(),'target',public.bw_collection_target_snapshot(),'available_pages',array['home','daily','dispatch','takeover','crimes','hustles','operations','combat','gym','work','missions','factions','city','shop','market','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','catalogue','economy','arcade']);
end $$;

revoke all on function public.bw_collection_target_snapshot(),public.bw_set_collection_target(text),public.bw_clear_collection_target(),public.bw_loadout_presets_snapshot(),public.bw_save_loadout_preset(smallint,text),public.bw_apply_loadout_preset(smallint),public.bw_set_item_flags(text,boolean,boolean),public.bw_challenge_district_boss_plan(text,jsonb,uuid),public.bw_blackjack_action_v1(text,uuid) from public,anon;
grant execute on function public.bw_collection_target_snapshot(),public.bw_set_collection_target(text),public.bw_clear_collection_target(),public.bw_loadout_presets_snapshot(),public.bw_save_loadout_preset(smallint,text),public.bw_apply_loadout_preset(smallint),public.bw_set_item_flags(text,boolean,boolean),public.bw_challenge_district_boss_plan(text,jsonb,uuid),public.bw_blackjack_action_v1(text,uuid) to authenticated;
