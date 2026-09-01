-- Precise floating P/L for live quotes. Apply after 20260906_live_brokerage.sql.
-- Safe to run again.

create or replace function public.bw_broker_mark_pnl_precise(
  p public.bw_fx_positions,
  p_price numeric
) returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select round(
    coalesce(p.notional_usd, p.margin * p.leverage) *
    case
      when p.side = 'buy' then p_price / p.entry_price - 1
      else p.entry_price / p_price - 1
    end,
    2
  )
$$;

create or replace function public.bw_broker_snapshot(
  p_symbol text default 'XAU/USD',
  p_timeframe text default '1min'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := public.bw_uid();
  account public.bw_broker_accounts;
  wallet public.player_wallets;
  quote_row public.bw_fx_quotes;
  used_margin bigint := 0;
  floating_pnl numeric(18,2) := 0;
  equity numeric(18,2) := 0;
begin
  if p_timeframe not in ('1min','5min','15min','1h','4h','1day') then
    raise exception 'invalid timeframe';
  end if;
  if not exists (select 1 from public.bw_fx_pairs where symbol = p_symbol) then
    raise exception 'unknown market';
  end if;

  wallet := public.ensure_exchange_wallet(uid);
  perform public.bw_broker_apply_risk(uid);
  select * into account from public.bw_broker_accounts where user_id = uid;
  select * into quote_row from public.bw_fx_quotes where symbol = p_symbol;

  if account.user_id is not null then
    select
      coalesce(sum(position.margin), 0),
      coalesce(sum(public.bw_broker_mark_pnl_precise(
        position,
        case when position.side = 'buy' then quote.bid else quote.ask end
      )), 0)
    into used_margin, floating_pnl
    from public.bw_fx_positions position
    join public.bw_fx_quotes quote using (symbol)
    where position.user_id = uid and position.status = 'open';
    equity := account.balance + floating_pnl;
  end if;

  return jsonb_build_object(
    'walletBalance', wallet.balance,
    'account', case when account.user_id is null then null else to_jsonb(account) || jsonb_build_object(
      'equity', equity,
      'usedMargin', used_margin,
      'freeMargin', equity - used_margin,
      'marginLevel', case when used_margin = 0 then null else round(equity / used_margin * 100, 2) end,
      'floatingPnl', floating_pnl
    ) end,
    'quote', to_jsonb(quote_row) || (
      select jsonb_build_object(
        'digits', digits,
        'name', name,
        'assetClass', asset_class,
        'contractSize', contract_size
      ) from public.bw_fx_pairs where symbol = p_symbol
    ),
    'pairs', (
      select jsonb_agg(to_jsonb(pair_row) || jsonb_build_object(
        'mid', quote_value.mid,
        'bid', quote_value.bid,
        'ask', quote_value.ask,
        'source', quote_value.source,
        'updatedAt', quote_value.updated_at
      ) order by pair_row.sort_order)
      from public.bw_fx_pairs pair_row
      join public.bw_fx_quotes quote_value using (symbol)
    ),
    'candles', coalesce((
      select jsonb_agg(to_jsonb(candle_row) order by candle_row.bucket_at)
      from (
        select * from public.bw_market_candles
        where symbol = p_symbol and timeframe = p_timeframe
        order by bucket_at desc limit 240
      ) candle_row
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(
        to_jsonb(position_row) || jsonb_build_object(
          'currentPrice', case when position_row.side = 'buy' then market_quote.bid else market_quote.ask end,
          'unrealizedPnl', public.bw_broker_mark_pnl_precise(
            position_row,
            case when position_row.side = 'buy' then market_quote.bid else market_quote.ask end
          )
        ) order by position_row.opened_at desc
      )
      from public.bw_fx_positions position_row
      join public.bw_fx_quotes market_quote using (symbol)
      where position_row.user_id = uid and position_row.status = 'open'
    ), '[]'::jsonb),
    'profile', coalesce((
      select to_jsonb(profile_row)
      from public.bw_fx_trader_profiles profile_row
      where profile_row.user_id = uid
    ), '{}'::jsonb),
    'timeframe', p_timeframe,
    'serverTime', now()
  );
end
$$;

revoke all on function public.bw_broker_mark_pnl_precise(public.bw_fx_positions, numeric)
  from public, anon, authenticated;
revoke all on function public.bw_broker_snapshot(text, text) from public, anon;
grant execute on function public.bw_broker_snapshot(text, text) to authenticated;
