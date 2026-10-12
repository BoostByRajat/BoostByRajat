import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { translateAndReply, detectOnly, siteAssistantReply } from './server/ai.js';
import { addLead, readLeads, upsertQuotationLead } from './server/leads.js';
import { AdminError, createAdmin, listPublicAdmins, setAdminActive } from './server/admins.js';
import { clearSessionCookie, loginWithPassword, requestIsSecure, setSessionCookie, userFromRequest } from './server/auth.js';
import { convertQuote, deleteInvoice, findById, findByToken, InvoiceError, markCleared, readInvoices, recordSend, saveInvoice } from './server/invoices.js';
import { listClients, upsertClient } from './server/clients.js';
import { sendInvoiceEmail, smtpReady } from './server/invoice-mail.js';
import { clearNoticeText, computeTotals, docKind, dueNoticeText, emailSubject, messageText, nextNumber, orderConfirmationText, quoteMessageText } from './src/invoice-model.js';
import { site } from './src/config.js';
import { sendNoticeOnWhatsApp, sendOrderOnWhatsApp, waSnapshot } from './server/wa-api.js';
import { flushStore, pullDeskData } from './server/github-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5173;
const isProd =
  process.env.NODE_ENV === 'production' || process.argv.includes('--prod');

const siteOrigin = String(process.env.PUBLIC_SITE_URL || site.url).replace(/\/$/, '');

const app = express();

app.use((req, res, next) => {
  const send = res.json.bind(res);
  res.json = (body) => flushStore().then(() => send(body)).catch((err) => {
    console.error('desk github save', err.message);
    if (res.headersSent) return;
    res.status(502);
    return send({ error: 'Bill GitHub par save nahi hui. Dubara try karo.' });
  });
  next();
});
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use((req, res, next) => {
  if (!isProd) return next();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  const canonicalHost = 'www.boostbyrajat.co.in';
  if (host === 'boostbyrajat.co.in') {
    res.redirect(301, new URL(req.originalUrl, `https://${canonicalHost}/`).toString());
    return;
  }
  if (!host.endsWith('.onrender.com') || req.path.startsWith('/api/')) return next();
  res.redirect(301, new URL(req.originalUrl, `${siteOrigin}/`).toString());
});

function requireDesk(req, res) {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Login required' });
    return null;
  }
  return user;
}

function requireOwner(req, res) {
  const user = requireDesk(req, res);
  if (!user) return null;
  if (user.role !== 'owner') {
    res.status(403).json({ error: 'Sirf owner member add kar sakta hai' });
    return null;
  }
  return user;
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
    const replyDraft =
      typeof result.replyDraft === 'string'
        ? result.replyDraft
        : result.replyDraft
          ? JSON.stringify(result.replyDraft)
          : '';
    res.json({
      ok: true,
      ...result,
      replyDraft,
      mailto: buildMailto({
        name,
        email,
        phone,
        service,
        message,
        result: { ...result, replyDraft },
      }),
    });
  } catch (err) {
    console.error('enquiry error', err);
    res.status(500).json({ error: err.message || 'AI failed' });
  }
});

app.post('/api/order', (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').replace(/\D/g, '');
    const service = String(body.service || 'other').slice(0, 40);
    const message = String(body.message || '').trim();

    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (phone.length < 10) {
      return res.status(400).json({ error: 'Valid WhatsApp / phone required' });
    }
    if (message.length < 2) {
      return res.status(400).json({ error: 'Project details required' });
    }

    const lead = addLead({
      id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      name,
      email,
      whatsapp: phone,
      location: null,
      interest: [service],
      message,
      service,
      consent: true,
      source: 'order',
    });

    const vendorWa = String(process.env.WHATSAPP_NUMBER || process.env.VITE_WHATSAPP_NUMBER || '918696666063').replace(
      /\D/g,
      ''
    );
    const text = [
      'New order from BoostByRajat site',
      `Name: ${name}`,
      `Email: ${email}`,
      `WhatsApp: ${phone}`,
      `Service: ${service}`,
      '',
      message,
    ].join('\n');
    const whatsappUrl = `https://wa.me/${vendorWa}?text=${encodeURIComponent(text)}`;

    console.log('New order:', lead.email, lead.service);
    res.json({ ok: true, id: lead.id, whatsappUrl });
  } catch (err) {
    console.error('order error', err);
    res.status(500).json({ error: err.message || 'Order failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const user = loginWithPassword(req.body?.username, req.body?.password);
  if (!user) return res.status(401).json({ error: 'Incorrect username or password' });
  setSessionCookie(res, user, requestIsSecure(req, isProd));
  res.json({ ok: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, requestIsSecure(req, isProd));
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Login required' });
  res.json({ ok: true, user });
});

app.get('/api/admins', (req, res) => {
  if (!requireOwner(req, res)) return;
  res.json({ ok: true, admins: listPublicAdmins() });
});

app.post('/api/admins', (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    const admin = createAdmin(req.body || {});
    res.json({ ok: true, admin, admins: listPublicAdmins() });
  } catch (err) {
    const status = err instanceof AdminError ? err.status : 500;
    if (status === 500) console.error('admin create', err);
    res.status(status).json({ error: err.message || 'Member add nahi hua' });
  }
});

app.post('/api/admins/active', (req, res) => {
  try {
    if (!requireOwner(req, res)) return;
    setAdminActive(String(req.body?.id || ''), Boolean(req.body?.active));
    res.json({ ok: true, admins: listPublicAdmins() });
  } catch (err) {
    const status = err instanceof AdminError ? err.status : 500;
    if (status === 500) console.error('admin active', err);
    res.status(status).json({ error: err.message || 'Member update nahi hua' });
  }
});

app.post('/api/translate', async (req, res) => {
  try {
    if (!requireDesk(req, res)) return;
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
    if (!requireDesk(req, res)) return;
    res.json({ ok: true, leads: readLeads() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'List failed' });
  }
});

app.post('/api/invoices/list', (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const invoices = readInvoices().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({
      ok: true,
      invoices,
      clients: listClients(),
      user,
      admins: user.role === 'owner' ? listPublicAdmins() : [],
      nextNumber: nextNumber(invoices, 'invoice'),
      nextDemo: nextNumber(invoices, 'demo'),
      nextQuote: nextNumber(invoices, 'quote'),
      defaultUpi: process.env.INVOICE_UPI || '',
      smtp: smtpReady(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'List failed' });
  }
});

app.post('/api/invoices/wa-status', (req, res) => {
  if (!requireDesk(req, res)) return;
  res.json({ ok: true, ...waSnapshot() });
});

app.post('/api/invoices/whatsapp', async (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const inv = findById(String(req.body?.id || ''));
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const link = invoicePublicUrl(req, inv.token);
    if (docKind(inv) === 'demo' && !req.body?.force) {
      return res.json({ ok: true, sent: false, skipped: true, invoice: inv });
    }
    if (docKind(inv) === 'quote' && !String(process.env.WHATSAPP_QUOTE_TEMPLATE || '').trim()) {
      const text = quoteMessageText(inv, link, { whatsapp: site.whatsapp, email: site.email });
      const alreadyCopy = (inv.sends || []).some((row) => row.channel === 'copy' || row.channel === 'whatsapp');
      const invoice = alreadyCopy && !req.body?.force ? inv : recordSend(inv.id, 'copy', user);
      return res.json({
        ok: true,
        sent: false,
        copied: true,
        already: alreadyCopy && !req.body?.force,
        text,
        invoice,
      });
    }
    const already = (inv.sends || []).some((row) => row.channel === 'whatsapp');
    if (already && !req.body?.force) {
      return res.json({ ok: true, sent: false, already: true, invoice: inv });
    }
    const wa = waSnapshot();
    if (wa.status !== 'open') {
      return res.json({
        ok: true,
        sent: false,
        error: wa.error,
      });
    }

    let pdfBuffer = null;
    const rawPdf = String(req.body?.pdfBase64 || '');
    if (rawPdf) {
      let b64 = rawPdf;
      const comma = b64.indexOf(',');
      if (b64.startsWith('data:') && comma !== -1) b64 = b64.slice(comma + 1);
      b64 = b64.replace(/\s/g, '');
      pdfBuffer = Buffer.from(b64, 'base64');
      if (pdfBuffer.length < 100 || pdfBuffer.length > 6_000_000 || pdfBuffer.subarray(0, 4).toString() !== '%PDF') {
        return res.status(400).json({ error: 'PDF missing' });
      }
    }

    const filename = String(req.body?.filename || `BoostByRajat-${inv.number}.pdf`)
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 80);
    const safeName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    await sendOrderOnWhatsApp({
      phone: inv.client?.phone,
      text: orderConfirmationText(inv, link),
      pdfBuffer,
      filename: safeName,
      invoice: inv,
      link,
    });
    const invoice = recordSend(inv.id, 'whatsapp', user);
    console.log('WhatsApp order confirmation', invoice.number);
    res.json({ ok: true, sent: true, invoice });
  } catch (err) {
    if (err.code === 'WA_OFFLINE' || err.code === 'WA_PHONE') {
      return res.json({ ok: true, sent: false, error: err.message });
    }
    console.error('invoice whatsapp', err);
    res.status(500).json({ error: err.message || 'WhatsApp send failed' });
  }
});

app.post('/api/invoices/save', (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const invoice = saveInvoice(req.body || {}, user);
    if (docKind(invoice) !== 'demo') upsertClient(invoice.client);
    if (docKind(invoice) === 'quote') {
      upsertQuotationLead({
        quoteId: invoice.id,
        createdAt: invoice.createdAt,
        name: invoice.client?.name || null,
        email: invoice.client?.email || null,
        whatsapp: invoice.client?.phone || '',
        location: invoice.client?.city || null,
        interest: (invoice.items || []).map((item) => item.description).filter(Boolean).slice(0, 8),
        message: `Quotation ${invoice.number || ''}`.trim(),
      });
    }
    res.json({ ok: true, invoice, clients: listClients() });
  } catch (err) {
    const status = err instanceof InvoiceError ? err.status : 500;
    if (!(err instanceof InvoiceError)) console.error('invoice save', err);
    res.status(status).json({ error: err.message || 'Save failed' });
  }
});

app.post('/api/invoices/convert', (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const result = convertQuote(String(req.body?.id || ''), user);
    if (docKind(result.invoice) === 'invoice') upsertClient(result.invoice.client);
    res.json({ ok: true, ...result, clients: listClients() });
  } catch (err) {
    const status = err instanceof InvoiceError ? err.status : 500;
    if (!(err instanceof InvoiceError)) console.error('invoice convert', err);
    res.status(status).json({ error: err.message || 'Invoice nahi bani' });
  }
});

app.post('/api/invoices/notice', async (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const kind = req.body?.kind === 'clear' ? 'clear' : 'due';
    let inv = findById(String(req.body?.id || ''));
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (docKind(inv) === 'quote') {
      return res.status(400).json({ error: 'Quotation par due/clear nahi. Pehle invoice banao.' });
    }
    if (!inv.client?.phone) return res.status(400).json({ error: 'Client ka WhatsApp number likho' });
    if (kind === 'due' && computeTotals(inv).pending <= 0) {
      return res.status(400).json({ error: 'Is bill par pending nahi hai' });
    }
    if (kind === 'clear') inv = markCleared(inv.id, user);
    const link = invoicePublicUrl(req, inv.token);
    const text = kind === 'due' ? dueNoticeText(inv, link) : clearNoticeText(inv, link);
    const wa = waSnapshot();
    if (wa.status !== 'open') {
      return res.json({ ok: true, sent: false, invoice: inv, error: wa.error });
    }
    await sendNoticeOnWhatsApp({ phone: inv.client?.phone, text });
    const invoice = recordSend(inv.id, kind, user);
    console.log('WhatsApp notice', kind, invoice.number);
    res.json({ ok: true, sent: true, invoice });
  } catch (err) {
    if (err.code === 'WA_OFFLINE' || err.code === 'WA_PHONE') {
      const inv = findById(String(req.body?.id || ''));
      return res.json({ ok: true, sent: false, invoice: inv, error: err.message });
    }
    const status = err instanceof InvoiceError ? err.status : 500;
    if (status === 500) console.error('invoice notice', err);
    res.status(status).json({ error: err.message || 'Message failed' });
  }
});

app.post('/api/invoices/delete', (req, res) => {
  try {
    if (!requireDesk(req, res)) return;
    deleteInvoice(String(req.body?.id || ''));
    res.json({ ok: true });
  } catch (err) {
    const status = err instanceof InvoiceError ? err.status : 500;
    res.status(status).json({ error: err.message || 'Delete failed' });
  }
});

app.get('/api/invoices/public/:token', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const found = findByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'Invoice not found' });
  const invoice = { ...found };
  delete invoice.sends;
  delete invoice.updatedBy;
  if (invoice.createdBy) invoice.createdBy = { name: invoice.createdBy.name };
  res.json({ ok: true, invoice });
});

app.post('/api/invoices/email', async (req, res) => {
  try {
    const user = requireDesk(req, res);
    if (!user) return;
    const inv = findById(String(req.body?.id || ''));
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (!inv.client?.email) return res.status(400).json({ error: 'Client email missing' });

    let b64 = String(req.body?.pdfBase64 || '');
    const comma = b64.indexOf(',');
    if (b64.startsWith('data:') && comma !== -1) b64 = b64.slice(comma + 1);
    b64 = b64.replace(/\s/g, '');
    const pdfBuffer = Buffer.from(b64, 'base64');
    if (pdfBuffer.length < 100 || pdfBuffer.length > 6_000_000 || pdfBuffer.subarray(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: 'PDF missing' });
    }

    const filename = String(req.body?.filename || `BoostByRajat-${inv.number}.pdf`)
      .replace(/[^\w.-]+/g, '-')
      .slice(0, 80);
    const link = invoicePublicUrl(req, inv.token);
    await sendInvoiceEmail({
      to: inv.client.email,
      subject: emailSubject(inv),
      text: messageText(inv, link, { whatsapp: site.whatsapp, email: site.email }),
      pdfBuffer,
      filename: filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`,
    });
    const invoice = recordSend(inv.id, 'email', user);
    res.json({ ok: true, sent: true, invoice });
  } catch (err) {
    if (err.code === 'NO_SMTP') return res.json({ ok: true, sent: false, reason: 'no_smtp' });
    const status = err instanceof InvoiceError ? err.status : 500;
    if (status === 500) console.error('invoice email', err);
    res.status(status).json({ error: err.message || 'Email failed' });
  }
});

function invoicePublicUrl(req, token) {
  if (isProd) return `${siteOrigin}/invoice-view.html?t=${token}`;
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}/invoice-view.html?t=${token}`;
}

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
    app.get(['/invoice', '/invoice.html'], (_req, res) => {
      res.sendFile(path.join(dist, 'invoice.html'));
    });
    app.get(['/invoice-view', '/invoice-view.html'], (_req, res) => {
      res.sendFile(path.join(dist, 'invoice-view.html'));
    });
  }

  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'File too large' });
    }
    next(err);
  });

  await pullDeskData();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BoostByRajat → http://0.0.0.0:${PORT}`);
  });
}

start();
