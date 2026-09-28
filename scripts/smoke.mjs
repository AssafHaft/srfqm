// End-to-end smoke test of the built app in headless Chromium.
// Usage: npm run build && npx vite preview --port 4173 & node scripts/smoke.mjs [baseUrl] [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'test-output';
mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('dialog', (d) => d.accept());

const step = (name) => console.log(`• ${name}`);
const expect = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

await page.goto(base);
await page.getByRole('button', { name: 'יצירת הצעה ראשונה' }).click();

step('customer details');
await page.getByLabel('שם הלקוח / האירוע').fill('יום הולדת 12 לנועה');
await page.getByLabel('תאריך האירוע').fill('2026-10-08');
await page.getByLabel('פרטים נוספים').fill('אירוע בפארק הגלישה');
await page.getByLabel('טלפון').fill('050-1234567');

step('one-off items');
const addItem = async (name, desc, qty, price) => {
  await page.getByRole('button', { name: 'פריט חד-פעמי' }).click();
  const card = page.locator('.item-card').last();
  await card.getByLabel('שם הפריט').fill(name);
  await card.getByLabel('תיאור הפריט').fill(desc);
  await card.getByLabel('כמות').fill(String(qty));
  await card.getByLabel('מחיר ליחידה').fill(String(price));
};
await addItem('גרלנדה באורך 100 מטר, 100 בתי נורה E27', 'כבל תאורה חיצוני לתלייה', 1, 1121.9);
await addItem('נורות LED ליבון 15W E27 A60, אור חם 2700K', 'מארז 3 נורות', 34, 37.7);
await addItem('התקנה', 'התקנת הגרלנדה והנורות באתר', 1, 1000);

const grand = async () => (await page.locator('.totals-summary__row--grand dd').innerText()).trim();
expect((await grand()) === '₪3,403.70', `grand total ${await grand()}`);
const vatRow = await page.locator('.qd-totals__row--shaded .qd-totals__value').first().innerText();
expect(vatRow.includes('519.21'), `document VAT row ${vatRow}`);

step('save an item to the catalog, reorder, VAT display mode, discount');
await page.locator('.item-card').first().getByRole('button', { name: 'שמירה לקטלוג' }).click();
await page.locator('.item-card').nth(2).getByRole('button', { name: 'הזזה למעלה' }).click();
expect((await page.locator('.item-card').nth(1).getByLabel('שם הפריט').inputValue()) === 'התקנה', 'reorder moved item up');
await page.getByRole('radio', { name: 'לפני מע"מ (מע"מ יתווסף)' }).click();
expect((await grand()) === '₪3,403.73', `excl-VAT grand total ${await grand()}`);
await page.getByRole('radio', { name: 'כולל מע"מ' }).click();
expect((await grand()) === '₪3,403.70', 'round trip without drift');
await page.getByRole('radio', { name: 'אחוז' }).click();
await page.getByLabel('אחוז הנחה').fill('10');
expect((await grand()) === '₪3,063.33', `discounted total ${await grand()}`);
await page.getByRole('radio', { name: 'ללא' }).click();
await page.getByLabel('הערות להצעה זו').fill('ביצוע ההזמנה מותנה באישור ההצעה בחתימה.');
await page.screenshot({ path: `${out}/editor-desktop.png` });

step('print path renders the same pages');
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${out}/from-app.pdf`, preferCSSPageSize: true, printBackground: true });
await page.emulateMedia({ media: 'screen' });

step('catalog picker adds saved item');
await page.getByRole('button', { name: 'הוספה מהקטלוג' }).click();
await page.locator('.picker-item').first().click();
await page.getByRole('button', { name: 'סיום' }).click();
const qtyAfter = await page.locator('.item-card').first().getByLabel('כמות').inputValue();
expect(qtyAfter === '2', `catalog add bumps quantity (got ${qtyAfter})`);

step('many items paginate onto a second page');
for (let i = 0; i < 12; i++) await addItem(`פריט נוסף ${i + 1}`, 'תיאור קצר', 1, 10);
const pages = await page.locator('.preview .qd-page').count();
expect(pages >= 2, `expected multiple pages, got ${pages}`);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${out}/multipage.pdf`, preferCSSPageSize: true, printBackground: true });
await page.emulateMedia({ media: 'screen' });

step('persistence across reload');
await page.waitForTimeout(600);
await page.reload();
await page.locator('.item-card').first().waitFor();
expect((await page.locator('.item-card').count()) === 15, 'items persisted');

step('quotes list, duplicate');
await page.goto(`${base}#/`);
await page.getByRole('button', { name: 'שכפול ההצעה' }).first().click();
await page.goto(`${base}#/`);
expect((await page.locator('.quote-row').count()) === 2, 'duplicate created');
await page.getByRole('button', { name: 'הצעה חדשה' }).click();
await page.getByRole('link', { name: 'חזרה לרשימה' }).click();
await page.waitForFunction(() => document.querySelectorAll('.quote-row').length === 2, null, { timeout: 3000 });
await page.screenshot({ path: `${out}/quotes-list.png` });

step('mobile layout');
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
m.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
await m.goto(base);
await m.getByRole('button', { name: 'יצירת הצעה ראשונה' }).click();
await m.getByLabel('שם הלקוח / האירוע').fill('אירוע חברה – צוות פיתוח');
await m.getByRole('button', { name: 'פריט חד-פעמי' }).click();
await m.locator('.item-card').last().getByLabel('שם הפריט').fill('שיעור גלישה קבוצתי');
await m.locator('.item-card').last().getByLabel('כמות').fill('25');
await m.locator('.item-card').last().getByLabel('מחיר ליחידה').fill('150');
await m.locator('.item-card').last().scrollIntoViewIfNeeded();
await m.screenshot({ path: `${out}/mobile-edit.png`, fullPage: false });
await m.getByRole('radio', { name: 'תצוגה מקדימה' }).click();
await m.screenshot({ path: `${out}/mobile-preview.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
expect(!overflow, 'no horizontal scroll on mobile');
await m.getByRole('radio', { name: 'עריכה' }).click();
const contained = await m.evaluate(() => {
  const card = document.querySelector('.item-card').getBoundingClientRect();
  return [...document.querySelectorAll('.item-card *')].every((el) => {
    const r = el.getBoundingClientRect();
    return r.width === 0 || (r.left >= card.left - 1 && r.right <= card.right + 1);
  });
});
expect(contained, 'item card content stays inside the card on mobile');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('smoke test passed');
