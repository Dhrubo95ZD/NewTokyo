import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
type JsonMap = Record<string, any>;

const base64url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
};
const pemBytes = (pem: string) => {
  const clean = pem.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const isoMillis = (value: unknown) => {
  if (typeof value === "string" && !/^\d+$/.test(value)) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
  const millis = Number(value || 0);
  return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : null;
};

async function accessToken(credentials: JsonMap) {
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ iss: credentials.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${head}.${body}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(credentials.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Google Play service authentication failed");
  return result.access_token as string;
}

async function googleApi(access: string, url: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Google Play API returned ${response.status}`);
  return body as JsonMap;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

const subscriptionState = (state: string, expiresAt: string | null) => {
  if (state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ? "grace" : "active";
  if (state === "SUBSCRIPTION_STATE_CANCELED" && expiresAt && new Date(expiresAt).getTime() > Date.now()) return "active";
  if (state === "SUBSCRIPTION_STATE_ON_HOLD") return "on_hold";
  if (state === "SUBSCRIPTION_STATE_PAUSED") return "paused";
  if (state === "SUBSCRIPTION_STATE_EXPIRED") return "expired";
  if (state === "SUBSCRIPTION_STATE_PENDING") return "pending";
  return "cancelled";
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME") || "com.neotokyo.underworld";
    const sharedToken = Deno.env.get("GOOGLE_PLAY_PUBSUB_TOKEN");
    if (sharedToken && request.headers.get("Authorization") !== `Bearer ${sharedToken}`) return json({ error: "Unauthorized notification" }, 401);
    const envelope = await request.json().catch(() => ({}));
    const message = envelope?.message;
    const notification = message?.data ? JSON.parse(decodeBase64(message.data)) : null;
    if (!notification || notification.packageName !== packageName) return json({ error: "Invalid Play notification" }, 400);
    const sub = notification.subscriptionNotification;
    const oneTime = notification.oneTimeProductNotification;
    const purchaseToken = String(sub?.purchaseToken || oneTime?.purchaseToken || "");
    const playProductId = String(sub?.subscriptionId || oneTime?.sku || "");
    if (!purchaseToken || !playProductId) return json({ accepted: true, ignored: "test-or-empty-message" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const credentialsJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    if (!supabaseUrl || !serviceKey || !credentialsJson) return json({ error: "RTDN environment is incomplete" }, 503);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const purchaseTokenHash = await hash(purchaseToken);
    const { data: event, error: eventError } = await admin.from("bw_store_purchase_events").select("user_id,product_id").eq("purchase_token_hash", purchaseTokenHash).maybeSingle();
    if (eventError) throw eventError;
    if (!event) return json({ accepted: true, ignored: "unlinked-purchase" });
    const { data: product, error: productError } = await admin.from("bw_store_products").select("id,play_product_id,product_type,active").eq("id", event.product_id).eq("active", true).maybeSingle();
    if (productError) throw productError;
    if (!product || product.play_product_id !== playProductId) return json({ error: "Play notification does not match the store event" }, 400);
    const access = await accessToken(JSON.parse(credentialsJson));
    let purchaseState = "cancelled";
    let platformPurchaseId: string | null = null;
    let purchaseTime: string | null = null;
    let expiresAt: string | null = null;
    let acknowledged = false;
    let quantity = 1;
    if (product.product_type === "subscription") {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
      const current = await googleApi(access, url);
      const line = (current.lineItems || []).find((item: JsonMap) => item.productId === playProductId);
      if (!line) return json({ accepted: true, ignored: "product-not-present" });
      expiresAt = line.expiryTime || null;
      purchaseState = subscriptionState(String(current.subscriptionState || ""), expiresAt);
      platformPurchaseId = line.latestSuccessfulOrderId || line.latestOrderId || current.latestOrderId || null;
      purchaseTime = isoMillis(current.startTime);
      acknowledged = String(current.acknowledgementState || "") === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
    } else {
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(playProductId)}/tokens/${encodeURIComponent(purchaseToken)}`;
      const current = await googleApi(access, url);
      purchaseState = Number(current.purchaseState) === 0 ? "purchased" : Number(current.purchaseState) === 2 ? "pending" : "cancelled";
      platformPurchaseId = current.orderId || null;
      purchaseTime = isoMillis(current.purchaseTimeMillis);
      quantity = Math.max(1, Number(current.quantity || 1));
      acknowledged = Number(current.acknowledgementState) === 1;
    }
    const { data: result, error } = await admin.rpc("bw_store_apply_verified_purchase", {
      p_user_id: event.user_id,
      p_product_id: product.id,
      p_platform_purchase_id: platformPurchaseId,
      p_purchase_token_hash: purchaseTokenHash,
      p_purchase_state: purchaseState,
      p_quantity: quantity,
      p_purchase_time: purchaseTime,
      p_expires_at: expiresAt,
      p_acknowledged: acknowledged,
      p_metadata: { provider: "google_play_rtdn", packageName, messageId: message.messageId || null, notificationType: sub?.notificationType || oneTime?.notificationType || null },
    });
    if (error) throw error;
    return json({ accepted: true, purchaseState, verified: result?.verified === true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Play notification reconciliation failed" }, 500);
  }
});
