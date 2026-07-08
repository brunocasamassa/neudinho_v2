// MAPPING of the real DMS flow: login -> "Lancamento de Entrada" -> "Inserir".
// Logs in via real Chrome (CDP), explores the app (frame- and popup-aware), measures
// the loading times between screens and saves HTML+screenshot of each step in mapeamento/.
// Usage: node scripts/map-dms.js
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { openDMS, login } from '../src/dms-browser.js';

const out = fileURLToPath(new URL('../mapeamento/', import.meta.url));
const now = () => Date.now();
const sec = (ms) => (ms / 1000).toFixed(2) + 's';

// Searches, across ALL frames, for interactive elements whose text matches the regex.
async function candidates(page, regex) {
  const found = [];
  for (const frame of page.frames()) {
    const items = await frame.evaluate((reSrc) => {
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
    for (const it of items) found.push({ frame: frame.url(), ...it });
  }
  // remove obvious duplicates (same text+tag+id)
  const dedup = new Map(found.map((a) => [`${a.tag}|${a.txt}|${a.id}`, a]));
  return [...dedup.values()];
}

// Clicks the 1st visible element whose text matches, scanning the frames. Returns where it found it.
async function clickByText(page, text) {
  for (const frame of page.frames()) {
    for (const loc of [
      frame.getByRole('button', { name: text, exact: false }),
      frame.getByRole('link', { name: text, exact: false }),
      frame.getByRole('menuitem', { name: text, exact: false }),
      frame.getByText(text, { exact: false }),
    ]) {
      const target = loc.first();
      if (await target.isVisible().catch(() => false)) {
        await target.scrollIntoViewIfNeeded().catch(() => {});
        await target.click({ timeout: 8000 });
        return { ok: true, frame: frame.url() };
      }
    }
  }
  return { ok: false };
}

async function capture(page, name) {
  const frames = page.frames().map((f) => f.url());
  try { writeFileSync(out + name + '.html', await page.content()); } catch {}
  try { await page.screenshot({ path: out + name + '.png', fullPage: true }); } catch {}
  return { url: page.url(), title: await page.title().catch(() => ''), frames };
}

const { browser, context, page } = await openDMS();
const timings = {};
try {
  // captures popups (in case some step opens a new tab/window)
  context.on('page', (p) => console.log('  [popup] nova pagina:', p.url()));

  console.log('1) LOGIN...');
  let start = now();
  const result = await login(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  timings.login = now() - start;
  console.log(`   ${result.reloggedIn ? 'logou agora' : 'ja estava logado'} | ${sec(timings.login)}`);
  console.log('   ->', JSON.stringify(await capture(page, '02-dashboard')));

  console.log('\n2) Candidatos para "Lancamento de Entrada":');
  console.log(JSON.stringify(await candidates(page, /lan[cç]amento|entrada/), null, 1));

  console.log('\n3) Clicando "Lancamento de Entrada"...');
  start = now();
  const click1 = await clickByText(page, /Lan[cç]amento de Entrada/i);
  console.log('   clique:', JSON.stringify(click1));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500); // let the screen build
  timings.entry = now() - start;
  console.log(`   ${sec(timings.entry)} ->`, JSON.stringify(await capture(page, '03-lancamento')));

  console.log('\n4) Candidatos para "Inserir":');
  console.log(JSON.stringify(await candidates(page, /inserir|novo|incluir|\+/), null, 1));

  console.log('\n5) Clicando "Inserir"...');
  start = now();
  const click2 = await clickByText(page, /Inserir/i);
  console.log('   clique:', JSON.stringify(click2));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
  timings.insert = now() - start;
  console.log(`   ${sec(timings.insert)} ->`, JSON.stringify(await capture(page, '04-inserir')));

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
  await capture(page, '99-erro');
} finally {
  await browser.close(); // only disconnects; Chrome stays open
}
