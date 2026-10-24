# Changelog

Todos los cambios notables en este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.0] - 2026-10-24

### Agregado
- **Compatibilidad Minecraft Bedrock 1.26.50+ / 1.26.52 (Protocolo 2193):** Handshake de mundo canónico basado en la especificación oficial de BedrockConnect 26.50.
- Soporte para paquetes obligatorios `jigsaw_structure_data`, `voxel_shapes` e `item_component`.
- Generación de 36 mini-chunks vacíos (`level_chunk`) de inicialización para salida instantánea de la pantalla de carga en consolas.
- Soporte nativo para transporte **NetherNet** y mapeo dual TCP/UDP en servidores Bedrock dedicados locales.
- Actualización de dependencias principales del protocolo: `bedrock-protocol` a `^3.60.1` y `minecraft-data` a `^3.117.0`.
- Planificador automático de copias de seguridad de mundos locales cada 6 horas (`backupManager`).
- Re-apertura interactiva del menú de servidores al realizar la acción de animación (`swing_arm`) en el cliente.

### Corregido
- **Error Code: Boat en Nintendo Switch / Consolas:** Eliminado error de desconexión causado por desincronización de `player_spawn`, chunks inexistentes y dimensionalidad incompatible.
- Eliminado paquete `biome_definition_list` con definiciones vacías que corrompía la carga del cliente en versiones 1.26+.
- Corrección de la propiedad `dimension: 0` (Overworld) en el Limbo Proxy.
- Limpieza automática de servidores locales huérfanos o con contenedores desfasados en SQLite.

---

## [1.0.0] - 2026-07-15

### Agregado
- Servidor proxy DNS en puerto 53 para intercepción de servidores destacados (The Hive, CubeCraft).
- Servidor proxy Minecraft Bedrock en puerto 19132 con Limbo World e inyección de formularios nativos.
- Persistencia de servidores remotos y locales mediante SQLite (`better-sqlite3`).
- API REST en puerto 3000 con Swagger UI para administración e importación de servidores.
- Módulo Docker para arranque y ciclo de vida de mundos dedicados locales bajo demanda.
- Soporte de addons globales aplicados al vuelo al iniciar contenedores.
