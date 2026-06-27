// Smoke test of the DMS flow (no Telegram/PDF): login -> "Lancamento de Entrada"
// -> "Inserir" -> form open. Does NOT save anything (DMS_CONFIRM_SAVE=false).
// Usage: node scripts/test-dms.js
import { launchInDMS } from '../src/launch.js';

console.log('Dirigindo o DMS real ate o formulario de inserir...');
const start = Date.now();
const result = await launchInDMS();
console.log('Resultado:', JSON.stringify(result, null, 2));
console.log('Tempo total:', ((Date.now() - start) / 1000).toFixed(1) + 's');
process.exit(result.status === 'ok' ? 0 : 1);
