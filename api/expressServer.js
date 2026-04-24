const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const { initDb } = require('../database/sqliteConfig');
const swaggerSpec = require('./swagger');
const serversRouter = require('./routes/servers');

/**
 * Inicia el servidor API REST para administrar servidores personalizados.
 *
 * @param {number} port Puerto en el que escuchará la API.
 */
function startApi(port) {
  initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'BedrockGateway API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Rutas
  app.use('/api/servers', serversRouter);

  app.listen(port, () => {
    console.log(`[API] ✅ REST API escuchando en el puerto ${port}`);
    console.log(`[API] 📚 Swagger UI disponible en http://localhost:${port}/api-docs`);
  });
}

module.exports = {
  startApi,
};
