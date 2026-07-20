const fs = require('node:fs');
const path = require('node:path');

// Status rings, the overheal barrier, stun stars and the status icon row were
// inlined in drawPlayer, so only the local hero showed them. Every other player
// -- split-screen co-op partners and networked teammates -- draws through
// drawPlayerSlot and showed none of it, hiding whether an ally was burning,
// poisoned, stunned or shielded. Both paths must keep sharing one implementation.
describe('player slot status visuals', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js/draw/entities.js'),
    'utf8',
  );

  const bodyOf = name => {
    const start = source.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  }', start);
    return source.slice(start, end);
  };

  test.each([
    ['drawActorStatusRings', 'status rings'],
    ['drawActorOverhealBarrier', 'overheal barrier'],
    ['drawStunStars', 'stun stars'],
    ['drawEnemyStatusIconRow', 'status icon row'],
  ])('drawPlayerSlot draws %s (%s)', helper => {
    expect(bodyOf('drawPlayerSlot')).toContain(`${helper}(`);
  });

  test('drawPlayer uses the same shared helpers instead of its own copy', () => {
    const body = bodyOf('drawPlayer');
    expect(body).toContain('drawActorStatusRings(Neo.player)');
    expect(body).toContain('drawActorOverhealBarrier(Neo.player)');
    // The inlined ring loop and barrier rect must be gone, or the two paths can
    // drift apart again.
    expect(body).not.toContain('Neo.STATUS_KEYS.length');
    expect(body).not.toContain('strokeRect');
  });

  test('the shared helpers read the actor they are given, not the global player', () => {
    ['drawActorStatusRings', 'drawActorOverhealBarrier'].forEach(helper => {
      expect(bodyOf(helper)).not.toContain('Neo.player');
    });
  });

  // getItemStats() and Neo.godTimer are derived from the GLOBAL Neo.player, so
  // reading them for a non-local hero rendered teammates with the local
  // player's item stats: your Artificer's Charger inflated their sprite, and a
  // god-mode ally never showed the golden glow.
  describe('per-player item and god state', () => {
    test('sprite scale comes from the actor, not the global player', () => {
      const body = bodyOf('drawPlayerSlot');
      expect(body).toContain('getActorSpriteScale(pn)');
      // The old global read must be gone from the shared slot path.
      expect(body).not.toContain('Neo.getItemStats');
    });

    test('the local path shares the same scale helper', () => {
      expect(bodyOf('drawPlayer')).toContain('getActorSpriteScale(Neo.player)');
    });

    test('god-mode visuals read per actor so teammates glow too', () => {
      expect(bodyOf('drawPlayerSlot')).toContain('getActorGodTime(pn)');
      // drawPlayer must not reach for the bare global any more.
      expect(bodyOf('drawPlayer')).not.toContain('Neo.godTimer >');
    });

    test('the network view projects the authority per-player god window', () => {
      const view = fs.readFileSync(
        path.join(__dirname, '..', 'js/rendering/NetworkGameView.js'),
        'utf8',
      );
      // godUntilTick is authoritative and per player; without projecting it the
      // golden tint never appears in a network run for anyone.
      expect(view).toContain('godUntilTick');
      expect(view).toMatch(/godTimer: Math\.max\(0, Number\(player\.godUntilTick/);
    });
  });
});
