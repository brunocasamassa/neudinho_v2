# Automação de NF no DMS — Telegram + Playwright (sem n8n)

App Node único que automatiza a entrada de Notas Fiscais de Serviço (NFS-e) no DMS:

```
Neuds manda o NÚMERO da nota no Telegram
        │  (gatilho)
        ▼
  pede confirmação do Neuds              ← opcional (REQUIRE_APPROVAL)
        ▼
  Playwright dirige o DMS real:
   login → "Lançamento de Entrada" → "Inserir"
   → Natureza = 10 - COMPRA P/ REVENDA (fixo)
   → Tipo = 2 - COMPRA DA FÁBRICA (fixo)
   → lupa da Chave de acesso → popup "Integração"
   → busca o número → seleciona a nota (importa o XML)
        ▼
  responde no Telegram: ✅ ok / ⚠️ erro
```

> A extração de PDF (`extrair.js`/`ia.js`) ficou como legado: agora os dados da
> nota vêm do **XML oficial** que o próprio DMS importa ao selecionar a nota na
> lista de "Integração" — bem mais confiável que ler PDF.

// Tudo em processo node, no n8n por que achei muito dificil de configurar neudinho, tente vc depois

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
│   ├── dms-browser.js     ← conexao com o DMS real (Chrome+CDP, login, sessao)
│   └── lancar.js          ← Playwright → DMS real (login→Lancamento→Inserir)
├── scripts/
│   ├── teste-pipeline.js  ← testa a esteira SEM Telegram (PDF→...→DMS)
│   ├── teste-dms.js       ← smoke test SO do DMS (login→Lancamento→Inserir)
│   ├── mapear-dms.js      ← (re)mapeia o fluxo do DMS e salva HTML/prints
│   └── gerar-pdf.js       ← gera a NFS-e de exemplo
├── mapeamento/            ← HTML+prints capturados do DMS real (gitignored)
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

## DMS real (MicroWork CLOUD)

Toda a parte do DMS está isolada em `src/dms-browser.js` (conexão+login) e
`src/lancar.js` (fluxo). A partir do **número da nota**, o fluxo automatizado é:

1. login → "Lançamento de Entrada" (`/v2/documentoentrada`) → "Inserir" (`#insertbutton`)
2. **Natureza de operação** = `10 - COMPRA DE MERCADORIA PARA REVENDA` (Kendo combo `IdNaturezaOperacao`)
3. **Tipo de movimento** = `2 - COMPRA DA FÁBRICA` (Kendo combo `IdMercadoriaMovimentoTipo`, filtrado pela Natureza)
4. clica a **lupa** da Chave de acesso (`#NFeChaveAcessoLista`) → abre o popup "Integração" (`#windowDocumentoEntradaIntegracao`)
5. busca o número (`#DocumentoEntradaIntegracao_text`) e clica **selecionar** na linha (`a.k-grid-buttonSelecionarGridXML`) → o DMS importa o XML e preenche o formulário

Não clica **Salvar** — gravar é a etapa final (ver abaixo).

### Dois obstáculos do site (e como resolvemos)

1. **Cloudflare.** A tela de login fica atrás do desafio "Um momento…". Um
   navegador *lançado* pelo Playwright é detectado e trava nele. Solução: o bot
   **abre um Chrome REAL** (via `--remote-debugging-port`) com um **perfil
   dedicado e persistente** (`.chrome-dms/`) e o Playwright **conecta** nele por
   CDP. Esse perfil guarda o cookie de login **e** o clearance do Cloudflare, então
   na maioria das vezes nem precisa relogar. Tudo isso está em `src/dms-browser.js`.

2. **Token de login de uso único.** A URL `…/login?signin=<GUID>` é gerada pelo
   app e **expira em segundos** (IdentityServer3). Não dá pra fixá-la. Por isso o
   `.env` aponta para a **URL de entrada do app** (`DMS_ENTRY_URL=https://www.microworkcloud.com.br`),
   que cunha um token novo a cada acesso e cai no login.

### Credenciais

Ficam **só no `.env`** (que é gitignored), lidas por `src/config.js`. Nada de
credencial hardcoded no código:

```
DMS_ENTRY_URL=https://www.microworkcloud.com.br
DMS_USER=felipe@feltrinmotos.com.br
DMS_PASS=...
```

### Rodar / re-mapear

```bash
node scripts/teste-numero.js 10050        # fluxo completo por número (seleciona a nota)
node scripts/teste-numero.js 10050 --dry  # idem, mas só LOCALIZA a nota (não seleciona)
node scripts/teste-dms.js                 # smoke test: login → Lançamento → Inserir
node scripts/mapear-dms.js                # re-mapeia e salva HTML+prints em mapeamento/
```

Tempos médios de carregamento observados (úteis pra timeouts): **login ~7,5s**,
**abrir Lançamento ~4,5s**, **abrir Inserir ~6s**. Não usamos `sleep` fixo — o
código espera por elementos/`networkidle` (auto-wait do Playwright).

### Próxima etapa — resolver pendências e Salvar

Ao selecionar a nota, o DMS importa o XML e preenche tudo (fornecedor, itens,
totais — ver `mapeamento/09-pos-select.png`), mas costuma mostrar pendências de
validação (ex.: *"Localização obrigatória"* por item) que precisam ser resolvidas
antes do **Salvar**. Essa é a etapa final — ainda **não** implementada.

⚠️ **Trava de segurança:** o fluxo atual **para na seleção** e nunca clica Salvar.
A flag `DMS_CONFIRM_SAVE` (default `false`) fica reservada para liberar a gravação
quando essa etapa existir. Combine com `REQUIRE_APPROVAL=true` (confirmação no Telegram).

---

## Variáveis do .env (resumo)

| Variável | Pra quê |
|---|---|
| `TELEGRAM_TOKEN` | Token do bot (@BotFather) |
| `TELEGRAM_APPROVER_CHAT_ID` | Chat do Neuds (avisos) |
| `DMS_ENTRY_URL` | URL de entrada do app (gera token de login novo) |
| `DMS_USER` / `DMS_PASS` | Email e senha do DMS |
| `DMS_CHROME_PATH` | (opcional) caminho do chrome.exe; vazio = autodetecta |
| `DMS_CHROME_PROFILE` | Perfil do Chrome do bot (mantém login+clearance) |
| `DMS_CDP_PORT` | Porta de depuração do Chrome (CDP) |
| `DMS_NAV_TIMEOUT_MS` | Timeout de navegação/espera |
| `DMS_CONFIRM_SAVE` | `true` libera a **gravação** da nota (default `false`) |
| `USE_AI` | `true` liga a validação por LLM |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Credencial da IA |
| `REQUIRE_APPROVAL` | `true` pede aprovação antes de lançar |
| `PLAYWRIGHT_HEADED` | `true` mostra o navegador (esteira antiga/mock) |
| `WEBHOOK_*` | Só no modo webhook (VPS) |
