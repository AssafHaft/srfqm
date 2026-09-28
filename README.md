# מחולל הצעות מחיר – SRF PARK TLV

Branded quote maker for the surf park. It runs as a static, installable web app (PWA) on GitHub Pages and
exports quotes as PDFs that match the approved sample design. The interface is in Hebrew (RTL).

- **Architecture, trade-offs, privacy model and roadmap:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- The price list, quotes and customer data stay in the browser on each device and in backup files you export.
  They are never stored in this public repository or on the site.

## Using it

1. **Catalog (קטלוג):** add your items and default prices, or load a price-list file.
2. **New quote (הצעה חדשה):** fill in the customer and event, then add items from the catalog or as one-off items,
   set VAT display and any discount, and add notes. The preview updates live.
3. **Save as PDF (שמירה כ-PDF):** the print dialog opens; choose **Save as PDF**. Use Chrome or Edge for identical
   output on every device.
4. **Back up** from Settings (הגדרות) regularly, and to move data to another device.

Install it on a phone or tablet with "Add to Home Screen". The app then works offline, and on iOS this also
protects the stored data.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (pricing, VAT, pagination, backups)
npm run build        # typecheck + production build into dist/
npx vite preview --port 4173 & node scripts/smoke.mjs   # end-to-end smoke test in headless Chromium
node scripts/render-pdf.mjs fixtures/demo-quote.json test-output/demo.pdf   # render a fixture to PDF (needs npm run dev)
```

Locked branding lives in `src/brand/brand.ts` (company details, labels, standard terms) and
`src/styles/document.css` (the quote design). The app never lets users edit either.

## Deployment (GitHub Pages)

The workflow in `.github/workflows/ci.yml` runs tests, the build and a browser smoke test on every PR. On every
push to `main` it also deploys to GitHub Pages.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is then served at
`https://assafhaft.github.io/srfqm/`.
