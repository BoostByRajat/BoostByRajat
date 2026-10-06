import nodemailer from 'nodemailer';

export function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendInvoiceEmail({ to, subject, text, pdfBuffer, filename }) {
  if (!smtpReady()) {
    const err = new Error('SMTP not configured');
    err.code = 'NO_SMTP';
    throw err;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `BoostByRajat <${user}>`,
    to,
    replyTo: process.env.PUBLIC_EMAIL || user,
    subject,
    text,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
}
