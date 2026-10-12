import QRCode from 'qrcode';
import { site } from './config.js';
import { fitSheet, paintSheet } from './invoice-doc.js';
import { docKind, formatInr, payChoices, pdfFileName, round2, upiPayUrl, waNumber } from './invoice-model.js';
import { downloadFile, elementToPdfFile, sharePdfFile } from './invoice-pdf.js';

const params = new URLSearchParams(location.search);
const token = params.get('t') || '';
const status = document.getElementById('viewStatus');
const sheet = document.getElementById('sheet');
const zoom = document.getElementById('sheetZoom');

function say(text) {
  status.hidden = !text;
  status.textContent = text || '';
}

async function load() {
  if (!/^[a-f0-9]{32}$/.test(token)) {
    say('Ye invoice link galat hai.');
    return;
  }
  say('Invoice khul rahi hai…');
  try {
    const res = await fetch(`/api/invoices/public/${token}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invoice nahi mili');
    const inv = data.invoice;
    const kind = docKind(inv);
    paintSheet(sheet, inv);
    zoom.hidden = false;
    fitSheet(zoom, sheet);
    const label = kind === 'quote' ? 'Quotation' : kind === 'demo' ? 'Demo' : 'Invoice';
    document.title = `${label} ${inv.number} — BoostByRajat`;
    const note = document.getElementById('docNote');
    if (kind === 'quote') {
      note.hidden = false;
      note.textContent = 'Yeh estimate hai, invoice nahi.';
    } else if (kind === 'demo') {
      note.hidden = false;
      note.textContent = 'Yeh demo bill hai. Asli charge nahi.';
    }
    setupPay(inv);
    say('');
    async function buildFile() {
      return elementToPdfFile(sheet, pdfFileName(inv.number));
    }
    document.getElementById('pdfBtn').onclick = async () => {
      say('PDF ban rahi hai…');
      try {
        downloadFile(await buildFile());
        say('PDF download ho gayi.');
      } catch (err) {
        say(err.message || 'PDF fail');
      }
    };
    document.getElementById('shareBtn').onclick = async () => {
      say('PDF ban rahi hai…');
      try {
        const file = await buildFile();
        const text = `${label} ${inv.number} — BoostByRajat\n${location.href}`;
        const shared = await sharePdfFile(file, { title: file.name, text });
        if (shared === 'shared') say('Share sheet khul gayi. WhatsApp ya email choose karo.');
        else if (shared === 'cancel') say('Share cancel ho gaya.');
        else say('PDF download ho gayi. WhatsApp ya email mein attach karke bhej do.');
      } catch (err) {
        say(err.message || 'Share fail');
      }
    };
    const wa = document.getElementById('waBtn');
    const vendor = waNumber(site.whatsapp);
    const text = `Hi BoostByRajat, I opened ${label.toLowerCase()} ${inv.number}.\n${location.href}`;
    wa.href = `https://wa.me/${vendor}?text=${encodeURIComponent(text)}`;
    window.addEventListener('resize', () => fitSheet(zoom, sheet));
  } catch (err) {
    say(err.message || 'Invoice nahi mili');
  }
}

export function setupPay(inv) {
  const choices = payChoices(inv);
  const box = document.getElementById('payBox');
  const jump = document.getElementById('payJump');
  if (!choices) {
    box.hidden = true;
    jump.hidden = true;
    return;
  }
  box.hidden = false;
  jump.hidden = false;
  jump.onclick = () => box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('payLead').textContent =
    `Pending ${formatInr(choices.pending)}. 25%, 50%, ya full choose karo. Amount yahan change bhi kar sakte ho.`;
  document.getElementById('payUpi').textContent = `UPI: ${choices.upi}`;
  const picks = document.getElementById('payPicks');
  const input = document.getElementById('payAmount');
  const hint = document.getElementById('payHint');
  const canvas = document.getElementById('payQr');
  const payBtn = document.getElementById('payBtn');
  input.max = String(choices.pending);
  input.value = '';
  input.placeholder = 'Amount';
  picks.replaceChildren();
  let qrToken = 0;

  function paintAmount(amount, note) {
    const am = round2(amount);
    const url = upiPayUrl(inv, am, note);
    const token = ++qrToken;
    if (!url) {
      canvas.hidden = true;
      payBtn.hidden = true;
      hint.textContent = am > choices.pending
        ? `Pending ${formatInr(choices.pending)} tak pay kar sakte ho.`
        : 'Pehle 25%, 50%, ya full choose karo.';
      return;
    }
    hint.textContent = `QR aur Pay ${formatInr(am)} par set hain. UPI app mein yehi amount bharega.`;
    payBtn.hidden = false;
    payBtn.href = url;
    payBtn.textContent = `Pay ${formatInr(am)}`;
    canvas.hidden = false;
    QRCode.toCanvas(canvas, url, { width: 220, margin: 1, color: { dark: '#172033', light: '#ffffff' } }).catch(() => {
      if (token !== qrToken) return;
      canvas.hidden = true;
      hint.textContent = 'QR nahi bana. Pay button se UPI khol sakte ho.';
    });
  }

  for (const part of choices.parts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = `${part.label} · ${formatInr(part.amount)}`;
    btn.addEventListener('click', () => {
      for (const el of picks.querySelectorAll('button')) el.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-pressed', 'true');
      input.value = part.amount.toFixed(2);
      const note = `${inv.number || 'BoostByRajat'} ${part.label}`.slice(0, 50);
      paintAmount(part.amount, note);
    });
    picks.appendChild(btn);
  }
  input.addEventListener('input', () => {
    for (const el of picks.querySelectorAll('button')) {
      const same = round2(el.dataset.amount) === round2(input.value);
      el.setAttribute('aria-pressed', same ? 'true' : 'false');
    }
    paintAmount(input.value, inv.number);
  });
  for (const [index, part] of choices.parts.entries()) {
    picks.children[index].dataset.amount = String(part.amount);
  }
  paintAmount(0);
}

load();
