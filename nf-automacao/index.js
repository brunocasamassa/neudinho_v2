// Entry point for LOCALHOST — bot in long polling (no public url).
// Everything in a single process: no n8n, no Docker.
import { createBot } from './src/bot.js';

const bot = createBot();
bot.start({
  onStart: () => console.log('Bot no ar (long polling). Mande /start no Telegram.'),
});
