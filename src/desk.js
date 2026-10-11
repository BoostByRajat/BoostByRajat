const form = document.getElementById('deskForm');
const status = document.getElementById('deskStatus');
const result = document.getElementById('deskResult');

async function deskLogin() {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: form?.username?.value || '',
      password: form?.password?.value || '',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Galat username ya password');
  return data.user;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  status.hidden = false;
  status.textContent = 'Working…';
  result.hidden = true;
  try {
    await deskLogin();
    const res = await fetch('/api/translate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: fd.get('text'),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    document.getElementById('dLang').textContent = data.detectedLang || '-';
    document.getElementById('dTrans').textContent = data.translation || '';
    document.getElementById('dReply').textContent = data.replyDraft || '';
    result.hidden = false;
    status.textContent = data.summary || 'Done';
  } catch (err) {
    status.textContent = err.message || 'Error';
  }
});

document.getElementById('dCopy')?.addEventListener('click', async () => {
  const text = document.getElementById('dReply')?.textContent || '';
  await navigator.clipboard.writeText(text);
});

let lastLeads = [];

function toCsv(leads) {
  const header = ['createdAt', 'source', 'name', 'email', 'whatsapp', 'location', 'service', 'interest', 'message'];
  const rows = leads.map((l) =>
    [
      l.createdAt || '',
      l.source || '',
      l.name || '',
      l.email || '',
      l.whatsapp || '',
      l.location || '',
      l.service || '',
      (l.interest || []).join('|'),
      l.message || '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

document.getElementById('loadLeads')?.addEventListener('click', async () => {
  const leadsStatus = document.getElementById('leadsStatus');
  const out = document.getElementById('leadsOut');
  leadsStatus.hidden = false;
  leadsStatus.textContent = 'Loading…';
  try {
    await deskLogin();
    const res = await fetch('/api/leads/list', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    lastLeads = data.leads || [];
    out.value = lastLeads.length
      ? lastLeads
          .map(
            (l) =>
              `${l.createdAt} | ${l.source || '-'} | ${l.name || '-'} | ${l.email} | ${l.whatsapp} | ${l.service || (l.interest || []).join(',')} | ${(l.message || '').slice(0, 80)}`
          )
          .join('\n')
      : 'No leads yet.';
    leadsStatus.textContent = `${lastLeads.length} lead(s)`;
  } catch (err) {
    leadsStatus.textContent = err.message || 'Error';
  }
});

document.getElementById('copyLeads')?.addEventListener('click', async () => {
  const leadsStatus = document.getElementById('leadsStatus');
  if (!lastLeads.length) {
    leadsStatus.hidden = false;
    leadsStatus.textContent = 'Load leads first';
    return;
  }
  await navigator.clipboard.writeText(toCsv(lastLeads));
  leadsStatus.hidden = false;
  leadsStatus.textContent = 'CSV copied';
});
