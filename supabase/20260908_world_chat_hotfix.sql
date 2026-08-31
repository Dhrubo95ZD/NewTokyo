-- Reliable authenticated world chat.
-- Safe to apply to an existing game database and safe to run again.

create or replace function public.bw_world_chat_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'body', message.body,
        'created_at', message.created_at,
        'user_id', message.user_id,
        'profiles', jsonb_build_object(
          'display_name', coalesce(profile.display_name, 'Player'),
          'avatar_url', profile.avatar_url
        )
      ) order by message.created_at
    )
    from (
      select id, body, created_at, user_id
      from public.chat_messages
      where deleted_at is null
      order by created_at desc
      limit 80
    ) message
    left join public.profiles profile on profile.id = message.user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.bw_world_chat_send(p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
begin
  if uid is null then
    raise exception 'authentication required';
  end if;
  if char_length(clean_body) < 1 or char_length(clean_body) > 240 then
    raise exception 'message must contain 1 to 240 characters';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'finish character creation before using world chat';
  end if;

  insert into public.chat_messages(user_id, body)
  values (uid, clean_body);

  return public.bw_world_chat_snapshot();
end;
$$;

revoke all on function public.bw_world_chat_snapshot() from public, anon;
revoke all on function public.bw_world_chat_send(text) from public, anon;
grant execute on function public.bw_world_chat_snapshot() to authenticated;
grant execute on function public.bw_world_chat_send(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;
