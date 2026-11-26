// =====================================================================
// Conexão com o MySQL (pool de conexões do pacote mysql2).
// Todo o acesso ao banco do servidor passa por este arquivo.
// =====================================================================
const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  ...config.banco,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,     // datas chegam como texto 'AAAA-MM-DD hh:mm:ss'
  decimalNumbers: true,  // DECIMAL chega como número, não como texto
});

/** Executa um SELECT (ou outro comando) e devolve as linhas. */
async function consultar(sql, parametros = []) {
  const [linhas] = await pool.query(sql, parametros);
  return linhas;
}

/**
 * Executa um CALL. Quando a procedure tem parâmetro OUT, a variável de
 * sessão (@...) só existe na mesma conexão; por isso pegamos uma conexão
 * exclusiva, fazemos o CALL e o SELECT nela e depois a devolvemos ao pool.
 */
async function chamarComSaida(sqlCall, parametros, sqlSaida) {
  const conexao = await pool.getConnection();
  try {
    await conexao.query(sqlCall, parametros);
    const [linhas] = await conexao.query(sqlSaida);
    return linhas[0];
  } finally {
    conexao.release();
  }
}

module.exports = { pool, consultar, chamarComSaida };
