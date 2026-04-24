const { Router } = require('express');
const { getAllServers, getServerById, addServer, updateServer, deleteServer } = require('../../database/sqliteConfig');

const router = Router();

// GET /api/servers
router.get('/', (req, res) => {
  try {
    return res.status(200).json(getAllServers());
  } catch (error) {
    console.error('[API] Error al obtener servidores:', error);
    return res.status(500).json({ error: 'Error interno al obtener servidores' });
  }
});

// GET /api/servers/:id
router.get('/:id', (req, res) => {
  try {
    const server = getServerById(Number(req.params.id));
    if (!server) return res.status(404).json({ error: 'Servidor no encontrado' });
    return res.status(200).json(server);
  } catch (error) {
    console.error('[API] Error al obtener servidor:', error);
    return res.status(500).json({ error: 'Error interno al obtener el servidor' });
  }
});

// POST /api/servers
router.post('/', (req, res) => {
  const { name, target_ip, target_port } = req.body;

  if (!name || !target_ip || !target_port) {
    return res.status(400).json({ error: 'Faltan campos requeridos: name, target_ip, target_port' });
  }

  try {
    const result = addServer({ name, target_ip, target_port });
    if (result.changes === 0) {
      return res.status(200).json({ message: 'El servidor ya existe.', id: result.lastInsertRowid });
    }
    return res.status(201).json({ message: 'Servidor agregado correctamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('[API] Error al agregar servidor:', error);
    return res.status(500).json({ error: 'Error interno al agregar el servidor' });
  }
});

// PUT /api/servers/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, target_ip, target_port } = req.body;

  if (!name || !target_ip || !target_port) {
    return res.status(400).json({ error: 'Faltan campos requeridos: name, target_ip, target_port' });
  }

  try {
    const existing = getServerById(id);
    if (!existing) return res.status(404).json({ error: 'Servidor no encontrado' });

    updateServer(id, { name, target_ip, target_port });
    return res.status(200).json({ message: 'Servidor actualizado correctamente' });
  } catch (error) {
    console.error('[API] Error al actualizar servidor:', error);
    return res.status(500).json({ error: 'Error interno al actualizar el servidor' });
  }
});

// DELETE /api/servers/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);

  try {
    const existing = getServerById(id);
    if (!existing) return res.status(404).json({ error: 'Servidor no encontrado' });

    deleteServer(id);
    return res.status(200).json({ message: 'Servidor eliminado correctamente' });
  } catch (error) {
    console.error('[API] Error al eliminar servidor:', error);
    return res.status(500).json({ error: 'Error interno al eliminar el servidor' });
  }
});

// POST /api/servers/import
router.post('/import', async (req, res) => {
  const { url, servers, file } = req.body;

  if (!url && !servers && !file) {
    return res.status(400).json({ error: 'Falta proveer una "url", un arreglo "servers", o una ruta "file" en el body' });
  }

  try {
    let data = [];

    if (url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} al descargar el archivo`);
      data = await response.json();
    } else if (file) {
      const fs = require('fs');
      const path = require('path');
      const absolutePath = path.resolve(file);

      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: `No se encontró el archivo local en la ruta: ${absolutePath}` });
      }

      const fileContent = fs.readFileSync(absolutePath, 'utf8');
      data = JSON.parse(fileContent);
    } else if (servers) {
      data = servers;
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'La información proveída no es un arreglo válido de servidores' });
    }

    let added = 0;
    for (const srv of data) {
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
    console.error('[API] Error importando servidores:', error);
    return res.status(500).json({ error: 'Fallo al procesar la lista. Revisa la consola para más detalles.' });
  }
});

module.exports = router;
