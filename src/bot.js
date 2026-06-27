// TRIGGER + APPROVAL on Telegram (grammy).
// New flow: you send the invoice NUMBER; the bot asks for confirmation and fires
// the launch in the DMS (login -> "Lancamento de Entrada" -> "Inserir" -> fills the
// fixed Nature/Type -> searches the invoice by number -> selects it). Does not save.
import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import { launchByNumber } from './launch.js';

export function createBot() {
  if (!config.telegram.token) {
    throw new Error('TELEGRAM_TOKEN vazio. Crie o bot no @BotFather e preencha o .env.');
  }
  const bot = new Bot(config.telegram.token);

  // /start shows the chat id (to fill TELEGRAM_APPROVER_CHAT_ID)
  bot.command('start', (ctx) =>
    ctx.reply(
      `Bot de lançamento de NF ativo.\nSeu chat id é: ${ctx.chat.id}\n\n` +
      `Envie o *número da nota* (ex: 10050) para lançar no DMS.`,
      { parse_mode: 'Markdown' }));

  // TRIGGER: text message with the invoice number.
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // leave commands to the other handlers
    const number = (text.match(/\d+/) || [])[0];
    if (!number) {
      return ctx.reply('Envie o *número da nota* (ex: 10050).', { parse_mode: 'Markdown' });
    }

    // no approval: fire directly
    if (!config.flow.requireApproval) return executeByNumber(ctx, number);

    // with approval: confirm with buttons
    const keyboard = new InlineKeyboard()
      .text('✅ Lançar', `num-ok:${number}`)
      .text('❌ Cancelar', `num-no:${number}`);
    await ctx.reply(
      `Lançar a nota *${number}* no DMS?\n` +
      `• Natureza: 10 - COMPRA DE MERCADORIA PARA REVENDA\n` +
      `• Tipo: 2 - COMPRA DA FÁBRICA`,
      { parse_mode: 'Markdown', reply_markup: keyboard });
  });

  // PDF is no longer the trigger — guide the user.
  bot.on('message:document', (ctx) =>
    ctx.reply('Agora o lançamento é pelo *número da nota*. Me envie só o número (ex: 10050).',
      { parse_mode: 'Markdown' }));

  // click on the confirmation buttons
  bot.callbackQuery(/^num-(ok|no):(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    const number = ctx.match[2];
    await ctx.answerCallbackQuery();
    if (action === 'no') return ctx.reply('❌ Cancelado.');
    await executeByNumber(ctx, number);
  });

  bot.catch((err) => console.error('Erro no bot:', err));
  return bot;
}

async function executeByNumber(ctx, number) {
  await ctx.reply(`⏳ Lançando a nota ${number} no DMS... (pode levar ~40s)`);
  const result = await launchByNumber(number);
  await ctx.reply(`${result.status === 'ok' ? '✅' : '⚠️'} ${result.message}`);
}
