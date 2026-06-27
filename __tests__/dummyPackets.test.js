'use strict';

/**
 * Tests unitarios — proxy/dummyPackets.js
 *
 * Verifica que los objetos exportados existan y tengan la estructura
 * mínima que el cliente de Minecraft Bedrock espera.
 */

const dummyPackets = require('../proxy/dummyPackets');

// ─── Exports ──────────────────────────────────────────────────────────────────

describe('dummyPackets — exports', () => {
  test('exporta startGame', () => expect(dummyPackets.startGame).toBeDefined());
  test('exporta creativeContent', () => expect(dummyPackets.creativeContent).toBeDefined());
  test('exporta biomeDefinitionList', () => expect(dummyPackets.biomeDefinitionList).toBeDefined());
});

// ─── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
  const { startGame } = dummyPackets;

  test('es un objeto (no null, no array)', () => {
    expect(startGame).not.toBeNull();
    expect(typeof startGame).toBe('object');
    expect(Array.isArray(startGame)).toBe(false);
  });

  const requiredFields = [
    'entity_id', 'runtime_entity_id', 'player_gamemode',
    'player_position', 'rotation', 'seed',
    'dimension', 'generator', 'world_gamemode',
    'difficulty', 'spawn_position', 'gamerules',
    'experiments', 'game_version', 'level_id', 'world_name',
  ];

  test.each(requiredFields)('contiene el campo requerido "%s"', (field) => {
    expect(startGame).toHaveProperty(field);
  });

  test('player_position tiene coordenadas x, y, z', () => {
    const { player_position } = startGame;
    expect(player_position).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    });
  });

  test('gamerules es un arreglo', () => {
    expect(Array.isArray(startGame.gamerules)).toBe(true);
  });

  test('experiments es un arreglo', () => {
    expect(Array.isArray(startGame.experiments)).toBe(true);
  });

  test('dimension es un número (0=Overworld, 1=Nether, 2=End)', () => {
    expect(typeof startGame.dimension).toBe('number');
    expect([0, 1, 2]).toContain(startGame.dimension);
  });

  test('hardcore es booleano', () => {
    expect(typeof startGame.hardcore).toBe('boolean');
  });
});

// ─── creativeContent ──────────────────────────────────────────────────────────

describe('creativeContent', () => {
  const { creativeContent } = dummyPackets;

  test('contiene el campo "groups" como arreglo', () => {
    expect(Array.isArray(creativeContent.groups)).toBe(true);
  });

  test('contiene el campo "items" como arreglo', () => {
    expect(Array.isArray(creativeContent.items)).toBe(true);
  });
});

// ─── biomeDefinitionList ──────────────────────────────────────────────────────

describe('biomeDefinitionList', () => {
  const { biomeDefinitionList } = dummyPackets;

  test('contiene "biome_definitions" como arreglo', () => {
    expect(Array.isArray(biomeDefinitionList.biome_definitions)).toBe(true);
  });

  test('contiene "string_list" como arreglo', () => {
    expect(Array.isArray(biomeDefinitionList.string_list)).toBe(true);
  });
});
