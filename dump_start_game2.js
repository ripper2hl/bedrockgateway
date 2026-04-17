const bedrock = require('bedrock-protocol');
const fs = require('fs');

const client = bedrock.createClient({
  host: 'mco.cubecraft.net',
  port: 19132,
  username: 'ProxyDumper123',
  profilesFolder: './profiles'
});

client.on('start_game', (packet) => {
  console.log("Got start_game! Saving...");
  
  const stringifyBigInts = (obj) => {
    return JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  };
  
  fs.writeFileSync('start_game_dump.json', stringifyBigInts(packet));
  console.log("Saved to start_game_dump.json");
  process.exit(0);
});
