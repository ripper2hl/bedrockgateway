const bedrock = require('bedrock-protocol');
const fs = require('fs');

const client = bedrock.createClient({
  host: 'mco.cubecraft.net',
  port: 19132,
  username: 'ProxyDumper123',
  offline: true // We can't authenticate, maybe cubecraft kicks us, but we might get start_game first
});

client.on('start_game', (packet) => {
  console.log("Got start_game! Saving...");
  
  // We need to handle bigints because JSON.stringify crashes on bigints
  const stringifyBigInts = (obj) => {
    return JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  };
  
  fs.writeFileSync('start_game_dump.json', stringifyBigInts(packet));
  console.log("Saved to start_game_dump.json");
  client.close();
  process.exit(0);
});

client.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
