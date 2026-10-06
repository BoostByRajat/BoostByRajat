import { site } from './config.js';
import {
  computeTotals,
  formatDate,
  formatInr,
  formatPhone,
  lineAmount,
} from './invoice-model.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  paid: 'Paid',
};

export function paintSheet(sheet, inv, opts = {}) {
  const totals = computeTotals(inv);
  const items = (inv.items || []).filter((item) => String(item.description || '').trim());
  const deliverables = (inv.deliverables || []).map((line) => String(line || '').trim()).filter(Boolean);
  const phone = formatPhone(inv.client?.phone);
  const vendorPhone = formatPhone(site.whatsapp);
  const pendingClear = totals.pending <= 0 && !totals.advanceOverflow;
  const rows = items
    .map(
      (item) => `<tr>
        <td>${esc(item.description)}</td>
        <td class="num">${esc(String(item.qty))}</td>
        <td class="num">${esc(formatInr(item.rate))}</td>
        <td class="num">${esc(formatInr(lineAmount(item)))}</td>
      </tr>`
    )
    .join('');
  const got = deliverables.map((line) => `<li>${esc(line)}</li>`).join('');
  const gstRow = totals.gstEnabled
    ? `<div><span>GST ${esc(String(totals.gstPercent))}%</span><strong>${esc(formatInr(totals.gstAmount))}</strong></div>`
    : '';

  sheet.innerHTML = `
    <div class="sheet-banner">
      <div class="sheet-brand">
        <img src="${esc(site.logo)}" alt="" width="52" height="52" />
        <div>
          <p class="sheet-name">${esc(site.brand)}</p>
          <p class="sheet-tag">Websites · Apps · Instagram · Ads</p>
        </div>
      </div>
      <div class="sheet-id">
        <p class="sheet-kicker">Invoice</p>
        <p class="sheet-no">${esc(inv.number || 'Draft')}</p>
        <p class="sheet-status">${esc(STATUS[inv.status] || 'Draft')}</p>
      </div>
    </div>
    <div class="sheet-parties">
      <div>
        <p class="sheet-label">Bill to</p>
        <p class="sheet-client">${esc(inv.client?.name || 'Client name')}</p>
        ${inv.client?.business ? `<p>${esc(inv.client.business)}</p>` : ''}
        ${inv.client?.city ? `<p>${esc(inv.client.city)}</p>` : ''}
        ${phone ? `<p>${esc(phone)}</p>` : ''}
        ${inv.client?.email ? `<p>${esc(inv.client.email)}</p>` : ''}
      </div>
      <div class="sheet-dates">
        <p><span>Date</span><strong>${esc(formatDate(inv.date))}</strong></p>
        <p><span>Due</span><strong>${esc(formatDate(inv.dueDate))}</strong></p>
        ${inv.gstin ? `<p><span>GSTIN</span><strong>${esc(inv.gstin)}</strong></p>` : ''}
      </div>
    </div>
    <table class="sheet-table">
      <thead>
        <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4">Add a line item</td></tr>'}
      </tbody>
    </table>
    ${
      got
        ? `<section class="sheet-get"><p class="sheet-label">What you get</p><ul>${got}</ul></section>`
        : opts.showEmpty
          ? `<section class="sheet-get"><p class="sheet-label">What you get</p><p class="sheet-empty">Deliverables abhi khali hain.</p></section>`
          : ''
    }
    <div class="sheet-bottom">
      <div class="sheet-pay">
        <p class="sheet-label">Payment</p>
        ${inv.upi ? `<p>UPI: <strong>${esc(inv.upi)}</strong></p>` : '<p>UPI on request</p>'}
        <p>${esc(vendorPhone)}</p>
        <p>${esc(site.email)}</p>
      </div>
      <div class="sheet-sum">
        <div><span>Subtotal</span><strong>${esc(formatInr(totals.subtotal))}</strong></div>
        ${gstRow}
        <div><span>Total</span><strong>${esc(formatInr(totals.total))}</strong></div>
        <div><span>Advance received</span><strong>${esc(formatInr(Math.max(0, totals.advance)))}</strong></div>
        <div class="sheet-pending${pendingClear ? ' cleared' : ''}">
          <span>${pendingClear ? 'Paid in full' : 'Pending'}</span>
          <strong>${esc(formatInr(Math.max(0, totals.pending)))}</strong>
        </div>
      </div>
    </div>
    ${inv.notes ? `<p class="sheet-note">${esc(inv.notes)}</p>` : ''}
    <div class="sheet-sign">
      <div class="sheet-sign-block">
        <p class="sheet-sign-name">Rajat</p>
        <p class="sheet-sign-role">Founder</p>
        <p class="sheet-sign-brand">${esc(site.brand)}</p>
      </div>
    </div>
    <footer class="sheet-foot">
      <span>${esc(site.brand)}</span>
      <span>Advance starts the work. Balance before final delivery.</span>
    </footer>
  `;
}

export function fitSheet(zoom, sheet) {
  if (!zoom || !sheet) return;
  const scale = Math.min(1, zoom.clientWidth / 794);
  sheet.style.transformOrigin = 'top left';
  sheet.style.transform = `scale(${scale})`;
  zoom.style.height = `${sheet.offsetHeight * scale}px`;
}
