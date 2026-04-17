const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const { getAllServers } = require('../database/sqliteConfig');

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
      console.log('[PROXY] Jugador en el mundo. Enviando formulario...');

      const servers = getAllServers();
      const buttons = servers.map((server) => ({ text: server.name }));
      const formId = Math.floor(Math.random() * 1e6);

      const formPayload = {
        type: 'form',
        title: 'BedrockGateway',
        content: 'Selecciona el servidor al que deseas conectarte:',
        buttons,
      };

      client.write('modal_form_request', {
        form_id: formId,
        payload: JSON.stringify(formPayload),
      });

      client.on('modal_form_response', (packet) => {
        try {
          const selectedIndex = Number(JSON.parse(packet.payload));

          if (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= servers.length) {
            console.error('[PROXY] Selección inválida:', packet.payload);
            return;
          }

          const selectedServer = servers[selectedIndex];
          console.log(`[PROXY] Transfiriendo a ${selectedServer.name} -> ${selectedServer.target_ip}:${selectedServer.target_port}`);

          client.write('transfer', {
            server_address: selectedServer.target_ip,
            port: selectedServer.target_port,
          });
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