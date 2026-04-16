# BedrockGateway

BedrockGateway es una solución local en Node.js que permite a jugadores de Minecraft Bedrock en consolas (Xbox, Switch, PlayStation) usar servidores personalizados mediante DNS spoofing y un proxy UDP transparente.

## ¿Por qué usar BedrockGateway?

Las consolas de Minecraft Bedrock bloquean la configuración de servidores personalizados de terceros y fuerzan el acceso solo a servidores oficiales. BedrockGateway resuelve este problema haciendo que la consola crea que se está conectando a un servidor oficial, mientras redirige la conexión a un proxy local que permite seleccionar servidores personalizados.

## Arquitectura / ¿Cómo funciona?

1. El usuario configura la IP de su PC local como DNS primario en la consola.
2. El módulo DNS Forwarder, implementado con `dns2`, escucha en el puerto `53`.
3. Cuando la consola resuelve un dominio de servidor oficial destacado (por ejemplo, `mco.cubecraft.net`), el DNS responde con la IP local, secuestrando la conexión.
4. Para cualquier otro dominio (como Netflix o Xbox Live), el DNS realiza un fallback transparente hacia `1.1.1.1` (Cloudflare), de modo que la consola no pierde acceso a internet.
5. El módulo Bedrock Proxy, basado en `bedrock-protocol`, escucha en el puerto `19132`.
6. El jugador redirigido aterriza en el proxy local y desde allí se le presenta un formulario nativo en el juego para elegir qué servidor real desea conectar.
7. El módulo API REST, construido con `express`, y la base de datos `better-sqlite3` administran y persisten la lista de servidores personalizados del usuario.

## Requisitos Previos

- Node.js v18 o superior
- npm 9 o superior
- Acceso administrativo para escuchar en el puerto `53` (puede requerir permisos elevados en algunos sistemas)

## Instalación y Uso

```bash
npm install express better-sqlite3 dns2
npm install --save-dev nodemon
```

Para ejecutar el proyecto durante el desarrollo:

```bash
npx nodemon index.js
```

O con Node.js directamente:

```bash
node index.js
```

## Estructura del Proyecto

- `api/`
  - Contiene los endpoints REST para administrar servidores personalizados, obtener configuración y gestionar el estado del gateway.
- `dns/`
  - Implementa el DNS Forwarder que intercepta resoluciones de dominios específicos y hace fallback a Cloudflare para todo lo demás.
- `proxy/`
  - Implementa el Bedrock Proxy UDP que recibe la conexión redirigida y presenta la selección de servidor dentro del juego.
- `database/`
  - Contiene la lógica de persistencia con `better-sqlite3` y los archivos de la base de datos local.

## Notas

BedrockGateway está diseñado como una solución local para entornos controlados. La configuración de DNS y los permisos de red deben ajustarse con cuidado para no interrumpir otros servicios de la red.
