import { site } from './config.js';
import { fitSheet, paintSheet } from './invoice-doc.js';
import {
  DEFAULT_NOTE,
  PRESETS,
  accountSummary,
  computeTotals,
  deriveStatus,
  docKind,
  emailSubject,
  formatDate,
  formatInr,
  messageText,
  orderConfirmationText,
  monthKey,
  monthLabel,
  paymentsOf,
  pdfFileName,
  plusDaysIso,
  round2,
  shiftMonth,
  todayIso,
  waNumber,
} from './invoice-model.js';
import { downloadFile, elementToPdfFile, fileToBase64, sharePdfFile } from './invoice-pdf.js';

const $ = (id) => document.getElementById(id);

let currentId = null;
let currentKind = 'invoice';
let currentUser = null;
let loadedCreatedBy = null;
let items = [{ description: '', qty: 1, rate: 0 }];
let deliverables = [''];
let payments = [];
let discountMode = 'amount';
let busy = false;
let pdfReady = null;
let pdfJob = null;
let pdfSerial = 0;
let pdfChain = Promise.resolve();
let warmTimer = 0;
let pdfPrimed = false;
let allInvoices = [];
let allClients = [];
let nextNumbers = { invoice: 'BBR-001', demo: 'DEMO-001', quote: 'QT-001' };
let viewMonth = todayIso().slice(0, 7);
let historyAll = false;

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
    kind: currentKind,
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
    discountMode,
    discountValue: Number($('discount').value) || 0,
    payments: currentKind === 'quote'
      ? []
      : payments
          .map((row) => ({
            amount: Number(row.amount) || 0,
            date: row.date || todayIso(),
            note: String(row.note || '').trim(),
          }))
          .filter((row) => row.amount > 0),
    upi: $('upi').value.trim(),
    notes: $('notes').value.trim(),
  };
}

function validate(payload) {
  if (!currentUser) throw new Error('Pehle login karo');
  if (payload.client.name.length < 2) throw new Error('Client ka naam likho');
  const filled = payload.items.filter((item) => item.description);
  if (!filled.length) throw new Error('Kam se kam ek kaam aur rate likho');
  if (filled.some((item) => item.qty <= 0)) throw new Error('Quantity 0 se zyada honi chahiye');
  const totals = computeTotals(payload);
  if (totals.discountOverflow) {
    throw new Error(payload.discountMode === 'percent'
      ? 'Discount 100% se zyada nahi ho sakta'
      : 'Discount subtotal se zyada hai');
  }
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

function syncKind() {
  for (const id of ['kindInvoice', 'kindQuote', 'kindDemo']) {
    const btn = $(id);
    btn.setAttribute('aria-pressed', btn.dataset.kind === currentKind ? 'true' : 'false');
  }
  $('dueLabel').textContent = currentKind === 'quote' ? 'Valid till' : 'Due date';
  const pendingLabel = $('mPending')?.querySelector('span');
  if (pendingLabel) pendingLabel.textContent = currentKind === 'quote' ? 'Estimate' : 'Pending';
  $('payBlock').hidden = currentKind === 'quote';
  $('payHint').textContent = currentKind === 'demo'
    ? 'Demo payment sheet par dikhegi. Earning aur invoice number mein nahi ginegi.'
    : 'Jo amount mil chuka hai. Pending total minus in payments.';
  $('convertBtn').hidden = !(currentKind === 'quote' && currentId);
  $('dueBtn').hidden = currentKind === 'quote';
  $('clearBtn').hidden = currentKind === 'quote';
  if (!currentId) {
    const key = currentKind === 'demo' ? 'demo' : currentKind === 'quote' ? 'quote' : 'invoice';
    $('number').placeholder = nextNumbers[key] || 'BBR-001';
  }
}

function refresh() {
  syncKind();
  const payload = collect();
  const totals = computeTotals(payload);
  const derived = deriveStatus(payload, totals);
  $('status').value = derived;
  $('mSub').textContent = formatInr(totals.subtotal);
  const showDisc = totals.discountAmount > 0 || totals.discountOverflow;
  $('mDiscRow').hidden = !showDisc;
  $('mDiscRow').classList.toggle('bad', totals.discountOverflow);
  $('mDiscLabel').textContent = totals.discountMode === 'percent' && totals.discountPercent
    ? `Discount ${totals.discountPercent}%`
    : 'Discount';
  $('mDisc').textContent = totals.discountAmount > 0 ? `−${formatInr(totals.discountAmount)}` : formatInr(0);
  $('discAmount').setAttribute('aria-pressed', discountMode === 'amount' ? 'true' : 'false');
  $('discPercent').setAttribute('aria-pressed', discountMode === 'percent' ? 'true' : 'false');
  $('discLabel').textContent = discountMode === 'percent' ? 'Discount %' : 'Discount amount';
  $('discount').max = discountMode === 'percent' ? '100' : '';
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
    status: derived,
    number: payload.number || $('number').placeholder || 'BBR-NEW',
    createdBy: loadedCreatedBy || (currentUser ? { name: currentUser.name } : null),
  };
  paintSheet($('sheet'), preview, { showEmpty: true });
  fitSheet($('sheetZoom'), $('sheet'));
  $('saveBtn').textContent = currentId ? 'Save' : 'Generate';
  warmPdf();
}

function renderPayments() {
  const root = $('payments');
  root.replaceChildren();
  if (!payments.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Abhi koi payment nahi.';
    root.appendChild(empty);
    return;
  }
  payments.forEach((row, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'pay-row';
    const amount = field('number', row.amount, 'Amount');
    amount.min = '0';
    amount.step = '1';
    const date = field('date', row.date || todayIso(), '');
    const note = field('text', row.note, 'Note');
    note.classList.add('pay-note');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'Payment hatao');
    amount.addEventListener('input', () => {
      payments[index].amount = amount.value;
      refresh();
    });
    date.addEventListener('change', () => {
      payments[index].date = date.value;
      refresh();
    });
    note.addEventListener('input', () => {
      payments[index].note = note.value;
      refresh();
    });
    remove.addEventListener('click', () => {
      payments.splice(index, 1);
      renderPayments();
      refresh();
    });
    wrap.append(amount, date, note, remove);
    root.appendChild(wrap);
  });
}

function loadInv(inv) {
  currentId = inv.id;
  currentKind = docKind(inv);
  loadedCreatedBy = inv.createdBy || null;
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
  discountMode = inv.discountMode === 'percent' ? 'percent' : 'amount';
  $('discount').value = inv.discountValue ? String(inv.discountValue) : '';
  $('gstFields').hidden = !inv.gstEnabled;
  payments = paymentsOf(inv).map((row) => ({
    amount: row.amount,
    date: row.date || inv.date || todayIso(),
    note: row.note || '',
  }));
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
  renderPayments();
  refresh();
  syncBack();
}

function blankForm(next) {
  currentId = null;
  currentKind = 'invoice';
  loadedCreatedBy = null;
  payments = [];
  $('number').value = '';
  $('number').placeholder = next || nextNumbers.invoice || 'BBR-001';
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
  discountMode = 'amount';
  $('discount').value = '';
  $('upi').value = '';
  $('notes').value = DEFAULT_NOTE;
  $('openLink').hidden = true;
  renderItems();
  renderDeliverables();
  renderPayments();
  refresh();
  syncBack();
}

function syncBack() {
  const btn = $('backMain');
  if (btn) btn.hidden = !currentId;
}

function showBillList() {
  document.getElementById('billHistory')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openBill(inv) {
  const state = history.state;
  if (state && state.view === 'bill') {
    history.replaceState({ view: 'bill', id: inv.id }, '');
  } else {
    history.pushState({ view: 'bill', id: inv.id }, '');
  }
  loadInv(inv);
  setStatus(`${inv.number} khul gaya.`);
  $('invForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function api(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      endSession(data.error || 'Login khatam. Dubara login karo.');
      throw new Error(data.error || 'Login required');
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Connection timeout. Screen unlock ho gayi. Email dubara dabao.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    const kind = docKind(inv);
    const card = document.createElement('div');
    card.className = 'inv-card';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'inv-open';
    const title = document.createElement('strong');
    if (kind !== 'invoice') {
      const tag = document.createElement('span');
      tag.className = 'doc-tag';
      tag.textContent = kind === 'quote' ? 'Quote' : 'Demo';
      title.appendChild(tag);
    }
    title.append(document.createTextNode(`${inv.number} · ${inv.client?.name || 'Client'}`));
    const meta = document.createElement('span');
    meta.className = kind === 'quote' ? 'muted' : totals.pending <= 0 ? 'pending-ok' : 'pending-hot';
    const linked = kind === 'quote' && inv.convertedTo
      ? list.find((row) => row.id === inv.convertedTo)
      : null;
    const who = inv.createdBy?.name ? ` · ${inv.createdBy.name}` : '';
    meta.textContent = kind === 'quote'
      ? `${formatDate(inv.date)} · estimate ${formatInr(totals.total)}${linked ? ` · invoice ${linked.number}` : ''}${who}`
      : `${formatDate(inv.date)} · total ${formatInr(totals.total)} · mila ${formatInr(totals.advance)} · pending ${formatInr(totals.pending)}${who}`;
    open.append(title, meta);
    open.addEventListener('click', () => {
      openBill(inv);
    });
    const actions = document.createElement('div');
    actions.className = 'inv-card-actions';
    if (kind === 'quote') {
      const convert = document.createElement('button');
      convert.type = 'button';
      convert.className = 'btn btn-ghost btn-sm';
      convert.textContent = linked ? 'Invoice kholo' : 'Invoice banao';
      convert.addEventListener('click', () => {
        if (linked) {
          openBill(linked);
          return;
        }
        convertQuote(inv.id);
      });
      actions.appendChild(convert);
    } else {
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
      actions.appendChild(clear);
    }
    const pdf = document.createElement('button');
    pdf.type = 'button';
    pdf.className = 'btn btn-ghost btn-sm';
    pdf.textContent = 'PDF';
    pdf.addEventListener('click', () => guarded('PDF ban rahi hai…', async () => {
      const file = await makePdf(inv);
      downloadFile(file);
      return 'PDF download ho gayi.';
    }));
    const wa = document.createElement('button');
    wa.type = 'button';
    wa.className = 'btn btn-wa btn-sm';
    wa.textContent = 'WhatsApp';
    wa.addEventListener('click', () => guarded('WhatsApp ke liye PDF ban rahi hai…', () => pushWhatsApp(inv)));
    const mail = document.createElement('button');
    mail.type = 'button';
    mail.className = 'btn btn-ghost btn-sm';
    mail.textContent = 'Email';
    mail.addEventListener('click', () => guarded('Mail ja rahi hai…', () => pushEmail(inv)));
    actions.append(pdf, wa, mail);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-ghost btn-sm';
    del.textContent = 'Delete';
    del.addEventListener('click', () => removeInv(inv));
    actions.append(del);
    card.append(open, actions);
    root.appendChild(card);
  }
}

function renderMembers(admins) {
  const root = $('memberList');
  if (!root) return;
  root.replaceChildren();
  for (const admin of admins || []) {
    const card = document.createElement('div');
    card.className = 'inv-card';
    const title = document.createElement('strong');
    title.textContent = `${admin.name} · ${admin.username}`;
    const meta = document.createElement('span');
    meta.textContent = admin.role === 'owner' ? 'Owner' : (admin.active ? 'Admin' : 'Disabled');
    card.append(title, meta);
    if (admin.role !== 'owner') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = admin.active ? 'Disable' : 'Enable';
      btn.addEventListener('click', async () => {
        try {
          const data = await api('/api/admins/active', { id: admin.id, active: !admin.active });
          renderMembers(data.admins || []);
        } catch (err) {
          const status = $('memStatus');
          status.hidden = false;
          status.textContent = err.message || 'Update fail';
        }
      });
      card.appendChild(btn);
    }
    root.appendChild(card);
  }
}

async function loadList() {
  const data = await api('/api/invoices/list', {});
  allInvoices = data.invoices || [];
  allClients = data.clients || [];
  nextNumbers = {
    invoice: data.nextNumber || 'BBR-001',
    demo: data.nextDemo || 'DEMO-001',
    quote: data.nextQuote || 'QT-001',
  };
  if (data.user) {
    currentUser = data.user;
    showDesk(true);
  }
  if (currentUser?.role === 'owner') renderMembers(data.admins || []);
  renderClientPick();
  renderAccounts();
  renderList(allInvoices);
  if (!currentId) {
    refresh();
  }
  if (!$('upi').value && data.defaultUpi && !currentId) $('upi').value = data.defaultUpi;
  $('smtpHint').textContent = data.smtp
    ? 'Gmail connected hai. Generate aur Email button client ko PDF seedha bhej dete hain.'
    : 'Gmail connect nahi hai. Render par SMTP_PASS (Gmail app password) set karo, tab Generate par mail apne aap jayegi.';
  return data;
}

async function saveInvoice(opts = {}) {
  const wasNew = !currentId;
  const draft = formPreview();
  if (opts.deliver !== false) ensurePdf(draft);
  const payload = collect();
  const totals = validate(payload);
  const data = await api('/api/invoices/save', payload);
  loadInv(data.invoice);
  await loadList();
  let extra = payload.deliverables.length ? '' : ' Deliverables khali hain — client ko kya milega woh likh do.';
  if (wasNew && opts.deliver !== false) extra += await deliverConfirmation(data.invoice, false);
  return { invoice: data.invoice, totals, extra };
}

async function sendGeneratedMail(invoice, force) {
  if (docKind(invoice) === 'demo' && !force) return '';
  const to = String(invoice.client?.email || '').trim();
  if (!to) return ' Client ka email likho, tab mail apne aap chali jayegi.';
  if ((invoice.sends || []).some((row) => row.channel === 'email') && !force) return '';
  await postInvoiceEmail(invoice);
  return ` Mail ${to} par PDF ke saath chali gayi.`;
}

async function deliverConfirmation(invoice, force) {
  let mailNote = '';
  try {
    mailNote = await sendGeneratedMail(invoice, force);
  } catch (err) {
    mailNote = ` Mail nahi gayi: ${err.message || 'fail'}`;
  }
  if (docKind(invoice) === 'demo' && !force) {
    return ` Demo bill number aur earning mein nahi jodi gayi.${mailNote}`;
  }
  if (docKind(invoice) === 'quote') return mailNote || ' Quotation save ho gayi.';
  const phone = waNumber(invoice.client?.phone);
  if (!phone) return `${mailNote} Client ka WhatsApp likho, tab confirmation jayegi.`.trim();
  try {
    const snap = await api('/api/invoices/wa-status', {});
    if (snap.status === 'open') {
      const file = await makePdf(invoice);
      const data = await api('/api/invoices/whatsapp', {
        id: invoice.id,
        pdfBase64: await fileToBase64(file),
        filename: file.name,
        force: Boolean(force),
      });
      if (data.invoice) {
        loadInv(data.invoice);
        await loadList();
      }
      if (data.sent) return `${mailNote} WhatsApp confirmation client ko chali gayi.`.trim();
    }
  } catch (err) {
    console.warn('whatsapp api', err);
  }
  return `${mailNote} ${openWhatsAppChat(invoice)}`.trim();
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

function pdfCacheKey(inv) {
  const client = inv?.client || {};
  return JSON.stringify({
    k: docKind(inv),
    n: inv?.number || '',
    d: inv?.date || '',
    due: inv?.dueDate || '',
    s: inv?.status || '',
    c: {
      name: String(client.name || '').trim(),
      business: String(client.business || '').trim(),
      phone: String(client.phone || '').replace(/\D/g, ''),
      email: String(client.email || '').trim().toLowerCase(),
      city: String(client.city || '').trim(),
    },
    items: (inv?.items || [])
      .filter((item) => String(item.description || '').trim())
      .map((item) => ({
        d: String(item.description || '').trim(),
        q: round2(item.qty),
        r: round2(item.rate),
      })),
    del: (inv?.deliverables || []).map((line) => String(line || '').trim()).filter(Boolean),
    g: [
      Boolean(inv?.gstEnabled),
      round2(inv?.gstPercent),
      Boolean(inv?.gstEnabled) ? String(inv?.gstin || '').trim().toUpperCase() : '',
    ],
    disc: [inv?.discountMode === 'percent' ? 'percent' : 'amount', round2(inv?.discountValue)],
    pay: paymentsOf(inv),
    upi: String(inv?.upi || '').trim(),
    notes: String(inv?.notes || '').trim(),
    by: inv?.createdBy?.name || '',
  });
}

function formPreview() {
  const payload = collect();
  const totals = computeTotals(payload);
  return {
    ...payload,
    status: deriveStatus(payload, totals),
    number: payload.number || $('number').placeholder || 'BBR-NEW',
    createdBy: loadedCreatedBy || (currentUser ? { name: currentUser.name } : null),
  };
}

function runPdf(work) {
  const job = pdfChain.then(work, work);
  pdfChain = job.then(() => {}, () => {});
  return job;
}

function ensurePdf(inv) {
  const key = pdfCacheKey(inv);
  if (pdfReady?.key === key) return Promise.resolve(pdfReady.file);
  if (pdfJob?.key === key) return pdfJob.promise;
  const serial = ++pdfSerial;
  const promise = runPdf(async () => {
    paintSheet($('pdfSheet'), inv);
    const file = await elementToPdfFile($('pdfSheet'), pdfFileName(inv.number));
    if (serial === pdfSerial) pdfReady = { key, file };
    return file;
  });
  pdfJob = { key, promise };
  promise.finally(() => {
    if (pdfJob?.promise === promise) pdfJob = null;
  });
  return promise;
}

function warmPdf() {
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => {
    try {
      const preview = formPreview();
      if (preview.client.name.length < 2) return;
      if (!preview.items.some((item) => String(item.description || '').trim())) return;
      ensurePdf(preview).catch(() => {});
    } catch {
      /* form is not ready yet */
    }
  }, 500);
}

function primePdfEngine() {
  if (pdfPrimed) return;
  pdfPrimed = true;
  runPdf(async () => {
    $('pdfSheet').textContent = 'BoostByRajat';
    await elementToPdfFile($('pdfSheet'), 'BoostByRajat-ready.pdf');
  }).catch(() => {});
}

async function makePdf(inv) {
  return ensurePdf(inv);
}

async function pdfForSaved(draft, invoice) {
  if (pdfCacheKey(invoice) === pdfCacheKey(draft)) return ensurePdf(draft);
  return ensurePdf(invoice);
}

function lock(on) {
  busy = on;
  for (const id of ['saveBtn', 'pdfBtn', 'waBtn', 'mailBtn', 'copyBtn', 'dueBtn', 'clearBtn', 'convertBtn']) {
    $(id).disabled = on;
  }
}

$('invForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  lock(true);
  const creating = !currentId;
  setStatus(creating && currentKind === 'invoice'
    ? 'Bill generate ho rahi hai. Mail aur WhatsApp ja rahe hain…'
    : (creating ? 'Bill generate ho rahi hai…' : 'Bill save ho rahi hai…'));
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

function openWhatsAppChat(invoice) {
  const text = orderConfirmationText(invoice, clientLink(invoice));
  const phone = waNumber(invoice.client?.phone);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  openExternal(url);
  return phone
    ? 'WhatsApp khul gaya. Order confirmation ready hai, Send dabao.'
    : 'WhatsApp khul gaya. Contact choose karke Send dabao.';
}

function openExternal(url) {
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) window.location.href = url;
}

async function guarded(pending, work) {
  if (busy) return;
  lock(true);
  setStatus(pending);
  try {
    const msg = await work();
    if (msg) setStatus(msg);
  } catch (err) {
    setStatus(err.message || 'Fail');
  } finally {
    lock(false);
  }
}

async function handoffPdf(invoice, channel) {
  const file = await makePdf(invoice);
  const text = messageText(invoice, clientLink(invoice), vendor());
  const title = emailSubject(invoice);
  const shared = await sharePdfFile(file, { title, text });
  if (shared === 'shared') {
    return channel === 'email'
      ? 'Share sheet khul gayi. Gmail choose karke PDF bhej do.'
      : 'Share sheet khul gayi. WhatsApp choose karke PDF bhej do.';
  }
  if (shared === 'cancel') return channel === 'email' ? 'Email share cancel ho gaya.' : 'WhatsApp share cancel ho gaya.';
  if (channel === 'email') {
    const href = `mailto:${invoice.client.email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    return 'PDF Downloads folder mein save ho gayi. Email khul gayi — PDF attach karke send karo.';
  }
  const phone = waNumber(invoice.client?.phone);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  openExternal(url);
  return phone
    ? 'PDF Downloads folder mein save ho gayi. WhatsApp khul gaya — paperclip se PDF attach karke bhej do.'
    : 'PDF Downloads folder mein save ho gayi. WhatsApp khul gaya — contact choose karke PDF attach kar do.';
}

async function pushWhatsApp(invoice, readyFile) {
  const phone = waNumber(invoice.client?.phone);
  let snap = {};
  try {
    snap = await api('/api/invoices/wa-status', {});
  } catch {
    snap = {};
  }
  const apiReady = snap.status === 'open' && (docKind(invoice) !== 'quote' || snap.quoteTemplate);
  if (apiReady && phone) {
    try {
      const file = readyFile || await makePdf(invoice);
      const data = await api('/api/invoices/whatsapp', {
        id: invoice.id,
        pdfBase64: await fileToBase64(file),
        filename: file.name,
        force: true,
      });
      if (data.invoice && currentId === data.invoice.id) loadInv(data.invoice);
      if (data.sent) {
        await loadList();
        return docKind(invoice) === 'quote'
          ? 'Quotation PDF WhatsApp se client ko chali gayi.'
          : 'Bill PDF WhatsApp se client ko chali gayi.';
      }
    } catch (err) {
      console.warn('whatsapp api', err);
    }
  }
  return handoffPdf(invoice, 'whatsapp');
}

function within(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function postInvoiceEmail(invoice, readyFile) {
  const file = readyFile || await within(makePdf(invoice), 20000, 'PDF ready nahi hui. Email dubara dabao.');
  const data = await api('/api/invoices/email', {
    id: invoice.id,
    pdfBase64: await fileToBase64(file),
    filename: file.name,
  });
  if (!data.sent) {
    throw new Error(data.reason === 'no_smtp'
      ? 'Gmail connect nahi hai. Mail nahi gayi.'
      : (data.error || 'Mail nahi gayi.'));
  }
  if (data.invoice && currentId === data.invoice.id) loadInv(data.invoice);
  await loadList();
  return data;
}

async function pushEmail(invoice, readyFile) {
  const to = String(invoice.client?.email || '').trim();
  if (!to) return 'Client ka email likho. Bina email ke mail nahi jayegi.';
  await postInvoiceEmail(invoice, readyFile);
  return `Mail ${to} par chali gayi. PDF attach hai.`;
}

$('pdfBtn').addEventListener('click', () => guarded('PDF ready ho rahi hai…', async () => {
  const draft = formPreview();
  ensurePdf(draft);
  const { invoice } = await saveInvoice({ deliver: false });
  downloadFile(await pdfForSaved(draft, invoice));
  return 'PDF download ho gayi.';
}));

$('copyBtn').addEventListener('click', async () => {
  if (busy) return;
  lock(true);
  try {
    const { invoice } = await saveInvoice({ deliver: false });
    const text = messageText(invoice, clientLink(invoice), vendor());
    await navigator.clipboard.writeText(text);
    setStatus('Message copy ho gaya. WhatsApp chat mein paste kar do.');
  } catch (err) {
    setStatus(err.message || 'Copy fail');
  } finally {
    lock(false);
  }
});

$('waBtn').addEventListener('click', () => guarded('PDF ready ho rahi hai…', async () => {
  const draft = formPreview();
  ensurePdf(draft);
  const { invoice } = await saveInvoice({ deliver: false });
  return pushWhatsApp(invoice, await pdfForSaved(draft, invoice));
}));

$('mailBtn').addEventListener('click', () => guarded('Mail ja rahi hai…', async () => {
  const draft = formPreview();
  ensurePdf(draft);
  const { invoice } = await saveInvoice({ deliver: false });
  return pushEmail(invoice, await pdfForSaved(draft, invoice));
}));

$('backMain').addEventListener('click', () => {
  if (history.state && history.state.view === 'bill') {
    history.back();
    return;
  }
  showBillList();
});

window.addEventListener('popstate', () => {
  showBillList();
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

for (const id of ['discAmount', 'discPercent']) {
  $(id).addEventListener('click', () => {
    discountMode = id === 'discPercent' ? 'percent' : 'amount';
    refresh();
  });
}

$('gstOn').addEventListener('change', () => {
  $('gstFields').hidden = !$('gstOn').checked;
  if ($('gstOn').checked && !$('gstPercent').value) $('gstPercent').value = '18';
  refresh();
});

for (const id of ['number', 'date', 'due', 'status', 'clientName', 'business', 'phone', 'email', 'city', 'gstPercent', 'gstin', 'discount', 'upi', 'notes']) {
  $(id).addEventListener('input', refresh);
  $(id).addEventListener('change', refresh);
}

for (const btn of document.querySelectorAll('#kindPick [data-kind]')) {
  btn.addEventListener('click', () => {
    const next = btn.dataset.kind;
    if (currentId && next !== currentKind) {
      setStatus('Saved document ka type nahi badalta. Quotation se invoice, Invoice banao se banti hai.');
      return;
    }
    currentKind = next;
    if (currentKind === 'quote') payments = [];
    renderPayments();
    refresh();
  });
}

$('addPay').addEventListener('click', () => {
  payments.push({ amount: '', date: todayIso(), note: '' });
  renderPayments();
  $('payments').querySelector('.pay-row:last-child input')?.focus();
});

for (const [id, pct] of [
  ['adv40', 0.4],
  ['adv50', 0.5],
  ['adv100', 1],
]) {
  $(id).addEventListener('click', () => {
    const totals = computeTotals({ ...collect(), payments: [] });
    const amount = Math.round(totals.total * pct);
    if (payments.length > 1 && !confirm('Current payments hat kar ek advance line lagaun?')) return;
    payments = amount > 0 ? [{ amount, date: todayIso(), note: 'Advance' }] : [];
    renderPayments();
    refresh();
  });
}

async function convertQuote(id) {
  if (!confirm('Is quotation se asli invoice banaun? Quotation earning mein nahi aati.')) return;
  if (busy) return;
  lock(true);
  setStatus('Invoice ban rahi hai…');
  try {
    if (currentId === id) await saveInvoice();
    const data = await api('/api/invoices/convert', { id });
    loadInv(data.invoice);
    await loadList();
    const extra = data.already ? '' : await deliverConfirmation(data.invoice, false);
    setStatus((data.already ? `${data.invoice.number} pehle ban chuki hai.` : `${data.invoice.number} ban gayi.`) + extra);
  } catch (err) {
    setStatus(err.message || 'Invoice nahi bani');
  } finally {
    lock(false);
  }
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
  if (!currentUser) {
    state.textContent = 'Nayi invoice generate hote hi client ko WhatsApp confirmation milti hai.';
    return;
  }
  try {
    const data = await api('/api/invoices/wa-status', {});
    state.textContent = data.status === 'open'
      ? 'WhatsApp connected hai. Nayi invoice generate hote hi confirmation client ko chali jayegi.'
      : (data.error || 'Generate par order confirmation client ke WhatsApp mein ready khul jayegi.');
  } catch (err) {
    state.textContent = err.message || 'WhatsApp status fail';
  }
}

function showDesk(on) {
  $('loginGate').hidden = on;
  $('desk').hidden = !on;
  $('logoutBtn').hidden = !on;
  const who = $('whoami');
  who.hidden = !on;
  who.textContent = on && currentUser ? currentUser.name : '';
  $('members').hidden = !(on && currentUser?.role === 'owner');
}

async function endSession(message) {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    /* cookie clear is best-effort */
  }
  currentUser = null;
  $('username').value = '';
  $('password').value = '';
  showDesk(false);
  const status = $('loginStatus');
  status.hidden = !message;
  status.textContent = message || '';
}

async function enterDesk(user) {
  currentUser = user;
  showDesk(true);
  try {
    await loadList();
  } catch (err) {
    setStatus(err.message || 'List fail');
  }
  refreshWa();
  primePdfEngine();
}

async function login(username, passwordValue) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: passwordValue }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Incorrect username or password');
  await enterDesk(data.user);
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('loginStatus');
  status.hidden = false;
  status.textContent = 'Signing in…';
  $('loginBtn').disabled = true;
  try {
    await login($('username').value.trim(), $('password').value);
    status.hidden = true;
  } catch (err) {
    const message = err.message || 'Incorrect username or password';
    $('password').value = '';
    showDesk(false);
    status.hidden = false;
    status.textContent = message;
  } finally {
    $('loginBtn').disabled = false;
  }
});

$('logoutBtn').addEventListener('click', () => {
  endSession('Signed out.');
});

$('convertBtn').addEventListener('click', () => {
  if (currentId) convertQuote(currentId);
});

$('memberForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('memStatus');
  status.hidden = false;
  status.textContent = 'Member add ho raha hai…';
  try {
    const data = await api('/api/admins', {
      username: $('memUser').value.trim(),
      name: $('memName').value.trim(),
      password: $('memPass').value,
    });
    $('memUser').value = '';
    $('memName').value = '';
    $('memPass').value = '';
    renderMembers(data.admins || []);
    status.textContent = 'Member add ho gaya. Agli bill par uska naam aa sakta hai.';
  } catch (err) {
    status.textContent = err.message || 'Member add nahi hua';
  }
});

blankForm();
showDesk(false);
fetch('/api/auth/me', { credentials: 'same-origin' })
  .then(async (res) => {
    if (!res.ok) return;
    const data = await res.json();
    if (data.user) await enterDesk(data.user);
  })
  .catch(() => {});
