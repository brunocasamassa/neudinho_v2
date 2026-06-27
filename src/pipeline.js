// Orquestra as etapas que o n8n faria (menos o gatilho e a aprovacao,
// que ficam no bot do Telegram). Duas funcoes, em torno da aprovacao humana.
import { extrairDeBuffer } from './extrair.js';
import { estruturarCampos } from './ia.js';
import { lancarNoDMS } from './lancar.js';

// PDF -> campos validados (extracao + IA)
export async function prepararNota(pdfBuffer) {
  const extraido = await extrairDeBuffer(pdfBuffer);
  return estruturarCampos(extraido);
}

// campos -> lancamento no DMS via Playwright
export async function lancarNota(campos) {
  return lancarNoDMS(campos);
}
