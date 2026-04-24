/**
 * Especificación OpenAPI 3.0 completa para BedrockGateway.
 * Se define como objeto JS puro (sin JSDoc annotations dispersas).
 */
module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'BedrockGateway API',
    version: '1.0.0',
    description: 'API REST para administrar servidores de Minecraft Bedrock Edition en BedrockGateway.',
    license: {
      name: 'MIT',
      url: 'https://github.com/ripper2hl/bedrockgateway/blob/main/LICENSE',
    },
  },
  servers: [
    { url: '/', description: 'Servidor local' },
  ],

  tags: [
    { name: 'Servidores', description: 'CRUD de servidores Bedrock.' },
    { name: 'Importación', description: 'Importación masiva desde fuentes externas.' },
  ],

  paths: {
    '/api/servers': {
      get: {
        summary: 'Listar todos los servidores',
        description: 'Devuelve la lista completa de servidores registrados, incluyendo su estado online y cantidad de jugadores.',
        tags: ['Servidores'],
        responses: {
          200: {
            description: 'Lista de servidores.',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Server' } } } },
          },
          500: { description: 'Error interno del servidor.' },
        },
      },
      post: {
        summary: 'Agregar un servidor',
        description: 'Registra un nuevo servidor. Si ya existe uno con la misma IP y puerto, no se duplica.',
        tags: ['Servidores'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServerInput' } } },
        },
        responses: {
          201: { description: 'Servidor agregado correctamente.' },
          200: { description: 'El servidor ya existía (no se duplicó).' },
          400: { description: 'Faltan campos requeridos.' },
          500: { description: 'Error interno del servidor.' },
        },
      },
    },

    '/api/servers/{id}': {
      get: {
        summary: 'Obtener un servidor por ID',
        description: 'Devuelve los datos de un servidor específico.',
        tags: ['Servidores'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID del servidor.' }],
        responses: {
          200: {
            description: 'Datos del servidor.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Server' } } },
          },
          404: { description: 'Servidor no encontrado.' },
        },
      },
      put: {
        summary: 'Editar un servidor',
        description: 'Actualiza el nombre, IP y/o puerto de un servidor existente.',
        tags: ['Servidores'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID del servidor a editar.' }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ServerInput' } } },
        },
        responses: {
          200: { description: 'Servidor actualizado correctamente.' },
          400: { description: 'Faltan campos requeridos.' },
          404: { description: 'Servidor no encontrado.' },
          500: { description: 'Error interno del servidor.' },
        },
      },
      delete: {
        summary: 'Eliminar un servidor',
        description: 'Elimina un servidor de la base de datos de forma permanente.',
        tags: ['Servidores'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' }, description: 'ID del servidor a eliminar.' }],
        responses: {
          200: { description: 'Servidor eliminado correctamente.' },
          404: { description: 'Servidor no encontrado.' },
          500: { description: 'Error interno del servidor.' },
        },
      },
    },

    '/api/servers/import': {
      post: {
        summary: 'Importar servidores masivamente',
        description:
          'Importa una lista de servidores desde una de tres fuentes:\n' +
          '- **url**: URL a un archivo JSON remoto.\n' +
          '- **servers**: Arreglo JSON incluido directamente en el body.\n' +
          '- **file**: Ruta local a un archivo JSON en el servidor.\n\n' +
          'Cada elemento puede usar llaves estándar (`name`, `target_ip`, `target_port`) ' +
          'o llaves compatibles con BedrockConnect (`address`/`ip`, `port`).',
        tags: ['Importación'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportInput' } } },
        },
        responses: {
          200: {
            description: 'Importación exitosa.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string', example: 'Importación exitosa. Se añadieron 5 servidores nuevos.' } },
                },
              },
            },
          },
          400: { description: 'Falta proveer una fuente de datos.' },
          500: { description: 'Error al procesar la lista.' },
        },
      },
    },
  },

  components: {
    schemas: {
      Server: {
        type: 'object',
        properties: {
          id:             { type: 'integer', example: 1 },
          name:           { type: 'string',  example: 'The Hive' },
          target_ip:      { type: 'string',  example: 'geo.hivebedrock.network' },
          target_port:    { type: 'integer', example: 19132 },
          online_status:  { type: 'integer', example: 1, description: '1 = online, 0 = offline' },
          players_online: { type: 'integer', example: 42 },
        },
      },
      ServerInput: {
        type: 'object',
        required: ['name', 'target_ip', 'target_port'],
        properties: {
          name:        { type: 'string',  example: 'Mi Servidor' },
          target_ip:   { type: 'string',  example: '192.168.1.50' },
          target_port: { type: 'integer', example: 19132 },
        },
      },
      ImportInput: {
        type: 'object',
        properties: {
          url:     { type: 'string', example: 'https://example.com/servers.json', description: 'URL a un JSON remoto.' },
          servers: { type: 'array', items: { $ref: '#/components/schemas/ServerInput' }, description: 'Lista directa de servidores.' },
          file:    { type: 'string', example: '/ruta/a/servidores.json', description: 'Ruta local a un archivo JSON.' },
        },
      },
    },
  },
};
