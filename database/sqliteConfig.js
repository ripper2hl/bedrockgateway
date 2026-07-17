const Database = require('better-sqlite3');
const path = require('path');

// DB_PATH permite mover el archivo .db fuera del directorio de código.
// En Docker se debe pasar -e DB_PATH=/app/data/gateway.db para que el volumen
// de datos persista la BD sin sobreescribir el directorio que contiene este JS.
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, 'gateway.db');

const db = new Database(dbPath);

/**
 * Inicializa la base de datos y asegura la existencia de la tabla de servidores.
 */
function initDb() {
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS custom_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_ip TEXT NOT NULL,
      target_port INTEGER NOT NULL,
      online_status INTEGER DEFAULT 0,
      players_online INTEGER DEFAULT 0
    )
  `).run();

  // Asegurar compatibilidad para bases de datos existentes
  try { db.prepare('ALTER TABLE custom_servers ADD COLUMN online_status INTEGER DEFAULT 0').run(); } catch (e) { /* Columna ya existe */ }
  try { db.prepare('ALTER TABLE custom_servers ADD COLUMN players_online INTEGER DEFAULT 0').run(); } catch (e) { /* Columna ya existe */ }

  // ── Tabla de servidores locales Docker ──────────────────────────────────────
  db.prepare(`
    CREATE TABLE IF NOT EXISTS local_servers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      puerto       INTEGER NOT NULL UNIQUE,
      container_id TEXT    NOT NULL,
      estado       TEXT    NOT NULL DEFAULT 'iniciando',
      world_folder TEXT    NOT NULL,
      gamemode     TEXT    NOT NULL DEFAULT 'survival',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  console.log('[DB] Tabla local_servers verificada.');

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
    ORDER BY id DESC
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

/**
 * Obtiene un servidor por su ID.
 *
 * @param {number} id
 * @returns {{ id: number, name: string, target_ip: string, target_port: number, online_status: number, players_online: number } | undefined}
 */
function getServerById(id) {
  return db.prepare('SELECT * FROM custom_servers WHERE id = ?').get(id);
}

/**
 * Actualiza los datos de un servidor existente (nombre, IP, puerto).
 *
 * @param {number} id
 * @param {{ name: string, target_ip: string, target_port: number }} serverObj
 * @returns {import('better-sqlite3').RunResult}
 */
function updateServer(id, serverObj) {
  const update = db.prepare(`
    UPDATE custom_servers
    SET name = @name, target_ip = @target_ip, target_port = @target_port
    WHERE id = @id
  `);
  return update.run({ id, ...serverObj });
}

/**
 * Elimina un servidor de la base de datos por su ID.
 *
 * @param {number} id
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteServer(id) {
  return db.prepare('DELETE FROM custom_servers WHERE id = ?').run(id);
}

// ─── CRUD: SERVIDORES LOCALES DOCKER ─────────────────────────────────────────

/**
 * Inserta un nuevo servidor local Docker en la tabla local_servers.
 *
 * @param {{ name: string, puerto: number, container_id: string, estado: string, world_folder: string, gamemode: string }} obj
 * @returns {import('better-sqlite3').RunResult}
 */
function addLocalServer({ name, puerto, container_id, estado, world_folder, gamemode }) {
  return db.prepare(`
    INSERT INTO local_servers (name, puerto, container_id, estado, world_folder, gamemode)
    VALUES (@name, @puerto, @container_id, @estado, @world_folder, @gamemode)
  `).run({ name, puerto, container_id, estado, world_folder, gamemode });
}

/**
 * Recupera todos los servidores locales.
 *
 * @returns {Array<{ id: number, name: string, puerto: number, container_id: string, estado: string, world_folder: string, gamemode: string, created_at: string }>}
 */
function getAllLocalServers() {
  return db.prepare(`
    SELECT id, name, puerto, container_id, estado, world_folder, gamemode, created_at
    FROM local_servers
    ORDER BY id DESC
  `).all();
}

/**
 * Obtiene un servidor local por su ID.
 *
 * @param {number} id
 * @returns {object|undefined}
 */
function getLocalServerById(id) {
  return db.prepare('SELECT * FROM local_servers WHERE id = ?').get(id);
}

/**
 * Actualiza el estado de un servidor local.
 * Estados válidos: 'iniciando' | 'activo' | 'detenido'
 *
 * @param {number} id
 * @param {string} estado
 * @returns {import('better-sqlite3').RunResult}
 */
function updateLocalServerEstado(id, estado) {
  return db.prepare('UPDATE local_servers SET estado = ? WHERE id = ?').run(estado, id);
}

/**
 * Actualiza el container_id de un servidor local (se llena una vez que Docker devuelve el ID real).
 *
 * @param {number} id
 * @param {string} container_id
 * @returns {import('better-sqlite3').RunResult}
 */
function updateLocalServerContainerId(id, container_id) {
  return db.prepare('UPDATE local_servers SET container_id = ? WHERE id = ?').run(container_id, id);
}

/**
 * Elimina un servidor local de la base de datos.
 * (El mundo en disco NO se elimina — es responsabilidad del caller).
 *
 * @param {number} id
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteLocalServer(id) {
  return db.prepare('DELETE FROM local_servers WHERE id = ?').run(id);
}

// ─── FACTORY PARA TESTING ────────────────────────────────────────────────────

/**
 * Crea una instancia aislada de la base de datos con todas las funciones CRUD.
 * Úsala en tests con ':memory:' para no tocar la BD de producción.
 *
 * @param {string} customDbPath  Ruta al archivo SQLite o ':memory:'
 * @returns {{ initDb, addServer, getAllServers, getServerById, updateServer, deleteServer, updateServerStatus }}
 */
function createDb(customDbPath) {
  const instance = new Database(customDbPath);

  function initDb() {
    instance.prepare(`
      CREATE TABLE IF NOT EXISTS custom_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_ip TEXT NOT NULL,
        target_port INTEGER NOT NULL,
        online_status INTEGER DEFAULT 0,
        players_online INTEGER DEFAULT 0
      )
    `).run();
  }

  function addServer(serverObj) {
    const check = instance.prepare(
      'SELECT id FROM custom_servers WHERE target_ip = ? AND target_port = ?'
    ).get(serverObj.target_ip, serverObj.target_port);
    if (check) return { changes: 0, lastInsertRowid: check.id };

    return instance.prepare(
      'INSERT INTO custom_servers (name, target_ip, target_port) VALUES (@name, @target_ip, @target_port)'
    ).run(serverObj);
  }

  function getAllServers() {
    return instance.prepare(
      'SELECT id, name, target_ip, target_port, online_status, players_online FROM custom_servers ORDER BY id DESC'
    ).all();
  }

  function getServerById(id) {
    return instance.prepare('SELECT * FROM custom_servers WHERE id = ?').get(id);
  }

  function updateServer(id, serverObj) {
    return instance.prepare(
      'UPDATE custom_servers SET name = @name, target_ip = @target_ip, target_port = @target_port WHERE id = @id'
    ).run({ id, ...serverObj });
  }

  function deleteServer(id) {
    return instance.prepare('DELETE FROM custom_servers WHERE id = ?').run(id);
  }

  function updateServerStatus(id, online_status, players_online) {
    return instance.prepare(
      'UPDATE custom_servers SET online_status = @online_status, players_online = @players_online WHERE id = @id'
    ).run({ id, online_status, players_online });
  }

  return { initDb, addServer, getAllServers, getServerById, updateServer, deleteServer, updateServerStatus };
}

module.exports = {
  initDb,
  addServer,
  getAllServers,
  getServerById,
  updateServer,
  deleteServer,
  updateServerStatus,
  createDb,
  // Servidores locales Docker
  addLocalServer,
  getAllLocalServers,
  getLocalServerById,
  updateLocalServerEstado,
  updateLocalServerContainerId,
  deleteLocalServer,
};
