# Automação de NF no DMS — Telegram + Playwright (sem n8n)

App Node único que automatiza a entrada de Notas Fiscais de Serviço (NFS-e) no DMS:

```
Neuds manda o PDF no Telegram
        │  (gatilho)
        ▼
  extrai o texto do PDF (pdfjs)
        ▼
  IA valida e estrutura os campos        ← opcional (USE_AI)
  { fornecedor, descricao, valor, iss }
        ▼
  pede aprovação do Neuds no Telegram     ← opcional (REQUIRE_APPROVAL)
        ▼
  Playwright abre o DMS, loga, preenche,
  aguarda o processamento e confere
        ▼
  responde no Telegram: ✅ ok / ⚠️ erro
```

Tudo em **um processo Node** — sem n8n, sem Docker. Roda no localhost pra testar e numa VPS depois.

---

## Estrutura

```
sandbox-automacao/
├── index.js               ← entrada LOCALHOST (bot em long polling)
├── webhook.js             ← entrada VPS (bot via webhook)
├── ecosystem.config.cjs   ← PM2 (sobe tudo no boot)
├── .env.example           ← copie para .env e preencha
├── src/
│   ├── config.js          ← lê o .env
│   ├── bot.js             ← Telegram: recebe PDF, aprovação, notificação
│   ├── pipeline.js        ← orquestra as etapas
│   ├── extrair.js         ← PDF → texto → campos (regex)
│   ├── ia.js              ← valida/estrutura via Anthropic (ou passthrough)
│   └── lancar.js          ← Playwright → DMS
├── scripts/
│   ├── teste-pipeline.js  ← testa a esteira SEM Telegram
│   └── gerar-pdf.js       ← gera a NFS-e de exemplo
├── exemplos/
│   └── nf-exemplo.pdf     ← NFS-e falsa (pedreiro, R$400, ISS 6%)
└── mock-dms/              ← DMS FALSO pra treino (vira o DMS real depois)
    └── server.js
```

---

## O que baixar

1. **Node.js** LTS — https://nodejs.org
2. (Só pra VPS, depois) uma máquina Linux com domínio/HTTPS.

Nada de Docker. Nada de n8n.

---

## Passo a passo no localhost

### 1. Instalar tudo

```bash
# na raiz do projeto
npm install
npx playwright install chromium      # baixa o navegador (só 1ª vez)

# o DMS falso tem deps próprias
cd mock-dms && npm install && cd ..
```

### 2. Configurar o .env

```bash
cp .env.example .env
```
Pra um primeiro teste, **não precisa mexer em nada** — os padrões já apontam pro mock DMS, sem IA e sem precisar de token. (O token do Telegram só é necessário no passo 4.)

### 3. Testar a esteira SEM Telegram (recomendado começar aqui)

```bash
# terminal 1 — sobe o DMS falso
cd mock-dms && npm start

# terminal 2 — roda a esteira no PDF de exemplo
npm run teste
```
Esperado: extrai os dados do `nf-exemplo.pdf` e lança no DMS, terminando com
`✅ Esteira completa funcionando ponta a ponta!`. Se isso funcionou, o núcleo
está ok — falta só plugar o Telegram.

### 4. Ligar o bot do Telegram

1. No Telegram, fale com o **@BotFather** → `/newbot` → siga os passos → ele te dá um **token**.
2. Cole o token no `.env` em `TELEGRAM_TOKEN=`.
3. Suba o bot:
   ```bash
   # terminal 1 — DMS falso (se ainda não estiver rodando)
   cd mock-dms && npm start
   # terminal 2 — o bot
   npm start
   ```
4. No Telegram, abra conversa com o seu bot e mande `/start`. Ele responde com o
   seu **chat id** — cole em `TELEGRAM_APPROVER_CHAT_ID=` no `.env` (usado pra
   avisos automáticos; reinicie o `npm start` depois).
5. **Mande o `exemplos/nf-exemplo.pdf` pro bot.** Ele vai:
   - extrair os dados e te mostrar
   - perguntar com os botões **✅ Aprovar / ❌ Rejeitar**
   - ao aprovar, lançar no DMS e confirmar.

Pra ver o navegador trabalhando, coloque `PLAYWRIGHT_HEADED=true` no `.env`.

---

## Ligar a IA (quando quiser)

No sandbox, a extração é por regex (layout fixo). Pro mundo real, com NFS-e de
prefeituras diferentes, ligue a IA:

1. Crie uma API key em `console.anthropic.com`.
2. No `.env`:
   ```
   USE_AI=true
   ANTHROPIC_API_KEY=sk-ant-...
   ANTHROPIC_MODEL=claude-sonnet-4-6
   ```
A IA recebe o texto do PDF + a extração inicial e devolve o JSON corrigido.
Custo: centavos por nota. Modelo mais barato pra essa tarefa: troque por um
Haiku quando quiser economizar.

> **PDF escaneado/foto?** O pdfjs não acha texto em imagem. Nesse caso, o
> caminho é mandar o PDF direto pra um modelo com visão. Está comentado em
> `src/ia.js` onde adaptar.

---

## Deploy na VPS (depois)

### Opção A — manter polling (mais simples)
Só rodar `npm start` na VPS com PM2. Não precisa de domínio nem HTTPS.

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs        # sobe mock-dms + nf-bot
pm2 save
pm2 startup                           # rode o comando que ele imprimir
```
Pronto — liga a VPS e o bot já está no ar. Em produção, tire o `mock-dms` do
`ecosystem.config.cjs` (será o DMS real) e ajuste o `.env`.

### Opção B — webhook (mais robusto pra produção)
Requer domínio com HTTPS apontando pra VPS (use Caddy/Nginx como reverse proxy).

1. No `.env`:
   ```
   WEBHOOK_URL=https://nf.seudominio.com
   WEBHOOK_PORT=8080
   WEBHOOK_PATH=/telegram
   ```
2. Rode `npm run webhook` (ou aponte o PM2 pra `webhook.js`).
   Ele sobe um servidor Express e registra o webhook no Telegram sozinho.

---

## Trocar o mock pelo DMS real

Toda a parte do DMS está isolada em `src/lancar.js`. Pra apontar pro sistema real:

1. No `.env`: `DMS_BASE_URL`, `DMS_USER`, `DMS_PASS` com os valores reais.
2. Em `src/lancar.js`, ajuste os seletores e o texto de confirmação:
   - `getByLabel('Fornecedor')`, `getByLabel('Valor')` etc. → campos reais
   - `'Entrada registrada com sucesso'` → texto real que o DMS mostra
   - Descubra os seletores gravando com: `npx playwright codegen <url-do-dms>`

**Antes, confirme com o Neuds:**
- Qual é o DMS? (Se for Sankhya, Omie, Totvs etc., pode ter API/importação de XML — aí nem precisa de Playwright.)
- Os PDFs são digitais ou escaneados? (muda a extração)

⚠️ Comece com `REQUIRE_APPROVAL=true`. Entrada fiscal errada dá dor de cabeça —
deixe o Neuds aprovar até a confiança subir.

---

## Variáveis do .env (resumo)

| Variável | Pra quê |
|---|---|
| `TELEGRAM_TOKEN` | Token do bot (@BotFather) |
| `TELEGRAM_APPROVER_CHAT_ID` | Chat do Neuds (avisos) |
| `DMS_BASE_URL` / `DMS_USER` / `DMS_PASS` | Acesso ao DMS |
| `USE_AI` | `true` liga a validação por LLM |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Credencial da IA |
| `REQUIRE_APPROVAL` | `true` pede aprovação antes de lançar |
| `PLAYWRIGHT_HEADED` | `true` mostra o navegador |
| `WEBHOOK_*` | Só no modo webhook (VPS) |
