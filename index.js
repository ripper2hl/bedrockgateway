const os = require('os');
const { startDns } = require('./dns/dnsForwarder');
const { startApi } = require('./api/expressServer');
const { startProxy } = require('./proxy/bedrockProxy');

function getLocalIp() {
  // 1. Si el usuario inyecta la IP en Docker (ej. -e HOST_IP=192.168.x.x), usar esa
  if (process.env.HOST_IP) return process.env.HOST_IP;
  
  // 2. Si no, detectarla automáticamente leyendo las interfaces de red
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignorar localhost y buscar solo IPv4
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback final genérico (localhost)
}

const API_PORT = process.env.API_PORT || 3000;
const PROXY_PORT = process.env.PROXY_PORT || 19132;
const LOCAL_IP = getLocalIp();

console.log('🚀 BedrockGateway Iniciado');
console.log(`📡 IP Pública/Local detectada para DNS: ${LOCAL_IP}`);

startDns(LOCAL_IP);
startApi(API_PORT);
// Siempre debemos escuchar en 0.0.0.0 para que Docker no bloquee las conexiones externas
startProxy('0.0.0.0', PROXY_PORT);

process.on('uncaughtException', (error) => {
  console.error('[GLOBAL] uncaughtException:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[GLOBAL] unhandledRejection:', reason);
});
