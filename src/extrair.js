// ETAPA 1a — Extracao: PDF -> texto (pdfjs) -> campos (regex).
// A regex aqui e calibrada pro layout do PDF de exemplo. Em producao, com
// layouts variados por prefeitura, a camada de IA (ia.js) refina o resultado.
import { readFileSync } from 'node:fs';

export async function extrairTexto(pdfBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  let texto = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    texto += tc.items.map((it) => it.str).join('\n') + '\n';
  }
  return texto;
}

export function extrairCampos(texto) {
  const pega = (re) => texto.match(re)?.[1]?.trim() ?? null;
  return {
    fornecedor: pega(/PRESTADOR DE SERVIÇOS[\s\S]*?Razão Social:\s*\n?(.+)/),
    cnpjFornecedor: pega(/PRESTADOR DE SERVIÇOS[\s\S]*?CNPJ:\s*\n?([\d./-]+)/),
    descricao: pega(/DISCRIMINAÇÃO DOS SERVIÇOS\s*\n+(.+)/),
    valor: pega(/Valor dos serviços:\s*R\$\s*\n?([\d.,]+)/),
    iss: pega(/Alíquota ISS:\s*\n?([\d.,]+)\s*%/),
    numero: pega(/Número:\s*\n?(\S+)/),
  };
}

export async function extrairDeBuffer(pdfBuffer) {
  const texto = await extrairTexto(pdfBuffer);
  return { texto, campos: extrairCampos(texto) };
}

export async function extrairDeArquivo(caminho) {
  return extrairDeBuffer(readFileSync(caminho));
}
