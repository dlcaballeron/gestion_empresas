// backend/db.js
const mysql = require('mysql2');
require('dotenv').config();

// 🔍 Mostrar los valores de conexión (sin mostrar contraseña)
console.log('📡 MySQL config:');
console.log('   ➤ Host:', process.env.DB_HOST);
console.log('   ➤ User:', process.env.DB_USER);
console.log('   ➤ DB  :', process.env.DB_NAME);

// Usa un POOL (permite db.getConnection(), beginTransaction, release, etc.)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,     // ajusta según tu proyecto
  queueLimit: 0,
  charset: 'utf8mb4',      // por seguridad con emojis/acentos
  multipleStatements: false
});

// Promesas para async/await
const db = pool.promise();

(async () => {
  try {
    // probamos una query rápida para validar conexión
    await db.query('SELECT 1');
    console.log('🟢 Conexión a MySQL OK (pool + promises)');
  } catch (err) {
    console.error('❌ Error inicial de MySQL:', err.message);
  }
})();

module.exports = db;
