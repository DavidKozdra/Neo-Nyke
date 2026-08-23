const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moveContent = require('../js/simulation/SharedMoveContent');
const combatContent = require('../js/simulation/SharedCombatContent');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Knave, the hidden playable character', () => {
  test('is unlocked only by the five-click credits studio easter egg', () => {
    const credits = read('js/ui/credits.js');

    // The counter and listener must be bound once at script load. Binding inside
    // start() (per credits-page open) reset the count and stacked duplicate
    // listeners, so the egg could never be completed across visits.
    expect(credits).toContain('const KNAVE_CLICKS_REQUIRED = 5;');
    expect(credits).toContain('if (clickCount < KNAVE_CLICKS_REQUIRED) return;');
    expect(credits).toContain('Neo.unlockKnaveCharacter?.()');
    expect(credits).toContain("globalThis.developer_mode = true;");
    // Bound at module scope, not from within the per-open start() function.
    const startBody = credits.match(/function start\(\) \{[\s\S]*?\n  \}/)[0];
    expect(startBody).not.toContain('handleCreditsStudioClick');
    expect(credits).toMatch(/\n  handleCreditsStudioClick\(\);\n/);

    const state = read('js/core/game-state.js');
    // The unlock is idempotent and reports whether it actually granted Knave, so
    // the banner/confetti only fire on the first completion.
    expect(state).toContain('function unlockKnaveCharacter()');
    expect(state).toContain("if (Neo.metaProgress.unlockedCharacters.includes('knave')) return false;");
    expect(state).toContain("Neo.recordCharacterUnlock?.('knave')");
    expect(state).toContain('Neo.unlockKnaveCharacter = unlockKnaveCharacter;');
  });

  test('is never granted by the normal earned-unlock paths', () => {
    const state = read('js/core/game-state.js');

    // Knave must not appear in the always-unlocked fallback roster, nor be
    // derived from any progress counter the way gelleh/mooggy/sarge are.
    expect(state).toContain("const fallback = ['princess', 'thorn_knight', 'metao'];");
    expect(state).not.toMatch(/unlocked\.add\('knave'\)/);

    // Custom-character creation is a game-completion reward, independent of
    // whether the hidden credits hero has been discovered.
    expect(state).toContain('function hasBeatenGame()');
    expect(state).not.toContain('function hasAllCharactersUnlocked()');
  });

  test('stays out of every roster surface until he has been found', () => {
    const controller = read('js/ui/controller.js');

    // Single-player carousel card is hidden outright, not merely locked. The
    // reveal uses `char-card--secret` rather than `hidden`, because the
    // pagination pass rewrites `hidden` on every page update and would
    // otherwise un-hide the secret card.
    expect(controller).toContain("if (itemKey === 'knave') {");
    expect(controller).toContain("button.classList.toggle('char-card--secret', !revealed);");
    // Secret cards must also be excluded from the paged card list, or they'd
    // reserve an empty slot in the carousel.
    expect(controller).toContain("return view.charButtons.filter(button => !button.classList.contains('char-card--secret'));");
    expect(read('css/character-select.css')).toContain('#charSelect .char-card--secret');
    // Compendium and co-op lobby both filter him out until unlocked.
    expect(controller).toContain("c.key !== 'custom_character' && (c.key !== 'knave' || knaveFound)");
    expect(controller).toContain("entry.key !== 'knave' || knaveFound");
    // Lock copy never reveals the trigger.
    expect(controller).toContain("if (itemKey === 'knave') return '???';");

    const index = read('index.html');
    // Ships hidden in the static markup so he's absent even before any JS pass.
    expect(index).toMatch(/<button class="char-card char-card--secret" data-char="knave"[^>]*hidden>/);
  });

  test('fields his own signature kit with dash-only mobility', () => {
    const loadout = moveContent.getDefaultMoveLoadout('knave');
    expect(loadout).toEqual({
      melee: 'knave_blade', laser: 'knave_knives', smash: 'crimson_smash', dash: 'dash',
    });

    // Every signature move is reserved for Knave, so no other hero can field
    // them via the shop or an alt-kit.
    const exclusives = moveContent.MOVE_EXCLUSIVE_CHARACTERS;
    ['knave_blade', 'knave_knives', 'blood_disks'].forEach(moveKey => {
      expect(exclusives[moveKey]).toBe('knave');
    });
    // Anything NOT reserved for him must not be reserved for someone else, or
    // isMoveAllowedForCharacter would strip it and leave an empty slot.
    Object.values(loadout).forEach(moveKey => {
      const owner = exclusives[moveKey];
      expect(owner === undefined || owner === 'knave').toBe(true);
    });

    // Mobility is deliberately dash-only: the laser slot carries his choice.
    expect(Object.keys(moveContent.KIT_ALTERNATIVES.knave)).toEqual(['laser']);
    expect(moveContent.KIT_ALTERNATIVES.knave.laser).toEqual(['knave_knives', 'blood_disks']);

    // Alternates must lead with the slot default and stay in their own slot.
    Object.entries(moveContent.KIT_ALTERNATIVES.knave).forEach(([slot, options]) => {
      expect(options[0]).toBe(loadout[slot]);
      options.forEach(moveKey => expect(moveContent.getMoveSlot(moveKey)).toBe(slot));
    });
  });

  test('authors Knave Knives as two homing blades with a 15% bleed chance', () => {
    expect(moveContent.KNAVE_KNIFE_COUNT).toBe(2);
    expect(moveContent.KNAVE_KNIFE_BLEED_CHANCE).toBe(0.15);

    const knives = moveContent.createKnaveKnifeDescriptors({ aimAngle: 0, targets: [] });
    expect(knives).toHaveLength(2);
    knives.forEach(knife => {
      expect(knife.homing).toBe(true);
      expect(knife.hitOptions.bleedChance).toBe(0.15);
      expect(knife.kind).toBe('knave_knife');
    });
    // With no targets the two knives must still fan apart rather than stack
    // into what reads on screen as a single projectile.
    expect(knives[0].angle).not.toBe(knives[1].angle);

    // Given targets, each knife commits to a different one.
    const targeted = moveContent.createKnaveKnifeDescriptors({
      aimAngle: 0, targets: [{ id: 'a' }, { id: 'b' }],
    });
    expect(targeted[0].target).not.toBe(targeted[1].target);
  });

  test('lets Dragon Orb scale and chain Knave Knives like a real beam', () => {
    // Damage scaling: the knives read the same beamDamageMultiplier Dragon Orb
    // feeds (+35% per stack), so a stacked orb makes them hit harder.
    const plain = moveContent.createKnaveKnifeDescriptors({ damageMultiplier: 1 })[0];
    const oneOrb = moveContent.createKnaveKnifeDescriptors({ damageMultiplier: 1.35 })[0];
    const twoOrbs = moveContent.createKnaveKnifeDescriptors({ damageMultiplier: 1.7 })[0];
    expect(oneOrb.damage).toBeGreaterThan(plain.damage);
    expect(twoOrbs.damage).toBeGreaterThan(oneOrb.damage);
    expect(oneOrb.damage).toBe(Math.round(plain.damage * 1.35));

    // Chaining: the knives opt in via chainsOnHit, and the projectile hit path
    // calls chainBeamHit for flagged projectiles.
    moveContent.createKnaveKnifeDescriptors({}).forEach(knife => {
      expect(knife.chainsOnHit).toBe(true);
    });
    expect(read('js/game/combat.js')).toContain('chainsOnHit: knife.chainsOnHit,');
    const world = read('js/game/world.js');
    expect(world).toContain('if (projectile.chainsOnHit && target.hp > 0)');
    expect(world).toContain('Neo.chainBeamHit?.(');
    // chainBeamHit itself reads Dragon Orb's beamChainTargets.
    expect(read('js/game/combat.js')).toContain('const chains = stats.beamChainTargets || 0;');
    expect(read('js/simulation/SharedItemEffectSystem.js'))
      .toContain("beamChainTargets: stacks('dragon_orb')");
  });

  test('crops the knave sheet so the sword tip survives the atlas', () => {
    // The authored strip's content spans 25 rows (y=14..38). A 24px window at
    // offset 15 clipped row 14 — the lone pixel at the tip of the sword on the
    // arm frame. Both defs share knave.png and must use the same 25px crop.
    const sheets = read('js/draw/character-sheets.js');
    const knaveDefs = sheets.match(/(knave|artificer_knave): \{\s*\n\s*src: 'assets\/sprites\/chars\/knave\.png'[\s\S]*?\n  \},/g);
    expect(knaveDefs).toHaveLength(2);
    knaveDefs.forEach(def => {
      expect(def).toContain('frameHeight: 25');
      expect(def).toContain('sourceOffsetY: 14');
      // Pivot follows the crop one row down.
      expect(def).toContain('armPivot: { x: 12, y: 20 }');
    });
  });

  test('authors Blood Disks as fewer, faster, bleedier Power Disks', () => {
    const blood = moveContent.createBloodDiskBurstDescriptors({});
    const power = moveContent.createPowerDiskBurstDescriptors({});

    expect(blood.length).toBeLessThan(power.length);
    expect(blood[0].speed).toBeGreaterThan(power[0].speed);
    blood.forEach(disk => {
      expect(disk.hitOptions.bleedChance).toBeGreaterThan(0);
      // Its own kind: the renderer picks visuals by kind and the preset beats a
      // per-projectile colour, so reusing 'disk' would draw these purple.
      expect(disk.kind).toBe('blood_disk');
      expect(disk.subSpawn).toBeUndefined();
    });
    expect(read('js/draw/props.js')).toContain('blood_disk: {');
    expect(read('js/draw/props.js')).toContain('knave_knife: {');
  });

  test('gives every new move and the weapon a drawn icon', () => {
    const context = { window: {} };
    vm.runInNewContext(read('assets/sprites/icons.js'), context);
    const icons = context.window.NeoNykeIconDefs;
    ['knave_blade', 'knave_knives', 'blood_disks'].forEach(moveKey => {
      expect(icons.moves[moveKey]).toEqual(expect.objectContaining({
        color: expect.stringMatching(/^#[0-9a-f]{6}$/i), pixels: expect.any(Array),
      }));
      expect(icons.moves[moveKey].pixels.length).toBeGreaterThan(0);
    });
    expect(icons.weapons.knave_blade).toEqual(expect.objectContaining({
      color: expect.stringMatching(/^#[0-9a-f]{6}$/i), pixels: expect.any(Array),
    }));
  });

  test('resolves the same weapon and starting kit on the campaign and the authority', () => {
    expect(combatContent.getCharacterDefaultWeapon('knave')).toBe('knave_blade');
    // The blade is a real weapon too, with authored stats and a sweep behavior.
    expect(combatContent.WEAPON_BASE_STATS.knave_blade).toEqual(
      expect.objectContaining({ damage: 36, cooldown: 0.35 }));
    expect(combatContent.DEFAULT_WEAPON_ATTACKS.knave_blade).toEqual(expect.objectContaining({
      mode: 'sweep', bleedChance: 0.35, bleedStacks: 2,
    }));
    // Weapon and melee-move twins must agree, or the same blade hits differently
    // depending on whether a weapon happens to be equipped.
    const blade = require('../js/simulation/SharedMoveEffectSystem').resolveCampaignKnaveBlade({});
    expect(blade.bleedChance).toBe(combatContent.DEFAULT_WEAPON_ATTACKS.knave_blade.bleedChance);
    expect(blade.bleedStacks).toBe(combatContent.DEFAULT_WEAPON_ATTACKS.knave_blade.bleedStacks);
    expect(blade.arc).toBe(combatContent.DEFAULT_WEAPON_ATTACKS.knave_blade.arc);
    expect(combatContent.CHARACTER_STARTING_ITEMS.knave).toEqual({
      pendant_of_rock: 1, artificer_charger: 1,
    });

    // The campaign builds starting inventory separately from the shared table;
    // the two must agree or a co-op Knave starts with different items.
    const state = read('js/core/game-state.js');
    expect(state).toContain("if (characterKey === 'knave') {");
    expect(state).toContain('items.pendant_of_rock = 1;');
    expect(state).toContain('items.artificer_charger = 1;');
  });

  test('is accepted across the whole multiplayer stack', () => {
    expect(read('js/protocol/ProtocolV1.js')).toContain("'sarge', 'knave'");
    expect(read('js/multiplayer/LocalMultiplayerSession.js')).toContain("'sarge', 'knave'");

    // The canonical shared profile is the authority source: 0.82 HP, 1.18
    // movement, and 0.95 damage against the campaign's 120 / 228 stat bases.
    expect(combatContent.getBuiltInHeroCombatProfile('knave')).toEqual(expect.objectContaining({
      hpMultiplier: 0.82,
      moveSpeedMultiplier: 1.18,
      damageMultiplier: 0.95,
    }));
    expect(Math.round(120 * 0.82)).toBe(98);
    expect(228 * 1.18).toBeCloseTo(269.04, 5);
  });
});
