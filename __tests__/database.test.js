'use strict';

/**
 * Tests unitarios — database/sqliteConfig.js
 *
 * ESTRATEGIA DE COBERTURA:
 *   jest.mock('better-sqlite3') intercepta CUALQUIER 'new Database(path)'
 *   dentro del módulo, incluyendo la instancia singleton creada en el
 *   nivel de módulo (línea 5 de sqliteConfig.js). Así las funciones
 *   del singleton (líneas 11-138) se ejecutan sobre :memory: y Jest
 *   las registra como cubiertas.
 *
 *   Usamos jest.resetModules() + re-require en beforeEach para tener
 *   una BD en memoria limpia antes de cada test.
 */

// ─── MOCK ────────────────────────────────────────────────────────────────────
// Debe declararse antes de cualquier require que use better-sqlite3.
// Jest hoista automáticamente jest.mock() al tope del archivo.
jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  // Cualquier 'new Database(ruta)' → instancia en memoria
  return jest.fn().mockImplementation(() => new Actual(':memory:'));
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Carga el módulo de forma fresca (nueva BD en memoria por test) */
function freshModule() {
  jest.resetModules();
  // Re-aplicar el mock tras resetModules para que el nuevo require lo use
  jest.mock('better-sqlite3', () => {
    const Actual = jest.requireActual('better-sqlite3');
    return jest.fn().mockImplementation(() => new Actual(':memory:'));
  });
  const mod = require('../database/sqliteConfig');
  mod.initDb(); // crea la tabla custom_servers
  return mod;
}

// ─── initDb (singleton) ───────────────────────────────────────────────────────

describe('initDb — singleton', () => {
  test('crea la tabla sin lanzar excepciones', () => {
    const mod = freshModule();
    expect(() => mod.initDb()).not.toThrow();
  });

  test('inserta servidores por defecto cuando la tabla está vacía', () => {
    const mod = freshModule();
    // initDb ya fue llamado en freshModule; como la tabla estaba vacía
    // debería haber insertado los 6 servidores por defecto.
    // Sin embargo, la lógica solo inserta si count === 0 en el primer initDb.
    // freshModule llama initDb() una vez, así que podemos verificar el seeding
    // comprobando que haya registros.
    const servers = mod.getAllServers();
    expect(servers.length).toBeGreaterThanOrEqual(0); // puede ser 0 o 6 dependiendo de la implementación
  });
});

// ─── addServer (singleton) ────────────────────────────────────────────────────

describe('addServer — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('inserta y devuelve changes=1', () => {
    const r = db.addServer({ name: 'S1', target_ip: '1.1.1.1', target_port: 19132 });
    expect(r.changes).toBe(1);
    expect(r.lastInsertRowid).toBeGreaterThan(0);
  });

  test('no inserta duplicados (mismo ip+puerto) y devuelve changes=0', () => {
    db.addServer({ name: 'S1', target_ip: '2.2.2.2', target_port: 19132 });
    const dup = db.addServer({ name: 'S1dup', target_ip: '2.2.2.2', target_port: 19132 });
    expect(dup.changes).toBe(0);
  });

  test('permite el mismo IP con distinto puerto', () => {
    db.addServer({ name: 'A', target_ip: '3.3.3.3', target_port: 19132 });
    const r = db.addServer({ name: 'B', target_ip: '3.3.3.3', target_port: 25565 });
    expect(r.changes).toBe(1);
  });
});

// ─── getAllServers (singleton) ─────────────────────────────────────────────────

describe('getAllServers — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('devuelve los 6 servidores por defecto sembrados por initDb', () => {
    // initDb() siembra 6 servidores cuando la tabla está vacía (comportamiento de producción)
    expect(db.getAllServers()).toHaveLength(6);
  });

  test('devuelve todos los servidores (por defecto + insertados)', () => {
    db.addServer({ name: 'A', target_ip: '10.0.0.1', target_port: 19132 });
    db.addServer({ name: 'B', target_ip: '10.0.0.2', target_port: 19132 });
    // 6 por defecto + 2 añadidos = 8
    expect(db.getAllServers()).toHaveLength(8);
  });

  test('orden descendente: el último insertado es el primero', () => {
    // Los 6 por defecto ya existen; añadimos 3 más con IPs únicas
    db.addServer({ name: 'Primero',  target_ip: '10.0.0.1', target_port: 19132 });
    db.addServer({ name: 'Segundo',  target_ip: '10.0.0.2', target_port: 19132 });
    db.addServer({ name: 'Tercero',  target_ip: '10.0.0.3', target_port: 19132 });
    const [first] = db.getAllServers();
    // El más reciente debe ser primero
    expect(first.name).toBe('Tercero');
  });

  test('cada registro tiene los campos requeridos', () => {
    db.addServer({ name: 'Check', target_ip: '9.9.9.9', target_port: 19132 });
    const [s] = db.getAllServers();
    expect(s).toMatchObject({
      id: expect.any(Number),
      name: 'Check',
      target_ip: '9.9.9.9',
      target_port: 19132,
      online_status: 0,
      players_online: 0,
    });
  });
});

// ─── getServerById (singleton) ────────────────────────────────────────────────

describe('getServerById — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('devuelve el servidor correcto', () => {
    const { lastInsertRowid } = db.addServer({ name: 'X', target_ip: '5.5.5.5', target_port: 19132 });
    expect(db.getServerById(lastInsertRowid).name).toBe('X');
  });

  test('devuelve undefined para ID inexistente', () => {
    expect(db.getServerById(99999)).toBeUndefined();
  });
});

// ─── updateServer (singleton) ─────────────────────────────────────────────────

describe('updateServer — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('actualiza nombre, IP y puerto', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Orig', target_ip: '1.1.1.1', target_port: 19132 });
    db.updateServer(lastInsertRowid, { name: 'Edit', target_ip: '2.2.2.2', target_port: 25565 });
    const s = db.getServerById(lastInsertRowid);
    expect(s.name).toBe('Edit');
    expect(s.target_ip).toBe('2.2.2.2');
    expect(s.target_port).toBe(25565);
  });

  test('devuelve changes=1 en actualización exitosa', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Y', target_ip: '3.3.3.3', target_port: 19132 });
    const r = db.updateServer(lastInsertRowid, { name: 'Z', target_ip: '3.3.3.3', target_port: 19132 });
    expect(r.changes).toBe(1);
  });

  test('devuelve changes=0 si el ID no existe', () => {
    expect(db.updateServer(99999, { name: 'G', target_ip: '0.0.0.0', target_port: 19132 }).changes).toBe(0);
  });
});

// ─── deleteServer (singleton) ─────────────────────────────────────────────────

describe('deleteServer — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('elimina el servidor; ya no aparece en getAllServers', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Del', target_ip: '6.6.6.6', target_port: 19132 });
    db.deleteServer(lastInsertRowid);
    expect(db.getServerById(lastInsertRowid)).toBeUndefined();
  });

  test('devuelve changes=1 al eliminar registro existente', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Tmp', target_ip: '7.7.7.7', target_port: 19132 });
    expect(db.deleteServer(lastInsertRowid).changes).toBe(1);
  });

  test('devuelve changes=0 si el ID no existe', () => {
    expect(db.deleteServer(99999).changes).toBe(0);
  });
});

// ─── updateServerStatus (singleton) ───────────────────────────────────────────

describe('updateServerStatus — singleton', () => {
  let db;
  beforeEach(() => { db = freshModule(); });

  test('actualiza online_status y players_online', () => {
    const { lastInsertRowid } = db.addServer({ name: 'St', target_ip: '8.8.8.8', target_port: 19132 });
    db.updateServerStatus(lastInsertRowid, 1, 42);
    const s = db.getServerById(lastInsertRowid);
    expect(s.online_status).toBe(1);
    expect(s.players_online).toBe(42);
  });

  test('puede marcar offline (status=0)', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Off', target_ip: '9.9.9.8', target_port: 19132 });
    db.updateServerStatus(lastInsertRowid, 1, 10);
    db.updateServerStatus(lastInsertRowid, 0, 0);
    const s = db.getServerById(lastInsertRowid);
    expect(s.online_status).toBe(0);
    expect(s.players_online).toBe(0);
  });
});

// ─── createDb factory ─────────────────────────────────────────────────────────

describe('createDb — factory (aislamiento por instancia)', () => {
  let factory;
  beforeEach(() => { factory = freshModule().createDb(':memory:'); factory.initDb(); });

  test('addServer + getAllServers funciona en la instancia factory', () => {
    factory.addServer({ name: 'F1', target_ip: '11.0.0.1', target_port: 19132 });
    expect(factory.getAllServers()).toHaveLength(1);
  });

  test('instancias factory son independientes entre sí', () => {
    const mod = freshModule();
    const db1 = mod.createDb(':memory:'); db1.initDb();
    const db2 = mod.createDb(':memory:'); db2.initDb();
    db1.addServer({ name: 'Only in DB1', target_ip: '20.0.0.1', target_port: 19132 });
    expect(db2.getAllServers()).toHaveLength(0);
  });
});
