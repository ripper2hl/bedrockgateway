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
      target_port INTEGER NOT NULL,
      online_status INTEGER DEFAULT 0,
      players_online INTEGER DEFAULT 0
    )
  `);

  createTable.run();

  // Asegurar compatibilidad para bases de datos existentes
  try { db.prepare('ALTER TABLE custom_servers ADD COLUMN online_status INTEGER DEFAULT 0').run(); } catch (e) { /* Columna ya existe */ }
  try { db.prepare('ALTER TABLE custom_servers ADD COLUMN players_online INTEGER DEFAULT 0').run(); } catch (e) { /* Columna ya existe */ }

  const count = db.prepare('SELECT COUNT(*) as count FROM custom_servers').get().count;
  if (count === 0) {
    console.log('[DB] Base de datos vacía. Insertando servidores populares por defecto...');
    const defaultServers = [
      { name: 'The Hive', target_ip: 'geo.hivebedrock.network', target_port: 19132 },
      { name: 'CubeCraft Games', target_ip: 'mco.cubecraft.net', target_port: 19132 },
      { name: 'Galaxite', target_ip: 'play.galaxite.net', target_port: 19132 },
      { name: 'NetherGames', target_ip: 'play.nethergames.org', target_port: 19132 },
      { name: 'Hyperlands', target_ip: 'play.hyperlandsmc.net', target_port: 19132 },
      { name: 'Zeqa', target_ip: 'zeqa.net', target_port: 19132 }
    ];

    const insert = db.prepare(`
      INSERT INTO custom_servers (name, target_ip, target_port)
      VALUES (@name, @target_ip, @target_port)
    `);

    const insertMany = db.transaction((servers) => {
      for (const server of servers) {
        insert.run(server);
      }
    });

    insertMany(defaultServers);
    console.log('[DB] Servidores por defecto añadidos correctamente.');
  }
}

/**
 * Inserta un nuevo servidor personalizado en la tabla custom_servers.
 *
 * @param {{ name: string, target_ip: string, target_port: number }} serverObj
 * @returns {import('better-sqlite3').RunResult}
 */
function addServer(serverObj) {
  const check = db.prepare('SELECT id FROM custom_servers WHERE target_ip = ? AND target_port = ?').get(serverObj.target_ip, serverObj.target_port);
  if (check) {
    return { changes: 0, lastInsertRowid: check.id }; // Ya existe
  }

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
    SELECT id, name, target_ip, target_port, online_status, players_online
    FROM custom_servers
  `);

  return select.all();
}

/**
 * Actualiza el estado online y cantidad de jugadores de un servidor.
 */
function updateServerStatus(id, online_status, players_online) {
  const update = db.prepare(`
    UPDATE custom_servers
    SET online_status = @online_status, players_online = @players_online
    WHERE id = @id
  `);
  return update.run({ id, online_status, players_online });
}

module.exports = {
  initDb,
  addServer,
  getAllServers,
  updateServerStatus,
};
