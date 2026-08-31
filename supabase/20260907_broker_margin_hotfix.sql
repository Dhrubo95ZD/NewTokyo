-- Apply once if 20260906_live_brokerage.sql was installed before the
-- micro-lot margin fix. Safe to run again.
alter table public.bw_fx_positions
  drop constraint if exists bw_fx_positions_margin_check;

alter table public.bw_fx_positions
  add constraint bw_fx_positions_margin_check check (margin >= 1);
