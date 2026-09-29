// End-to-end test of quote sync against the local Firebase emulators (Auth + Firestore, real security rules).
// Usage: npm run build && npx vite preview --port 4173 & node scripts/cloud-e2e.mjs [baseUrl]
// Needs Java (for the Firestore emulator). The owner sets everything up through the in-app wizard.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4173/';
const dir = resolve('test-output/emulator');
const PROJECT = 'demo-srfqm';
const OWNER = 'owner@srfpark.test';
const STAFF = 'staff@srfpark.test';
const STRANGER = 'stranger@srfpark.test';
const PASSWORD = 'gal-gadol-2026';
const snippet = `const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "${PROJECT}.firebaseapp.com",
  projectId: "${PROJECT}",
  appId: "1:123:web:abc"
};`;

const step = (name) => console.log(`• ${name}`);
const expect = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

// ---- emulators (rules start as deny-all; the owner pastes the generated ones during setup)
mkdirSync(dir, { recursive: true });
const rulesPath = `${dir}/firestore.rules`;
writeFileSync(rulesPath, "rules_version = '2';\nservice cloud.firestore { match /databases/{d}/documents { match /{x=**} { allow read, write: if false; } } }\n");
writeFileSync(
  `${dir}/firebase.json`,
  JSON.stringify({ emulators: { auth: { port: 9099 }, firestore: { port: 8080 }, ui: { enabled: false }, singleProjectMode: true }, firestore: { rules: 'firestore.rules' } }),
);
let emu = null;
let emuLog = '';
const stopEmu = () => emu?.kill('SIGINT');
process.on('exit', stopEmu);
/** (Re)starts the emulators. Rules are loaded at start-up (hot reloading them is not reliable behind a proxy). */
async function startEmulators() {
  if (emu) {
    const exited = new Promise((r) => emu.once('exit', r));
    stopEmu();
    await exited;
    await new Promise((r) => setTimeout(r, 1500));
  }
  emuLog = '';
  emu = spawn(resolve('node_modules/.bin/firebase'), ['emulators:start', '--project', PROJECT], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  emu.stdout.on('data', (d) => (emuLog += d));
  emu.stderr.on('data', (d) => (emuLog += d));
  for (let i = 0; i < 120 && !emuLog.includes('All emulators ready'); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!emuLog.includes('All emulators ready')) {
    console.error(emuLog);
    throw new Error('emulators did not start');
  }
}
await startEmulators();

/** Clicks the link in the verification e-mail (the Auth emulator exposes sent e-mails over REST). */
async function verifyEmail(email) {
  let code;
  // The e-mail is sent right after the account is created, so it can lag the UI by a moment.
  for (let i = 0; i < 40 && !code; i++) {
    const { oobCodes } = await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
    code = oobCodes.reverse().find((c) => c.email === email && c.requestType === 'VERIFY_EMAIL');
    if (!code) await new Promise((r) => setTimeout(r, 250));
  }
  expect(code, `verification e-mail sent to ${email}`);
  await fetch(code.oobLink);
}

const errors = [];
const browser = await chromium.launch();
let published = null;

async function device(name, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => localStorage.setItem('srfqm.cloudEmulator', '1'));
  await ctx.route('**/catalog.enc.json*', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('**/cloud.json*', (r) => (published ? r.fulfill({ json: published }) : r.fulfill({ status: 404, body: '' })));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(`  [${name} ${m.type()}] ${m.text().slice(0, 300)}`));
  page.on('dialog', (d) => d.accept());
  page.on('requestfailed', (r) => console.log(`  [${name} requestfailed] ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
  return page;
}

const cloudPill = (p) => p.locator('.topbar__cloud');
const waitSynced = (p) => p.locator('.topbar__cloud.cloud-pill--synced').waitFor({ timeout: 20000 });
const rowNames = (p) => p.locator('.quote-row__name').allInnerTexts();
async function waitForRows(p, predicate, what) {
  for (let i = 0; i < 40; i++) {
    const names = await rowNames(p);
    if (predicate(names)) return names;
    await p.waitForTimeout(250);
  }
  throw new Error(`timed out waiting for: ${what} (have ${JSON.stringify(await rowNames(p))})`);
}
async function newQuote(p, name) {
  await p.goto(`${base}#/`);
  await p.getByRole('button', { name: 'הצעה חדשה', exact: true }).click();
  await p.getByLabel('שם הלקוח / האירוע').fill(name);
  await p.getByRole('button', { name: 'פריט חד-פעמי' }).click();
  await p.locator('.item-card').last().getByLabel('שם הפריט').fill('שיעור גלישה');
  await p.locator('.item-card').last().getByLabel('מחיר ליחידה').fill('150');
  await p.waitForTimeout(900); // debounce → upload
  return (await p.locator('.editor__number').innerText()).trim();
}
async function signUpAndVerify(p, email) {
  await p.goto(`${base}#/settings`);
  await p.getByLabel('אימייל', { exact: true }).fill(email);
  await p.getByLabel('סיסמה', { exact: true }).fill(PASSWORD);
  await p.getByRole('button', { name: 'יצירת חשבון' }).click();
  await p.getByText('שלחנו מייל אימות').waitFor();
  await verifyEmail(email);
  await p.getByRole('button', { name: 'אימתתי' }).click();
}

try {
  step('PC: a quote made before sync exists');
  const pc = await device('pc', { width: 1360, height: 900 });
  await pc.goto(base);
  const firstNumber = await newQuote(pc, 'בר מצווה דניאל');
  expect(firstNumber.endsWith('0001'), `first local number ${firstNumber}`);

  step('PC: owner runs the setup wizard');
  await pc.goto(`${base}#/settings`);
  await pc.getByRole('button', { name: 'הגדרת סנכרון (פעם אחת)' }).click();
  await pc.getByLabel('האימייל של בעל העסק').fill(OWNER);
  const rules = await pc.getByLabel('כללי אבטחה').inputValue();
  expect(rules.includes(OWNER), 'rules include the owner');
  writeFileSync(rulesPath, rules); // = pasting the rules into the Firebase console
  await startEmulators();
  await pc.getByLabel('הגדרות Firebase').fill(snippet);
  await pc.getByText(`זוהה הפרויקט ${PROJECT}`).waitFor();
  const [download] = await Promise.all([pc.waitForEvent('download'), pc.getByRole('button', { name: 'שמירה וחיבור' }).click()]);
  published = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(published.owner === OWNER && published.firebase.projectId === PROJECT, 'cloud.json content');
  await pc.getByRole('button', { name: 'סיימתי' }).click();
  await pc.screenshot({ path: 'test-output/cloud-signin.png' });

  step('PC: owner creates an account, verifies e-mail, quotes upload');
  await signUpAndVerify(pc, OWNER);
  await waitSynced(pc);
  await pc.getByLabel('אימייל של משתמש חדש').fill(STAFF);
  await pc.getByRole('button', { name: 'הוספה' }).click();
  await pc.getByText(STAFF).waitFor();
  await pc.screenshot({ path: 'test-output/cloud-owner.png' });

  step('Phone: finds the cloud automatically, staff signs up and sees the PC quote');
  const phone = await device('phone', { width: 390, height: 844 });
  await phone.goto(base);
  await phone.getByText('התחברו לסנכרון').waitFor({ timeout: 15000 });
  await signUpAndVerify(phone, STAFF);
  await waitSynced(phone);
  await phone.goto(`${base}#/`);
  await waitForRows(phone, (n) => n.includes('בר מצווה דניאל'), 'PC quote on phone');
  await phone.screenshot({ path: 'test-output/cloud-phone-list.png' });

  step('Phone → PC: a new quote appears live, with the next shared number');
  const phoneNumber = await newQuote(phone, 'יום הולדת לנועה');
  await pc.goto(`${base}#/`);
  await waitForRows(pc, (n) => n.includes('יום הולדת לנועה'), 'phone quote on PC');
  const pcNumber = await newQuote(pc, 'אירוע חברה');
  await phone.goto(`${base}#/`);
  await waitForRows(phone, (n) => n.includes('אירוע חברה'), 'second PC quote on phone');
  const numbers = new Set([firstNumber, phoneNumber, pcNumber]);
  expect(numbers.size === 3, `unique numbers across devices: ${[...numbers]}`);

  step('Edits and deletions sync both ways');
  await pc.goto(`${base}#/`);
  await pc.locator('.quote-row', { hasText: 'יום הולדת לנועה' }).locator('.quote-row__link').click();
  await pc.getByLabel('שם הלקוח / האירוע').fill('יום הולדת 12 לנועה');
  await pc.waitForTimeout(900);
  await phone.goto(`${base}#/`);
  await waitForRows(phone, (n) => n.includes('יום הולדת 12 לנועה'), 'edit on phone');
  await phone.locator('.quote-row', { hasText: 'אירוע חברה' }).getByRole('button', { name: 'מחיקת ההצעה' }).click();
  await pc.goto(`${base}#/`);
  await waitForRows(pc, (n) => !n.includes('אירוע חברה'), 'deletion on PC');

  step('Shared settings');
  await pc.goto(`${base}#/settings`);
  await pc.getByLabel('שיעור מע"מ').fill('17');
  await phone.waitForTimeout(1500);
  await phone.goto(`${base}#/settings`);
  expect((await phone.getByLabel('שיעור מע"מ').inputValue()) === '17', 'VAT rate synced to phone');

  step('Offline edits reach the other device after reconnecting');
  await phone.context().setOffline(true);
  await phone.goto(`${base}#/`).catch(() => undefined);
  await phone.locator('.quote-row', { hasText: 'בר מצווה דניאל' }).locator('.quote-row__link').click();
  await phone.getByLabel('פרטים נוספים').fill('נערך במצב לא מקוון');
  await phone.waitForTimeout(900);
  await phone.context().setOffline(false);
  await pc.goto(`${base}#/`);
  await pc.locator('.quote-row', { hasText: 'בר מצווה דניאל' }).locator('.quote-row__link').click();
  for (let i = 0; i < 40 && (await pc.getByLabel('פרטים נוספים').inputValue()) !== 'נערך במצב לא מקוון'; i++) await pc.waitForTimeout(250);
  expect((await pc.getByLabel('פרטים נוספים').inputValue()) === 'נערך במצב לא מקוון', 'offline edit synced');

  step('Security: an account the owner did not add cannot read quotes');
  const stranger = await device('stranger', { width: 1200, height: 800 });
  await stranger.goto(base);
  await signUpAndVerify(stranger, STRANGER);
  await stranger.locator('.topbar__cloud.cloud-pill--not-member').waitFor({ timeout: 15000 });
  await stranger.goto(`${base}#/`);
  expect((await rowNames(stranger)).length === 0, 'stranger sees no quotes');
  const denied = await stranger.evaluate(async (project) => {
    const res = await fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/quotes`);
    return res.status;
  }, PROJECT);
  expect(denied === 403, `unauthenticated REST read denied (got ${denied})`);
} catch (err) {
  console.log('--- emulator log (tail) ---\n' + emuLog.split('\n').filter((l) => !/::1|4400|4500|9150|9151|different port|connectivity/.test(l)).slice(-25).join('\n'));
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: `test-output/cloud-fail-${browser.contexts().indexOf(ctx)}.png` }).catch(() => undefined);
  throw err;
} finally {
  await browser.close();
  stopEmu();
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('cloud e2e passed');
process.exit(0);
