(function initializeSharedEnemyAttackSystem(root, factory) {
  const content = typeof module !== 'undefined' && module.exports ? require('./SharedEnemyContent') : root.NeoNyke?.content;
  const scaling = typeof module !== 'undefined' && module.exports ? require('./SharedEnemyScalingSystem') : root.NeoNyke?.simulation;
  const bodies = typeof module !== 'undefined' && module.exports ? require('./SharedEnemyBodySystem') : root.NeoNyke?.simulation;
  const api = factory(content, scaling, bodies);
  const namespace = root.NeoNyke = root.NeoNyke || {};
  Object.assign(namespace.simulation = namespace.simulation || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyAttackApi(content, scaling, bodies) {
  'use strict';

  // These are the NPC signature projectiles, including the level-20 upgrades.
  // Ownership and world insertion belong to adapters; neither may substitute a
  // weapon projectile, instant ray, or a different damage/speed/count here.
  const ENEMY_PROJECTILE_SIGNATURES = Object.freeze([
    'hunter_volley', 'sniper_round', 'gunner_barrage', 'dungeon_beam',
    'cult_bolt_volley', 'shield_throw', 'bullet_nova', 'laser_nova',
  ]);
  const ENEMY_NATIVE_SIGNATURES = Object.freeze([
    ...ENEMY_PROJECTILE_SIGNATURES, 'hunter_trap', 'shield_guard', 'charger_rush',
  ]);

  function getEnemySignatureAimTarget(actor, moveKey, targets, angle, aimPoint) {
    const point = moveKey === 'hunter_trap' && Number.isFinite(aimPoint?.x) && Number.isFinite(aimPoint?.y)
      ? aimPoint : { x: actor.x + Math.cos(angle) * 600, y: actor.y + Math.sin(angle) * 600 };
    if (moveKey === 'hunter_trap') {
      const aimed = targets.filter(target => Math.hypot(target.x - point.x, target.y - point.y) <= Number(target.r ?? target.radius ?? 14))
        .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
      if (aimed) return aimed;
    }
    return { ...point, r: 0 };
  }

  function getEnemySignatureTiming(moveKey, level, tuning = {}) {
    return {
      windup: moveKey === 'sniper_round' || moveKey === 'dungeon_beam' ? 0.7 : 0.48,
      cooldown: (Number(level || 1) >= 20 ? 5.8 : 7.4) * Math.max(0.72, Number(tuning.rangedCadence || 1)),
    };
  }

  function getPlayableEnemyAttackActor(player, options = {}) {
    const character = player?.characterKey || player?.character;
    if (!content.isPlayableEnemyCharacterKey(character)) return null;
    const profile = content.getPlayableEnemyDefinition(character);
    if (!profile) return null;
    const definition = content.ENEMY_CATALOG[profile.type];
    const stats = bodies.resolvePlayableEnemyBody(player, options) || scaling.scaleCampaignEnemyStats(definition, {
      ...options, type: profile.type, isBoss: !!definition.boss,
      enemyLevel: player.level || 1,
    });
    return {
      type: profile.type, boss: !!definition.boss,
      x: Number(player.x || 0), y: Number(player.y || 0),
      r: definition.radius, level: stats.level,
      dmg: stats.contactDamage, max: stats.maxHealth,
      hp: stats.maxHealth * Math.max(0, Math.min(1, Number(player.hp ?? player.maxHp ?? 1) / Number(player.maxHp || player.hp || 1))),
      speed: stats.moveSpeed, vx: 0, vy: 0, stun: 0,
      enemyLevelAttackSpeedMultiplier: stats.enemyLevelAttackSpeedMultiplier,
    };
  }

  const primaryByKey = Object.fromEntries(Object.values(content.ENEMY_NATIVE_PRIMARIES).map(def => [def.key, def]));
  function getEnemyNativePrimary(value) {
    const type = content.getPlayableEnemyDefinition(value)?.type;
    return content.ENEMY_NATIVE_PRIMARIES[type]
      || primaryByKey[value] || null;
  }

  function getPlayableEnemyPrimary(characterKey) {
    return content.isPlayableEnemyCharacterKey(characterKey) ? getEnemyNativePrimary(characterKey) : null;
  }

  function getEnemyNativeAction(key) {
    return content.ENEMY_NATIVE_ACTIONS[key] || primaryByKey[key] || null;
  }

  function canStartControlledEnemyAction(actor, moveKey) {
    if (!actor) return true;
    if (actor.type === 'bulk_golem') {
      if (actor.bulkJumpTime > 0) return false;
      if (moveKey === 'enemy_bulk_nova' || moveKey === 'enemy_bulk_leap') return true;
      return !(actor.windup > 0 || actor.spitWindup > 0 || actor.dashTime > 0 || actor.attackCd > 0);
    }
    if (actor.type === 't_rex') {
      if (actor.windup > 0 || actor.dashTime > 0) return false;
      return moveKey === 'enemy_t_rex_roar' || !(actor.attackCd > 0);
    }
    if (actor.type !== 'antony_blemmye') return false;
    if (actor.windup > 0 || actor.beamTime > 0) return false;
    return moveKey === 'enemy_antony_blemmye_primary' || !(actor.attackCd > 0);
  }

  function getBossStatusStacks(actor, baseStacks = 1) {
    return Math.max(1, Math.round(baseStacks * (actor?.type === 'god' ? 1
      : 1 + Math.floor(Math.max(1, Number(actor?.level || 1)) / 3))));
  }

  function planAntonyDeathBallProjectiles(actor, baseAngle) {
    const count = actor.level >= 25 ? 3 : actor.level >= 10 ? 2 : 1;
    const coldStacks = getBossStatusStacks(actor, 1);
    return Array.from({ length: count }, (_, index) => {
      const angle = baseAngle + (index - (count - 1) / 2) * 0.24;
      return {
        x: actor.x + Math.cos(angle) * (actor.r + 14), y: actor.y + Math.sin(angle) * (actor.r + 14),
        vx: Math.cos(angle) * 525, vy: Math.sin(angle) * 525,
        r: 38, life: 3.4, kind: 'cold_death', source: 'antony_death_ball', color: '#9fe8ff',
        damage: Math.round(actor.dmg * 1.1), knockback: 230,
        statusEffects: [{ key: 'slow', chance: 1, stacks: coldStacks, duration: 4 }],
        enemyBlast: { radius: actor.level >= 5 ? 145 : 120, damage: Math.round(actor.dmg * 0.65),
          color: '#9fe8ff', statusKey: 'slow', statusStacks: coldStacks, statusDuration: 3 },
        homing: true, homingTurnRate: 0.65, homingSpeed: 570, homingAccel: 1.1,
      };
    });
  }

  function getEnemyNativeActionTiming(key, actor, tuning = {}, floor = 1) {
    const def = getEnemyNativeAction(key);
    if (!def) return null;
    if (def.slot === 'melee') return getEnemyNativePrimaryTiming(key, tuning, actor.enemyLevelAttackSpeedMultiplier);
    let cooldown = def.cooldown * (def.tuned ? Number(tuning.rangedCadence || 1) : 1);
    if (key === 'enemy_healer_pulse') cooldown = (floor >= 4 ? 2.1 : 2.8) * Math.max(0.74, Number(tuning.rangedCadence || 1));
    if (key === 'enemy_shield_pulse') cooldown = 2.9 * Math.max(0.76, Number(tuning.rangedCadence || 1));
    if (def.attackCooldown) cooldown /= Math.max(1, Number(actor.enemyLevelAttackSpeedMultiplier || 1));
    return { windup: def.windup / (def.tuned ? Number(tuning.reaction || 1) : 1), cooldown };
  }

  function getControlledEnemyMovement(player) {
    if (player?.enemySignatureCast) return { vx: Number(player.vx || 0), vy: Number(player.vy || 0) };
    const actor = player?.enemyNativePrimary?.actor;
    if (actor?.bulkJumpTime > 0) return { vx: 0, vy: 0 };
    // The tyrant coasts and brakes during its windup; input cannot steer it.
    if (actor?.type === 't_rex' && actor.windup > 0) return { vx: Number(player.vx || 0), vy: Number(player.vy || 0) };
    if (!(actor?.dashTime > 0)) return null;
    const speed = actor.npcSignatureRush ? 820 : actor.type === 't_rex' ? Math.max(610, Number(actor.speed || 0) * 2)
      : { charger: 430, knave: 450, golem: 390, bulk_golem: 390 }[actor.type];
    if (!speed) return null;
    return { vx: Math.cos(actor.dashAngle) * speed, vy: Math.sin(actor.dashAngle) * speed };
  }

  function getEnemyNativePrimaryTiming(value, tuning = {}, attackSpeedMultiplier = 1) {
    const def = getEnemyNativePrimary(value);
    if (!def) return null;
    return {
      windup: def.windup / (def.tuned ? Number(tuning.reaction || 1) : 1),
      cooldown: def.cooldown * (def.tuned ? Number(tuning.rangedCadence || 1) : 1)
        / (def.independentCooldown ? 1 : Math.max(1, Number(attackSpeedMultiplier || 1))),
    };
  }

  // Aim with the cursor; contact/blade attacks can only select a body in the
  // aimed arc. Ranged attacks keep a virtual aim point even in an empty room.
  function getEnemyPrimaryAimTarget(actor, targets, angle) {
    const def = actor.npcSignatureRush ? { kind: 'charge' } : getEnemyNativeAction(actor.nativeMoveKey) || getEnemyNativePrimary(actor.type);
    if (def?.kind === 'leap' && actor.nativeAimPoint) return { ...actor.nativeAimPoint, r: 0 };
    if (['contact', 'blade', 'bite', 'charge', 'roar'].includes(def?.kind)) {
      let closest = null;
      let best = Infinity;
      for (const target of targets) {
        const dx = target.x - actor.x, dy = target.y - actor.y;
        const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
        const distance = Math.hypot(dx, dy);
        const bodyContact = def.kind === 'charge' && actor.dashTime > 0;
        if ((def.kind === 'roar' || bodyContact || Math.abs(delta) < 1.15) && distance < best) { closest = target; best = distance; }
      }
      if (closest) return closest;
    }
    return { x: actor.x + Math.cos(angle) * 600, y: actor.y + Math.sin(angle) * 600, r: 0 };
  }

  function planEnemySignatureProjectiles(actor, moveKey, angle) {
    if (!ENEMY_PROJECTILE_SIGNATURES.includes(moveKey)) return null;
    const upgraded = Number(actor.level || 1) >= 20;
    let count = 1;
    let spread = 0;
    let speed = 520;
    let r = 5;
    let life = 1.4;
    let damageScale = 1;
    let knockback = 140;
    let pierceCount = 0;
    let statusEffects;
    if (moveKey === 'hunter_volley') {
      count = upgraded ? 7 : 5; spread = 0.17; speed = 620; life = 1.15;
      damageScale = 0.72; pierceCount = upgraded ? 2 : 1;
    } else if (moveKey === 'sniper_round') {
      count = upgraded ? 2 : 1; spread = 0.14; speed = 900; r = 6; life = 1.05;
      damageScale = 1.45; knockback = 300; pierceCount = upgraded ? 4 : 2;
    } else if (moveKey === 'gunner_barrage') {
      count = upgraded ? 16 : 12; spread = 0.025; speed = 720; life = 1.05;
      damageScale = 0.42; knockback = 70;
    } else if (moveKey === 'bullet_nova') {
      count = upgraded ? 30 : 24; speed = 680; r = 4; damageScale = 0.4; knockback = 65;
    } else if (moveKey === 'laser_nova') {
      count = upgraded ? 16 : 12; r = 6; damageScale = 0.68; knockback = 130;
    } else if (moveKey === 'dungeon_beam') {
      count = upgraded ? 3 : 1; spread = 0.12; speed = 820; r = 11; life = 0.9;
      damageScale = 1.15; knockback = 220; pierceCount = upgraded ? 3 : 2;
    } else if (moveKey === 'cult_bolt_volley') {
      count = upgraded ? 7 : 5; spread = 0.16; speed = 500; r = 7;
      damageScale = 0.7; knockback = 100;
      statusEffects = [{ key: 'fire', chance: 1, stacks: upgraded ? 2 : 1, duration: 3.2 }];
    } else if (moveKey === 'shield_throw') {
      speed = 600; r = 12; life = 1.7; damageScale = 1.1; knockback = 330;
      pierceCount = upgraded ? 5 : 3;
    }
    const radial = moveKey === 'bullet_nova' || moveKey === 'laser_nova';
    return Array.from({ length: count }, (_, index) => {
      const direction = angle + (radial ? index * Math.PI * 2 / count : (index - (count - 1) / 2) * spread);
      return {
        x: actor.x + Math.cos(direction) * (actor.r + 8),
        y: actor.y + Math.sin(direction) * (actor.r + 8),
        vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed,
        r, life, kind: moveKey, source: moveKey,
        damage: Math.max(1, Math.round(Number(actor.dmg || 10) * damageScale)),
        knockback, pierceCount,
        statusEffects: statusEffects?.map(effect => ({ ...effect })),
      };
    });
  }

  return { ENEMY_PROJECTILE_SIGNATURES, ENEMY_NATIVE_SIGNATURES, getEnemySignatureAimTarget, getEnemySignatureTiming, getPlayableEnemyAttackActor, planEnemySignatureProjectiles,
    getEnemyNativePrimary, getPlayableEnemyPrimary, getEnemyNativePrimaryTiming, getEnemyPrimaryAimTarget,
    getEnemyNativeAction, getEnemyNativeActionTiming, getControlledEnemyMovement,
    canStartControlledEnemyAction, getBossStatusStacks, planAntonyDeathBallProjectiles };
});
