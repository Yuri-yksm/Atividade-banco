
module.exports = {
  banco: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345678',
    database: process.env.DB_NAME || 'grao_da_serra',
  },
  //http://localhost:3000
  portaServidor: Number(process.env.PORTA || 3000),
};
