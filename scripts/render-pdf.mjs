// Renders a quote fixture to PDF with headless Chromium — the same engine as Chrome's "Save as PDF".
// Usage: node scripts/render-pdf.mjs <fixture.json> <out.pdf> [baseUrl]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [fixturePath = 'fixtures/demo-quote.json', out = 'test-output/demo.pdf', base = 'http://localhost:5173'] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript((f) => (window.__FIXTURE__ = f), fixture);
await page.goto(`${base}/harness.html`);
await page.waitForFunction(() => window.__READY__ === true);
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
const pages = await page.evaluate(() => window.__PAGES__);
console.log(`wrote ${out} (${pages} page${pages === 1 ? '' : 's'})`);
await browser.close();
