export const DEFAULT_NOTE =
  'Advance starts the work. Pending amount is due before final delivery. Domain, hosting, app-store fees, and ad spend are extra unless written above.';

export const PRESETS = [
  {
    id: 'website',
    label: 'Website',
    items: [{ description: 'Business website — design and build', qty: 1, rate: 18000 }],
    deliverables: [
      'Multi-page business website',
      'Mobile-first layout',
      'WhatsApp enquiry button',
      'Basic on-page SEO',
      'Handover after your approval',
    ],
  },
  {
    id: 'app',
    label: 'App',
    items: [{ description: 'Custom app — design and build', qty: 1, rate: 35000 }],
    deliverables: [
      'App screens agreed in the scope',
      'Working build for your review',
      'One bug-fix round after the first review',
      'Handover notes',
    ],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    items: [{ description: 'Instagram handling — 1 month', qty: 1, rate: 7999 }],
    deliverables: [
      'Content plan for the month',
      'Posts and captions',
      'Profile polish from the photos and text you send',
      'Short monthly summary',
    ],
  },
  {
    id: 'ads',
    label: 'Ads',
    items: [{ description: 'Ads management — 1 month', qty: 1, rate: 8000 }],
    deliverables: [
      'Campaign setup in your ad account',
      'Ad copy and creative direction',
      'Monitoring and basic optimisation',
      'Monthly result summary',
      'Ad spend is paid by you, separate from this fee',
    ],
  },
];

export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export function lineAmount(item) {
  return round2((Number(item?.qty) || 0) * (Number(item?.rate) || 0));
}

export function computeTotals(inv) {
  const items = Array.isArray(inv?.items) ? inv.items : [];
  const subtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0));
  const gstEnabled = Boolean(inv?.gstEnabled);
  const gstPercent = gstEnabled ? Math.min(100, Math.max(0, Number(inv?.gstPercent) || 0)) : 0;
  const gstAmount = round2((subtotal * gstPercent) / 100);
  const total = round2(subtotal + gstAmount);
  const advance = round2(Number(inv?.advance) || 0);
  const pending = round2(total - advance);
  return {
    subtotal,
    gstEnabled,
    gstPercent,
    gstAmount,
    total,
    advance,
    pending,
    advanceOverflow: advance - total > 0.009,
  };
}

export function formatInr(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(n));
}

export function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function todayIso() {
  const d = new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function plusDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return d ? `+${d}` : '';
}

export function waNumber(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return '';
}

export function nextNumber(list) {
  let max = 0;
  for (const inv of list || []) {
    const match = String(inv.number || '').match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `BBR-${String(max + 1).padStart(3, '0')}`;
}

export function pdfFileName(number) {
  const safe = String(number || 'invoice').replace(/[^\w.-]+/g, '-');
  return `BoostByRajat-${safe}.pdf`;
}

export function messageText(inv, link, vendor) {
  const totals = computeTotals(inv);
  const name = inv.client?.name || 'there';
  const items = (inv.items || []).filter((item) => item.description);
  const deliverables = (inv.deliverables || []).map((line) => String(line || '').trim()).filter(Boolean);
  const lines = [
    `Namaste ${name},`,
    '',
    `BoostByRajat invoice ${inv.number || ''}`.trim(),
    '',
    'Kaam:',
    ...items.map((item) => `• ${item.description} — ${formatInr(lineAmount(item))}`),
    '',
    'Aapko yeh milega:',
    ...(deliverables.length ? deliverables.map((line) => `• ${line}`) : ['• Details invoice mein hain']),
    '',
    `Total: ${formatInr(totals.total)}`,
    `Advance: ${formatInr(totals.advance)}`,
    `Pending: ${formatInr(totals.pending)}`,
  ];
  if (inv.upi) lines.push('', `UPI: ${inv.upi}`);
  if (link) lines.push('', `Invoice / PDF: ${link}`);
  lines.push('', 'BoostByRajat');
  if (vendor?.email) lines.push(vendor.email);
  if (vendor?.whatsapp) lines.push(formatPhone(vendor.whatsapp));
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > 1500) {
    text = [
      `Namaste ${name},`,
      `BoostByRajat invoice ${inv.number || ''}`.trim(),
      `Total ${formatInr(totals.total)} · Advance ${formatInr(totals.advance)} · Pending ${formatInr(totals.pending)}`,
      link ? `Invoice / PDF: ${link}` : '',
      inv.upi ? `UPI: ${inv.upi}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return text;
}

export function orderConfirmationText(inv, link) {
  const totals = computeTotals(inv);
  const name = inv.client?.name || 'there';
  const items = (inv.items || []).filter((item) => String(item.description || '').trim());
  const deliverables = (inv.deliverables || []).map((line) => String(line || '').trim()).filter(Boolean);
  const lines = [
    '*Order confirmed — BoostByRajat*',
    '',
    `Namaste ${name},`,
    'Aapka order confirm ho gaya hai.',
    `Invoice: *${inv.number || '-'}*`,
    '',
    '*Kaam:*',
    ...items.map((item) => `• ${item.description} — ${formatInr(lineAmount(item))}`),
    '',
    '*Aapko yeh milega:*',
    ...(deliverables.length ? deliverables.map((line) => `• ${line}`) : ['• Invoice mein likha hai']),
    '',
    `Total: *${formatInr(totals.total)}*`,
    `Advance: *${formatInr(totals.advance)}*`,
    `Pending: *${formatInr(totals.pending)}*`,
  ];
  if (inv.upi) lines.push(`UPI: ${inv.upi}`);
  if (link) lines.push('', `Invoice: ${link}`);
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > 1000) {
    text = [
      '*Order confirmed — BoostByRajat*',
      `Namaste ${name}, aapka order confirm ho gaya hai.`,
      `Invoice *${inv.number || '-'}*`,
      `Total ${formatInr(totals.total)} · Advance ${formatInr(totals.advance)} · Pending ${formatInr(totals.pending)}`,
      link ? `Invoice: ${link}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return text;
}

export function monthKey(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).slice(0, 7) : '';
}

export function shiftMonth(key, delta) {
  const [y, m] = String(key || '').split('-').map(Number);
  const base = Number.isFinite(y) && Number.isFinite(m) ? new Date(y, m - 1, 1) : new Date();
  base.setMonth(base.getMonth() + delta);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function accountSummary(invoices, month) {
  const list = Array.isArray(invoices) ? invoices : [];
  const inMonth = list.filter((inv) => monthKey(inv.date) === month);
  const days = new Map();
  let earning = 0;
  let pending = 0;
  let billed = 0;
  for (const inv of inMonth) {
    const totals = computeTotals(inv);
    const received = Math.max(0, totals.advance);
    const due = Math.max(0, totals.pending);
    earning += received;
    pending += due;
    billed += totals.total;
    const bucket = days.get(inv.date) || { date: inv.date, earning: 0, pending: 0, bills: 0 };
    bucket.earning += received;
    bucket.pending += due;
    bucket.bills += 1;
    days.set(inv.date, bucket);
  }
  const allPending = list.reduce((sum, inv) => sum + Math.max(0, computeTotals(inv).pending), 0);
  return {
    month,
    bills: inMonth.length,
    earning: round2(earning),
    pending: round2(pending),
    billed: round2(billed),
    allPending: round2(allPending),
    days: [...days.values()]
      .map((day) => ({ ...day, earning: round2(day.earning), pending: round2(day.pending) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

export function dueNoticeText(inv, link) {
  const totals = computeTotals(inv);
  const name = inv.client?.name || 'there';
  const lines = [
    '*Payment due — BoostByRajat*',
    '',
    `Namaste ${name},`,
    `Invoice *${inv.number || '-'}* ka pending amount due hai.`,
    '',
    `Total: *${formatInr(totals.total)}*`,
    `Advance mila: *${formatInr(totals.advance)}*`,
    `Pending: *${formatInr(Math.max(0, totals.pending))}*`,
  ];
  if (inv.dueDate) lines.push(`Due date: ${formatDate(inv.dueDate)}`);
  if (inv.upi) lines.push(`UPI: ${inv.upi}`);
  if (link) lines.push('', `Invoice: ${link}`);
  lines.push('', 'Kripya pending amount clear kar den.');
  return lines.join('\n');
}

export function clearNoticeText(inv, link) {
  const totals = computeTotals(inv);
  const name = inv.client?.name || 'there';
  const lines = [
    '*Hisaab clear — BoostByRajat*',
    '',
    `Namaste ${name},`,
    `Invoice *${inv.number || '-'}* ka payment clear ho gaya hai.`,
    `Total received: *${formatInr(totals.total)}*`,
    'Pending: *₹0*',
  ];
  if (link) lines.push('', `Invoice: ${link}`);
  lines.push('', 'Dhanyavaad.', 'BoostByRajat');
  return lines.join('\n');
}

export function emailSubject(inv) {
  const totals = computeTotals(inv);
  const pending =
    totals.pending <= 0 ? 'paid' : `${formatInr(totals.pending)} pending`;
  return `BoostByRajat invoice ${inv.number || ''} — ${pending}`;
}
