// Reads all configuration from the .env in a single place.
import 'dotenv/config';

const bool = (v, def) => (v ?? String(def)).toLowerCase() === 'true';

export const config = {
  telegram: {
    token: process.env.TELEGRAM_TOKEN ?? '',
    approverChatId: process.env.TELEGRAM_APPROVER_CHAT_ID ?? '',
  },
  dms: {
    // App ENTRY url: mints a fresh login token on every access.
    // NEVER point to the ?signin=<token> url (single-use, expires in seconds).
    entryUrl: process.env.DMS_ENTRY_URL ?? 'https://www.microworkcloud.com.br',
    user: process.env.DMS_USER ?? '',     // DMS login email
    pass: process.env.DMS_PASS ?? '',     // password
    // The DMS sits behind Cloudflare, which blocks a browser "launched" by
    // Playwright. The way out is driving a REAL Chrome via CDP (see dms-browser.js).
    chromePath: process.env.DMS_CHROME_PATH ?? '',           // empty = autodetect
    chromeProfile: process.env.DMS_CHROME_PROFILE ?? '.chrome-dms', // keeps login+clearance
    cdpPort: Number(process.env.DMS_CDP_PORT ?? 9222),
    navTimeoutMs: Number(process.env.DMS_NAV_TIMEOUT_MS ?? 60000),
    // Safety lock: only SAVES the invoice when explicitly true.
    confirmSave: bool(process.env.DMS_CONFIRM_SAVE, false),
  },
  ai: {
    enabled: bool(process.env.USE_AI, false),
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },
  flow: {
    requireApproval: bool(process.env.REQUIRE_APPROVAL, true),
    headed: bool(process.env.PLAYWRIGHT_HEADED, false),
  },
  webhook: {
    url: process.env.WEBHOOK_URL ?? '',
    port: Number(process.env.WEBHOOK_PORT ?? 8080),
    path: process.env.WEBHOOK_PATH ?? '/telegram',
  },
};
