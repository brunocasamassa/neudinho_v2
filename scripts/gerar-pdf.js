// Gera uma NFS-e (nota de SERVICO) falsa em PDF espelhando o exemplo do Neuds:
// "Mao de obra pedreiro, 400 reais, ISS 6%". Edite e rode pra criar variacoes.
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const saida = fileURLToPath(new URL('../exemplos/nf-exemplo.pdf', import.meta.url));
const doc = new PDFDocument({ size: 'A4', margin: 50 });
doc.pipe(createWriteStream(saida));

doc.fontSize(14).text('NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e', { align: 'center' });
doc.moveDown();
doc.fontSize(10);
doc.text('Número: 2026/000123');
doc.text('Data de emissão: 05/06/2026');
doc.moveDown();
doc.fontSize(11).text('PRESTADOR DE SERVIÇOS');
doc.fontSize(10);
doc.text('Razão Social: João Silva Construções ME');
doc.text('CNPJ: 11.222.333/0001-44');
doc.moveDown();
doc.fontSize(11).text('TOMADOR DE SERVIÇOS');
doc.fontSize(10);
doc.text('Razão Social: Empresa do Neuds LTDA');
doc.text('CNPJ: 55.666.777/0001-88');
doc.moveDown();
doc.fontSize(11).text('DISCRIMINAÇÃO DOS SERVIÇOS');
doc.fontSize(10);
doc.text('Mão de obra pedreiro - reforma do escritório');
doc.moveDown();
doc.text('Valor dos serviços: R$ 400,00');
doc.text('Alíquota ISS: 6%');
doc.text('Valor ISS: R$ 24,00');

doc.end();
console.log('PDF gerado em', saida);
