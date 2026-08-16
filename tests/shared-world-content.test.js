const fs = require('node:fs');
const path = require('node:path');
const { CAMPAIGN_PLAYER_RADIUS, CAMPAIGN_ROOM_GEOMETRY } = require('../js/simulation/SharedWorldContent');
const { CAMPAIGN_ROOM, createCampaignPlayer } = require('../js/simulation/CampaignSimulation');
const { TEST_ROOM } = require('../js/multiplayer/LocalMultiplayerSession');

describe('shared campaign world content', () => {
  test('all authorities and the browser use one physical room geometry', () => {
    expect(CAMPAIGN_ROOM_GEOMETRY).toEqual({ width: 900, height: 700, wallThickness: 28, doorWidth: 140 });
    expect(CAMPAIGN_ROOM).toEqual(expect.objectContaining(CAMPAIGN_ROOM_GEOMETRY));
    expect(TEST_ROOM).toEqual(expect.objectContaining(CAMPAIGN_ROOM_GEOMETRY));

    const browserCore = fs.readFileSync(path.join(__dirname, '../js/core/game-core.js'), 'utf8');
    const campaign = fs.readFileSync(path.join(__dirname, '../js/simulation/CampaignSimulation.js'), 'utf8');
    const session = fs.readFileSync(path.join(__dirname, '../js/multiplayer/LocalMultiplayerSession.js'), 'utf8');
    expect(browserCore).toContain('CAMPAIGN_ROOM_GEOMETRY');
    expect(campaign).not.toContain('width: 900, height: 700');
    expect(session).not.toContain('width: 900, height: 700');
  });

  test('campaign and multiplayer authorities share the player collision and render radius', () => {
    expect(CAMPAIGN_PLAYER_RADIUS).toBe(14);
    expect(createCampaignPlayer({ id: 'p1' }).radius).toBe(CAMPAIGN_PLAYER_RADIUS);

    const browserState = fs.readFileSync(path.join(__dirname, '../js/core/game-state.js'), 'utf8');
    const session = fs.readFileSync(path.join(__dirname, '../js/multiplayer/LocalMultiplayerSession.js'), 'utf8');
    expect(browserState).toContain('CAMPAIGN_PLAYER_RADIUS');
    expect(session).toContain('radius: CAMPAIGN_PLAYER_RADIUS');
    expect(session).not.toContain('radius: 18');
  });

  test('network presentation synchronizes the same camera consumed by Neo.draw', () => {
    const view = fs.readFileSync(path.join(__dirname, '../js/rendering/NetworkGameView.js'), 'utf8');
    expect(view).toContain('this.neo.camera.x = this.camera.x;');
    expect(view).toContain('this.neo.camera.y = this.camera.y;');
  });
});
