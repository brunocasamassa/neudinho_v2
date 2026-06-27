// Smoke test of the by-NUMBER flow (no Telegram):
//   node scripts/test-number.js 10050          -> selects the invoice (imports XML)
//   node scripts/test-number.js 10050 --dry    -> only locates the invoice (no select)
import { launchByNumber } from '../src/launch.js';

const number = process.argv[2];
const dry = process.argv.includes('--dry');
if (!number) { console.log('uso: node scripts/test-number.js <numero> [--dry]'); process.exit(1); }

console.log(`Lancando nota ${number} no DMS${dry ? ' (DRY: sem selecionar)' : ''}...`);
const start = Date.now();
const result = await launchByNumber(number, { select: !dry });
console.log('Resultado:', JSON.stringify(result, null, 2));
console.log('Tempo:', ((Date.now() - start) / 1000).toFixed(1) + 's');
process.exit(result.status === 'ok' ? 0 : 1);
