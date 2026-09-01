-- Blackwood item catalogue, transparent acquisition odds and content cleanup.
-- Apply after 20260911_combat_contracts_relics.sql. Safe to re-run.

-- IDs remain unchanged so existing inventories, equipment and logs keep working.
update public.bw_items set name='Blackwood Malt Tonic', description='An alcohol-free malt tonic that restores 35 happiness.' where id='bourbon';
update public.bw_items set name='Emergency Med Injector', description='A regulated emergency aid that restores 300 health.' where id='morphine';
update public.bw_crimes set name='Move untaxed luxury tea', category='Smuggling', description='Move sealed tea crates through a friendly warehouse.' where id='bootleg';
update public.bw_crimes set name='Clone event-hall passes', description='Copy access passes during a crowded exhibition and leave unseen.' where id='skimming';
update public.bw_jobs set name='Venue Steward', company='The Gilded Hall', description='Keep the exhibition hall orderly and its guests protected.' where id='bouncer';
update public.bw_professions set name='Treasury & Markets', description='An invitation-only currency and markets career.' where id='banking';
update public.bw_professions set description='Hospitality, surveillance and virtual gaming operations.' where id='casino';

create or replace function public.bw_item_catalogue() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  player_level integer;
  street_pool integer;
  payload jsonb;
begin
  perform public.bw_ensure_player(uid);
  select level into player_level from public.bw_player_states where user_id=uid;
  select count(*) into street_pool from public.bw_items where rarity in('common','uncommon') and not drop_only;

  with item_rows as (
    select
      i.*,
      coalesce(inv.quantity,0) as owned,
      (eq.item_id is not null) as equipped,
      case i.rarity when 'common' then 1 when 'uncommon' then 2 when 'rare' then 3 when 'epic' then 4 else 5 end as rarity_order,
      case
        when i.id like 'catalog-%' then split_part(i.name,' ',1)
        when i.drop_only then 'Underworld Relics'
        else 'Blackwood Essentials'
      end as collection_name,
      case
        when i.id like '%revolver%' or i.id like '%peacemaker%' or i.id like '%harbor-iron%' then 'revolver'
        when i.id like '%shotgun%' then 'shotgun'
        when i.id like '%pistol%' or i.id like '%typewriter%' then 'pistol'
        when i.id like '%switchblade%' or i.id like '%stiletto%' then 'blade'
        when i.id like '%knuckle%' or i.id like '%glove%' then 'gloves'
        when i.id like '%fedora%' or i.id like '%crown%' then 'fedora'
        when i.slot='armor' then 'coat'
        when i.slot='boots' then 'shoes'
        when i.id like '%ring%' or i.id like '%signet%' then 'ring'
        when i.id like '%watch%' then 'watch'
        when i.kind='medical' then 'medical'
        when i.kind='booster' then 'tonic'
        else coalesce(i.slot,i.kind,'item')
      end as visual_key,
      (select count(*) from public.bw_items eligible where eligible.drop_only and eligible.rarity=i.rarity and eligible.level_required<=player_level+12) as eligible_relics
    from public.bw_items i
    left join public.bw_inventory inv on inv.user_id=uid and inv.item_id=i.id
    left join public.bw_equipment eq on eq.user_id=uid and eq.item_id=i.id
  ), catalog as (
    select r.*,
      (select coalesce(jsonb_agg(route),'[]'::jsonb) from (values
        (case when not r.drop_only then jsonb_build_object(
          'source','City Shops','kind','shop','chance','Guaranteed while in stock','detail','Buy directly with Blackwood City cash.') end),
        (jsonb_build_object('source','Player Market','kind','market','chance','Player availability','detail','Trade with authenticated players; price and supply are player-driven.')),
        (case when not r.drop_only and r.rarity in('common','uncommon') then jsonb_build_object(
          'source','Street Work','kind','grind','chance',format('%s%%–%s%% activity roll',2,8),
          'exactChance',case when street_pool>0 then round(2.0/street_pool,4)||'%–'||round(8.0/street_pool,4)||'% per run at full efficiency' else 'Unavailable' end,
          'detail',format('A successful loot roll selects one of %s eligible items equally. Heat can reduce this chance to 25%% of base.',street_pool)) end),
        (case when r.drop_only then jsonb_build_object(
          'source','First meaningful combat win','kind','combat','chance',case r.rarity when 'rare' then '2.60% tier chance' when 'epic' then '0.35% tier chance' else '0.05% tier chance' end,
          'exactChance',case when r.level_required<=player_level+12 and r.eligible_relics>0 then round((case r.rarity when 'rare' then 2.60 when 'epic' then .35 else .05 end)/r.eligible_relics,4)||'% for this item' else 'Level-gated for this account' end,
          'detail','Only the first win against that opponent in the anti-farming window can roll a relic.') end),
        (case when r.drop_only then jsonb_build_object(
          'source','100 Intel cache','kind','cache','chance',case r.rarity when 'rare' then '87.12% tier chance' when 'epic' then '11.88% tier chance' else '1.00% tier chance' end,
          'exactChance',case when r.level_required<=player_level+12 and r.eligible_relics>0 then round((case r.rarity when 'rare' then 87.12 when 'epic' then 11.88 else 1.00 end)/r.eligible_relics,4)||'% for this item' else 'Level-gated for this account' end,
          'detail','Street cache searches always build Intel; every 100 Intel awards one relic.') end),
        (case when r.drop_only then jsonb_build_object(
          'source','100 contract Intel','kind','contract','chance',case r.rarity when 'rare' then '83.30% tier chance' when 'epic' then '14.70% tier chance' else '2.00% tier chance' end,
          'exactChance',case when r.level_required<=player_level+12 and r.eligible_relics>0 then round((case r.rarity when 'rare' then 83.30 when 'epic' then 14.70 else 2.00 end)/r.eligible_relics,4)||'% for this item' else 'Level-gated for this account' end,
          'detail','Claim combat contracts to build Intel; every 100 Intel awards one relic.') end)
      ) routes(route) where route is not null) as obtain
    from item_rows r
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'total',(select count(*) from catalog),
      'owned',(select count(*) from catalog where owned>0),
      'equipped',(select count(*) from catalog where equipped),
      'relics',(select count(*) from catalog where drop_only),
      'ownedRelics',(select count(*) from catalog where drop_only and owned>0),
      'playerLevel',player_level
    ),
    'collections',coalesce((select jsonb_agg(x order by x->>'name') from (
      select jsonb_build_object('name',collection_name,'total',count(*),'owned',count(*) filter(where owned>0)) x
      from catalog group by collection_name
    ) groups),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'description',description,'kind',kind,'slot',slot,'rarity',rarity,
      'attack',attack,'defense',defense,'speed',speed,'dexterity',dexterity,'power',power,
      'levelRequired',level_required,'price',price,'owned',owned,'equipped',equipped,
      'dropOnly',drop_only,'collection',collection_name,'visualKey',visual_key,'obtain',obtain
    ) order by rarity_order,collection_name,name) from catalog),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;

revoke all on function public.bw_item_catalogue() from public,anon;
grant execute on function public.bw_item_catalogue() to authenticated;
