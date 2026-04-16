const { startDns } = require('./dns/dnsForwarder');
const { startApi } = require('./api/expressServer');

const API_PORT = 3000;
const LOCAL_IP = '192.168.1.100'; // Cambia esta IP por la IP real de tu máquina.

console.log('🚀 BedrockGateway Iniciado');

startDns(LOCAL_IP);
startApi(API_PORT);

process.on('uncaughtException', (error) => {
  console.error('[GLOBAL] uncaughtException:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[GLOBAL] unhandledRejection:', reason);
});
