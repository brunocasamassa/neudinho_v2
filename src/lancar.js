// ETAPA 2 — Playwright dirigindo o DMS REAL (MicroWork CLOUD) via Chrome+CDP.
//
// Fluxo (novo): a partir do numero da nota (vindo do Telegram):
//   login -> "Lancamento de Entrada" -> "Inserir"
//   -> Natureza de operacao = "10 - COMPRA DE MERCADORIA PARA REVENDA" (fixo)
//   -> Tipo de movimento    = "2 - COMPRA DA FABRICA" (fixo)
//   -> lupa da "Chave de acesso" -> popup "Integracao"
//   -> busca o numero -> clica "selecionar" na nota -> aguarda (importa o XML)
//
// Nao clica "Salvar" (gravacao fica para etapa futura, atras de DMS_CONFIRM_SAVE).
// Toda a conexao/login/Cloudflare vive em dms-browser.js.
import { abrirDMS, login } from './dms-browser.js';
import { config } from './config.js';

const PATH_LANCAMENTO = '/v2/documentoentrada';

// Valores fixos do cabecalho (regra de negocio: sempre os mesmos).
const NATUREZA = { codigo: '10', regex: /10\s*-\s*COMPRA DE MERCADORIA PARA REVENDA/i };
const TIPO_MOV = { codigo: '2', regex: /^\s*2\s*-\s*COMPRA DA F[ÁA]BRICA/i };

// Só os dígitos do "número de documento" (a célula vem como "10050/1").
const soNumero = (s) => (String(s).match(/\d+/) || [''])[0];

// Abre a tela "Lancamento de Entrada" (URL direta é mais estável que o card).
async function abrirLancamentoEntrada(page) {
  const base = new URL(page.url()).origin;
  await page.goto(base + PATH_LANCAMENTO, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  if (await page.locator('#insertbutton').isVisible().catch(() => false)) return;
  await page.goto(base + '/cloud/#/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByText('Lançamento de Entrada', { exact: false }).first().click();
  await page.waitForLoadState('networkidle').catch(() => {});
}

// Seleciona um item num Kendo ComboBox remoto: espera habilitar, digita o codigo,
// aguarda o serverFiltering (delay 500ms + rede) e clica no item que casa.
// Tenta algumas vezes porque a lista remota (ainda mais a do Tipo, que depende da
// Natureza) as vezes demora a rebindar — redigitar destrava.
async function selecionarKendoCombo(page, inputName, listboxId, texto, regex, tentativas = 3) {
  const input = page.locator(`input[name="${inputName}"]`);
  await input.waitFor({ state: 'visible', timeout: config.dms.navTimeoutMs });
  await page.waitForFunction((n) => {
    const el = document.querySelector(`input[name="${n}"]`);
    return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }, inputName, { timeout: 15000 }).catch(() => {});

  const item = page.locator(`#${listboxId} li`).filter({ hasText: regex }).first();
  for (let t = 0; t < tentativas; t++) {
    await input.click();
    await input.fill('');
    await input.pressSequentially(texto, { delay: 150 });
    await page.waitForTimeout(900);
    try {
      await item.waitFor({ state: 'visible', timeout: 6000 });
      await item.click();
      return;
    } catch {
      const itens = await page.locator(`#${listboxId} li`).allInnerTexts().catch(() => []);
      console.log(`   [combo ${inputName}] tentativa ${t + 1}: itens=${JSON.stringify(itens)}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  throw new Error(`ComboBox "${inputName}": opção para "${texto}" não apareceu.`);
}

// 1) login -> Lancamento de Entrada -> Inserir -> formulario aberto.
export async function irAteFormulario(page) {
  await login(page);
  await abrirLancamentoEntrada(page);
  const inserir = page.locator('#insertbutton');
  await inserir.waitFor({ state: 'visible' });
  await inserir.click();
  await page.waitForURL(/\/DocumentoEntrada\/Inserir/i, { timeout: config.dms.navTimeoutMs }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.locator('input[name="IdPessoa_input"]').waitFor({ state: 'visible' });
}

// 2) Natureza de operacao e Tipo de movimento (valores fixos). Ordem importa:
//    o Tipo é filtrado pela Natureza, então a Natureza vem primeiro.
export async function preencherCabecalho(page) {
  await selecionarKendoCombo(page, 'IdNaturezaOperacao_input', 'IdNaturezaOperacao_listbox', NATUREZA.codigo, NATUREZA.regex);
  await page.waitForLoadState('networkidle').catch(() => {}); // Natureza recarrega a lista do Tipo
  await page.waitForTimeout(800);
  await selecionarKendoCombo(page, 'IdMercadoriaMovimentoTipo_input', 'IdMercadoriaMovimentoTipo_listbox', TIPO_MOV.codigo, TIPO_MOV.regex);
}

// 3) Abre o popup "Integracao", busca pelo numero e seleciona a nota.
//    selecionar=false: só localiza a nota (modo de teste, sem importar o XML).
export async function selecionarNotaPorNumero(page, numeroNota, { selecionar = true } = {}) {
  const num = soNumero(numeroNota);
  if (!num) return { ok: false, mensagem: 'Número da nota inválido.' };

  // A lupa só habilita depois de Natureza + Tipo preenchidos.
  await page.waitForFunction(() => {
    const b = document.querySelector('#NFeChaveAcessoLista');
    return b && !b.disabled;
  }, null, { timeout: 15000 }).catch(() => {});
  await page.locator('#NFeChaveAcessoLista').click({ force: true });

  await page.locator('#windowDocumentoEntradaIntegracao').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#GridIntegracao').waitFor({ state: 'visible', timeout: 20000 });

  // Busca pelo numero (reduz a lista; pode ter centenas de notas).
  await page.fill('#DocumentoEntradaIntegracao_text', num);
  await page.click('#DocumentoEntradaIntegracao_textButton');
  await page.waitForTimeout(1800);
  await page.waitForLoadState('networkidle').catch(() => {});

  // Acha a linha cujo "Numero de documento" (3a coluna) casa com o numero.
  const linhas = page.locator('#GridIntegracao tbody tr');
  const total = await linhas.count();
  let alvo = null;
  for (let i = 0; i < total; i++) {
    const cel = (await linhas.nth(i).locator('td').nth(2).innerText().catch(() => '')).trim();
    if (soNumero(cel) === num) { alvo = linhas.nth(i); break; }
  }
  if (!alvo) return { ok: false, mensagem: `Nota número ${num} não encontrada na lista de integração.` };
  if (!selecionar) return { ok: true, selecionou: false };

  await alvo.locator('a.k-grid-buttonSelecionarGridXML').click();
  await page.waitForTimeout(2500); // importacao do XML
  await page.waitForLoadState('networkidle').catch(() => {});
  return { ok: true, selecionou: true };
}

// Orquestra o fluxo inteiro a partir do numero da nota.
export async function lancarPorNumero(numeroNota, { selecionar = true } = {}) {
  if (!soNumero(numeroNota)) return { status: 'erro', mensagem: 'Número da nota não informado.' };
  const { browser, page } = await abrirDMS();
  try {
    await irAteFormulario(page);
    await preencherCabecalho(page);
    const r = await selecionarNotaPorNumero(page, numeroNota, { selecionar });
    if (!r.ok) return { status: 'erro', mensagem: r.mensagem };
    return {
      status: 'ok',
      etapa: r.selecionou ? 'nota-selecionada' : 'nota-encontrada',
      mensagem: r.selecionou
        ? `Nota ${soNumero(numeroNota)} selecionada no DMS (XML importado). ` +
          'Revise e clique Salvar manualmente — gravação automática ainda desativada.'
        : `Nota ${soNumero(numeroNota)} encontrada na lista (seleção não executada).`,
    };
  } catch (e) {
    return { status: 'erro', mensagem: String(e?.message ?? e) };
  } finally {
    await browser.close(); // apenas DESCONECTA; o Chrome (sessao) segue aberto
  }
}

// Compat: leva só até o formulário aberto (usado pelo smoke test teste-dms.js).
export async function lancarNoDMS() {
  const { browser, page } = await abrirDMS();
  try {
    await irAteFormulario(page);
    return { status: 'ok', etapa: 'formulario-aberto', mensagem: 'Formulário de inserção aberto no DMS.' };
  } catch (e) {
    return { status: 'erro', mensagem: String(e?.message ?? e) };
  } finally {
    await browser.close();
  }
}
