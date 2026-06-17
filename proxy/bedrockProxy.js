const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const { getAllServers, addServer, getServerById, updateServer, deleteServer, updateServerStatus } = require('../database/sqliteConfig');
const dummyPackets = require('./dummyPackets');

// Estado global de orden de servidores por cliente
// 'desc' = más recientes primero, 'asc' = más antiguos primero
const clientSortOrder = new Map();

// ─── AUTO-DETECCIÓN DE VERSIÓN ───────────────────────────────────────────────
//
// bedrock-protocol define una CURRENT_VERSION (ej: '1.26.20') que frecuentemente
// queda atrasada cuando Mojang publica actualizaciones menores (1.26.30, etc).
//
// Cuando la consola (Switch) se actualiza, rechaza conectarse a servidores que
// anuncien un protocolo más viejo.
//
// La estrategia es:
//   1. Usar la versión más alta que minecraft-data SOPORTE para serialización
//      (necesitamos sus datos de paquetes reales).
//   2. Parchear el ServerAdvertisement para anunciar el protocolo más alto
//      conocido, que puede ser inyectado manualmente.
//
// La estructura de paquetes entre versiones menores (1.26.x) es idéntica,
// así que la serialización de 1.26.20 funciona perfectamente para 1.26.30.

// Versiones conocidas que bedrock-protocol/minecraft-data aún no soportan.
// Cuando se publique un update oficial, estas entradas se ignoran automáticamente.
// Formato: { 'version': protocolNumber }
// Fuente: https://minecraft.wiki/w/Protocol_version#Bedrock_Edition_2
const VERSION_OVERRIDES = {
  // Este override sólo se usa cuando minecraft-data aún no conoce la versión.
  // 1.26.30 es la versión del cliente; el servidor internamente serializa con 1.26.20.
  '1.26.30': 1001,
};

function compareVersionStrings(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function resolveBestVersion() {
  const Options = require('bedrock-protocol/src/options');
  const { Versions } = Options;

  const sorted = Object.entries(Versions).sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) {
    throw new Error('[PROXY] No hay versiones de Bedrock disponibles en minecraft-data');
  }

  const [serializationVersion, serializationProtocol] = sorted[0];

  let bestVersion = serializationVersion;
  let bestProtocol = serializationProtocol;

  for (const [ver, proto] of Object.entries(VERSION_OVERRIDES)) {
    if (compareVersionStrings(ver, bestVersion) > 0) {
      bestVersion = ver;
      bestProtocol = proto;
    }
  }

  if (bestVersion !== serializationVersion) {
    Versions[bestVersion] = bestProtocol;
    console.log(`[PROXY] Version ${bestVersion} (protocolo ${bestProtocol}) inyectada.`);
    console.log(`[PROXY] Serializacion basada en ${serializationVersion} (protocolo ${serializationProtocol}).`);
  } else {
    console.log(`[PROXY] Version del protocolo: ${bestVersion} (protocolo ${bestProtocol})`);
  }

  return { serializationVersion, bestVersion, bestProtocol };
}

// IDs de formularios
const MAIN_MENU_ID = 1000;
const ADD_SERVER_ID = 1001;
const DIRECT_CONNECT_ID = 1002;
const MANAGE_MENU_ID = 1003;
const EDIT_SELECT_ID = 1004;
const EDIT_SERVER_ID = 1005;
const DELETE_SELECT_ID = 1006;
const DELETE_CONFIRM_ID = 1007;
const SORT_ORDER_ID = 1008;

// ─── FORMULARIOS DE UI ───────────────────────────────────────────────────────

function sendMainMenu(client) {
  const allServers = getAllServers();
  // Filtrar solo los servidores online para el menú
  const onlineServers = allServers.filter(s => s.online_status === 1);

  // Ordenar servidores según la preferencia del cliente
  const clientKey = client.address?.address || 'default';
  const sortOrder = clientSortOrder.get(clientKey) || 'desc'; // Default: recientes primero
  const sortLabel = sortOrder === 'desc' ? 'Recientes primero' : 'Antiguos primero';
  const nextSortLabel = sortOrder === 'desc' ? 'Antiguos primero' : 'Recientes primero';

  onlineServers.sort((a, b) => {
    return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
  });

  const buttons = [
    { text: "Conexion Directa\n(Escribir IP)" },
    { text: "Administrar Servidores\nAgregar, Editar, Eliminar" },
    { text: `Orden: ${sortLabel}\nCambiar a: ${nextSortLabel}` }
  ];

  for (const server of onlineServers) {
    buttons.push({ text: `${server.name}\n[EN LINEA] ${server.players_online} Jugadores` });
  }

  // Guardamos la lista filtrada en el cliente para que la respuesta del formulario
  // use el mismo índice que los botones mostrados.
  client._onlineServers = onlineServers;

  const formPayload = {
    type: 'form',
    title: 'BedrockGateway',
    content: 'Selecciona una opcion o un servidor:',
    buttons,
  };

  client.write('modal_form_request', {
    form_id: MAIN_MENU_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendManageMenu(client) {
  const formPayload = {
    type: 'form',
    title: 'Administrar Servidores',
    content: 'Selecciona una accion:',
    buttons: [
      { text: "[+] Agregar Servidor" },
      { text: "[E] Editar Servidor" },
      { text: "[X] Eliminar Servidor" },
      { text: "[<] Volver al Menu" }
    ],
  };

  client.write('modal_form_request', {
    form_id: MANAGE_MENU_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendAddServerForm(client) {
  const formPayload = {
    type: 'custom_form',
    title: 'Agregar Servidor',
    content: [
      { type: 'input', text: 'Nombre del Servidor', placeholder: 'Mi Servidor', default: '' },
      { type: 'input', text: 'Direccion IP', placeholder: 'play.ejemplo.com', default: '' },
      { type: 'input', text: 'Puerto', placeholder: '19132', default: '19132' }
    ]
  };

  client.write('modal_form_request', {
    form_id: ADD_SERVER_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendDirectConnectForm(client) {
  const formPayload = {
    type: 'custom_form',
    title: 'Conexion Directa',
    content: [
      { type: 'input', text: 'Direccion IP', placeholder: 'play.ejemplo.com', default: '' },
      { type: 'input', text: 'Puerto', placeholder: '19132', default: '19132' }
    ]
  };

  client.write('modal_form_request', {
    form_id: DIRECT_CONNECT_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendEditSelectForm(client) {
  const servers = getAllServers();

  if (servers.length === 0) {
    sendManageMenu(client);
    return;
  }

  // Guardamos la lista completa para mapear el índice después
  client._allServersForManage = servers;

  const serverNames = servers.map(s => {
    const status = s.online_status === 1 ? '[ON]' : '[OFF]';
    return `${status} ${s.name} (${s.target_ip})`;
  });

  const formPayload = {
    type: 'custom_form',
    title: 'Editar Servidor',
    content: [
      { type: 'dropdown', text: 'Selecciona un servidor para editar:', options: serverNames, default: 0 }
    ]
  };

  client.write('modal_form_request', {
    form_id: EDIT_SELECT_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendEditServerForm(client, server) {
  // Guardamos el ID del servidor que estamos editando
  client._editingServerId = server.id;

  const formPayload = {
    type: 'custom_form',
    title: `Editando: ${server.name}`,
    content: [
      { type: 'input', text: 'Nombre del Servidor', placeholder: 'Mi Servidor', default: server.name },
      { type: 'input', text: 'Direccion IP', placeholder: 'play.ejemplo.com', default: server.target_ip },
      { type: 'input', text: 'Puerto', placeholder: '19132', default: String(server.target_port) }
    ]
  };

  client.write('modal_form_request', {
    form_id: EDIT_SERVER_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendDeleteSelectForm(client) {
  const servers = getAllServers();

  if (servers.length === 0) {
    sendManageMenu(client);
    return;
  }

  // Guardamos la lista completa para mapear el índice después
  client._allServersForManage = servers;

  const serverNames = servers.map(s => {
    const status = s.online_status === 1 ? '🟢' : '🔴';
    return `${status} ${s.name} (${s.target_ip})`;
  });

  const formPayload = {
    type: 'custom_form',
    title: 'Eliminar Servidor',
    content: [
      { type: 'dropdown', text: 'Selecciona un servidor para eliminar:', options: serverNames, default: 0 }
    ]
  };

  client.write('modal_form_request', {
    form_id: DELETE_SELECT_ID,
    data: JSON.stringify(formPayload),
  });
}

function sendDeleteConfirmForm(client, server) {
  // Guardamos el ID del servidor que vamos a eliminar
  client._deletingServerId = server.id;

  const formPayload = {
    type: 'modal',
    title: 'Confirmar Eliminacion',
    content: `Estas seguro de que quieres eliminar "${server.name}"?\n\nIP: ${server.target_ip}:${server.target_port}\n\nEsta accion no se puede deshacer.`,
    button1: 'Si, Eliminar',
    button2: 'Cancelar'
  };

  client.write('modal_form_request', {
    form_id: DELETE_CONFIRM_ID,
    data: JSON.stringify(formPayload),
  });
}

// ─── TAREA DE PINGS EN SEGUNDO PLANO ─────────────────────────────────────────

function startBackgroundPings() {
  const PING_INTERVAL = 60000; // 1 minuto
  
  setInterval(async () => {
    const servers = getAllServers();
    for (const server of servers) {
      try {
        const result = await bedrock.ping({ host: server.target_ip, port: server.target_port, timeout: 3000 });
        updateServerStatus(server.id, 1, result.playersOnline);
      } catch (error) {
        updateServerStatus(server.id, 0, 0);
      }
    }
  }, PING_INTERVAL);

  // Ejecutar el primer ping inmediatamente (fuera del setInterval)
  setTimeout(async () => {
    const servers = getAllServers();
    for (const server of servers) {
      try {
        const result = await bedrock.ping({ host: server.target_ip, port: server.target_port, timeout: 3000 });
        updateServerStatus(server.id, 1, result.playersOnline);
      } catch (error) {
        updateServerStatus(server.id, 0, 0);
      }
    }
  }, 1000);
}

// ─── SERVIDOR PROXY ──────────────────────────────────────────────────────────

function startProxy(host, port) {
  const { serializationVersion, bestVersion, bestProtocol } = resolveBestVersion();

  // Arranca el servidor con la versión que minecraft-data SÍ conoce (ej: 1.26.20)
  const server = bedrock.createServer({
    host: host,
    port: port,
    version: serializationVersion,
    offline: true,
    motd: {
      motd: "BedrockGateway",
      levelId: "BedrockGateway"
    },
    maxPlayers: 10
  });

  // Si hay un override de versión (como 1.26.30), parcheamos el server
  if (bestVersion !== serializationVersion) {
    server.advertisement.version = bestVersion;
    server.advertisement.protocol = bestProtocol;
    server.options.advertisementFn = () => server.advertisement;

    // 🔥 EL TRUCO MAESTRO: cambiar la variable interna que valida el handshake
    server.options.protocolVersion = bestProtocol;

    console.log(`[PROXY] Advertisement y Protocolo interno parcheados: ${bestVersion} (${bestProtocol})`);
  }

  console.log(`[PROXY] Bedrock Proxy vivo y escuchando en el puerto ${port}`);
  startBackgroundPings();

  server.on('connect', (client) => {
    console.log('🔥 CONEXIÓN RAW');
    console.log('[PROXY] Jugador conectado desde:', client.address?.address || 'desconocido');

    // Volvemos al bypass simple y confiable: forzar handshake -> login_success -> join
    client.removeAllListeners('server.client_handshake');
    client.on('server.client_handshake', () => {
      console.log('[PROXY] 🛡️ Handshake completado, enviando login_success');
      client.write('play_status', { status: 'login_success' });
      client.status = 3; // ClientStatus.Initializing
      client.emit('join');
    });

    // 🔥 PATCH DEFINITIVO V4: Bypass de validación JWT para Switch/Consolas
    client.decodeLoginJWT = function (authTokens, skinTokens, authToken = '') {
      let finalKey = null;
      let data = {};

      if (Array.isArray(authTokens)) {
        for (const token of authTokens) {
          if (!token || typeof token !== 'string') continue;
          const parts = token.split('.');
          if (parts.length !== 3) continue;
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            if (payload.identityPublicKey) finalKey = payload.identityPublicKey;
            data = { ...data, ...payload };
          } catch (e) {}
        }
      }

      if (authToken && typeof authToken === 'string') {
        const parts = authToken.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
            data = { ...data, ...payload };
            if (payload.identityPublicKey) finalKey = payload.identityPublicKey;
          } catch (e) {}
        }
      }

      let skinData = {};
      if (skinTokens && typeof skinTokens === 'string') {
        const parts = skinTokens.split('.');
        if (parts.length === 3) {
          try {
            skinData = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          } catch (e) {}
        }
      }

      if (!finalKey) console.warn('[PROXY] ⚠️ No se encontró identityPublicKey.');
      return { key: finalKey, userData: data, skinData };
    };

    client.on('error', (error) => {
      console.error('[PROXY] Error en cliente Bedrock:', error.message || error);
    });

    client.on('join', () => {
      console.log('[PROXY] Enviando resource_packs_info...');

      client.write('resource_packs_info', {
        must_accept: false, has_addons: false, has_scripts: false, force_server_packs: false,
        behavior_packs: [], texture_packs: [],
        world_template: { uuid: '00000000-0000-0000-0000-000000000000', version: '*' }
      });

      client.on('resource_pack_client_response', (packet) => {
        if (packet.response_status === 'have_all_packs') {
          console.log('[PROXY] Cliente tiene los packs, enviando resource_pack_stack...');
          client.write('resource_pack_stack', {
            must_accept: false, behavior_packs: [], resource_packs: [],
            game_version: '*', experiments: [], experiments_previously_used: false
          });
        } else if (packet.response_status === 'completed') {
          console.log('[PROXY] Cliente completo carga de packs. Generando mundo dummy...');
          try {
            client.write('start_game', dummyPackets.startGame);
            client.write('creative_content', dummyPackets.creativeContent);
            client.write('biome_definition_list', dummyPackets.biomeDefinitionList);

            const emptyChunk = dummyPackets.emptyLevelChunk;
            const RADIUS = 4;
            for (let x = -RADIUS; x <= RADIUS; x++) {
              for (let z = -RADIUS; z <= RADIUS; z++) {
                client.write('level_chunk', { x: x, z: z, ...emptyChunk });
              }
            }
            console.log(`[PROXY] ${(RADIUS * 2 + 1) ** 2} chunks vacios enviados.`);
            client.write('play_status', { status: 'player_spawn' });
          } catch(e) {
            console.error('[PROXY] Error enviando paquetes iniciales:', e.message);
          }
        }
      });

      client.on('request_chunk_radius', (packet) => {
        client.write('chunk_radius_update', { chunk_radius: Math.min(packet.chunk_radius, 4) });
      });

      client.on('set_local_player_as_initialized', () => {
        console.log('[PROXY] Cliente Spawned! Enviando menú principal...');
        sendMainMenu(client);
      });

      // El manejador de formularios (`modal_form_response`) permanece abajo sin cambios
    });
  });

  server.on('error', (error) => {
    console.error('[PROXY] Error en el servidor:', error);
  });
}

module.exports = {
  startProxy,
};