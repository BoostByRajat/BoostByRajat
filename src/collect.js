import { initNavToggle, wireWhatsApp } from './shell.js';
import { initChat } from './chat.js';

initNavToggle();
wireWhatsApp();
initChat();

const form = document.getElementById('collectForm');
const status = document.getElementById('collectStatus');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const interest = fd.getAll('interest');
  const payload = {
    name: fd.get('name'),
    email: fd.get('email'),
    whatsapp: fd.get('whatsapp'),
    location: fd.get('location'),
    interest,
    consent: fd.get('consent') === 'on',
    source: 'collect',
  };

  status.hidden = false;
  status.textContent = 'Saving…';

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    status.textContent = 'Saved — offers & updates aa sakte hain. WhatsApp pe bhi order kar sakte ho.';
    form.reset();
  } catch (err) {
    status.textContent = err.message || 'Error';
  }
});
