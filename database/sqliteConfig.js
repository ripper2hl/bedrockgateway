const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'gateway.db');
const db = new Database(dbPath);

/**
 * Inicializa la base de datos y asegura la existencia de la tabla de servidores.
 */
function initDb() {
  db.pragma('journal_mode = WAL');

  const createTable = db.prepare(`
    CREATE TABLE IF NOT EXISTS custom_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_ip TEXT NOT NULL,
      target_port INTEGER NOT NULL
    )
  `);

  createTable.run();
}

/**
 * Inserta un nuevo servidor personalizado en la tabla custom_servers.
 *
 * @param {{ name: string, target_ip: string, target_port: number }} serverObj
 * @returns {import('better-sqlite3').RunResult}
 */
function addServer(serverObj) {
  const insert = db.prepare(`
    INSERT INTO custom_servers (name, target_ip, target_port)
    VALUES (@name, @target_ip, @target_port)
  `);

  return insert.run(serverObj);
}

/**
 * Recupera todos los servidores personalizados almacenados.
 *
 * @returns {Array<{ id: number, name: string, target_ip: string, target_port: number }>}
 */
function getAllServers() {
  const select = db.prepare(`
    SELECT id, name, target_ip, target_port
    FROM custom_servers
  `);

  return select.all();
}

module.exports = {
  initDb,
  addServer,
  getAllServers,
};
