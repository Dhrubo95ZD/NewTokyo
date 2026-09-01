import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const intervals: Record<string, string> = {
  "1min": "1min", "5min": "5min", "15min": "15min",
  "1h": "1h", "4h": "4h", "1day": "1day",
};
const cacheSeconds: Record<string, number> = {
  "1min": 180, "5min": 300, "15min": 600,
  "1h": 1200, "4h": 3600, "1day": 7200,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const providerKey = Deno.env.get("TWELVE_DATA_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Supabase function environment is incomplete" }, 500);
    if (!providerKey) return json({ error: "TWELVE_DATA_API_KEY is not configured in Supabase Edge Function secrets" }, 503);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Your session has expired" }, 401);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await request.json().catch(() => ({}));
    const symbol = String(body.symbol || "XAU/USD").toUpperCase();
    const timeframe = String(body.timeframe || "1min");
    if (!intervals[timeframe]) return json({ error: "Unsupported timeframe" }, 400);

    if (body.mode === "quotes") {
      const requested = Array.isArray(body.symbols) ? body.symbols : [symbol];
      const symbols = [...new Set(requested.map(value => String(value).toUpperCase()))].slice(0, 8);
      if (!symbols.length) return json({ error: "Choose at least one open market" }, 400);
      const { data: markets, error: marketsError } = await admin.from("bw_fx_pairs")
        .select("symbol,provider_symbol,spread").in("symbol", symbols);
      if (marketsError) throw marketsError;
      const { data: cachedQuotes, error: cacheError } = await admin.from("bw_fx_quotes")
        .select("symbol,updated_at").in("symbol", symbols);
      if (cacheError) throw cacheError;
      const cache = new Map((cachedQuotes || []).map(value => [value.symbol, value.updated_at]));
      const staleMarkets = (markets || []).filter(market => {
        const updatedAt = cache.get(market.symbol);
        return !updatedAt || Date.now() - new Date(updatedAt).getTime() >= 12_000;
      });
      if (!staleMarkets.length) return json({ source: "twelve_data", refreshed: 0, symbols, cached: true });

      const updates: Record<string, unknown>[] = [];
      let providerError = "";
      let rateLimited = false;
      for (const market of staleMarkets) {
        const query = new URLSearchParams({ symbol: market.provider_symbol || market.symbol, apikey: providerKey });
        const response = await fetch(`https://api.twelvedata.com/price?${query}`);
        const provider = await response.json();
        const mid = Number(provider.price);
        if (!response.ok || provider.status === "error" || !Number.isFinite(mid)) {
          providerError = provider.message || `Market provider returned ${response.status}`;
          rateLimited ||= response.status === 429;
          continue;
        }
        const spread = Number(market.spread || 0);
        updates.push({
          symbol: market.symbol, mid, bid: mid - spread / 2, ask: mid + spread / 2,
          source: "twelve_data", market_time: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      }
      if (!updates.length) return json({ error: providerError || "No live quotes returned" }, rateLimited ? 429 : 502);
      const { error: quoteError } = await admin.from("bw_fx_quotes").upsert(updates, { onConflict: "symbol" });
      if (quoteError) throw quoteError;
      return json({ source: "twelve_data", refreshed: updates.length, symbols: updates.map(value => value.symbol), partialError: providerError || null });
    }

    const { data: market, error: marketError } = await admin.from("bw_fx_pairs")
      .select("symbol,provider_symbol,spread,digits").eq("symbol", symbol).single();
    if (marketError || !market) return json({ error: "Unknown market" }, 404);

    const { data: newest } = await admin.from("bw_market_candles").select("bucket_at")
      .eq("symbol", symbol).eq("timeframe", timeframe).order("bucket_at", { ascending: false }).limit(1).maybeSingle();
    const fresh = newest?.bucket_at && Date.now() - new Date(newest.bucket_at).getTime() < cacheSeconds[timeframe] * 1000;
    if (fresh) return json({ source: "twelve_data", refreshed: false, cachedAt: newest.bucket_at });

    const query = new URLSearchParams({
      symbol: market.provider_symbol || symbol,
      interval: intervals[timeframe],
      outputsize: "240",
      timezone: "UTC",
      apikey: providerKey,
    });
    const response = await fetch(`https://api.twelvedata.com/time_series?${query}`);
    const provider = await response.json();
    if (!response.ok || provider.status === "error" || !Array.isArray(provider.values)) {
      return json({ error: provider.message || `Market provider returned ${response.status}` }, response.status === 429 ? 429 : 502);
    }

    const candles = provider.values.map((value: Record<string, string>) => ({
      symbol,
      timeframe,
      bucket_at: `${value.datetime.replace(" ", "T")}Z`,
      open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close),
      volume: Number(value.volume || 0), source: "twelve_data",
    })).filter((value: Record<string, unknown>) => [value.open, value.high, value.low, value.close].every(Number.isFinite));
    if (!candles.length) return json({ error: "Provider returned no usable candles" }, 502);
    const { error: candleError } = await admin.from("bw_market_candles").upsert(candles, { onConflict: "symbol,timeframe,bucket_at" });
    if (candleError) throw candleError;
    const latest = candles.reduce((a: typeof candles[number], b: typeof candles[number]) => new Date(a.bucket_at) > new Date(b.bucket_at) ? a : b);
    const mid = Number(latest.close);
    const spread = Number(market.spread || 0);
    const { error: quoteError } = await admin.from("bw_fx_quotes").upsert({
      symbol, mid, bid: mid - spread / 2, ask: mid + spread / 2,
      source: "twelve_data", market_time: latest.bucket_at, updated_at: new Date().toISOString(),
    }, { onConflict: "symbol" });
    if (quoteError) throw quoteError;
    return json({ source: "twelve_data", refreshed: true, candles: candles.length, marketTime: latest.bucket_at });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
