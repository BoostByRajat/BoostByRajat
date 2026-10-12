import crypto from 'crypto';
import {
  computeTotals,
  deriveStatus,
  docKind,
  nextNumber,
  paymentsOf,
  plusDaysIso,
  round2,
  todayIso,
} from '../src/invoice-model.js';
import { dataFile, readJsonArray, writeJson } from './data-dir.js';

const file = dataFile('invoices.json');

export class InvoiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readInvoices() {
  return readJsonArray(file);
}

function writeInvoices(list) {
  writeJson(file, list);
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

function actor(user) {
  if (!user?.id) return null;
  return {
    id: String(user.id),
    name: cleanLine(user.name || user.username || 'Admin', 80),
    username: cleanLine(user.username, 32),
  };
}

function cleanPayments(raw, fallbackDate) {
  if (!Array.isArray(raw)) return null;
  return raw
    .slice(0, 40)
    .map((row) => ({
      amount: round2(row?.amount),
      date: isoDate(row?.date, fallbackDate),
      note: cleanLine(row?.note, 160),
    }))
    .filter((row) => row.amount > 0);
}

export function saveInvoice(input, user, opts = {}) {
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
  const discountMode = body.discountMode === 'percent' ? 'percent' : 'amount';
  const discountValue = Math.max(0, round2(body.discountValue));
  const date = isoDate(body.date, existing?.date || todayIso());
  const kind = existing
    ? docKind(existing)
    : body.kind === 'quote' || body.kind === 'demo'
      ? body.kind
      : 'invoice';

  let payments = cleanPayments(body.payments, date);
  if (!payments) {
    const legacy = round2(body.advance);
    payments = legacy > 0 ? [{ amount: legacy, date, note: 'Advance' }] : paymentsOf(existing || {});
  }
  if (kind === 'quote') payments = [];

  const draft = { items, gstEnabled, gstPercent, payments, discountMode, discountValue };
  const totals = computeTotals(draft);
  if (totals.discountOverflow) {
    throw new InvoiceError(discountMode === 'percent'
      ? 'Discount 100% se zyada nahi ho sakta'
      : 'Discount subtotal se zyada hai');
  }
  if (totals.advanceOverflow) throw new InvoiceError('Advance is more than the total');

  let number = cleanLine(body.number, 32);
  if (number && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$/.test(number)) {
    throw new InvoiceError('Invoice number looks wrong');
  }
  if (!number) {
    number = existing?.number || nextNumber(list.filter((inv) => inv.id !== existing?.id), kind);
  }
  const clash = list.find((inv) => inv.number === number && inv.id !== existing?.id);
  if (clash) throw new InvoiceError('This invoice number is already used');

  const status = deriveStatus(
    { kind, status: body.status || existing?.status || 'draft' },
    totals,
  );
  const now = new Date().toISOString();
  const invoice = {
    id: existing?.id || `inv_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    token: existing?.token || crypto.randomBytes(16).toString('hex'),
    kind,
    number,
    date,
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
    discountMode,
    discountValue,
    gstin: gstEnabled ? cleanLine(body.gstin, 20).toUpperCase() : '',
    payments,
    advance: totals.advance,
    upi: cleanLine(body.upi, 80),
    notes: cleanNote(body.notes, 2000),
    quoteId: existing?.quoteId || (opts.quoteId ? cleanLine(opts.quoteId, 80) : ''),
    convertedTo: existing?.convertedTo || '',
    createdBy: existing?.createdBy || actor(user),
    updatedBy: existing ? actor(user) : null,
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

export function convertQuote(id, user) {
  const quote = readInvoices().find((inv) => inv.id === id);
  if (!quote || docKind(quote) !== 'quote') throw new InvoiceError('Quotation nahi mili', 404);
  if (quote.convertedTo) {
    const existing = readInvoices().find((inv) => inv.id === quote.convertedTo);
    if (existing) return { quote, invoice: existing, already: true };
  }
  const invoice = saveInvoice({
    kind: 'invoice',
    date: todayIso(),
    dueDate: plusDaysIso(7),
    status: 'draft',
    client: quote.client,
    items: quote.items,
    deliverables: quote.deliverables,
    gstEnabled: quote.gstEnabled,
    gstPercent: quote.gstPercent,
    gstin: quote.gstin,
    discountMode: quote.discountMode,
    discountValue: quote.discountValue,
    payments: [],
    upi: quote.upi,
    notes: quote.notes,
  }, user, { quoteId: quote.id });
  const list = readInvoices();
  const savedQuote = list.find((inv) => inv.id === quote.id);
  if (savedQuote) {
    savedQuote.convertedTo = invoice.id;
    savedQuote.updatedAt = new Date().toISOString();
    if (user) savedQuote.updatedBy = actor(user);
    writeInvoices(list);
  }
  return { quote: savedQuote || quote, invoice, already: false };
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

export function markCleared(id, user) {
  const list = readInvoices();
  const inv = list.find((item) => item.id === id);
  if (!inv) throw new InvoiceError('Invoice not found', 404);
  if (docKind(inv) === 'quote') throw new InvoiceError('Quotation clear nahi hoti. Pehle invoice banao.');
  const totals = computeTotals(inv);
  const payments = paymentsOf(inv).map((row) => ({
    amount: row.amount,
    date: isoDate(row.date, inv.date || todayIso()),
    note: cleanLine(row.note, 160) || 'Payment',
  }));
  if (totals.pending > 0.009) {
    payments.push({
      amount: round2(Math.max(0, totals.pending)),
      date: todayIso(),
      note: 'Clear',
    });
  }
  inv.payments = payments;
  inv.advance = round2(payments.reduce((sum, row) => sum + row.amount, 0));
  inv.status = 'paid';
  if (user) inv.updatedBy = actor(user);
  inv.updatedAt = new Date().toISOString();
  writeInvoices(list);
  return inv;
}

export function recordSend(id, channel, user) {
  const list = readInvoices();
  const inv = list.find((item) => item.id === id);
  if (!inv) throw new InvoiceError('Invoice not found', 404);
  inv.sends = Array.isArray(inv.sends) ? inv.sends : [];
  inv.sends.push({ channel, at: new Date().toISOString() });
  if (inv.status === 'draft') {
    if (docKind(inv) === 'quote') inv.status = 'sent';
    else {
      const totals = computeTotals(inv);
      inv.status = totals.pending <= 0 ? 'paid' : 'sent';
    }
  }
  if (user) inv.updatedBy = actor(user);
  inv.updatedAt = new Date().toISOString();
  writeInvoices(list);
  return inv;
}
