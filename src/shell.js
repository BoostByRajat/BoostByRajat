import { site } from './config.js';

export function waNumber() {
  return (
    import.meta.env.VITE_WHATSAPP_NUMBER ||
    site.whatsapp ||
    ''
  ).replace(/\D/g, '');
}

export function waLink(text = 'Hi BoostByRajat, I want to place an order.') {
  const n = waNumber();
  if (!n) return '/#order';
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function wireWhatsApp(ids = ['waTop', 'waHero', 'waSticky', 'waBand', 'waOffer', 'waPage']) {
  const href = waLink();
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'waOffer') {
      el.href = waLink('Hi BoostByRajat — I want the First 3 clients special pricing.');
    } else {
      el.href = href;
    }
  });
  document.querySelectorAll('[data-wa-text]').forEach((el) => {
    el.href = waLink(el.getAttribute('data-wa-text') || undefined);
  });
}

export function initNavToggle() {
  const btn = document.getElementById('navToggle');
  const panel = document.getElementById('navDrawer');
  if (!btn || !panel) return;

  const close = () => {
    btn.setAttribute('aria-expanded', 'false');
    panel.classList.remove('open');
    document.body.classList.remove('nav-open');
  };
  const open = () => {
    btn.setAttribute('aria-expanded', 'true');
    panel.classList.add('open');
    document.body.classList.add('nav-open');
  };

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) close();
    else open();
  });

  panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

/** Custom cursor glow on fine pointers (desktop). Safe on all pages. */
export function initCursorGlow() {
  if (matchMedia('(pointer: coarse)').matches) return;

  let glow = document.getElementById('cursorGlow');
  if (!glow) {
    glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.id = 'cursorGlow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.prepend(glow);
  }

  document.body.classList.add('custom-cursor');
  window.addEventListener('pointermove', (e) => {
    glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  });
}

/** Ensure Made in India shows the flag SVG everywhere. */
export function ensureIndiaFlag() {
  const svg = indiaFlagSvg();
  document.querySelectorAll('.made-in-india').forEach((el) => {
    if (el.querySelector('svg.india-flag')) return;
    el.insertAdjacentHTML('afterbegin', `${svg} `);
  });
}

export function indiaFlagSvg() {
  return `<svg class="india-flag" viewBox="0 0 30 20" width="22" height="15" aria-hidden="true" focusable="false">
    <rect width="30" height="6.67" y="0" fill="#FF9933"/>
    <rect width="30" height="6.67" y="6.67" fill="#FFFFFF"/>
    <rect width="30" height="6.67" y="13.33" fill="#138808"/>
    <circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width="0.7"/>
    <circle cx="15" cy="10" r="0.45" fill="#000080"/>
    <g stroke="#000080" stroke-width="0.35">
      <line x1="15" y1="7.7" x2="15" y2="12.3"/>
      <line x1="12.7" y1="10" x2="17.3" y2="10"/>
      <line x1="13.35" y1="8.35" x2="16.65" y2="11.65"/>
      <line x1="16.65" y1="8.35" x2="13.35" y2="11.65"/>
    </g>
  </svg>`;
}
