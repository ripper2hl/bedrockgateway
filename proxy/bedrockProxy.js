const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const { getAllServers, addServer, updateServerStatus } = require('../database/sqliteConfig');
const dummyPackets = require('./dummyPackets');

const MAIN_MENU_ID = 1000;
const ADD_SERVER_ID = 1001;
const DIRECT_CONNECT_ID = 1002;

function sendMainMenu(client) {
  const allServers = getAllServers();
  // Filtrar solo los servidores online para el menú
  const onlineServers = allServers.filter(s => s.online_status === 1);

  const buttons = [
    { text: "Conexión Directa\n(Escribir IP)" },
    { text: "Añadir Servidor\n(Guardar en lista)" }
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

// Tarea recurrente para actualizar el estado de los servidores en 2do plano
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

function sendAddServerForm(client, isDirectConnect = false) {
  const formPayload = {
    type: 'custom_form',
    title: isDirectConnect ? 'Conexión Directa' : 'Añadir Servidor',
    content: [
      { type: 'input', text: 'Nombre del Servidor (Opcional)', placeholder: 'Mi Servidor', default: '' },
      { type: 'input', text: 'Dirección IP', placeholder: 'play.ejemplo.com', default: '' },
      { type: 'input', text: 'Puerto', placeholder: '19132', default: '19132' }
    ]
  };

  client.write('modal_form_request', {
    form_id: isDirectConnect ? DIRECT_CONNECT_ID : ADD_SERVER_ID,
    data: JSON.stringify(formPayload),
  });
}

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

      client.on('modal_form_response', (packet) => {
        try {
          if (!packet.has_response_data) {
            // El usuario cerró el formulario (presionó B o la X)
            // Le volvemos a mandar el menú principal para que no se quede atrapado
            sendMainMenu(client);
            return;
          }

          const parsedData = JSON.parse(packet.data);

          if (packet.form_id === MAIN_MENU_ID) {
            const selectedIndex = Number(parsedData);
            
            if (selectedIndex === 0) {
              sendAddServerForm(client, true); // Conexión directa
            } else if (selectedIndex === 1) {
              sendAddServerForm(client, false); // Añadir servidor
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
          } else if (packet.form_id === ADD_SERVER_ID || packet.form_id === DIRECT_CONNECT_ID) {
            // parsedData es un array con las respuestas de los inputs: [nombre, ip, puerto]
            const name = parsedData[0] || 'Servidor Personalizado';
            const ip = parsedData[1];
            const port = Number(parsedData[2]) || 19132;

            if (!ip || ip.trim() === '') {
              // IP inválida, regresar al menú
              sendMainMenu(client);
              return;
            }

            if (packet.form_id === ADD_SERVER_ID) {
              // Guardar en la base de datos
              addServer({ name, target_ip: ip, target_port: port });
              console.log(`[PROXY] Servidor añadido: ${name} (${ip}:${port})`);
              // Volver al menú principal para que vea su nuevo servidor
              sendMainMenu(client);
            } else {
              // Conexión Directa
              console.log(`[PROXY] Conexión Directa a ${ip}:${port}`);
              client.write('transfer', {
                server_address: ip,
                port: port,
                reload_world: false
              });
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