const form = document.getElementById('deskForm');
const status = document.getElementById('deskStatus');
const result = document.getElementById('deskResult');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  status.hidden = false;
  status.textContent = 'Working…';
  result.hidden = true;
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: fd.get('password'),
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
