const fs = require('fs');
const path = require('path');

const startGame = JSON.parse(fs.readFileSync(path.join(__dirname, '../generated_start_game.json'), 'utf8'));
const otherPackets = JSON.parse(fs.readFileSync(path.join(__dirname, '../generated_packets.json'), 'utf8'));

module.exports = {
  startGame,
  creativeContent: otherPackets.creative_content,
  biomeDefinitionList: otherPackets.biome_definition_list
};
