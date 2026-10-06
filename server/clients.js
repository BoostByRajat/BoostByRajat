import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const file = path.join(dataDir, 'clients.json');

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n', 'utf8');
}

function readClients() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeClients(list) {
  ensureStore();
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function listClients() {
  return readClients().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function upsertClient(client) {
  const name = clean(client?.name, 120);
  if (name.length < 2) return null;
  const phone = String(client?.phone || '').replace(/\D/g, '').slice(0, 15);
  const email = clean(client?.email, 160).toLowerCase();
  const list = readClients();
  const existing = phone.length >= 10
    ? list.find((row) => row.phone === phone)
    : list.find((row) => !row.phone && String(row.name).toLowerCase() === name.toLowerCase());
  const row = {
    id: existing?.id || `cli_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    name,
    business: clean(client?.business, 160),
    phone,
    email,
    city: clean(client?.city, 120),
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    const index = list.findIndex((item) => item.id === existing.id);
    list[index] = row;
  } else {
    list.unshift(row);
  }
  writeClients(list);
  return row;
}
