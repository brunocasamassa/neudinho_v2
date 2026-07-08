// Connection to the real DMS (MicroWork CLOUD), which sits behind Cloudflare.
//
// WHY NOT chromium.launch(): Cloudflare detects the Chrome "launched" by
// Playwright (automation flags + CDP) and gets stuck on the "Just a moment..."
// challenge. The robust solution is driving a REAL Chrome, opened by the OS
// itself, with a dedicated persistent profile, and connecting Playwright to it
// over CDP. That profile keeps the login cookie AND the Cloudflare clearance
// between runs, so most of the time we don't even need to log in again.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { config } from './config.js';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findChrome() {
  if (config.dms.chromePath) return config.dms.chromePath;
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome/Edge nao encontrado. Defina DMS_CHROME_PATH no .env.');
  return hit;
}

function isPortOpen(port) {
  return new Promise((res) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); res(true); });
    socket.once('error', () => res(false));
  });
}

async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// Ensures a real Chrome listening on the CDP port (spawns one if there is none).
// Detached + unref: the Chrome SURVIVES the bot process, keeping the session warm
// between launches. Closing the CDP connection does not kill that Chrome.
export async function ensureChrome() {
  const port = config.dms.cdpPort;
  if (await isPortOpen(port)) return;
  const exe = findChrome();
  const profile = resolve(process.cwd(), config.dms.chromeProfile);
  const child = spawn(exe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--start-maximized',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  if (!(await waitForPort(port))) {
    throw new Error(`Chrome nao abriu a porta CDP ${port}. Verifique DMS_CHROME_PATH.`);
  }
}

// Connects Playwright to the real Chrome. browser.close() afterwards only DISCONNECTS.
export async function openDMS() {
  await ensureChrome();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.dms.cdpPort}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(config.dms.navTimeoutMs);
  return { browser, context, page };
}

const isOnLoginPage = (page) => /login\.microworkcloud\.com\.br\/login/.test(page.url());

// Logs in if needed. Idempotent: if the profile already has a valid session, the
// app opens straight away and the function returns without typing anything.
export async function login(page) {
  if (!config.dms.user || !config.dms.pass) {
    throw new Error('DMS_USER/DMS_PASS vazios no .env.');
  }
  // Enter through the app url -> it mints a fresh login token and redirects.
  await page.goto(config.dms.entryUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  // No visible password field => the profile session is still valid: already logged in.
  const needsLogin = await page.locator('#Password')
    .waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
  if (!needsLogin) return { reloggedIn: false };

  await page.fill('#Username', config.dms.user);
  await page.fill('#Password', config.dms.pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('input[name="entrar"]'),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (isOnLoginPage(page)) {
    const error = await page.locator('.validation-summary-errors, .alert-danger, .field-validation-error')
      .first().innerText().catch(() => '');
    throw new Error(`Login falhou${error ? ': ' + error.trim() : ' (credenciais?).'}`);
  }
  return { reloggedIn: true };
}
