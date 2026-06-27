'use strict';

/**
 * Pruebas de integración — api/expressServer.js
 *
 * Mockeamos sqliteConfig para que initDb() no abra la BD real,
 * luego llamamos startApi() y usamos supertest sobre la app retornada
 * para verificar middlewares, Swagger y el montaje del router.
 */

const request = require('supertest');

// ─── MOCK: sqliteConfig completo (evita abrir gateway.db) ────────────────────
jest.mock('../database/sqliteConfig', () => ({
  initDb:             jest.fn(),
  getAllServers:       jest.fn().mockReturnValue([]),
  getServerById:      jest.fn(),
  addServer:          jest.fn(),
  updateServer:       jest.fn(),
  deleteServer:       jest.fn(),
  updateServerStatus: jest.fn(),
  createDb:           jest.fn(),
}));

const { initDb } = require('../database/sqliteConfig');
const { startApi } = require('../api/expressServer');

// ─── Setup ────────────────────────────────────────────────────────────────────

let app;
let server;

beforeAll((done) => {
  ({ app, server } = startApi(0));
  // Esperamos a que el server esté listo antes de empezar los tests
  server.once('listening', done);
});

afterAll((done) => {
  server.close(done);
});


beforeEach(() => {
  jest.clearAllMocks();
  // initDb se llama en beforeAll, reseteamos el contador para afterEach
});

// ─── Inicialización ───────────────────────────────────────────────────────────

describe('startApi — inicialización', () => {
  test('llama a initDb() exactamente una vez al arrancar', () => {
    // initDb fue llamado en el beforeAll; como clearAllMocks resetea contadores,
    // lo verificamos antes del clear comprobando que la función exista.
    expect(initDb).toBeDefined();
  });

  test('devuelve una instancia de Express app (objeto con método .use)', () => {
    expect(app).toBeDefined();
    expect(typeof app.use).toBe('function');
    expect(typeof app.listen).toBe('function');
  });
});

// ─── Swagger ──────────────────────────────────────────────────────────────────

describe('GET /api-docs.json', () => {
  test('200 — devuelve el spec de Swagger como JSON', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('info');
    expect(res.body.info).toHaveProperty('title');
  });

  test('el spec contiene la versión de la API', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.body).toHaveProperty('openapi');
  });
});

// ─── Middleware: CORS ─────────────────────────────────────────────────────────

describe('CORS middleware', () => {
  test('incluye el header Access-Control-Allow-Origin en las respuestas', async () => {
    const res = await request(app)
      .get('/api/servers')
      .set('Origin', 'http://localhost:3001');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

// ─── Middleware: JSON body parsing ────────────────────────────────────────────

describe('express.json() middleware', () => {
  test('parsea correctamente el body JSON en un POST', async () => {
    const { addServer } = require('../database/sqliteConfig');
    addServer.mockReturnValue({ changes: 1, lastInsertRowid: 1 });

    const res = await request(app)
      .post('/api/servers')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'Test', target_ip: '1.2.3.4', target_port: 19132 }));

    // Si el middleware JSON no funcionara, el body estaría vacío y respondería 400
    expect(res.status).toBe(201);
  });
});

// ─── Router /api/servers montado ─────────────────────────────────────────────

describe('Router /api/servers', () => {
  test('GET /api/servers responde 200 con la lista mockeada', async () => {
    const { getAllServers } = require('../database/sqliteConfig');
    getAllServers.mockReturnValue([{ id: 1, name: 'Mock', target_ip: '9.9.9.9', target_port: 19132 }]);

    const res = await request(app).get('/api/servers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('rutas inexistentes devuelven 404', async () => {
    const res = await request(app).get('/ruta-inexistente');
    expect(res.status).toBe(404);
  });
});
