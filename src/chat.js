import { waLink } from './shell.js';

const SUGGESTIONS = [
  'Website kitne ka?',
  'Instagram plans?',
  'App bhi banate ho?',
  'Kaise order karun?',
];

export function initChat() {
  if (document.getElementById('chatRoot')) return;

  const root = document.createElement('div');
  root.id = 'chatRoot';
  root.innerHTML = `
    <button type="button" class="chat-fab" id="chatFab" aria-label="Open chat" aria-expanded="false">Chat</button>
    <div class="chat-panel" id="chatPanel" hidden>
      <header class="chat-head">
        <div>
          <strong>BoostByRajat</strong>
          <span>AI assistant · Hindi / English</span>
        </div>
        <button type="button" class="chat-close" id="chatClose" aria-label="Close chat">×</button>
      </header>
      <div class="chat-msgs" id="chatMsgs" role="log" aria-live="polite"></div>
      <div class="chat-suggest" id="chatSuggest"></div>
      <form class="chat-form" id="chatForm">
        <input id="chatInput" type="text" maxlength="800" placeholder="Apna sawal likho…" autocomplete="off" required />
        <button class="btn btn-amber btn-sm" type="submit">Send</button>
      </form>
      <p class="chat-foot">Order ke liye <a href="${waLink()}" target="_blank" rel="noopener">WhatsApp</a> · <a href="/collect.html">Get offers</a></p>
    </div>
  `;
  document.body.appendChild(root);

  const fab = document.getElementById('chatFab');
  const panel = document.getElementById('chatPanel');
  const closeBtn = document.getElementById('chatClose');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const msgs = document.getElementById('chatMsgs');
  const suggest = document.getElementById('chatSuggest');

  const history = [];

  function addMsg(role, text) {
    const row = document.createElement('div');
    row.className = `chat-bubble ${role}`;
    row.textContent = text;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.textContent = 'Close';
    fab.setAttribute('aria-label', 'Close chat');
    document.body.classList.add('chat-open');
    if (!msgs.childElementCount) {
      addMsg(
        'bot',
        'Namaste! Main BoostByRajat assistant hoon. Websites, apps, Instagram handling aur ads ke baare mein poochho. Order ke liye WhatsApp best hai.'
      );
    }
    setTimeout(() => input.focus(), 50);
  }

  function close() {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.textContent = 'Chat';
    fab.setAttribute('aria-label', 'Open chat');
    document.body.classList.remove('chat-open');
    input.blur();
  }

  SUGGESTIONS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => {
      input.value = s;
      form.requestSubmit();
    });
    suggest.appendChild(b);
  });

  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) open();
    else close();
  });

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = String(input.value || '').trim();
    if (text.length < 1) return;
    input.value = '';
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    const thinking = document.createElement('div');
    thinking.className = 'chat-bubble bot';
    thinking.textContent = '…';
    msgs.appendChild(thinking);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(-8) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      thinking.remove();
      const reply = data.reply || 'WhatsApp pe detail bhej do — main help karunga.';
      addMsg('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (err) {
      thinking.textContent = err.message || 'Error — WhatsApp try karo.';
    }
  });
}
