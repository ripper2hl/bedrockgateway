const mcData = require('minecraft-data')('bedrock_1.21.90');

function generateDefaultValue(typeInfo) {
  if (!typeInfo) return null;
  if (typeof typeInfo === 'string') {
    if (typeInfo === 'bool') return false;
    if (typeInfo === 'i8' || typeInfo === 'u8' || typeInfo === 'i16' || typeInfo === 'u16' || typeInfo === 'i32' || typeInfo === 'u32' || typeInfo === 'varint' || typeInfo === 'zigzag32' || typeInfo === 'li32' || typeInfo === 'lu32') return 0;
    if (typeInfo === 'i64' || typeInfo === 'u64' || typeInfo === 'zigzag64' || typeInfo === 'li64' || typeInfo === 'lu64' || typeInfo === 'varint64') return "0";
    if (typeInfo === 'f32' || typeInfo === 'lf32') return 0.0;
    if (typeInfo === 'string') return '';
    if (typeInfo === 'uuid') return '00000000-0000-0000-0000-000000000000';
    if (typeInfo === 'nbt') return { type: 'compound', name: '', value: {} };
    if (mcData.protocol.types[typeInfo]) return generateDefaultValue(mcData.protocol.types[typeInfo]);
    return null;
  }
  
  if (Array.isArray(typeInfo)) {
    if (typeInfo[0] === 'container') {
      const obj = {};
      for (const field of typeInfo[1]) {
        if (!field.anon) {
          obj[field.name] = generateDefaultValue(field.type);
        }
      }
      return obj;
    }
    if (typeInfo[0] === 'array') {
      return [];
    }
    if (typeInfo[0] === 'mapper') {
      return typeInfo[1].typeMap ? Object.values(typeInfo[1].typeMap)[0] : 0;
    }
    if (typeInfo[0] === 'switch') {
      return generateDefaultValue(typeInfo[1].default || (typeInfo[1].fields ? typeInfo[1].fields[Object.keys(typeInfo[1].fields)[0]] : null));
    }
    if (typeInfo[0] === 'buffer') {
      return Buffer.alloc(0);
    }
  }
  return null;
}

const startGameType = mcData.protocol.types.packet_start_game;
const obj = generateDefaultValue(startGameType);

// Overrides
obj.entity_id = "1";
obj.runtime_entity_id = "1";
obj.player_gamemode = 0;
obj.player_position = { x: 0, y: 64, z: 0 };
obj.rotation = { x: 0, y: 0, z: 0 };
obj.seed = "0";
obj.dimension = 2;
obj.generator = 1;
obj.world_gamemode = 0;
obj.difficulty = 0;
obj.spawn_position = { x: 0, y: 64, z: 0 };
obj.game_rules = [];
obj.experiments = [];
obj.itemstates = [];

const stringifyBigInts = (o) => JSON.stringify(o, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);

const fs = require('fs');
fs.writeFileSync('generated_start_game.json', stringifyBigInts(obj));

const { createSerializer } = require('bedrock-protocol/src/transforms/serializer');
const serializer = createSerializer('1.21.90');
try {
  serializer.createPacketBuffer({
    name: 'start_game',
    params: obj
  });
  console.log("Success!");
} catch(e) {
  console.error("Error:", e);
}

