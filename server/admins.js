import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { dataFile, ensureDataDir, writeJson } from './data-dir.js';

const file = dataFile('admins.json');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export class AdminError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readRaw() {
  ensureDataDir();
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new AdminError('Admin list is broken', 500);
  return parsed;
}

function writeRaw(list) {
  writeJson(file, list);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (!salt.length || expected.length !== 32) return false;
  const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function publicAdmin(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role === 'owner' ? 'owner' : 'admin',
    active: row.active !== false,
  };
}

function seedOwner(list) {
  if (list.length) return list;
  const password = process.env.VENDOR_DESK_PASSWORD || 'change-me';
  const owner = {
    id: 'adm_owner',
    username: 'rajat',
    name: 'Rajat',
    passwordHash: hashPassword(password),
    role: 'owner',
    active: true,
    createdAt: new Date().toISOString(),
  };
  const next = [owner];
  writeRaw(next);
  return next;
}

export function readAdmins() {
  return seedOwner(readRaw());
}

export function listPublicAdmins() {
  return readAdmins()
    .map(publicAdmin)
    .sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.name.localeCompare(b.name));
}

export function findActiveAdmin(id) {
  const row = readAdmins().find((item) => item.id === id && item.active !== false);
  return publicAdmin(row);
}

export function verifyAdmin(username, password) {
  const user = String(username || '').trim().toLowerCase();
  const row = readAdmins().find((item) => item.username === user && item.active !== false);
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  return publicAdmin(row);
}

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function createAdmin({ username, name, password }) {
  const list = readAdmins();
  const user = cleanUsername(username);
  const display = cleanName(name);
  const pass = String(password || '');
  if (user.length < 3) throw new AdminError('Username kam se kam 3 letters');
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user)) throw new AdminError('Username letters, numbers, dot, ya underscore');
  if (list.some((item) => item.username === user)) throw new AdminError('Ye username already hai');
  if (display.length < 2) throw new AdminError('Display name likho');
  if (pass.length < 6 || pass.length > 80) throw new AdminError('Password 6 se 80 characters');
  const row = {
    id: `adm_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    username: user,
    name: display,
    passwordHash: hashPassword(pass),
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
  };
  list.push(row);
  writeRaw(list);
  return publicAdmin(row);
}

export function setAdminActive(id, active) {
  const list = readAdmins();
  const row = list.find((item) => item.id === id);
  if (!row) throw new AdminError('Member nahi mila', 404);
  if (row.role === 'owner') throw new AdminError('Owner ko disable nahi kar sakte');
  row.active = Boolean(active);
  row.updatedAt = new Date().toISOString();
  writeRaw(list);
  return publicAdmin(row);
}
