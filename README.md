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

## Live site

[https://boostbyrajat.co.in](https://boostbyrajat.co.in) opens the same site as [https://www.boostbyrajat.co.in](https://www.boostbyrajat.co.in). It is hosted on Render. The old `onrender.com` address redirects to this domain. `/api/health` stays on the Render host so the service can wake up.

Invoice desk (phone and laptop): [https://www.boostbyrajat.co.in/invoice.html](https://www.boostbyrajat.co.in/invoice.html)

Client invoice links use `PUBLIC_SITE_URL` (`https://www.boostbyrajat.co.in`).

### SEO (already included)
- Meta title/description/OG tags
- `public/robots.txt`
- `public/sitemap.xml` (update URL after deploy)
- Schema.org `ProfessionalService` JSON-LD
- Semantic headings + multilingual `lang` attribute

### Google Analytics + Search Console
1. Create a GA4 property → copy Measurement ID (`G-XXXX…`) into `.env` as `VITE_GA_MEASUREMENT_ID` (and Render env).
2. [Search Console](https://search.google.com/search-console) → Add property `https://www.boostbyrajat.co.in` → HTML tag verification → paste the `content` value as `VITE_GSC_VERIFICATION`.
3. Redeploy, then verify in Search Console and submit sitemap: `https://www.boostbyrajat.co.in/sitemap.xml`.

## Pages
- `/` — landing + enquiry (AI translate)
- `/desk.html` — password Translate Desk for WhatsApp pastes
- `/invoice.html` — password Invoice Desk (client deliverables, advance, pending, PDF, WhatsApp, email)

Login is username `rajat` plus `VENDOR_DESK_PASSWORD`. The owner can add other admins; the bill shows who prepared it. Translate Desk uses the same accounts. **Generate** saves a real invoice and sends the order confirmation through the official WhatsApp Cloud API (the same account the BBR Send panel uses): what the client gets, total, advance, and pending. Demo bills use a `DEMO-` number and stay out of invoice counts and earnings. Quotations use a `QT-` number, do not count as earnings, and save the client on the leads list for follow-up. There is no QR and no linked device. Until Meta approves the number, set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_TEMPLATE` — the bill still saves, and the confirmation goes out once those are present. The template is a utility order update with six body variables: client name, invoice number, total, advance, pending, and the public invoice link. Set `WHATSAPP_TEMPLATE_DOCUMENT=1` only if that template has a PDF header. Quotations send only when `WHATSAPP_QUOTE_TEMPLATE` is set; otherwise the estimate message is copied. **Send again** resends it. **Email** sends the PDF when `SMTP_*` is set; otherwise it downloads the PDF and opens your mail app. Clients can also open the link on `invoice-view.html`. Phone billing uses the Android shell in `android/` (see `android/README.md`).

## Brand
Logo: `public/brand/logo.png`
