const dns2 = require('dns2');

const { Packet } = dns2;
const resolveA = dns2.UDPClient({ dns: '1.1.1.1', port: 53 });

/**
 * Inicia el servidor DNS local que intercepta dominios de Bedrock y reenvía el resto.
 *
 * @param {string} localIp Dirección IP local que se devolverá para dominios interceptados.
 */
function startDns(localIp) {
  const server = dns2.createServer({ udp: true });

  server.on('request', async (request, response) => {
    const question = request.questions[0];
    const domain = question && question.name ? question.name.toLowerCase() : '';

    if (!domain) {
      return;
    }

    const isIntercepted = domain.includes('cubecraft.net') || domain.includes('hivebedrock.network');

    if (isIntercepted) {
      console.log(`[DNS] [Interceptado] ${domain} -> ${localIp}`);
      response.answers.push({
        name: domain,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 60,
        address: localIp,
      });
    } else {
      console.log(`[DNS] [Reenviado] ${domain} -> 1.1.1.1`);

      try {
        const upstream = await resolveA(domain);
        response.answers = upstream.answers || [];
        response.authorities = upstream.authorities || [];
        response.additionals = upstream.additionals || [];
        response.header.rcode = upstream.header.rcode;
      } catch (error) {
        console.error(`[DNS] Error reenviando ${domain}:`, error.message || error);
        response.header.rcode = Packet.RCODE.SERVFAIL;
      }
    }

    return response;
  });

  server.on('listening', () => {
    console.log('DNS Server escuchando en el puerto 53');
  });

  server.on('error', (error) => {
    console.error('[DNS] Error en el servidor DNS:', error);
  });

  server.listen(53);
}

module.exports = {
  startDns,
};
