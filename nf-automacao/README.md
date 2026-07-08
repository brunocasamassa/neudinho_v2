# Automação de NF no DMS — Telegram + Playwright

App Node que lança Notas Fiscais de entrada no DMS (MicroWork CLOUD) a partir do
**número da nota** enviado no Telegram:

```
Você manda o NÚMERO da nota no Telegram
        │  (gatilho)
        ▼
  pede confirmação                       ← opcional (REQUIRE_APPROVAL)
        ▼
  Playwright dirige o DMS real:
   login → "Lançamento de Entrada" → "Inserir"
   → Natureza = 10 - COMPRA DE MERCADORIA PARA REVENDA (fixo)
   → Tipo = 2 - COMPRA DA FÁBRICA (fixo)
   → lupa da Chave de acesso → popup "Integração"
   → busca o número → seleciona a nota (o DMS importa o XML)
        ▼
  responde no Telegram: ✅ ok / ⚠️ erro
```

O fluxo **para na seleção** (não clica Salvar). Gravar é a etapa final, ainda não feita.

---

## Pré-requisitos

- **Node.js** LTS — https://nodejs.org
- **Google Chrome** (ou Edge) instalado — o bot dirige o navegador real, não o Chromium do Playwright.
- Conta no DMS e um bot do Telegram (token do **@BotFather**).

## Instalar e configurar

```bash
npm install
cp .env.example .env     # preencha DMS_USER, DMS_PASS e TELEGRAM_TOKEN
```

## Rodar

```bash
npm start                            # sobe o bot; mande o número da nota no Telegram

node scripts/test-number.js 10050        # testa o fluxo completo (sem Telegram)
node scripts/test-number.js 10050 --dry  # só LOCALIZA a nota (não seleciona)
node scripts/map-dms.js                  # re-mapeia o DMS e salva HTML/prints em mapeamento/
```

A 1ª vez abre uma janela do Chrome com um perfil dedicado (`.chrome-dms/`) que
guarda o login — depois ele reaproveita a sessão e quase nunca precisa relogar.

---

## Como funciona o DMS (2 obstáculos resolvidos)

1. **Cloudflare.** A tela de login trava qualquer navegador *lançado* por
   automação. Por isso o bot abre um **Chrome real** (`--remote-debugging-port`)
   com perfil persistente e o Playwright **conecta via CDP** — para o Cloudflare é
   um navegador genuíno. Tudo em `src/dms-browser.js`.
2. **Token de login efêmero.** A URL `…/login?signin=<GUID>` expira em segundos.
   Por isso o `.env` usa a **URL de entrada** (`DMS_ENTRY_URL=https://www.microworkcloud.com.br`),
   que gera um token novo a cada acesso.

### Passos no formulário (seletores)

| Passo | Seletor |
|---|---|
| "Lançamento de Entrada" | URL `/v2/documentoentrada` |
| "Inserir" | `#insertbutton` |
| Natureza de operação | Kendo combo `IdNaturezaOperacao` |
| Tipo de movimento (depende da Natureza) | Kendo combo `IdMercadoriaMovimentoTipo` |
| Lupa da Chave de acesso (habilita após Natureza+Tipo) | `#NFeChaveAcessoLista` |
| Popup / grade / busca | `#windowDocumentoEntradaIntegracao` / `#GridIntegracao` / `#DocumentoEntradaIntegracao_text` |
| Selecionar a nota na linha | `a.k-grid-buttonSelecionarGridXML` |

Sem `sleep` fixo — espera por elementos/`networkidle`. Tempos típicos: login ~7,5s,
abrir Lançamento ~4,5s, abrir Inserir ~6s.

### Próxima etapa — Salvar

Ao selecionar, o DMS importa o XML e preenche o form (fornecedor, itens, totais),
mas mostra pendências (ex.: *"Localização obrigatória"* por item) a resolver antes
de **Salvar**. ⚠️ Por segurança o fluxo nunca clica Salvar; a flag `DMS_CONFIRM_SAVE`
(default `false`) fica reservada para quando essa etapa existir.

---

## Estrutura

```
├── index.js / webhook.js   ← entrada do bot (polling / webhook p/ VPS)
├── src/
│   ├── config.js           ← lê o .env
│   ├── bot.js              ← Telegram: recebe o número, confirma, dispara
│   ├── dms-browser.js      ← Chrome real via CDP + login (resolve o Cloudflare)
│   └── launch.js           ← fluxo no DMS (login → … → seleciona a nota)
├── scripts/
│   ├── test-number.js      ← roda o fluxo por número (sem Telegram)
│   ├── test-dms.js         ← smoke test: login → Lançamento → Inserir
│   └── map-dms.js          ← (re)mapeia o DMS e salva HTML/prints
└── mapeamento/             ← HTML/prints capturados do DMS (gitignored)
```

> **Legado** (não usado no fluxo atual): `src/extract.js`, `src/ai.js`,
> `src/pipeline.js` — eram a esteira por PDF.

## Variáveis do .env

| Variável | Pra quê |
|---|---|
| `TELEGRAM_TOKEN` | Token do bot (@BotFather) |
| `DMS_ENTRY_URL` | URL de entrada do app (gera token de login novo) |
| `DMS_USER` / `DMS_PASS` | Email e senha do DMS |
| `DMS_CHROME_PATH` | (opcional) caminho do chrome.exe; vazio = autodetecta |
| `DMS_CHROME_PROFILE` / `DMS_CDP_PORT` | Perfil do Chrome do bot / porta CDP |
| `DMS_NAV_TIMEOUT_MS` | Timeout de navegação/espera |
| `DMS_CONFIRM_SAVE` | `true` libera a gravação (default `false`) |
| `REQUIRE_APPROVAL` | `true` confirma no Telegram antes de lançar |

As demais variáveis no `.env.example` (`USE_AI`, `ANTHROPIC_*`, `WEBHOOK_*`) são
do legado (IA/PDF) ou do deploy por webhook.

## Deploy

`npm start` com PM2 mantém o bot no ar (`pm2 start ecosystem.config.cjs`). Como o
bot dirige um Chrome real, rode numa máquina com **desktop** (Windows); numa VPS
Linux seria preciso sessão gráfica (xvfb).
