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

export function smtpReady() {
  const user = smtpUser();
  const ready = Boolean(smtpPass() && user);
  if (!logged) {
    logged = true;
    console.log(ready ? `Gmail SMTP ready for ${user}` : 'Gmail SMTP missing SMTP_PASS');
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

export async function sendInvoiceEmail({ to, subject, text, html, pdfBuffer, filename }) {
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
