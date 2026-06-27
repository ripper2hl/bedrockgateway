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
- **API REST Integrada:** Agrega nuevos servidores masivamente usando llamadas HTTP (URLs, Listas Locales o Archivos JSON).

---

## 📋 Requisitos

- **Node.js 18+** (o Docker)
- La consola (Switch/Xbox/PS) debe estar en la **misma red local** que la máquina que ejecuta BedrockGateway.
- Permisos de **root/Administrador** para abrir el puerto DNS 53.

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

## 🐳 Uso con Docker (Recomendado)

Si prefieres usar contenedores, BedrockGateway está completamente listo para Docker.

### Construir la imagen
```bash
docker build -t bedrockgateway .
```

### Ejecutar el contenedor
**⚠️ IMPORTANTE:** Para que los jugadores de la red local puedan acceder al servidor de Minecraft, el servidor DNS debe responder con la IP real de tu máquina (no la IP del contenedor). 
Puedes escribirla manualmente (ej. `-e HOST_IP=192.168.1.100`), o si estás en Linux/macOS, puedes usar un pequeño truco en la terminal para que la detecte y la pase automáticamente:

```bash
docker run -d \
  --name bedrockgateway \
  --restart unless-stopped \
  -e HOST_IP=$(hostname -I | awk '{print $1}') \
  -v bedrockgateway-data:/app/database \
  -p 53:53/udp \
  -p 19132:19132/udp \
  -p 3000:3000/tcp \
  bedrockgateway
```

> **💾 Persistencia de datos:** La opción `-v bedrockgateway-data:/app/database` crea un **volumen de Docker** que almacena la base de datos SQLite fuera del contenedor. Esto significa que puedes borrar y recrear el contenedor sin perder tus servidores registrados. El volumen persiste hasta que lo elimines manualmente con `docker volume rm bedrockgateway-data`.

### Registrar tu servidor de Minecraft

Una vez que el contenedor esté corriendo, puedes agregar tu servidor con un simple `curl`:

```bash
curl -X POST http://localhost:3000/api/servers \
     -H "Content-Type: application/json" \
     -d '{ "name": "Perales", "target_ip": "192.168.3.84", "target_port": 19133 }'
```

O si prefieres importar desde el archivo `servidores.json` incluido en el proyecto:

```bash
curl -X POST http://localhost:3000/api/servers/import \
     -H "Content-Type: application/json" \
     -d '{"file": "./servidores.json"}'
```

---

## 🐳 Despliegue con Docker

La forma más rápida de poner en marcha BedrockGateway es usando la imagen oficial publicada en Docker Hub. No necesitas compilar nada.

### Opción 1 — Docker CLI

```bash
docker run -d \
  --name bedrockgateway \
  --restart unless-stopped \
  -e HOST_IP=$(hostname -I | awk '{print $1}') \
  -v $(pwd)/database:/app/database \
  -p 53:53/udp \
  -p 19132:19132/udp \
  -p 3000:3000/tcp \
  jesusperales/bedrockgateway:latest
```

### Opción 2 — Docker Compose

Copia el siguiente bloque en un archivo `docker-compose.yml` y ejecuta `docker compose up -d`:

```yaml
services:
  bedrockgateway:
    image: jesusperales/bedrockgateway:latest
    container_name: bedrockgateway
    restart: unless-stopped
    environment:
      - HOST_IP=${HOST_IP:-}
    volumes:
      - ./database:/app/database
    ports:
      - "53:53/udp"
      - "19132:19132/udp"
      - "3000:3000/tcp"
```

> **💡 Tip:** Antes de levantar el servicio, exporta tu IP local para que el DNS la propague correctamente:
> ```bash
> export HOST_IP=$(hostname -I | awk '{print $1}')
> docker compose up -d
> ```

### ⚠️ Notas Importantes

- **Puerto 53 en Linux:** Si el contenedor no puede enlazarse al puerto 53, es probable que `systemd-resolved` ya lo esté ocupando. Puedes liberarlo con:
  ```bash
  sudo systemctl stop systemd-resolved
  sudo systemctl disable systemd-resolved
  ```
- **Permisos del volumen:** La carpeta `./database` que se monta como volumen debe tener permisos de escritura en la máquina host. Si el contenedor falla al iniciar, ejecuta `chmod 777 ./database`.
- **Swagger UI:** Una vez levantado el contenedor, el panel de documentación interactiva de la API REST estará disponible en **http://localhost:3000/api-docs**.

---

## ⚙️ Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `HOST_IP` | IP que el DNS devuelve a las consolas. Si no se define, se auto-detecta. | Auto-detectada |
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
│  (:19132)            │ ── El jugador selecciona un servidor
└──────────────────────┘
    │
    ▼
  Transfer al servidor real (ej. play.nethergames.org:19132)
```

**Archivos principales:**
- `index.js`: Punto de entrada y auto-detección de red.
- `dns/dnsForwarder.js`: Escucha en `0.0.0.0:53` y secuestra los A-Records.
- `proxy/bedrockProxy.js`: Levanta un falso servidor Offline en el puerto `19132` inyectando `dummyPackets` e invoca la UI nativa.
- `api/expressServer.js`: Servidor de administración en el puerto `3000`.
- `database/sqliteConfig.js`: Administrador de la persistencia de datos.

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).

