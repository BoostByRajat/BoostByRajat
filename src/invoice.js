import { site } from './config.js';
import { fitSheet, paintSheet } from './invoice-doc.js';
import {
  DEFAULT_NOTE,
  PRESETS,
  accountSummary,
  computeTotals,
  emailSubject,
  formatDate,
  formatInr,
  messageText,
  monthKey,
  monthLabel,
  pdfFileName,
  plusDaysIso,
  shiftMonth,
  todayIso,
  waNumber,
} from './invoice-model.js';
import { downloadFile, elementToPdfFile, fileToBase64 } from './invoice-pdf.js';

const $ = (id) => document.getElementById(id);

let currentId = null;
let items = [{ description: '', qty: 1, rate: 0 }];
let deliverables = [''];
let busy = false;
let allInvoices = [];
let allClients = [];
let viewMonth = todayIso().slice(0, 7);
let historyAll = false;

function password() {
  return $('password').value;
}

function setStatus(text) {
  const el = $('invStatus');
  el.hidden = !text;
  el.textContent = text || '';
}

function vendor() {
  return { whatsapp: site.whatsapp, email: site.email };
}

function collect() {
  return {
    id: currentId,
    number: $('number').value.trim(),
    date: $('date').value,
    dueDate: $('due').value,
    status: $('status').value,
    client: {
      name: $('clientName').value.trim(),
      business: $('business').value.trim(),
      phone: $('phone').value.trim(),
      email: $('email').value.trim(),
      city: $('city').value.trim(),
    },
    items: items.map((item) => ({
      description: item.description.trim(),
      qty: Number(item.qty) || 0,
      rate: Number(item.rate) || 0,
    })),
    deliverables: deliverables.map((line) => line.trim()).filter(Boolean),
    gstEnabled: $('gstOn').checked,
    gstPercent: Number($('gstPercent').value) || 0,
    gstin: $('gstin').value.trim(),
    advance: Number($('advance').value) || 0,
    upi: $('upi').value.trim(),
    notes: $('notes').value.trim(),
  };
}

function validate(payload) {
  if (!password()) throw new Error('Pehle login karo');
  if (payload.client.name.length < 2) throw new Error('Client ka naam likho');
  const filled = payload.items.filter((item) => item.description);
  if (!filled.length) throw new Error('Kam se kam ek kaam aur rate likho');
  if (filled.some((item) => item.qty <= 0)) throw new Error('Quantity 0 se zyada honi chahiye');
  const totals = computeTotals(payload);
  if (totals.advanceOverflow) throw new Error('Advance total se zyada hai');
  return totals;
}

function renderItems() {
  const root = $('items');
  root.innerHTML = '';
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const desc = field('text', item.description, 'Kaam / service');
    desc.classList.add('desc');
    const qty = field('number', item.qty, 'Qty');
    qty.min = '0';
    qty.step = '1';
    const rate = field('number', item.rate, 'Rate');
    rate.min = '0';
    rate.step = '0.01';
    const amt = document.createElement('span');
    amt.className = 'line-amt';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Line hatao');
    desc.addEventListener('input', () => {
      items[index].description = desc.value;
      refresh();
    });
    qty.addEventListener('input', () => {
      items[index].qty = qty.value;
      refresh();
    });
    rate.addEventListener('input', () => {
      items[index].rate = rate.value;
      refresh();
    });
    remove.addEventListener('click', () => {
      items.splice(index, 1);
      if (!items.length) items.push({ description: '', qty: 1, rate: 0 });
      renderItems();
      refresh();
    });
    row.append(desc, qty, rate, amt, remove);
    root.appendChild(row);
  });
}

function renderDeliverables() {
  const root = $('deliverables');
  root.innerHTML = '';
  deliverables.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'del-row';
    const input = field('text', line, 'Client ko kya milega');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Line hatao');
    input.addEventListener('input', () => {
      deliverables[index] = input.value;
      refresh();
    });
    remove.addEventListener('click', () => {
      deliverables.splice(index, 1);
      if (!deliverables.length) deliverables.push('');
      renderDeliverables();
      refresh();
    });
    row.append(input, remove);
    root.appendChild(row);
  });
}

function field(type, value, placeholder) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  input.placeholder = placeholder;
  return input;
}

function refresh() {
  const payload = collect();
  const totals = computeTotals(payload);
  $('mSub').textContent = formatInr(totals.subtotal);
  $('mGstRow').hidden = !totals.gstEnabled;
  $('mGst').textContent = formatInr(totals.gstAmount);
  $('mTot').textContent = formatInr(totals.total);
  $('mAdv').textContent = formatInr(Math.max(0, totals.advance));
  $('mPen').textContent = formatInr(Math.max(0, totals.pending));
  const pending = $('mPending');
  pending.classList.toggle('ok', totals.pending <= 0 && !totals.advanceOverflow);
  pending.classList.toggle('bad', totals.advanceOverflow);
  document.querySelectorAll('.item-row .line-amt').forEach((el, index) => {
    const item = items[index];
    const amt = (Number(item?.qty) || 0) * (Number(item?.rate) || 0);
    el.textContent = formatInr(amt);
  });
  const preview = {
    ...payload,
    number: payload.number || $('number').placeholder || 'BBR-NEW',
  };
  paintSheet($('sheet'), preview, { showEmpty: true });
  fitSheet($('sheetZoom'), $('sheet'));
  $('saveBtn').textContent = currentId ? 'Save' : 'Generate';
}

function loadInv(inv) {
  currentId = inv.id;
  $('number').value = inv.number || '';
  $('date').value = inv.date || todayIso();
  $('due').value = inv.dueDate || '';
  $('status').value = inv.status || 'draft';
  $('clientName').value = inv.client?.name || '';
  $('business').value = inv.client?.business || '';
  $('phone').value = inv.client?.phone || '';
  $('email').value = inv.client?.email || '';
  $('city').value = inv.client?.city || '';
  items = (inv.items || []).map((item) => ({
    description: item.description || '',
    qty: item.qty ?? 1,
    rate: item.rate ?? 0,
  }));
  if (!items.length) items = [{ description: '', qty: 1, rate: 0 }];
  deliverables = inv.deliverables?.length ? [...inv.deliverables] : [''];
  $('gstOn').checked = Boolean(inv.gstEnabled);
  $('gstPercent').value = inv.gstPercent || 18;
  $('gstin').value = inv.gstin || '';
  $('gstFields').hidden = !inv.gstEnabled;
  $('advance').value = String(inv.advance ?? 0);
  $('upi').value = inv.upi || '';
  $('notes').value = inv.notes || '';
  const link = $('openLink');
  if (inv.token) {
    link.hidden = false;
    link.href = `${location.origin}/invoice-view.html?t=${encodeURIComponent(inv.token)}`;
    link.textContent = 'Client link kholo';
  }
  const phone = String(inv.client?.phone || '').replace(/\D/g, '');
  const match = allClients.find((client) => (
    (phone && client.phone === phone) || (!phone && client.name === inv.client?.name)
  ));
  $('clientPick').value = match?.id || '';
  renderItems();
  renderDeliverables();
  refresh();
}

function blankForm(next) {
  currentId = null;
  $('number').value = '';
  $('number').placeholder = next || 'BBR-001';
  $('date').value = todayIso();
  $('due').value = plusDaysIso(7);
  $('status').value = 'draft';
  $('clientName').value = '';
  $('business').value = '';
  $('phone').value = '';
  $('email').value = '';
  $('city').value = '';
  $('clientPick').value = '';
  items = [{ description: '', qty: 1, rate: 0 }];
  deliverables = [''];
  $('gstOn').checked = false;
  $('gstFields').hidden = true;
  $('gstPercent').value = '18';
  $('gstin').value = '';
  $('advance').value = '0';
  $('upi').value = '';
  $('notes').value = DEFAULT_NOTE;
  $('openLink').hidden = true;
  renderItems();
  renderDeliverables();
  refresh();
}

async function api(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, password: password() }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    endSession('Galat password. Bill nahi bani.');
    throw new Error(data.error || 'Galat password');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  sessionStorage.setItem('bbr-invoice-pass', password());
  return data;
}

function renderClientPick() {
  const sel = $('clientPick');
  const current = sel.value;
  sel.replaceChildren();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Naya client';
  sel.appendChild(blank);
  for (const client of allClients) {
    const opt = document.createElement('option');
    opt.value = client.id;
    opt.textContent = client.phone ? `${client.name} · ${client.phone}` : client.name;
    sel.appendChild(opt);
  }
  sel.value = [...sel.options].some((opt) => opt.value === current) ? current : '';
}

function renderAccounts() {
  const summary = accountSummary(allInvoices, viewMonth);
  $('acctMonth').textContent = monthLabel(viewMonth);
  $('acctEarning').textContent = formatInr(summary.earning);
  $('acctPending').textContent = formatInr(summary.pending);
  $('acctBills').textContent = String(summary.bills);
  $('acctAllPending').textContent = `Saari history ka pending: ${formatInr(summary.allPending)}`;
  const root = $('acctDays');
  root.replaceChildren();
  if (!summary.days.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Is mahine koi bill nahi.';
    root.appendChild(empty);
    return;
  }
  for (const day of summary.days) {
    const row = document.createElement('div');
    row.className = 'day-row';
    const date = document.createElement('strong');
    date.textContent = formatDate(day.date);
    const got = document.createElement('span');
    got.className = 'pending-ok';
    got.textContent = `Mila ${formatInr(day.earning)}`;
    const due = document.createElement('span');
    due.className = day.pending > 0 ? 'pending-hot' : 'pending-ok';
    due.textContent = `Pending ${formatInr(day.pending)}`;
    row.append(date, got, due);
    root.appendChild(row);
  }
}

function renderList(list) {
  const root = $('invList');
  root.replaceChildren();
  const shown = historyAll ? list : list.filter((inv) => monthKey(inv.date) === viewMonth);
  $('histMonth').setAttribute('aria-pressed', historyAll ? 'false' : 'true');
  $('histAll').setAttribute('aria-pressed', historyAll ? 'true' : 'false');
  if (!shown.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = list.length && !historyAll
      ? 'Is mahine koi bill nahi. Saari history dekho.'
      : 'Abhi koi invoice save nahi hai.';
    root.appendChild(empty);
    return;
  }
  for (const inv of shown) {
    const totals = computeTotals(inv);
    const card = document.createElement('div');
    card.className = 'inv-card';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'inv-open';
    const title = document.createElement('strong');
    title.textContent = `${inv.number} · ${inv.client?.name || 'Client'}`;
    const meta = document.createElement('span');
    meta.className = totals.pending <= 0 ? 'pending-ok' : 'pending-hot';
    meta.textContent = `${formatDate(inv.date)} · total ${formatInr(totals.total)} · mila ${formatInr(totals.advance)} · pending ${formatInr(totals.pending)}`;
    open.append(title, meta);
    open.addEventListener('click', () => {
      loadInv(inv);
      setStatus(`${inv.number} khul gaya.`);
      $('clientName').focus();
    });
    const actions = document.createElement('div');
    actions.className = 'inv-card-actions';
    if (totals.pending > 0) {
      const due = document.createElement('button');
      due.type = 'button';
      due.className = 'btn btn-ghost btn-sm';
      due.textContent = 'Due message';
      due.addEventListener('click', () => sendNotice(inv, 'due'));
      actions.appendChild(due);
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-ghost btn-sm';
    clear.textContent = totals.pending > 0 ? 'Clear + message' : 'Clear message';
    clear.addEventListener('click', () => sendNotice(inv, 'clear'));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-ghost btn-sm';
    del.textContent = 'Delete';
    del.addEventListener('click', () => removeInv(inv));
    actions.append(clear, del);
    card.append(open, actions);
    root.appendChild(card);
  }
}

async function loadList() {
  const data = await api('/api/invoices/list', {});
  allInvoices = data.invoices || [];
  allClients = data.clients || [];
  renderClientPick();
  renderAccounts();
  renderList(allInvoices);
  if (!currentId) {
    $('number').placeholder = data.nextNumber || 'BBR-001';
    refresh();
  }
  if (!$('upi').value && data.defaultUpi && !currentId) $('upi').value = data.defaultUpi;
  $('smtpHint').textContent = data.smtp
    ? 'Email PDF seedha client ke inbox mein ja sakti hai.'
    : 'SMTP set nahi hai — email pe PDF download hogi, Gmail khulega, attach karke bhej dena. Message mein client link hoga.';
  return data;
}

async function saveInvoice() {
  const wasNew = !currentId;
  const payload = collect();
  const totals = validate(payload);
  const data = await api('/api/invoices/save', payload);
  loadInv(data.invoice);
  await loadList();
  let extra = payload.deliverables.length ? '' : ' Deliverables khali hain — client ko kya milega woh likh do.';
  if (wasNew) extra += await deliverConfirmation(data.invoice, false);
  return { invoice: data.invoice, totals, extra };
}

async function deliverConfirmation(invoice, force) {
  const phone = waNumber(invoice.client?.phone);
  if (!phone) return ' Client ka WhatsApp likho, tab order confirmation jayegi.';
  try {
    const snap = await api('/api/invoices/wa-status', {});
    if (snap.status !== 'open') {
      return ' WhatsApp API abhi Meta approval par hai. Number link karne ki zarurat nahi — panel connect hote hi confirmation jayegi.';
    }
    let pdfBase64 = '';
    let filename = '';
    if (snap.document !== false) {
      try {
        const file = await makePdf(invoice);
        pdfBase64 = await fileToBase64(file);
        filename = file.name;
      } catch (err) {
        console.warn('pdf before whatsapp', err);
      }
    }
    const data = await api('/api/invoices/whatsapp', {
      id: invoice.id,
      pdfBase64,
      filename,
      force: Boolean(force),
    });
    if (data.invoice) {
      loadInv(data.invoice);
      await loadList();
    }
    if (data.sent) return ' Order confirmation WhatsApp API se client ko chali gayi.';
    if (data.already) return ' Confirmation pehle hi ja chuki hai.';
    return ` ${data.error || 'WhatsApp API se message nahi gaya.'}`;
  } catch (err) {
    return ` ${err.message || 'WhatsApp confirmation fail'}`;
  }
}

async function sendNotice(inv, kind) {
  if (!waNumber(inv.client?.phone)) {
    setStatus('Client ka WhatsApp number likho, tab message jayega.');
    return;
  }
  const totals = computeTotals(inv);
  if (kind === 'due') {
    if (totals.pending <= 0) {
      setStatus('Is bill par pending nahi hai.');
      return;
    }
    if (!confirm(`${inv.client?.name || 'Client'} ko pending ${formatInr(totals.pending)} due ka message bhejun?`)) return;
  } else if (totals.pending > 0) {
    if (!confirm(`${inv.number} clear karke client ko message bhejun? Pending ${formatInr(totals.pending)} zero ho jayega.`)) return;
  } else if (!confirm(`${inv.client?.name || 'Client'} ko hisaab clear ka message bhejun?`)) return;

  setStatus(kind === 'due' ? 'Due message ja raha hai…' : 'Clear message ja raha hai…');
  try {
    const data = await api('/api/invoices/notice', { id: inv.id, kind });
    if (data.invoice && currentId === data.invoice.id) loadInv(data.invoice);
    await loadList();
    setStatus(data.sent
      ? (kind === 'due' ? 'Due ka message client ko chala gaya.' : 'Clear ka message client ko chala gaya.')
      : (data.error || 'Message nahi gaya.'));
  } catch (err) {
    setStatus(err.message || 'Message fail');
  }
}

async function noticeCurrent(kind) {
  if (!currentId) {
    setStatus('Pehle bill save karo, phir message bhejo.');
    return;
  }
  try {
    await saveInvoice();
  } catch (err) {
    setStatus(err.message || 'Save fail');
    return;
  }
  const inv = allInvoices.find((row) => row.id === currentId);
  if (inv) await sendNotice(inv, kind);
}

async function removeInv(inv) {
  if (!confirm(`${inv.number} delete karni hai?`)) return;
  await api('/api/invoices/delete', { id: inv.id });
  if (currentId === inv.id) blankForm();
  await loadList();
  setStatus('Invoice delete ho gayi.');
}

function clientLink(inv) {
  return `${location.origin}/invoice-view.html?t=${encodeURIComponent(inv.token)}`;
}

async function makePdf(inv) {
  paintSheet($('sheet'), inv);
  fitSheet($('sheetZoom'), $('sheet'));
  const file = await elementToPdfFile($('sheet'), pdfFileName(inv.number));
  refresh();
  return file;
}

function lock(on) {
  busy = on;
  for (const id of ['saveBtn', 'pdfBtn', 'waBtn', 'mailBtn', 'copyBtn', 'dueBtn', 'clearBtn']) {
    $(id).disabled = on;
  }
}

$('invForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  lock(true);
  setStatus('Bill generate ho rahi hai…');
  try {
    const { extra } = await saveInvoice();
    setStatus(`Bill save ho gayi.${extra}`);
    refreshWa();
  } catch (err) {
    setStatus(err.message || 'Save fail');
  } finally {
    lock(false);
  }
});

$('pdfBtn').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  setStatus('PDF ban rahi hai…');
  try {
    const { invoice } = await saveInvoice();
    const file = await makePdf(invoice);
    downloadFile(file);
    setStatus('PDF download ho gayi.');
  } catch (err) {
    setStatus(err.message || 'PDF fail');
  } finally {
    lock(false);
  }
});

$('copyBtn').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  try {
    const { invoice } = await saveInvoice();
    const text = messageText(invoice, clientLink(invoice), vendor());
    await navigator.clipboard.writeText(text);
    setStatus('Message copy ho gaya. WhatsApp chat mein paste kar do.');
  } catch (err) {
    setStatus(err.message || 'Copy fail');
  } finally {
    lock(false);
  }
});

$('waBtn').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  setStatus('Order confirmation bhej rahe hain…');
  try {
    const wasNew = !currentId;
    const { invoice, extra } = await saveInvoice();
    if (wasNew) {
      setStatus(extra.trim());
      return;
    }
    setStatus((await deliverConfirmation(invoice, true)).trim());
  } catch (err) {
    setStatus(err.message || 'WhatsApp fail');
  } finally {
    lock(false);
  }
});

$('mailBtn').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  setStatus('Email ke liye PDF ban rahi hai…');
  try {
    const { invoice } = await saveInvoice();
    if (!invoice.client.email) throw new Error('Client ka email likho');
    const file = await makePdf(invoice);
    const text = messageText(invoice, clientLink(invoice), vendor());
    const data = await api('/api/invoices/email', {
      id: invoice.id,
      pdfBase64: await fileToBase64(file),
      filename: file.name,
    });
    if (data.sent) {
      loadInv(data.invoice);
      await loadList();
      setStatus(`PDF ${invoice.client.email} par chali gayi.`);
      return;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: emailSubject(invoice),
          text,
        });
        setStatus('Share sheet khul gayi. Gmail choose karke PDF bhej do.');
        return;
      } catch (err) {
        if (err?.name === 'AbortError') {
          setStatus('Email share cancel ho gaya.');
          return;
        }
      }
    }
    downloadFile(file);
    const href = `mailto:${invoice.client.email}?subject=${encodeURIComponent(emailSubject(invoice))}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    setStatus('PDF download ho gayi aur email app khul gayi. PDF attach karke send karo. Message mein invoice link hai.');
  } catch (err) {
    setStatus(err.message || 'Email fail');
  } finally {
    lock(false);
  }
});

$('newBtn').addEventListener('click', async () => {
  const dirty = $('clientName').value.trim() || items.some((item) => item.description.trim());
  if (dirty && !confirm('Nayi invoice? Jo abhi save nahi hua woh hat jayega.')) return;
  blankForm($('number').placeholder);
  setStatus('Nayi invoice. Save karoge tab number pakka hoga.');
  try {
    const data = await loadList();
    if (!currentId) {
      $('number').placeholder = data.nextNumber || 'BBR-001';
      refresh();
    }
  } catch {
    /* password may be empty */
  }
});

$('addItem').addEventListener('click', () => {
  items.push({ description: '', qty: 1, rate: 0 });
  renderItems();
  refresh();
  $('items').querySelector('.item-row:last-child input')?.focus();
});

$('addDel').addEventListener('click', () => {
  deliverables.push('');
  renderDeliverables();
  $('deliverables').querySelector('.del-row:last-child input')?.focus();
});

for (const preset of PRESETS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm';
  btn.textContent = preset.label;
  btn.addEventListener('click', () => {
    const has = items.some((item) => item.description.trim());
    if (has && !confirm(`${preset.label} lines current kaam ki jagah aa jayengi?`)) return;
    items = preset.items.map((item) => ({ ...item }));
    deliverables = [...preset.deliverables];
    renderItems();
    renderDeliverables();
    refresh();
  });
  $('presets').appendChild(btn);
}

$('gstOn').addEventListener('change', () => {
  $('gstFields').hidden = !$('gstOn').checked;
  if ($('gstOn').checked && !$('gstPercent').value) $('gstPercent').value = '18';
  refresh();
});

for (const id of ['number', 'date', 'due', 'status', 'clientName', 'business', 'phone', 'email', 'city', 'gstPercent', 'gstin', 'advance', 'upi', 'notes']) {
  $(id).addEventListener('input', refresh);
  $(id).addEventListener('change', refresh);
}

for (const [id, pct] of [
  ['adv40', 0.4],
  ['adv50', 0.5],
  ['adv100', 1],
]) {
  $(id).addEventListener('click', () => {
    const totals = computeTotals(collect());
    $('advance').value = String(Math.round(totals.total * pct));
    refresh();
  });
}

$('clientPick').addEventListener('change', () => {
  const client = allClients.find((row) => row.id === $('clientPick').value);
  if (!client) return;
  const current = $('clientName').value.trim();
  if (current && current !== client.name && !confirm(`${client.name} ki saved detail form mein laaun?`)) {
    $('clientPick').value = '';
    return;
  }
  $('clientName').value = client.name || '';
  $('business').value = client.business || '';
  $('phone').value = client.phone || '';
  $('email').value = client.email || '';
  $('city').value = client.city || '';
  refresh();
});

$('acctPrev').addEventListener('click', () => {
  viewMonth = shiftMonth(viewMonth, -1);
  renderAccounts();
  renderList(allInvoices);
});

$('acctNext').addEventListener('click', () => {
  viewMonth = shiftMonth(viewMonth, 1);
  renderAccounts();
  renderList(allInvoices);
});

$('histMonth').addEventListener('click', () => {
  historyAll = false;
  renderList(allInvoices);
});

$('histAll').addEventListener('click', () => {
  historyAll = true;
  renderList(allInvoices);
});

$('dueBtn').addEventListener('click', () => noticeCurrent('due'));
$('clearBtn').addEventListener('click', () => noticeCurrent('clear'));

$('loadBtn').addEventListener('click', async () => {
  setStatus('List aa rahi hai…');
  try {
    await loadList();
    setStatus('Saved invoices load ho gaye.');
    refreshWa();
  } catch (err) {
    sessionStorage.removeItem('bbr-invoice-pass');
    setStatus(err.message || 'List fail');
  }
});

window.addEventListener('resize', () => fitSheet($('sheetZoom'), $('sheet')));
$('sheet').addEventListener('load', (event) => {
  if (event.target?.tagName === 'IMG') fitSheet($('sheetZoom'), $('sheet'));
}, true);
document.fonts?.ready?.then(() => fitSheet($('sheetZoom'), $('sheet')));

async function refreshWa() {
  const state = $('waState');
  if (!password()) {
    state.textContent = 'WhatsApp API panel Meta approval ke baad message bhejega. Number link karne ki zarurat nahi.';
    return;
  }
  try {
    const data = await api('/api/invoices/wa-status', {});
    state.textContent = data.status === 'open'
      ? 'WhatsApp API ready hai. Nayi bill generate hote hi order confirmation client ko chali jayegi.'
      : (data.error || 'WhatsApp API panel Meta approval ke baad message bhejega. Number link karne ki zarurat nahi.');
  } catch (err) {
    state.textContent = err.message || 'WhatsApp status fail';
  }
}

function showDesk(on) {
  $('loginGate').hidden = on;
  $('desk').hidden = !on;
  $('logoutBtn').hidden = !on;
}

function endSession(message) {
  sessionStorage.removeItem('bbr-invoice-pass');
  $('password').value = '';
  showDesk(false);
  const status = $('loginStatus');
  status.hidden = !message;
  status.textContent = message || '';
}

async function login(passwordValue) {
  const res = await fetch('/api/invoices/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordValue }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Galat password');
  sessionStorage.setItem('bbr-invoice-pass', passwordValue);
  showDesk(true);
  try {
    await loadList();
  } catch (err) {
    setStatus(err.message || 'List fail');
  }
  refreshWa();
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('loginStatus');
  status.hidden = false;
  status.textContent = 'Login ho raha hai…';
  $('loginBtn').disabled = true;
  try {
    await login(password());
    status.hidden = true;
  } catch (err) {
    endSession(err.message || 'Galat password');
  } finally {
    $('loginBtn').disabled = false;
  }
});

$('logoutBtn').addEventListener('click', () => {
  endSession('Logout ho gaya. Bina login bill nahi banti.');
});

blankForm();
showDesk(false);
const savedPass = sessionStorage.getItem('bbr-invoice-pass');
if (savedPass) {
  $('password').value = savedPass;
  login(savedPass).catch((err) => endSession(err.message || 'Galat password'));
}
