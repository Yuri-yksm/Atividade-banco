# Grão da Serra: interface do sistema de pedidos (Questão 16)

Site em HTML, CSS e JavaScript com um servidor intermediário em Node.js
que se conecta ao banco MySQL `grao_da_serra`.

## Como rodar

1. **Banco**: no MySQL Workbench, execute `banco/01_criacao_do_banco.sql`
   (o script do enunciado) e depois `banco/02_questoes_1_a_15.sql`
   (functions, procedures, views e triggers).
2. **Node.js**: instale o Node.js (versão 18 ou mais nova) em https://nodejs.org.
3. **Dados de acesso**: abra `config.js` e troque `user` e `password`
   pelos do seu MySQL.
4. **Dependências**: no terminal, dentro desta pasta, rode:
   ```
   npm install
   ```
5. **Iniciar**:
   ```
   npm start
   ```
   e abra http://localhost:3000 no navegador.

Se aparecer "Não foi possível conectar ao MySQL", confira se o MySQL está
ligado e se o usuário, a senha e o nome do banco em `config.js` estão
corretos.

## Estrutura

```
banco/           scripts SQL (criação + questões 1 a 15)
config.js        dados de acesso ao banco (host, porta, usuário, senha, banco)
db.js            pool de conexões MySQL (pacote mysql2)
server.js        rotas da API: SELECT nas views e CALL nas procedures
public/
  index.html     as quatro telas: Novo pedido, Cardápio, Pedidos e Gerência
  css/estilo.css visual da interface
  js/api.js      módulo único de acesso a dados (uma função por operação)
  js/app.js      comportamento das telas
```

## Telas

- **Novo pedido**: escolhe cliente e atendente e abre o pedido
  (`sp_abrir_pedido`), ou continua um pedido já aberto. Na lista de
  produtos, adiciona itens com quantidade (`sp_adicionar_item`). Na
  comanda, remove itens (DELETE em `item_pedido`) e finaliza o pedido
  (`sp_finalizar_pedido`), que mostra o desconto e o total gravados pelo
  banco.
- **Cardápio**: `vw_cardapio` agrupada por categoria. Produtos esgotados
  aparecem desabilitados e os que estão para repor recebem o aviso
  "Últimas unidades".
- **Pedidos**: `vw_pedidos_detalhados` com filtro por status. Os pedidos
  abertos têm o botão "Continuar".
- **Gerência**: `vw_produtos_para_repor`, `vw_vendas_por_categoria`,
  formulário de reajuste (`sp_reajustar_precos_categoria`) e a tabela
  `historico_preco`.

As mensagens de erro das procedures e dos triggers (SIGNAL) aparecem na
faixa no topo da tela. A interface não valida nem calcula nada: quem
recusa uma quantidade inválida ou um estoque insuficiente é o banco.

## Descrição da conexão

A interface foi feita como página web (HTML, CSS e JavaScript), e como o
navegador não consegue se conectar diretamente ao MySQL, foi criado um
programa intermediário em Node.js com o framework Express, que usa o
conector `mysql2` para falar com o banco `grao_da_serra`. Os dados de
acesso (servidor, porta, usuário, senha e nome do banco) ficam no arquivo
`config.js`, no servidor, e nunca chegam ao navegador; o arquivo `db.js`
cria com eles um pool de conexões. Na página, todo o acesso a dados está
no módulo `public/js/api.js`, onde cada função faz uma requisição HTTP
(`fetch`) para uma rota do servidor. Para exibir uma view, por exemplo o
cardápio, `listarCardapio()` chama `GET /api/cardapio`, e o servidor
executa `SELECT * FROM vw_cardapio` e devolve as linhas em JSON. Para
executar uma procedure, por exemplo adicionar um item, `adicionarItem()`
envia `POST /api/pedidos/{id}/itens` com o produto e a quantidade, e o
servidor executa `CALL sp_adicionar_item(?, ?, ?)` com parâmetros
(o que evita injeção de SQL). No caso de `sp_abrir_pedido`, que tem
parâmetro OUT, o servidor faz o `CALL` e o `SELECT @id_pedido` na mesma
conexão para ler o número gerado. Quando uma procedure ou um trigger
dispara um SIGNAL, o servidor reconhece o SQLSTATE 45000 e devolve a
mensagem em português, que a página mostra na faixa de mensagens.
