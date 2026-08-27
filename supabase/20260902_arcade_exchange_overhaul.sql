-- Arcade + Exchange hardening
-- Safe to run after 20260826_neo_exchange_simulator.sql.

create or replace function public.settle_exchange_protection_on_quote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  position public.exchange_positions;
  exit_status text;
  exit_price numeric;
begin
  if new.symbol is null or new.price is null or new.price <= 0 then return new; end if;
  for position in
    select * from public.exchange_positions
    where symbol = new.symbol and status = 'open'
    for update
  loop
    exit_status := null;
    exit_price := new.price;
    if (position.side='buy' and new.price<=position.liquidation_price)
       or (position.side='sell' and new.price>=position.liquidation_price) then
      exit_status := 'liquidated'; exit_price := position.liquidation_price;
    elsif position.stop_loss is not null and
      ((position.side='buy' and new.price<=position.stop_loss) or
       (position.side='sell' and new.price>=position.stop_loss)) then
      exit_status := 'stopped'; exit_price := position.stop_loss;
    elsif position.take_profit is not null and
      ((position.side='buy' and new.price>=position.take_profit) or
       (position.side='sell' and new.price<=position.take_profit)) then
      exit_status := 'target'; exit_price := position.take_profit;
    end if;
    if exit_status is not null then
      perform public.close_exchange_position_internal(position.id,exit_price,exit_status,gen_random_uuid());
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists settle_exchange_protection_after_quote on public.market_quotes;
create trigger settle_exchange_protection_after_quote
after insert or update of price on public.market_quotes
for each row execute function public.settle_exchange_protection_on_quote();

revoke all on function public.settle_exchange_protection_on_quote() from public,anon,authenticated;

create or replace function public.open_my_exchange_position(
  p_side text,
  p_margin_yen bigint,
  p_leverage smallint,
  p_stop_loss numeric default null,
  p_take_profit numeric default null,
  p_client_order_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  player_id uuid:=public.require_google_player();
  wallet public.player_wallets;
  quote public.market_quotes;
  position public.exchange_positions;
  fill numeric;
  liq numeric;
  clean_side text:=lower(p_side);
  freshness interval;
begin
  select * into position from public.exchange_positions where user_id=player_id and client_order_id=p_client_order_id;
  if position.id is not null then return jsonb_build_object('positionId',position.id,'entryPrice',position.entry_price,'duplicate',true); end if;
  if clean_side not in ('buy','sell') then raise exception 'invalid side'; end if;
  if p_margin_yen<100 then raise exception 'minimum position risk is 100 yen'; end if;
  if p_leverage not in (1,3,5,10,100,500) then raise exception 'unsupported risk multiplier'; end if;
  select * into quote from public.market_quotes where symbol='XAU/USD' for share;
  freshness:=case when quote.source_kind='live' then interval '2.5 seconds' else interval '8 seconds' end;
  if quote.symbol is null or quote.status<>'open' or quote.source_at<now()-freshness or quote.source_at>now()+interval '2 seconds' then raise exception 'verified quote is stale; orders locked'; end if;
  fill:=quote.price*(1+case when clean_side='buy' then 1 else -1 end*(quote.spread_bps/10000));
  liq:=fill*case when clean_side='buy' then 1-(.98/p_leverage) else 1+(.98/p_leverage) end;
  if p_stop_loss is not null and p_stop_loss<=0 then raise exception 'stop loss must be a positive price'; end if;
  if p_take_profit is not null and p_take_profit<=0 then raise exception 'take profit must be a positive price'; end if;
  if p_stop_loss is not null and ((clean_side='buy' and p_stop_loss>=fill) or (clean_side='sell' and p_stop_loss<=fill)) then raise exception 'stop loss is on the wrong side of entry'; end if;
  if p_take_profit is not null and ((clean_side='buy' and p_take_profit<=fill) or (clean_side='sell' and p_take_profit>=fill)) then raise exception 'take profit is on the wrong side of entry'; end if;
  if p_stop_loss is not null and ((clean_side='buy' and p_stop_loss<=liq) or (clean_side='sell' and p_stop_loss>=liq)) then raise exception 'stop loss must trigger before liquidation'; end if;
  wallet:=public.ensure_exchange_wallet(player_id);
  if wallet.balance<p_margin_yen then raise exception 'not enough available yen'; end if;
  update public.player_wallets set balance=balance-p_margin_yen,reserved=reserved+p_margin_yen,version=version+1,updated_at=now() where user_id=player_id returning * into wallet;
  insert into public.exchange_positions(user_id,side,margin_yen,leverage,entry_price,liquidation_price,stop_loss,take_profit,client_order_id,quote_source_at)
    values(player_id,clean_side,p_margin_yen,p_leverage,fill,liq,p_stop_loss,p_take_profit,p_client_order_id,quote.source_at) returning * into position;
  insert into public.exchange_ledger(user_id,event,amount,balance_after,position_id,idempotency,metadata)
    values(player_id,'trade_open',-p_margin_yen,wallet.balance,position.id,p_client_order_id,jsonb_build_object('side',clean_side,'leverage',p_leverage,'entryPrice',fill,'stopLoss',p_stop_loss,'takeProfit',p_take_profit,'source',quote.source_kind));
  perform public.mirror_wallet_to_save(player_id,wallet.balance);
  return jsonb_build_object('positionId',position.id,'entryPrice',fill,'liquidationPrice',liq,'stopLoss',p_stop_loss,'takeProfit',p_take_profit,'balance',wallet.balance,'source',quote.source_kind);
end;
$$;

revoke all on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) from public,anon;
grant execute on function public.open_my_exchange_position(text,bigint,smallint,numeric,numeric,uuid) to authenticated;
