// =====================================================================
// Módulo de acesso a dados — o ÚNICO arquivo da interface que fala com
// o servidor. Cada função corresponde a uma operação do sistema e
// chama uma rota do server.js, que executa SELECT nas views ou CALL
// nas procedures do banco grao_da_serra.
// =====================================================================

/**
 * Faz a requisição e devolve o JSON. Se o servidor responder com erro,
 * lança um Error com a mensagem do banco (as mensagens do SIGNAL).
 */
async function requisitar(url, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique se o "npm start" está rodando.');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.erro || `Erro ${resposta.status} ao falar com o servidor.`);
  }
  return dados;
}

const enviar = (url, metodo, corpo) =>
  requisitar(url, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });

// ---------------- Consultas ----------------

/** vw_cardapio: id_produto, categoria, produto, preco, situacao */
export const listarCardapio = () => requisitar('/api/cardapio');

/** tabela cliente: id_cliente, nome, cpf */
export const listarClientes = () => requisitar('/api/clientes');

/** tabela funcionario: id_funcionario, nome, cargo */
export const listarFuncionarios = () => requisitar('/api/funcionarios');

/** tabela categoria: id_categoria, nome (para o formulário de reajuste) */
export const listarCategorias = () => requisitar('/api/categorias');

/** vw_pedidos_detalhados, opcionalmente filtrada por status */
export const listarPedidos = (status = '') =>
  requisitar(`/api/pedidos${status ? `?status=${encodeURIComponent(status)}` : ''}`);

/** Uma linha de vw_pedidos_detalhados */
export const buscarPedido = (idPedido) => requisitar(`/api/pedidos/${idPedido}`);

/** Itens do pedido: id_produto, produto, quantidade, preco_unitario, subtotal */
export const listarItensPedido = (idPedido) => requisitar(`/api/pedidos/${idPedido}/itens`);

/** vw_produtos_para_repor */
export const listarProdutosParaRepor = () => requisitar('/api/produtos-para-repor');

/** vw_vendas_por_categoria */
export const listarVendasPorCategoria = () => requisitar('/api/vendas-por-categoria');

/** historico_preco (com o nome do produto) */
export const listarHistoricoPrecos = () => requisitar('/api/historico-precos');

// ---------------- Operações ----------------

/** CALL sp_abrir_pedido(cliente, funcionario, OUT id) — devolve { id_pedido } */
export const abrirPedido = (idCliente, idFuncionario) =>
  enviar('/api/pedidos', 'POST', { id_cliente: idCliente, id_funcionario: idFuncionario });

/** CALL sp_adicionar_item(pedido, produto, quantidade) */
export const adicionarItem = (idPedido, idProduto, quantidade) =>
  enviar(`/api/pedidos/${idPedido}/itens`, 'POST', { id_produto: idProduto, quantidade });

/** DELETE FROM item_pedido (o trigger devolve o estoque) */
export const removerItem = (idPedido, idProduto) =>
  enviar(`/api/pedidos/${idPedido}/itens/${idProduto}`, 'DELETE');

/** CALL sp_finalizar_pedido(pedido) — devolve a linha atualizada da view */
export const finalizarPedido = (idPedido) =>
  enviar(`/api/pedidos/${idPedido}/finalizar`, 'POST');

/** CALL sp_reajustar_precos_categoria(categoria, percentual) */
export const reajustarPrecos = (idCategoria, percentual) =>
  enviar('/api/reajuste', 'POST', { id_categoria: idCategoria, percentual });
