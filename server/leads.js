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
