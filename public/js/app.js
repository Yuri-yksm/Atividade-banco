// =====================================================================
// Grão da Serra — lógica das telas.
// Este arquivo só exibe dados e aciona as operações do módulo api.js.
// Nada de cálculo de total, desconto ou estoque aqui: tudo vem do banco.
// =====================================================================
import * as api from './api.js';

// ---------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------
let pedidoAtual = null;     // número do pedido na comanda (ou null)
let filtroStatus = '';      // filtro da tela de pedidos

const $ = (seletor) => document.querySelector(seletor);

// ---------------------------------------------------------------------
// Utilitários de formatação (apenas apresentação)
// ---------------------------------------------------------------------
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarMoeda = (valor) => moeda.format(Number(valor ?? 0));

const formatarPercentual = (valor) =>
  `${Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** '2026-11-03 08:20:00' -> '03/11/2026 08:20' */
function formatarData(texto) {
  if (!texto) return '';
  const [data, hora = ''] = texto.split(' ');
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a} ${hora.slice(0, 5)}`.trim();
}

/** Evita que textos do banco sejam interpretados como HTML. */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const nomeStatus = { ABERTO: 'Aberto', PAGO: 'Pago', CANCELADO: 'Cancelado' };
const seloStatus = (s) => `<span class="selo selo-${esc(s)}">${esc(nomeStatus[s] || s)}</span>`;

function seloSituacao(situacao) {
  if (situacao === 'REPOR') return '<span class="selo selo-repor">Últimas unidades</span>';
  if (situacao === 'ESGOTADO') return '<span class="selo selo-esgotado">Esgotado</span>';
  return '';
}

/** Agrupa as linhas do cardápio por categoria, mantendo a ordem. */
function agruparPorCategoria(linhas) {
  const grupos = new Map();
  for (const linha of linhas) {
    if (!grupos.has(linha.categoria)) grupos.set(linha.categoria, []);
    grupos.get(linha.categoria).push(linha);
  }
  return grupos;
}

// ---------------------------------------------------------------------
// Área de mensagens (erros do SIGNAL e confirmações)
// ---------------------------------------------------------------------
let temporizadorMensagem;

function mostrarMensagem(texto, tipo = 'ok') {
  const caixa = $('#mensagem');
  $('#mensagem-texto').textContent = texto;
  caixa.classList.toggle('erro', tipo === 'erro');
  caixa.hidden = false;
  clearTimeout(temporizadorMensagem);
  // Confirmações somem sozinhas; erros ficam até serem fechados
  if (tipo === 'ok') temporizadorMensagem = setTimeout(esconderMensagem, 5000);
}

function esconderMensagem() { $('#mensagem').hidden = true; }

/** Executa uma operação e mostra o erro do banco, se houver. */
async function tentar(operacao) {
  try {
    return await operacao();
  } catch (erro) {
    mostrarMensagem(erro.message, 'erro');
    return undefined;
  }
}

// ---------------------------------------------------------------------
// Navegação entre telas
// ---------------------------------------------------------------------
const carregadores = {
  'novo-pedido': carregarNovoPedido,
  cardapio: carregarCardapio,
  pedidos: carregarPedidos,
  gerencia: carregarGerencia,
};

function irPara(tela) {
  document.querySelectorAll('.tela').forEach((s) =>
    s.classList.toggle('ativa', s.id === `tela-${tela}`));
  document.querySelectorAll('.nav-item').forEach((b) =>
    b.classList.toggle('ativo', b.dataset.tela === tela));
  carregadores[tela]();
}

// =====================================================================
// TELA: NOVO PEDIDO
// =====================================================================
async function carregarNovoPedido() {
  await Promise.all([carregarSelecoes(), carregarProdutosBalcao(), carregarComanda()]);
}

/** Preenche cliente, atendente e a lista de pedidos abertos. */
async function carregarSelecoes() {
  const [clientes, funcionarios, abertos] = await tentar(() => Promise.all([
    api.listarClientes(), api.listarFuncionarios(), api.listarPedidos('ABERTO'),
  ])) || [[], [], []];

  const manterValor = (sel, html) => {
    const anterior = sel.value;
    sel.innerHTML = html;
    if ([...sel.options].some((o) => o.value === anterior)) sel.value = anterior;
  };

  manterValor($('#sel-cliente'), clientes.map((c) =>
    `<option value="${c.id_cliente}">${esc(c.nome)}</option>`).join(''));

  manterValor($('#sel-funcionario'), funcionarios.map((f) =>
    `<option value="${f.id_funcionario}">${esc(f.nome)} (${esc(f.cargo)})</option>`).join(''));

  $('#sel-aberto').innerHTML = abertos.length
    ? abertos.map((p) =>
      `<option value="${p.id_pedido}">Pedido ${p.id_pedido}, ${esc(p.cliente)}</option>`).join('')
    : '<option value="">Nenhum pedido aberto</option>';
  $('#btn-continuar').disabled = abertos.length === 0;
}

/** Lista os produtos do cardápio com quantidade e botão de adicionar. */
async function carregarProdutosBalcao() {
  const cardapio = await tentar(api.listarCardapio) || [];
  const semPedido = pedidoAtual === null;
  let html = semPedido
    ? '<p class="aviso-sem-pedido">Abra um pedido na comanda para começar a adicionar produtos.</p>'
    : '';

  for (const [categoria, produtos] of agruparPorCategoria(cardapio)) {
    html += `<div class="grupo-categoria"><h2>${esc(categoria)}</h2>`;
    for (const p of produtos) {
      const esgotado = p.situacao === 'ESGOTADO';
      const bloqueado = esgotado || semPedido;
      html += `
        <div class="linha-produto ${esgotado ? 'indisponivel' : ''}">
          <span class="nome">${esc(p.produto)} ${seloSituacao(p.situacao)}</span>
          <span class="preco">${formatarMoeda(p.preco)}</span>
          <input type="number" min="1" value="1" aria-label="Quantidade de ${esc(p.produto)}"
                 data-qtd="${p.id_produto}" ${bloqueado ? 'disabled' : ''}>
          <button class="botao botao-linha botao-pequeno" data-adicionar="${p.id_produto}"
                  ${bloqueado ? 'disabled' : ''}>Adicionar</button>
        </div>`;
    }
    html += '</div>';
  }
  $('#balcao-cardapio').innerHTML = html;
}

/** Mostra a comanda: formulário de abertura ou o pedido atual. */
async function carregarComanda() {
  const temPedido = pedidoAtual !== null;
  $('#comanda-abrir').hidden = temPedido;
  $('#comanda-pedido').hidden = !temPedido;
  if (!temPedido) return;

  const resultado = await tentar(() => Promise.all([
    api.buscarPedido(pedidoAtual), api.listarItensPedido(pedidoAtual),
  ]));
  if (!resultado) return;
  const [pedido, itens] = resultado;
  if (!pedido) { pedidoAtual = null; return carregarNovoPedido(); }

  const aberto = pedido.status === 'ABERTO';
  $('#cmd-numero').textContent = pedido.id_pedido;
  $('#cmd-status').className = `selo selo-${pedido.status}`;
  $('#cmd-status').textContent = nomeStatus[pedido.status];
  $('#cmd-cliente').textContent = pedido.cliente;
  $('#cmd-atendente').textContent = pedido.atendente;
  $('#cmd-bruto').textContent = formatarMoeda(pedido.valor_bruto);

  $('#cmd-itens').innerHTML = itens.length
    ? itens.map((i) => `
        <li>
          <span class="qtd">${i.quantidade}×</span>
          <span>${esc(i.produto)}<span class="detalhe">${formatarMoeda(i.preco_unitario)} cada</span></span>
          <span class="subtotal">${formatarMoeda(i.subtotal)}</span>
          ${aberto
            ? `<button class="remover" data-remover="${i.id_produto}" aria-label="Remover ${esc(i.produto)}" title="Remover item">×</button>`
            : '<span></span>'}
        </li>`).join('')
    : '<li><span class="vazio">Nenhum item ainda.</span></li>';

  // Depois de pago, mostra o fechamento gravado pelo banco
  $('#cmd-fechamento').hidden = pedido.status !== 'PAGO';
  $('#cmd-desconto').textContent = formatarPercentual(pedido.desconto_percentual);
  $('#cmd-final').textContent = formatarMoeda(pedido.valor_total);

  $('#btn-finalizar').hidden = !aberto;
  $('#btn-nova-comanda').textContent = aberto ? 'Fechar comanda' : 'Nova comanda';
}

// ---- Ações da tela Novo pedido ----

$('#btn-abrir').addEventListener('click', async () => {
  const resposta = await tentar(() =>
    api.abrirPedido(Number($('#sel-cliente').value), Number($('#sel-funcionario').value)));
  if (!resposta) return;
  pedidoAtual = resposta.id_pedido;
  mostrarMensagem(`Pedido ${pedidoAtual} aberto.`);
  carregarNovoPedido();
});

$('#btn-continuar').addEventListener('click', () => {
  const valor = $('#sel-aberto').value;
  if (!valor) return;
  pedidoAtual = Number(valor);
  carregarNovoPedido();
});

// Adicionar produto (delegação de eventos na lista)
$('#balcao-cardapio').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-adicionar]');
  if (!botao || pedidoAtual === null) return;
  const idProduto = Number(botao.dataset.adicionar);
  const campo = document.querySelector(`[data-qtd="${idProduto}"]`);
  const quantidade = campo.value === '' ? null : Number(campo.value);
  // A validação (quantidade, estoque, pedido aberto) é feita pela procedure
  const ok = await tentar(() => api.adicionarItem(pedidoAtual, idProduto, quantidade));
  if (ok === undefined) return;
  mostrarMensagem('Item adicionado ao pedido.');
  carregarProdutosBalcao();   // o trigger mudou o estoque e talvez a situação
  carregarComanda();
});

// Remover item da comanda
$('#cmd-itens').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-remover]');
  if (!botao) return;
  const ok = await tentar(() => api.removerItem(pedidoAtual, Number(botao.dataset.remover)));
  if (ok === undefined) return;
  mostrarMensagem('Item removido. O estoque foi devolvido.');
  carregarProdutosBalcao();
  carregarComanda();
});

$('#btn-finalizar').addEventListener('click', async () => {
  const pedido = await tentar(() => api.finalizarPedido(pedidoAtual));
  if (!pedido) return;
  mostrarMensagem(
    `Pedido ${pedido.id_pedido} pago. Desconto de ${formatarPercentual(pedido.desconto_percentual)}, ` +
    `total ${formatarMoeda(pedido.valor_total)}.`);
  carregarNovoPedido();
});

$('#btn-nova-comanda').addEventListener('click', () => {
  pedidoAtual = null;
  carregarNovoPedido();
});

// =====================================================================
// TELA: CARDÁPIO
// =====================================================================
async function carregarCardapio() {
  const cardapio = await tentar(api.listarCardapio) || [];
  let html = '';
  for (const [categoria, produtos] of agruparPorCategoria(cardapio)) {
    html += `<div class="grupo-categoria"><h2>${esc(categoria)}</h2>`;
    for (const p of produtos) {
      const esgotado = p.situacao === 'ESGOTADO';
      html += `
        <div class="item-cardapio ${esgotado ? 'indisponivel' : ''}" ${esgotado ? 'aria-disabled="true"' : ''}>
          <span class="nome">${esc(p.produto)} ${seloSituacao(p.situacao)}</span>
          <span class="preco">${formatarMoeda(p.preco)}</span>
        </div>`;
    }
    html += '</div>';
  }
  $('#cardapio-lista').innerHTML = html;
}

// =====================================================================
// TELA: PEDIDOS
// =====================================================================
async function carregarPedidos() {
  const pedidos = await tentar(() => api.listarPedidos(filtroStatus)) || [];
  $('#pedidos-corpo').innerHTML = pedidos.length
    ? pedidos.map((p) => `
        <tr>
          <td><strong>${p.id_pedido}</strong></td>
          <td>${formatarData(p.data_pedido)}</td>
          <td>${seloStatus(p.status)}</td>
          <td>${esc(p.cliente)}</td>
          <td>${esc(p.atendente)}</td>
          <td class="num">${p.qtd_itens}</td>
          <td class="num">${formatarMoeda(p.valor_bruto)}</td>
          <td class="num">${formatarPercentual(p.desconto_percentual)}</td>
          <td class="num">${formatarMoeda(p.valor_total)}</td>
          <td>${p.status === 'ABERTO'
            ? `<button class="botao botao-linha botao-pequeno" data-continuar="${p.id_pedido}">Continuar</button>`
            : ''}</td>
        </tr>`).join('')
    : '<tr><td colspan="10" class="vazio">Nenhum pedido com este status.</td></tr>';
}

document.querySelectorAll('.filtro-op').forEach((botao) =>
  botao.addEventListener('click', () => {
    filtroStatus = botao.dataset.status;
    document.querySelectorAll('.filtro-op').forEach((b) => b.classList.toggle('ativo', b === botao));
    carregarPedidos();
  }));

$('#pedidos-corpo').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-continuar]');
  if (!botao) return;
  pedidoAtual = Number(botao.dataset.continuar);
  irPara('novo-pedido');
});

// =====================================================================
// TELA: GERÊNCIA
// =====================================================================
async function carregarGerencia() {
  const resultado = await tentar(() => Promise.all([
    api.listarProdutosParaRepor(), api.listarVendasPorCategoria(),
    api.listarHistoricoPrecos(), api.listarCategorias(),
  ]));
  if (!resultado) return;
  const [repor, vendas, historico, categorias] = resultado;

  $('#repor-corpo').innerHTML = repor.length
    ? repor.map((p) => `
        <tr>
          <td>${esc(p.produto)}</td>
          <td>${esc(p.categoria)}</td>
          <td class="num">${p.estoque}</td>
          <td class="num">${p.estoque_minimo}</td>
          <td class="num"><strong>${p.faltam}</strong></td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Nenhum produto abaixo do estoque mínimo.</td></tr>';

  // A barra é só visual: largura proporcional ao maior faturamento
  const maior = Math.max(...vendas.map((v) => Number(v.faturamento)), 1);
  $('#vendas-lista').innerHTML = vendas.map((v) => `
    <div class="venda-linha">
      <span>${esc(v.categoria)} <span class="unidades">${v.unidades} un.</span></span>
      <span class="valor">${formatarMoeda(v.faturamento)}</span>
      <div class="venda-barra"><span style="width:${(Number(v.faturamento) / maior) * 100}%"></span></div>
    </div>`).join('');

  const selCategoria = $('#reaj-categoria');
  const anterior = selCategoria.value;
  selCategoria.innerHTML = categorias.map((c) =>
    `<option value="${c.id_categoria}">${esc(c.nome)}</option>`).join('');
  if (anterior) selCategoria.value = anterior;

  $('#historico-corpo').innerHTML = historico.length
    ? historico.map((h) => `
        <tr>
          <td>${formatarData(h.data_alteracao)}</td>
          <td>${esc(h.produto)}</td>
          <td class="num">${formatarMoeda(h.preco_antigo)}</td>
          <td class="num">${formatarMoeda(h.preco_novo)}</td>
          <td>${esc(h.usuario)}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="vazio">Nenhuma alteração de preço registrada.</td></tr>';
}

$('#form-reajuste').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const campo = $('#reaj-percentual');
  const percentual = campo.value === '' ? null : Number(campo.value);
  const selCategoria = $('#reaj-categoria');
  const nomeCategoria = selCategoria.selectedOptions[0]?.textContent;
  const ok = await tentar(() => api.reajustarPrecos(Number(selCategoria.value), percentual));
  if (ok === undefined) return;
  mostrarMensagem(`Preços de ${nomeCategoria} reajustados em ${formatarPercentual(percentual)}.`);
  campo.value = '';
  carregarGerencia();
});

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------
document.querySelectorAll('.nav-item').forEach((botao) =>
  botao.addEventListener('click', () => irPara(botao.dataset.tela)));
$('#mensagem-fechar').addEventListener('click', esconderMensagem);

irPara('novo-pedido');
