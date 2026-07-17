'use strict';

const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

// Misma imagen que usa server-perales. :latest asegura la versión más reciente del BDS.
const BEDROCK_IMAGE = 'itzg/minecraft-bedrock-server:latest';
const PORT_RANGE_START = 20000;
const PORT_RANGE_END = 20009;
const MAX_SERVERS = PORT_RANGE_END - PORT_RANGE_START + 1; // 10
const CONTAINER_START_TIMEOUT_MS = 240_000; // 4 minutos — primera vez descarga el BDS (~60s) + arranque
const CONTAINER_POLL_INTERVAL_MS = 3_000;  // Revisa logs cada 3s
const CONTAINER_READY_SIGNAL = 'Server started.';

/**
 * Ruta de datos en el HOST (no dentro del contenedor).
 * Docker Daemon interpreta los Binds como rutas del host, no del contenedor.
 * Por eso necesitamos esta variable aunque el código corra dentro de Docker.
 *
 * Dentro del contenedor del Gateway, la misma carpeta está montada en /app/data.
 */
const HOST_DATA_PATH = process.env.HOST_DATA_PATH || '/var/lib/bedrockgateway';

/**
 * Ruta de datos vista desde DENTRO del contenedor del Gateway.
 * Se usa para mkdir y operaciones de archivo locales.
 */
const CONTAINER_DATA_PATH = process.env.DATA_PATH || '/app/data';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Convierte un nombre libre en un identificador válido para carpeta/directorio.
 * Ej: "Mi Gran Aventura!" → "mi-gran-aventura"
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina acentos
    .replace(/[^a-z0-9]+/g, '-')    // caracteres inválidos → guión
    .replace(/^-+|-+$/g, '')        // quita guiones al inicio/fin
    .slice(0, 30)                   // máximo 30 caracteres
    || 'mundo';                     // fallback si queda vacío
}

/**
 * Parsea el buffer de logs de Docker (formato multiplexado) a string legible.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
function parseDockerLogs(buffer) {
  if (!Buffer.isBuffer(buffer)) return String(buffer);

  let result = '';
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    // Cada frame: [stream(1), padding(3), size(4)] + datos
    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size <= buffer.length) {
      result += buffer.slice(offset, offset + size).toString('utf-8');
    }
    offset += size;
  }

  return result;
}

// ─── GESTIÓN DE PUERTOS ──────────────────────────────────────────────────────

/**
 * Busca el primer puerto UDP libre en el rango 20000–20009
 * consultando la tabla local_servers de SQLite.
 *
 * @param {Function} getAllLocalServers - función del módulo sqliteConfig
 * @returns {number|null} Puerto disponible, o null si todos están ocupados
 */
function findAvailablePort(getAllLocalServers) {
  // Reservamos puertos de TODOS los servidores registrados (incluidos 'detenido').
  // Un servidor detenido conserva su slot: se puede reiniciar en el mismo puerto.
  // Los records de creaciones fallidas son ELIMINADOS (no marcados 'detenido'),
  // por eso no bloquean puertos.
  const usedPorts = new Set(getAllLocalServers().map(s => s.puerto));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) return port;
  }

  return null;
}

// ─── APLICACIÓN DE ADDONS ─────────────────────────────────────────────────────

/**
 * Copia los resource packs globales al nuevo servidor y crea world_resource_packs.json.
 *
 * El BDS carga los packs de /data/resource_packs/ y los activa para un mundo
 * a través de worlds/{LEVEL_NAME}/world_resource_packs.json.
 *
 * @param {string} containerServerPath - Ruta al servidor DENTRO del Gateway (/app/data/worlds/xxx)
 */
function applyAddonsToServer(containerServerPath) {
  const addonsDir = path.join(CONTAINER_DATA_PATH, 'addons');

  if (!fs.existsSync(addonsDir)) return;

  const addonNames = fs.readdirSync(addonsDir).filter(name => {
    try { return fs.statSync(path.join(addonsDir, name)).isDirectory(); } catch (_) { return false; }
  });

  if (addonNames.length === 0) {
    console.log('[DOCKER] ℹ️  No hay addons globales que aplicar.');
    return;
  }

  const resourcePacksDir = path.join(containerServerPath, 'resource_packs');
  const worldDir         = path.join(containerServerPath, 'worlds', 'world');

  fs.mkdirSync(resourcePacksDir, { recursive: true });
  fs.mkdirSync(worldDir,         { recursive: true });
  try { fs.chownSync(worldDir, 1000, 1000); } catch (_) {}

  const packRefs = [];

  for (const addonName of addonNames) {
    const src = path.join(addonsDir, addonName);
    const dst = path.join(resourcePacksDir, addonName);

    try {
      fs.cpSync(src, dst, { recursive: true });

      // Leer manifest para obtener UUID y versión
      const manifestPath = path.join(src, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const uuid = manifest.header?.uuid;
      let version = manifest.header?.version;

      if (!uuid) continue;

      // Normalizar versión a array [major, minor, patch]
      if (typeof version === 'string') {
        version = version.split('.').map(Number);
      }

      packRefs.push({ pack_id: uuid, version });
      console.log(`[DOCKER] 🎨 Addon copiado: ${addonName} (${uuid})`);
    } catch (err) {
      console.warn(`[DOCKER] ⚠️ No se pudo copiar addon "${addonName}": ${err.message}`);
    }
  }

  if (packRefs.length > 0) {
    fs.writeFileSync(
      path.join(worldDir, 'world_resource_packs.json'),
      JSON.stringify(packRefs, null, 2)
    );
    console.log(`[DOCKER] ✅ world_resource_packs.json creado con ${packRefs.length} pack(s).`);
  }
}

// ─── ORQUESTACIÓN DE CONTENEDORES ────────────────────────────────────────────

/**
 * Crea y arranca un nuevo contenedor de Minecraft Bedrock Server.
 *
 * Los volúmenes se montan usando rutas del HOST (HOST_DATA_PATH) porque
 * es el Docker Daemon del host quien ejecuta el bind, no el contenedor Gateway.
 *
 * @param {{ name: string, gamemode: 'survival'|'creative', puerto: number, worldFolderName: string }} opts
 * @returns {Promise<string>} ID del contenedor creado
 */
async function createBedrockServer({ name, gamemode, puerto, worldFolderName }) {
  // ── Rutas HOST (usadas en Binds — el Docker Daemon del host las interpreta) ──
  // El itzg image necesita montar /data COMPLETO, no solo /data/worlds.
  // Escribe: server.properties, allowlist.json, perms, binarios, etc. en /data.
  // Por eso montamos el folder del servidor → /data.
  const hostServerPath = path.join(HOST_DATA_PATH, 'worlds', worldFolderName);
  const hostAddonsPath = path.join(HOST_DATA_PATH, 'addons');

  // ── Preparar carpetas desde dentro del Gateway (tiene acceso de escritura) ──
  const containerServerPath = path.join(CONTAINER_DATA_PATH, 'worlds', worldFolderName);
  fs.mkdirSync(containerServerPath, { recursive: true });
  // itzg verifica que uid=1000 pueda escribir en /data antes de hacer chown interno.
  // Si la carpeta es root:root 755 (creada por Gateway), uid=1000 no puede y aborta.
  try { fs.chownSync(containerServerPath, 1000, 1000); } catch (_) {}
  fs.mkdirSync(path.join(CONTAINER_DATA_PATH, 'addons'), { recursive: true });

  // ── Aplicar addons globales al nuevo servidor ──────────────────────────────
  applyAddonsToServer(containerServerPath);

  const containerName = `bedrock-${worldFolderName}-${puerto}`;

  // ── Limpiar contenedor previo con el mismo nombre (evita 409 Conflict en retries) ──
  try {
    const prev = docker.getContainer(containerName);
    await prev.remove({ force: true });
    console.log(`[DOCKER] 🧹 Contenedor anterior "${containerName}" eliminado antes de recrear.`);
  } catch (_) { /* No existía, todo bien */ }

  console.log(`[DOCKER] Creando contenedor Bedrock → puerto ${puerto}, mundo: ${worldFolderName}`);

  const container = await docker.createContainer({
    Image: BEDROCK_IMAGE,
    name: containerName,
    Env: [
      'EULA=TRUE',
      'VERSION=LATEST',
      `GAMEMODE=${gamemode}`,
      `SERVER_NAME=${name}`,
      'LEVEL_NAME=world',
      'ONLINE_MODE=false',
      'ALLOW_LIST=false',
      'DIFFICULTY=normal',
      'ALLOW_CHEATS=false',
      'UID=1000',
      'GID=1000',
    ],
    ExposedPorts: { '19132/udp': {} },
    HostConfig: {
      SecurityOpt: ['label=disable'], // Desactivar SELinux labeling (igual que el Gateway)
      Binds: [
        `${hostServerPath}:/data:z`,       // /data completo: binarios + mundo + config
        `${hostAddonsPath}:/data/addons:z`, // addons globales comparten este overlay
      ],
      PortBindings: {
        '19132/udp': [{ HostPort: String(puerto) }],
      },
      AutoRemove: false,
      RestartPolicy: { Name: 'no' },
    },
  });

  try {
    await container.start();
  } catch (startErr) {
    console.error(`[DOCKER] ❌ start() falló (${startErr.message}). Eliminando ${container.id.slice(0, 12)}...`);
    await container.remove({ force: true }).catch(() => {});
    throw startErr;
  }

  console.log(`[DOCKER] ▶️  Contenedor iniciado: ${container.id.slice(0, 12)}`);
  return container.id;
}

/**
 * Espera (de forma no bloqueante) a que el servidor Bedrock esté listo.
 * Hace polling de los logs del contenedor buscando la señal "Server started."
 *
 * @param {string} containerId
 * @returns {Promise<void>}
 */
function waitForContainerReady(containerId) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const container = docker.getContainer(containerId);

    const poll = async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed > CONTAINER_START_TIMEOUT_MS) {
        return reject(new Error(
          `Timeout: el servidor (${containerId.slice(0, 12)}) no arrancó en ${CONTAINER_START_TIMEOUT_MS / 1000}s`
        ));
      }

      try {
        const logBuffer = await container.logs({
          stdout: true,
          stderr: true,
          tail: 80,
          follow: false,
        });

        const logText = parseDockerLogs(logBuffer);

        if (logText.includes(CONTAINER_READY_SIGNAL)) {
          console.log(`[DOCKER] ✅ Servidor listo (${containerId.slice(0, 12)}) en ${Math.round(elapsed / 1000)}s`);
          return resolve();
        }
      } catch (err) {
        // El contenedor puede no tener logs todavía, ignoramos y reintentamos
      }

      setTimeout(poll, CONTAINER_POLL_INTERVAL_MS);
    };

    poll();
  });
}

/**
 * Detiene un contenedor (el mundo persiste en disco).
 *
 * @param {string} containerId
 * @returns {Promise<void>}
 */
async function stopBedrockServer(containerId) {
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 15 }); // 15s de gracia para que el BDS guarde
    console.log(`[DOCKER] ⏹  Contenedor detenido: ${containerId.slice(0, 12)}`);
  } catch (err) {
    if (err.statusCode !== 304) throw err; // 304 = already stopped, ignorar
  }
}

/**
 * Detiene y elimina un contenedor. El mundo sigue en disco (no se borra).
 *
 * @param {string} containerId
 * @returns {Promise<void>}
 */
async function removeBedrockServer(containerId) {
  await stopBedrockServer(containerId);
  const container = docker.getContainer(containerId);
  await container.remove({ force: false });
  console.log(`[DOCKER] 🗑️  Contenedor eliminado: ${containerId.slice(0, 12)}`);
}

/**
 * Reinicia un contenedor existente.
 *
 * @param {string} containerId
 * @returns {Promise<void>}
 */
async function restartBedrockServer(containerId) {
  const container = docker.getContainer(containerId);
  await container.restart({ t: 10 });
  console.log(`[DOCKER] 🔄 Contenedor reiniciado: ${containerId.slice(0, 12)}`);
}

module.exports = {
  sanitizeName,
  findAvailablePort,
  createBedrockServer,
  waitForContainerReady,
  stopBedrockServer,
  removeBedrockServer,
  restartBedrockServer,
  MAX_SERVERS,
  HOST_DATA_PATH,
  CONTAINER_DATA_PATH,
};
