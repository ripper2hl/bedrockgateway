const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const {
  getAllServers, addServer, getServerById, updateServer, deleteServer, updateServerStatus,
  getAllLocalServers, addLocalServer, getLocalServerById,
  updateLocalServerEstado, updateLocalServerContainerId, deleteLocalServer,
} = require('../database/sqliteConfig');
const dummyPackets = require('./dummyPackets');
const {
  sanitizeName, findAvailablePort, createBedrockServer,
  waitForContainerReady, stopBedrockServer, removeBedrockServer,
  MAX_SERVERS,
} = require('./docker/dockerManager');
const { startBackupScheduler } = require('./docker/backupManager');

// IDs de formularios — servidores remotos
const MAIN_MENU_ID = 1000;
const ADD_SERVER_ID = 1001;
const DIRECT_CONNECT_ID = 1002;
const MANAGE_MENU_ID = 1003;
const EDIT_SELECT_ID = 1004;
const EDIT_SERVER_ID = 1005;
const DELETE_SELECT_ID = 1006;
const DELETE_CONFIRM_ID = 1007;

// IDs de formularios — servidores locales Docker
const LOCAL_MENU_ID          = 1008; // Lista de mundos locales
const CREATE_LOCAL_ID        = 1009; // Formulario de creación
const CREATE_LOCAL_WAIT_ID   = 1010; // Modal "espera..."
const MANAGE_LOCAL_ID        = 1011; // Gestionar servidor específico
const DELETE_LOCAL_CONFIRM_ID= 1012; // Confirmar eliminación

// ─── FORMULARIOS DE UI ───────────────────────────────────────────────────────

/**
 * Devuelve la IP pública/local del host para usarla en los transfer packets.
 * Primero revisa HOST_IP, luego detecta la interfaz de red activa.
 */
function getHostIp() {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function sendMainMenu(client) {
  // Servidores locales activos o iniciando → aparecen PRIMERO
  const localActive = getAllLocalServers().filter(s => s.estado === 'activo' || s.estado === 'iniciando');
  // Servidores remotos online → aparecen después
  const onlineRemote = getAllServers().filter(s => s.online_status === 1);

  const buttons = [
    { text: "Conexi\u00f3n Directa\n(Escribir IP)" },
    { text: "Administrar Servidores\n\u2699\uFE0F Agregar, Editar, Eliminar" },
  ];

  // 🏠 Locales primero
  for (const s of localActive) {
    const emoji = s.estado === 'activo' ? '\uD83D\uDFE2' : '\u23F3'; // 🟢 ó ⏳
    buttons.push({ text: `${emoji} ${s.name}\n\uD83C\uDFE0 Servidor Local` });
  }

  // 🌐 Remotos después
  for (const s of onlineRemote) {
    buttons.push({ text: `${s.name}\n\u25CF ${s.players_online} Jugadores` });
  }

  // Lista unificada para el handler: type='local' | 'remote'
  client._menuItems = [
    ...localActive.map(s => ({ type: 'local', ...s })),
    ...onlineRemote.map(s => ({ type: 'remote', ...s })),
  ];

  client.write('modal_form_request', {
    form_id: MAIN_MENU_ID,
    data: JSON.stringify({
      type: 'form',
      title: 'BedrockGateway',
      content: 'Selecciona una opci\u00f3n o un servidor:',
      buttons,
    }),
  });
}

function sendManageMenu(client) {
  const formPayload = {
    type: 'form',
    title: 'Administrar Servidores',
    content: 'Selecciona una acción:',
    buttons: [
      { text: "\u2795 Agregar Servidor" },
      { text: "\u270F\uFE0F Editar Servidor" },
      { text: "\u2716 Eliminar Servidor" },
      { text: "\uD83C\uDF0D Servidores Locales (Docker)" },
      { text: "\u2B05\uFE0F Volver al Men\u00FA" }
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
    title: 'Añadir Servidor',
    content: [
      { type: 'input', text: 'Nombre del Servidor', placeholder: 'Mi Servidor', default: '' },
      { type: 'input', text: 'Dirección IP', placeholder: 'play.ejemplo.com', default: '' },
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
    title: 'Conexión Directa',
    content: [
      { type: 'input', text: 'Dirección IP', placeholder: 'play.ejemplo.com', default: '' },
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
    const status = s.online_status === 1 ? '\u25CF' : '\u25CB'; // ● online, ○ offline (BMP-safe)
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
      { type: 'input', text: 'Dirección IP', placeholder: 'play.ejemplo.com', default: server.target_ip },
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
    const status = s.online_status === 1 ? '\u25CF' : '\u25CB'; // ● online, ○ offline (BMP-safe)
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
    title: 'Confirmar Eliminación',
    content: `¿Estás seguro de que quieres eliminar "${server.name}"?\n\nIP: ${server.target_ip}:${server.target_port}\n\nEsta acción no se puede deshacer.`,
    button1: 'Sí, Eliminar',
    button2: 'Cancelar'
  };

  client.write('modal_form_request', {
    form_id: DELETE_CONFIRM_ID,
    data: JSON.stringify(formPayload),
  });
}

// ─── FORMULARIOS: SERVIDORES LOCALES DOCKER ──────────────────────────────────

/**
 * Muestra el menú de servidores locales con sus estados actuales.
 */
function sendLocalMenu(client) {
  const servers = getAllLocalServers();
  client._localServers = servers;

  const estadoEmoji = { iniciando: '\u23F3', activo: '\u25CF', detenido: '\u25CB' };
  const gamemodeLabel = { survival: 'Supervivencia', creative: 'Creativo' };

  const totalUsed = servers.length; // todos los registros, activos y detenidos
  const buttons = [
    { text: `\u2728 Crear Nuevo Servidor\n(Slots libres: ${MAX_SERVERS - totalUsed}/${MAX_SERVERS})` },
  ];

  for (const s of servers) {
    const emoji = estadoEmoji[s.estado] || '?';
    const mode = gamemodeLabel[s.gamemode] || s.gamemode;
    buttons.push({ text: `${emoji} ${s.name}\n${mode} \u2022 Puerto ${s.puerto}` });
  }

  buttons.push({ text: '\u2B05\uFE0F Volver' });

  client.write('modal_form_request', {
    form_id: LOCAL_MENU_ID,
    data: JSON.stringify({
      type: 'form',
      title: '\uD83C\uDF0D Servidores Locales',
      content: 'Tus mundos creados en este servidor:',
      buttons,
    }),
  });
}

/**
 * Formulario de creación de nuevo servidor local.
 */
function sendCreateLocalServerForm(client) {
  const totalCount = getAllLocalServers().length; // total de slots usados (activos + detenidos)

  if (totalCount >= MAX_SERVERS) {
    client.write('modal_form_request', {
      form_id: LOCAL_MENU_ID,
      data: JSON.stringify({
        type: 'modal',
        title: 'L\u00edmite alcanzado',
        content: `Ya tienes ${MAX_SERVERS} servidores activos.\nDetén alguno antes de crear uno nuevo.`,
        button1: 'Entendido',
        button2: '',
      }),
    });
    return;
  }

  client.write('modal_form_request', {
    form_id: CREATE_LOCAL_ID,
    data: JSON.stringify({
      type: 'custom_form',
      title: '\u2728 Crear Servidor Local',
      content: [
        { type: 'input',    text: 'Nombre del Mundo', placeholder: 'Mi Aventura', default: '' },
        { type: 'dropdown', text: 'Modo de Juego', options: ['Supervivencia', 'Creativo'], default: 0 },
      ],
    }),
  });
}

/**
 * Modal informativo mientras el contenedor arranca (no bloquea).
 */
function sendCreateLocalWaitModal(client, nombre, puerto) {
  client.write('modal_form_request', {
    form_id: CREATE_LOCAL_WAIT_ID,
    data: JSON.stringify({
      type: 'modal',
      title: '\u23F3 Creando Servidor...',
      content: `"${nombre}" se est\u00e1 iniciando.\n\nSer\u00e1s transferido autom\u00e1ticamente cuando est\u00e9 listo (~30 seg).\nPuerto asignado: ${puerto}`,
      button1: 'OK, esperar\u00e9',
      button2: '',
    }),
  });
}

/**
 * Menú de gestión de un servidor local específico (Detener / Eliminar).
 */
function sendManageLocalServerForm(client, serverSnapshot) {
  // Refrescar siempre desde la BD para tener container_id y estado actualizados
  const server = getLocalServerById(serverSnapshot.id) || serverSnapshot;
  client._managingLocalServer = server;

  const estadoTexto = { iniciando: '\u23F3 Iniciando', activo: '\u25CF Activo', detenido: '\u25CB Detenido' };
  const gamemodeLabel = { survival: 'Supervivencia', creative: 'Creativo' };

  client.write('modal_form_request', {
    form_id: MANAGE_LOCAL_ID,
    data: JSON.stringify({
      type: 'form',
      title: server.name,
      content: `Estado: ${estadoTexto[server.estado] || server.estado}\nModo: ${gamemodeLabel[server.gamemode] || server.gamemode}\nPuerto: ${server.puerto}`,
      buttons: [
        { text: '\u25BA Conectar al Servidor' },
        { text: '\u23F9 Detener Servidor' },
        { text: '\uD83D\uDDD1 Eliminar Servidor (mantiene mundo)' },
        { text: '\u2B05\uFE0F Volver' },
      ],
    }),
  });
}

/**
 * Confirmación antes de eliminar un servidor local.
 */
function sendDeleteLocalConfirmForm(client, server) {
  client._deletingLocalServer = server;

  client.write('modal_form_request', {
    form_id: DELETE_LOCAL_CONFIRM_ID,
    data: JSON.stringify({
      type: 'modal',
      title: 'Confirmar Eliminaci\u00f3n',
      content: `\u00bfEliminar el servidor "${server.name}"?\n\nEl contenedor Docker ser\u00e1 borrado.\nTu mundo en disco se CONSERVA para futuros usos.`,
      button1: 'S\u00ed, Eliminar',
      button2: 'Cancelar',
    }),
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
  // Arranca el servidor
  const server = bedrock.createServer({
    host: host,
    port: port,
    offline: true, // Vital para no pedir verificación extra a Xbox Live
    motd: {
      motd: "BedrockGateway",
      levelId: "BedrockGateway"
    },
    maxPlayers: 10
  });

  console.log(`[PROXY] ✅ Bedrock Proxy vivo y escuchando en el puerto ${port}`);

  // Iniciar tarea de ping en segundo plano
  startBackgroundPings();

  // Iniciar scheduler de backups de mundos locales
  startBackupScheduler(getAllLocalServers);

  // Limpiar registros huérfanos de creaciones fallidas previas ('pending')
  const orphaned = getAllLocalServers().filter(s => s.container_id === 'pending');
  for (const s of orphaned) {
    deleteLocalServer(s.id);
    console.log(`[PROXY] \uD83E\uDDF9 Limpiando registro huérfano: "${s.name}" (puerto ${s.puerto})`);
  }

  server.on('connect', (client) => {
    console.log('🔥 CONEXIÓN RAW');
    console.log('[PROXY] Jugador conectado desde:', client.address?.address || 'desconocido');

    // 🔥 PARCHE V5 (CORREGIDO): Bypass de Encriptación eliminando el listener nativo
    // Evitamos que 'bedrock-protocol' intente encriptar (ya que no somos Mojang y la consola nos rechazaría).
    client.removeAllListeners('server.client_handshake');
    client.on('server.client_handshake', () => {
      console.log('[PROXY] 🛡️ Saltando encriptación y enviando login_success directo (Estilo BedrockConnect)');
      client.write('play_status', { status: 'login_success' });
      client.status = 3; // ClientStatus.Initializing
      client.emit('join');
    });

    // 🔥 PATCH DEFINITIVO V4: Bypass de validación JWT para Switch/Consolas
    // Al estar en offline mode, no necesitamos validar firmas. Extraemos la data directamente
    // evitando crasheos (Unexpected end of JSON input) si la consola manda un JWT o cadena vacía.
    client.decodeLoginJWT = function (authTokens, skinTokens, authToken = '') {
      let finalKey = null;
      let data = {};

      // 1. Extraer data del chain
      if (Array.isArray(authTokens)) {
        for (const token of authTokens) {
          if (!token || typeof token !== 'string') continue;
          const parts = token.split('.');
          if (parts.length !== 3) continue;

          try {
            const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
            const payload = JSON.parse(payloadStr);
            if (payload.identityPublicKey) {
              finalKey = payload.identityPublicKey;
            }
            data = { ...data, ...payload };
          } catch (e) {
            // Ignoramos tokens inválidos
          }
        }
      }

      // 2. Extraer data del authToken si existe
      if (authToken && typeof authToken === 'string') {
        const parts = authToken.split('.');
        if (parts.length === 3) {
          try {
            const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
            const payload = JSON.parse(payloadStr);
            data = { ...data, ...payload };
            if (payload.identityPublicKey) {
              finalKey = payload.identityPublicKey; // El token principal tiene prioridad
            }
          } catch (e) { }
        }
      }

      // 3. Extraer data del skin
      let skinData = {};
      if (skinTokens && typeof skinTokens === 'string') {
        const parts = skinTokens.split('.');
        if (parts.length === 3) {
          try {
            const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
            skinData = JSON.parse(payloadStr);
          } catch (e) { }
        }
      }

      // 4. Fallback si no hay llave pública (para que no crashee la encriptación)
      // Aunque en clientes reales de Bedrock siempre vendrá una llave.
      if (!finalKey) {
        console.warn('[PROXY] ⚠️ No se encontró identityPublicKey en los tokens. La encriptación podría fallar.');
      }

      return { key: finalKey, userData: data, skinData };
    };

    client.on('error', (error) => {
      console.error('[PROXY] Error en cliente Bedrock:', error.message || error);
    });

    client.on('join', () => {
      console.log('[PROXY] Enviando resource_packs_info...');

      // Avanzamos el estado de carga
      client.write('resource_packs_info', {
        must_accept: false,
        has_addons: false,
        has_scripts: false,
        disable_vibrant_visuals: false,
        force_server_packs: false,
        behavior_packs: [],
        texture_packs: [],
        world_template: {
          uuid: '00000000-0000-0000-0000-000000000000',
          version: '*'
        }
      });

      client.on('resource_pack_client_response', (packet) => {
        if (packet.response_status === 'have_all_packs') {
          console.log('[PROXY] Cliente tiene los packs, enviando resource_pack_stack...');
          client.write('resource_pack_stack', {
            must_accept: false,
            behavior_packs: [],
            resource_packs: [],
            game_version: '*',
            experiments: [],
            experiments_previously_used: false
          });
        } else if (packet.response_status === 'completed') {
          console.log('[PROXY] Cliente completó carga de packs. Generando mundo dummy...');

          // 1. Enviamos el StartGamePacket para que deje la pantalla de carga
          try {
            client.write('start_game', dummyPackets.startGame);
          } catch (e) {
            console.error('[PROXY] Error enviando start_game:', e.message);
          }

          // 2. Enviamos el CreativeContent y BiomeDefinitionList (necesarios)
          try {
            client.write('creative_content', dummyPackets.creativeContent);
            client.write('biome_definition_list', dummyPackets.biomeDefinitionList);
            client.write('play_status', { status: 'player_spawn' });
          } catch (e) {
            console.error('[PROXY] Error enviando paquetes adicionales:', e.message);
          }

          console.log('[PROXY] Paquetes de inicialización enviados. Esperando respuesta del cliente...');
        }
      });

      // El cliente pide el radio de chunks que puede ver
      client.on('request_chunk_radius', (packet) => {
        client.write('chunk_radius_update', { chunk_radius: packet.chunk_radius });
      });

      client.on('set_local_player_as_initialized', (packet) => {
        console.log('[PROXY] Cliente Spawned! Enviando menú principal...');
        sendMainMenu(client);
      });

      // ─── HANDLER DE RESPUESTAS DE FORMULARIOS ──────────────────────────

      client.on('modal_form_response', async (packet) => {
        try {
          if (!packet.has_response_data) {
            // El usuario cerró el formulario (presionó B o la X)
            // Le volvemos a mandar el menú principal para que no se quede atrapado
            sendMainMenu(client);
            return;
          }

          const parsedData = JSON.parse(packet.data);

          // ── MENÚ PRINCIPAL ──
          if (packet.form_id === MAIN_MENU_ID) {
            const selectedIndex = Number(parsedData);

            if (selectedIndex === 0) {
              sendDirectConnectForm(client);
            } else if (selectedIndex === 1) {
              sendManageMenu(client);
            } else {
              const items = client._menuItems || [];
              const item  = items[selectedIndex - 2]; // -2 por los dos botones fijos

              if (item?.type === 'local') {
                const hostIp = getHostIp();
                console.log(`[PROXY] Transfer local "${item.name}" -> ${hostIp}:${item.puerto}`);
                client.write('transfer', { server_address: hostIp, port: item.puerto, reload_world: false });
              } else if (item?.type === 'remote') {
                console.log(`[PROXY] Transfer remoto "${item.name}" -> ${item.target_ip}:${item.target_port}`);
                client.write('transfer', { server_address: item.target_ip, port: Number(item.target_port), reload_world: false });
              }
            }

            // ── MENÚ ADMINISTRAR ──
          } else if (packet.form_id === MANAGE_MENU_ID) {
            const selectedIndex = Number(parsedData);

            if (selectedIndex === 0) {
              sendAddServerForm(client);       // Agregar
            } else if (selectedIndex === 1) {
              sendEditSelectForm(client);      // Editar
            } else if (selectedIndex === 2) {
              sendDeleteSelectForm(client);    // Eliminar
            } else if (selectedIndex === 3) {
              sendLocalMenu(client);           // Servidores Locales Docker
            } else {
              sendMainMenu(client);            // Volver
            }

            // ── AGREGAR SERVIDOR ──
          } else if (packet.form_id === ADD_SERVER_ID) {
            const name = parsedData[0] || 'Servidor Personalizado';
            const ip = parsedData[1];
            const port = Number(parsedData[2]) || 19132;

            if (!ip || ip.trim() === '') {
              sendManageMenu(client);
              return;
            }

            const result = addServer({ name, target_ip: ip, target_port: port });
            console.log(`[PROXY] Servidor añadido: ${name} (${ip}:${port})`);

            // Ping inmediato para que aparezca en el menú al instante
            if (result.changes > 0) {
              try {
                const pingResult = await bedrock.ping({ host: ip, port: port, timeout: 3000 });
                updateServerStatus(result.lastInsertRowid, 1, pingResult.playersOnline);
                console.log(`[PROXY] Ping exitoso a ${name}: ${pingResult.playersOnline} jugadores`);
              } catch (e) {
                updateServerStatus(result.lastInsertRowid, 0, 0);
                console.log(`[PROXY] ${name} no respondió al ping (se añadió pero aparecerá offline)`);
              }
            }

            sendManageMenu(client);

            // ── CONEXIÓN DIRECTA ──
          } else if (packet.form_id === DIRECT_CONNECT_ID) {
            const ip = parsedData[0];
            const port = Number(parsedData[1]) || 19132;

            if (!ip || ip.trim() === '') {
              sendMainMenu(client);
              return;
            }

            console.log(`[PROXY] Conexión Directa a ${ip}:${port}`);
            client.write('transfer', {
              server_address: ip,
              port: port,
              reload_world: false
            });

            // ── EDITAR: SELECCIÓN DE SERVIDOR ──
          } else if (packet.form_id === EDIT_SELECT_ID) {
            const selectedIndex = parsedData[0]; // Índice del dropdown
            const servers = client._allServersForManage || [];

            if (selectedIndex >= 0 && selectedIndex < servers.length) {
              const server = servers[selectedIndex];
              sendEditServerForm(client, server);
            } else {
              sendManageMenu(client);
            }

            // ── EDITAR: FORMULARIO DE EDICIÓN ──
          } else if (packet.form_id === EDIT_SERVER_ID) {
            const serverId = client._editingServerId;
            const name = parsedData[0] || 'Servidor Personalizado';
            const ip = parsedData[1];
            const port = Number(parsedData[2]) || 19132;

            if (!ip || ip.trim() === '' || !serverId) {
              sendManageMenu(client);
              return;
            }

            updateServer(serverId, { name, target_ip: ip, target_port: port });
            console.log(`[PROXY] Servidor editado (ID ${serverId}): ${name} (${ip}:${port})`);

            // Re-ping para actualizar el estado del servidor editado
            try {
              const pingResult = await bedrock.ping({ host: ip, port: port, timeout: 3000 });
              updateServerStatus(serverId, 1, pingResult.playersOnline);
            } catch (e) {
              updateServerStatus(serverId, 0, 0);
            }

            sendManageMenu(client);

            // ── ELIMINAR: SELECCIÓN DE SERVIDOR ──
          } else if (packet.form_id === DELETE_SELECT_ID) {
            const selectedIndex = parsedData[0]; // Índice del dropdown
            const servers = client._allServersForManage || [];

            if (selectedIndex >= 0 && selectedIndex < servers.length) {
              const server = servers[selectedIndex];
              sendDeleteConfirmForm(client, server);
            } else {
              sendManageMenu(client);
            }

            // ── ELIMINAR: CONFIRMACIÓN ──
          } else if (packet.form_id === DELETE_CONFIRM_ID) {
            const serverId = client._deletingServerId;

            // En formularios 'modal', parsedData es true (button1) o false (button2)
            if (parsedData === true && serverId) {
              const server = getServerById(serverId);
              deleteServer(serverId);
              console.log(`[PROXY] Servidor eliminado (ID ${serverId}): ${server?.name || 'desconocido'}`);
            }

            sendManageMenu(client);

            // ── MENÚ SERVIDORES LOCALES ──
          } else if (packet.form_id === LOCAL_MENU_ID) {
            const selectedIndex = Number(parsedData);
            const localServers = client._localServers || [];
            const lastIndex = localServers.length + 1; // botón "Volver"

            if (selectedIndex === 0) {
              sendCreateLocalServerForm(client);
            } else if (selectedIndex === lastIndex) {
              sendManageMenu(client);
            } else {
              const server = localServers[selectedIndex - 1];
              if (server) sendManageLocalServerForm(client, server);
              else sendLocalMenu(client);
            }

            // ── CREAR SERVIDOR LOCAL ──
          } else if (packet.form_id === CREATE_LOCAL_ID) {
            const nombre    = (parsedData[0] || 'Mi Mundo').trim() || 'Mi Mundo';
            const gamemodeIndex = Number(parsedData[1] ?? 0);
            const gamemode  = gamemodeIndex === 1 ? 'creative' : 'survival';
            const folderName = sanitizeName(nombre);

            const availablePort = findAvailablePort(getAllLocalServers);

            if (!availablePort) {
              sendLocalMenu(client);
              return;
            }

            // Insertar en DB con estado 'iniciando'
            const dbResult = addLocalServer({
              name: nombre,
              puerto: availablePort,
              container_id: 'pending',
              estado: 'iniciando',
              world_folder: folderName,
              gamemode,
            });
            const localServerId = dbResult.lastInsertRowid;

            // Informar al jugador que espere
            sendCreateLocalWaitModal(client, nombre, availablePort);

            // Closure para rastrear el containerId creado (necesario en el catch)
            let createdContainerId = null;

            // Lanzar el contenedor en background (NO bloquea el hilo principal)
            createBedrockServer({
              name: nombre,
              gamemode,
              puerto: availablePort,
              worldFolderName: folderName,
            })
              .then(containerId => {
                createdContainerId = containerId;
                updateLocalServerContainerId(localServerId, containerId);
                console.log(`[PROXY] Contenedor ${containerId.slice(0, 12)} iniciado. Esperando señal de listo...`);
                return waitForContainerReady(containerId).then(() => containerId);
              })
              .then(containerId => {
                updateLocalServerEstado(localServerId, 'activo');
                console.log(`[PROXY] ✅ Servidor "${nombre}" activo en puerto ${availablePort}. Transfiriendo...`);

                // Transferir al jugador al nuevo servidor
                const hostIp = getHostIp();
                try {
                  client.write('transfer', {
                    server_address: hostIp,
                    port: availablePort,
                    reload_world: false,
                  });
                } catch (writeErr) {
                  console.warn('[PROXY] Cliente ya desconectado; no se envió transfer:', writeErr.message);
                }
              })
              .catch(err => {
                console.error(`[PROXY] ❌ Error creando servidor "${nombre}":`, err.message);
                // Limpiar: borrar el registro de la BD Y el contenedor Docker si ya fue creado
                deleteLocalServer(localServerId);
                if (createdContainerId) {
                  removeBedrockServer(createdContainerId)
                    .catch(e => console.warn('[PROXY] No se pudo eliminar contenedor fallido:', e.message));
                }
                try {
                  client.write('modal_form_request', {
                    form_id: LOCAL_MENU_ID,
                    data: JSON.stringify({
                      type: 'modal',
                      title: '\u274C Error al crear servidor',
                      content: `No se pudo crear "${nombre}".\n\nError: ${err.message}\n\nEl slot se ha liberado. Puedes intentarlo de nuevo.`,
                      button1: 'Entendido',
                      button2: '',
                    }),
                  });
                } catch (_) { /* cliente ya desconectado */ }
              });

            // ── MODAL "ESPERA" — solo regresa al menú si el jugador presiona OK ──
          } else if (packet.form_id === CREATE_LOCAL_WAIT_ID) {
            // No hacer nada: el transfer llegará solo cuando el contenedor esté listo

            // ── GESTIONAR SERVIDOR LOCAL ──
          } else if (packet.form_id === MANAGE_LOCAL_ID) {
            const selectedIndex = Number(parsedData);
            const server = client._managingLocalServer;

            if (!server) { sendLocalMenu(client); return; }

            if (selectedIndex === 0) {
              // Conectar
              const hostIp = getHostIp();
              client.write('transfer', {
                server_address: hostIp,
                port: server.puerto,
                reload_world: false,
              });
            } else if (selectedIndex === 1) {
              // Detener — manejo graceful si el container_id es inválido o no existe
              const doStop = () => {
                updateLocalServerEstado(server.id, 'detenido');
                console.log(`[PROXY] \u23F9  Servidor "${server.name}" marcado como detenido.`);
                sendLocalMenu(client);
              };
              if (!server.container_id || server.container_id === 'pending') {
                doStop();
              } else {
                stopBedrockServer(server.container_id)
                  .then(doStop)
                  .catch(err => {
                    // 404 = el contenedor ya no existe, actualizamos DB de todas formas
                    if (err.statusCode === 404) {
                      doStop();
                    } else {
                      console.error('[PROXY] Error deteniendo servidor:', err.message);
                      sendLocalMenu(client);
                    }
                  });
              }
            } else if (selectedIndex === 2) {
              // Eliminar (confirmar)
              sendDeleteLocalConfirmForm(client, server);
            } else {
              // Volver
              sendLocalMenu(client);
            }

            // ── CONFIRMAR ELIMINACIÓN DE SERVIDOR LOCAL ──
          } else if (packet.form_id === DELETE_LOCAL_CONFIRM_ID) {
            const cachedServer = client._deletingLocalServer;

            if (parsedData === true && cachedServer) {
              // Obtener datos frescos de la BD para evitar container_id obsoleto
              const server = getLocalServerById(cachedServer.id) || cachedServer;

              const doDeleteDb = () => {
                deleteLocalServer(server.id);
                console.log(`[PROXY] \uD83D\uDDD1\uFE0F  Servidor local "${server.name}" eliminado de la BD (mundo conservado).`);
                sendLocalMenu(client);
              };

              // Si el container_id no es válido, borrar solo de la BD
              if (!server.container_id || server.container_id === 'pending') {
                doDeleteDb();
              } else {
                // Intentar eliminar el contenedor; la BD se limpia siempre al final
                removeBedrockServer(server.container_id)
                  .catch(err => {
                    // Cualquier error de Docker se registra pero NO bloquea la limpieza de la BD
                    console.warn(`[PROXY] \u26A0\uFE0F Error al eliminar contenedor (se limpiará de todos modos): ${err.message}`);
                  })
                  .finally(doDeleteDb);
                return; // sendLocalMenu se llama dentro de doDeleteDb (vía finally)
              }
            } else {
              sendLocalMenu(client);
            }
          }

        } catch (error) {
          console.error('[PROXY] Error en formulario:', error);
        }
      });
    });
  });

  server.on('error', (error) => {
    console.error('[PROXY] Error en el servidor:', error);
  });
}

module.exports = {
  startProxy,
};