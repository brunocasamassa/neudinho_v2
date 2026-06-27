// STEP 1a — Extraction: PDF -> text (pdfjs) -> fields (regex).
// The regex here is tuned to the layout of the sample PDF. In production, with
// layouts varying per city hall, the AI layer (ai.js) refines the result.
import { readFileSync } from 'node:fs';

export async function extractText(pdfBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join('\n') + '\n';
  }
  return text;
}

export function extractFields(text) {
  const get = (re) => text.match(re)?.[1]?.trim() ?? null;
  return {
    fornecedor: get(/PRESTADOR DE SERVIÇOS[\s\S]*?Razão Social:\s*\n?(.+)/),
    cnpjFornecedor: get(/PRESTADOR DE SERVIÇOS[\s\S]*?CNPJ:\s*\n?([\d./-]+)/),
    descricao: get(/DISCRIMINAÇÃO DOS SERVIÇOS\s*\n+(.+)/),
    valor: get(/Valor dos serviços:\s*R\$\s*\n?([\d.,]+)/),
    iss: get(/Alíquota ISS:\s*\n?([\d.,]+)\s*%/),
    numero: get(/Número:\s*\n?(\S+)/),
  };
}

export async function extractFromBuffer(pdfBuffer) {
  const text = await extractText(pdfBuffer);
  return { text, fields: extractFields(text) };
}

export async function extractFromFile(path) {
  return extractFromBuffer(readFileSync(path));
}
