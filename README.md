# BedrockGateway

BedrockGateway es un servidor proxy DNS + Minecraft Bedrock construido 100% en Node.js. 
Actúa como una alternativa moderna y altamente optimizada a herramientas como BedrockConnect, permitiendo a los jugadores de consolas (Nintendo Switch, Xbox, PlayStation) conectarse a cualquier servidor externo (Custom Servers) saltándose las restricciones de Mojang.

## ✨ Características Principales

- **Intercepción DNS Automática:** Redirige servidores destacados como "The Hive" o "CubeCraft" hacia el proxy local.
- **Inyección de UI en Juego:** Crea un "Limbo Server" hiper-optimizado que engaña a la consola para inyectarle un formulario interactivo nativo (sin necesidad de librerías de generación de mundos pesadas).
- **Almacenamiento Local (SQLite):** Guarda tus servidores favoritos permanentemente.
- **Filtro Inteligente en Tiempo Real:** El proxy tiene una tarea en segundo plano que hace "Ping" cada 60 segundos a tus servidores. **El menú del juego ocultará automáticamente los servidores inactivos**, mostrando solo los que están listos para jugar.
- **API REST Integrada:** Agrega nuevos servidores masivamente usando llamadas HTTP (URLs, Listas Locales o Archivos JSON).

---

## 🚀 Uso Rápido (Local con Node.js)

Requiere **Node.js 18+** instalado.

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Inicia el servidor (es posible que requieras privilegios de Administrador/root para abrir el puerto DNS 53):
   ```bash
  node index.js
   ```

El servidor detectará automáticamente tu IP local e iniciará los servicios.
En tu consola de videojuegos, solo cambia tu DNS Primario a la IP local de tu computadora y entra a un Servidor Destacado (ej. The Hive).

---

## 🐳 Uso con Docker (Recomendado)

Si prefieres usar contenedores, BedrockGateway está completamente listo para Docker.

### Construir la imagen
```bash
docker build -t bedrock-gateway .
```

### Ejecutar el contenedor
**⚠️ IMPORTANTE:** Para que los jugadores de la red local puedan acceder al servidor de Minecraft, el servidor DNS debe responder con la IP real de tu máquina (no la IP del contenedor). 
Puedes escribirla manualmente (ej. `-e HOST_IP=192.168.1.100`), o si estás en Linux/macOS, puedes usar un pequeño truco en la terminal para que la detecte y la pase automáticamente:

```bash
docker run -d \
  --name bedrock-gateway \
  --restart unless-stopped \
  -e HOST_IP=$(hostname -I | awk '{print $1}') \
  -p 53:53/udp \
  -p 19132:19132/udp \
  -p 3000:3000/tcp \
  bedrock-gateway
```

---

## 🔌 API de Importación Masiva

Si quieres nutrir tu base de datos de servidores rápidamente, puedes usar el puerto `3000`. Soporta 3 modos:

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
- `index.js`: Punto de entrada y auto-detección de red.
- `dns/dnsForwarder.js`: Escucha en `0.0.0.0:53` y secuestra los A-Records.
- `proxy/bedrockProxy.js`: Levanta un falso servidor Offline en el puerto `19132` inyectando `dummyPackets` e invoca la UI nativa.
- `api/expressServer.js`: Servidor de administración en el puerto `3000`.
- `database/sqliteConfig.js`: Administrador de la persistencia de datos.
