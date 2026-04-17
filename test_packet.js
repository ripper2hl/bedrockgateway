const { createSerializer } = require('bedrock-protocol/src/transforms/serializer');
const serializer = createSerializer('1.21.90');
try {
  const buf = serializer.createPacketBuffer({
    name: 'resource_packs_info',
    params: {
        must_accept: false,
        has_addons: false,
        has_scripts: false,
        disable_vibrant_visuals: false,
        force_server_packs: false,
        behavior_packs: [],
        texture_packs: [],
        world_template: {
          uuid: '00000000-0000-0000-0000-000000000000',
          version: '*'
        }
    }
  });
  console.log("Success info!");
} catch(e) {
  console.error("Error info:", e);
}

try {
  const buf2 = serializer.createPacketBuffer({
    name: 'resource_pack_stack',
    params: {
        must_accept: false,
        behavior_packs: [],
        resource_packs: [],
        game_version: '*',
        experiments: [],
        experiments_previously_used: false
    }
  });
  console.log("Success stack!");
} catch(e) {
  console.error("Error stack:", e);
}
