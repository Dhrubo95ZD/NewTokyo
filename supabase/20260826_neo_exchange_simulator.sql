-- Neo Exchange synthetic market provider.
-- Apply after 20260825_neo_exchange.sql.
--
-- Architecture:
--   market source -> ingest_exchange_tick -> quotes/candles/position settlement
-- The active source is "simulated" today. A future licensed gateway can use the
-- existing settle_exchange_tick RPC after set_exchange_source('live').

do $$ begin
  if to_regprocedure('public.settle_exchange_tick(text,numeric,timestamptz,bigint)') is null then
    raise exception 'Apply 20260825_neo_exchange.sql first';
  end if;
end $$;

create extension if not exists pg_cron;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.market_source_config (
  symbol text primary key,
  active_source text not null check (active_source in ('simulated','live')),
  display_name text not null,
  tick_seconds smallint not null default 2 check (tick_seconds between 1 and 60),
  updated_at timestamptz not null default now()
);

insert into public.market_source_config(symbol,active_source,display_name,tick_seconds)
values('XAU/USD','simulated','Neo Exchange Simulation',2)
on conflict(symbol) do update set
  active_source='simulated', display_name=excluded.display_name,
  tick_seconds=excluded.tick_seconds, updated_at=now();

alter table public.market_quotes add column if not exists source_kind text not null default 'simulated';
alter table public.market_quotes add column if not exists source_name text not null default 'Neo Exchange Simulation';
alter table public.market_quotes add column if not exists regime text not null default 'range';
alter table public.market_quotes add column if not exists event_title text;
alter table public.market_quotes add column if not exists spread_bps numeric(8,3) not null default 1.25;
alter table public.market_candles add column if not exists source_kind text not null default 'simulated';

create table if not exists public.market_events (
  id bigint generated always as identity primary key,
  symbol text not null default 'XAU/USD',
  source_kind text not null default 'simulated',
  title text not null,
  direction text not null check (direction in ('up','down','mixed')),
  intensity smallint not null check (intensity between 1 and 5),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists market_events_active_idx on public.market_events(symbol,ends_at desc);

create table if not exists private.exchange_market_state (
  symbol text primary key,
  tick_index bigint not null default 0,
  price numeric(20,8) not null,
  anchor_price numeric(20,8) not null,
  velocity double precision not null default 0,
  volatility double precision not null default 0.00024,
  regime text not null default 'range',
  regime_ticks_left integer not null default 180,
  event_title text,
  event_direction smallint not null default 0,
  event_strength double precision not null default 0,
  event_ticks_left integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into private.exchange_market_state(symbol,price,anchor_price)
values('XAU/USD',2385.00,2385.00)
on conflict(symbol) do nothing;

alter table public.market_source_config enable row level security;
alter table public.market_events enable row level security;
drop policy if exists "signed users read market source" on public.market_source_config;
drop policy if exists "signed users read market events" on public.market_events;
create policy "signed users read market source" on public.market_source_config for select to authenticated using (true);
create policy "signed users read market events" on public.market_events for select to authenticated using (true);
revoke insert,update,delete on public.market_source_config,public.market_events from anon,authenticated;
grant select on public.market_source_config,public.market_events to authenticated;

create or replace function public.ingest_exchange_tick(
  p_symbol text,
  p_price numeric,
  p_source_at timestamptz,
  p_sequence bigint,
  p_source_kind text,
  p_source_name text,
  p_regime text default 'range',
  p_event_title text default null,
  p_spread_bps numeric default 1.25
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  source_config public.market_source_config;
  position public.exchange_positions;
  bucket timestamptz;
  label text;
  settled integer:=0;
  accepted integer:=0;
  exit_status text;
  exit_price numeric;
  max_age interval;
begin
  select * into source_config from public.market_source_config where symbol=p_symbol;
  if source_config.symbol is null or source_config.active_source<>p_source_kind then
    return jsonb_build_object('accepted',false,'reason','inactive_source','source',p_source_kind);
  end if;
  if p_source_kind not in ('simulated','live') or p_symbol<>'XAU/USD' or p_price<=0 then
    raise exception 'invalid market tick';
  end if;
  max_age := case when p_source_kind='live' then interval '8 seconds' else interval '12 seconds' end;
  if p_source_at<now()-max_age or p_source_at>now()+interval '2 seconds' then
    raise exception 'market tick outside freshness window';
  end if;

  insert into public.market_quotes(
    symbol,price,source_at,received_at,sequence,status,source_kind,source_name,regime,event_title,spread_bps
  ) values(
    p_symbol,p_price,p_source_at,now(),p_sequence,'open',p_source_kind,left(p_source_name,80),left(p_regime,24),left(p_event_title,120),greatest(.25,least(12,p_spread_bps))
  ) on conflict(symbol) do update set
    price=excluded.price,source_at=excluded.source_at,received_at=now(),sequence=excluded.sequence,status='open',
    source_kind=excluded.source_kind,source_name=excluded.source_name,regime=excluded.regime,
    event_title=excluded.event_title,spread_bps=excluded.spread_bps
  where excluded.source_kind<>public.market_quotes.source_kind
     or excluded.sequence>public.market_quotes.sequence
     or excluded.source_at>public.market_quotes.source_at;
  get diagnostics accepted = row_count;
  if accepted=0 then
    return jsonb_build_object('accepted',false,'reason','out_of_order','sequence',p_sequence);
  end if;

  foreach label in array array['1min','5min','15min','1h'] loop
    bucket := case label
      when '1min' then date_trunc('minute',p_source_at)
      when '5min' then date_trunc('hour',p_source_at)+floor(extract(minute from p_source_at)/5)*interval '5 minutes'
      when '15min' then date_trunc('hour',p_source_at)+floor(extract(minute from p_source_at)/15)*interval '15 minutes'
      else date_trunc('hour',p_source_at)
    end;
    insert into public.market_candles(symbol,interval,bucket_at,open,high,low,close,source_kind)
      values(p_symbol,label,bucket,p_price,p_price,p_price,p_price,p_source_kind)
    on conflict(symbol,interval,bucket_at) do update set
      high=greatest(public.market_candles.high,excluded.high),
      low=least(public.market_candles.low,excluded.low),
      close=excluded.close,source_kind=excluded.source_kind,updated_at=now();
  end loop;

  for position in
    select * from public.exchange_positions where symbol=p_symbol and status='open' for update
  loop
    exit_status:=null; exit_price:=p_price;
    if (position.side='buy' and p_price<=position.liquidation_price)
       or (position.side='sell' and p_price>=position.liquidation_price) then
      exit_status:='liquidated'; exit_price:=position.liquidation_price;
    elsif position.stop_loss is not null and
      ((position.side='buy' and p_price<=position.stop_loss) or (position.side='sell' and p_price>=position.stop_loss)) then
      exit_status:='stopped'; exit_price:=position.stop_loss;
    elsif position.take_profit is not null and
      ((position.side='buy' and p_price>=position.take_profit) or (position.side='sell' and p_price<=position.take_profit)) then
      exit_status:='target'; exit_price:=position.take_profit;
    end if;
    if exit_status is not null then
      perform public.close_exchange_position_internal(position.id,exit_price,exit_status,gen_random_uuid());
      settled:=settled+1;
    end if;
  end loop;
  return jsonb_build_object('accepted',true,'settled',settled,'sequence',p_sequence,'source',p_source_kind);
end;
$$;
revoke all on function public.ingest_exchange_tick(text,numeric,timestamptz,bigint,text,text,text,text,numeric) from public,anon,authenticated;

create or replace function public.settle_exchange_tick(p_symbol text,p_price numeric,p_source_at timestamptz,p_sequence bigint)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return public.ingest_exchange_tick(p_symbol,p_price,p_source_at,p_sequence,'live','Licensed Live Gateway','live',null,1.0);
end;
$$;
revoke all on function public.settle_exchange_tick(text,numeric,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.settle_exchange_tick(text,numeric,timestamptz,bigint) to service_role;

create or replace function public.advance_simulated_market()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  config public.market_source_config;
  state private.exchange_market_state;
  random_pick double precision;
  gaussian double precision;
  session_multiplier double precision;
  base_drift double precision:=0;
  mean_reversion double precision:=0;
  event_impulse double precision:=0;
  next_return double precision;
  next_price numeric;
  next_velocity double precision;
  next_volatility double precision;
  spread numeric;
  new_event boolean:=false;
  event_direction text:='mixed';
  event_intensity smallint:=1;
  result jsonb;
begin
  select * into config from public.market_source_config where symbol='XAU/USD' for update;
  if config.active_source<>'simulated' then
    return jsonb_build_object('accepted',false,'reason','simulation_inactive');
  end if;
  select * into state from private.exchange_market_state where symbol='XAU/USD' for update;

  if state.regime_ticks_left<=0 then
    random_pick:=random();
    state.regime:=case
      when random_pick<.24 then 'trend_up'
      when random_pick<.48 then 'trend_down'
      when random_pick<.80 then 'range'
      else 'volatile'
    end;
    state.regime_ticks_left:=90+floor(random()*240)::integer;
    state.anchor_price:=state.price;
  end if;

  if state.event_ticks_left<=0 then
    state.event_title:=null; state.event_direction:=0; state.event_strength:=0;
    if random()<.0035 then
      random_pick:=random(); new_event:=true;
      if random_pick<.20 then state.event_title:='Ward manufacturers increase gold demand'; state.event_direction:=1; state.event_strength:=.00034; event_direction:='up'; event_intensity:=3;
      elsif random_pick<.40 then state.event_title:='Transit vault releases reserve supply'; state.event_direction:=-1; state.event_strength:=.00031; event_direction:='down'; event_intensity:=3;
      elsif random_pick<.60 then state.event_title:='Currency desk reports sudden demand shift'; state.event_direction:=case when random()<.5 then -1 else 1 end; state.event_strength:=.00048; event_direction:=case when state.event_direction>0 then 'up' else 'down' end; event_intensity:=4;
      elsif random_pick<.80 then state.event_title:='East Market liquidity briefly thins'; state.event_direction:=case when random()<.5 then -1 else 1 end; state.event_strength:=.00062; event_direction:='mixed'; event_intensity:=5;
      else state.event_title:='Trade council outlook steadies the market'; state.event_direction:=0; state.event_strength:=.00008; event_direction:='mixed'; event_intensity:=2;
      end if;
      state.event_ticks_left:=12+floor(random()*24)::integer;
    end if;
  end if;

  session_multiplier:=case
    when extract(hour from now() at time zone 'UTC') between 0 and 6 then .78
    when extract(hour from now() at time zone 'UTC') between 7 and 12 then 1.18
    when extract(hour from now() at time zone 'UTC') between 13 and 16 then 1.48
    when extract(hour from now() at time zone 'UTC') between 17 and 20 then 1.08
    else .72
  end;
  base_drift:=case state.regime when 'trend_up' then .000035 when 'trend_down' then -.000035 else 0 end;
  mean_reversion:=case state.regime when 'range' then ((state.anchor_price-state.price)/state.anchor_price)::double precision*.045 else ((state.anchor_price-state.price)/state.anchor_price)::double precision*.008 end;
  gaussian:=(random()+random()+random()+random()-2.0);
  next_volatility:=greatest(.00010,least(.00110,state.volatility*.94+abs(gaussian)*.000018+case when state.regime='volatile' then .000035 else .000004 end));
  event_impulse:=state.event_direction::double precision*state.event_strength*
    case when state.event_ticks_left>0 then greatest(.15::double precision,state.event_ticks_left::double precision/36.0) else 0.0 end;
  next_velocity:=state.velocity*.68+base_drift+mean_reversion+gaussian*next_volatility*session_multiplier+event_impulse;
  next_return:=greatest(-.0065,least(.0065,next_velocity));
  next_price:=greatest(250,round((state.price::double precision*exp(next_return))::numeric,8));
  spread:=round(greatest(.75,least(8.0,.8+next_volatility*10000*1.35+case when state.event_ticks_left>0 then 1.2 else 0 end))::numeric,3);

  update private.exchange_market_state set
    tick_index=state.tick_index+1,price=next_price,velocity=next_velocity,volatility=next_volatility,
    regime=state.regime,regime_ticks_left=state.regime_ticks_left-1,
    event_title=state.event_title,event_direction=state.event_direction,event_strength=state.event_strength,
    event_ticks_left=greatest(0,state.event_ticks_left-1),updated_at=now()
  where symbol=state.symbol;

  if new_event then
    insert into public.market_events(symbol,source_kind,title,direction,intensity,started_at,ends_at)
    values('XAU/USD','simulated',state.event_title,event_direction,event_intensity,now(),now()+state.event_ticks_left*interval '2 seconds');
  end if;
  delete from public.market_events where ends_at<now()-interval '2 days';

  result:=public.ingest_exchange_tick(
    'XAU/USD',next_price,now(),state.tick_index+1,'simulated','Neo Exchange Simulation',
    state.regime,state.event_title,spread
  );
  return result||jsonb_build_object('price',next_price,'regime',state.regime,'spreadBps',spread,'event',state.event_title);
end;
$$;
revoke all on function public.advance_simulated_market() from public,anon,authenticated;

create or replace function public.set_exchange_source(p_source text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare open_count integer;
begin
  if p_source not in ('simulated','live') then raise exception 'source must be simulated or live'; end if;
  select count(*) into open_count from public.exchange_positions where status='open';
  if open_count>0 then raise exception 'close all exchange positions before changing market source'; end if;
  update public.market_source_config set active_source=p_source,
    display_name=case when p_source='live' then 'Licensed Live Gateway' else 'Neo Exchange Simulation' end,
    updated_at=now() where symbol='XAU/USD';
  delete from public.market_quotes where symbol='XAU/USD';
  delete from public.market_candles where symbol='XAU/USD';
  if p_source='simulated' then perform public.advance_simulated_market(); end if;
  return jsonb_build_object('source',p_source,'ready',p_source='simulated');
end;
$$;
revoke all on function public.set_exchange_source(text) from public,anon,authenticated;
grant execute on function public.set_exchange_source(text) to service_role;

create or replace function public.open_my_exchange_position(p_side text,p_margin_yen bigint,p_leverage smallint,p_stop_loss numeric default null,p_take_profit numeric default null,p_client_order_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid:=public.require_google_player(); wallet public.player_wallets; quote public.market_quotes; position public.exchange_positions; fill numeric; liq numeric; clean_side text:=lower(p_side); freshness interval;
begin
  select * into position from public.exchange_positions where user_id=player_id and client_order_id=p_client_order_id;
  if position.id is not null then return jsonb_build_object('positionId',position.id,'entryPrice',position.entry_price,'duplicate',true); end if;
  if clean_side not in ('buy','sell') then raise exception 'invalid side'; end if;
  if p_margin_yen<100 then raise exception 'minimum position risk is 100 yen'; end if;
  if p_leverage not in (1,3,5,10) then raise exception 'unsupported risk multiplier'; end if;
  select * into quote from public.market_quotes where symbol='XAU/USD' for share;
  freshness:=case when quote.source_kind='live' then interval '2.5 seconds' else interval '8 seconds' end;
  if quote.symbol is null or quote.status<>'open' or quote.source_at<now()-freshness or quote.source_at>now()+interval '2 seconds' then raise exception 'verified quote is stale; orders locked'; end if;
  fill:=quote.price*(1+case when clean_side='buy' then 1 else -1 end*(quote.spread_bps/10000));
  if p_stop_loss is not null and p_stop_loss<=0 then raise exception 'stop loss must be a positive price'; end if;
  if p_take_profit is not null and p_take_profit<=0 then raise exception 'take profit must be a positive price'; end if;
  if p_stop_loss is not null and ((clean_side='buy' and p_stop_loss>=fill) or (clean_side='sell' and p_stop_loss<=fill)) then raise exception 'stop loss is on the wrong side of entry'; end if;
  if p_take_profit is not null and ((clean_side='buy' and p_take_profit<=fill) or (clean_side='sell' and p_take_profit>=fill)) then raise exception 'take profit is on the wrong side of entry'; end if;
  liq:=fill*case when clean_side='buy' then 1-(.98/p_leverage) else 1+(.98/p_leverage) end;
  wallet:=public.ensure_exchange_wallet(player_id);
  if wallet.balance<p_margin_yen then raise exception 'not enough available yen'; end if;
  update public.player_wallets set balance=balance-p_margin_yen,reserved=reserved+p_margin_yen,version=version+1,updated_at=now() where user_id=player_id returning * into wallet;
  insert into public.exchange_positions(user_id,side,margin_yen,leverage,entry_price,liquidation_price,stop_loss,take_profit,client_order_id,quote_source_at)
    values(player_id,clean_side,p_margin_yen,p_leverage,fill,liq,p_stop_loss,p_take_profit,p_client_order_id,quote.source_at) returning * into position;
  insert into public.exchange_ledger(user_id,event,amount,balance_after,position_id,idempotency,metadata)
    values(player_id,'trade_open',-p_margin_yen,wallet.balance,position.id,p_client_order_id,jsonb_build_object('side',clean_side,'leverage',p_leverage,'entryPrice',fill,'source',quote.source_kind));
  perform public.mirror_wallet_to_save(player_id,wallet.balance);
  return jsonb_build_object('positionId',position.id,'entryPrice',fill,'liquidationPrice',liq,'balance',wallet.balance,'source',quote.source_kind);
end;
$$;

create or replace function public.close_my_exchange_position(p_position_id uuid,p_client_close_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare player_id uuid:=public.require_google_player(); position public.exchange_positions; quote public.market_quotes; existing public.exchange_ledger; freshness interval; fill numeric;
begin
  select * into existing from public.exchange_ledger where user_id=player_id and idempotency=p_client_close_id;
  if existing.id is not null then return existing.metadata||jsonb_build_object('balance',existing.balance_after,'duplicate',true); end if;
  select * into position from public.exchange_positions where id=p_position_id and user_id=player_id;
  if position.id is null then raise exception 'position not found'; end if;
  select * into quote from public.market_quotes where symbol=position.symbol;
  freshness:=case when quote.source_kind='live' then interval '2.5 seconds' else interval '8 seconds' end;
  if quote.symbol is null or quote.status<>'open' or quote.source_at<now()-freshness then raise exception 'verified quote is stale; close locked'; end if;
  fill:=quote.price*(1+case when position.side='buy' then -1 else 1 end*(quote.spread_bps/10000));
  return public.close_exchange_position_internal(position.id,fill,'closed',p_client_close_id);
end;
$$;

revoke all on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) from public,anon;
revoke all on function public.close_my_exchange_position(uuid,uuid) from public,anon;
grant execute on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) to authenticated;
grant execute on function public.close_my_exchange_position(uuid,uuid) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_events') then
    alter publication supabase_realtime add table public.market_events;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='market_source_config') then
    alter publication supabase_realtime add table public.market_source_config;
  end if;
end $$;

do $$ declare existing_job bigint; begin
  for existing_job in select jobid from cron.job where jobname='neo-exchange-sim-tick' loop
    perform cron.unschedule(existing_job);
  end loop;
end $$;
select cron.schedule('neo-exchange-sim-tick','2 seconds',$$select public.advance_simulated_market();$$);

select public.advance_simulated_market();
