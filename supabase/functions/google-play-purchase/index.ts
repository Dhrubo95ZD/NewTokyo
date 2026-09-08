import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
type JsonMap = Record<string, any>;

const base64url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemBytes = (pem: string) => {
  const clean = pem.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

async function accessToken(credentials: JsonMap) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(credentials.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Google Play service authentication failed");
  return body.access_token as string;
}

async function googleApi(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Google Play API returned ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }
  return body as JsonMap;
}

async function tokenHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const isoMillis = (value: unknown) => {
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const millis = Number(value || 0);
  return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : null;
};

function subscriptionState(state: string, expiresAt: string | null) {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE": return "active";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD": return "grace";
    case "SUBSCRIPTION_STATE_ON_HOLD": return "on_hold";
    case "SUBSCRIPTION_STATE_PAUSED": return "paused";
    case "SUBSCRIPTION_STATE_EXPIRED": return "expired";
    case "SUBSCRIPTION_STATE_CANCELED": return expiresAt && new Date(expiresAt).getTime() > Date.now() ? "active" : "cancelled";
    case "SUBSCRIPTION_STATE_PENDING": return "pending";
    default: return "cancelled";
  }
}

async function verifyGooglePurchase(access: string, packageName: string, product: JsonMap, purchaseToken: string) {
  if (product.product_type === "one_time") {
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(product.play_product_id)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const body = await googleApi(access, url);
    const state = Number(body.purchaseState);
    return {
      state: state === 0 ? "purchased" : state === 2 ? "pending" : "cancelled",
      orderId: body.orderId || null,
      purchaseTime: isoMillis(body.purchaseTimeMillis),
      expiresAt: null,
      quantity: Math.max(1, Number(body.quantity || 1)),
      acknowledged: Number(body.acknowledgementState) === 1,
      acknowledgeUrl: `${url}:acknowledge`,
      provider: body,
    };
  }

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const body = await googleApi(access, url);
  const line = (body.lineItems || []).find((item: JsonMap) => item.productId === product.play_product_id);
  if (!line) throw new Error("Google Play subscription product does not match the Blackwood catalog item");
  return {
    state: subscriptionState(String(body.subscriptionState || ""), line.expiryTime || null),
    orderId: line.latestSuccessfulOrderId || line.latestOrderId || body.latestOrderId || null,
    purchaseTime: isoMillis(body.startTime),
    expiresAt: line.expiryTime || null,
    quantity: 1,
    acknowledged: String(body.acknowledgementState || "") === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    acknowledgeUrl: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(product.play_product_id)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    provider: body,
  };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const credentialsJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.neotokyo.underworld";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Supabase function environment is incomplete" }, 500);
    if (!credentialsJson) return json({ error: "Google Play verification is not configured yet" }, 503);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Your session has expired" }, 401);
    const body = await request.json().catch(() => ({}));
    const playProductId = String(body.productId || "").trim();
    const purchaseToken = String(body.purchaseToken || "").trim();
    if (!playProductId || purchaseToken.length < 20 || purchaseToken.length > 20000) return json({ error: "A valid Google Play purchase token is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: product, error: productError } = await admin.from("bw_store_products").select("id,play_product_id,product_type,active").eq("play_product_id", playProductId).eq("active", true).maybeSingle();
    if (productError) throw productError;
    if (!product) return json({ error: "This Google Play product is not in the active Blackwood catalog" }, 400);

    const credentials = JSON.parse(credentialsJson);
    const access = await accessToken(credentials);
    const verified = await verifyGooglePurchase(access, packageName, product, purchaseToken);
    const hash = await tokenHash(purchaseToken);
    const metadata = { provider: "google_play", packageName, requestId: body.requestId || null, providerState: verified.provider, clientAcknowledged: Boolean(body.acknowledged) };

    const apply = async (acknowledged: boolean) => {
      const { data, error } = await admin.rpc("bw_store_apply_verified_purchase", {
        p_user_id: userData.user.id,
        p_product_id: product.id,
        p_platform_purchase_id: verified.orderId,
        p_purchase_token_hash: hash,
        p_purchase_state: verified.state,
        p_quantity: verified.quantity,
        p_purchase_time: verified.purchaseTime,
        p_expires_at: verified.expiresAt,
        p_acknowledged: acknowledged,
        p_metadata: metadata,
      });
      if (error) throw error;
      return data;
    };

    if (!["purchased", "active", "grace"].includes(verified.state)) {
      const result = await apply(verified.acknowledged);
      return json({ verified: false, revoked: Boolean(result?.revoked), purchaseState: verified.state });
    }

    let result = await apply(verified.acknowledged);
    if (!verified.acknowledged) {
      try {
        await googleApi(access, verified.acknowledgeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ developerPayload: "blackwood-store" }) });
      } catch (acknowledgeError) {
        return json({ error: acknowledgeError instanceof Error ? acknowledgeError.message : "Google Play acknowledgement failed", verified: false, retryable: true }, 502);
      }
      result = await apply(true);
    }
    return json({ verified: result?.verified === true, productId: product.id, purchaseState: verified.state, expiresAt: verified.expiresAt });
  } catch (error) {
    const status = Number((error as any)?.status) === 404 ? 400 : 500;
    return json({ error: error instanceof Error ? error.message : "Purchase verification failed" }, status);
  }
});
