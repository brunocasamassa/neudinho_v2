// Ponto de entrada para LOCALHOST — bot em long polling (sem URL pública).
// Tudo em um processo só: sem n8n, sem Docker.
import { criarBot } from './src/bot.js';

const bot = criarBot();
bot.start({
  onStart: () => console.log('Bot no ar (long polling). Mande /start no Telegram.'),
});
