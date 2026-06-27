// Mock do DMS do Neuds: login + tela de "Entrada de Nota" + delay de processamento.
// Campos espelham o exemplo real dele: fornecedor, descricao do servico, valor, ISS%.
import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const USUARIO = 'admin';
const SENHA = '1234';
const TEMPO_PROCESSAMENTO_MS = 2500; // simula o DMS lento/"travado"

function exigeLogin(req, res, next) {
  if (req.cookies.auth === 'ok') return next();
  res.redirect('/login');
}

const layout = (titulo, corpo) => `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><title>${titulo}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px}
  label{display:block;margin:12px 0 4px;font-weight:600}
  input{width:100%;padding:8px;box-sizing:border-box}
  button{margin-top:16px;padding:10px 16px;cursor:pointer}
  .ok{color:green;font-weight:700}
</style></head><body>${corpo}</body></html>`;

app.get('/', (req, res) => res.redirect('/entrada'));

app.get('/login', (req, res) => {
  res.send(layout('DMS (mock) - Login', `
    <h1>DMS (mock)</h1>
    <form method="post" action="/login">
      <label for="usuario">Usuário</label>
      <input id="usuario" name="usuario" aria-label="Usuário">
      <label for="senha">Senha</label>
      <input id="senha" name="senha" type="password" aria-label="Senha">
      <button type="submit">Entrar</button>
    </form>
    <p>Use: admin / 1234</p>`));
});

app.post('/login', (req, res) => {
  if (req.body.usuario === USUARIO && req.body.senha === SENHA) {
    res.cookie('auth', 'ok');
    return res.redirect('/entrada');
  }
  res.send(layout('Login', '<p>Credenciais inválidas. <a href="/login">Voltar</a></p>'));
});

app.get('/entrada', exigeLogin, (req, res) => {
  res.send(layout('DMS (mock) - Entrada de Nota', `
    <h1>Entrada de Nota Fiscal</h1>
    <form method="post" action="/entrada">
      <label for="fornecedor">Fornecedor</label>
      <input id="fornecedor" name="fornecedor" aria-label="Fornecedor">
      <label for="descricao">Descrição do serviço</label>
      <input id="descricao" name="descricao" aria-label="Descrição do serviço">
      <label for="valor">Valor</label>
      <input id="valor" name="valor" aria-label="Valor">
      <label for="iss">ISS (%)</label>
      <input id="iss" name="iss" aria-label="ISS (%)">
      <button type="submit">Lançar</button>
    </form>`));
});

app.post('/entrada', exigeLogin, async (req, res) => {
  const { fornecedor, descricao, valor, iss } = req.body;
  await new Promise(r => setTimeout(r, TEMPO_PROCESSAMENTO_MS)); // "processando..."
  res.send(layout('DMS (mock) - Resultado', `
    <h1 class="ok">Entrada registrada com sucesso</h1>
    <p>Fornecedor: <span data-testid="fornecedor-confirmado">${fornecedor}</span></p>
    <p>Serviço: <span data-testid="descricao-confirmada">${descricao}</span></p>
    <p>Valor: <span data-testid="valor-confirmado">${valor}</span></p>
    <p>ISS: <span data-testid="iss-confirmado">${iss}</span>%</p>
    <a href="/entrada">Nova entrada</a>`));
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Mock DMS rodando em http://localhost:${PORT}`));
