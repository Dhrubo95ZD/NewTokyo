-- Ledger Credits (LC): play-earned currency for casino, Forex and future systems.
-- Apply after 20260912_item_catalogue_release_cleanup.sql. Safe to re-run.
-- LC cannot be bought with dollars and is intentionally isolated: there is no purchase, exchange or cash-out RPC.

create table if not exists public.bw_ledger_wallets(
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 25000 check(balance>=0),
  lifetime_earned bigint not null default 25000 check(lifetime_earned>=0),
  updated_at timestamptz not null default now()
);
alter table public.bw_ledger_wallets enable row level security;
drop policy if exists "users read own ledger credits" on public.bw_ledger_wallets;
create policy "users read own ledger credits" on public.bw_ledger_wallets for select to authenticated using(auth.uid()=user_id);
revoke insert,update,delete on public.bw_ledger_wallets from authenticated,anon;
grant select on public.bw_ledger_wallets to authenticated;

create or replace function public.bw_ensure_ledger(p_uid uuid) returns public.bw_ledger_wallets
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.bw_ledger_wallets;
begin
  insert into public.bw_ledger_wallets(user_id) values(p_uid) on conflict(user_id) do nothing;
  select * into result from public.bw_ledger_wallets where user_id=p_uid;
  return result;
end $$;

-- Small, repeatable LC awards make the currency grindable without energy gating.
-- Casino and broker logs never award LC, preventing circular farming.
create or replace function public.bw_reward_ledger_from_action() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare reward bigint:=case new.kind when 'crime' then 3 when 'combat' then 8 when 'mission' then 25 when 'hustle' then 2 when 'relic' then 5 else 0 end;
begin
  if reward>0 then
    insert into public.bw_ledger_wallets(user_id,balance,lifetime_earned) values(new.user_id,25000+reward,25000+reward)
    on conflict(user_id) do update set balance=bw_ledger_wallets.balance+reward,lifetime_earned=bw_ledger_wallets.lifetime_earned+reward,updated_at=now();
  end if;
  return new;
end $$;
drop trigger if exists bw_action_ledger_reward on public.bw_action_logs;
create trigger bw_action_ledger_reward after insert on public.bw_action_logs for each row execute function public.bw_reward_ledger_from_action();

-- Existing broker balances become LC balances; no dollar transfer is performed.
alter table public.bw_broker_accounts drop constraint if exists bw_broker_accounts_currency_check;
alter table public.bw_broker_accounts alter column currency set default 'LC';
update public.bw_broker_accounts set currency='LC' where currency<>'LC';
alter table public.bw_broker_accounts add constraint bw_broker_accounts_currency_check check(currency='LC');

create or replace function public.bw_casino_debit(p_uid uuid,p_bet bigint) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bigint;
begin
  if p_bet<10 or p_bet>10000 then raise exception 'stake must be LC 10–LC 10,000'; end if;
  perform public.bw_ensure_ledger(p_uid);
  select balance into b from public.bw_ledger_wallets where user_id=p_uid for update;
  if b<p_bet then raise exception 'insufficient Ledger Credits'; end if;
  update public.bw_ledger_wallets set balance=balance-p_bet,updated_at=now() where user_id=p_uid returning balance into b;
  return b;
end $$;

create or replace function public.bw_casino_credit(p_uid uuid,p_amount bigint) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare b bigint; amount bigint:=greatest(0,p_amount);
begin
  perform public.bw_ensure_ledger(p_uid);
  update public.bw_ledger_wallets set balance=balance+amount,lifetime_earned=lifetime_earned+amount,updated_at=now() where user_id=p_uid returning balance into b;
  return b;
end $$;

create or replace function public.bw_casino_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid(); wallet public.bw_ledger_wallets;
begin
  wallet:=public.bw_ensure_ledger(uid);
  return jsonb_build_object('balance',wallet.balance,'currency','LC','currencyName','Ledger Credits','purchasable',false,'cashValue',false,'blackjack',public.bw_blackjack_view(uid));
end $$;

create or replace function public.bw_slots_spin(p_bet bigint,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();reels text[];payout bigint:=0;mult int:=0;b bigint;old_round public.bw_casino_rounds;
begin
  select * into old_round from public.bw_casino_rounds where user_id=uid and request_id=p_request_id;
  if old_round.id is not null then select balance into b from public.bw_ledger_wallets where user_id=uid;return jsonb_build_object('balance',b,'currency','LC','result',old_round.outcome||jsonb_build_object('payout',old_round.payout,'message','This spin was already settled.'));end if;
  perform public.bw_casino_debit(uid,p_bet);
  reels:=array[(array['♛','7','◆','BAR','●'])[1+floor(random()*5)::int],(array['♛','7','◆','BAR','●'])[1+floor(random()*5)::int],(array['♛','7','◆','BAR','●'])[1+floor(random()*5)::int]];
  if reels[1]=reels[2] and reels[2]=reels[3] then mult:=case reels[1] when '7' then 20 when '♛' then 12 when 'BAR' then 8 else 5 end;elsif (select count(*) from unnest(reels)x where x='●')>=2 then mult:=2;end if;
  payout:=p_bet*mult;
  if payout>0 then b:=public.bw_casino_credit(uid,payout);else select balance into b from public.bw_ledger_wallets where user_id=uid;end if;
  insert into public.bw_casino_rounds(user_id,game,request_id,bet,payout,outcome) values(uid,'slots',p_request_id,p_bet,payout,jsonb_build_object('reels',reels,'multiplier',mult));
  return jsonb_build_object('balance',b,'currency','LC','result',jsonb_build_object('reels',reels,'payout',payout,'message',case when payout>0 then 'The machine pays LC '||payout else 'No winning line.' end));
end $$;

create or replace function public.bw_roulette_spin(p_bet bigint,p_bet_type text,p_number int,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();n int;reds int[]:=array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];win bool:=false;mult int:=0;payout bigint:=0;b bigint;old_round public.bw_casino_rounds;
begin
  if p_bet_type not in('red','black','odd','even','low','high','straight') then raise exception 'invalid roulette bet';end if;
  if p_bet_type='straight' and (p_number is null or p_number<0 or p_number>36) then raise exception 'choose 0–36';end if;
  select * into old_round from public.bw_casino_rounds where user_id=uid and request_id=p_request_id;
  if old_round.id is not null then select balance into b from public.bw_ledger_wallets where user_id=uid;return jsonb_build_object('balance',b,'currency','LC','result',old_round.outcome||jsonb_build_object('payout',old_round.payout,'message','This spin was already settled.'));end if;
  perform public.bw_casino_debit(uid,p_bet);n:=floor(random()*37);
  win:=case p_bet_type when 'red' then n=any(reds) when 'black' then n>0 and not n=any(reds) when 'odd' then n>0 and n%2=1 when 'even' then n>0 and n%2=0 when 'low' then n between 1 and 18 when 'high' then n between 19 and 36 else n=p_number end;
  mult:=case when not win then 0 when p_bet_type='straight' then 36 else 2 end;payout:=p_bet*mult;
  if payout>0 then b:=public.bw_casino_credit(uid,payout);else select balance into b from public.bw_ledger_wallets where user_id=uid;end if;
  insert into public.bw_casino_rounds(user_id,game,request_id,bet,payout,outcome) values(uid,'roulette',p_request_id,p_bet,payout,jsonb_build_object('number',n,'bet_type',p_bet_type,'win',win));
  return jsonb_build_object('balance',b,'currency','LC','result',jsonb_build_object('number',n,'payout',payout,'message',case when win then 'Winner. The table pays LC '||payout else 'The wheel lands on '||n||'.' end));
end $$;

create or replace function public.bw_broker_open_account(p_leverage smallint,p_deposit bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();wallet public.bw_ledger_wallets;legacy_margin bigint:=0;account_no text;
begin
  if p_leverage not in(500,1000) then raise exception 'choose leverage 1:500 or 1:1000';end if;
  if p_deposit<1000 then raise exception 'minimum opening deposit is LC 1,000';end if;
  if exists(select 1 from public.bw_broker_accounts where user_id=uid) then raise exception 'brokerage account already exists';end if;
  wallet:=public.bw_ensure_ledger(uid);if wallet.balance<p_deposit then raise exception 'insufficient Ledger Credits';end if;
  select coalesce(sum(margin),0) into legacy_margin from public.bw_fx_positions where user_id=uid and status='open';
  account_no:='FT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  update public.bw_ledger_wallets set balance=balance-p_deposit,updated_at=now() where user_id=uid;
  insert into public.bw_broker_accounts(user_id,account_number,currency,leverage,balance) values(uid,account_no,'LC',p_leverage,p_deposit+legacy_margin);
  update public.bw_fx_positions set status='closed',exit_price=entry_price,pnl=0,closed_at=now() where user_id=uid and status='open';
  insert into public.bw_action_logs(user_id,kind,summary,data) values(uid,'broker','Opened Federal Trust LC trading account',jsonb_build_object('account',account_no,'leverage',p_leverage,'deposit',p_deposit,'currency','LC'));
  return public.bw_broker_snapshot('XAU/USD','1min');
end $$;

create or replace function public.bw_broker_transfer(p_direction text,p_amount bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();account public.bw_broker_accounts;wallet public.bw_ledger_wallets;used_margin bigint;floating_pnl numeric;free_margin numeric;
begin
  if p_amount<1 then raise exception 'enter a positive transfer amount';end if;
  select * into account from public.bw_broker_accounts where user_id=uid for update;
  if account.user_id is null or account.status<>'active' then raise exception 'active brokerage account required';end if;
  wallet:=public.bw_ensure_ledger(uid);
  select coalesce(sum(p.margin),0),coalesce(sum(public.bw_broker_mark_pnl_precise(p,case when p.side='buy' then q.bid else q.ask end)),0) into used_margin,floating_pnl from public.bw_fx_positions p join public.bw_fx_quotes q using(symbol) where p.user_id=uid and p.status='open';
  free_margin:=account.balance+floating_pnl-used_margin;
  if p_direction='deposit' then
    if wallet.balance<p_amount then raise exception 'insufficient Ledger Credits';end if;
    update public.bw_ledger_wallets set balance=balance-p_amount,updated_at=now() where user_id=uid;
    update public.bw_broker_accounts set balance=balance+p_amount,updated_at=now() where user_id=uid;
  elsif p_direction='withdraw' then
    if free_margin<p_amount then raise exception 'insufficient free margin';end if;
    update public.bw_broker_accounts set balance=balance-p_amount,updated_at=now() where user_id=uid;
    update public.bw_ledger_wallets set balance=balance+p_amount,updated_at=now() where user_id=uid;
  else raise exception 'invalid transfer direction';end if;
  return public.bw_broker_snapshot('XAU/USD','1min');
end $$;

-- Replaces the precise P/L snapshot from 20260909, changing only the external wallet to LC.
create or replace function public.bw_broker_snapshot(p_symbol text default 'XAU/USD',p_timeframe text default '1min') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=public.bw_uid();account public.bw_broker_accounts;wallet public.bw_ledger_wallets;quote_row public.bw_fx_quotes;used_margin bigint:=0;floating_pnl numeric(18,2):=0;equity numeric(18,2):=0;
begin
  if p_timeframe not in('1min','5min','15min','1h','4h','1day') then raise exception 'invalid timeframe';end if;
  if not exists(select 1 from public.bw_fx_pairs where symbol=p_symbol) then raise exception 'unknown market';end if;
  wallet:=public.bw_ensure_ledger(uid);perform public.bw_broker_apply_risk(uid);
  select * into account from public.bw_broker_accounts where user_id=uid;select * into quote_row from public.bw_fx_quotes where symbol=p_symbol;
  if account.user_id is not null then select coalesce(sum(position.margin),0),coalesce(sum(public.bw_broker_mark_pnl_precise(position,case when quote.bid is not null and position.side='buy' then quote.bid else quote.ask end)),0) into used_margin,floating_pnl from public.bw_fx_positions position join public.bw_fx_quotes quote using(symbol) where position.user_id=uid and position.status='open';equity:=account.balance+floating_pnl;end if;
  return jsonb_build_object(
    'walletBalance',wallet.balance,'currency','LC','currencyName','Ledger Credits','purchasable',false,'cashValue',false,
    'account',case when account.user_id is null then null else to_jsonb(account)||jsonb_build_object('equity',equity,'usedMargin',used_margin,'freeMargin',equity-used_margin,'marginLevel',case when used_margin=0 then null else round(equity/used_margin*100,2) end,'floatingPnl',floating_pnl) end,
    'quote',to_jsonb(quote_row)||(select jsonb_build_object('digits',digits,'name',name,'assetClass',asset_class,'contractSize',contract_size) from public.bw_fx_pairs where symbol=p_symbol),
    'pairs',(select jsonb_agg(to_jsonb(pair_row)||jsonb_build_object('mid',quote_value.mid,'bid',quote_value.bid,'ask',quote_value.ask,'source',quote_value.source,'updatedAt',quote_value.updated_at) order by pair_row.sort_order) from public.bw_fx_pairs pair_row join public.bw_fx_quotes quote_value using(symbol)),
    'candles',coalesce((select jsonb_agg(to_jsonb(candle_row) order by candle_row.bucket_at) from(select * from public.bw_market_candles where symbol=p_symbol and timeframe=p_timeframe order by bucket_at desc limit 240)candle_row),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(to_jsonb(position_row)||jsonb_build_object('currentPrice',case when position_row.side='buy' then market_quote.bid else market_quote.ask end,'unrealizedPnl',public.bw_broker_mark_pnl_precise(position_row,case when position_row.side='buy' then market_quote.bid else market_quote.ask end)) order by position_row.opened_at desc) from public.bw_fx_positions position_row join public.bw_fx_quotes market_quote using(symbol) where position_row.user_id=uid and position_row.status='open'),'[]'::jsonb),
    'profile',coalesce((select to_jsonb(profile_row) from public.bw_fx_trader_profiles profile_row where profile_row.user_id=uid),'{}'::jsonb),'timeframe',p_timeframe,'serverTime',now()
  );
end $$;

revoke all on function public.bw_ensure_ledger(uuid),public.bw_reward_ledger_from_action(),public.bw_casino_debit(uuid,bigint),public.bw_casino_credit(uuid,bigint) from public,anon,authenticated;
revoke all on function public.bw_casino_snapshot(),public.bw_slots_spin(bigint,uuid),public.bw_roulette_spin(bigint,text,int,uuid),public.bw_broker_open_account(smallint,bigint),public.bw_broker_transfer(text,bigint),public.bw_broker_snapshot(text,text) from public,anon;
grant execute on function public.bw_casino_snapshot(),public.bw_slots_spin(bigint,uuid),public.bw_roulette_spin(bigint,text,int,uuid),public.bw_broker_open_account(smallint,bigint),public.bw_broker_transfer(text,bigint),public.bw_broker_snapshot(text,text) to authenticated;
