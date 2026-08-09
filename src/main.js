import { initI18n, t } from './i18n.js';
import { initNavToggle, wireWhatsApp, initCursorGlow, ensureIndiaFlag } from './shell.js';
import { initChat } from './chat.js';

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

function initOfferLinks() {
  document.querySelectorAll('.wa-offer[data-service]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const select = document.getElementById('serviceSelect');
      if (select) select.value = btn.dataset.service;
    });
  });
}

function initReveal() {
  const els = document.querySelectorAll(
    '.section-head, .svc-row, .work-panel, .steps li, .enquiry, .trust-item, .price-card, .faq-item, .cta-band-inner, .offer-inner, .honest-box, .page-card, .demo-card, .world-globe, .world-points li'
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
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      service: String(fd.get('service') || 'other'),
      message: String(fd.get('message') || '').trim(),
    };

    status.hidden = false;
    status.textContent = t('form_working');

    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      status.textContent = t('form_done') || 'Saved — WhatsApp opening…';
      form.reset();
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, '_blank', 'noopener');
      }
    } catch (err) {
      status.textContent = err.message || 'Error';
    }
  });
}

initI18n();
initNavToggle();
wireWhatsApp(['waTop', 'waHero', 'waSticky', 'waBand', 'waOffer', 'waPage']);
initCursorGlow();
ensureIndiaFlag();
initChat();
initParticles();
initLogo3d();
initServiceLinks();
initOfferLinks();
initReveal();
initForm();
