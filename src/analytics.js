/** Runtime fallback when Vite HTML inject is not used (e.g. some local flows). */

export function initAnalytics() {
  const gaId = (import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-H65FJQ44E0').trim();
  const gsc = (import.meta.env.VITE_GSC_VERIFICATION || '').trim();

  if (gsc && !document.querySelector('meta[name="google-site-verification"]')) {
    const meta = document.createElement('meta');
    meta.name = 'google-site-verification';
    meta.content = gsc;
    document.head.appendChild(meta);
  }

  if (!gaId || !/^G-[A-Z0-9]+$/i.test(gaId)) return;
  if (window.gtag || window.__bbrGaLoaded) return;
  window.__bbrGaLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(script);
}
