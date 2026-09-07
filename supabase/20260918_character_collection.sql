-- Character & Collection: public dossiers, earnable frames and server-checked showcase cards.
-- Apply after 20260917_daily_life.sql.

create table if not exists public.bw_profile_frames (
  id text primary key,
  name text not null,
  rarity text not null check(rarity in ('common','uncommon','rare','epic','legendary')),
  accent text not null check(accent ~ '^#[0-9a-fA-F]{6}$'),
  requirement text not null,
  sort_order integer not null default 0
);

insert into public.bw_profile_frames(id,name,rarity,accent,requirement,sort_order) values
  ('starter','Blackwood seal','common','#a9792a','Available from the start',1),
  ('rookie','First commission','uncommon','#4d966f','Reach level 5',2),
  ('collector','Collector''s brass','rare','#3f82b0','Earn 250 respect',3),
  ('district','District authority','epic','#8259a8','Reach level 15',4),
  ('legend','Legacy crest','legendary','#bd8421','Reach level 30',5)
on conflict(id) do update set name=excluded.name,rarity=excluded.rarity,accent=excluded.accent,requirement=excluded.requirement,sort_order=excluded.sort_order;

alter table public.bw_profile_frames enable row level security;
drop policy if exists "authenticated read profile frames" on public.bw_profile_frames;
create policy "authenticated read profile frames" on public.bw_profile_frames for select to authenticated using(true);
revoke insert,update,delete on public.bw_profile_frames from anon,authenticated;
grant select on public.bw_profile_frames to authenticated;

create table if not exists public.bw_character_showcases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  portrait_key text not null default 'monogram' check(portrait_key in ('monogram','seal','crown')),
  frame_id text not null default 'starter' references public.bw_profile_frames(id),
  layout_id text not null default 'ledger' check(layout_id in ('ledger','gallery','vault')),
  background_key text not null default 'ivory' check(background_key in ('ivory','sand','sage')),
  featured_item_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.bw_character_showcases enable row level security;
drop policy if exists "users read own showcase" on public.bw_character_showcases;
create policy "users read own showcase" on public.bw_character_showcases for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_character_showcases from anon,authenticated;
grant select on public.bw_character_showcases to authenticated;

create or replace function public.bw_character_frame_unlocked(p_frame_id text, p_uid uuid) returns boolean
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
    else false
  end;
end $$;
revoke all on function public.bw_character_frame_unlocked(text,uuid) from public,anon,authenticated;

create or replace function public.bw_character_collection_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); s public.bw_player_states; p public.profiles; c public.bw_character_showcases;
begin
  s:=public.bw_ensure_player(uid);
  select * into p from public.profiles where id=uid;
  select * into c from public.bw_character_showcases where user_id=uid;
  return jsonb_build_object(
    'authority',true,
    'card',jsonb_build_object(
      'displayName',coalesce(p.display_name,'Associate'),
      'avatarUrl',p.avatar_url,
      'title','Associate',
      'level',s.level,
      'respect',s.respect,
      'portraitKey',coalesce(c.portrait_key,'monogram'),
      'frameId',coalesce(c.frame_id,'starter'),
      'layoutId',coalesce(c.layout_id,'ledger'),
      'backgroundKey',coalesce(c.background_key,'ivory'),
      'featuredItemIds',coalesce(c.featured_item_ids,'{}'::text[])
    ),
    'frames',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'rarity',f.rarity,'accent',f.accent,'requirement',f.requirement,'unlocked',public.bw_character_frame_unlocked(f.id,uid)) order by f.sort_order) from public.bw_profile_frames f),'[]'::jsonb),
    'collectionCount',coalesce((select count(*) from public.bw_inventory v where v.user_id=uid and v.quantity>0),0)
  );
end $$;

create or replace function public.bw_save_character_showcase(
  p_portrait_key text default 'monogram',
  p_frame_id text default 'starter',
  p_layout_id text default 'ledger',
  p_background_key text default 'ivory',
  p_featured_item_ids text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); ids text[]:=coalesce(p_featured_item_ids,'{}'::text[]);
begin
  perform public.bw_ensure_player(uid);
  if p_portrait_key not in('monogram','seal','crown') then raise exception 'invalid portrait'; end if;
  if p_layout_id not in('ledger','gallery','vault') then raise exception 'invalid card layout'; end if;
  if p_background_key not in('ivory','sand','sage') then raise exception 'invalid card background'; end if;
  if not exists(select 1 from public.bw_profile_frames where id=p_frame_id) then raise exception 'frame not found'; end if;
  if not public.bw_character_frame_unlocked(p_frame_id,uid) then raise exception 'frame is still locked'; end if;
  if coalesce(array_length(ids,1),0)>3 then raise exception 'choose up to three featured items'; end if;
  if exists(select 1 from unnest(ids) chosen(id) where not exists(select 1 from public.bw_inventory v where v.user_id=uid and v.item_id=chosen.id and v.quantity>0)) then raise exception 'featured item is not owned'; end if;
  insert into public.bw_character_showcases(user_id,portrait_key,frame_id,layout_id,background_key,featured_item_ids,updated_at)
  values(uid,p_portrait_key,p_frame_id,p_layout_id,p_background_key,ids,now())
  on conflict(user_id) do update set portrait_key=excluded.portrait_key,frame_id=excluded.frame_id,layout_id=excluded.layout_id,background_key=excluded.background_key,featured_item_ids=excluded.featured_item_ids,updated_at=now();
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'profile','Updated public character card',jsonb_build_object('frame',p_frame_id,'layout',p_layout_id,'featured',ids));
  return public.bw_character_collection_snapshot();
end $$;

create or replace function public.bw_public_character_card(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles; s public.bw_player_states; c public.bw_character_showcases; f public.bw_profile_frames;
begin
  select * into p from public.profiles where id=p_user_id;
  if p.id is null then raise exception 'player not found'; end if;
  select * into s from public.bw_player_states where user_id=p_user_id;
  select * into c from public.bw_character_showcases where user_id=p_user_id;
  select * into f from public.bw_profile_frames where id=coalesce(c.frame_id,'starter');
  return jsonb_build_object(
    'id',p.id,
    'displayName',coalesce(p.display_name,'Associate'),
    'title','Associate',
    'level',coalesce(s.level,1),
    'respect',coalesce(s.respect,0),
    'portraitKey',coalesce(c.portrait_key,'monogram'),
    'frameId',coalesce(c.frame_id,'starter'),
    'layoutId',coalesce(c.layout_id,'ledger'),
    'backgroundKey',coalesce(c.background_key,'ivory'),
    'frame',jsonb_build_object('id',coalesce(f.id,'starter'),'name',coalesce(f.name,'Blackwood seal'),'rarity',coalesce(f.rarity,'common'),'accent',coalesce(f.accent,'#a9792a')),
    'featuredItems',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'kind',i.kind,'slot',i.slot,'rarity',i.rarity,'attack',i.attack,'defense',i.defense,'speed',i.speed,'dexterity',i.dexterity) order by array_position(coalesce(c.featured_item_ids,'{}'::text[]),i.id)) from public.bw_items i where i.id=any(coalesce(c.featured_item_ids,'{}'::text[]))),'[]'::jsonb)
  );
end $$;

revoke all on function public.bw_character_collection_snapshot(),public.bw_save_character_showcase(text,text,text,text,text[]),public.bw_public_character_card(uuid) from public,anon;
grant execute on function public.bw_character_collection_snapshot(),public.bw_save_character_showcase(text,text,text,text,text[]),public.bw_public_character_card(uuid) to authenticated;
