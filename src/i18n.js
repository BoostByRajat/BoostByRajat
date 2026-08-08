import en from './locales/en.json';
import hi from './locales/hi.json';
import zh from './locales/zh.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

const dicts = { en, hi, zh, es, fr, ar };
const rtl = new Set(['ar']);

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
];

function detectLang() {
  const saved = localStorage.getItem('bbr_lang');
  if (saved && dicts[saved]) return saved;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return dicts[nav] ? nav : 'en';
}

let lang = detectLang();

export function t(key) {
  return dicts[lang]?.[key] || dicts.en[key] || key;
}

export function applyI18n() {
  document.documentElement.lang = lang;
  document.documentElement.dir = rtl.has(lang) ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });
  const select = document.getElementById('langSelect');
  if (select) select.value = lang;
}

export function initI18n() {
  const select = document.getElementById('langSelect');
  if (select) {
    select.innerHTML = LANGS.map(
      (l) => `<option value="${l.code}">${l.label}</option>`
    ).join('');
    select.value = lang;
    select.addEventListener('change', () => {
      lang = select.value;
      localStorage.setItem('bbr_lang', lang);
      applyI18n();
    });
  }
  applyI18n();
  return () => lang;
}

export function currentLang() {
  return lang;
}
