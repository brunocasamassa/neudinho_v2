// ETAPA 1b — IA: valida e padroniza os campos extraidos.
// Se USE_AI=false, faz passthrough (usa direto a regex) — bom pra testar local.
// Se USE_AI=true, chama a API da Anthropic e pede JSON limpo de volta.
import { config } from './config.js';

const prompt = (texto, campos) => `Você recebeu o texto de uma Nota Fiscal de Serviço (NFS-e) brasileira e uma extração inicial por regex (que pode conter erros).

Valide e corrija. Retorne SOMENTE JSON válido, sem markdown e sem explicação, neste formato exato:
{"fornecedor":"...","descricao":"...","valor":"0,00","iss":"0"}

Regras:
- fornecedor: razão social do prestador/emitente
- descricao: descrição do serviço em uma linha
- valor: total dos serviços, só números e vírgula, sem "R$" (ex: "400,00")
- iss: alíquota do ISS, só o número, sem "%" (ex: "6")

Extração inicial: ${JSON.stringify(campos)}

Texto da nota:
${texto}`;

export async function estruturarCampos({ texto, campos }) {
  // passthrough: sem IA, devolve o que a regex achou
  if (!config.ia.enabled) {
    const { fornecedor, descricao, valor, iss } = campos;
    return { fornecedor, descricao, valor, iss };
  }
  if (!config.ia.apiKey) {
    throw new Error('USE_AI=true mas ANTHROPIC_API_KEY está vazio no .env.');
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ia.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.ia.model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt(texto, campos) }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`Anthropic API erro ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const txt = data.content?.[0]?.text ?? '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('IA não retornou JSON. Resposta: ' + txt);
  return JSON.parse(m[0]);
}
