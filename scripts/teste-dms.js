// Smoke test do fluxo DMS (sem Telegram/PDF): login -> "Lancamento de Entrada"
// -> "Inserir" -> formulario aberto. NAO grava nada (DMS_CONFIRM_SAVE=false).
// Uso: node scripts/teste-dms.js
import { lancarNoDMS } from '../src/lancar.js';

console.log('Dirigindo o DMS real ate o formulario de inserir...');
const t = Date.now();
const r = await lancarNoDMS({});
console.log('Resultado:', JSON.stringify(r, null, 2));
console.log('Tempo total:', ((Date.now() - t) / 1000).toFixed(1) + 's');
process.exit(r.status === 'ok' ? 0 : 1);
