const express = require('express');
const { initDb, addServer, getAllServers } = require('../database/sqliteConfig');

/**
 * Inicia el servidor API REST para administrar servidores personalizados.
 *
 * @param {number} port Puerto en el que escuchará la API.
 */
function startApi(port) {
  initDb();

  const app = express();
  app.use(express.json());

  app.get('/api/servers', (req, res) => {
    try {
      const servers = getAllServers();
      return res.status(200).json(servers);
    } catch (error) {
      console.error('[API] Error al obtener servidores:', error);
      return res.status(500).json({ error: 'Error interno al obtener servidores' });
    }
  });

  app.post('/api/servers', (req, res) => {
    const { name, target_ip, target_port } = req.body;

    if (!name || !target_ip || !target_port) {
      return res.status(400).json({
        error: 'Faltan campos requeridos: name, target_ip, target_port',
      });
    }

    try {
      addServer({ name, target_ip, target_port });
      return res.status(201).json({ message: 'Servidor personalizado agregado correctamente' });
    } catch (error) {
      console.error('[API] Error al agregar servidor:', error);
      return res.status(500).json({ error: 'Error interno al agregar el servidor' });
    }
  });

  app.listen(port, () => {
    console.log(`API REST escuchando en el puerto ${port}`);
  });
}

module.exports = {
  startApi,
};
