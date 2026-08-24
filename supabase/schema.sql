create table if not exists public.game_kv (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.game_kv enable row level security;

create policy "game shared read" on public.game_kv for select to anon using (
  key like 'chat:%' or key like 'lb:%' or key like 'bjfeed:%' or key like 'players:%' or key like 'acct:%'
);
create policy "game shared insert" on public.game_kv for insert to anon with check (
  key like 'chat:%' or key like 'lb:%' or key like 'bjfeed:%' or key like 'players:%' or key like 'acct:%' or key like 'probe:%'
);
create policy "game shared update" on public.game_kv for update to anon using (true) with check (true);
create policy "game shared delete probes" on public.game_kv for delete to anon using (key like 'probe:%');

create index if not exists game_kv_updated_at_idx on public.game_kv(updated_at desc);

-- Prototype multiplayer schema. Before a public production launch, move account
-- saves to authenticated per-user rows and add rate limiting/moderation.
