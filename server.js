import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { translateAndReply, detectOnly } from './server/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const isProd =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
    const password = process.env.VENDOR_DESK_PASSWORD || 'change-me';
    if ((req.body?.password || '') !== password) {
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
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    app.use(express.static(dist));
    app.get(['/desk', '/desk.html'], (_req, res) => {
      res.sendFile(path.join(dist, 'desk.html'));
    });
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).end();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`BoostByRajat → http://localhost:${PORT}`);
  });
}

start();
