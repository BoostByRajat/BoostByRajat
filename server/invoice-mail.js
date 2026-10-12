import nodemailer from 'nodemailer';

function clean(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function smtpPass() {
  return clean(process.env.SMTP_PASS).replace(/\s+/g, '');
}

function smtpUser() {
  return clean(process.env.SMTP_USER || process.env.PUBLIC_EMAIL);
}

let logged = false;

function relayReady() {
  return Boolean(clean(process.env.GMAIL_RELAY_URL) && clean(process.env.GMAIL_RELAY_SECRET));
}

export function smtpReady() {
  const user = smtpUser();
  const ready = relayReady() || Boolean(smtpPass() && user);
  if (!logged) {
    logged = true;
    console.log(ready
      ? (relayReady() ? `Gmail relay ready for ${user || 'rajatbissa16@gmail.com'}` : `Gmail SMTP ready for ${user}`)
      : 'Gmail SMTP missing SMTP_PASS');
  }
  return ready;
}

function mailTimeout(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  return code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ETIMEDOUT'
    || /timeout|timed out|ECONNECTION|Greeting never/i.test(message);
}

function transporterFor(port) {
  return nodemailer.createTransport({
    host: clean(process.env.SMTP_HOST) || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: smtpUser(), pass: smtpPass() },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

async function postAppsScript(url, body) {
  const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  const first = await fetch(url, {
    method: 'POST',
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if (first.status >= 300 && first.status < 400) {
    const loc = first.headers.get('location');
    if (!loc) return first;
    return fetch(new URL(loc, url), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
  }
  return first;
}

async function sendViaRelay({ to, subject, text, html, pdfBuffer, filename }) {
  const body = JSON.stringify({
    secret: clean(process.env.GMAIL_RELAY_SECRET),
    to,
    subject,
    text,
    html,
    filename,
    pdfBase64: pdfBuffer.toString('base64'),
    replyTo: clean(process.env.PUBLIC_EMAIL) || smtpUser() || 'rajatbissa16@gmail.com',
  });
  const res = await postAppsScript(clean(process.env.GMAIL_RELAY_URL), body);
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (data.ok === true) return;
  console.error('gmail relay', res.status, raw.slice(0, 240));
  const err = new Error(data.error || 'Gmail se mail nahi gayi.');
  err.code = 'RELAY';
  throw err;
}

export async function sendInvoiceEmail({ to, subject, text, html, pdfBuffer, filename }) {
  if (relayReady()) {
    await sendViaRelay({ to, subject, text, html, pdfBuffer, filename });
    return;
  }
  if (!smtpReady()) {
    const err = new Error('SMTP not configured');
    err.code = 'NO_SMTP';
    throw err;
  }
  const preferred = Number(process.env.SMTP_PORT || 587);
  const ports = [...new Set([preferred, 465, 587])];
  const message = {
    from: clean(process.env.SMTP_FROM) || `BoostByRajat <${smtpUser()}>`,
    to,
    replyTo: clean(process.env.PUBLIC_EMAIL) || smtpUser(),
    subject,
    text,
    html: html || undefined,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };
  let last;
  for (const port of ports) {
    const transporter = transporterFor(port);
    try {
      await transporter.sendMail(message);
      return;
    } catch (err) {
      last = err;
      transporter.close();
      if (!mailTimeout(err)) break;
      console.error('gmail timeout', port, err.message);
    }
  }
  if (mailTimeout(last)) {
    const err = new Error('Gmail connection timeout. Mail nahi gayi.');
    err.code = 'SMTP_TIMEOUT';
    throw err;
  }
  throw last;
}
