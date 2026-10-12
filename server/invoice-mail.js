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

export async function sendInvoiceEmail({ to, subject, text, html, pdfBuffer, filename }) {
  if (!smtpReady()) {
    const err = new Error('SMTP not configured');
    err.code = 'NO_SMTP';
    throw err;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const user = smtpUser();
  const transporter = nodemailer.createTransport({
    host: clean(process.env.SMTP_HOST) || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass: smtpPass() },
  });
  await transporter.sendMail({
    from: clean(process.env.SMTP_FROM) || `BoostByRajat <${user}>`,
    to,
    replyTo: clean(process.env.PUBLIC_EMAIL) || user,
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
  });
}
