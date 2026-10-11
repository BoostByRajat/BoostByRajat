import { computeTotals, docKind, formatInr, orderConfirmationText, waNumber } from '../src/invoice-model.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

function token() {
  return String(process.env.WHATSAPP_TOKEN || '').trim();
}

function phoneNumberId() {
  return String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
}

export function waApiReady() {
  return Boolean(token() && phoneNumberId());
}

export function waSnapshot() {
  const template = String(process.env.WHATSAPP_TEMPLATE || '').trim();
  const ready = waApiReady();
  return {
    status: ready ? 'open' : 'off',
    ready,
    document: !template || process.env.WHATSAPP_TEMPLATE_DOCUMENT === '1',
    quoteTemplate: Boolean(String(process.env.WHATSAPP_QUOTE_TEMPLATE || '').trim()),
    quoteDocument: process.env.WHATSAPP_QUOTE_TEMPLATE_DOCUMENT === '1',
    error: ready
      ? ''
      : 'WhatsApp API panel Meta approval ke baad chalega. Number link karne ki zarurat nahi.',
  };
}

function param(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return text || '-';
}

async function graph(path, options = {}) {
  const headers = { Authorization: `Bearer ${token()}` };
  if (options.headers) Object.assign(headers, options.headers);
  const res = await fetch(`${GRAPH}/${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.error?.error_user_msg || data?.error?.message || 'WhatsApp API ne message reject kar diya';
    const err = new Error(detail);
    err.code = 'WA_API';
    throw err;
  }
  return data;
}

async function uploadPdf(buffer, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), filename || 'invoice.pdf');
  const data = await graph(`${phoneNumberId()}/media`, { method: 'POST', body: form });
  if (!data.id) {
    const err = new Error('WhatsApp API ne PDF accept nahi ki');
    err.code = 'WA_API';
    throw err;
  }
  return data.id;
}

async function sendTemplate({ to, invoice, link, mediaId, filename, templateName }) {
  const totals = computeTotals(invoice);
  const name = String(templateName || process.env.WHATSAPP_TEMPLATE || '').trim();
  const components = [];
  if (mediaId) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: { id: mediaId, filename: filename || 'invoice.pdf' },
        },
      ],
    });
  }
  components.push({
    type: 'body',
    parameters: [
      { type: 'text', text: param(invoice.client?.name) },
      { type: 'text', text: param(invoice.number) },
      { type: 'text', text: param(formatInr(totals.total)) },
      { type: 'text', text: param(formatInr(totals.advance)) },
      { type: 'text', text: param(formatInr(totals.pending)) },
      { type: 'text', text: param(link) },
    ],
  });
  await graph(`${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name,
        language: { code: String(process.env.WHATSAPP_TEMPLATE_LANG || 'en').trim() || 'en' },
        components,
      },
    }),
  });
}

export async function sendNoticeOnWhatsApp({ phone, text }) {
  if (!waApiReady()) {
    const err = new Error(
      'WhatsApp API abhi connected nahi hai. BBR Send panel Meta approval ke baad message bhejega. Number link karne ki zarurat nahi.',
    );
    err.code = 'WA_OFFLINE';
    throw err;
  }
  const to = waNumber(phone);
  if (!to) {
    const err = new Error('Client ka WhatsApp number likho');
    err.code = 'WA_PHONE';
    throw err;
  }
  await graph(`${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: String(text || '').slice(0, 4000) },
    }),
  });
}

export async function sendOrderOnWhatsApp({ phone, text, pdfBuffer, filename, invoice, link }) {
  if (!waApiReady()) {
    const err = new Error(
      'WhatsApp API abhi connected nahi hai. BBR Send panel Meta approval ke baad message bhejega. Number link karne ki zarurat nahi.',
    );
    err.code = 'WA_OFFLINE';
    throw err;
  }
  const to = waNumber(phone);
  if (!to) {
    const err = new Error('Client ka WhatsApp number likho');
    err.code = 'WA_PHONE';
    throw err;
  }
  const quote = docKind(invoice) === 'quote';
  const template = quote
    ? String(process.env.WHATSAPP_QUOTE_TEMPLATE || '').trim()
    : String(process.env.WHATSAPP_TEMPLATE || '').trim();
  const wantDocument = quote
    ? process.env.WHATSAPP_QUOTE_TEMPLATE_DOCUMENT === '1'
    : (!template || process.env.WHATSAPP_TEMPLATE_DOCUMENT === '1');
  let mediaId = '';
  if (wantDocument && pdfBuffer && pdfBuffer.length > 100) {
    mediaId = await uploadPdf(pdfBuffer, filename);
  }
  if (template) {
    await sendTemplate({ to, invoice, link, mediaId, filename, templateName: template });
    return;
  }
  if (mediaId) {
    await graph(`${phoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          id: mediaId,
          filename: filename || 'invoice.pdf',
          caption: String(text || orderConfirmationText(invoice, link)).slice(0, 1020),
        },
      }),
    });
    return;
  }
  await graph(`${phoneNumberId()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body: String(text || orderConfirmationText(invoice, link)).slice(0, 4000) },
    }),
  });
}
