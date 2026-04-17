const dns2 = require('dns2');

const { Packet } = dns2;
const resolveA = dns2.UDPClient({ dns: '8.8.8.8', port: 53 });

/**
 * Inicia el servidor DNS local que intercepta dominios de Bedrock y reenvía el resto.
 *
 * @param {string} localIp Dirección IP local que se devolverá para dominios interceptados.
 */
function startDns(localIp) {
  const server = dns2.createServer({
    udp: true,
    // Usamos 'handle' como dicta la documentación oficial
    handle: async (request, send, rinfo) => {
      // 1. Creamos un objeto de respuesta legítimo basado en la petición
      const response = Packet.createResponseFromRequest(request);
      
      const question = request.questions[0];
      const domain = question && question.name ? question.name.toLowerCase() : '';

      if (!domain) {
        return send(response);
      }

      const isIntercepted = domain.includes('cubecraft.net') || domain.includes('hivebedrock.network');

      if (isIntercepted) {
        console.log(`[DNS] [Interceptado] ${domain} -> ${localIp}`);
        // 2. Ahora sí, answers existe y podemos hacer push
        response.answers.push({
          name: domain,
          type: Packet.TYPE.A,
          class: Packet.CLASS.IN,
          ttl: 60,
          address: localIp,
        });
        
        // 3. Enviamos la respuesta usando la función callback
        send(response);
      } else {
        try {
          const upstream = await resolveA(domain);
          response.answers = upstream.answers || [];
          response.authorities = upstream.authorities || [];
          response.additionals = upstream.additionals || [];
          response.header.rcode = upstream.header.rcode;
          send(response);
        } catch (error) {
          console.error(`[DNS] Error reenviando ${domain}:`, error.message || error);
          response.header.rcode = Packet.RCODE.SERVFAIL;
          send(response);
        }
      }
    }
  });

  server.on('listening', () => {
    console.log('DNS Server escuchando en el puerto 53');
  });

  server.on('error', (error) => {
    console.error('[DNS] Error en el servidor DNS:', error);
  });
  
  server.listen({
    udp: {
      port: 53,
      address: localIp,
      type: 'udp4'
    }
  });
}

module.exports = {
  startDns,
};