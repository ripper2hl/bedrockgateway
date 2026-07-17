# BedrockGateway

[![Docker Hub](https://img.shields.io/docker/v/jesusperales/bedrockgateway?logo=docker&label=Docker%20Hub&color=2496ED)](https://hub.docker.com/r/jesusperales/bedrockgateway)
[![Docker Pulls](https://img.shields.io/docker/pulls/jesusperales/bedrockgateway?logo=docker&color=2496ED)](https://hub.docker.com/r/jesusperales/bedrockgateway)
[![CI/CD](https://github.com/ripper2hl/bedrockgateway/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/ripper2hl/bedrockgateway/actions/workflows/docker-publish.yml)

BedrockGateway es un servidor proxy DNS + Minecraft Bedrock construido 100% en Node.js.
Actúa como una alternativa moderna y altamente optimizada a herramientas como BedrockConnect, permitiendo a los jugadores de consolas (Nintendo Switch, Xbox, PlayStation) conectarse a cualquier servidor externo (Custom Servers) saltándose las restricciones de Mojang.

## ✨ Características Principales

- **Intercepción DNS Automática:** Redirige servidores destacados como "The Hive" o "CubeCraft" hacia el proxy local.
- **Inyección de UI en Juego:** Crea un "Limbo Server" hiper-optimizado que engaña a la consola para inyectarle un formulario interactivo nativo (sin necesidad de librerías de generación de mundos pesadas).
- **Almacenamiento Local (SQLite):** Guarda tus servidores favoritos permanentemente.
- **Filtro Inteligente en Tiempo Real:** El proxy tiene una tarea en segundo plano que hace "Ping" cada 60 segundos a tus servidores. **El menú del juego ocultará automáticamente los servidores inactivos**, mostrando solo los que están listos para jugar.
- **🆕 Servidores Locales bajo Demanda:** Crea mundos de Bedrock propios directamente desde la UI del juego. El Gateway levanta un contenedor Docker dedicado por cada mundo y te transfiere automáticamente.
- **🆕 Backups Automáticos:** Los mundos locales se respaldan cada 6 horas en archivos `.tar.gz`. Se conservan los últimos 5 backups por mundo.
- **🆕 Soporte de Addons:** Coloca packs en la carpeta `addons/` y se aplican automáticamente a todos los mundos locales al arrancar.
- **API REST Integrada:** Agrega nuevos servidores masivamente usando llamadas HTTP (URLs, Listas Locales o Archivos JSON).

---

## 📋 Requisitos

- **Node.js 18+** (o Docker)
- La consola (Switch/Xbox/PS) debe estar en la **misma red local** que la máquina que ejecuta BedrockGateway.
- Permisos de **root/Administrador** para abrir el puerto DNS 53.
- **Docker instalado en el host** para usar la funcionalidad de Servidores Locales.

---

## 🚀 Uso Rápido (Local con Node.js)

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Inicia el servidor (requiere privilegios de root para el puerto DNS 53):
   ```bash
   sudo node index.js
   ```

El servidor detectará automáticamente tu IP local e iniciará los servicios.

### Configurar tu consola

1. En tu consola, ve a **Configuración de Red** → **Configuración DNS**.
2. Cambia el **DNS Primario** a la IP de tu computadora (la que el servidor imprime al iniciar).
3. Abre Minecraft y entra a un **Servidor Destacado** (ej. The Hive o CubeCraft).
4. En lugar de conectarte al servidor real, verás el menú de BedrockGateway.

---

## 🐳 Despliegue con Docker (Recomendado)

La forma más rápida de poner en marcha BedrockGateway es usando la imagen oficial. No necesitas compilar nada.

### Comando `docker run` completo

```bash
docker run -d \
  --name bedrockgateway \
  --restart unless-stopped \
  --security-opt label=disable \
  -e HOST_IP=$(hostname -I | awk '{print $1}') \
  -e HOST_DATA_PATH=/var/lib/bedrockgateway \
  -e DB_PATH=/app/data/gateway.db \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/bedrockgateway:/app/data:z \
  -p 53:53/udp \
  -p 19132:19132/udp \
  -p 3000:3000/tcp \
  ghcr.io/ripper2hl/bedrockgateway:latest
```

#### ¿Por qué cada opción?

| Flag | Para qué sirve |
|------|----------------|
| `--security-opt label=disable` | Deshabilita SELinux labeling. **Obligatorio** para acceder al Docker socket en sistemas con SELinux (RHEL, Fedora, openSUSE). |
| `-e HOST_IP` | IP que el DNS devuelve a las consolas. Auto-detectada si no se pasa. |
| `-e HOST_DATA_PATH` | **Ruta en el HOST** donde vivirán los mundos, backups y addons. Debe coincidir con el bind `-v`. Default: `/var/lib/bedrockgateway`. |
| `-e DB_PATH` | Ruta del `gateway.db` dentro del contenedor. Apunta al volumen de datos para que la BD persista. |
| `-v /var/run/docker.sock` | Permite al Gateway crear contenedores hijos de Bedrock. **Sin `:z`** — el socket de Docker no debe relabelarse. |
| `-v /var/lib/bedrockgateway:/app/data:z` | Persiste mundos, backups, addons y la BD. `:z` para SELinux. |
| ⚠️ **NO** `-p 20000-20009/udp` | Los puertos 20000–20009 los abren los **contenedores hijos** directamente en el host. Si el gateway los reserva, Docker reportará `"port already allocated"` al crear mundos. |

> **💡 Ruta de datos personalizada:** Si quieres guardar los datos en otra ubicación, cambia `/var/lib/bedrockgateway` en **ambos** lugares (el `-e` y el `-v`) por la ruta que prefieras, por ejemplo `/opt/mis-mundos`.

### Preparar las carpetas de datos

Crea las carpetas antes del primer arranque para que Docker no las cree como `root`:

```bash
sudo mkdir -p /var/lib/bedrockgateway/{worlds,backups,addons}
sudo chown -R $USER:$USER /var/lib/bedrockgateway
```

### ⚠️ Notas Importantes

- **Puerto 53 en Linux:** Si el contenedor no puede enlazarse al puerto 53, es probable que `systemd-resolved` ya lo esté ocupando. Puedes liberarlo con:
  ```bash
  sudo systemctl stop systemd-resolved
  sudo systemctl disable systemd-resolved
  ```
- **Permisos del socket de Docker:** El usuario que ejecuta el contenedor necesita acceso a `/var/run/docker.sock`. En la mayoría de distros, agregar el usuario al grupo `docker` es suficiente: `sudo usermod -aG docker $USER`.
- **Swagger UI:** Una vez levantado el contenedor, el panel de documentación interactiva de la API REST estará disponible en **http://localhost:3000/api-docs**.

---

## 🌍 Servidores Locales (Docker bajo demanda)

Esta funcionalidad permite crear mundos de Minecraft Bedrock propios directamente desde la consola, sin salir del juego.

### Cómo usarlo

1. Abre el menú de BedrockGateway en tu consola.
2. Ve a **Administrar Servidores → 🌍 Servidores Locales (Docker)**.
3. Elige **✨ Crear Nuevo Servidor**.
4. Ingresa el nombre del mundo y selecciona el modo de juego (Supervivencia / Creativo).
5. Aparecerá un aviso de "⏳ Creando Servidor...". Espera ~30 segundos.
6. Serás transferido automáticamente al nuevo mundo. ¡Sin desconectarte!

### Gestión de mundos existentes

Desde el menú **Servidores Locales** puedes:
- **▶ Conectar** — transferirte a un servidor ya activo.
- **⏹ Detener** — detiene el contenedor Docker (el mundo se conserva en disco).
- **🗑 Eliminar** — borra el contenedor. **El mundo en disco NO se elimina**, por si quieres recuperarlo en el futuro.

### Límites

- Máximo **10 servidores simultáneos** (puertos UDP 20000–20009, uno por servidor).
- Si todos los puertos están ocupados, el menú lo indicará y deberás detener alguno primero.

### Addons globales

Cualquier archivo `.mcpack` o `.mcaddon` que coloques en la carpeta `addons/` se aplica automáticamente a **todos** los mundos locales al momento en que su contenedor arranca.

```
/var/lib/bedrockgateway/
├── worlds/          # Datos de cada mundo (subcarpeta por servidor)
├── backups/         # Backups automáticos comprimidos (.tar.gz)
└── addons/          # Packs aplicados a todos los mundos al arrancar
```

### Backups automáticos

- Se ejecutan cada **6 horas** automáticamente en segundo plano.
- Se guardan como `{nombre-mundo}_{timestamp}.tar.gz` en la carpeta `backups/`.
- Se conservan los **últimos 5 backups** por mundo. Los más antiguos se eliminan automáticamente.
- El primer backup ocurre **30 segundos después** de arrancar el Gateway.

Para restaurar un mundo desde un backup:

```bash
# Detén el servidor del mundo primero (desde el juego o con docker stop)
cd /var/lib/bedrockgateway
tar -xzf backups/mi-mundo_2026-07-14T21-00-00.tar.gz -C worlds/
```

---

## ⚙️ Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `HOST_IP` | IP que el DNS devuelve a las consolas. Si no se define, se auto-detecta. | Auto-detectada |
| `HOST_DATA_PATH` | Ruta en el **host** donde están los mundos/backups/addons. Usada por el Docker Daemon al crear contenedores hijos. | `/var/lib/bedrockgateway` |
| `DATA_PATH` | Ruta **dentro del contenedor Gateway** donde están montados los datos. | `/app/data` |
| `API_PORT` | Puerto de la API REST de administración. | `3000` |
| `PROXY_PORT` | Puerto del proxy Bedrock (donde escucha las conexiones de las consolas). | `19132` |

---

## 🔌 API REST

### Listar servidores registrados

```bash
curl http://localhost:3000/api/servers
```

### Agregar un servidor manualmente

```bash
curl -X POST http://localhost:3000/api/servers \
     -H "Content-Type: application/json" \
     -d '{ "name": "Mi Servidor", "target_ip": "play.ejemplo.com", "target_port": 19132 }'
```

### Importación masiva

Si quieres nutrir tu base de datos de servidores rápidamente, el endpoint `/api/servers/import` soporta 3 modos:

**1. Desde un archivo JSON en tu máquina:**
```bash
curl -X POST http://localhost:3000/api/servers/import \
     -H "Content-Type: application/json" \
     -d '{"file": "./servidores.json"}'
```

**2. Desde una URL pública en internet:**
```bash
curl -X POST http://localhost:3000/api/servers/import \
     -H "Content-Type: application/json" \
     -d '{"url": "https://url-hacia-tu-archivo/servers.json"}'
```

**3. Enviando los datos en crudo (Raw JSON):**
```bash
curl -X POST http://localhost:3000/api/servers/import \
     -H "Content-Type: application/json" \
     -d '{
       "servers": [
         { "name": "Servidor Épico", "target_ip": "play.epico.net", "target_port": 19132 }
       ]
     }'
```

El importador evitará duplicados inteligentemente. Una vez insertados, el motor de "Pings" comenzará a evaluarlos inmediatamente para mostrarlos en tu consola si están en línea.

---

## 🛠 Arquitectura

```
Consola (Switch/Xbox/PS)
    │
    ▼
┌──────────────────────┐
│  DNS Server (:53)    │ ── Intercepta "The Hive" / "CubeCraft" ──▶ Devuelve IP local
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│  Proxy Bedrock       │ ── Crea un mundo "Limbo" con UI nativa
│  (:19132)            │ ── El jugador selecciona servidor o crea uno local
└──────────────────────┘
    │                  │
    │                  └──▶ Transfer al servidor real (ej. play.nethergames.org)
    │
    ▼ (Servidores Locales)
┌──────────────────────────────────────┐
│  Docker Daemon (host)                │
│  itzg/minecraft-bedrock-server       │
│  Puerto 20000  → Mundo "Mi Aventura" │
│  Puerto 20001  → Mundo "Creativo"    │
│  ...                                 │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────┐
│  Backup Scheduler    │ ── Cada 6h comprime worlds/ → backups/
└──────────────────────┘
```

**Archivos principales:**

| Archivo | Descripción |
|---------|-------------|
| `index.js` | Punto de entrada y auto-detección de red. |
| `dns/dnsForwarder.js` | Escucha en `0.0.0.0:53` y secuestra los A-Records. |
| `proxy/bedrockProxy.js` | Levanta el servidor "Limbo", gestiona toda la UI nativa y los formularios. |
| `proxy/docker/dockerManager.js` | Crea y administra contenedores Bedrock via `dockerode`. |
| `proxy/docker/backupManager.js` | Scheduler de backups automáticos de mundos. |
| `api/expressServer.js` | Servidor de administración REST en el puerto `3000`. |
| `database/sqliteConfig.js` | Administrador de la persistencia de datos (servidores remotos y locales). |

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).
