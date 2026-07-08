// Entry point for the VPS — bot via WEBHOOK (instead of polling).
// Telegram sends the updates to https://YOUR_DOMAIN<WEBHOOK_PATH>.
// Requires public HTTPS pointing to this VPS (use Caddy/Nginx as a reverse
// proxy, or cloudflared/ngrok for a quick test tunnel).
import express from 'express';
import { webhookCallback } from 'grammy';
import { createBot } from './src/bot.js';
import { config } from './src/config.js';

const bot = createBot();
await bot.init();

const app = express();
app.use(express.json());
app.use(config.webhook.path, webhookCallback(bot, 'express'));
app.get('/health', (_req, res) => res.send('ok'));

app.listen(config.webhook.port, async () => {
  console.log(`Webhook server na porta ${config.webhook.port}, path ${config.webhook.path}`);
  if (config.webhook.url) {
    await bot.api.setWebhook(`${config.webhook.url}${config.webhook.path}`);
    console.log(`Webhook registrado: ${config.webhook.url}${config.webhook.path}`);
  } else {
    console.log('Defina WEBHOOK_URL no .env e reinicie para registrar o webhook no Telegram.');
  }
});
