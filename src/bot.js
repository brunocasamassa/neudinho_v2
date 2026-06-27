// GATILHO + APROVACAO no Telegram (grammy).
// Novo fluxo: voce envia o NUMERO da nota; o bot pede confirmacao e dispara o
// lancamento no DMS (login -> "Lancamento de Entrada" -> "Inserir" -> preenche
// Natureza/Tipo fixos -> busca a nota pelo numero -> seleciona). Nao salva.
import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import { lancarPorNumero } from './lancar.js';

export function criarBot() {
  if (!config.telegram.token) {
    throw new Error('TELEGRAM_TOKEN vazio. Crie o bot no @BotFather e preencha o .env.');
  }
  const bot = new Bot(config.telegram.token);

  // /start mostra o chat id (pra preencher TELEGRAM_APPROVER_CHAT_ID)
  bot.command('start', (ctx) =>
    ctx.reply(
      `Bot de lançamento de NF ativo.\nSeu chat id é: ${ctx.chat.id}\n\n` +
      `Envie o *número da nota* (ex: 10050) para lançar no DMS.`,
      { parse_mode: 'Markdown' }));

  // GATILHO: mensagem de texto com o numero da nota.
  bot.on('message:text', async (ctx) => {
    const texto = ctx.message.text.trim();
    if (texto.startsWith('/')) return; // deixa os comandos para os outros handlers
    const numero = (texto.match(/\d+/) || [])[0];
    if (!numero) {
      return ctx.reply('Envie o *número da nota* (ex: 10050).', { parse_mode: 'Markdown' });
    }

    // sem aprovacao: dispara direto
    if (!config.fluxo.requireApproval) return executarPorNumero(ctx, numero);

    // com aprovacao: confirma com botoes
    const teclado = new InlineKeyboard()
      .text('✅ Lançar', `num-ok:${numero}`)
      .text('❌ Cancelar', `num-no:${numero}`);
    await ctx.reply(
      `Lançar a nota *${numero}* no DMS?\n` +
      `• Natureza: 10 - COMPRA DE MERCADORIA PARA REVENDA\n` +
      `• Tipo: 2 - COMPRA DA FÁBRICA`,
      { parse_mode: 'Markdown', reply_markup: teclado });
  });

  // PDF nao e mais o gatilho — orienta o usuario.
  bot.on('message:document', (ctx) =>
    ctx.reply('Agora o lançamento é pelo *número da nota*. Me envie só o número (ex: 10050).',
      { parse_mode: 'Markdown' }));

  // clique nos botoes de confirmacao
  bot.callbackQuery(/^num-(ok|no):(.+)$/, async (ctx) => {
    const acao = ctx.match[1];
    const numero = ctx.match[2];
    await ctx.answerCallbackQuery();
    if (acao === 'no') return ctx.reply('❌ Cancelado.');
    await executarPorNumero(ctx, numero);
  });

  bot.catch((err) => console.error('Erro no bot:', err));
  return bot;
}

async function executarPorNumero(ctx, numero) {
  await ctx.reply(`⏳ Lançando a nota ${numero} no DMS... (pode levar ~40s)`);
  const r = await lancarPorNumero(numero);
  await ctx.reply(`${r.status === 'ok' ? '✅' : '⚠️'} ${r.mensagem}`);
}
