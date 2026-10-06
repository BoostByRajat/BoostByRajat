import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeTotals, nextNumber, round2 } from '../src/invoice-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'invoices.json');

const STATUSES = new Set(['draft', 'sent', 'partial', 'paid']);

export class InvoiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n', 'utf8');
}

export function readInvoices() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeInvoices(list) {
  ensureStore();
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

function cleanLine(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanNote(value, max) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function isoDate(value, fallback) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function saveInvoice(input) {
  const list = readInvoices();
  const body = input || {};
  const existing = body.id ? list.find((inv) => inv.id === body.id) : null;
  if (body.id && !existing) throw new InvoiceError('Invoice not found', 404);

  const client = body.client || {};
  const name = cleanLine(client.name, 120);
  if (name.length < 2) throw new InvoiceError('Client name is required');

  const email = cleanLine(client.email, 160).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvoiceError('Client email looks wrong');
  }

  const phone = String(client.phone || '').replace(/\D/g, '').slice(0, 15);
  if (phone && phone.length < 10) throw new InvoiceError('WhatsApp number looks short');

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, 25) : [];
  const items = rawItems
    .map((item) => ({
      description: cleanLine(item?.description, 240),
      qty: round2(item?.qty),
      rate: round2(item?.rate),
    }))
    .filter((item) => item.description);

  if (!items.length) throw new InvoiceError('Add at least one line with a description');
  if (items.some((item) => item.qty <= 0)) throw new InvoiceError('Quantity must be more than 0');
  if (items.some((item) => item.rate < 0 || item.rate > 100000000)) {
    throw new InvoiceError('Rate looks wrong');
  }

  const deliverables = (Array.isArray(body.deliverables) ? body.deliverables : [])
    .slice(0, 30)
    .map((line) => cleanLine(line, 240))
    .filter(Boolean);

  const gstEnabled = Boolean(body.gstEnabled);
  const gstPercent = gstEnabled ? Math.min(100, Math.max(0, round2(body.gstPercent))) : 0;
  const advance = round2(body.advance);
  if (advance < 0) throw new InvoiceError('Advance cannot be negative');

  const draft = { items, gstEnabled, gstPercent, advance };
  const totals = computeTotals(draft);
  if (totals.advanceOverflow) throw new InvoiceError('Advance is more than the total');

  let number = cleanLine(body.number, 32);
  if (number && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/.test(number)) {
    throw new InvoiceError('Invoice number looks wrong');
  }
  if (!number) number = existing?.number || nextNumber(list.filter((inv) => inv.id !== existing?.id));
  const clash = list.find((inv) => inv.number === number && inv.id !== existing?.id);
  if (clash) throw new InvoiceError('This invoice number is already used');

  const status = STATUSES.has(body.status) ? body.status : existing?.status || 'draft';
  const now = new Date().toISOString();
  const invoice = {
    id: existing?.id || `inv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    token: existing?.token || crypto.randomBytes(16).toString('hex'),
    number,
    date: isoDate(body.date, existing?.date || today()),
    dueDate: isoDate(body.dueDate, ''),
    status,
    client: {
      name,
      business: cleanLine(client.business, 160),
      phone,
      email,
      city: cleanLine(client.city, 120),
    },
    items,
    deliverables,
    gstEnabled,
    gstPercent,
    gstin: gstEnabled ? cleanLine(body.gstin, 20).toUpperCase() : '',
    advance,
    upi: cleanLine(body.upi, 80),
    notes: cleanNote(body.notes, 2000),
    sends: Array.isArray(existing?.sends) ? existing.sends : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existing) {
    const index = list.findIndex((inv) => inv.id === existing.id);
    list[index] = invoice;
  } else {
    list.unshift(invoice);
  }
  writeInvoices(list);
  return invoice;
}

export function deleteInvoice(id) {
  const list = readInvoices();
  const next = list.filter((inv) => inv.id !== id);
  if (next.length === list.length) throw new InvoiceError('Invoice not found', 404);
  writeInvoices(next);
}

export function findByToken(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  return readInvoices().find((inv) => inv.token === token) || null;
}

export function findById(id) {
  return readInvoices().find((inv) => inv.id === id) || null;
}

export function markCleared(id) {
  const list = readInvoices();
  const inv = list.find((item) => item.id === id);
  if (!inv) throw new InvoiceError('Invoice not found', 404);
  const totals = computeTotals(inv);
  if (totals.pending > 0) inv.advance = totals.total;
  inv.status = 'paid';
  inv.updatedAt = new Date().toISOString();
  writeInvoices(list);
  return inv;
}

export function recordSend(id, channel) {
  const list = readInvoices();
  const inv = list.find((item) => item.id === id);
  if (!inv) throw new InvoiceError('Invoice not found', 404);
  inv.sends = Array.isArray(inv.sends) ? inv.sends : [];
  inv.sends.push({ channel, at: new Date().toISOString() });
  if (inv.status === 'draft') {
    const totals = computeTotals(inv);
    inv.status = totals.pending <= 0 ? 'paid' : 'sent';
  }
  inv.updatedAt = new Date().toISOString();
  writeInvoices(list);
  return inv;
}
