-- Federal Trust live brokerage upgrade.
-- Apply after 20260905_families_wars.sql. Safe to re-run.
-- Market prices are ingested by supabase/functions/market-feed; this migration
-- deliberately disables the former random-walk simulator.

alter table public.bw_fx_pairs add column if not exists provider_symbol text;
alter table public.bw_fx_pairs add column if not exists asset_class text not null default 'forex';
alter table public.bw_fx_pairs add column if not exists contract_size numeric(18,2) not null default 100000;
alter table public.bw_fx_quotes add column if not exists source text not null default 'legacy';
alter table public.bw_fx_quotes add column if not exists market_time timestamptz;
alter table public.bw_fx_positions drop constraint if exists bw_fx_positions_leverage_check;
alter table public.bw_fx_positions add column if not exists lots numeric(8,2);
alter table public.bw_fx_positions add column if not exists notional_usd numeric(18,2);
alter table public.bw_fx_positions add column if not exists stop_loss numeric(20,8);
alter table public.bw_fx_positions add column if not exists take_profit numeric(20,8);

insert into public.bw_fx_pairs(symbol,name,digits,base_price,spread,volatility,sort_order,provider_symbol,asset_class,contract_size) values
  ('XAU/USD','Gold / US Dollar',2,2500.00,0.30,0,1,'XAU/USD','metal',100),
  ('XAG/USD','Silver / US Dollar',3,30.000,0.025,0,2,'XAG/USD','metal',5000),
  ('EUR/USD','Euro / US Dollar',5,1.10000,0.00016,0,3,'EUR/USD','forex',100000),
  ('GBP/USD','Pound / US Dollar',5,1.28000,0.00022,0,4,'GBP/USD','forex',100000),
  ('USD/JPY','US Dollar / Yen',3,150.000,0.018,0,5,'USD/JPY','forex',100000),
  ('AUD/USD','Australian Dollar / US Dollar',5,0.65000,0.00020,0,6,'AUD/USD','forex',100000),
  ('NZD/USD','New Zealand Dollar / US Dollar',5,0.60000,0.00022,0,7,'NZD/USD','forex',100000),
  ('USD/CAD','US Dollar / Canadian Dollar',5,1.37000,0.00020,0,8,'USD/CAD','forex',100000),
  ('USD/CHF','US Dollar / Swiss Franc',5,0.88000,0.00018,0,9,'USD/CHF','forex',100000),
  ('EUR/JPY','Euro / Yen',3,165.000,0.025,0,10,'EUR/JPY','forex',100000)
on conflict(symbol) do update set
  name=excluded.name,digits=excluded.digits,spread=excluded.spread,sort_order=excluded.sort_order,
  provider_symbol=excluded.provider_symbol,asset_class=excluded.asset_class,contract_size=excluded.contract_size;

insert into public.bw_fx_quotes(symbol,mid,bid,ask,source)
select symbol,base_price,base_price-spread/2,base_price+spread/2,'legacy'
from public.bw_fx_pairs
on conflict(symbol) do nothing;

create table if not exists public.bw_broker_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_number text not null unique,
  currency text not null default 'USD' check(currency='USD'),
  leverage smallint not null check(leverage in(500,1000)),
  balance numeric(18,2) not null check(balance>=0),
  status text not null default 'active' check(status in('active','restricted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bw_market_candles (
  symbol text not null references public.bw_fx_pairs(symbol) on delete cascade,
  timeframe text not null check(timeframe in('1min','5min','15min','1h','4h','1day')),
  bucket_at timestamptz not null,
  open numeric(20,8) not null,
  high numeric(20,8) not null,
  low numeric(20,8) not null,
  close numeric(20,8) not null,
  volume numeric(20,4) not null default 0,
  source text not null default 'twelve_data',
  primary key(symbol,timeframe,bucket_at),
  check(high>=greatest(open,close,low)),
  check(low<=least(open,close,high))
);

alter table public.bw_broker_accounts enable row level security;
alter table public.bw_market_candles enable row level security;
drop policy if exists "own broker account" on public.bw_broker_accounts;
create policy "own broker account" on public.bw_broker_accounts for select to authenticated using(auth.uid()=user_id);
drop policy if exists "read live market candles" on public.bw_market_candles;
create policy "read live market candles" on public.bw_market_candles for select to authenticated using(true);
revoke insert,update,delete on public.bw_broker_accounts,public.bw_market_candles from authenticated,anon;
grant select on public.bw_broker_accounts,public.bw_market_candles to authenticated;

-- Stop the former simulated market from modifying quotes.
do $$
declare job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into job_id from cron.job where jobname='blackwood-fx-market' limit 1;
    if job_id is not null then perform cron.unschedule(job_id); end if;
  end if;
end $$;

create or replace function public.bw_fx_tick(p_symbol text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Retained as a compatibility no-op. Only market-feed may advance prices.
  return;
end $$;

create or replace function public.bw_broker_mark_pnl(p public.bw_fx_positions,p_price numeric)
returns bigint language sql immutable set search_path=public,pg_temp as $$
  select round(
    coalesce(p.notional_usd,p.margin*p.leverage) *
    case when p.side='buy' then p_price/p.entry_price-1 else p.entry_price/p_price-1 end
  )::bigint
$$;

create or replace function public.bw_broker_open_account(p_leverage smallint,p_deposit bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  wallet public.player_wallets;
  legacy_margin bigint:=0;
  account_no text;
begin
  if p_leverage not in(500,1000) then raise exception 'choose leverage 1:500 or 1:1000'; end if;
  if p_deposit<1000 then raise exception 'minimum opening deposit is $1,000'; end if;
  if exists(select 1 from public.bw_broker_accounts where user_id=uid) then raise exception 'brokerage account already exists'; end if;
  wallet:=public.ensure_exchange_wallet(uid);
  if wallet.balance<p_deposit then raise exception 'insufficient on-hand cash'; end if;
  select coalesce(sum(margin),0) into legacy_margin from public.bw_fx_positions where user_id=uid and status='open';
  account_no:='FT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  update public.player_wallets set balance=balance-p_deposit,version=version+1,updated_at=now() where user_id=uid;
  insert into public.bw_broker_accounts(user_id,account_number,leverage,balance)
  values(uid,account_no,p_leverage,p_deposit+legacy_margin);
  update public.bw_fx_positions set status='closed',exit_price=entry_price,pnl=0,closed_at=now()
  where user_id=uid and status='open';
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  insert into public.bw_action_logs(user_id,kind,summary,data)
  values(uid,'broker','Opened Federal Trust trading account',jsonb_build_object('account',account_no,'leverage',p_leverage,'deposit',p_deposit));
  return public.bw_broker_snapshot('XAU/USD','1min');
end $$;

create or replace function public.bw_broker_transfer(p_direction text,p_amount bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  account public.bw_broker_accounts;
  wallet public.player_wallets;
  used_margin bigint;
  floating_pnl bigint;
  free_margin numeric;
begin
  if p_amount<1 then raise exception 'enter a positive transfer amount'; end if;
  select * into account from public.bw_broker_accounts where user_id=uid for update;
  if account.user_id is null or account.status<>'active' then raise exception 'active brokerage account required'; end if;
  wallet:=public.ensure_exchange_wallet(uid);
  select coalesce(sum(p.margin),0),coalesce(sum(public.bw_broker_mark_pnl(p,case when p.side='buy' then q.bid else q.ask end)),0)
  into used_margin,floating_pnl
  from public.bw_fx_positions p join public.bw_fx_quotes q using(symbol)
  where p.user_id=uid and p.status='open';
  free_margin:=account.balance+floating_pnl-used_margin;
  if p_direction='deposit' then
    if wallet.balance<p_amount then raise exception 'insufficient on-hand cash'; end if;
    update public.player_wallets set balance=balance-p_amount,version=version+1,updated_at=now() where user_id=uid;
    update public.bw_broker_accounts set balance=balance+p_amount,updated_at=now() where user_id=uid;
  elsif p_direction='withdraw' then
    if free_margin<p_amount then raise exception 'insufficient free margin'; end if;
    update public.bw_broker_accounts set balance=balance-p_amount,updated_at=now() where user_id=uid;
    update public.player_wallets set balance=balance+p_amount,version=version+1,updated_at=now() where user_id=uid;
  else raise exception 'invalid transfer direction';
  end if;
  perform public.mirror_wallet_to_save(uid,(select balance from public.player_wallets where user_id=uid));
  return public.bw_broker_snapshot('XAU/USD','1min');
end $$;

create or replace function public.bw_broker_set_leverage(p_leverage smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); begin
  if p_leverage not in(500,1000) then raise exception 'choose leverage 1:500 or 1:1000'; end if;
  if exists(select 1 from public.bw_fx_positions where user_id=uid and status='open') then
    raise exception 'close all positions before changing leverage';
  end if;
  update public.bw_broker_accounts set leverage=p_leverage,updated_at=now() where user_id=uid and status='active';
  if not found then raise exception 'active brokerage account required'; end if;
  return public.bw_broker_snapshot('XAU/USD','1min');
end $$;

create or replace function public.bw_broker_apply_risk(p_uid uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  position_row public.bw_fx_positions;
  quote_row public.bw_fx_quotes;
  account public.bw_broker_accounts;
  current_price numeric;
  position_pnl bigint;
  used_margin bigint;
  floating_pnl bigint;
begin
  select * into account from public.bw_broker_accounts where user_id=p_uid for update;
  if account.user_id is null then return; end if;
  for position_row in select * from public.bw_fx_positions where user_id=p_uid and status='open' for update loop
    select * into quote_row from public.bw_fx_quotes where symbol=position_row.symbol;
    current_price:=case when position_row.side='buy' then quote_row.bid else quote_row.ask end;
    position_pnl:=public.bw_broker_mark_pnl(position_row,current_price);
    if (position_row.stop_loss is not null and ((position_row.side='buy' and current_price<=position_row.stop_loss) or (position_row.side='sell' and current_price>=position_row.stop_loss)))
      or (position_row.take_profit is not null and ((position_row.side='buy' and current_price>=position_row.take_profit) or (position_row.side='sell' and current_price<=position_row.take_profit))) then
      update public.bw_fx_positions set status=case when account.balance+position_pnl<=0 then 'liquidated' else 'closed' end,exit_price=current_price,pnl=position_pnl,closed_at=now() where id=position_row.id;
      update public.bw_broker_accounts set balance=greatest(0,balance+position_pnl),updated_at=now() where user_id=p_uid returning * into account;
    end if;
  end loop;
  select coalesce(sum(p.margin),0),coalesce(sum(public.bw_broker_mark_pnl(p,case when p.side='buy' then q.bid else q.ask end)),0)
  into used_margin,floating_pnl from public.bw_fx_positions p join public.bw_fx_quotes q using(symbol)
  where p.user_id=p_uid and p.status='open';
  if used_margin>0 and account.balance+floating_pnl<=used_margin*.5 then
    update public.bw_fx_positions p set status='liquidated',exit_price=case when p.side='buy' then q.bid else q.ask end,
      pnl=public.bw_broker_mark_pnl(p,case when p.side='buy' then q.bid else q.ask end),closed_at=now()
    from public.bw_fx_quotes q where p.user_id=p_uid and p.status='open' and q.symbol=p.symbol;
    update public.bw_broker_accounts set balance=greatest(0,balance+floating_pnl),updated_at=now() where user_id=p_uid;
  end if;
end $$;

create or replace function public.bw_broker_snapshot(p_symbol text default 'XAU/USD',p_timeframe text default '1min')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  account public.bw_broker_accounts;
  wallet public.player_wallets;
  quote_row public.bw_fx_quotes;
  used_margin bigint:=0;
  floating_pnl bigint:=0;
  equity numeric:=0;
begin
  if p_timeframe not in('1min','5min','15min','1h','4h','1day') then raise exception 'invalid timeframe'; end if;
  if not exists(select 1 from public.bw_fx_pairs where symbol=p_symbol) then raise exception 'unknown market'; end if;
  wallet:=public.ensure_exchange_wallet(uid);
  perform public.bw_broker_apply_risk(uid);
  select * into account from public.bw_broker_accounts where user_id=uid;
  select * into quote_row from public.bw_fx_quotes where symbol=p_symbol;
  if account.user_id is not null then
    select coalesce(sum(p.margin),0),coalesce(sum(public.bw_broker_mark_pnl(p,case when p.side='buy' then q.bid else q.ask end)),0)
    into used_margin,floating_pnl from public.bw_fx_positions p join public.bw_fx_quotes q using(symbol)
    where p.user_id=uid and p.status='open';
    equity:=account.balance+floating_pnl;
  end if;
  return jsonb_build_object(
    'walletBalance',wallet.balance,
    'account',case when account.user_id is null then null else to_jsonb(account)||jsonb_build_object(
      'equity',equity,'usedMargin',used_margin,'freeMargin',equity-used_margin,
      'marginLevel',case when used_margin=0 then null else round(equity/used_margin*100,2) end,
      'floatingPnl',floating_pnl
    ) end,
    'quote',to_jsonb(quote_row)||(select jsonb_build_object('digits',digits,'name',name,'assetClass',asset_class,'contractSize',contract_size) from public.bw_fx_pairs where symbol=p_symbol),
    'pairs',(select jsonb_agg(to_jsonb(pair_row)||jsonb_build_object('mid',quote_value.mid,'bid',quote_value.bid,'ask',quote_value.ask,'source',quote_value.source,'updatedAt',quote_value.updated_at) order by pair_row.sort_order) from public.bw_fx_pairs pair_row join public.bw_fx_quotes quote_value using(symbol)),
    'candles',coalesce((select jsonb_agg(to_jsonb(candle_row) order by candle_row.bucket_at) from (select * from public.bw_market_candles where symbol=p_symbol and timeframe=p_timeframe order by bucket_at desc limit 240)candle_row),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(to_jsonb(position_row)||jsonb_build_object('currentPrice',case when position_row.side='buy' then market_quote.bid else market_quote.ask end,'unrealizedPnl',public.bw_broker_mark_pnl(position_row,case when position_row.side='buy' then market_quote.bid else market_quote.ask end)) order by position_row.opened_at desc) from public.bw_fx_positions position_row join public.bw_fx_quotes market_quote using(symbol) where position_row.user_id=uid and position_row.status='open'),'[]'::jsonb),
    'profile',coalesce((select to_jsonb(profile_row) from public.bw_fx_trader_profiles profile_row where profile_row.user_id=uid),'{}'::jsonb),
    'timeframe',p_timeframe,'serverTime',now()
  );
end $$;

create or replace function public.bw_broker_open_position(
  p_symbol text,p_side text,p_lots numeric,p_stop_loss numeric default null,p_take_profit numeric default null,p_request_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  account public.bw_broker_accounts;
  market public.bw_fx_pairs;
  quote_row public.bw_fx_quotes;
  entry numeric;
  notional numeric;
  required_margin bigint;
  used_margin bigint;
  floating_pnl bigint;
  free_margin numeric;
begin
  if p_side not in('buy','sell') then raise exception 'choose buy or sell'; end if;
  if p_lots is null or p_lots not in(0.01,0.05,0.10,0.50,1.00,2.00,5.00) then raise exception 'invalid lot size'; end if;
  if exists(select 1 from public.bw_fx_positions where user_id=uid and request_id=p_request_id) then return public.bw_broker_snapshot(p_symbol,'1min'); end if;
  select * into account from public.bw_broker_accounts where user_id=uid and status='active' for update;
  if account.user_id is null then raise exception 'open a brokerage account first'; end if;
  select * into market from public.bw_fx_pairs where symbol=p_symbol;
  select * into quote_row from public.bw_fx_quotes where symbol=p_symbol;
  if market.symbol is null or quote_row.source<>'twelve_data' or quote_row.updated_at<now()-interval '15 minutes' then raise exception 'live market quote is unavailable or stale'; end if;
  entry:=case when p_side='buy' then quote_row.ask else quote_row.bid end;
  if p_stop_loss is not null and ((p_side='buy' and p_stop_loss>=entry) or (p_side='sell' and p_stop_loss<=entry)) then raise exception 'stop loss is on the wrong side of entry'; end if;
  if p_take_profit is not null and ((p_side='buy' and p_take_profit<=entry) or (p_side='sell' and p_take_profit>=entry)) then raise exception 'take profit is on the wrong side of entry'; end if;
  notional:=case when market.asset_class='metal' then market.contract_size*p_lots*entry else market.contract_size*p_lots end;
  required_margin:=greatest(1,ceil(notional/account.leverage)::bigint);
  select coalesce(sum(p.margin),0),coalesce(sum(public.bw_broker_mark_pnl(p,case when p.side='buy' then q.bid else q.ask end)),0)
  into used_margin,floating_pnl from public.bw_fx_positions p join public.bw_fx_quotes q using(symbol) where p.user_id=uid and p.status='open';
  free_margin:=account.balance+floating_pnl-used_margin;
  if free_margin<required_margin then raise exception 'not enough free margin: $% required',required_margin; end if;
  insert into public.bw_fx_positions(user_id,symbol,side,margin,leverage,entry_price,request_id,lots,notional_usd,stop_loss,take_profit)
  values(uid,p_symbol,p_side,required_margin,account.leverage,entry,p_request_id,p_lots,notional,p_stop_loss,p_take_profit);
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'broker','Opened '||p_side||' '||p_symbol,jsonb_build_object('lots',p_lots,'entry',entry,'margin',required_margin,'leverage',account.leverage));
  return public.bw_broker_snapshot(p_symbol,'1min');
end $$;

create or replace function public.bw_broker_close_position(p_position_id uuid,p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=public.bw_uid();
  position_row public.bw_fx_positions;
  quote_row public.bw_fx_quotes;
  close_price numeric;
  profit bigint;
  profile public.bw_fx_trader_profiles;
begin
  select * into position_row from public.bw_fx_positions where id=p_position_id and user_id=uid for update;
  if position_row.id is null then raise exception 'position not found'; end if;
  if position_row.status<>'open' then return public.bw_broker_snapshot(position_row.symbol,'1min'); end if;
  select * into quote_row from public.bw_fx_quotes where symbol=position_row.symbol;
  if quote_row.source<>'twelve_data' or quote_row.updated_at<now()-interval '15 minutes' then raise exception 'live market quote is unavailable or stale'; end if;
  close_price:=case when position_row.side='buy' then quote_row.bid else quote_row.ask end;
  profit:=public.bw_broker_mark_pnl(position_row,close_price);
  update public.bw_fx_positions set status=case when (select balance from public.bw_broker_accounts where user_id=uid)+profit<=0 then 'liquidated' else 'closed' end,exit_price=close_price,pnl=profit,closed_at=now() where id=position_row.id;
  update public.bw_broker_accounts set balance=greatest(0,balance+profit),updated_at=now() where user_id=uid;
  insert into public.bw_fx_trader_profiles(user_id) values(uid) on conflict do nothing;
  update public.bw_fx_trader_profiles set
    closed_trades=closed_trades+1,winning_trades=winning_trades+(profit>0)::int,
    realized_pnl=realized_pnl+profit,peak_equity=greatest(peak_equity,realized_pnl+profit),
    max_drawdown=greatest(max_drawdown,peak_equity-(realized_pnl+profit)),updated_at=now()
  where user_id=uid returning * into profile;
  update public.bw_fx_trader_profiles set
    rank=case when closed_trades>=75 and realized_pnl>50000 then 'Market Maker' when closed_trades>=40 and realized_pnl>15000 then 'Senior Trader' when closed_trades>=25 and realized_pnl>5000 then 'Dealer' when closed_trades>=15 and realized_pnl>0 then 'Analyst' when closed_trades>=5 then 'Clerk' else 'Novice' end,
    bank_offer_unlocked=(closed_trades>=20 and realized_pnl>0 and max_drawdown<greatest(5000,abs(realized_pnl)*2))
  where user_id=uid;
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'broker','Closed '||position_row.symbol,jsonb_build_object('lots',position_row.lots,'exit',close_price,'pnl',profit));
  return public.bw_broker_snapshot(position_row.symbol,'1min');
end $$;

-- The adviser now sees the dedicated brokerage account instead of the retired simulator.
create or replace function public.bw_adviser_context() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return jsonb_build_object(
    'city',public.bw_get_state(),'career',public.bw_job_snapshot(),
    'forex',public.bw_broker_snapshot('XAU/USD','1min'),'loadout',public.bw_get_loadout(),
    'family',public.bw_family_snapshot(),
    'available_pages',array['home','crimes','combat','gym','work','missions','city','shop','bank','hospital','jail','property','family','chat','players','social','mail','forums','rankings','awards','inventory','economy','arcade']
  );
end $$;

revoke execute on function public.bw_fx_open(text,text,bigint,smallint,uuid),public.bw_fx_close(uuid,uuid) from authenticated;
revoke all on function public.bw_broker_mark_pnl(public.bw_fx_positions,numeric),public.bw_broker_apply_risk(uuid) from public,anon,authenticated;
revoke all on function public.bw_broker_open_account(smallint,bigint),public.bw_broker_transfer(text,bigint),public.bw_broker_set_leverage(smallint),public.bw_broker_snapshot(text,text),public.bw_broker_open_position(text,text,numeric,numeric,numeric,uuid),public.bw_broker_close_position(uuid,uuid) from public,anon;
grant execute on function public.bw_broker_open_account(smallint,bigint),public.bw_broker_transfer(text,bigint),public.bw_broker_set_leverage(smallint),public.bw_broker_snapshot(text,text),public.bw_broker_open_position(text,text,numeric,numeric,numeric,uuid),public.bw_broker_close_position(uuid,uuid),public.bw_adviser_context() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_market_candles') then alter publication supabase_realtime add table public.bw_market_candles; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bw_fx_quotes') then alter publication supabase_realtime add table public.bw_fx_quotes; end if;
end $$;
