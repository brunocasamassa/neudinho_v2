// Le todas as configuracoes do .env num lugar so.
import 'dotenv/config';

const bool = (v, def) => (v ?? String(def)).toLowerCase() === 'true';

export const config = {
  telegram: {
    token: process.env.TELEGRAM_TOKEN ?? '',
    approverChatId: process.env.TELEGRAM_APPROVER_CHAT_ID ?? '',
  },
  dms: {
    // URL de ENTRADA do app: gera um token de login novo a cada acesso.
    // NUNCA aponte para a URL com ?signin=<token> (uso unico, expira em segundos).
    entryUrl: process.env.DMS_ENTRY_URL ?? 'https://www.microworkcloud.com.br',
    user: process.env.DMS_USER ?? '',     // email de acesso ao DMS
    pass: process.env.DMS_PASS ?? '',     // senha
    // O DMS fica atras de Cloudflare, que bloqueia navegador "lancado" pelo
    // Playwright. A saida e dirigir um Chrome REAL via CDP (ver src/dms-browser.js).
    chromePath: process.env.DMS_CHROME_PATH ?? '',           // vazio = autodetecta
    chromeProfile: process.env.DMS_CHROME_PROFILE ?? '.chrome-dms', // mantem login+clearance
    cdpPort: Number(process.env.DMS_CDP_PORT ?? 9222),
    navTimeoutMs: Number(process.env.DMS_NAV_TIMEOUT_MS ?? 60000),
    // Trava de seguranca: so GRAVA a nota fiscal quando explicitamente true.
    confirmSave: bool(process.env.DMS_CONFIRM_SAVE, false),
  },
  ia: {
    enabled: bool(process.env.USE_AI, false),
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },
  fluxo: {
    requireApproval: bool(process.env.REQUIRE_APPROVAL, true),
    headed: bool(process.env.PLAYWRIGHT_HEADED, false),
  },
  webhook: {
    url: process.env.WEBHOOK_URL ?? '',
    port: Number(process.env.WEBHOOK_PORT ?? 8080),
    path: process.env.WEBHOOK_PATH ?? '/telegram',
  },
};
