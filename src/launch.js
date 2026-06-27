// STEP 2 — Playwright driving the REAL DMS (MicroWork CLOUD) via Chrome+CDP.
//
// Flow (new): starting from the invoice number (coming from Telegram):
//   login -> "Lancamento de Entrada" -> "Inserir"
//   -> Operation nature = "10 - COMPRA DE MERCADORIA PARA REVENDA" (fixed)
//   -> Movement type     = "2 - COMPRA DA FABRICA" (fixed)
//   -> "Chave de acesso" search icon -> "Integracao" popup
//   -> search the number -> click "selecionar" on the invoice -> wait (imports the XML)
//
// Does NOT click "Salvar" (saving is a future step, behind DMS_CONFIRM_SAVE).
// All the connection/login/Cloudflare logic lives in dms-browser.js.
import { openDMS, login } from './dms-browser.js';
import { config } from './config.js';

const ENTRY_PATH = '/v2/documentoentrada';

// Fixed header values (business rule: always the same).
const OPERATION_NATURE = { code: '10', regex: /10\s*-\s*COMPRA DE MERCADORIA PARA REVENDA/i };
const MOVEMENT_TYPE = { code: '2', regex: /^\s*2\s*-\s*COMPRA DA F[ÁA]BRICA/i };

// Only the digits of the "document number" (the cell comes as "10050/1").
const onlyDigits = (s) => (String(s).match(/\d+/) || [''])[0];

// Opens the "Lancamento de Entrada" screen (direct url is more stable than the card).
async function openEntryPosting(page) {
  const base = new URL(page.url()).origin;
  await page.goto(base + ENTRY_PATH, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  if (await page.locator('#insertbutton').isVisible().catch(() => false)) return;
  await page.goto(base + '/cloud/#/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByText('Lançamento de Entrada', { exact: false }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
}

// Selects an item in a remote Kendo ComboBox: waits for it to enable, types the
// code, waits for serverFiltering (delay 500ms + network) and clicks the matching
// item. Retries a few times because the remote list (especially the Movement type
// one, which depends on the Nature) sometimes takes a while to rebind — retyping unblocks.
async function selectKendoCombo(page, inputName, listboxId, text, regex, attempts = 3) {
  const input = page.locator(`input[name="${inputName}"]`);
  await input.waitFor({ state: 'visible', timeout: config.dms.navTimeoutMs });
  await page.waitForFunction((n) => {
    const el = document.querySelector(`input[name="${n}"]`);
    return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }, inputName, { timeout: 15000 }).catch(() => {});

  const item = page.locator(`#${listboxId} li`).filter({ hasText: regex }).first();
  for (let attempt = 0; attempt < attempts; attempt++) {
    await input.click();
    await input.fill('');
    await input.pressSequentially(text, { delay: 150 });
    await page.waitForTimeout(900);
    try {
      await item.waitFor({ state: 'visible', timeout: 6000 });
      await item.click();
      return;
    } catch {
      const items = await page.locator(`#${listboxId} li`).allInnerTexts().catch(() => []);
      console.log(`   [combo ${inputName}] tentativa ${attempt + 1}: itens=${JSON.stringify(items)}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  throw new Error(`ComboBox "${inputName}": opção para "${text}" não apareceu.`);
}

// 1) login -> Lancamento de Entrada -> Inserir -> form open.
export async function openInsertForm(page) {
  await login(page);
  await openEntryPosting(page);
  const insertButton = page.locator('#insertbutton');
  await insertButton.waitFor({ state: 'visible' });
  await insertButton.click();
  await page.waitForURL(/\/DocumentoEntrada\/Inserir/i, { timeout: config.dms.navTimeoutMs }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('input[name="IdPessoa_input"]').waitFor({ state: 'visible' });
}

// 2) Operation nature and Movement type (fixed values). Order matters: the type is
//    filtered by the nature, so the nature goes first.
export async function fillHeader(page) {
  await selectKendoCombo(page, 'IdNaturezaOperacao_input', 'IdNaturezaOperacao_listbox', OPERATION_NATURE.code, OPERATION_NATURE.regex);
  await page.waitForLoadState('networkidle').catch(() => {}); // the Nature reloads the Type list
  await page.waitForTimeout(800);
  await selectKendoCombo(page, 'IdMercadoriaMovimentoTipo_input', 'IdMercadoriaMovimentoTipo_listbox', MOVEMENT_TYPE.code, MOVEMENT_TYPE.regex);
}

// 3) Opens the "Integracao" popup, searches by number and selects the invoice.
//    select=false: only locates the invoice (test mode, without importing the XML).
export async function selectInvoiceByNumber(page, invoiceNumber, { select = true } = {}) {
  const num = onlyDigits(invoiceNumber);
  if (!num) return { ok: false, message: 'Número da nota inválido.' };

  // The search icon only enables after Nature + Type are filled.
  await page.waitForFunction(() => {
    const b = document.querySelector('#NFeChaveAcessoLista');
    return b && !b.disabled;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.locator('#NFeChaveAcessoLista').click({ force: true });

  await page.locator('#windowDocumentoEntradaIntegracao').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#GridIntegracao').waitFor({ state: 'visible', timeout: 20000 });

  // Search by number (shrinks the list; it can have hundreds of invoices).
  await page.fill('#DocumentoEntradaIntegracao_text', num);
  await page.click('#DocumentoEntradaIntegracao_textButton');
  await page.waitForTimeout(1800);
  await page.waitForLoadState('networkidle').catch(() => {});

  // Find the row whose "document number" (3rd column) matches the number.
  const rows = page.locator('#GridIntegracao tbody tr');
  const total = await rows.count();
  let target = null;
  for (let i = 0; i < total; i++) {
    const cell = (await rows.nth(i).locator('td').nth(2).innerText().catch(() => '')).trim();
    if (onlyDigits(cell) === num) { target = rows.nth(i); break; }
  }
  if (!target) return { ok: false, message: `Nota número ${num} não encontrada na lista de integração.` };
  if (!select) return { ok: true, selected: false };

  await target.locator('a.k-grid-buttonSelecionarGridXML').click();
  await page.waitForTimeout(2500); // XML import
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ok: true, selected: true };
}

// Orchestrates the whole flow starting from the invoice number.
export async function launchByNumber(invoiceNumber, { select = true } = {}) {
  if (!onlyDigits(invoiceNumber)) return { status: 'erro', message: 'Número da nota não informado.' };
  const { browser, page } = await openDMS();
  try {
    await openInsertForm(page);
    await fillHeader(page);
    const result = await selectInvoiceByNumber(page, invoiceNumber, { select });
    if (!result.ok) return { status: 'erro', message: result.message };
    return {
      status: 'ok',
      stage: result.selected ? 'nota-selecionada' : 'nota-encontrada',
      message: result.selected
        ? `Nota ${onlyDigits(invoiceNumber)} selecionada no DMS (XML importado). ` +
          'Revise e clique Salvar manualmente — gravação automática ainda desativada.'
        : `Nota ${onlyDigits(invoiceNumber)} encontrada na lista (seleção não executada).`,
    };
  } catch (e) {
    return { status: 'erro', message: String(e?.message ?? e) };
  } finally {
    await browser.close(); // only DISCONNECTS; the Chrome (session) stays open
  }
}

// Compat: goes only up to the open form (used by the test-dms.js smoke test).
export async function launchInDMS() {
  const { browser, page } = await openDMS();
  try {
    await openInsertForm(page);
    return { status: 'ok', stage: 'formulario-aberto', message: 'Formulário de inserção aberto no DMS.' };
  } catch (e) {
    return { status: 'erro', message: String(e?.message ?? e) };
  } finally {
    await browser.close();
  }
}
