// MAPEAMENTO do fluxo real do DMS: login -> "Lancamento de Entrada" -> "Inserir".
// Loga via Chrome real (CDP), explora o app (ciente de frames e popups), mede os
// tempos de carregamento entre telas e salva HTML+print de cada passo em mapeamento/.
// Uso: node scripts/mapear-dms.js
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { abrirDMS, login } from '../src/dms-browser.js';

const out = fileURLToPath(new URL('../mapeamento/', import.meta.url));
const agora = () => Date.now();
const seg = (ms) => (ms / 1000).toFixed(2) + 's';

// Procura, em TODOS os frames, elementos interativos cujo texto bate com a regex.
async function candidatos(page, regex) {
  const achados = [];
  for (const frame of page.frames()) {
    const itens = await frame.evaluate((reSrc) => {
      const re = new RegExp(reSrc, 'i');
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const sel = 'a,button,[role=button],[role=menuitem],[onclick],input[type=button],input[type=submit],li,span';
      return [...document.querySelectorAll(sel)]
        .map((el) => ({ tag: el.tagName.toLowerCase(),
          txt: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 50),
          id: el.id || null, name: el.getAttribute('name'),
          cls: (el.className || '').toString().slice(0, 50),
          title: el.getAttribute('title'), vis: vis(el) }))
        .filter((e) => e.txt && re.test(e.txt) && e.txt.length < 50);
    }, regex.source).catch(() => []);
    for (const it of itens) achados.push({ frame: frame.url(), ...it });
  }
  // remove duplicatas obvias (mesmo texto+tag+id)
  const m = new Map(achados.map((a) => [`${a.tag}|${a.txt}|${a.id}`, a]));
  return [...m.values()];
}

// Clica o 1o elemento visivel cujo texto bate, varrendo os frames. Devolve onde achou.
async function clicarPorTexto(page, texto) {
  for (const frame of page.frames()) {
    for (const loc of [
      frame.getByRole('button', { name: texto, exact: false }),
      frame.getByRole('link', { name: texto, exact: false }),
      frame.getByRole('menuitem', { name: texto, exact: false }),
      frame.getByText(texto, { exact: false }),
    ]) {
      const alvo = loc.first();
      if (await alvo.isVisible().catch(() => false)) {
        await alvo.scrollIntoViewIfNeeded().catch(() => {});
        await alvo.click({ timeout: 8000 });
        return { ok: true, frame: frame.url() };
      }
    }
  }
  return { ok: false };
}

async function capturar(page, nome) {
  const frames = page.frames().map((f) => f.url());
  try { writeFileSync(out + nome + '.html', await page.content()); } catch {}
  try { await page.screenshot({ path: out + nome + '.png', fullPage: true }); } catch {}
  return { url: page.url(), titulo: await page.title().catch(() => ''), frames };
}

const { browser, context, page } = await abrirDMS();
const timings = {};
try {
  // captura popups (caso algum passo abra nova aba/janela)
  context.on('page', (p) => console.log('  [popup] nova pagina:', p.url()));

  console.log('1) LOGIN...');
  let t = agora();
  const r = await login(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  timings.login = agora() - t;
  console.log(`   ${r.relogou ? 'logou agora' : 'ja estava logado'} | ${seg(timings.login)}`);
  console.log('   ->', JSON.stringify(await capturar(page, '02-dashboard')));

  console.log('\n2) Candidatos para "Lancamento de Entrada":');
  console.log(JSON.stringify(await candidatos(page, /lan[cç]amento|entrada/), null, 1));

  console.log('\n3) Clicando "Lancamento de Entrada"...');
  t = agora();
  const c1 = await clicarPorTexto(page, /Lan[cç]amento de Entrada/i);
  console.log('   clique:', JSON.stringify(c1));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500); // deixa a tela montar
  timings.lancamento = agora() - t;
  console.log(`   ${seg(timings.lancamento)} ->`, JSON.stringify(await capturar(page, '03-lancamento')));

  console.log('\n4) Candidatos para "Inserir":');
  console.log(JSON.stringify(await candidatos(page, /inserir|novo|incluir|\+/), null, 1));

  console.log('\n5) Clicando "Inserir"...');
  t = agora();
  const c2 = await clicarPorTexto(page, /Inserir/i);
  console.log('   clique:', JSON.stringify(c2));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  timings.inserir = agora() - t;
  console.log(`   ${seg(timings.inserir)} ->`, JSON.stringify(await capturar(page, '04-inserir')));

  console.log('\n6) Inputs do formulario de Inserir (todos os frames):');
  for (const frame of page.frames()) {
    const inputs = await frame.evaluate(() => [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => ({ type: el.type, id: el.id || null, name: el.getAttribute('name'),
        ph: el.getAttribute('placeholder'), label: el.getAttribute('aria-label') }))).catch(() => []);
    if (inputs.length) console.log(`  [frame ${frame.url().slice(0, 60)}]`, JSON.stringify(inputs));
  }

  console.log('\n=== TIMINGS ===', JSON.stringify(timings));
} catch (e) {
  console.log('ERRO:', String(e));
  await capturar(page, '99-erro');
} finally {
  await browser.close(); // so desconecta; Chrome segue aberto
}
