// Testa a ESTEIRA INTEIRA sem Telegram: le o PDF de exemplo, extrai, (IA),
// e lanca no mock DMS. Rode isto pra validar tudo no localhost antes do bot.
// Pre-requisito: mock-dms rodando (cd mock-dms && npm start).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { prepararNota, lancarNota } from '../src/pipeline.js';

const pdf = fileURLToPath(new URL('../exemplos/nf-exemplo.pdf', import.meta.url));

console.log('1) Extraindo + estruturando os dados do PDF...');
const campos = await prepararNota(readFileSync(pdf));
console.log(JSON.stringify(campos, null, 2));

console.log('\n2) Lançando no DMS (precisa do mock-dms na :4000)...');
const r = await lancarNota(campos);
console.log(JSON.stringify(r, null, 2));

console.log(r.status === 'ok'
  ? '\n✅ Esteira completa funcionando ponta a ponta!'
  : '\n⚠️ Falhou no lançamento — confira se o mock-dms está rodando.');
process.exit(r.status === 'ok' ? 0 : 1);
