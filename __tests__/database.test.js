'use strict';

/**
 * Tests unitarios — database/sqliteConfig.js
 *
 * Usa createDb(':memory:') para operar completamente en RAM.
 * La BD de producción (gateway.db) nunca se toca.
 */

const { createDb } = require('../database/sqliteConfig');

// ─── SETUP ───────────────────────────────────────────────────────────────────

let db;

beforeEach(() => {
  // Instancia nueva y limpia antes de CADA test → aislamiento total
  db = createDb(':memory:');
  db.initDb();
});

// ─── addServer ────────────────────────────────────────────────────────────────

describe('addServer', () => {
  test('inserta un servidor y devuelve changes=1', () => {
    const result = db.addServer({ name: 'Test Server', target_ip: '1.2.3.4', target_port: 19132 });
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBeGreaterThan(0);
  });

  test('no inserta duplicados (mismo ip+puerto) y devuelve changes=0', () => {
    db.addServer({ name: 'Server A', target_ip: '1.2.3.4', target_port: 19132 });
    const dup = db.addServer({ name: 'Server A Dup', target_ip: '1.2.3.4', target_port: 19132 });
    expect(dup.changes).toBe(0);
  });

  test('permite el mismo IP con distinto puerto', () => {
    db.addServer({ name: 'S1', target_ip: '1.2.3.4', target_port: 19132 });
    const result = db.addServer({ name: 'S2', target_ip: '1.2.3.4', target_port: 25565 });
    expect(result.changes).toBe(1);
  });
});

// ─── getAllServers ─────────────────────────────────────────────────────────────

describe('getAllServers', () => {
  test('devuelve un arreglo vacío cuando no hay servidores', () => {
    expect(db.getAllServers()).toEqual([]);
  });

  test('devuelve todos los servidores insertados', () => {
    db.addServer({ name: 'A', target_ip: '10.0.0.1', target_port: 19132 });
    db.addServer({ name: 'B', target_ip: '10.0.0.2', target_port: 19132 });
    const all = db.getAllServers();
    expect(all).toHaveLength(2);
  });

  test('devuelve los registros ordenados del más reciente al más antiguo (ORDER BY id DESC)', () => {
    db.addServer({ name: 'Primero', target_ip: '10.0.0.1', target_port: 19132 });
    db.addServer({ name: 'Segundo', target_ip: '10.0.0.2', target_port: 19132 });
    db.addServer({ name: 'Tercero', target_ip: '10.0.0.3', target_port: 19132 });

    const all = db.getAllServers();
    expect(all[0].name).toBe('Tercero');
    expect(all[1].name).toBe('Segundo');
    expect(all[2].name).toBe('Primero');
  });

  test('cada registro incluye los campos requeridos', () => {
    db.addServer({ name: 'Check', target_ip: '9.9.9.9', target_port: 19132 });
    const [server] = db.getAllServers();
    expect(server).toMatchObject({
      id: expect.any(Number),
      name: 'Check',
      target_ip: '9.9.9.9',
      target_port: 19132,
      online_status: 0,
      players_online: 0,
    });
  });
});

// ─── getServerById ────────────────────────────────────────────────────────────

describe('getServerById', () => {
  test('devuelve el servidor correcto por ID', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Lookup', target_ip: '5.5.5.5', target_port: 19132 });
    const server = db.getServerById(lastInsertRowid);
    expect(server).not.toBeNull();
    expect(server.name).toBe('Lookup');
  });

  test('devuelve undefined para un ID inexistente', () => {
    expect(db.getServerById(99999)).toBeUndefined();
  });
});

// ─── updateServer ─────────────────────────────────────────────────────────────

describe('updateServer', () => {
  test('actualiza nombre, IP y puerto correctamente', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Original', target_ip: '1.1.1.1', target_port: 19132 });
    db.updateServer(lastInsertRowid, { name: 'Editado', target_ip: '2.2.2.2', target_port: 25565 });

    const updated = db.getServerById(lastInsertRowid);
    expect(updated.name).toBe('Editado');
    expect(updated.target_ip).toBe('2.2.2.2');
    expect(updated.target_port).toBe(25565);
  });

  test('devuelve changes=1 cuando la actualización es exitosa', () => {
    const { lastInsertRowid } = db.addServer({ name: 'X', target_ip: '3.3.3.3', target_port: 19132 });
    const result = db.updateServer(lastInsertRowid, { name: 'Y', target_ip: '3.3.3.3', target_port: 19132 });
    expect(result.changes).toBe(1);
  });

  test('devuelve changes=0 si el ID no existe', () => {
    const result = db.updateServer(99999, { name: 'Ghost', target_ip: '0.0.0.0', target_port: 19132 });
    expect(result.changes).toBe(0);
  });
});

// ─── deleteServer ─────────────────────────────────────────────────────────────

describe('deleteServer', () => {
  test('elimina el servidor y ya no aparece en getAllServers', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Para Borrar', target_ip: '6.6.6.6', target_port: 19132 });
    db.deleteServer(lastInsertRowid);
    expect(db.getServerById(lastInsertRowid)).toBeUndefined();
  });

  test('devuelve changes=1 al eliminar un registro existente', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Tmp', target_ip: '7.7.7.7', target_port: 19132 });
    const result = db.deleteServer(lastInsertRowid);
    expect(result.changes).toBe(1);
  });

  test('devuelve changes=0 si el ID no existe', () => {
    const result = db.deleteServer(99999);
    expect(result.changes).toBe(0);
  });
});

// ─── updateServerStatus ───────────────────────────────────────────────────────

describe('updateServerStatus', () => {
  test('actualiza online_status y players_online correctamente', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Status Test', target_ip: '8.8.8.8', target_port: 19132 });
    db.updateServerStatus(lastInsertRowid, 1, 42);

    const server = db.getServerById(lastInsertRowid);
    expect(server.online_status).toBe(1);
    expect(server.players_online).toBe(42);
  });

  test('puede marcar un servidor como offline (status=0)', () => {
    const { lastInsertRowid } = db.addServer({ name: 'Offline', target_ip: '9.9.9.8', target_port: 19132 });
    db.updateServerStatus(lastInsertRowid, 1, 10);
    db.updateServerStatus(lastInsertRowid, 0, 0);

    const server = db.getServerById(lastInsertRowid);
    expect(server.online_status).toBe(0);
    expect(server.players_online).toBe(0);
  });
});
