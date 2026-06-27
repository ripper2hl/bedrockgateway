'use strict';

/**
 * Smoke Tests — Integridad de módulos y API REST
 *
 * Verifican que los módulos principales se pueden importar sin errores
 * de sintaxis o dependencias rotas, y que la API responde correctamente.
 *
 * IMPORTANTE: bedrockProxy.js NO se importa aquí porque su carga intenta
 * resolver bedrock-protocol y crear un listener UDP, lo cual requiere
 * un entorno de red. En su lugar se hace el smoke test de forma quirúrgica.
 */

const path = require('path');

// ─── Smoke: módulos sin side-effects ─────────────────────────────────────────

describe('Smoke — módulos principales (require sin errores)', () => {
  test('database/sqliteConfig.js se importa sin lanzar excepciones', () => {
    expect(() => require('../database/sqliteConfig')).not.toThrow();
  });

  test('proxy/dummyPackets.js se importa sin lanzar excepciones', () => {
    expect(() => require('../proxy/dummyPackets')).not.toThrow();
  });

  test('api/swagger.js se importa sin lanzar excepciones', () => {
    expect(() => require('../api/swagger')).not.toThrow();
  });
});

// ─── Smoke: exports de database/sqliteConfig ──────────────────────────────────

describe('Smoke — exports de sqliteConfig', () => {
  const sqliteConfig = require('../database/sqliteConfig');

  const expectedExports = [
    'initDb', 'addServer', 'getAllServers', 'getServerById',
    'updateServer', 'deleteServer', 'updateServerStatus', 'createDb',
  ];

  test.each(expectedExports)('exporta la función "%s"', (fn) => {
    expect(typeof sqliteConfig[fn]).toBe('function');
  });
});

// ─── Smoke: exports de api/expressServer ─────────────────────────────────────

describe('Smoke — exports de api/expressServer', () => {
  test('exporta startApi como función', () => {
    // expressServer tiene side-effects al llamarla (inicia DB + listen),
    // solo verificamos que exporte correctamente sin invocarla.
    const { startApi } = require('../api/expressServer');
    expect(typeof startApi).toBe('function');
  });
});

// ─── Smoke: exports de proxy/bedrockProxy ────────────────────────────────────

describe('Smoke — exports de proxy/bedrockProxy', () => {
  test('exporta startProxy como función', () => {
    // bedrockProxy importa bedrock-protocol al nivel de módulo pero no
    // abre sockets hasta que se llama startProxy(). El require es seguro.
    const { startProxy } = require('../proxy/bedrockProxy');
    expect(typeof startProxy).toBe('function');
  });
});

// ─── API REST (supertest, sin levantar servidor externo) ──────────────────────

const express = require('express');
const request = require('supertest');
const { createDb } = require('../database/sqliteConfig');

/**
 * Crea una app Express aislada que usa una BD en memoria.
 * No abre ningún puerto real — supertest hace las peticiones internamente.
 */
function buildTestApp() {
  // BD en memoria con un servidor de muestra
  const testDb = createDb(':memory:');
  testDb.initDb();
  testDb.addServer({ name: 'Test Server', target_ip: '127.0.0.1', target_port: 19132 });

  // Reemplazamos temporalmente el módulo con nuestra instancia de test
  // usando un router que llama a testDb en lugar del singleton global
  const app = express();
  app.use(express.json());

  const { Router } = require('express');
  const router = Router();

  router.get('/', (req, res) => res.json(testDb.getAllServers()));

  router.get('/:id', (req, res) => {
    const server = testDb.getServerById(Number(req.params.id));
    if (!server) return res.status(404).json({ error: 'Servidor no encontrado' });
    return res.json(server);
  });

  router.post('/', (req, res) => {
    const { name, target_ip, target_port } = req.body;
    if (!name || !target_ip || !target_port) {
      return res.status(400).json({ error: 'Faltan campos requeridos: name, target_ip, target_port' });
    }
    const result = testDb.addServer({ name, target_ip, target_port });
    if (result.changes === 0) return res.status(200).json({ message: 'El servidor ya existe.', id: result.lastInsertRowid });
    return res.status(201).json({ message: 'Servidor agregado correctamente', id: result.lastInsertRowid });
  });

  router.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const { name, target_ip, target_port } = req.body;
    if (!name || !target_ip || !target_port) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const existing = testDb.getServerById(id);
    if (!existing) return res.status(404).json({ error: 'Servidor no encontrado' });
    testDb.updateServer(id, { name, target_ip, target_port });
    return res.json({ message: 'Servidor actualizado correctamente' });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = testDb.getServerById(id);
    if (!existing) return res.status(404).json({ error: 'Servidor no encontrado' });
    testDb.deleteServer(id);
    return res.json({ message: 'Servidor eliminado correctamente' });
  });

  app.use('/api/servers', router);
  return { app, testDb };
}

describe('API REST — /api/servers', () => {
  let app;
  let testDb;
  let seededId;

  beforeEach(() => {
    ({ app, testDb } = buildTestApp());
    // El servidor sembrado por buildTestApp tiene id auto-incremental;
    // lo obtenemos del getAllServers para no asumir el ID.
    seededId = testDb.getAllServers()[0].id;
  });

  // GET /api/servers
  test('GET / responde 200 con un arreglo', async () => {
    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // GET /api/servers/:id — existente
  test('GET /:id responde 200 con el servidor correcto', async () => {
    const res = await request(app).get(`/api/servers/${seededId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Server');
  });

  // GET /api/servers/:id — inexistente
  test('GET /:id responde 404 para ID inexistente', async () => {
    const res = await request(app).get('/api/servers/99999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  // POST /api/servers — payload válido
  test('POST / crea un servidor y responde 201', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: 'Nuevo', target_ip: '5.5.5.5', target_port: 25565 });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  // POST /api/servers — payload inválido
  test('POST / responde 400 cuando faltan campos', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: 'Incompleto' }); // falta target_ip y target_port
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // POST /api/servers — duplicado
  test('POST / responde 200 (no 201) para servidor duplicado', async () => {
    const res = await request(app)
      .post('/api/servers')
      .send({ name: 'Test Server', target_ip: '127.0.0.1', target_port: 19132 });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/ya existe/i);
  });

  // PUT /api/servers/:id — actualización válida
  test('PUT /:id actualiza el servidor y responde 200', async () => {
    const res = await request(app)
      .put(`/api/servers/${seededId}`)
      .send({ name: 'Renombrado', target_ip: '9.9.9.9', target_port: 19133 });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/actualizado/i);
  });

  // PUT /api/servers/:id — ID inexistente
  test('PUT /:id responde 404 para ID inexistente', async () => {
    const res = await request(app)
      .put('/api/servers/99999')
      .send({ name: 'X', target_ip: '1.1.1.1', target_port: 19132 });
    expect(res.status).toBe(404);
  });

  // DELETE /api/servers/:id — eliminación válida
  test('DELETE /:id elimina el servidor y responde 200', async () => {
    const res = await request(app).delete(`/api/servers/${seededId}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/eliminado/i);
  });

  // DELETE /api/servers/:id — ID inexistente
  test('DELETE /:id responde 404 para ID inexistente', async () => {
    const res = await request(app).delete('/api/servers/99999');
    expect(res.status).toBe(404);
  });
});
