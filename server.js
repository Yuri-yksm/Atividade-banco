// =====================================================================
// Empório & Café Grão da Serra — servidor intermediário (Node.js + Express)
//
// O navegador não fala direto com o MySQL. Este programa recebe as
// requisições da página (fetch), executa SELECT nas views ou CALL nas
// procedures e devolve o resultado em JSON.
//
// Nenhuma regra de negócio fica aqui: totais, descontos, estoque e
// validações estão no banco (functions, procedures, views e triggers).
// =====================================================================
const express = require('express');
const path = require('path');
const config = require('./config');
const { pool, consultar, chamarComSaida } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Envolve cada rota: se o banco devolver erro, responde com a mensagem.
 * Erros do SIGNAL SQLSTATE '45000' são regras de negócio (HTTP 400) e a
 * mensagem em português vai direto para a tela.
 */
const rota = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (erro) {
    if (erro.sqlState === '45000') {
      res.status(400).json({ erro: erro.sqlMessage });
    } else {
      console.error(erro);
      const msg = erro.sqlMessage || erro.message || 'Erro inesperado no servidor.';
      res.status(500).json({ erro: `Erro no banco de dados: ${msg}` });
    }
  }
};

// ---------------------------------------------------------------------
// Consultas (SELECT nas views e tabelas de apoio)
// ---------------------------------------------------------------------
app.get('/api/cardapio', rota(() =>
  consultar('SELECT * FROM vw_cardapio ORDER BY categoria, produto')));

app.get('/api/clientes', rota(() =>
  consultar('SELECT id_cliente, nome, cpf FROM cliente ORDER BY nome')));

app.get('/api/funcionarios', rota(() =>
  consultar('SELECT id_funcionario, nome, cargo FROM funcionario ORDER BY nome')));

app.get('/api/categorias', rota(() =>
  consultar('SELECT id_categoria, nome FROM categoria ORDER BY nome')));

app.get('/api/pedidos', rota((req) => {
  const { status } = req.query;
  if (status) {
    return consultar(
      'SELECT * FROM vw_pedidos_detalhados WHERE status = ? ORDER BY id_pedido DESC',
      [status]);
  }
  return consultar('SELECT * FROM vw_pedidos_detalhados ORDER BY id_pedido DESC');
}));

app.get('/api/pedidos/:id', rota(async (req) => {
  const linhas = await consultar(
    'SELECT * FROM vw_pedidos_detalhados WHERE id_pedido = ?', [req.params.id]);
  return linhas[0] || null;
}));

// Itens do pedido (o subtotal é calculado no SELECT, não na tela)
app.get('/api/pedidos/:id/itens', rota((req) =>
  consultar(
    `SELECT i.id_produto, p.nome AS produto, i.quantidade, i.preco_unitario,
            i.quantidade * i.preco_unitario AS subtotal
       FROM item_pedido i
       JOIN produto p ON p.id_produto = i.id_produto
      WHERE i.id_pedido = ?
      ORDER BY p.nome`,
    [req.params.id])));

app.get('/api/produtos-para-repor', rota(() =>
  consultar('SELECT * FROM vw_produtos_para_repor ORDER BY faltam DESC, produto')));

app.get('/api/vendas-por-categoria', rota(() =>
  consultar('SELECT * FROM vw_vendas_por_categoria ORDER BY faturamento DESC')));

app.get('/api/historico-precos', rota(() =>
  consultar(
    `SELECT h.id_historico, h.id_produto, p.nome AS produto, h.preco_antigo,
            h.preco_novo, h.data_alteracao, h.usuario
       FROM historico_preco h
       JOIN produto p ON p.id_produto = h.id_produto
      ORDER BY h.id_historico DESC`)));

// ---------------------------------------------------------------------
// Operações (CALL nas procedures e DELETE de item)
// ---------------------------------------------------------------------
app.post('/api/pedidos', rota(async (req) => {
  const { id_cliente, id_funcionario } = req.body;
  // sp_abrir_pedido devolve o número no parâmetro OUT (@id_pedido)
  return chamarComSaida(
    'CALL sp_abrir_pedido(?, ?, @id_pedido)',
    [id_cliente, id_funcionario],
    'SELECT @id_pedido AS id_pedido');
}));

app.post('/api/pedidos/:id/itens', rota(async (req) => {
  const { id_produto, quantidade } = req.body;
  await consultar('CALL sp_adicionar_item(?, ?, ?)',
    [req.params.id, id_produto, quantidade]);
  return { ok: true };
}));

app.delete('/api/pedidos/:id/itens/:idProduto', rota(async (req) => {
  // O trigger trg_item_devolve_estoque devolve o estoque sozinho
  await consultar('DELETE FROM item_pedido WHERE id_pedido = ? AND id_produto = ?',
    [req.params.id, req.params.idProduto]);
  return { ok: true };
}));

app.post('/api/pedidos/:id/finalizar', rota(async (req) => {
  await consultar('CALL sp_finalizar_pedido(?)', [req.params.id]);
  const linhas = await consultar(
    'SELECT * FROM vw_pedidos_detalhados WHERE id_pedido = ?', [req.params.id]);
  return linhas[0];
}));

app.post('/api/reajuste', rota(async (req) => {
  const { id_categoria, percentual } = req.body;
  await consultar('CALL sp_reajustar_precos_categoria(?, ?)', [id_categoria, percentual]);
  return { ok: true };
}));

// ---------------------------------------------------------------------
// Inicialização: testa a conexão antes de abrir a porta
// ---------------------------------------------------------------------
async function iniciar() {
  try {
    await pool.query('SELECT 1');
  } catch (erro) {
    console.error('\nNão foi possível conectar ao MySQL:', erro.message);
    console.error('Confira usuário, senha e banco em config.js e se o MySQL está ligado.\n');
    process.exit(1);
  }
  app.listen(config.portaServidor, () => {
    console.log(`Grão da Serra rodando em http://localhost:${config.portaServidor}`);
  });
}

iniciar();
