import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GAME_GUIDE = `You are The Consigliere, the in-world guide for Blackwood City, an online mafia RPG packaged for Android. Be concise, practical, and honest. Only recommend pages present in available_pages. The authoritative systems are: crimes use nerve; gym uses energy; combat targets real protected players; professions require a three-question interview and 20-hour shifts; inventory has eight equipment slots and consumables; the Economy has six simulated 24/7 Forex pairs with spread, margin, and leverage; Federal Trust banking careers require a proven Forex record; Rossi's casino offers blackjack, European roulette, and slots; family, world chat, mail, forums, and rankings are online. Never claim you performed an action. Never invent account values or players. Warn that leverage can lose the full margin. Use the supplied account context to identify what is currently possible and give at most three useful next moves.`;

type AdviserContext = {
  available_pages?: string[];
  [key: string]: unknown;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sign in required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase function environment is incomplete");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data, error } = await supabase.rpc("bw_adviser_context");
    if (error) throw error;

    const context = (data || {}) as AdviserContext;
    const availablePages = Array.isArray(context.available_pages)
      ? context.available_pages
      : ["home"];
    const body = await request.json().catch(() => ({}));
    const question = String(body.question || "What should I do next?").slice(
      0,
      800,
    );

    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      throw new Error("The adviser is awaiting its OPENAI_API_KEY secret");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6",
        store: false,
        input: [
          { role: "developer", content: GAME_GUIDE },
          {
            role: "user",
            content: `ACCOUNT CONTEXT\n${JSON.stringify(context)}\n\nPLAYER QUESTION\n${question}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "blackwood_advice",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                answer: { type: "string" },
                suggestions: {
                  type: "array",
                  maxItems: 3,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: { type: "string" },
                      page: { type: "string", enum: availablePages },
                      reason: { type: "string" },
                    },
                    required: ["label", "page", "reason"],
                  },
                },
              },
              required: ["answer", "suggestions"],
            },
          },
        },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error?.message ||
        `OpenAI request failed (${response.status})`;
      throw new Error(message);
    }

    const outputText = result.output_text || result.output
      ?.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) =>
        item.content || []
      )
      .find((item: { type?: string }) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("The adviser returned an empty response");

    return new Response(outputText, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
