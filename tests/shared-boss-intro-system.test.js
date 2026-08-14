const fs = require('fs');
const path = require('path');
const { resolveCampaignBossIntro } = require('../js/simulation/SharedBossIntroSystem');
const { announceAuthorityBossIntro } = require('../js/simulation/NetworkCombatSystem');

describe('shared boss intro system', () => {
  test('selects the authored character scene before the generic opening', () => {
    expect(resolveCampaignBossIntro({
      enemyType: 'queen_cult', characterKeys: ['thorn_knight', 'metao'], playedKeys: [],
    })).toEqual({
      key: 'queen_metao',
      lines: [
        { speaker: 'QUEEN', text: 'once my champion planning to kill me again are you apostate' },
        { speaker: 'METAO', text: '...' },
        { speaker: 'QUEEN', text: 'Your life will be mine !' },
      ],
    });
  });

  test('falls through to the authored generic line only when a character scene is unavailable or played', () => {
    expect(resolveCampaignBossIntro({
      enemyType: 'artificer_knave', characterKey: 'thorn_knight', playedKeys: ['knave_knight'],
    })).toEqual({
      key: 'generic_artificer_knave',
      lines: [{ speaker: 'ARTIFICER KNAVE', text: 'Run. I only need one clean hit.' }],
    });
    expect(resolveCampaignBossIntro({ enemyType: 'god', characterKey: 'thorn_knight' })).toBeNull();
  });

  test('authority persists and broadcasts a party-selected intro exactly once', () => {
    const state = {
      tick: 48,
      floorState: {},
      players: {
        thorn: { id: 'thorn', roomId: 'boss-room', characterKey: 'thorn_knight', disconnected: false },
        metao: { id: 'metao', roomId: 'boss-room', characterKey: 'metao', disconnected: false },
      },
    };
    const enemy = { id: 'queen', type: 'queen_cult', roomId: 'boss-room', boss: true, attackCd: 0, stun: 0 };
    const events = [];
    const first = announceAuthorityBossIntro(state, enemy, (eventType, data) => events.push({ eventType, data }));
    const second = announceAuthorityBossIntro(state, enemy, (eventType, data) => events.push({ eventType, data }));

    expect(first?.key).toBe('queen_metao');
    expect(second).toBeNull();
    expect(enemy.bossIntro).toEqual({ key: 'queen_metao', startedTick: 48 });
    expect(enemy.attackCd).toBe(1.4);
    expect(enemy.stun).toBe(0.25);
    expect(events).toEqual([
      expect.objectContaining({ eventType: 'BOSS_INTRO', data: expect.objectContaining({ introKey: 'queen_metao' }) }),
    ]);
  });

  test('campaign, authority, and network view all consume the shared intro policy', () => {
    const enemies = fs.readFileSync(path.join(__dirname, '../js/game/enemies.js'), 'utf8');
    const authority = fs.readFileSync(path.join(__dirname, '../js/simulation/NetworkCombatSystem.js'), 'utf8');
    const view = fs.readFileSync(path.join(__dirname, '../js/rendering/NetworkGameView.js'), 'utf8');
    expect(enemies).toContain('globalThis.NeoNyke?.simulation?.resolveCampaignBossIntro');
    expect(enemies).not.toContain('Neo.simulation?.resolveCampaignBossIntro');
    expect(authority).toContain('announceAuthorityBossIntro');
    expect(view).toContain("event.eventType === 'BOSS_INTRO'");
  });
});
