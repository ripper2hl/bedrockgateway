const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const { getAllServers, addServer, getServerById, updateServer, deleteServer, updateServerStatus } = require('../database/sqliteConfig');
const dummyPackets = require('./dummyPackets');

// IDs de formularios
const MAIN_MENU_ID = 1000;
const ADD_SERVER_ID = 1001;
const DIRECT_CONNECT_ID = 1002;
const MANAGE_MENU_ID = 1003;
const EDIT_SELECT_ID = 1004;
const EDIT_SERVER_ID = 1005;
const DELETE_SELECT_ID = 1006;
const DELETE_CONFIRM_ID = 1007;

// ─── FORMULARIOS DE UI ───────────────────────────────────────────────────────

function sendMainMenu(client) {
  const allServers = getAllServers();
  // Filtrar solo los servidores online para el menú
  const onlineServers = allServers.filter(s => s.online_status === 1);

  const buttons = [
    { text: "Conexión Directa\n(Escribir IP)" },
    { text: "Administrar Servidores\n⚙️ Agregar, Editar, Eliminar" }
  ];

  for (const server of onlineServers) {
    buttons.push({ text: `${server.name}\n🟢 ${server.players_online} Jugadores` });
  }

  // Guardamos la lista filtrada en el cliente para que la respuesta del formulario
  // use el mismo índice que los botones mostrados.
  client._onlineServers = onlineServers;

  const formPayload = {
    type: 'form',
    title: 'BedrockGateway',
    content: 'Selecciona una opción o un servidor:',
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
    content: 'Selecciona una acción:',
    buttons: [
      { text: "➕ Agregar Servidor" },
      { text: "✏️ Editar Servidor" },
      { text: "🗑️ Eliminar Servidor" },
      { text: "⬅️ Volver al Menú" }
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
    const status = s.online_status === 1 ? '🟢' : '🔴';
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
          } catch (e) {}
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
          } catch (e) {}
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
          } catch(e) {
            console.error('[PROXY] Error enviando start_game:', e.message);
          }

          // 2. Enviamos el CreativeContent y BiomeDefinitionList (necesarios)
          try {
            client.write('creative_content', dummyPackets.creativeContent);
            client.write('biome_definition_list', dummyPackets.biomeDefinitionList);
            client.write('play_status', { status: 'player_spawn' });
          } catch(e) {
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
              // Es un servidor de la lista (usamos la misma lista filtrada que se mostró en el menú)
              const onlineServers = client._onlineServers || [];
              const serverIndex = selectedIndex - 2; // Descontamos los 2 primeros botones

              if (serverIndex >= 0 && serverIndex < onlineServers.length) {
                const selectedServer = onlineServers[serverIndex];
                console.log(`[PROXY] Transfiriendo a ${selectedServer.name} -> ${selectedServer.target_ip}:${selectedServer.target_port}`);

                client.write('transfer', {
                  server_address: selectedServer.target_ip,
                  port: Number(selectedServer.target_port),
                  reload_world: false
                });
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