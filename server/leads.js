import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const leadsFile = path.join(dataDir, 'leads.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(leadsFile)) fs.writeFileSync(leadsFile, '[]\n', 'utf8');
}

export function readLeads() {
  ensureStore();
  try {
    const raw = fs.readFileSync(leadsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addLead(lead) {
  ensureStore();
  const list = readLeads();
  list.unshift(lead);
  fs.writeFileSync(leadsFile, JSON.stringify(list, null, 2) + '\n', 'utf8');
  return lead;
}

export function upsertQuotationLead(lead) {
  ensureStore();
  const quoteId = String(lead?.quoteId || '').trim();
  if (!quoteId) return null;
  const list = readLeads();
  const existing = list.find((row) => row.quoteId === quoteId);
  const now = new Date().toISOString();
  const row = {
    id: existing?.id || `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: existing?.createdAt || lead.createdAt || now,
    updatedAt: now,
    quoteId,
    name: lead.name || null,
    email: lead.email || null,
    whatsapp: String(lead.whatsapp || '').replace(/\D/g, '').slice(0, 15),
    location: lead.location || null,
    interest: Array.isArray(lead.interest) ? lead.interest.map((item) => String(item)).slice(0, 8) : [],
    message: String(lead.message || '').slice(0, 500),
    consent: true,
    source: 'quotation',
  };
  if (existing) {
    const index = list.findIndex((item) => item.quoteId === quoteId);
    list[index] = row;
  } else {
    list.unshift(row);
  }
  fs.writeFileSync(leadsFile, JSON.stringify(list, null, 2) + '\n', 'utf8');
  return row;
}
