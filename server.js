import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { translateAndReply, detectOnly, siteAssistantReply } from './server/ai.js';
import { addLead, readLeads } from './server/leads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const isProd =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function deskPasswordOk(password) {
  const expected = process.env.VENDOR_DESK_PASSWORD || 'change-me';
  return String(password || '') === expected;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    brand: 'BoostByRajat',
    ai: process.env.AI_PROVIDER || 'groq',
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    hasGemini: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post('/api/enquiry', async (req, res) => {
  try {
    const { name, email, phone, service, message, lang } = req.body || {};
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ error: 'Message required' });
    }
    const vendorLang = process.env.VENDOR_LANG || 'hi';
    const result = await translateAndReply({
      text: String(message),
      vendorLang,
      clientMeta: { name, email, phone, service, uiLang: lang },
    });
    res.json({
      ok: true,
      ...result,
      mailto: buildMailto({ name, email, phone, service, message, result }),
    });
  } catch (err) {
    console.error('enquiry error', err);
    res.status(500).json({ error: err.message || 'AI failed' });
  }
});

app.post('/api/translate', async (req, res) => {
  try {
    if (!deskPasswordOk(req.body?.password)) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    const text = String(req.body?.text || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'Text required' });
    const vendorLang = process.env.VENDOR_LANG || 'hi';
    const result = await translateAndReply({ text, vendorLang });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('translate error', err);
    res.status(500).json({ error: err.message || 'AI failed' });
  }
});

app.post('/api/detect', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text required' });
    const result = await detectOnly(text);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Detect failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (message.length < 1) return res.status(400).json({ error: 'Message required' });
    if (message.length > 800) return res.status(400).json({ error: 'Message too long' });
    try {
      const result = await siteAssistantReply({
        message,
        history: req.body?.history || [],
      });
      return res.json({ ok: true, ...result });
    } catch (aiErr) {
      console.error('chat AI error', aiErr);
      return res.json({
        ok: true,
        reply:
          'Abhi AI thoda busy hai. Short answer: Websites ₹7,500–35,000+, Instagram ₹4,999–12,999/mo, Ads management ₹5,000–12,000/mo (spend alag). Detail ke liye WhatsApp pe likho ya /collect.html pe offers join karo.',
        provider: 'fallback',
      });
    }
  } catch (err) {
    console.error('chat error', err);
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

app.post('/api/leads', (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
    const location = String(body.location || '').trim();
    const name = String(body.name || '').trim();
    const consent = Boolean(body.consent);
    const interest = Array.isArray(body.interest)
      ? body.interest.map((x) => String(x)).slice(0, 8)
      : [];

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (whatsapp.length < 10) {
      return res.status(400).json({ error: 'Valid WhatsApp number required' });
    }
    if (location.length < 2) {
      return res.status(400).json({ error: 'Location / city required' });
    }
    if (!consent) {
      return res.status(400).json({ error: 'Promo consent required' });
    }

    const lead = addLead({
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      name: name || null,
      email,
      whatsapp,
      location,
      interest,
      consent: true,
      source: String(body.source || 'collect').slice(0, 40),
    });

    console.log('New lead:', lead.email, lead.whatsapp, lead.location);
    res.json({ ok: true, id: lead.id });
  } catch (err) {
    console.error('leads error', err);
    res.status(500).json({ error: err.message || 'Save failed' });
  }
});

app.post('/api/leads/list', (req, res) => {
  try {
    if (!deskPasswordOk(req.body?.password)) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    res.json({ ok: true, leads: readLeads() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'List failed' });
  }
});

function buildMailto({ name, email, phone, service, message, result }) {
  const to = process.env.PUBLIC_EMAIL || '';
  const subject = encodeURIComponent(`BoostByRajat enquiry — ${service || 'general'}`);
  const body = encodeURIComponent(
    [
      `Name: ${name || '-'}`,
      `Email: ${email || '-'}`,
      `Phone: ${phone || '-'}`,
      `Service: ${service || '-'}`,
      '',
      '--- Original ---',
      message,
      '',
      `--- Translation (${result.vendorLang}) ---`,
      result.translation,
      '',
      `--- Suggested reply (${result.detectedLang}) ---`,
      result.replyDraft,
    ].join('\n')
  );
  return to ? `mailto:${to}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
}

async function start() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    app.use(express.static(dist));
    app.get(['/desk', '/desk.html'], (_req, res) => {
      res.sendFile(path.join(dist, 'desk.html'));
    });
    app.get(['/collect', '/collect.html'], (_req, res) => {
      res.sendFile(path.join(dist, 'collect.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BoostByRajat → http://0.0.0.0:${PORT}`);
  });
}

start();
