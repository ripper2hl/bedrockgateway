const bedrock = require('bedrock-protocol');
const { ServerAdvertisement } = require('bedrock-protocol');
const { getAllServers } = require('../database/sqliteConfig');

function startProxy(host, port) {
  // Arranca el servidor
  const server = new bedrock.Server({
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

  server.on('client', (client) => {
    console.log('🔥 CONEXIÓN RAW');
    console.log('[PROXY] Jugador conectado desde:', client.address?.address || 'desconocido');

    // 🔥 PATCH DEFINITIVO V3: Interceptamos el paquete 'login' ANTES que la librería
    client.prependListener('login', (packet) => {
      try {
        // Leemos la identidad tal cual nos la mandó el jugador
        let identityObj = JSON.parse(packet.tokens.identity);
        
        // Verificamos si tiene el formato "envuelto" de las consolas (Switch/Xbox)
        if (identityObj && identityObj.Certificate) {
          console.log('[PROXY] 🛠️ Desenvolviendo AuthChain de Consola (Nintendo Switch detectado)');
          // Sobrescribimos el payload original con el certificado real (que contiene el 'chain')
          // Esto engaña a la librería para que lo procese como un cliente normal (celular/PC).
          packet.tokens.identity = identityObj.Certificate;
        }
      } catch (err) {
        // Si no se puede parsear, es porque ya es un formato normal o hubo un error.
        // Lo dejamos pasar silenciosamente.
      }
    });

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