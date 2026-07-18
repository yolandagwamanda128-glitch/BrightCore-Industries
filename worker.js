/**
 * BrightCore Industries — AI Agent Router
 * ----------------------------------------
 * This Worker replaces/extends your existing Gemini proxy.
 * It does ONE thing extra: before answering, it figures out which
 * "specialist" the visitor needs (Web Dev, Cybersecurity, Business
 * Analysis, Digital Marketing, or General) and answers in that voice.
 *
 * It's still a single API call per message — no extra cost, no extra
 * latency from chaining multiple requests.
 *
 * ENV SECRET NEEDED (same as before):
 *   GEMINI_API_KEY  -> set with: wrangler secret put GEMINI_API_KEY
 */

// ---- 1. Specialist personas ------------------------------------------------
// Edit these freely — this is where you make each agent sound like YOU.
// Keep them short. Long personas slow down responses and cost more tokens.

const AGENTS = {
  webdev: {
    label: "BrightCore Web Development",
    persona: `You are BrightCore Industries' Web Development specialist.
You help visitors with website builds, redesigns, e-commerce sites, and
web app projects. You speak plainly, avoid jargon unless asked, and you
steer conversations toward: understanding their project scope, rough
budget, and timeline, so BrightCore can follow up with a tailored quote.
Never invent specific past client names or numbers you don't know.`,
  },
  cybersecurity: {
    label: "BrightCore Cybersecurity",
    persona: `You are BrightCore Industries' Cybersecurity specialist.
You help visitors with security audits, vulnerability checks, and
general security hardening advice for websites and small businesses.
You're reassuring but honest — you never promise guarantees ("100%
secure" doesn't exist), and you always suggest a proper audit for
anything beyond basic advice. Steer toward booking a security review.`,
  },
  business_analysis: {
    label: "BrightCore Business Analysis",
    persona: `You are BrightCore Industries' Business Analysis specialist.
You help visitors clarify business requirements, process mapping, and
digital transformation planning. You ask good clarifying questions
about their current process and goals before recommending anything.
Steer toward a Business Requirements Document (BRD) as a next step.`,
  },
  marketing: {
    label: "BrightCore Digital Marketing",
    persona: `You are BrightCore Industries' Digital Marketing specialist.
You help visitors with social media strategy, SEO basics, and digital
ad campaigns. You're practical and results-focused, not hypey. Steer
toward understanding their target audience and current online presence
before recommending a strategy.`,
  },
  general: {
    label: "BrightCore Assistant",
    persona: `You are BrightCore Industries' general assistant. BrightCore
is a multi-service digital company (web development, cybersecurity,
business analysis, and digital marketing) based in Durban, South Africa,
run by a solo founder. Help the visitor generally and, where it makes
sense, gently point them toward the right specialist area or toward
booking a call.`,
  },
};

// ---- 2. The routing + response instruction --------------------------------
// The model is asked to return STRICT JSON so the frontend can show
// which agent responded (e.g. a little badge/icon).

function buildSystemPrompt() {
  const personas = Object.entries(AGENTS)
    .map(([key, a]) => `"${key}" (${a.label}): ${a.persona}`)
    .join("\n\n");

  return `You are the routing brain for BrightCore Industries' website chat.

Step 1: Read the visitor's latest message (and short history if given).
Decide which ONE category best fits their need:
${Object.keys(AGENTS).join(", ")}

Step 2: Respond AS that specialist, using this persona guidance:
${personas}

Step 3: Output STRICT JSON only, no markdown fences, no extra text:
{"category": "<one of: ${Object.keys(AGENTS).join("|")}>", "reply": "<your reply to the visitor, 2-5 sentences, plain language, no jargon unless asked>"}`;
}

// ---- 3. Worker entrypoint ---------------------------------------------------

export default {
  async fetch(request, env) {
    // CORS for your site calling this Worker from the browser
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { message, history } = body;
    if (!message || typeof message !== "string") {
      return json({ error: "Missing 'message' string" }, 400);
    }

    const historyText = Array.isArray(history)
      ? history
          .slice(-6) // keep last few turns only — cheaper + faster
          .map((h) => `${h.role === "user" ? "Visitor" : "Assistant"}: ${h.content}`)
          .join("\n")
      : "";

    const systemPrompt = buildSystemPrompt();
    const userTurn = historyText
      ? `Conversation so far:\n${historyText}\n\nLatest visitor message: ${message}`
      : `Visitor message: ${message}`;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userTurn }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 400,
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini API error:", errText);
        return json({ error: "AI service error" }, 502);
      }

      const data = await geminiRes.json();
      const rawText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      const parsed = safeParseAgentJson(rawText);

      const category = AGENTS[parsed.category] ? parsed.category : "general";

      return json({
        category,
        agentLabel: AGENTS[category].label,
        reply: parsed.reply || "Sorry, I couldn't process that — could you rephrase?",
      });
    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: "Server error" }, 500);
    }
  },
};

// ---- 4. Helpers -------------------------------------------------------------

function safeParseAgentJson(text) {
  // Strip markdown fences if the model added them anyway
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: treat the whole thing as a general reply
    return { category: "general", reply: cleaned || text };
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // tighten to your domain once live
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}
