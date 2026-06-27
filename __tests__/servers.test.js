'use strict';

/**
 * Pruebas de integración — api/routes/servers.js
 *
 * Usa jest.mock para reemplazar sqliteConfig con funciones jest.fn(),
 * luego monta el router real en una app Express minimal y lo testea
 * con supertest. Esto cubre TODA la lógica interna del router (validaciones,
 * códigos de estado, manejo de errores) sin tocar la BD real.
 */

const express = require('express');
const request = require('supertest');

// ─── MOCK de la capa de datos ─────────────────────────────────────────────────
// Jest resuelve el path al mismo archivo absoluto que require('../../database/sqliteConfig')
// dentro de api/routes/servers.js, así que el mock se aplica correctamente.
jest.mock('../database/sqliteConfig', () => ({
  getAllServers:     jest.fn(),
  getServerById:    jest.fn(),
  addServer:        jest.fn(),
  updateServer:     jest.fn(),
  deleteServer:     jest.fn(),
  updateServerStatus: jest.fn(),
  createDb:         jest.fn(),
  initDb:           jest.fn(),
}));

const db = require('../database/sqliteConfig');
const serversRouter = require('../api/routes/servers');

// ─── App de prueba ────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/servers', serversRouter);
  return app;
}

let app;
beforeAll(() => { app = buildApp(); });
beforeEach(() => { jest.clearAllMocks(); });

// ─── GET /api/servers ─────────────────────────────────────────────────────────

describe('GET /api/servers', () => {
  test('200 — devuelve lista de servidores', async () => {
    const mock = [{ id: 1, name: 'S1', target_ip: '1.1.1.1', target_port: 19132 }];
    db.getAllServers.mockReturnValue(mock);

    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mock);
    expect(db.getAllServers).toHaveBeenCalledTimes(1);
  });

  test('200 — lista vacía', async () => {
    db.getAllServers.mockReturnValue([]);
    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('500 — error interno de DB', async () => {
    db.getAllServers.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── GET /api/servers/:id ─────────────────────────────────────────────────────

describe('GET /api/servers/:id', () => {
  test('200 — devuelve el servidor encontrado', async () => {
    const mock = { id: 1, name: 'S1', target_ip: '1.1.1.1', target_port: 19132 };
    db.getServerById.mockReturnValue(mock);

    const res = await request(app).get('/api/servers/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mock);
  });

  test('404 — servidor no encontrado', async () => {
    db.getServerById.mockReturnValue(undefined);
    const res = await request(app).get('/api/servers/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('500 — error interno de DB', async () => {
    db.getServerById.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).get('/api/servers/1');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/servers ────────────────────────────────────────────────────────

describe('POST /api/servers', () => {
  const validBody = { name: 'Nuevo', target_ip: '2.2.2.2', target_port: 25565 };

  test('201 — servidor creado correctamente', async () => {
    db.addServer.mockReturnValue({ changes: 1, lastInsertRowid: 42 });
    const res = await request(app).post('/api/servers').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
  });

  test('200 — servidor ya existe (duplicado)', async () => {
    db.addServer.mockReturnValue({ changes: 0, lastInsertRowid: 7 });
    const res = await request(app).post('/api/servers').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/ya existe/i);
  });

  test('400 — falta el campo name', async () => {
    const res = await request(app).post('/api/servers')
      .send({ target_ip: '2.2.2.2', target_port: 25565 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 — falta el campo target_ip', async () => {
    const res = await request(app).post('/api/servers')
      .send({ name: 'X', target_port: 25565 });
    expect(res.status).toBe(400);
  });

  test('400 — falta el campo target_port', async () => {
    const res = await request(app).post('/api/servers')
      .send({ name: 'X', target_ip: '2.2.2.2' });
    expect(res.status).toBe(400);
  });

  test('500 — error interno de DB', async () => {
    db.addServer.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).post('/api/servers').send(validBody);
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── PUT /api/servers/:id ─────────────────────────────────────────────────────

describe('PUT /api/servers/:id', () => {
  const validBody = { name: 'Edit', target_ip: '3.3.3.3', target_port: 19133 };

  test('200 — actualización exitosa', async () => {
    db.getServerById.mockReturnValue({ id: 1, name: 'Orig', target_ip: '1.1.1.1', target_port: 19132 });
    db.updateServer.mockReturnValue({ changes: 1 });
    const res = await request(app).put('/api/servers/1').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/actualizado/i);
  });

  test('404 — ID no existe', async () => {
    db.getServerById.mockReturnValue(undefined);
    const res = await request(app).put('/api/servers/999').send(validBody);
    expect(res.status).toBe(404);
  });

  test('400 — body incompleto', async () => {
    const res = await request(app).put('/api/servers/1').send({ name: 'Solo nombre' });
    expect(res.status).toBe(400);
  });

  test('500 — error interno de DB', async () => {
    db.getServerById.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).put('/api/servers/1').send(validBody);
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── DELETE /api/servers/:id ──────────────────────────────────────────────────

describe('DELETE /api/servers/:id', () => {
  test('200 — eliminación exitosa', async () => {
    db.getServerById.mockReturnValue({ id: 1, name: 'Borrar', target_ip: '4.4.4.4', target_port: 19132 });
    db.deleteServer.mockReturnValue({ changes: 1 });
    const res = await request(app).delete('/api/servers/1');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/eliminado/i);
  });

  test('404 — ID no existe', async () => {
    db.getServerById.mockReturnValue(undefined);
    const res = await request(app).delete('/api/servers/999');
    expect(res.status).toBe(404);
  });

  test('500 — error interno de DB', async () => {
    db.getServerById.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).delete('/api/servers/1');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── POST /api/servers/import ─────────────────────────────────────────────────

describe('POST /api/servers/import', () => {
  test('200 — importa servidores desde arreglo inline', async () => {
    db.addServer
      .mockReturnValueOnce({ changes: 1 })
      .mockReturnValueOnce({ changes: 1 });

    const res = await request(app).post('/api/servers/import').send({
      servers: [
        { name: 'A', target_ip: '10.0.0.1', target_port: 19132 },
        { name: 'B', target_ip: '10.0.0.2', target_port: 19132 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/2/);
  });

  test('400 — body sin url, servers ni file', async () => {
    const res = await request(app).post('/api/servers/import').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 — field servers no es un arreglo válido', async () => {
    const res = await request(app).post('/api/servers/import').send({ servers: 'no-array' });
    expect(res.status).toBe(400);
  });

  test('500 — error durante importación', async () => {
    db.addServer.mockImplementation(() => { throw new Error('DB crash'); });
    const res = await request(app).post('/api/servers/import').send({
      servers: [{ name: 'X', target_ip: '5.5.5.5', target_port: 19132 }],
    });
    expect(res.status).toBe(500);
  });
});
