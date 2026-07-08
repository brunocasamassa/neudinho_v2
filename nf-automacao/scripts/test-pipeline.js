// Tests the WHOLE legacy pipeline without Telegram: reads the sample PDF, extracts,
// (AI), and launches in the DMS. (Legacy — the live flow is by invoice number.)
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { prepareInvoice, launchInvoice } from '../src/pipeline.js';

const pdf = fileURLToPath(new URL('../exemplos/nf-exemplo.pdf', import.meta.url));

console.log('1) Extraindo + estruturando os dados do PDF...');
const fields = await prepareInvoice(readFileSync(pdf));
console.log(JSON.stringify(fields, null, 2));

console.log('\n2) Lançando no DMS...');
const result = await launchInvoice(fields);
console.log(JSON.stringify(result, null, 2));

console.log(result.status === 'ok'
  ? '\n✅ Esteira completa funcionando ponta a ponta!'
  : '\n⚠️ Falhou no lançamento.');
process.exit(result.status === 'ok' ? 0 : 1);
