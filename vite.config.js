import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gsc = (env.VITE_GSC_VERIFICATION || 'QFW5XG3zc0n2irgNVCW5eMlRx6plJE1agwFd8XPGeU0').trim();
  const gaId = (env.VITE_GA_MEASUREMENT_ID || 'G-H65FJQ44E0').trim();

  const headSnippets = [];
  if (gsc) {
    headSnippets.push(
      `<meta name="google-site-verification" content="${gsc.replace(/"/g, '')}" />`,
    );
  }
  if (gaId && /^G-[A-Z0-9]+$/i.test(gaId)) {
    headSnippets.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}',{anonymize_ip:true});</script>`,
    );
  }
  const inject = headSnippets.join('\n  ');

  return {
    root: '.',
    publicDir: 'public',
    appType: 'mpa',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          desk: path.resolve(__dirname, 'desk.html'),
          invoice: path.resolve(__dirname, 'invoice.html'),
          invoiceView: path.resolve(__dirname, 'invoice-view.html'),
          collect: path.resolve(__dirname, 'collect.html'),
          websites: path.resolve(__dirname, 'products/websites.html'),
          apps: path.resolve(__dirname, 'products/apps.html'),
          instagram: path.resolve(__dirname, 'products/instagram.html'),
          ads: path.resolve(__dirname, 'products/ads.html'),
          whatsapp: path.resolve(__dirname, 'products/whatsapp.html'),
          terms: path.resolve(__dirname, 'legal/terms.html'),
          refund: path.resolve(__dirname, 'legal/refund.html'),
          privacy: path.resolve(__dirname, 'legal/privacy.html'),
        },
      },
    },
    plugins: inject
      ? [
          {
            name: 'inject-google',
            transformIndexHtml(html, ctx) {
              if (!inject) return html;
              const file = String(ctx?.filename || '');
              if (file.includes('invoice')) return html;
              return html.replace('</head>', `  ${inject}\n</head>`);
            },
          },
        ]
      : [],
  };
});
