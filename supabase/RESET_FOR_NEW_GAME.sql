-- DESTRUCTIVE ONE-TIME LAUNCH RESET. DO NOT add this file to migrations.
-- Run manually in Supabase SQL Editor only after 20260904 has succeeded.
-- It removes every login, character, message, ranking, position and progression record.
begin;
truncate table
 public.bw_forum_posts, public.bw_forum_threads, public.bw_mail, public.bw_attack_logs,
 public.bw_action_logs, public.bw_relations, public.bw_player_awards, public.bw_player_missions,
 public.bw_owned_properties, public.bw_equipment, public.bw_inventory,
 public.bw_job_interviews, public.bw_job_careers,
 public.bw_blackjack_games, public.bw_casino_rounds,
 public.bw_fx_positions, public.bw_fx_trader_profiles,
 public.exchange_ledger, public.exchange_positions,
 public.runner_crew_members, public.runner_crews,
 public.chat_messages, public.leaderboard_entries, public.player_armories,
 public.bw_player_states, public.player_wallets, public.player_saves, public.profiles
restart identity cascade;
delete from storage.objects where bucket_id in ('avatars','character-portraits');
delete from auth.users;
commit;

select (select count(*) from auth.users) accounts,(select count(*) from public.profiles) profiles,
 (select count(*) from public.bw_player_states) players,(select count(*) from public.chat_messages) chat_messages;
