'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const CONTAINER_DATA_PATH = process.env.DATA_PATH || '/app/data';
const WORLDS_DIR = path.join(CONTAINER_DATA_PATH, 'worlds');
const BACKUPS_DIR = path.join(CONTAINER_DATA_PATH, 'backups');
const ADDONS_DIR = path.join(CONTAINER_DATA_PATH, 'addons');

const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // cada 6 horas
const MAX_BACKUPS_PER_WORLD = 5;                 // máximo de backups por mundo

// ─── UTILIDADES ──────────────────────────────────────────────────────────────

/**
 * Asegura que las carpetas principales de datos existan al iniciar.
 */
function ensureDataDirectories() {
  [WORLDS_DIR, BACKUPS_DIR, ADDONS_DIR].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
  console.log('[BACKUP] 📁 Carpetas de datos verificadas: worlds/, backups/, addons/');
}

/**
 * Genera un timestamp en formato seguro para nombres de archivo.
 * Ej: "2026-07-14T21-00-00"
 *
 * @returns {string}
 */
function fileTimestamp() {
  return new Date().toISOString().replace(/:/g, '-').slice(0, 19);
}

// ─── BACKUPS ─────────────────────────────────────────────────────────────────

/**
 * Elimina los backups más antiguos de un mundo, manteniendo solo los últimos N.
 *
 * @param {string} worldFolderName - Nombre de la carpeta del mundo
 */
function pruneOldBackups(worldFolderName) {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith(`${worldFolderName}_`) && f.endsWith('.tar.gz'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time); // más recientes primero

    const toDelete = files.slice(MAX_BACKUPS_PER_WORLD);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(BACKUPS_DIR, file.name));
      console.log(`[BACKUP] 🗑️  Backup antiguo eliminado: ${file.name}`);
    }
  } catch (err) {
    console.error('[BACKUP] Error podando backups antiguos:', err.message);
  }
}

/**
 * Crea un backup comprimido (.tar.gz) del mundo especificado.
 *
 * @param {string} worldFolderName - Nombre de la carpeta dentro de worlds/
 * @returns {Promise<string>} Ruta del archivo de backup creado
 */
function backupWorld(worldFolderName) {
  return new Promise((resolve, reject) => {
    const worldPath = path.join(WORLDS_DIR, worldFolderName);

    if (!fs.existsSync(worldPath)) {
      return reject(new Error(`Carpeta de mundo no encontrada: ${worldPath}`));
    }

    const timestamp = fileTimestamp();
    const backupFileName = `${worldFolderName}_${timestamp}.tar.gz`;
    const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

    // tar -czf <destino> -C <directorio_padre> <carpeta>
    execFile('tar', ['-czf', backupFilePath, '-C', WORLDS_DIR, worldFolderName], (err) => {
      if (err) {
        console.error(`[BACKUP] ❌ Error en backup de "${worldFolderName}":`, err.message);
        return reject(err);
      }

      const sizeMB = (fs.statSync(backupFilePath).size / 1024 / 1024).toFixed(2);
      console.log(`[BACKUP] ✅ "${worldFolderName}" → ${backupFileName} (${sizeMB} MB)`);

      // Limpiar backups sobrantes después de crear el nuevo
      pruneOldBackups(worldFolderName);

      resolve(backupFilePath);
    });
  });
}

// ─── SCHEDULER ───────────────────────────────────────────────────────────────

/**
 * Inicia el scheduler de backups automáticos.
 * Se ejecuta inmediatamente al iniciar y luego cada BACKUP_INTERVAL_MS.
 *
 * @param {Function} getAllLocalServers - función de sqliteConfig para obtener servidores locales
 */
function startBackupScheduler(getAllLocalServers) {
  ensureDataDirectories();

  const runBackups = async () => {
    const servers = getAllLocalServers().filter(s => s.estado === 'activo');

    if (servers.length === 0) {
      console.log('[BACKUP] ⏭️  Sin servidores activos que respaldar.');
      return;
    }

    console.log(`[BACKUP] ⏰ Iniciando backup de ${servers.length} servidor(es)...`);

    for (const server of servers) {
      try {
        await backupWorld(server.world_folder);
      } catch (err) {
        console.error(`[BACKUP] ❌ Fallo al respaldar "${server.name}":`, err.message);
      }
    }
  };

  // Primera ejecución al arrancar (con pequeño delay para no saturar el inicio)
  setTimeout(runBackups, 30_000);

  // Ejecuciones periódicas cada 6h
  setInterval(runBackups, BACKUP_INTERVAL_MS);

  console.log(`[BACKUP] ⏰ Scheduler iniciado — respaldo automático cada ${BACKUP_INTERVAL_MS / 3600000}h`);
}

module.exports = {
  ensureDataDirectories,
  backupWorld,
  startBackupScheduler,
  WORLDS_DIR,
  BACKUPS_DIR,
  ADDONS_DIR,
};
