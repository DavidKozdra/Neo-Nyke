const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const enemyContent = require('../js/simulation/SharedEnemyContent');
const moveContent = require('../js/simulation/SharedMoveContent');
const combatContent = require('../js/simulation/SharedCombatContent');
const itemContent = require('../js/simulation/SharedItemDefinitions');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('credits-studio playable enemy roster', () => {
  test('authors one unique playable character for every enemy type', () => {
    const enemyTypes = Object.keys(enemyContent.ENEMY_CATALOG);
    const profiles = enemyContent.PLAYABLE_ENEMY_ROSTER;

    expect(profiles.map(profile => profile.type)).toEqual(enemyTypes);
    expect(new Set(profiles.map(profile => profile.characterKey)).size).toBe(enemyTypes.length);
    profiles.forEach(profile => {
      expect(profile.characterKey).toBe(`enemy_${profile.type}`);
      expect(profile.spriteKey).toBe(enemyContent.ENEMY_CATALOG[profile.type].spriteKey);
      expect(enemyContent.getPlayableEnemyDefinition(profile.characterKey)).toBe(profile);
      expect(enemyContent.getPlayableEnemyDefinition(profile.type)).toBe(profile);
    });
  });

  test('gives every enemy form a valid style-specific four-slot kit', () => {
    enemyContent.PLAYABLE_ENEMY_ROSTER.forEach(profile => {
      expect(moveContent.getDefaultMoveLoadout(profile.characterKey)).toEqual(profile.moveLoadout);
      expect(Object.keys(profile.moveLoadout)).toEqual(moveContent.MOVE_SLOTS);
      Object.entries(profile.moveLoadout).forEach(([slot, moveKey]) => {
        expect(moveContent.getMoveSlot(moveKey)).toBe(slot);
        expect(moveContent.isMoveAllowedForCharacter(moveKey, profile.characterKey)).toBe(true);
      });
      ['damageMultiplier', 'hpMultiplier', 'moveSpeedMultiplier'].forEach(stat => {
        expect(profile[stat]).toBeGreaterThan(0);
      });
    });
  });

  test('gives playable Anthony only his bite, knife throw, freeze ball, and normal dash', () => {
    const anthony = enemyContent.getPlayableEnemyDefinition('enemy_antony_blemmye');
    expect(anthony.moveLoadout).toEqual({
      melee: 'antony_bite',
      laser: 'antony_knife_throw',
      smash: 'antony_freeze_ball',
      dash: 'dash',
    });
    expect(anthony.defaultWeapon).toBe('knave_blade');
    expect(moveContent.ENEMY_SIGNATURE_MOVE_KEYS).not.toEqual(expect.arrayContaining([
      'antony_hammer',
      'antony_slash',
    ]));
  });

  test('gives every enemy form a real weapon and valid starting inventory', () => {
    enemyContent.PLAYABLE_ENEMY_ROSTER.forEach(profile => {
      expect(combatContent.getCharacterDefaultWeapon(profile.characterKey)).toBe(profile.defaultWeapon);
      expect(combatContent.WEAPON_BASE_STATS[profile.defaultWeapon]).toBeDefined();
      expect(combatContent.getCharacterStartingItems(profile.characterKey)).toEqual(profile.startingItems);
      Object.entries(profile.startingItems).forEach(([itemKey, count]) => {
        expect(itemContent.ITEM_DEFS[itemKey]).toBeDefined();
        expect(count).toBeGreaterThan(0);
      });
    });
  });

  test('binds a continuous sixty-second hover to the idempotent roster unlock', () => {
    const credits = read('js/ui/credits.js');
    expect(credits).toContain('const ENEMY_ROSTER_HOVER_MS = 60_000;');
    expect(credits).toContain("creditsStudio.addEventListener('pointerenter', beginHover)");
    expect(credits).toContain("creditsStudio.addEventListener('pointerleave', cancelHover)");
    expect(credits).toContain('hoverTimer = setTimeout(completeHover, ENEMY_ROSTER_HOVER_MS)');
    expect(credits).toContain('Neo.unlockPlayableEnemyRoster?.()');

    const state = read('js/core/game-state.js');
    expect(state).toContain('function unlockPlayableEnemyRoster()');
    expect(state).toContain('if (!newlyUnlocked.length) return false;');
    expect(state).toContain('Neo.metaProgress.unlockedCharacters.push(...newlyUnlocked);');
    expect(state).toContain('Neo.unlockPlayableEnemyRoster = unlockPlayableEnemyRoster;');
  });

  test('generates unlocked enemy cards inside the normal character selector', () => {
    const controller = read('js/ui/controller.js');
    expect(controller).toContain('function renderPlayableEnemyRosterCards()');
    expect(controller).toContain("document.getElementById('choose')");
    expect(controller).toContain("button.dataset.generatedEnemyCharacter = 'true'");
    expect(controller).toContain('track.insertBefore(fragment, addButton)');
    expect(controller).toContain('renderPlayableEnemyRosterCards();\n        renderCustomRosterCards();');
  });

  test('reserves every enemy signature move for an authentic enemy loadout', () => {
    const assignedMoves = new Set(enemyContent.PLAYABLE_ENEMY_ROSTER.flatMap(
      profile => Object.values(profile.moveLoadout),
    ));
    expect([...moveContent.ENEMY_SIGNATURE_MOVE_KEYS].sort()).toEqual(
      [...moveContent.ENEMY_SIGNATURE_MOVE_KEYS].filter(moveKey => assignedMoves.has(moveKey)).sort(),
    );
    moveContent.ENEMY_SIGNATURE_MOVE_KEYS.forEach(moveKey => {
      expect(moveContent.isMoveAllowedForCharacter(moveKey, 'thorn_knight')).toBe(false);
    });
  });

  test('wires summons, firearms, charge collision, and guard into real campaign dispatch', () => {
    const combat = read('js/game/combat.js');
    const world = read('js/game/world.js');
    const renderer2d = read('js/draw/props.js');
    const renderer3d = read('js/draw/three-renderer.js');

    expect(combat).toContain('function castEnemySignatureLaser(move)');
    expect(combat).toContain('function castEnemySignatureSmash(move)');
    expect(combat).toContain('function castChargerRush(moveX, moveY)');
    expect(combat).toContain('function castShieldGuard()');
    expect(combat).toContain("kind: 'cult_follower_ally'");
    expect(world).toContain("hazard.kind === 'cult_follower_ally'");
    expect(world).toContain('Neo.hitEnemy(target, Number(hazard.damage || 22)');
    expect(renderer2d).toContain("hazard.kind === 'cult_follower_ally'");
    expect(renderer3d).toContain("'cult_follower_ally'");
    expect(combatContent.DEFAULT_WEAPON_ATTACKS.shield_bash).toEqual(expect.objectContaining({
      mode: 'sweep',
    }));
  });

  test('draws a distinct pixel icon for every enemy signature move', () => {
    const context = { window: {} };
    vm.runInNewContext(read('assets/sprites/icons.js'), context);
    const icons = context.window.NeoNykeIconDefs.moves;
    moveContent.ENEMY_SIGNATURE_MOVE_KEYS.forEach(moveKey => {
      expect(icons[moveKey]).toEqual(expect.objectContaining({
        color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        pixels: expect.any(Array),
      }));
      expect(icons[moveKey].pixels.length).toBeGreaterThan(0);
    });
    enemyContent.PLAYABLE_ENEMY_ROSTER.forEach(profile => {
      expect(context.window.NeoNykeIconDefs.weapons[profile.defaultWeapon]).toEqual(expect.objectContaining({
        color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        pixels: expect.any(Array),
      }));
    });
  });

  test('unlocks every NPC signature between enemy levels 7 and 20', () => {
    const assignedMoves = new Set();
    Object.entries(enemyContent.NPC_ENEMY_MOVE_PROGRESSION).forEach(([type, unlocks]) => {
      expect(enemyContent.getNpcEnemyUnlockedMoves(type, 6)).toEqual([]);
      unlocks.forEach(unlock => {
        assignedMoves.add(unlock.moveKey);
        expect(unlock.level).toBeGreaterThanOrEqual(7);
        expect(unlock.level).toBeLessThanOrEqual(20);
        expect(enemyContent.isNpcEnemyMoveUnlocked(type, unlock.moveKey, unlock.level - 1)).toBe(false);
        expect(enemyContent.isNpcEnemyMoveUnlocked(type, unlock.moveKey, unlock.level)).toBe(true);
      });
      expect(enemyContent.getNpcEnemyUnlockedMoves(type, 20)).toEqual(unlocks.map(unlock => unlock.moveKey));
    });
    expect([...assignedMoves].sort()).toEqual([...moveContent.ENEMY_SIGNATURE_MOVE_KEYS].sort());
  });

  test('executes all unlocked NPC signatures through the shared enemy controller', () => {
    const { createCampaignEnemyBehaviors } = require('../js/simulation/SharedEnemyBehaviorSystem');
    const events = [];
    const projectiles = [];
    const hazards = [];
    const summons = [];
    const barriers = [];
    const player = { id: 'player', x: 180, y: 100, vx: 0, vy: 0, r: 18 };
    const behaviors = createCampaignEnemyBehaviors({
      getPlayer: () => player,
      getTuning: () => ({ reaction: 1, rangedCadence: 1, supportPower: 1 }),
      random: () => 0.5,
      spawnProjectile: (_enemy, projectile) => projectiles.push(projectile),
      spawnHazard: (_enemy, hazard) => hazards.push(hazard),
      spawnMinion: (_enemy, type) => summons.push(type),
      grantBarrier: (_enemy, target, amount) => {
        target.barrier = amount;
        barriers.push(amount);
      },
      emit: (type, payload) => events.push({ type, payload }),
    });
    const cast = (type, level, signatureIndex = 0) => {
      const enemy = {
        id: `${type}-${level}-${signatureIndex}`,
        type,
        level,
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        r: 18,
        dmg: 20,
        hp: 100,
        max: 100,
        attackCd: 0,
        stun: 0,
        windup: 0,
        beamTime: 0,
        dashTime: 0,
        swingTime: 0,
        npcSignatureIndex: signatureIndex,
      };
      expect(behaviors.updateNpcEnemySignatureMoves(enemy, 0.01)).toBe(true);
      const moveKey = enemy.npcSignatureMove;
      expect(behaviors.updateNpcEnemySignatureMoves(enemy, 1)).toBe(true);
      return { enemy, moveKey };
    };

    expect(cast('hunter', 7).moveKey).toBe('hunter_volley');
    expect(projectiles.filter(projectile => projectile.kind === 'hunter_volley')).toHaveLength(5);
    expect(cast('hunter', 14, 1).moveKey).toBe('hunter_trap');
    expect(hazards.at(-1)).toEqual(expect.objectContaining({ kind: 'red_spikes', source: 'hunter_trap' }));
    expect(cast('sniper', 7).moveKey).toBe('sniper_round');
    expect(projectiles.some(projectile => projectile.kind === 'sniper_round')).toBe(true);
    expect(cast('machine_gunner', 7).moveKey).toBe('gunner_barrage');
    expect(projectiles.filter(projectile => projectile.kind === 'gunner_barrage')).toHaveLength(12);
    expect(cast('machine_gunner', 14, 1).moveKey).toBe('bullet_nova');
    expect(projectiles.filter(projectile => projectile.kind === 'bullet_nova')).toHaveLength(24);
    expect(cast('machine_gunner', 20, 1).moveKey).toBe('bullet_nova');
    expect(projectiles.filter(projectile => projectile.kind === 'bullet_nova')).toHaveLength(54);
    expect(cast('laser', 7).moveKey).toBe('dungeon_beam');
    expect(cast('laser', 14, 1).moveKey).toBe('laser_nova');
    expect(projectiles.filter(projectile => projectile.kind === 'laser_nova')).toHaveLength(12);
    expect(cast('cult_mage', 7).moveKey).toBe('cult_bolt_volley');
    expect(cast('cult_mage', 14, 1)).toEqual(expect.objectContaining({
      moveKey: 'cult_frenzy',
      enemy: expect.objectContaining({ signatureSpeedMultiplier: 1.4, signatureAttackSpeedMultiplier: 1.4 }),
    }));
    expect(cast('shield_unit', 7).moveKey).toBe('shield_throw');
    expect(cast('shield_unit', 14, 1).moveKey).toBe('shield_guard');
    expect(barriers.at(-1)).toBe(24);
    expect(cast('summoner', 7).moveKey).toBe('summon_cult_followers');
    expect(summons.filter(type => type === 'cult_follower')).toHaveLength(3);
    expect(cast('queen_cult', 20).moveKey).toBe('summon_cult_followers');
    expect(summons.filter(type => type === 'cult_follower')).toHaveLength(8);
    expect(cast('charger', 7)).toEqual(expect.objectContaining({
      moveKey: 'charger_rush',
      enemy: expect.objectContaining({ npcSignatureRush: true, dashTime: 0.4 }),
    }));
    expect(events.some(event => event.type === 'ENEMY_TELEGRAPH')).toBe(true);
    expect(events.some(event => event.type === 'ENEMY_ATTACKED')).toBe(true);
  });
});
