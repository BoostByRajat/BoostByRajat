const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function provider() {
  const pref = (process.env.AI_PROVIDER || 'groq').toLowerCase();
  if (pref === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  throw new Error('No AI key. Set GROQ_API_KEY or GEMINI_API_KEY in .env');
}

async function chat(prompt) {
  const p = provider();
  if (p === 'groq') return groqChat(prompt);
  return geminiChat(prompt);
}

async function groqChat(prompt) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise translation and business-reply assistant for BoostByRajat, a solo digital studio (websites, apps, Instagram handling, ads). Always respond with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Groq ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function geminiChat(prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJson(text) {
  const cleaned = String(text)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI returned invalid JSON');
  }
}

export async function translateAndReply({ text, vendorLang = 'hi', clientMeta = {} }) {
  const prompt = `
Client message (any language):
"""
${text}
"""

Vendor preferred language code: ${vendorLang}
Optional client meta: ${JSON.stringify(clientMeta)}

Return JSON with keys:
- detectedLang: ISO-ish language name or code of the client message
- translation: full translation of the client message into ${vendorLang}
- replyDraft: a short professional reply to the client, written in the CLIENT's language (same as detectedLang), offering help from BoostByRajat for websites, apps, Instagram handling, or ads. Friendly, clear, 4-7 sentences max.
- summary: one-line summary in ${vendorLang}
`;

  const raw = await chat(prompt);
  const parsed = parseJson(raw);
  return {
    detectedLang: parsed.detectedLang || 'unknown',
    translation: parsed.translation || '',
    replyDraft: parsed.replyDraft || '',
    summary: parsed.summary || '',
    vendorLang,
    provider: provider(),
  };
}

export async function detectOnly(text) {
  const raw = await chat(
    `Detect the language of this text. Return JSON {"detectedLang":"..."}\n"""${text}"""`
  );
  const parsed = parseJson(raw);
  return { detectedLang: parsed.detectedLang || 'unknown', provider: provider() };
}

export async function siteAssistantReply({ message, history = [] }) {
  const hist = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((m) => `${m.role || 'user'}: ${String(m.content || '').slice(0, 400)}`)
    .join('\n');

  const prompt = `
You are the on-site chat assistant for BoostByRajat (solo digital studio from India, serving worldwide).
Services & rough INR pricing (domain/hosting/ad spend NOT included):
- Websites: Starter ₹7,500–11,000 · Business ₹18,000–21,000 · Custom ₹35,000+
- Apps: usually from Custom ₹35,000+ (quote based on scope)
- Instagram monthly: Basic ₹4,999 · Standard ₹7,999 · Growth ₹12,999
- Ads management: ₹5,000–12,000/mo; client pays ad spend separately
- First 3 clients: special launch pricing (honest new studio)
Process: WhatsApp enquiry → clear quote → 40–50% advance typical → build → delivery. UPI accepted. No GST for now.
Pages: /products/websites.html /products/apps.html /products/instagram.html /products/ads.html · offers list /collect.html · legal /legal/terms.html /legal/refund.html /legal/privacy.html
Rules:
- Reply in the user's language (Hindi or English mainly). Keep 2–6 short sentences.
- Be honest: no fake client claims or fake reviews.
- Push WhatsApp for booking; mention /collect.html for offers/promo list.
- Never invent exact custom quotes; give ranges and ask for brief requirements.
Return JSON only: {"reply":"..."}

Recent chat:
${hist || '(none)'}

User message:
"""
${message}
"""
`;

  const raw = await chat(prompt);
  const parsed = parseJson(raw);
  return {
    reply: parsed.reply || 'WhatsApp pe likho — main detail share karunga.',
    provider: provider(),
  };
}
