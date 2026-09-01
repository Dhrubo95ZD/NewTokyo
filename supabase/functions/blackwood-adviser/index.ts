import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Suggestion = { label: string; page: string; reason: string };
type JsonMap = Record<string, any>;

const suggestion = (label: string, page: string, reason: string): Suggestion => ({
  label,
  page,
  reason,
});

function advise(question: string, context: JsonMap) {
  const query = question.toLowerCase();
  const city = context.city || {};
  const player = city.player || {};
  const careerState = context.career || {};
  const career = careerState.career;
  const forex = context.forex || {};
  const trader = forex.profile || {};
  const broker = forex.account;
  const loadout = context.loadout || {};
  const equipment = Array.isArray(loadout.equipment) ? loadout.equipment : [];
  const inventory = Array.isArray(loadout.inventory) ? loadout.inventory : [];
  const familyState = context.family || {};
  const family = familyState.family;
  const market = context.market || {};
  const hustles = context.hustles || {};
  const hustleProfile = hustles.profile || {};
  const combat = context.combat || {};
  const relic = combat.relic || {};
  const suggestions: Suggestion[] = [];
  let answer = "I reviewed your current Blackwood City record.";

  if (/job|work|career|profession|interview|bank offer/.test(query)) {
    if (!career) {
      answer = trader.bank_offer_unlocked
        ? "Federal Trust has noticed your trading record. You can interview for banking now, or choose another profession."
        : "You are not employed yet. Choose a profession and pass its three-question interview to begin earning pay, work stats, and profession points.";
      suggestions.push(suggestion("Visit employment", "work", "Choose an available profession and begin its interview."));
      if (!trader.bank_offer_unlocked) {
        suggestions.push(suggestion("Build a trading record", "economy", "Profitable, disciplined Forex trading can unlock the Federal Trust career."));
      }
    } else if (career.shift_ready) {
      answer = `Your ${career.position_name || "current"} shift is ready. Completing it will pay wages and add profession points.`;
      suggestions.push(suggestion("Complete your shift", "work", "Your timed shift is currently available."));
    } else {
      answer = `You are employed as ${career.position_name || "an associate"}. Your next shift is still on cooldown, so work on another progression system for now.`;
      suggestions.push(suggestion("Review promotions", "work", "Check the next position's work-stat and profession-point requirements."));
    }
  } else if (/forex|trade|currency|economy|eur|gbp|jpy|leverage/.test(query)) {
    answer = broker
      ? `Your live-market account ${broker.account_number} uses 1:${broker.leverage} leverage with $${Number(broker.equity || 0).toLocaleString()} equity. Your trader rank is ${trader.rank || "Novice"} with ${trader.closed_trades || 0} closed trades. High leverage can liquidate virtual funds quickly, so use small lot sizes.`
      : "Open a Federal Trust trading account first. Choose 1:500 or 1:1000 leverage and fund it from your in-game cash before placing lot-based orders.";
    suggestions.push(suggestion("Open the live market desk", "economy", "Trade provider-backed Forex and metals with candlestick charts and account margin controls."));
    if (!trader.bank_offer_unlocked) {
      suggestions.push(suggestion("Earn a bank invitation", "economy", "Close disciplined trades with positive realized P&L and controlled drawdown."));
    } else {
      suggestions.push(suggestion("Interview at Federal Trust", "work", "Your verified trading record has unlocked its banking profession."));
    }
  } else if (/casino|blackjack|roulette|slot|gambl/.test(query)) {
    answer = "Rossi's Casino offers server-settled blackjack, three-reel slots, and single-zero European roulette. Treat it as entertainment—the house has an advantage.";
    suggestions.push(suggestion("Visit Rossi's Casino", "arcade", "Choose blackjack, slots, or roulette and set a controlled stake."));
    suggestions.push(suggestion("Protect your cash", "bank", "Money deposited at Federal Trust is protected from wagers and muggings."));
  } else if (/market|bazaar|sell|listing|price book|auction/.test(query)) {
    answer = `The Blackwood Exchange currently has ${(market.listings || []).length} real-player listing${(market.listings || []).length === 1 ? "" : "s"}. Items are held in server escrow until purchased or cancelled, and completed sales build a 30-day price book.`;
    suggestions.push(suggestion("Browse player listings", "market", "Compare real sellers, remaining quantity and recorded prices."));
    suggestions.push(suggestion("Sell spare inventory", "market", "Unequipped items can be listed while the city secures them in escrow."));
  } else if (/hustle|grind|no energy|out of energy|keep playing|street work/.test(query)) {
    answer = `Street Work costs no energy. Your mastery is ${hustleProfile.mastery || 0}, heat is ${hustleProfile.heat || 0}/100, and current reward efficiency is ${Math.round(Number(hustleProfile.rewardMultiplier || 1) * 100)}%. Every run still awards cash, XP and mastery; heat and repetition only reduce efficiency to a 25% floor.`;
    suggestions.push(suggestion("Run street work", "hustles", "Choose a no-energy contact for cash, mastery and a chance of item loot."));
    suggestions.push(suggestion("Cool your heat", "market", "Trade items or use another system while heat falls by one point per minute."));
  } else if (/fight|attack|combat|bounty|contract|relic|rare item|hospitalize|mug/.test(query)) {
    const readyContracts = (combat.contracts || []).filter((item: JsonMap) => !item.claimedAt && Number(item.progress) >= Number(item.target));
    answer = `Your combat record is ${player.fights_won || 0}–${player.fights_lost || 0}. You have ${relic.intel || 0}/100 Underworld Intel, ${readyContracts.length} claimable daily contract${readyContracts.length === 1 ? "" : "s"}, and ${(combat.bounties || []).length} live player-funded bounties. Cache searching costs no energy and every valid search advances the guaranteed relic meter.`;
    if (readyContracts.length) suggestions.push(suggestion("Claim combat rewards", "combat", "A completed daily contract is waiting at the Fight Office."));
    if (Number(player.energy || 0) >= 25) suggestions.push(suggestion("Choose a real target", "combat", "First meaningful wins pay full rewards and have a rare-drop chance."));
    suggestions.push(suggestion("Search for rare items", "combat", "Use the no-energy cache network to advance the guaranteed 100-intel relic meter."));
  } else if (/equip|weapon|armor|inventory|item|loadout/.test(query)) {
    const emptySlots = Math.max(0, 8 - equipment.length);
    answer = `You have ${inventory.length} inventory types and ${emptySlots} empty equipment slot${emptySlots === 1 ? "" : "s"}. Equipped bonuses are included in server-authoritative combat.`;
    suggestions.push(suggestion("Review your loadout", "inventory", "Fill empty body slots and compare attack, defense, speed, and dexterity bonuses."));
    suggestions.push(suggestion("Browse equipment", "shop", "Purchase level-appropriate items from the city catalog."));
  } else if (/crime|nerve|jail|money|cash/.test(query)) {
    answer = `You currently have ${player.nerve || 0}/${player.max_nerve || 0} nerve and crime skill ${player.crime_skill || 1}. Choose crimes near your current skill for safer progression.`;
    suggestions.push(suggestion("Choose a crime", "crimes", "Available odds and nerve costs are shown before every attempt."));
    suggestions.push(suggestion("Protect earnings", "bank", "Deposit cash so other players cannot mug it."));
  } else if (/gym|train|energy|strength|defense|speed|dexterity|stat/.test(query)) {
    answer = `You have ${player.energy || 0}/${player.max_energy || 0} energy. Gym training permanently improves combat stats and scales with happiness.`;
    suggestions.push(suggestion("Train at the gym", "gym", "Spend available energy on the combat stat you want to develop."));
    suggestions.push(suggestion("Check your equipment", "inventory", "Loadout bonuses complement permanent gym statistics."));
  } else if (/family|war|territor|operation|armory|vault|chain/.test(query)) {
    if (!family) {
      answer = "You are not in a family yet. Apply to a real player family or found your own order. Family operations require distinct authenticated members—there are no bot seats.";
      suggestions.push(suggestion("Open the family registry", "family", "Apply to a family or found a new one."));
    } else if (familyState.war) {
      answer = `${family.name} is in a ranked war against ${familyState.war.opponent}. Your family has ${familyState.war.ourScore}/${familyState.war.target} points. Winning attacks against real opposing members score automatically.`;
      suggestions.push(suggestion("Open the war room", "family", "Review the score, deadline, and latest valid hits."));
      suggestions.push(suggestion("Find an opponent", "combat", "Attack a real member of the opposing family to score."));
    } else if (familyState.operations?.length) {
      answer = `${family.name} has ${familyState.operations[0].name} ${familyState.operations[0].status}. Fill its specialist seats with real members, ready up, and collect the server-settled payout when complete.`;
      suggestions.push(suggestion("Review the operation", "family", "Choose a role, ready up, or collect a completed score."));
    } else {
      const openTerritories = (familyState.territories || []).filter((place: JsonMap) => !place.ownerId).length;
      answer = `${family.name} is rated ${family.rating} in ${family.division} division with $${Number(family.vault || 0).toLocaleString()} in the family vault. ${openTerritories} territories are currently unclaimed.`;
      suggestions.push(suggestion("Plan family business", "family", "Start an operation, manage the armory, claim territory, or enter ranked matchmaking."));
    }
  } else if (/chat|player|friend|message|forum|rank/.test(query)) {
    answer = "Blackwood City is online. World chat, player rankings, private mail, forums, and contacts all use real authenticated accounts.";
    suggestions.push(suggestion("Open world chat", "chat", "Talk to currently registered players."));
    suggestions.push(suggestion("View rankings", "rankings", "Compare real player progression and wealth."));
    suggestions.push(suggestion("Open family headquarters", "family", "Coordinate with your real-player criminal family."));
  } else {
    answer = `You are level ${player.level || 1} with ${player.energy || 0} energy, ${player.nerve || 0} nerve, and $${Number(player.cash || forex.walletBalance || 0).toLocaleString()} on hand. Here are the strongest available next moves.`;
    if (!career) suggestions.push(suggestion("Start a profession", "work", "Pass an interview to unlock shifts, work stats, and career progression."));
    if (Number(player.nerve || 0) >= 2) suggestions.push(suggestion("Build crime skill", "crimes", "You have enough nerve for an available crime."));
    if (Number(player.energy || 0) >= 25) suggestions.push(suggestion("Take a combat contract", "combat", "Daily orders, bounties and first-win rare drops are available at the Fight Office."));
    else if (Number(player.energy || 0) >= 5) suggestions.push(suggestion("Train a combat stat", "gym", "You have energy available for permanent stat gains."));
    if (Number(player.nerve || 0) < 2 || Number(player.energy || 0) < 25) suggestions.push(suggestion("Hunt rare equipment", "combat", "Cache searches cost no energy and always add Underworld Intel toward a guaranteed relic."));
    if (suggestions.length < 3 && Number(trader.closed_trades || 0) === 0) suggestions.push(suggestion("Learn Forex", "economy", "A careful first trade begins the path toward a banking offer."));
  }

  return { answer, suggestions: suggestions.slice(0, 3) };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sign in required");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase environment is incomplete");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: context, error } = await supabase.rpc("bw_adviser_context");
    if (error) throw error;

    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "What should I do next?").slice(0, 800);
    return new Response(JSON.stringify(advise(question, context || {})), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A 200 response lets the current APK show the useful backend error text.
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
