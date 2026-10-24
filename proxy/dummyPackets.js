/**
 * Paquetes mínimos para crear un "Limbo World" en Bedrock.
 *
 * Basado en la especificación y comportamiento oficial de BedrockConnect 26.50
 * para compatibilidad total con consolas (Nintendo Switch, Xbox, PlayStation)
 * en Minecraft Bedrock 1.26.50+.
 */

const startGame = {
  entity_id: '1',
  runtime_entity_id: '1',
  player_gamemode: 0,
  player_position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, z: 0 },
  seed: '0',
  biome_type: 0,
  biome_name: '',
  dimension: 0,        // Overworld (BedrockConnect 26.50)
  generator: 1,        // Flat
  world_gamemode: 0,
  hardcore: false,
  difficulty: 1,
  spawn_position: { x: 0, y: 0, z: 0 },
  achievements_disabled: false,
  editor_world_type: 0,
  created_in_editor: false,
  exported_from_editor: false,
  day_cycle_stop_time: 0,
  edu_offer: 0,
  edu_features_enabled: false,
  edu_product_uuid: '',
  rain_level: 0,
  lightning_level: 0,
  has_confirmed_platform_locked_content: false,
  is_multiplayer: true,
  broadcast_to_lan: true,
  xbox_live_broadcast_mode: 0,
  platform_broadcast_mode: 0,
  enable_commands: true,
  is_texturepacks_required: false,
  gamerules: [{ name: 'showcoordinates', editable: true, type: 'bool', value: false }],
  experiments: [],
  experiments_previously_used: false,
  bonus_chest: false,
  map_enabled: false,
  permission_level: 1, // Member
  server_chunk_tick_range: 4,
  has_locked_behavior_pack: false,
  has_locked_resource_pack: false,
  is_from_locked_world_template: false,
  msa_gamertags_only: false,
  is_from_world_template: false,
  is_world_template_option_locked: false,
  only_spawn_v1_villagers: false,
  persona_disabled: false,
  custom_skins_disabled: false,
  emote_chat_muted: false,
  game_version: '*',
  limited_world_width: 0,
  limited_world_length: 0,
  is_new_nether: false,
  edu_resource_uri: { button_name: '', link_uri: '' },
  experimental_gameplay_override: false,
  chat_restriction_level: 0,
  disable_player_interactions: false,
  server_editor_connection_policy: 0,
  allow_anonymous_block_drops_in_editor_worlds: false,
  level_id: 'world',
  world_name: 'world',
  premium_world_template_id: '00000000-0000-0000-0000-000000000000',
  is_trial: false,
  movement_authority: 2,
  rewind_history_size: 0,
  server_authoritative_block_breaking: true,
  current_tick: '0',
  enchantment_seed: 0,
  block_properties: [],
  itemstates: [],
  multiplayer_correlation_id: '',
  server_authoritative_inventory: true,
  engine: '',
  property_data: { type: 'compound', name: '', value: {} },
  block_pallette_checksum: '0',
  world_template_id: '00000000-0000-0000-0000-000000000000',
  client_side_generation: false,
  block_network_ids_are_hashes: false,
  server_controlled_sound: false,
  has_server_join_info: false,
  server_join_info: undefined,
  server_identifier: '',
  scenario_identifier: '',
  world_identifier: '',
  owner_identifier: ''
};

const creativeContent = {
  groups: [],
  items: [],
};

const jigsawStructureData = {
  structure_data: {
    type: 'compound',
    name: '',
    value: {
      processors: { type: 'list', value: { type: 'end', value: [] } },
      template_pools: { type: 'list', value: { type: 'end', value: [] } },
      jigsaws: { type: 'list', value: { type: 'end', value: [] } },
      structure_sets: { type: 'list', value: { type: 'end', value: [] } }
    }
  }
};

const voxelShapes = {
  shapes: [],
  name_map: [],
  custom_shape_count: 0
};

const itemComponent = {
  entries: []
};

const biomeDefinitionList = {
  biome_definitions: [],
  string_list: [],
};

// 258 bytes ceros (biomas + borde + extra) + 1 byte 0x00 (TAG_End nbt vacío)
const emptyChunkPayload = Buffer.alloc(259);

module.exports = {
  startGame,
  creativeContent,
  biomeDefinitionList,
  jigsawStructureData,
  voxelShapes,
  itemComponent,
  emptyChunkPayload,
};
