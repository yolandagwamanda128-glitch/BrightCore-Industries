// ═══════════════════════════════════════════════════════════════════
// BrightCore Industries — Gemini Chat Proxy (Cloudflare Worker)
// ═══════════════════════════════════════════════════════════════════
// This runs on Cloudflare's free tier and keeps your Gemini API key
// secret on the server side. Your website calls THIS worker; this
// worker calls Gemini. The key never touches the browser or GitHub.
//
// SETUP (5 minutes, no coding required beyond pasting this in):
//   1. Go to https://dash.cloudflare.com → sign up free
//   2. Left sidebar → Workers & Pages → Create → "Create Worker"
//   3. Name it something like "brightcore-chat" → Deploy
//   4. Click "Edit code" and paste this ENTIRE file, replacing the default
//   5. Click "Deploy" again
//   6. Go to Settings → Variables and Secrets → Add:
//        Name:  GEMINI_API_KEY
//        Value: (your NEW regenerated Gemini key — see note below)
//        Type:  Secret (this hides it from view, even from you, after saving)
//   7. Copy your worker's URL, e.g. https://brightcore-chat.yourname.workers.dev
//   8. Paste that URL into CHAT_WORKER_URL in the website's <script> section
//
// IMPORTANT: The key you shared earlier in chat is now considered
// exposed. Go to https://aistudio.google.com/apikey, delete/regenerate
// it, and use the NEW key in step 6 above. Never paste a real key into
// a chat, commit, or public repo again.
// ═══════════════════════════════════════════════════════════════════

const GEMINI_MODEL = 'gemini-2.5-flash'; // current stable Gemini model as of mid-2026

const SYSTEM_PROMPT = `You are the official virtual assistant for BrightCore Industries, a digital solutions company based in Durban, South Africa. Speak in a friendly, professional, concise tone — usually 2 to 4 sentences.

SERVICES:
- Software Engineering: custom software development and scalable web applications.
- Cybersecurity: security audits, vulnerability assessments, penetration testing, ongoing monitoring.
- Business Analysis: data-driven insights, business process audits, KPI dashboards.
- Digital Marketing: SEO, performance marketing, monthly reporting.

PRICING TIERS:
- Starter — from $900 one-time: 5-page responsive website, on-page SEO setup, SSL & security baseline, Google Analytics, 2 rounds of revisions.
- Growth (Most Popular) — from $2,500 for the first 3 months: full business website + CMS, digital marketing retainer, SEO + monthly reporting, vulnerability assessment, business process audit, KPI dashboard, priority support.
- Enterprise — custom quote: custom web application, full penetration testing, compliance audit, ongoing security monitoring, full marketing suite, business intelligence, dedicated account manager.

CONTACT: Point people to the contact form on this website, or hello@brightcoreindustry.com for anything you're unsure about.

RULES:
- Never invent specific timelines, discounts, or guarantees beyond what's listed above.
- For account-specific or existing-project questions, direct them to the contact form or email.
- If asked something unrelated to BrightCore, answer briefly and helpfully, then steer back to how BrightCore can help.
- Refer to yourself only as the "BrightCore virtual assistant" — never name the underlying AI model or vendor.
- Keep replies short and skimmable. No markdown formatting, plain sentences only.`;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const { message, history } = await request.json();
      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ reply: 'Please type a message.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const contents = [
        ...(Array.isArray(history) ? history : []).slice(-10).map(h => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(h.text || '').slice(0, 2000) }],
        })),
        { role: 'user', parts: [{ text: message.slice(0, 2000) }] },
      ];

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { temperature: 0.6, maxOutputTokens: 300 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.log('Gemini error:', errText);
        return new Response(
          JSON.stringify({ reply: "Sorry, I'm having trouble right now. Please email hello@brightcoreindustry.com." }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await geminiRes.json();
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, I couldn't process that. Please email hello@brightcoreindustry.com.";

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ reply: 'Something went wrong. Please try again or email hello@brightcoreindustry.com.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};
