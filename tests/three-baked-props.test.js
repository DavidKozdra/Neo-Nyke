const fs = require('node:fs');
const path = require('node:path');

// The 3D renderer used to bake only a hand-listed set of pickups and hazards,
// so every other authored prop silently collapsed to a generic glow blob (or a
// purple fallback disc). Ladders, bombs, trial altars and shrines were each
// found by eye, one at a time. Baking is now the DEFAULT and only genuine
// glows opt out, so an unlisted type renders its real art instead of degrading.
describe('3D props bake their 2D art by default', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'js/draw/three-renderer.js'),
    'utf8',
  );
  const props = fs.readFileSync(
    path.join(__dirname, '..', 'js/draw/props.js'),
    'utf8',
  );

  const setEntries = name => {
    const match = source.match(new RegExp(`${name} = new Set\\(\\[([^\\]]*)\\]`));
    expect(match).not.toBeNull();
    return [...match[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
  };

  test('the pickup glow list is an opt-out, not an allowlist', () => {
    // A regression here means someone re-inverted the default.
    expect(source).toContain('GLOW_ONLY_PICKUP_TYPES.has(pickup.type)');
    expect(source).not.toContain('BAKED_2D_PICKUP_TYPES');
  });

  test('only types with no 2D art branch stay on the glow path', () => {
    // Any glow-only type that DOES have authored 2D art is a silent downgrade.
    setEntries('GLOW_ONLY_PICKUP_TYPES').forEach(type => {
      expect(props).not.toContain(`pickup.type === '${type}'`);
    });
  });

  test('every pickup type drawn in 2D bakes or is deliberately a glow', () => {
    const drawn = new Set(
      [...props.matchAll(/pickup\.type === '([^']+)'/g)].map(match => match[1]),
    );
    const glowOnly = new Set(setEntries('GLOW_ONLY_PICKUP_TYPES'));
    drawn.forEach(type => {
      // 'ladder' has its own bespoke 3D object (billboard + floor ring).
      if (type === 'ladder' || glowOnly.has(type)) return;
      expect(source).toContain(`${type}:`);
    });
  });

  // The counterpart of the pickup sweep above. Anything drawWorldProps draws as
  // a hazard must be named somewhere in the 3D renderer -- a bespoke object, a
  // bake, or an explicit HAZARD_STYLES disc. A kind mentioned nowhere is the
  // purple-fallback bug (holy_turret, fire_circle, el_barto_graffiti).
  test('every hazard kind drawn in 2D is handled somewhere in 3D', () => {
    // Destructible props share drawWorldProps' `.kind ===` shape but are synced
    // by syncDestructibles, not syncHazards.
    const destructibleKinds = new Set(['wall', 'cover_wall', 'secret_wall', 'pot', 'barrel']);
    const drawn = new Set(
      [...props.matchAll(/\.kind === '([a-z_]+)'/g)].map(match => match[1]),
    );
    const uncovered = [...drawn].filter(kind => (
      !destructibleKinds.has(kind) && !source.includes(`'${kind}'`)
    ));
    expect(uncovered).toEqual([]);
  });

  // A plain item drop is an 8x8 icon spanning only about -12..+12 world units,
  // but a duplicate Artificer's Charger draws a dwell warning down to y=+44.
  // One band cannot serve both: sizing for the warning shrank ordinary drops to
  // a speck in mostly-empty canvas, which is what made item drops look missing.
  test('item drops bake tight while the charger warning widens its own band', () => {
    expect(source).toContain('function pickupBakeWorldSize(pickup)');
    expect(source).toContain('pickupBakeWorldSize(pickup)');
    const itemSize = Number(source.match(/\n  item: (\d+),/)[1]);
    const overchargeSize = Number(source.match(/OVERCHARGE_ITEM_WORLD_SIZE = (\d+)/)[1]);
    // The icon must not be squeezed into a band sized for the warning text.
    expect(itemSize).toBeLessThan(overchargeSize);
    expect(itemSize).toBeLessThanOrEqual(48);
    // ...and the warning band still has to reach past its y=+44 prompt.
    expect(overchargeSize / 2).toBeGreaterThan(44);
  });

  test('hazards with authored 2D art bake instead of falling to the purple disc', () => {
    ['holy_turret', 'fire_circle', 'el_barto_graffiti', 'red_spikes', 'thorn_mine']
      .forEach(kind => expect(setEntries('BAKED_2D_HAZARD_KINDS')).toContain(kind));
    // These had flat-disc styles that the bake now replaces; leaving a style
    // behind would silently win over the bake.
    expect(source).not.toMatch(/HAZARD_STYLES = \{[^}]*red_spikes/);
    expect(source).not.toMatch(/HAZARD_STYLES = \{[^}]*thorn_mine/);
  });

  test('hazard bake bands scale with radius so large instances are not clipped', () => {
    // A fixed band would clip a big turret or fire circle, since every stroke
    // in their 2D art is a multiple of hazard.r.
    expect(source).toContain('function bakedHazardWorldSize(hazard)');
    expect(source).toMatch(/BAKED_HAZARD_SIZE_FACTOR\[hazard\.kind\]/);
  });

  test('flat props bake onto floor quads and upright props onto billboards', () => {
    // Standing a floor plate up (or laying a console down) is the same mistake
    // as the ladder that shipped as a hatch decal painted on the ground.
    expect(setEntries('FLAT_BAKED_HAZARD_KINDS').sort())
      .toEqual(['el_barto_graffiti', 'red_spikes', 'thorn_mine']);
    expect(setEntries('FLAT_BAKED_PICKUP_TYPES')).toEqual(['challengeSwitch']);
  });
});
