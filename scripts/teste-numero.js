// Smoke test do fluxo por NUMERO (sem Telegram):
//   node scripts/teste-numero.js 10050          -> seleciona a nota (importa XML)
//   node scripts/teste-numero.js 10050 --dry    -> só localiza a nota (não seleciona)
import { lancarPorNumero } from '../src/lancar.js';

const numero = process.argv[2];
const dry = process.argv.includes('--dry');
if (!numero) { console.log('uso: node scripts/teste-numero.js <numero> [--dry]'); process.exit(1); }

console.log(`Lancando nota ${numero} no DMS${dry ? ' (DRY: sem selecionar)' : ''}...`);
const t = Date.now();
const r = await lancarPorNumero(numero, { selecionar: !dry });
console.log('Resultado:', JSON.stringify(r, null, 2));
console.log('Tempo:', ((Date.now() - t) / 1000).toFixed(1) + 's');
process.exit(r.status === 'ok' ? 0 : 1);
