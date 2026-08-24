-- Neo Exchange: shared-yen live XAU/USD paper trading.
-- Apply after schema.sql and 20260824_district_one_progression.sql.
-- Prices are accepted only from the service-role market gateway. Clients can
-- read the feed and operate on their own wallet/positions through guarded RPCs.

do $$ begin
  if to_regprocedure('public.require_google_player()') is null then
    raise exception 'Apply 20260824_district_one_progression.sql first';
  end if;
end $$;

create table if not exists public.player_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  realized_pnl bigint not null default 0,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.market_quotes (
  symbol text primary key,
  price numeric(20,8) not null check (price > 0),
  source_at timestamptz not null,
  received_at timestamptz not null default now(),
  sequence bigint not null default 0,
  status text not null default 'open' check (status in ('open','closed','halted'))
);

create table if not exists public.market_candles (
  symbol text not null,
  interval text not null check (interval in ('1min','5min','15min','1h')),
  bucket_at timestamptz not null,
  open numeric(20,8) not null,
  high numeric(20,8) not null,
  low numeric(20,8) not null,
  close numeric(20,8) not null,
  updated_at timestamptz not null default now(),
  primary key(symbol, interval, bucket_at)
);

create table if not exists public.exchange_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null default 'XAU/USD',
  side text not null check (side in ('buy','sell')),
  margin_yen bigint not null check (margin_yen >= 100),
  leverage smallint not null check (leverage in (1,3,5,10)),
  entry_price numeric(20,8) not null check (entry_price > 0),
  liquidation_price numeric(20,8) not null check (liquidation_price > 0),
  stop_loss numeric(20,8),
  take_profit numeric(20,8),
  status text not null default 'open' check (status in ('open','closed','liquidated','stopped','target')),
  exit_price numeric(20,8),
  pnl_yen bigint,
  client_order_id uuid not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  quote_source_at timestamptz not null,
  unique(user_id, client_order_id)
);

create index if not exists exchange_positions_user_open_idx
  on public.exchange_positions(user_id, opened_at desc) where status = 'open';

create table if not exists public.exchange_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null,
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  position_id uuid references public.exchange_positions(id) on delete set null,
  idempotency uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency)
);

alter table public.player_wallets enable row level security;
alter table public.market_quotes enable row level security;
alter table public.market_candles enable row level security;
alter table public.exchange_positions enable row level security;
alter table public.exchange_ledger enable row level security;

drop policy if exists "users read own exchange wallet" on public.player_wallets;
drop policy if exists "signed users read market quotes" on public.market_quotes;
drop policy if exists "signed users read market candles" on public.market_candles;
drop policy if exists "users read own exchange positions" on public.exchange_positions;
drop policy if exists "users read own exchange ledger" on public.exchange_ledger;
create policy "users read own exchange wallet" on public.player_wallets for select to authenticated using (auth.uid() = user_id);
create policy "signed users read market quotes" on public.market_quotes for select to authenticated using (true);
create policy "signed users read market candles" on public.market_candles for select to authenticated using (true);
create policy "users read own exchange positions" on public.exchange_positions for select to authenticated using (auth.uid() = user_id);
create policy "users read own exchange ledger" on public.exchange_ledger for select to authenticated using (auth.uid() = user_id);

revoke insert, update, delete on public.player_wallets, public.market_quotes, public.market_candles, public.exchange_positions, public.exchange_ledger from anon, authenticated;
grant select on public.player_wallets, public.market_quotes, public.market_candles, public.exchange_positions, public.exchange_ledger to authenticated;

create or replace function public.ensure_exchange_wallet(p_user_id uuid)
returns public.player_wallets
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare result public.player_wallets; seed_balance bigint;
begin
  select * into result from public.player_wallets where user_id = p_user_id for update;
  if result.user_id is null then
    select greatest(0, coalesce((save_data #>> '{core,money}')::bigint, 0)) into seed_balance
      from public.player_saves where user_id = p_user_id;
    insert into public.player_wallets(user_id,balance) values(p_user_id,coalesce(seed_balance,0)) returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.ensure_exchange_wallet(uuid) from public, anon, authenticated;

create or replace function public.mirror_wallet_to_save(p_user_id uuid, p_balance bigint)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.player_saves
    set save_data = jsonb_set(coalesce(save_data,'{}'::jsonb), '{core,money}', to_jsonb(greatest(0,p_balance)), true), updated_at = now()
    where user_id = p_user_id;
end;
$$;
revoke all on function public.mirror_wallet_to_save(uuid,bigint) from public, anon, authenticated;

create or replace function public.get_my_exchange_state()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid := public.require_google_player(); wallet public.player_wallets; open_positions jsonb;
begin
  wallet := public.ensure_exchange_wallet(player_id);
  select coalesce(jsonb_agg(to_jsonb(p) order by p.opened_at desc),'[]'::jsonb) into open_positions
    from public.exchange_positions p where p.user_id = player_id and p.status = 'open';
  return jsonb_build_object('balance',wallet.balance,'reserved',wallet.reserved,'realizedPnl',wallet.realized_pnl,'version',wallet.version,'positions',open_positions);
end;
$$;

create or replace function public.apply_game_wallet_delta(p_delta bigint, p_event text, p_idempotency uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid := public.require_google_player(); wallet public.player_wallets; existing public.exchange_ledger; clean_event text;
begin
  select * into existing from public.exchange_ledger where user_id=player_id and idempotency=p_idempotency;
  if existing.id is not null then return jsonb_build_object('balance',existing.balance_after,'duplicate',true); end if;
  if p_delta = 0 or p_delta > 250000 or p_delta < -250000 then raise exception 'wallet change outside allowed game-event range'; end if;
  clean_event := left(regexp_replace(coalesce(p_event,'game_event'),'[^a-zA-Z0-9_-]','','g'),40);
  wallet := public.ensure_exchange_wallet(player_id);
  if p_delta < 0 and wallet.balance < -p_delta then raise exception 'not enough yen'; end if;
  update public.player_wallets set balance=balance+p_delta,version=version+1,updated_at=now() where user_id=player_id returning * into wallet;
  insert into public.exchange_ledger(user_id,event,amount,balance_after,idempotency) values(player_id,clean_event,p_delta,wallet.balance,p_idempotency);
  perform public.mirror_wallet_to_save(player_id,wallet.balance);
  return jsonb_build_object('balance',wallet.balance,'version',wallet.version);
end;
$$;

create or replace function public.open_my_exchange_position(p_side text,p_margin_yen bigint,p_leverage smallint,p_stop_loss numeric default null,p_take_profit numeric default null,p_client_order_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid := public.require_google_player(); wallet public.player_wallets; quote public.market_quotes; position public.exchange_positions; fill numeric; liq numeric; clean_side text:=lower(p_side);
begin
  select * into position from public.exchange_positions where user_id=player_id and client_order_id=p_client_order_id;
  if position.id is not null then return jsonb_build_object('positionId',position.id,'entryPrice',position.entry_price,'duplicate',true); end if;
  if clean_side not in ('buy','sell') then raise exception 'invalid side'; end if;
  if p_margin_yen < 100 then raise exception 'minimum position risk is 100 yen'; end if;
  if p_leverage not in (1,3,5,10) then raise exception 'unsupported risk multiplier'; end if;
  select * into quote from public.market_quotes where symbol='XAU/USD' for share;
  if quote.symbol is null or quote.status <> 'open' or quote.source_at < now()-interval '2.5 seconds' or quote.source_at > now()+interval '2 seconds' then raise exception 'verified quote is stale; orders locked'; end if;
  fill := quote.price * case when clean_side='buy' then 1.0001 else 0.9999 end;
  if p_stop_loss is not null and p_stop_loss<=0 then raise exception 'stop loss must be a positive price'; end if;
  if p_take_profit is not null and p_take_profit<=0 then raise exception 'take profit must be a positive price'; end if;
  if p_stop_loss is not null and ((clean_side='buy' and p_stop_loss>=fill) or (clean_side='sell' and p_stop_loss<=fill)) then raise exception 'stop loss is on the wrong side of entry'; end if;
  if p_take_profit is not null and ((clean_side='buy' and p_take_profit<=fill) or (clean_side='sell' and p_take_profit>=fill)) then raise exception 'take profit is on the wrong side of entry'; end if;
  liq := fill * case when clean_side='buy' then 1-(0.98/p_leverage) else 1+(0.98/p_leverage) end;
  wallet := public.ensure_exchange_wallet(player_id);
  if wallet.balance < p_margin_yen then raise exception 'not enough available yen'; end if;
  update public.player_wallets set balance=balance-p_margin_yen,reserved=reserved+p_margin_yen,version=version+1,updated_at=now() where user_id=player_id returning * into wallet;
  insert into public.exchange_positions(user_id,side,margin_yen,leverage,entry_price,liquidation_price,stop_loss,take_profit,client_order_id,quote_source_at)
    values(player_id,clean_side,p_margin_yen,p_leverage,fill,liq,p_stop_loss,p_take_profit,p_client_order_id,quote.source_at) returning * into position;
  insert into public.exchange_ledger(user_id,event,amount,balance_after,position_id,idempotency,metadata)
    values(player_id,'trade_open',-p_margin_yen,wallet.balance,position.id,p_client_order_id,jsonb_build_object('side',clean_side,'leverage',p_leverage,'entryPrice',fill));
  perform public.mirror_wallet_to_save(player_id,wallet.balance);
  return jsonb_build_object('positionId',position.id,'entryPrice',fill,'liquidationPrice',liq,'balance',wallet.balance);
end;
$$;

create or replace function public.close_exchange_position_internal(p_position_id uuid,p_exit_price numeric,p_status text,p_idempotency uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare position public.exchange_positions; wallet public.player_wallets; pnl bigint; returned bigint;
begin
  select * into position from public.exchange_positions where id=p_position_id for update;
  if position.id is null then raise exception 'position not found'; end if;
  if position.status <> 'open' then return jsonb_build_object('positionId',position.id,'pnlYen',position.pnl_yen,'status',position.status,'duplicate',true); end if;
  pnl := round(position.margin_yen*position.leverage*((p_exit_price-position.entry_price)/position.entry_price)*case when position.side='sell' then -1 else 1 end);
  pnl := greatest(-position.margin_yen,pnl); returned := greatest(0,position.margin_yen+pnl);
  wallet := public.ensure_exchange_wallet(position.user_id);
  update public.player_wallets set balance=balance+returned,reserved=greatest(0,reserved-position.margin_yen),realized_pnl=realized_pnl+pnl,version=version+1,updated_at=now() where user_id=position.user_id returning * into wallet;
  update public.exchange_positions set status=p_status,exit_price=p_exit_price,pnl_yen=pnl,closed_at=now() where id=position.id;
  insert into public.exchange_ledger(user_id,event,amount,balance_after,position_id,idempotency,metadata)
    values(position.user_id,'trade_'||p_status,returned,wallet.balance,position.id,p_idempotency,jsonb_build_object('pnlYen',pnl,'exitPrice',p_exit_price));
  perform public.mirror_wallet_to_save(position.user_id,wallet.balance);
  return jsonb_build_object('positionId',position.id,'pnlYen',pnl,'status',p_status,'balance',wallet.balance,'exitPrice',p_exit_price);
end;
$$;
revoke all on function public.close_exchange_position_internal(uuid,numeric,text,uuid) from public, anon, authenticated;

create or replace function public.close_my_exchange_position(p_position_id uuid,p_client_close_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid:=public.require_google_player(); position public.exchange_positions; quote public.market_quotes; existing public.exchange_ledger;
begin
  select * into existing from public.exchange_ledger where user_id=player_id and idempotency=p_client_close_id;
  if existing.id is not null then return existing.metadata||jsonb_build_object('balance',existing.balance_after,'duplicate',true); end if;
  select * into position from public.exchange_positions where id=p_position_id and user_id=player_id;
  if position.id is null then raise exception 'position not found'; end if;
  select * into quote from public.market_quotes where symbol=position.symbol;
  if quote.symbol is null or quote.status<>'open' or quote.source_at<now()-interval '2.5 seconds' then raise exception 'verified quote is stale; close locked'; end if;
  return public.close_exchange_position_internal(position.id,quote.price*case when position.side='buy' then 0.9999 else 1.0001 end,'closed',p_client_close_id);
end;
$$;

create or replace function public.settle_exchange_tick(p_symbol text,p_price numeric,p_source_at timestamptz,p_sequence bigint)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare position public.exchange_positions; bucket timestamptz; label text; settled integer:=0; exit_status text; exit_price numeric; accepted integer:=0;
begin
  if current_user not in ('service_role','postgres','supabase_admin') then raise exception 'service role required'; end if;
  if p_symbol<>'XAU/USD' or p_price<=0 then raise exception 'invalid market tick'; end if;
  if p_source_at<now()-interval '8 seconds' or p_source_at>now()+interval '2 seconds' then raise exception 'market tick outside freshness window'; end if;
  insert into public.market_quotes(symbol,price,source_at,received_at,sequence,status) values(p_symbol,p_price,p_source_at,now(),p_sequence,'open')
    on conflict(symbol) do update set price=excluded.price,source_at=excluded.source_at,received_at=now(),sequence=excluded.sequence,status='open'
    where excluded.sequence>public.market_quotes.sequence or excluded.source_at>public.market_quotes.source_at;
  get diagnostics accepted = row_count;
  if accepted = 0 then
    return jsonb_build_object('accepted',false,'settled',0,'sequence',p_sequence,'reason','out_of_order');
  end if;
  foreach label in array array['1min','5min','15min','1h'] loop
    bucket := case label when '1min' then date_trunc('minute',p_source_at)
      when '5min' then date_trunc('hour',p_source_at)+floor(extract(minute from p_source_at)/5)*interval '5 minutes'
      when '15min' then date_trunc('hour',p_source_at)+floor(extract(minute from p_source_at)/15)*interval '15 minutes'
      else date_trunc('hour',p_source_at) end;
    insert into public.market_candles(symbol,interval,bucket_at,open,high,low,close) values(p_symbol,label,bucket,p_price,p_price,p_price,p_price)
      on conflict(symbol,interval,bucket_at) do update set high=greatest(public.market_candles.high,excluded.high),low=least(public.market_candles.low,excluded.low),close=excluded.close,updated_at=now();
  end loop;
  for position in select * from public.exchange_positions where symbol=p_symbol and status='open' for update loop
    exit_status:=null; exit_price:=p_price;
    if (position.side='buy' and p_price<=position.liquidation_price) or (position.side='sell' and p_price>=position.liquidation_price) then exit_status:='liquidated'; exit_price:=position.liquidation_price;
    elsif position.stop_loss is not null and ((position.side='buy' and p_price<=position.stop_loss) or (position.side='sell' and p_price>=position.stop_loss)) then exit_status:='stopped'; exit_price:=position.stop_loss;
    elsif position.take_profit is not null and ((position.side='buy' and p_price>=position.take_profit) or (position.side='sell' and p_price<=position.take_profit)) then exit_status:='target'; exit_price:=position.take_profit; end if;
    if exit_status is not null then perform public.close_exchange_position_internal(position.id,exit_price,exit_status,gen_random_uuid()); settled:=settled+1; end if;
  end loop;
  return jsonb_build_object('accepted',true,'settled',settled,'sequence',p_sequence);
end;
$$;

revoke all on function public.get_my_exchange_state() from public, anon;
revoke all on function public.apply_game_wallet_delta(bigint,text,uuid) from public, anon;
revoke all on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) from public, anon;
revoke all on function public.close_my_exchange_position(uuid,uuid) from public, anon;
revoke all on function public.settle_exchange_tick(text,numeric,timestamptz,bigint) from public, anon, authenticated;
grant execute on function public.get_my_exchange_state() to authenticated;
grant execute on function public.apply_game_wallet_delta(bigint,text,uuid) to authenticated;
grant execute on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) to authenticated;
grant execute on function public.close_my_exchange_position(uuid,uuid) to authenticated;
grant execute on function public.settle_exchange_tick(text,numeric,timestamptz,bigint) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_quotes') then alter publication supabase_realtime add table public.market_quotes; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_candles') then alter publication supabase_realtime add table public.market_candles; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='exchange_positions') then alter publication supabase_realtime add table public.exchange_positions; end if;
end $$;
