const bedrock = require('bedrock-protocol');
const { getAllServers } = require('../database/sqliteConfig');

function startProxy(host, port) {
  // Arranca el servidor
  const server = bedrock.createServer({ host, port });
  
  // Imprimimos la confirmación al instante. (Ignora el -1 de RakNet si sale)
  console.log(`[PROXY] ✅ Bedrock Proxy vivo y escuchando en el puerto ${port}`);

  server.on('client', (client) => {
    console.log('[PROXY] Jugador conectado desde:', client.socket?.remoteAddress || 'desconocido');

    client.on('join', async () => {
      console.log('[PROXY] Jugador cargó el mundo, preparando selección de servidor');

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
            console.error('[PROXY] Selección de servidor inválida:', packet.payload);
            return;
          }

          const selectedServer = servers[selectedIndex];

          console.log(
            `[PROXY] Transferir jugador a ${selectedServer.name} -> ${selectedServer.target_ip}:${selectedServer.target_port}`
          );

          client.write('transfer', {
            server_address: selectedServer.target_ip,
            port: selectedServer.target_port,
          });
        } catch (error) {
          console.error('[PROXY] Error procesando respuesta del formulario:', error);
        }
      });
    });
  });

  server.on('error', (error) => {
    console.error('[PROXY] Error real en el proxy Bedrock:', error);
  });
}

module.exports = {
  startProxy,
};