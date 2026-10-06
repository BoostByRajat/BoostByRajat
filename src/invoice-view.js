import { site } from './config.js';
import { fitSheet, paintSheet } from './invoice-doc.js';
import { pdfFileName, waNumber } from './invoice-model.js';
import { downloadFile, elementToPdfFile } from './invoice-pdf.js';

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
    paintSheet(sheet, inv);
    zoom.hidden = false;
    fitSheet(zoom, sheet);
    document.title = `Invoice ${inv.number} — BoostByRajat`;
    say('');
    document.getElementById('pdfBtn').onclick = async () => {
      say('PDF ban rahi hai…');
      try {
        const file = await elementToPdfFile(sheet, pdfFileName(inv.number));
        downloadFile(file);
        say('PDF download ho gayi.');
      } catch (err) {
        say(err.message || 'PDF fail');
      }
    };
    const wa = document.getElementById('waBtn');
    const vendor = waNumber(site.whatsapp);
    const text = `Hi BoostByRajat, I opened invoice ${inv.number}.\n${location.href}`;
    wa.href = `https://wa.me/${vendor}?text=${encodeURIComponent(text)}`;
    window.addEventListener('resize', () => fitSheet(zoom, sheet));
  } catch (err) {
    say(err.message || 'Invoice nahi mili');
  }
}

load();
