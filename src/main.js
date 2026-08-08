import { initI18n, currentLang, t } from './i18n.js';
import { site } from './config.js';

const waNumber = (
  import.meta.env.VITE_WHATSAPP_NUMBER ||
  site.whatsapp ||
  ''
).replace(/\D/g, '');

function waLink(text = 'Hi BoostByRajat, I want to place an order.') {
  if (!waNumber) return '#order';
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
}

function wireWhatsApp() {
  const href = waLink();
  const offerHref = waLink('Hi BoostByRajat — I want the First 3 clients special pricing.');
  ['waTop', 'waHero', 'waSticky', 'waBand'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = href;
    if (!waNumber) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  });
  const offer = document.getElementById('waOffer');
  if (offer) {
    offer.href = offerHref;
    if (!waNumber) {
      offer.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }
}

function initOfferLinks() {
  document.querySelectorAll('.wa-offer[data-service]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const select = document.getElementById('serviceSelect');
      if (select) select.value = btn.dataset.service;
    });
  });
}

function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow || matchMedia('(pointer: coarse)').matches) return;
  window.addEventListener('pointermove', (e) => {
    glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  });
}

function initParticles() {
  const canvas = document.getElementById('fx');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let particles = [];
  let mx = 0;
  let my = 0;
  let raf = 0;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(90, Math.floor((w * h) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 1.8 + 0.6,
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      const dx = p.x - mx;
      const dy = p.y - my;
      const dist = Math.hypot(dx, dy);
      if (dist < 140) {
        p.x += dx / dist;
        p.y += dy / dist;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,176,0,0.75)';
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 120) {
          ctx.strokeStyle = `rgba(0,240,200,${(1 - d / 120) * 0.28})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  });
  window.addEventListener('resize', resize);
  resize();
  cancelAnimationFrame(raf);
  frame();
}

function initLogo3d() {
  const stage = document.getElementById('logoStage');
  const logo = document.getElementById('logo3d');
  if (!stage || !logo) return;

  stage.addEventListener('pointermove', (e) => {
    const rect = stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    logo.style.transform = `rotateX(${14 - y * 28}deg) rotateY(${x * 36}deg) translateY(-12px) scale(1.04)`;
  });
  stage.addEventListener('pointerleave', () => {
    logo.style.transform = '';
  });
}

function initServiceLinks() {
  document.querySelectorAll('.svc-row[data-service]').forEach((row) => {
    row.addEventListener('click', () => {
      const select = document.getElementById('serviceSelect');
      if (select) select.value = row.dataset.service;
    });
  });
}

function initReveal() {
  const els = document.querySelectorAll(
    '.section-head, .svc-row, .work-panel, .steps li, .enquiry, .trust-item, .price-card, .faq-item, .cta-band-inner, .offer-inner, .honest-box'
  );
  els.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) en.target.classList.add('in');
      });
    },
    { threshold: 0.12 }
  );
  els.forEach((el) => io.observe(el));
}

function initForm() {
  const form = document.getElementById('enquiryForm');
  const status = document.getElementById('formStatus');
  const result = document.getElementById('aiResult');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      service: fd.get('service'),
      message: fd.get('message'),
      lang: currentLang(),
    };

    status.hidden = false;
    status.textContent = t('form_working');
    result.hidden = true;

    try {
      const res = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      document.getElementById('detectedLang').textContent = data.detectedLang || '-';
      document.getElementById('translationOut').textContent = data.translation || '';
      document.getElementById('replyOut').textContent = data.replyDraft || '';
      const mail = document.getElementById('mailtoLink');
      if (mail) mail.href = data.mailto || '#';
      result.hidden = false;
      status.textContent = data.summary || 'OK';
    } catch (err) {
      status.textContent = err.message || 'Error';
    }
  });

  document.getElementById('copyReply')?.addEventListener('click', async () => {
    const text = document.getElementById('replyOut')?.textContent || '';
    await navigator.clipboard.writeText(text);
  });
}

initI18n();
wireWhatsApp();
initCursorGlow();
initParticles();
initLogo3d();
initServiceLinks();
initOfferLinks();
initReveal();
initForm();
