/**
 * Paquetes mínimos para crear un "Limbo World" en Bedrock.
 *
 * Estos paquetes engañan a la consola para que crea que está en un mundo real,
 * permitiéndonos inyectar formularios nativos (modal_form_request) sin necesidad
 * de generar chunks, biomas, ni nada pesado.
 *
 * Solo necesitamos: start_game + creative_content + biome_definition_list + play_status.
 * Todos los valores son los mínimos que el cliente acepta sin crashear.
 */

const startGame = {
  entity_id: '1',
  runtime_entity_id: '1',
  player_gamemode: 0,
  player_position: { x: 0, y: 64, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  seed: '0',
  biome_type: null,
  biome_name: '',
  dimension: 2,        // The End (evita que el cliente intente cargar terreno)
  generator: 1,        // Flat
  world_gamemode: 0,
  hardcore: false,
  difficulty: 0,
  spawn_position: { x: 0, y: 64, z: 0 },
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
  is_multiplayer: false,
  broadcast_to_lan: false,
  xbox_live_broadcast_mode: 0,
  platform_broadcast_mode: 0,
  enable_commands: false,
  is_texturepacks_required: false,
  gamerules: [],
  experiments: [],
  experiments_previously_used: false,
  bonus_chest: false,
  map_enabled: false,
  permission_level: 0,
  server_chunk_tick_range: 0,
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
  game_version: '',
  limited_world_width: 0,
  limited_world_length: 0,
  is_new_nether: false,
  edu_resource_uri: { button_name: '', link_uri: '' },
  experimental_gameplay_override: false,
  chat_restriction_level: 0,
  disable_player_interactions: false,
  server_identifier: '',
  world_identifier: '',
  scenario_identifier: '',
  owner_identifier: '',
  level_id: '',
  world_name: '',
  premium_world_template_id: '',
  is_trial: false,
  rewind_history_size: 0,
  server_authoritative_block_breaking: false,
  current_tick: '0',
  enchantment_seed: 0,
  block_properties: [],
  multiplayer_correlation_id: '',
  server_authoritative_inventory: false,
  engine: '',
  property_data: { type: 'compound', name: '', value: {} },
  block_pallette_checksum: '0',
  world_template_id: '00000000-0000-0000-0000-000000000000',
  client_side_generation: false,
  block_network_ids_are_hashes: false,
  server_controlled_sound: false,
  game_rules: [],
  itemstates: [],
};

const creativeContent = {
  groups: [],
  items: [],
};

const biomeDefinitionList = {
  biome_definitions: [],
  string_list: [],
};

module.exports = {
  startGame,
  creativeContent,
  biomeDefinitionList,
};
