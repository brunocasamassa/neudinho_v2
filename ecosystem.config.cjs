// PM2: sobe o mock-dms e o bot juntos e mantem no ar (inclusive no boot).
// Uso:
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup   (registra no boot do SO)
//
// Em producao voce normalmente NAO sobe o mock-dms (sera o DMS real),
// e troca "index.js" por "webhook.js". Ajuste os apps abaixo conforme o caso.
module.exports = {
  apps: [
    {
      name: 'nf-bot',
      script: 'index.js',   // troque para 'webhook.js' na VPS com dominio
      cwd: './',
    },
  ],
};
