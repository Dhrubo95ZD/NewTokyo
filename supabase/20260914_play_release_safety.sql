-- Google Play release safety: player reports, mutes, moderation and diagnostics.
create table if not exists public.bw_mutes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, target_id),
  constraint bw_mutes_no_self check (owner_id <> target_id)
);

create table if not exists public.bw_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.bw_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  content_type text not null check (content_type in ('player','world_chat','family_chat','forum','mail','family','other')),
  content_id text,
  reason text not null check (reason in ('harassment','hate_abuse','spam_scam','sexual_inappropriate','real_money_trading','cheating','personal_information','other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  moderator_notes text not null default '' check (char_length(moderator_notes) <= 2000),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists bw_reports_queue_idx on public.bw_reports(status, created_at);
create unique index if not exists bw_reports_open_duplicate_idx
  on public.bw_reports(reporter_id, content_type, coalesce(content_id,'')) where status in ('open','reviewing');

create table if not exists public.bw_client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 3000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bw_client_errors_recent_idx on public.bw_client_errors(created_at desc);

alter table public.bw_mutes enable row level security;
alter table public.bw_moderators enable row level security;
alter table public.bw_reports enable row level security;
alter table public.bw_client_errors enable row level security;

drop policy if exists bw_mutes_read_own on public.bw_mutes;
create policy bw_mutes_read_own on public.bw_mutes for select to authenticated using (owner_id = auth.uid());
drop policy if exists bw_reports_read_own on public.bw_reports;
create policy bw_reports_read_own on public.bw_reports for select to authenticated using (reporter_id = auth.uid());

create or replace function public.bw_is_moderator(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.bw_moderators where user_id=p_user)
$$;

create or replace function public.bw_set_mute(p_target uuid, p_muted boolean default true) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if p_target is null or p_target=uid then raise exception 'Invalid player'; end if;
  if not exists(select 1 from public.profiles where id=p_target) then raise exception 'Player not found'; end if;
  if p_muted then insert into public.bw_mutes(owner_id,target_id) values(uid,p_target) on conflict do nothing;
  else delete from public.bw_mutes where owner_id=uid and target_id=p_target; end if;
  return jsonb_build_object('target',p_target,'muted',p_muted);
end $$;

create or replace function public.bw_safety_snapshot() returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'isModerator', public.bw_is_moderator(auth.uid()),
    'reportsSubmitted', (select count(*) from public.bw_reports where reporter_id=auth.uid()),
    'mutes', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name)
      from public.bw_mutes m join public.profiles p on p.id=m.target_id where m.owner_id=auth.uid()), '[]'::jsonb)
  )
$$;

create or replace function public.bw_submit_report(
  p_target_user uuid, p_content_type text, p_content_id text, p_reason text, p_detail text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); rid uuid;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if p_target_user=uid then raise exception 'You cannot report yourself'; end if;
  if p_content_type not in ('player','world_chat','family_chat','forum','mail','family','other') then raise exception 'Invalid report type'; end if;
  if p_reason not in ('harassment','hate_abuse','spam_scam','sexual_inappropriate','real_money_trading','cheating','personal_information','other') then raise exception 'Invalid reason'; end if;
  if char_length(coalesce(p_content_id,'')) > 100 then raise exception 'Invalid content reference'; end if;
  if (select count(*) from public.bw_reports where reporter_id=uid and created_at>now()-interval '24 hours') >= 10 then raise exception 'Daily report limit reached'; end if;
  insert into public.bw_reports(reporter_id,target_user_id,content_type,content_id,reason,detail)
  values(uid,p_target_user,p_content_type,nullif(p_content_id,''),p_reason,left(coalesce(p_detail,''),1000))
  returning id into rid;
  return jsonb_build_object('id',rid,'status','open');
exception when unique_violation then raise exception 'This content is already in your moderation queue';
end $$;

create or replace function public.bw_moderation_queue(p_status text default 'open') returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not public.bw_is_moderator(auth.uid()) then raise exception 'Moderator access required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.content_type,'contentId',r.content_id,'reason',r.reason,'detail',r.detail,'status',r.status,'createdAt',r.created_at,'reporter',rp.display_name,'target',tp.display_name) order by r.created_at)
    from public.bw_reports r left join public.profiles rp on rp.id=r.reporter_id left join public.profiles tp on tp.id=r.target_user_id
    where p_status='all' or r.status=p_status), '[]'::jsonb);
end $$;

create or replace function public.bw_resolve_report(p_report uuid, p_status text, p_notes text default '') returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not public.bw_is_moderator(auth.uid()) then raise exception 'Moderator access required'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'Invalid status'; end if;
  update public.bw_reports set status=p_status, moderator_notes=left(coalesce(p_notes,''),2000), assigned_to=auth.uid(), resolved_at=case when p_status in ('resolved','dismissed') then now() else null end where id=p_report;
  if not found then raise exception 'Report not found'; end if;
  return jsonb_build_object('id',p_report,'status',p_status);
end $$;

create or replace function public.bw_log_client_error(p_message text, p_stack text default '', p_context jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if (select count(*) from public.bw_client_errors where user_id=uid and created_at>now()-interval '24 hours') >= 20 then return; end if;
  insert into public.bw_client_errors(user_id,message,stack,context) values(uid,left(coalesce(p_message,'Unknown error'),500),left(coalesce(p_stack,''),3000),coalesce(p_context,'{}'::jsonb));
end $$;

-- Respect user mutes in world chat without changing the public RPC contract.
create or replace function public.bw_world_chat_snapshot() returns jsonb
language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at),'[]'::jsonb)
  from (
    select m.id,m.user_id,m.body,m.created_at,jsonb_build_object('display_name',p.display_name,'avatar_url',p.avatar_url) profiles
    from public.chat_messages m join public.profiles p on p.id=m.user_id
    where m.deleted_at is null
      and not exists(select 1 from public.bw_mutes mu where mu.owner_id=auth.uid() and mu.target_id=m.user_id)
    order by m.created_at desc limit 100
  ) x
$$;

revoke all on function public.bw_is_moderator(uuid) from public;
grant execute on function public.bw_is_moderator(uuid) to authenticated;
grant execute on function public.bw_set_mute(uuid,boolean) to authenticated;
grant execute on function public.bw_safety_snapshot() to authenticated;
grant execute on function public.bw_submit_report(uuid,text,text,text,text) to authenticated;
grant execute on function public.bw_moderation_queue(text) to authenticated;
grant execute on function public.bw_resolve_report(uuid,text,text) to authenticated;
grant execute on function public.bw_log_client_error(text,text,jsonb) to authenticated;

