import { dataFile, readJsonArray, writeJson } from './data-dir.js';

const leadsFile = dataFile('leads.json');

export function readLeads() {
  return readJsonArray(leadsFile);
}

export function addLead(lead) {
  const list = readLeads();
  list.unshift(lead);
  writeJson(leadsFile, list);
  return lead;
}

export function upsertQuotationLead(lead) {
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
  writeJson(leadsFile, list);
  return row;
}
