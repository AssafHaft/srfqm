# Architecture decision: static PWA on GitHub Pages

## Recommendation

Build it as a **static, installable web app (PWA) hosted free on GitHub Pages**, with PDFs produced by the
browser's own print engine and all business data kept on the device (IndexedDB) plus JSON backup files.
This is the approach implemented here.

## Web app vs. local app

| | Static PWA (chosen) | Local desktop app (Electron / Tauri) |
|---|---|---|
| Cost | Free (GitHub Pages) | Free to build; code-signing certificates cost money to avoid OS warnings |
| Devices | Any browser: PC, Mac, iPhone, iPad, Android | Desktop only; a phone/tablet version is a separate project |
| Install and updates | Open a link, optionally "Add to Home Screen"; updates on next launch | Install on every machine, ship updates to each one |
| Offline | Yes (service worker caches the app) | Yes |
| PDF quality | Vector PDF from the browser engine | Same vector PDF from the same engine (Electron uses Chromium's `printToPDF`) |
| PDF workflow | "Save as PDF" in the print dialog (one extra click) | Can save the file directly without a dialog |
| Data | Per device and browser; move it with backup files | Per machine; same backup question |

The only real advantage of a local app is saving the PDF without the print dialog. It does not offer better PDF
quality, and it would not run on phones or tablets.

## PDF quality and Hebrew RTL

The sample quote was itself produced by Chromium's "Save as PDF" (PDF metadata: `Creator: Chromium`,
`Producer: Skia/PDF`). The app uses exactly that path:

- The quote is laid out in HTML/CSS and paginated into fixed A4 pages. The **same page elements** are used for
  the on-screen preview and for printing, so the PDF matches the preview exactly.
- Output is vector: embedded and subset Heebo fonts, selectable and searchable text, about 60–70 KB per quote (the logo is vector).
- RTL and mixed Hebrew/English/number text (e.g. `נורות LED 15W E27`, `₪1,121.90`) are shaped by the browser's text
  engine, the same one a local Electron app would use. Amounts, dates and quote numbers are isolated as LTR runs,
  so minus signs and `₪` never jump sides.
- Fonts are bundled with the app (no Google Fonts request), so the output is the same offline.
- Checked by rendering the sample quote's content with the app and comparing coordinates with the original PDF:
  every text baseline, rule and box is within 1 px.

JavaScript PDF libraries were rejected. `jsPDF` and `pdfmake` do not handle bidirectional text properly, and
`html2canvas`-style tools produce blurry raster PDFs whose text cannot be selected.

**Caveats**

- Use Chrome or Edge to export, so the output is always the same. Safari and Firefox also work, but the file may
  differ very slightly.
- The browser cannot write a PDF file without the print dialog. The app sets the default file name
  (`הצעת מחיר <number> <customer>`) and hides print headers and footers automatically.
- iPhone and iPad: use Print, then Share, then Save to Files or WhatsApp. Test this in the installed home-screen
  app on your devices.

## Privacy: the site is public

GitHub Pages sites, and the repository on a free plan, are public. The design keeps anything sensitive out of
them:

- **The site's files contain the app, the branding** (logo, company name, ח.פ., address and standard terms, all of
  which already appear on every quote), **and the shared catalog encrypted with a password**.
- **Quotes and customer details live only in the browser's IndexedDB** on each device and are never uploaded.
- **Shared catalog** (see `docs/CATALOG-GUIDE.md` for the step-by-step user guide):
  - The owner edits the catalog in the app or in Excel (export → edit → import, with a preview of every change).
  - **פרסום לאתר** encrypts `{catalog, catalogPricesIncludeVat}` with the catalog password (PBKDF2-SHA256, 310,000
    iterations → AES-256-GCM, in the browser) and commits it as `public/catalog.enc.json` through the GitHub
    contents API. The commit triggers the normal CI deploy (about 1–2 minutes).
  - The commit uses a fine-grained personal access token limited to this repository's contents. The token and the
    catalog password are stored only in that device's browser (localStorage). They are never in backups, the
    repository or the published file.
  - Every device fetches `catalog.enc.json` on launch and when the app returns to the foreground. A newer catalog
    is installed automatically once the device knows the password. If this device has unpublished catalog
    changes, it asks instead of overwriting them.
  - Without a token, publishing downloads the encrypted file and walks the user through uploading it on GitHub's
    website.
  - Only `publishedAt` is readable without the password. Choose a long password: the file is public, so a short
    one could be brute-forced offline.
- **Full backup** (Settings → גיבוי ושחזור): catalog, settings and all quotes, as a local file. Exported files end
  in `.backup.json`, which `.gitignore` blocks from the repository.
- Browsers can evict site data. The app requests persistent storage, and installing it to the home screen protects
  data on iOS. The quotes list reminds the user to back up every 14 days.

**Options if you need more privacy later**

1. Make the app itself private: move hosting to **Cloudflare Pages + Cloudflare Access** (free for up to 50 users;
   visitors sign in with an email code). The repository can then be private too.
2. Shared quotes across staff (shared quote numbering, one quotes list): add a hosted database such as Supabase or
   Firebase, both of which have free tiers. This is the point at which a backend becomes necessary.

## How it is built

```
src/
  brand/        LOCKED: company details, labels, standard terms, logo
  styles/       document.css (LOCKED quote design), app.css (editor UI), print.css
  doc/          quote document: view model, A4 pagination, page components
  lib/          pure logic: money (integer agorot), VAT/pricing, dates, numbering, item ordering,
                packages, Excel conversion, encryption
  model/        data types, defaults, validation of stored and imported data
  store/        state (Preact signals), IndexedDB persistence, backup files, catalog publishing (sync.ts)
  views/        quotes list, quote editor, catalog, settings
```

- **Stack**: Vite, TypeScript and Preact (about 28 KB gzipped JS), `vite-plugin-pwa` for offline use and
  installation, and `idb-keyval` for storage.
- **Pricing**: all amounts are integer agorot. Each line stores its price together with its VAT basis, so
  switching a quote between "כולל מע"מ" and "לפני מע"מ" converts on the fly with no rounding drift. In
  VAT-inclusive mode VAT is extracted from the total, which reproduces the sample exactly: 3,403.70 = 2,884.49 +
  519.21. The VAT rate is a setting and is also captured on each quote, so a rate change never silently alters an
  existing quote.
- **Locked branding**: nothing in `src/brand` or `document.css` can be edited from the UI. Users edit content only.
- **Pagination**: every block is measured off-screen, then split into A4 pages. The table header repeats on each
  page, a category heading stays with its first item, the totals never sit alone on a page, and page numbers
  appear when there is more than one page. The pagination logic is unit-tested.

## Roadmap

**Phase 1: MVP (this PR)**
Quote editor (customer and event details, line items with reorder and categories, one-off items), catalog with
default prices, VAT setting and display modes, % or ₪ discounts, live branded preview, PDF export, automatic
numbering and validity dates, autosave, quotes list with duplicate and status, JSON backup and price-list files,
installable offline PWA, Hebrew RTL UI for phone, tablet and desktop.

**Phase 2: in suggested priority order**
1. ~~Ready-made packages~~ (done): a package adds a set of items to a quote in one click. Create one with
   "שמירת הפריטים כחבילה" in the editor, or on the catalog page. Catalog-linked items always use current catalog
   prices. Packages travel with the price-list file.
2. Share: WhatsApp and email with the PDF, using the Web Share API on phones.
3. Drag-and-drop reordering, in addition to the arrow buttons.
4. Internal cost per catalog item and a margin readout in the editor. It stays local and never appears on the PDF.
5. ~~Shared catalog~~ (done): Excel export/import and encrypted publishing to every device (see above).
6. English interface and English quote template.
7. If several staff members need shared data: private hosting and/or a small hosted database (see above).
