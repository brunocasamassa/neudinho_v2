// STEP 1b — AI: validates and standardizes the extracted fields.
// If USE_AI=false, passthrough (uses the regex directly) — good for local testing.
// If USE_AI=true, calls the Anthropic API and asks for clean JSON back.
import { config } from './config.js';

const prompt = (text, fields) => `Você recebeu o texto de uma Nota Fiscal de Serviço (NFS-e) brasileira e uma extração inicial por regex (que pode conter erros).

Valide e corrija. Retorne SOMENTE JSON válido, sem markdown e sem explicação, neste formato exato:
{"fornecedor":"...","descricao":"...","valor":"0,00","iss":"0"}

Regras:
- fornecedor: razão social do prestador/emitente
- descricao: descrição do serviço em uma linha
- valor: total dos serviços, só números e vírgula, sem "R$" (ex: "400,00")
- iss: alíquota do ISS, só o número, sem "%" (ex: "6")

Extração inicial: ${JSON.stringify(fields)}

Texto da nota:
${text}`;

export async function structureFields({ text, fields }) {
  // passthrough: no AI, returns what the regex found
  if (!config.ai.enabled) {
    const { fornecedor, descricao, valor, iss } = fields;
    return { fornecedor, descricao, valor, iss };
  }
  if (!config.ai.apiKey) {
    throw new Error('USE_AI=true mas ANTHROPIC_API_KEY está vazio no .env.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.ai.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt(text, fields) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API erro ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const responseText = data.content?.[0]?.text ?? '';
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('IA não retornou JSON. Resposta: ' + responseText);
  return JSON.parse(match[0]);
}
