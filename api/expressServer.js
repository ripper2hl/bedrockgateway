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

  // Nuevo endpoint para importar servidores desde una URL JSON externa
  app.post('/api/servers/import', async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Falta proveer una url en el body (JSON)' });
    }

    try {
      // Intentamos descargar el JSON desde la URL provista
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} al descargar el archivo`);
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'El archivo JSON descargado no es un arreglo válido' });
      }

      let added = 0;
      for (const srv of data) {
        // Soporte tanto para llaves de bedrockconnect como llaves de nuestro propio backend
        const ip = srv.target_ip || srv.address || srv.ip;
        const port = Number(srv.target_port || srv.port) || 19132;
        const name = srv.name || 'Servidor Importado';

        if (ip && port) {
          const result = addServer({ name, target_ip: ip, target_port: port });
          if (result.changes > 0) added++;
        }
      }

      return res.status(200).json({ message: `Importación exitosa. Se añadieron ${added} servidores nuevos.` });
    } catch (error) {
      console.error('[API] Error importando servidores desde URL:', error);
      return res.status(500).json({ error: 'Fallo al procesar la lista externa. Revisa la consola para más detalles.' });
    }
  });

  app.listen(port, () => {
    console.log(`API REST escuchando en el puerto ${port}`);
  });
}

module.exports = {
  startApi,
};
