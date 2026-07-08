// Orchestrates the steps n8n would do (minus the trigger and the approval, which
// live in the Telegram bot). Two functions, around the human approval.
// (Legacy PDF pipeline — kept for reference; the live flow is by invoice number.)
import { extractFromBuffer } from './extract.js';
import { structureFields } from './ai.js';
import { launchInDMS } from './launch.js';

// PDF -> validated fields (extraction + AI)
export async function prepareInvoice(pdfBuffer) {
  const extracted = await extractFromBuffer(pdfBuffer);
  return structureFields(extracted);
}

// fields -> launch in the DMS via Playwright
export async function launchInvoice(fields) {
  return launchInDMS(fields);
}
