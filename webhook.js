// Ponto de entrada para a VPS — bot via WEBHOOK (em vez de polling).
// O Telegram envia os updates para https://SEU_DOMINIO<WEBHOOK_PATH>.
// Requer HTTPS público apontando pra esta VPS (use Caddy/Nginx como reverse
// proxy, ou cloudflared/ngrok pra testar um túnel rápido).
import express from 'express';
import { webhookCallback } from 'grammy';
import { criarBot } from './src/bot.js';
import { config } from './src/config.js';

const bot = criarBot();
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
