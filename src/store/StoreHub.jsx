import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "../online/supabase.js";
import "./store.css";

const PlayBilling = registerPlugin("PlayBilling");
const PLAY_SUBSCRIPTION_URL = "https://play.google.com/store/account/subscriptions?sku=blackwood_membership_monthly&package=com.neotokyo.underworld";

const money = value => `$${Number(value || 0).toLocaleString()}`;
const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const requestId = () => globalThis.crypto?.randomUUID?.() || `store-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function ProductPrice({ product, nativeProducts }) {
  const detail = nativeProducts[product.playProductId];
  return <span className="store-price">{detail?.formattedPrice || "Price shown by Google Play"}</span>;
}

function StoreProduct({ product, nativeProducts, busy, onBuy }) {
  const owned = product.owned;
  return <article className={`store-product-card ${owned ? "owned" : ""}`}>
    <div className="store-product-top"><span className="store-product-mark">{product.category === "membership" ? "✦" : "◇"}</span><span className="store-product-type">{product.category === "membership" ? "MONTHLY" : "ONE-TIME"}</span>{owned && <span className="store-owned">Owned</span>}</div>
    <h3>{product.name}</h3>
    <p>{product.shortDescription}</p>
    <small>{product.detail}</small>
    <footer><ProductPrice product={product} nativeProducts={nativeProducts}/><button className={owned ? "store-button muted" : "store-button primary"} disabled={busy || owned} onClick={() => onBuy(product)}>{owned ? "In your collection" : "Buy via Google Play"}</button></footer>
  </article>;
}

export default function StoreHub({ user = null, onNavigate = null }) {
  const [snapshot, setSnapshot] = useState(null);
  const [nativeProducts, setNativeProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [nativeAvailable, setNativeAvailable] = useState(Capacitor.isNativePlatform());
  const pendingRequests = useRef(new Map());
  const mounted = useRef(true);

  const loadSnapshot = useCallback(async () => {
    if (!supabase || !user) {
      setLoading(false);
      return null;
    }
    const { data, error: problem } = await supabase.rpc("bw_store_snapshot");
    if (!mounted.current) return data;
    if (problem) setError(problem.message || "The supporter store is unavailable until the city database is upgraded.");
    else { setSnapshot(data || null); setError(""); }
    setLoading(false);
    return data;
  }, [user]);

  const verifyPurchase = useCallback(async purchase => {
    if (!purchase || purchase.status === "cancelled") return;
    const state = Number(purchase.purchaseState);
    if (state === 2 || purchase.purchaseState === "pending") {
      setNotice("Google Play has marked this payment as pending. Nothing is unlocked until Play confirms it.");
      return;
    }
    if (state !== 1 && purchase.purchaseState !== "purchased") {
      setError("Google Play did not confirm this purchase. No entitlement was granted.");
      return;
    }
    const productId = purchase.products?.[0];
    if (!productId || !purchase.purchaseToken) {
      setError("The Play purchase receipt was incomplete. No entitlement was granted.");
      return;
    }
    setBusy(`verify:${productId}`); setError(""); setNotice("Verifying the Google Play receipt…");
    const { data, error: problem } = await supabase.functions.invoke("google-play-purchase", {
      body: {
        productId,
        purchaseToken: purchase.purchaseToken,
        orderId: purchase.orderId || null,
        purchaseTime: purchase.purchaseTime || null,
        quantity: purchase.quantity || 1,
        acknowledged: Boolean(purchase.acknowledged),
        requestId: pendingRequests.current.get(productId) || null,
      },
    });
    pendingRequests.current.delete(productId);
    if (!mounted.current) return;
    setBusy("");
    if (problem || data?.verified !== true) {
      setError(problem?.message || "The server could not verify this Play receipt yet. Reopen the store to retry; no client-side unlock was made.");
      setNotice("");
      return;
    }
    setNotice("Purchase verified. Your Blackwood entitlement is now available.");
    await loadSnapshot();
  }, [loadSnapshot]);

  const setupBilling = useCallback(async catalog => {
    if (!Capacitor.isNativePlatform() || !catalog?.length) return;
    try {
      const result = await PlayBilling.getProducts({ products: catalog.map(product => ({ productId: product.playProductId, productType: product.productType })) });
      const details = Object.fromEntries((result?.products || []).map(product => [product.productId, product]));
      if (mounted.current) { setNativeProducts(details); setNativeAvailable(true); }
    } catch (problem) {
      if (mounted.current) { setNativeAvailable(false); setNotice("The Play store is not available in this build. No charge was made."); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadSnapshot();
    return () => { mounted.current = false; };
  }, [loadSnapshot]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listener;
    PlayBilling.addListener("purchaseUpdated", purchase => { void verifyPurchase(purchase); }).then(handle => { listener = handle; }).catch(() => setNativeAvailable(false));
    return () => { listener?.remove?.(); };
  }, [verifyPurchase]);

  const catalog = useMemo(() => snapshot?.catalog || [], [snapshot]);
  const membership = snapshot?.membership || {};
  const styleCatalog = snapshot?.styleCatalog || [];
  const tickets = Number(snapshot?.wallet?.styleTickets || 0);

  useEffect(() => { setupBilling(catalog); }, [catalog, setupBilling]);

  const buy = async product => {
    if (!Capacitor.isNativePlatform()) { setNotice("Open the Google Play Android build to purchase. No charge was made in this browser."); return; }
    const detail = nativeProducts[product.playProductId];
    if (!detail) { setNotice("This product is not available in the current Play build. No charge was made."); return; }
    const id = requestId();
    setBusy(`buy:${product.id}`); setError(""); setNotice("Opening secure Google Play checkout…");
    const { data, error: problem } = await supabase.rpc("bw_store_begin_purchase", { p_product_id: product.id, p_request_id: id });
    if (problem) { setBusy(""); setError(problem.message || "Could not start the purchase."); setNotice(""); return; }
    pendingRequests.current.set(product.playProductId, data?.requestId || id);
    try {
      await PlayBilling.purchase({ productId: product.playProductId, offerToken: detail.offerToken || "" });
    } catch (purchaseError) {
      pendingRequests.current.delete(product.playProductId); setBusy(""); setNotice(""); setError(purchaseError?.message || "Google Play could not open checkout. No entitlement was granted.");
    }
  };

  const restore = async () => {
    if (!Capacitor.isNativePlatform()) { setNotice("Restore is available from the Google Play Android build."); return; }
    setBusy("restore"); setError(""); setNotice("Checking Google Play for previous purchases…");
    try { await PlayBilling.restorePurchases({}); setBusy(""); setNotice("Restored purchases are being verified by the server…"); }
    catch (problem) { setBusy(""); setNotice(""); setError(problem?.message || "Google Play restore failed. Try again later."); }
  };

  const claimDaily = async () => {
    if (busy) return;
    setBusy("daily"); setError("");
    const { data, error: problem } = await supabase.rpc("bw_store_claim_daily");
    setBusy("");
    if (problem) setError(problem.message || "Daily Style Ticket could not be claimed.");
    else { setSnapshot(data?.store || snapshot); setNotice(data?.event?.alreadyClaimed ? "Today’s Style Ticket is already in your ledger." : "One Style Ticket added to your supporter ledger."); }
  };

  const redeem = async style => {
    if (busy) return;
    setBusy(`redeem:${style.id}`); setError("");
    const { data, error: problem } = await supabase.rpc("bw_store_redeem_style_ticket", { p_style_id: style.id });
    setBusy("");
    if (problem) setError(problem.message || "That style rotation could not be redeemed.");
    else { setSnapshot(data?.store || snapshot); setNotice(`${style.name} added to your character-card collection.`); }
  };

  const manageMembership = () => { if (Capacitor.isNativePlatform()) Browser.open({ url: PLAY_SUBSCRIPTION_URL }); else window.open(PLAY_SUBSCRIPTION_URL, "_blank", "noopener,noreferrer"); };

  if (!user) return <div className="store-page"><section className="store-empty"><span>✦</span><h1>Sign in to the Supporter Store</h1><p>Purchases and membership entitlements are tied to your authenticated Blackwood account.</p></section></div>;
  if (loading && !snapshot) return <div className="store-page"><section className="store-empty"><span className="store-spinner"/><h1>Opening the store…</h1><p>Loading the server catalog and your entitlements.</p></section></div>;

  return <div className="store-page">
    <header className="store-hero"><div><span className="store-eyebrow">BLACKWOOD CITY · SUPPORTER STORE</span><h1>Keep Blackwood independent.</h1><p>Direct character-card cosmetics and an optional membership. Gameplay power, city cash, equipment, loot and Arcade Dollars stay earned through play.</p></div><div className="store-hero-seal" aria-hidden="true">M</div></header>
    <div className="store-trust" aria-label="Store promises"><span>✓ Google Play billing</span><span>✓ No paid Arcade Dollars</span><span>✓ No loot boxes</span><span>✓ Cosmetics first</span></div>
    {(notice || error) && <div className={`store-feedback ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message">×</button></div>}

    <section className="store-membership">
      <div className="store-membership-copy"><span className="store-eyebrow">OPTIONAL MONTHLY MEMBERSHIP</span><h2>Moretti Monthly</h2><p>A small, predictable thank-you for collectors who want a little more room to style their public record. Cancel any time in Google Play.</p><ul><li><b>1 Style Ticket</b> each UTC day, claimed once from this page</li><li><b>+1 public showcase slot</b> for your character card (4 instead of 3)</li><li><b>Member badge and early cosmetic rotations</b>, with no combat or economy advantage</li></ul></div>
      <div className="store-membership-action"><span className="store-price large">{nativeProducts.blackwood_membership_monthly?.formattedPrice || "Price shown by Google Play"}<small>/ month</small></span>{membership.active ? <><span className="store-active-pill">Active until {dateLabel(membership.expiresAt)}</span><button className="store-button secondary" onClick={manageMembership}>Manage in Google Play</button></> : <button className="store-button primary large-button" disabled={busy || !nativeAvailable} onClick={() => buy(catalog.find(product => product.id === "monthly-membership"))}>{busy === "buy:monthly-membership" ? "Opening checkout…" : nativeAvailable ? "Join via Google Play" : "Open Android to join"}</button>}</div>
    </section>

    {membership.active && <section className="store-daily"><div><span className="store-eyebrow">MEMBER LEDGER</span><h2>Today’s Style Ticket</h2><p>Use tickets for member-only paper and frame treatments. They cannot be converted to city cash or Arcade Dollars.</p></div><div className="store-daily-action"><b>{tickets}</b><span>Style Tickets</span><button className="store-button primary" disabled={busy || !snapshot?.daily?.eligible} onClick={claimDaily}>{snapshot?.daily?.claimed ? "Claimed today" : busy === "daily" ? "Claiming…" : "Claim daily ticket"}</button></div></section>}

    <section className="store-section"><header className="store-section-head"><div><span className="store-eyebrow">DIRECT COSMETICS</span><h2>Style your public record</h2><p>Each item is deterministic, permanent and cosmetic-only. There are no paid stats, boosts, cash packs or randomised rewards.</p></div><button className="store-button secondary" onClick={() => onNavigate?.("character")}>Open character card →</button></header><div className="store-product-grid">{catalog.filter(product => product.category === "cosmetic").map(product => <StoreProduct key={product.id} product={product} nativeProducts={nativeProducts} busy={Boolean(busy)} onBuy={buy}/>)}</div></section>

    {membership.active && <section className="store-section store-style-section"><header className="store-section-head"><div><span className="store-eyebrow">MEMBER ROTATION</span><h2>Earn your next look</h2><p>Daily tickets are the only membership reward. Redeem them at a fixed cost; nothing is random and nothing affects your build.</p></div><span className="store-ticket-balance">{tickets} tickets available</span></header><div className="store-style-grid">{styleCatalog.map(style => <article className={`store-style-card ${style.owned ? "owned" : ""}`} key={style.id}><div><span className="store-style-cost">{style.ticketCost} tickets</span><h3>{style.name}</h3><p>{style.description}</p></div><button className="store-button secondary" disabled={busy || style.owned || !style.canRedeem} onClick={() => redeem(style)}>{style.owned ? "Owned" : busy === `redeem:${style.id}` ? "Redeeming…" : "Redeem style"}</button></article>)}</div></section>}

    <section className="store-steps"><header><span className="store-eyebrow">PURCHASE SAFETY</span><h2>How a purchase works</h2></header><div className="store-step-grid"><div><b>01</b><strong>Google Play checkout</strong><p>The app opens Google Play’s secure, localised checkout. Prices are supplied by Play, not hard-coded here.</p></div><div><b>02</b><strong>Server verification</strong><p>Blackwood verifies the Play token with Google before an entitlement is written to your account.</p></div><div><b>03</b><strong>Restore or manage</strong><p>Use restore after reinstalling, or manage/cancel the membership from Google Play subscriptions.</p></div></div><button className="store-button secondary" disabled={Boolean(busy)} onClick={restore}>{busy === "restore" ? "Checking Play…" : "Restore purchases"}</button><small className="store-footnote">Pending, refunded, cancelled or unverified purchases do not unlock items. Supporter cosmetics never enter the combat, market, cash or Arcade Dollar systems.</small></section>
  </div>;
}
