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

  const count = db.prepare('SELECT COUNT(*) as count FROM custom_servers').get().count;
  if (count === 0) {
    console.log('[DB] Base de datos vacía. Insertando servidores populares por defecto...');
    const defaultServers = [
      { name: 'The Hive', target_ip: 'geo.hivebedrock.network', target_port: 19132 },
      { name: 'CubeCraft Games', target_ip: 'mco.cubecraft.net', target_port: 19132 },
      { name: 'Galaxite', target_ip: 'play.galaxite.net', target_port: 19132 },
      { name: 'MineLatino Network', target_ip: 'play.minelatino.com', target_port: 19132 },
      { name: 'HyCraft', target_ip: 'play.hycraft.us', target_port: 19132 },
      { name: 'UniversoCraft', target_ip: 'mc.universocraft.com', target_port: 19132 },
      { name: 'DeathZone', target_ip: 'play.deathzone.es', target_port: 19132 },
      { name: 'SurvivalRolemine', target_ip: 'mc.srolemine.com', target_port: 19132 },
      { name: 'LibreCraft', target_ip: 'librecraft.juegos', target_port: 19132 },
      { name: 'ZoneCraft', target_ip: 'play.zonecraft.es', target_port: 19132 },
      { name: 'OnlyMC', target_ip: 'play.onlymc.us', target_port: 19132 },
      { name: 'Blurkit', target_ip: 'mc.blurkit.net', target_port: 19132 },
      { name: 'Mooncraft', target_ip: 'mooncraft.es', target_port: 19132 },
      { name: 'EventyrMC', target_ip: 'play.eventyr.lat', target_port: 19132 },
      { name: 'PixelCub', target_ip: 'mc.pixelcub.net', target_port: 19132 },
      { name: 'RoundCraft', target_ip: 'mc.roundcraft.lat', target_port: 19132 }
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
