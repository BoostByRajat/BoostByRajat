# BoostByRajat

Single-vendor digital studio site — websites, apps, Instagram handling, ad runs.  
3D professional landing + multi-language UI + free Groq AI translate desk.

## Local run

```bash
cd D:\BoostByRajat
npm install
npm run dev
```

Open http://localhost:5173

## .env (free)

```
GROQ_API_KEY=...
AI_PROVIDER=groq
VENDOR_LANG=hi
VENDOR_DESK_PASSWORD=change-me
WHATSAPP_NUMBER=91XXXXXXXXXX
VITE_WHATSAPP_NUMBER=91XXXXXXXXXX
PUBLIC_EMAIL=you@email.com
```

## Free host + free “domain” (₹0)

True custom domains (`.com`) usually cost money. Free options that work well:

### Option A — Render (recommended for this app)
1. Push this folder to a free GitHub repo
2. [render.com](https://render.com) → New Web Service → connect repo
3. Or use `render.yaml` (Blueprint)
4. Free URL like: `https://boostbyrajat.onrender.com`
5. Add env vars from `.env` in Render dashboard

### Option B — free subdomain aliases
- Keep Render/Netlify URL as main
- Optional free subdomain via [is-a.dev](https://www.is-a.dev/) pointing to your host (DNS CNAME)

### SEO (already included)
- Meta title/description/OG tags
- `public/robots.txt`
- `public/sitemap.xml` (update URL after deploy)
- Schema.org `ProfessionalService` JSON-LD
- Semantic headings + multilingual `lang` attribute

After deploy: Search Console mein free property add karke sitemap submit karo.

## Pages
- `/` — landing + enquiry (AI translate)
- `/desk.html` — password Translate Desk for WhatsApp pastes

## Brand
Logo: `public/brand/logo.png`
