// Conexao com o DMS real (MicroWork CLOUD), que fica atras de Cloudflare.
//
// POR QUE NAO chromium.launch(): o Cloudflare detecta o Chrome "lancado" pelo
// Playwright (flags de automacao + CDP) e trava no desafio "Um momento...".
// A solucao robusta e dirigir um Chrome REAL, aberto pelo proprio SO, com um
// perfil dedicado e persistente, e conectar o Playwright a ele via CDP. Esse
// perfil guarda o cookie de login E o clearance do Cloudflare entre execucoes,
// entao na maioria das vezes nem precisamos relogar.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import { config } from './config.js';

const CANDIDATOS_CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function acharChrome() {
  if (config.dms.chromePath) return config.dms.chromePath;
  const hit = CANDIDATOS_CHROME.find((p) => existsSync(p));
  if (!hit) throw new Error('Chrome/Edge nao encontrado. Defina DMS_CHROME_PATH no .env.');
  return hit;
}

function portaAberta(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
  });
}

async function esperarPorta(port, timeoutMs = 20000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    if (await portaAberta(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// Garante um Chrome real ouvindo na porta CDP (sobe um se nao houver).
// Detached + unref: o Chrome SOBREVIVE ao processo do bot, mantendo a sessao
// quente entre lancamentos. Fechar a conexao CDP nao mata esse Chrome.
export async function garantirChrome() {
  const port = config.dms.cdpPort;
  if (await portaAberta(port)) return;
  const exe = acharChrome();
  const profile = resolve(process.cwd(), config.dms.chromeProfile);
  const proc = spawn(exe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--start-maximized',
  ], { detached: true, stdio: 'ignore' });
  proc.unref();
  if (!(await esperarPorta(port))) {
    throw new Error(`Chrome nao abriu a porta CDP ${port}. Verifique DMS_CHROME_PATH.`);
  }
}

// Conecta o Playwright ao Chrome real. browser.close() depois apenas DESCONECTA.
export async function abrirDMS() {
  await garantirChrome();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.dms.cdpPort}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(config.dms.navTimeoutMs);
  return { browser, context, page };
}

const naTelaDeLogin = (page) => /login\.microworkcloud\.com\.br\/login/.test(page.url());

// Faz login se necessario. Idempotente: se o perfil ja tem sessao valida, o app
// abre direto e a funcao retorna sem digitar nada.
export async function login(page) {
  if (!config.dms.user || !config.dms.pass) {
    throw new Error('DMS_USER/DMS_PASS vazios no .env.');
  }
  // Entra pela URL do app -> ela cunha um token de login novo e redireciona.
  await page.goto(config.dms.entryUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  // Sem campo de senha visivel => sessao do perfil ainda vale: ja esta logado.
  const precisaLogar = await page.locator('#Password')
    .waitFor({ state: 'visible', timeout: 12000 }).then(() => true).catch(() => false);
  if (!precisaLogar) return { relogou: false };

  await page.fill('#Username', config.dms.user);
  await page.fill('#Password', config.dms.pass);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
    page.click('input[name="entrar"]'),
  ]);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (naTelaDeLogin(page)) {
    const erro = await page.locator('.validation-summary-errors, .alert-danger, .field-validation-error')
      .first().innerText().catch(() => '');
    throw new Error(`Login falhou${erro ? ': ' + erro.trim() : ' (credenciais?).'}`);
  }
  return { relogou: true };
}
