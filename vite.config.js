import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
        collect: path.resolve(__dirname, 'collect.html'),
        websites: path.resolve(__dirname, 'products/websites.html'),
        apps: path.resolve(__dirname, 'products/apps.html'),
        instagram: path.resolve(__dirname, 'products/instagram.html'),
        ads: path.resolve(__dirname, 'products/ads.html'),
        terms: path.resolve(__dirname, 'legal/terms.html'),
        refund: path.resolve(__dirname, 'legal/refund.html'),
        privacy: path.resolve(__dirname, 'legal/privacy.html'),
      },
    },
  },
});
