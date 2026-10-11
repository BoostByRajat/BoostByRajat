import crypto from 'crypto';
import { findActiveAdmin, verifyAdmin } from './admins.js';

const COOKIE = 'bbr_session';
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  return process.env.SESSION_SECRET || process.env.VENDOR_DESK_PASSWORD || 'change-me';
}

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    exp: Date.now() + MAX_AGE * 1000,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  const text = String(token || '');
  const dot = text.indexOf('.');
  if (dot <= 0) return null;
  const payload = text.slice(0, dot);
  const sig = text.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.id || !data.exp || Number(data.exp) < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function cookieHeader(token, secure, maxAge) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token || '')}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function requestIsSecure(req, isProd) {
  if (isProd) return true;
  const proto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.secure);
}

export function setSessionCookie(res, user, secure) {
  res.setHeader('Set-Cookie', cookieHeader(signSession(user), secure, MAX_AGE));
}

export function clearSessionCookie(res, secure) {
  res.setHeader('Set-Cookie', cookieHeader('', secure, 0));
}

export function userFromRequest(req) {
  const data = verifySession(readCookie(req, COOKIE));
  if (!data) return null;
  return findActiveAdmin(data.id);
}

export function loginWithPassword(username, password) {
  return verifyAdmin(username, password);
}
