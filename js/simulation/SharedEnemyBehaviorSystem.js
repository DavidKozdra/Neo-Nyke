(function initializeSharedEnemyBehaviorSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedEnemyBehaviorSystemApi() {
  'use strict';

  // The authored campaign enemy behaviors from js/game/enemies.js, ported onto
  // a context interface so an authority (or any headless runtime) executes the
  // exact same state machines the campaign plays: wind-ups, dashes, beams,
  // novas, bursts, cover-seeking, summons, shields, heals and the boss-spawner
  // countdown. Every constant here mirrors the campaign body it came from —
  // js/game/enemies.js remains the source of truth when they drift.
  //
  // The context supplies world access; enemies use the campaign's alias fields
  // (r, dmg, speed, hp, max, and seconds-based timers like stun/attackCd/
  // windup/beamTime/dashTime/swingTime) so the same renderer telegraphs work.
  const SHARED_BEHAVIOR_TYPES = Object.freeze([
    'hunter', 'charger', 'laser', 'knave', 'sniper', 'machine_gunner', 'golem',
    'cult_mage', 'cult_follower', 'summoner', 'shield_unit', 'healer', 'boss_spawner',
    'queen_cult', 'bulk_golem', 'artificer_knave', 'bowman_bane', 'antony_blemmye',
    'handsome_devil', 'god', 'mooggy',
  ]);

  // Queen finisher tuning (verbatim from game/enemies.js).
  const QUEEN_FINISHER_WINDUP = 1.6;
  const QUEEN_FINISHER_RADIUS = 190;
  const QUEEN_FINISHER_KNOCKBACK = 820;
  const QUEEN_FINISHER_RESISTANCE = 400;
  const MOOGGY_CLAW_SWING = 0.22;
  const MOOGGY_CLAW_REACH_PAD = 34;
  const MOOGGY_CLAW_ARC = 1.0;

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function turnAngleToward(current, target, maxStep) {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return current + clamp(delta, -maxStep, maxStep);
  }

  function lineIntersectsRect(x1, y1, x2, y2, rect, padding = 0) {
    const minX = rect.x - padding;
    const minY = rect.y - padding;
    const maxX = rect.x + rect.w + padding;
    const maxY = rect.y + rect.h + padding;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    const checks = [[-dx, x1 - minX], [dx, maxX - x1], [-dy, y1 - minY], [dy, maxY - y1]];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return false;
        if (ratio > t0) t0 = ratio;
      } else {
        if (ratio < t0) return false;
        if (ratio < t1) t1 = ratio;
      }
    }
    return true;
  }

  function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSq, 0, 1) : 0;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const hitDx = cx - px;
    const hitDy = cy - py;
    if (hitDx * hitDx + hitDy * hitDy > radius * radius) return null;
    return { x: px, y: py, angle: Math.atan2(dy, dx) };
  }

  function createCampaignEnemyBehaviors(ctx) {
    const tuningOf = () => ctx.getTuning?.() || { reaction: 1, rangedCadence: 1, supportPower: 1 };
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const angleBetween = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
    const random = scope => (ctx.random ? ctx.random(scope) : Math.random());
    const randRange = (min, max, scope) => min + random(scope) * (max - min);

    function steerEnemy(enemy, dirX, dirY, maxSpeed, accel, dt) {
      const slowMultiplier = ctx.getSlowMultiplier?.(enemy) ?? 1;
      const packSpeedMultiplier = Math.max(1, Number(enemy.minorPackSpeedMultiplier || 1));
      const adjustedSpeed = maxSpeed * slowMultiplier * packSpeedMultiplier;
      enemy.vx += (dirX * adjustedSpeed - enemy.vx) * accel * dt;
      enemy.vy += (dirY * adjustedSpeed - enemy.vy) * accel * dt;
    }

    function hasLineOfSight(enemy, ax, ay, bx, by) {
      const rects = ctx.getCoverRects?.(enemy) || [];
      return !rects.some(rect => lineIntersectsRect(ax, ay, bx, by, rect, 3));
    }

    function findEnemyCoverTarget(enemy, preferredRange = 250) {
      const player = ctx.getPlayer(enemy);
      const obstacles = ctx.getCoverRects?.(enemy) || [];
      if (!player || !obstacles.length) return null;
      const bounds = ctx.bounds(enemy);
      let best = null;
      obstacles.forEach(rect => {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const awayX = cx - player.x;
        const awayY = cy - player.y;
        const awayLength = Math.hypot(awayX, awayY) || 1;
        const nx = awayX / awayLength;
        const ny = awayY / awayLength;
        const px = -ny;
        const py = nx;
        const baseOffset = Math.max(rect.w, rect.h) * 0.55 + enemy.r + 18;
        const sideOffset = Math.min(Math.max(rect.w, rect.h) * 0.32, 22);
        [
          { side: 0, depth: baseOffset },
          { side: sideOffset, depth: baseOffset + 8 },
          { side: -sideOffset, depth: baseOffset + 8 },
        ].forEach(sample => {
          const targetX = clamp(cx + nx * sample.depth + px * sample.side, bounds.wall + enemy.r, bounds.width - bounds.wall - enemy.r);
          const targetY = clamp(cy + ny * sample.depth + py * sample.side, bounds.wall + enemy.r, bounds.height - bounds.wall - enemy.r);
          if (ctx.isBlocked?.(enemy, targetX, targetY, enemy.r)) return;
          if (!lineIntersectsRect(player.x, player.y, targetX, targetY, rect, 6)) return;
          const enemyDistance = dist(enemy.x, enemy.y, targetX, targetY);
          const playerDistance = dist(player.x, player.y, targetX, targetY);
          if (enemyDistance > 360) return;
          const score = enemyDistance + Math.abs(playerDistance - preferredRange) * 0.55;
          if (!best || score < best.score) best = { x: targetX, y: targetY, score };
        });
      });
      return best;
    }

    function trySteerEnemyToCover(enemy, dt, preferredRange = 250, accel = 3.2) {
      const player = ctx.getPlayer(enemy);
      if (!player) return false;
      enemy.coverCheckCd = Math.max(0, Number(enemy.coverCheckCd || 0) - dt);
      const hasSight = hasLineOfSight(enemy, enemy.x, enemy.y, player.x, player.y);
      const coverTarget = enemy.coverTarget;
      const needsNewTarget = !coverTarget
        || enemy.coverCheckCd <= 0
        || dist(enemy.x, enemy.y, coverTarget.x, coverTarget.y) < 18
        || !hasSight;
      if (needsNewTarget) {
        enemy.coverCheckCd = 0.35;
        enemy.coverTarget = hasSight ? findEnemyCoverTarget(enemy, preferredRange) : null;
      }
      if (!enemy.coverTarget) return false;
      const dx = enemy.coverTarget.x - enemy.x;
      const dy = enemy.coverTarget.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 16) {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        return true;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, accel, dt);
      return true;
    }

    function rollEnemyBeamBias(enemy, maxError = 0.14) {
      const bias = (random('encounter') - 0.5) * 2 * maxError;
      enemy.beamAimBias = bias;
      return bias;
    }

    function aimEnemyBeam(enemy, dt, turnRate) {
      const player = ctx.getPlayer(enemy);
      if (!player || turnRate <= 0) return;
      const targetAngle = angleBetween(enemy, player) + Number(enemy.beamAimBias || 0);
      enemy.beamAngle = turnAngleToward(Number(enemy.beamAngle || 0), targetAngle, turnRate * dt * 0.72);
    }

    function tickEnemyBeam(enemy, dt, config = {}) {
      const {
        tick = 0.1,
        range = 430,
        knockback = 130,
        damage = enemy.dmg,
        speedDamp = 0.84,
        turnRate = 0,
        onTick = null,
        onEnd = null,
      } = config;
      enemy.beamTime -= dt;
      enemy.beamTick = Number(enemy.beamTick || 0) - dt;
      enemy.vx *= speedDamp;
      enemy.vy *= speedDamp;
      if (turnRate > 0) aimEnemyBeam(enemy, dt, turnRate * 0.55);
      if (typeof onTick === 'function') onTick(enemy, dt);
      if (enemy.beamTick <= 0) {
        enemy.beamTick = tick;
        const endX = enemy.x + Math.cos(enemy.beamAngle) * range;
        const endY = enemy.y + Math.sin(enemy.beamAngle) * range;
        (ctx.getPlayers?.(enemy) || []).forEach(player => {
          const hit = segmentHitsCircle(enemy.x, enemy.y, endX, endY, player.x, player.y, player.r + 5);
          if (hit) ctx.damagePlayer(enemy, player, damage, hit.angle, knockback, enemy.type);
        });
      }
      if (enemy.beamTime <= 0) {
        enemy.beamAimBias = 0;
        if (typeof onEnd === 'function') onEnd(enemy);
        return true;
      }
      return false;
    }

    // --- projectile evade (juke) system -------------------------------------

    function getEnemyProjectileEvadeChance(enemy) {
      const difficultyRank = ctx.getEvadeDifficultyRank?.() ?? 0;
      const level = Math.max(1, Number(enemy.progressionLevel || 1));
      const difficultyBonus = [0, 0.06, 0.14, 0.23, 0.33][difficultyRank] || 0;
      const roleBonus = enemy.boss ? 0.2 : enemy.elite ? 0.08 : 0;
      if (difficultyRank <= 0 && roleBonus <= 0) return 0;
      const unfazedBonus = (Number(enemy.eliteUnfazed) || 0) * 0.02;
      return clamp(0.02 + (level - 1) * 0.018 + difficultyBonus + roleBonus + unfazedBonus, 0.02, 0.9);
    }

    function findEnemyEvadeDashAngle(enemy, threatSegment, dashDistance = 190) {
      const player = ctx.getPlayer(enemy);
      if (!player || !threatSegment) return null;
      const bounds = ctx.bounds(enemy);
      const beamAngle = Math.atan2(threatSegment.y2 - threatSegment.y1, threatSegment.x2 - threatSegment.x1);
      const awayFromPlayer = angleBetween(player, enemy);
      const candidates = [
        beamAngle + Math.PI / 2,
        beamAngle - Math.PI / 2,
        awayFromPlayer,
        beamAngle + Math.PI / 2 + 0.42,
        beamAngle + Math.PI / 2 - 0.42,
        beamAngle - Math.PI / 2 + 0.42,
        beamAngle - Math.PI / 2 - 0.42,
      ];
      let best = null;
      candidates.forEach(angle => {
        const targetX = clamp(enemy.x + Math.cos(angle) * dashDistance, bounds.wall + enemy.r, bounds.width - bounds.wall - enemy.r);
        const targetY = clamp(enemy.y + Math.sin(angle) * dashDistance, bounds.wall + enemy.r, bounds.height - bounds.wall - enemy.r);
        if (ctx.isBlocked?.(enemy, targetX, targetY, enemy.r)) return;
        if (segmentHitsCircle(threatSegment.x1, threatSegment.y1, threatSegment.x2, threatSegment.y2, targetX, targetY, enemy.r + 12)) return;
        if (ctx.isPointThreatenedByPlayerBeam?.(enemy, targetX, targetY, enemy.r + 12)) return;
        const travel = dist(enemy.x, enemy.y, targetX, targetY);
        const playerDistance = dist(player.x, player.y, targetX, targetY);
        const score = travel + playerDistance * 0.18;
        if (!best || score > best.score) best = { angle, score };
      });
      return best?.angle ?? null;
    }

    function updateEnemyProjectileEvade(enemy, dt) {
      const evadeChance = getEnemyProjectileEvadeChance(enemy);
      if (evadeChance <= 0) return false;
      enemy.projectileEvadeCd = Math.max(0, Number(enemy.projectileEvadeCd || 0) - dt);

      if (enemy.projectileEvadeTime > 0) {
        enemy.projectileEvadeTime = Math.max(0, enemy.projectileEvadeTime - dt);
        const dashSpeed = enemy.boss ? 720 : 580;
        enemy.vx = Math.cos(enemy.projectileEvadeAngle) * dashSpeed;
        enemy.vy = Math.sin(enemy.projectileEvadeAngle) * dashSpeed;
        if (enemy.projectileEvadeTime <= 0) {
          enemy.vx *= 0.45;
          enemy.vy *= 0.45;
        }
        return true;
      }

      if (enemy.projectileEvadeCd > 0 || enemy.stun > 0 || enemy.airborne) return false;

      const threat = ctx.getHostileThreat?.(enemy, 30);
      if (!threat) {
        enemy.lastProjectileEvadeThreatId = null;
        return false;
      }
      if (enemy.lastProjectileEvadeThreatId === threat.sourceId) return false;
      enemy.lastProjectileEvadeThreatId = threat.sourceId;
      enemy.projectileEvadeCd = 0.18;
      if (random('encounter') >= evadeChance) return false;
      // Bowman's Bane answers threats with his signature warp, not a dash.
      if (enemy.type === 'bowman_bane') return warpBowmanBane(enemy);

      const evadeAngle = findEnemyEvadeDashAngle(enemy, threat.segment, 205);
      if (evadeAngle == null) return false;
      enemy.windup = 0;
      enemy.beamTime = 0;
      enemy.beamTick = 0;
      enemy.dashTime = 0;
      enemy.projectileEvadeAngle = evadeAngle;
      enemy.projectileEvadeTime = 0.27;
      enemy.projectileEvadeCd = enemy.boss ? 2.6 : 3.2;
      return true;
    }

    // --- authored per-type behaviors ---------------------------------------

    function updateHunterEnemy(enemy, dt) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
      if (distance < enemy.r + player.r + 10 && enemy.attackCd <= 0) {
        const angle = Math.atan2(dy, dx);
        enemy.attackAnimT = 0.24;
        ctx.damagePlayer(enemy, player, enemy.dmg, angle, 160, enemy.type);
        enemy.attackCd = 1.05;
      }
    }

    function updateCultMageEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      const hpPct = enemy.hp / enemy.max;
      const desired = hpPct < 0.35 ? 360 : 270;
      const retreat = hpPct < 0.35 && distance < desired ? -1 : 1;
      const direction = distance < desired - 24 ? -retreat : distance > desired + 24 ? retreat : 0;
      if (enemy.attackCd > 0.45 && trySteerEnemyToCover(enemy, dt, desired, 2.6)) {
        // Hold cover while the beam is unavailable instead of idling in open sight.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.5, dt);
      }

      // Close-range AOE nova: telegraphed knockback burst to make space when crowded.
      if (enemy.type === 'cult_mage') {
        const wasChargingNova = Number(enemy.novaTimer || 0) > 0;
        enemy.novaTimer = Math.max(0, Number(enemy.novaTimer || 0) - dt);
        enemy.novaCd = Math.max(0, Number(enemy.novaCd || 0) - dt);
        if (wasChargingNova) {
          enemy.vx *= 0.84;
          enemy.vy *= 0.84;
          if (enemy.novaTimer <= 0) {
            ctx.blastRadius(enemy, enemy.x, enemy.y, 120, Math.round(enemy.dmg * 1.1), 300);
          }
          return;
        }
        if (enemy.novaCd <= 0 && enemy.windup <= 0 && enemy.beamTime <= 0 && distance < 150) {
          enemy.novaTimer = 0.5 / tuning.reaction;
          enemy.novaCd = 4.4 * tuning.rangedCadence;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'cult_mage_nova' });
          return;
        }
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        aimEnemyBeam(enemy, dt, 2.9 * tuning.reaction);
        if (enemy.windup <= 0) {
          enemy.beamTime = 0.58;
          enemy.beamTick = 0;
        }
        return;
      }

      if (enemy.beamTime > 0) {
        tickEnemyBeam(enemy, dt, {
          tick: 0.1,
          range: 460,
          knockback: 145,
          damage: enemy.dmg,
          speedDamp: 0.84,
          turnRate: 1.8,
        });
        return;
      }

      if (enemy.attackCd <= 0 && distance < 430) {
        enemy.windup = 0.86 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.18);
        enemy.attackCd = 2.9 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }
    }

    function updateKnaveEnemy(enemy, dt) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.86;
        enemy.vy *= 0.86;
        return;
      }

      const KNAVE_BLADE_REACH = enemy.r + player.r + 56;
      const KNAVE_BLADE_ARC = 1.15;

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.76;
        enemy.vy *= 0.76;
        // Track the player through the wind-up so the blade lands where they are.
        if (enemy.state !== 'charge') enemy.swingA = Math.atan2(dy, dx);
        if (enemy.windup <= 0) {
          if (enemy.state === 'charge') {
            enemy.dashTime = 0.3;
            enemy.dashHit = false;
          } else {
            enemy.swingTime = 0.26;
            enemy.bladeHit = false;
          }
        }
        return;
      }

      if (enemy.dashTime > 0) {
        enemy.dashTime -= dt;
        enemy.vx = Math.cos(enemy.dashAngle) * 450;
        enemy.vy = Math.sin(enemy.dashAngle) * 450;
        if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 7) {
          enemy.dashHit = true;
          ctx.damagePlayer(enemy, player, enemy.dmg + 6, enemy.dashAngle, 260, enemy.type);
        }
        return;
      }

      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        // Connect once at the arc's apex: a wide forward swipe with real reach.
        if (!enemy.bladeHit && enemy.swingTime <= 0.12) {
          const toPlayer = Math.atan2(dy, dx);
          const angleDiff = Math.abs(Math.atan2(Math.sin(toPlayer - enemy.swingA), Math.cos(toPlayer - enemy.swingA)));
          if (distance < KNAVE_BLADE_REACH && angleDiff < KNAVE_BLADE_ARC) {
            enemy.bladeHit = true;
            ctx.damagePlayer(enemy, player, enemy.dmg + 5, toPlayer, 240, enemy.type);
          }
        }
        return;
      }

      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.8, dt);

      if (enemy.attackCd <= 0) {
        if (distance > 190) {
          enemy.state = 'charge';
          enemy.windup = 0.46;
          enemy.dashAngle = Math.atan2(dy, dx);
          enemy.attackCd = 1.9;
        } else {
          enemy.state = 'blade';
          enemy.swingA = Math.atan2(dy, dx);
          enemy.windup = 0.28;
          enemy.attackCd = 1.05;
        }
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: `knave_${enemy.state}` });
      }
    }

    function updateSniperEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        aimEnemyBeam(enemy, dt, 2.6 * tuning.reaction);
        if (enemy.windup <= 0) {
          const angle = enemy.beamAngle;
          const projectileSpeed = 360 * Math.min(1.4, tuning.reaction);
          ctx.spawnProjectile(enemy, {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * projectileSpeed,
            vy: Math.sin(angle) * projectileSpeed,
            r: 5,
            life: 1.6,
            kind: 'sniper_round',
            source: 'sniper_projectile',
            damage: enemy.dmg + 5,
          });
        }
        return;
      }

      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        enemy.vx *= 0.75;
        enemy.vy *= 0.75;
        if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 20) {
          ctx.damagePlayer(enemy, player, enemy.dmg + 2, Math.atan2(dy, dx), 170, enemy.type);
        }
        return;
      }

      const behavior = enemy.sniperBehavior || 'stayback';

      if (behavior === 'melee') {
        steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.6, dt);
        if (enemy.attackCd <= 0) {
          if (distance <= enemy.r + player.r + 22) {
            enemy.swingTime = 0.16;
            enemy.attackCd = 0.9 * tuning.rangedCadence;
          } else if (distance < 520) {
            enemy.windup = 0.6 / tuning.reaction;
            enemy.beamAngle = Math.atan2(dy, dx);
            enemy.attackCd = 2.2 * tuning.rangedCadence;
            ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
          }
        }
        return;
      }

      const desired = behavior === 'aggressive' ? 150 : 290;
      const direction = distance < desired - 20 ? -1 : distance > desired + 20 ? 1 : 0;
      if (behavior === 'stayback' && enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.8)) {
        // Snipers relocate behind obstacles between shots.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.6, dt);
      }

      if (enemy.attackCd <= 0) {
        if (distance <= 74) {
          enemy.swingTime = 0.16;
          enemy.attackCd = 0.95 * tuning.rangedCadence;
        } else if (distance < 520) {
          enemy.windup = 0.6 / tuning.reaction;
          enemy.beamAngle = Math.atan2(dy, dx);
          enemy.attackCd = 2.2 * tuning.rangedCadence;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
        }
      }
    }

    function updateMachineGunnerEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.86;
        enemy.vy *= 0.86;
        aimEnemyBeam(enemy, dt, 3.2 * tuning.reaction);
        if (enemy.windup <= 0) {
          enemy.burstShots = tuning.supportPower >= 1.22 ? 6 : 5;
          enemy.burstDelay = 0;
          enemy.burstAngle = enemy.beamAngle;
        }
        return;
      }

      if ((enemy.burstShots || 0) > 0) {
        enemy.burstDelay -= dt;
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        if (enemy.burstDelay <= 0) {
          enemy.burstDelay = 0.085 * Math.max(0.72, tuning.rangedCadence);
          enemy.burstShots -= 1;
          const baseAngle = angleBetween(enemy, player);
          enemy.burstAngle = turnAngleToward(Number(enemy.burstAngle ?? baseAngle), baseAngle, 0.22 * tuning.reaction);
          const spread = ((random('encounter') - 0.5) * 0.18) / Math.max(0.92, tuning.reaction);
          const fireAngle = enemy.burstAngle + spread;
          const projectileSpeed = 300 * Math.min(1.45, tuning.reaction + 0.06);
          ctx.spawnProjectile(enemy, {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(fireAngle) * projectileSpeed,
            vy: Math.sin(fireAngle) * projectileSpeed,
            r: 4,
            life: 1.45,
            kind: 'machine_round',
            source: 'machine_gunner_projectile',
            damage: enemy.dmg + 2,
          });
        }
        return;
      }

      const desired = 250;
      const direction = distance < desired - 24 ? -1 : distance > desired + 18 ? 1 : 0;
      if (enemy.attackCd > 0.3 && trySteerEnemyToCover(enemy, dt, desired, 4.1)) {
        // Machine gunners burst, then duck back toward hard cover.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.9, dt);
      }

      if (enemy.attackCd <= 0) {
        if (distance < 90) {
          enemy.swingTime = 0.16;
          enemy.attackCd = 0.88 * tuning.rangedCadence;
        } else if (distance < 460) {
          enemy.windup = 0.38 / tuning.reaction;
          enemy.beamAngle = Math.atan2(dy, dx);
          enemy.attackCd = 2.45 * tuning.rangedCadence;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
        }
      }

      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        enemy.vx *= 0.78;
        enemy.vy *= 0.78;
        if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 18) {
          ctx.damagePlayer(enemy, player, enemy.dmg + 3, Math.atan2(dy, dx), 180, enemy.type);
        }
      }
    }

    function updateGolemEnemy(enemy, dt) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      if (enemy.spitWindup > 0) {
        enemy.spitWindup -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        if (enemy.spitWindup <= 0) {
          const angle = angleBetween(enemy, player);
          ctx.spawnProjectile(enemy, {
            x: enemy.x + Math.cos(angle) * (enemy.r + 6),
            y: enemy.y + Math.sin(angle) * (enemy.r + 6),
            vx: Math.cos(angle) * 300,
            vy: Math.sin(angle) * 300,
            r: 9,
            life: 2.2,
            kind: 'golem_spit',
            source: 'golem_projectile',
            damage: enemy.dmg + 4,
            statusEffects: [{ key: 'poison', chance: 1, stacks: 1, duration: 4.2 }],
          });
        }
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        if (enemy.windup <= 0) {
          enemy.dashTime = 0.34;
          enemy.dashHit = false;
        }
        return;
      }

      if (enemy.dashTime > 0) {
        enemy.dashTime -= dt;
        enemy.vx = Math.cos(enemy.dashAngle) * 390;
        enemy.vy = Math.sin(enemy.dashAngle) * 390;
        if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
          enemy.dashHit = true;
          ctx.damagePlayer(enemy, player, enemy.dmg + 6, enemy.dashAngle, 280, enemy.type);
        }
        return;
      }

      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.1, dt);
      if (enemy.attackCd <= 0) {
        if (distance < 460) {
          enemy.windup = 0.62;
          enemy.dashAngle = Math.atan2(dy, dx);
          enemy.attackCd = 2.6;
        } else {
          // Too far to close the gap with a dash — hurl a sludge spit instead.
          enemy.spitWindup = 0.7;
          enemy.attackCd = 2.6;
        }
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }
    }

    function updateSummonerEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      const desired = 260;
      const direction = distance < desired - 30 ? -1 : distance > desired + 20 ? 1 : 0;
      if (enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, desired, 3.2)) {
        // Summoners reposition while their beam is cooling down.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.1, dt);
      }

      enemy.summonCd = Math.max(0, Number(enemy.summonCd || 0) - dt);
      if (enemy.summonCd <= 0) {
        const floor = ctx.getFloor?.() || 1;
        enemy.summonCd = (floor >= 4 ? 4.2 : 5) * Math.max(0.72, tuning.rangedCadence);
        const summonCount = floor >= 4 && tuning.supportPower >= 1.22 ? 3 : 2;
        for (let index = 0; index < summonCount; index += 1) {
          const angle = random('encounter') * Math.PI * 2;
          const px = enemy.x + Math.cos(angle) * (40 + index * 18);
          const py = enemy.y + Math.sin(angle) * (40 + index * 18);
          ctx.spawnSummon(enemy, 'cult_follower', px, py);
        }
      }

      if (enemy.attackCd <= 0 && distance < 360) {
        enemy.windup = 0.6 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.17);
        enemy.attackCd = 2.6 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }

      if (enemy.windup > 0 || enemy.beamTime > 0) {
        updateCultMageEnemy(enemy, dt);
      }
    }

    function updateShieldUnitEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      const desired = 180;
      const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.6, dt);

      // Taking damage opens a lockout window; while active the unit can't
      // reapply shields, so it can't re-shield itself the instant it's hit.
      enemy._shieldHitLockout = Math.max(0, (enemy._shieldHitLockout || 0) - dt);
      enemy.supportCd = Math.max(0, Number(enemy.supportCd || 0) - dt);
      if (enemy._shieldHitLockout > 0) {
        enemy.supportCd = Math.max(enemy.supportCd, 0.5);
      } else if (enemy.supportCd <= 0) {
        enemy.supportCd = 2.9 * Math.max(0.76, tuning.rangedCadence);
        (ctx.getAllies?.(enemy) || []).forEach(other => {
          if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
          ctx.grantBarrier(enemy, other, Math.round(other.max * 0.22 * tuning.supportPower));
        });
        ctx.grantBarrier(enemy, enemy, Math.round(enemy.max * 0.14 * tuning.supportPower));
        ctx.emit?.('ENEMY_SUPPORT_USED', { enemyId: enemy.id, supportKind: 'shield' });
      }

      if (enemy.attackCd <= 0 && distance < enemy.r + player.r + 22) {
        ctx.damagePlayer(enemy, player, enemy.dmg, Math.atan2(dy, dx), 170, enemy.type);
        enemy.attackCd = 1.05 * tuning.rangedCadence;
      }
    }

    function updateHealerEnemy(enemy, dt) {
      const tuning = tuningOf();
      const allies = ctx.getAllies?.(enemy) || [];
      const nearestWounded = allies.reduce((best, candidate) => {
        if (candidate.hp >= candidate.max) return best;
        const d = dist(enemy.x, enemy.y, candidate.x, candidate.y);
        if (!best || d < best.distance) return { enemy: candidate, distance: d };
        return best;
      }, null);
      const player = ctx.getPlayer(enemy);
      const target = nearestWounded?.enemy || player;
      if (!target) { enemy.vx *= 0.9; enemy.vy *= 0.9; return; }
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      const desired = nearestWounded ? 120 : 260;
      const direction = distance < desired - 18 ? -1 : distance > desired + 24 ? 1 : 0;
      if (!nearestWounded && enemy.attackCd > 0.4 && trySteerEnemyToCover(enemy, dt, 250, 2.9)) {
        // Healers without an active support target play safer angles.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 2.8, dt);
      }

      enemy.supportCd = Math.max(0, Number(enemy.supportCd || 0) - dt);
      if (enemy.supportCd <= 0) {
        const floor = ctx.getFloor?.() || 1;
        enemy.supportCd = (floor >= 4 ? 2.1 : 2.8) * Math.max(0.74, tuning.rangedCadence);
        let healedAny = false;
        allies.forEach(other => {
          if (dist(enemy.x, enemy.y, other.x, other.y) > 170) return;
          const heal = Math.max(8, Math.round(other.max * (floor >= 4 ? 0.08 : 0.05) * tuning.supportPower));
          if (ctx.healEnemy(enemy, other, heal) > 0) healedAny = true;
        });
        if (healedAny) ctx.emit?.('ENEMY_SUPPORT_USED', { enemyId: enemy.id, supportKind: 'healer' });
      }

      if (enemy.attackCd <= 0 && !nearestWounded && player && distance < 350) {
        enemy.windup = 0.54 / tuning.reaction;
        enemy.beamAngle = angleBetween(enemy, player) + rollEnemyBeamBias(enemy, 0.16);
        enemy.attackCd = 2.8 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }

      if (enemy.windup > 0 || enemy.beamTime > 0) {
        updateLaserEnemy(enemy, dt);
      }
    }

    function updateBossSpawnerEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      // Big telegraphed knockback shockwave: the spawner's only direct defence.
      if (enemy.shoveTimer > 0) {
        enemy.shoveTimer -= dt;
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        if (enemy.shoveTimer <= 0) {
          ctx.blastRadius(enemy, enemy.x, enemy.y, 200, Math.round(enemy.dmg * 1.4), 760);
        }
        return;
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.92;
        enemy.vy *= 0.92;
      } else {
        // Always flee: the spawner is a runner whose job is to survive until
        // the boss arrives.
        const fleeX = -dx / distance;
        const fleeY = -dy / distance;
        if (enemy.attackCd > 0.45 && distance > 280 && trySteerEnemyToCover(enemy, dt, 420, 2.6)) {
          // Break line of sight behind cover when it has breathing room.
        } else {
          steerEnemy(enemy, fleeX, fleeY, enemy.speed, 2.6, dt);
        }
        if (enemy.shoveCd <= 0 && distance < 170) {
          enemy.shoveTimer = 0.7 / tuning.reaction;
          enemy.shoveCd = 5 * tuning.rangedCadence;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'boss_spawner_shove' });
          return;
        }
      }
      enemy.shoveCd = Math.max(0, Number(enemy.shoveCd || 0) - dt);

      enemy.bossSpawnTimer = Math.max(0, Number(enemy.bossSpawnTimer ?? 20) - dt);
      const wholeSeconds = Math.ceil(enemy.bossSpawnTimer);
      if (wholeSeconds > 0 && wholeSeconds <= 10 && wholeSeconds !== enemy.bossSpawnWarnAt) {
        enemy.bossSpawnWarnAt = wholeSeconds;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'boss_countdown', secondsLeft: wholeSeconds });
      }

      if (enemy.bossSpawnTimer <= 0) {
        ctx.spawnFloorBoss(enemy);
        return;
      }

      if (enemy.attackCd <= 0 && distance < 420) {
        enemy.windup = 0.68 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.16);
        enemy.attackCd = 3.1 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }

      if (enemy.windup > 0 || enemy.beamTime > 0) {
        updateLaserEnemy(enemy, dt);
      }
    }

    function updateLaserEnemy(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.86;
        enemy.vy *= 0.86;
        aimEnemyBeam(enemy, dt, 3.3 * tuning.reaction);
        if (enemy.windup <= 0) {
          enemy.beamTime = 0.46;
          enemy.beamTick = 0;
        }
        return;
      }

      if (enemy.beamTime > 0) {
        tickEnemyBeam(enemy, dt, {
          tick: 0.11 * Math.max(0.74, tuning.rangedCadence),
          range: 430,
          knockback: 130,
          damage: enemy.dmg,
          speedDamp: 0.84,
          turnRate: 2.3 * tuning.reaction,
        });
        return;
      }

      const desired = 230;
      const direction = distance < desired - 25 ? -1 : distance > desired + 25 ? 1 : 0;
      if (enemy.attackCd > 0.35 && trySteerEnemyToCover(enemy, dt, desired, 3.3)) {
        // Laser units search for cover when their firing lane is not active.
      } else {
        steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.2, dt);
      }
      if (enemy.attackCd <= 0 && distance < 390) {
        enemy.windup = 0.78 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.2);
        enemy.attackCd = 2.8 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }
    }

    function updateChargerEnemy(enemy, dt) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.stun > 0) {
        enemy.vx *= 0.86;
        enemy.vy *= 0.86;
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        if (enemy.windup <= 0) {
          enemy.dashTime = 0.32;
          enemy.dashHit = false;
        }
        return;
      }

      if (enemy.dashTime > 0) {
        enemy.dashTime -= dt;
        enemy.vx = Math.cos(enemy.dashAngle) * 430;
        enemy.vy = Math.sin(enemy.dashAngle) * 430;
        if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 6) {
          enemy.dashHit = true;
          ctx.damagePlayer(enemy, player, enemy.dmg + 4, enemy.dashAngle, 240, enemy.type);
        }
        return;
      }

      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.1, dt);
      if (enemy.attackCd <= 0 && distance < 420) {
        enemy.windup = 0.52;
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.attackCd = 2.4;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }
    }

    function updateEliteEnemyTraits(enemy, dt) {
      if (!enemy?.elite || !Array.isArray(enemy.eliteTypes)) return false;
      const player = ctx.getPlayer(enemy);
      const distanceToPlayer = player ? dist(enemy.x, enemy.y, player.x, player.y) : Infinity;

      if (enemy.eliteTypes.includes('burning')) {
        enemy.burningTick = Math.max(0, Number(enemy.burningTick || 0) - dt);
        if (enemy.burningTick <= 0) {
          enemy.burningTick = 1.15;
          if (player && distanceToPlayer < enemy.r + player.r + 34) {
            ctx.applyPlayerStatus(enemy, player, 'fire', 1, 2.8);
          }
        }
      }

      if (enemy.eliteTypes.includes('bleeding')) {
        enemy.bleedingTick = Math.max(0, Number(enemy.bleedingTick || 0) - dt);
        if (enemy.bleedingTick <= 0) {
          enemy.bleedingTick = 1.25;
          if (player && distanceToPlayer < enemy.r + player.r + 28) {
            ctx.applyPlayerStatus(enemy, player, 'bleed', 1, 2.2);
          }
        }
      }

      if (!enemy.eliteTypes.includes('lasered') && !enemy.eliteTypes.includes('lazered')) return false;
      if (enemy.beamTime > 0 && enemy.state === 'elite_laser') {
        tickEnemyBeam(enemy, dt, {
          tick: enemy.eliteLaserMode === 'god_sweep' ? 0.055 : enemy.eliteLaserMode === 'turtle_wave' ? 0.08 : 0.1,
          range: enemy.eliteLaserMode === 'turtle_wave' ? 620 : enemy.eliteLaserMode === 'god_sweep' ? 560 : 430,
          knockback: enemy.eliteLaserMode === 'turtle_wave' ? 190 : enemy.eliteLaserMode === 'god_sweep' ? 145 : 125,
          damage: enemy.dmg + (enemy.eliteLaserMode === 'turtle_wave' ? 14 : enemy.eliteLaserMode === 'god_sweep' ? 8 : 0),
          speedDamp: 0.84,
          turnRate: enemy.eliteLaserMode === 'god_sweep' ? 0 : 2.6,
          onTick: activeEnemy => {
            if (activeEnemy.eliteLaserMode === 'god_sweep') activeEnemy.beamAngle += Number(activeEnemy.eliteSweepSpeed || 3.8) * 0.055;
          },
          onEnd: activeEnemy => {
            activeEnemy.state = 'idle';
            activeEnemy.eliteLaserCd = 1.35;
          },
        });
        return true;
      }

      enemy.eliteLaserCd = Math.max(0, Number(enemy.eliteLaserCd || 0) - dt);
      if (enemy.eliteLaserCd > 0 || !player || distanceToPlayer > 520) return false;

      // Elite lasers cycle authored player moves. lightning_columns is skipped
      // when the runtime has no hazard hook for it.
      const modes = ['blood_beam', 'turtle_wave', 'power_disks', 'blade_justice', 'lightning_columns', 'god_sweep'];
      const mode = modes[Number(enemy.eliteLaserModeIndex || 0) % modes.length];
      enemy.eliteLaserModeIndex = Number(enemy.eliteLaserModeIndex || 0) + 1;
      const angle = angleBetween(enemy, player);

      if (mode === 'power_disks') {
        for (let index = 0; index < 5; index += 1) {
          const spread = (index - 2) * 0.16;
          ctx.spawnProjectile(enemy, {
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle + spread) * 360,
            vy: Math.sin(angle + spread) * 360,
            r: 7,
            life: 1.15,
            kind: 'power_disk',
            source: `${enemy.type || 'laser'}_projectile`,
            damage: Math.round(enemy.dmg * 0.72),
            knockback: 110,
          });
        }
        enemy.eliteLaserCd = 1.4;
        return false;
      }

      if (mode === 'blade_justice') {
        if (distanceToPlayer < 150) ctx.damagePlayer(enemy, player, enemy.dmg + 10, angle, 240, 'elite_blade_justice');
        enemy.eliteLaserCd = 1.2;
        return false;
      }

      if (mode === 'lightning_columns') {
        if (typeof ctx.spawnLightningColumns === 'function') {
          ctx.spawnLightningColumns(enemy, player, Math.round(enemy.dmg * 0.78));
        }
        enemy.eliteLaserCd = 1.6;
        return false;
      }

      enemy.state = 'elite_laser';
      enemy.eliteLaserMode = mode === 'god_sweep' ? 'god_sweep' : mode === 'turtle_wave' ? 'turtle_wave' : 'blood_beam';
      enemy.beamAngle = angle;
      enemy.beamTime = enemy.eliteLaserMode === 'god_sweep' ? 1.4 : enemy.eliteLaserMode === 'turtle_wave' ? 0.9 : 0.56;
      enemy.beamTick = 0;
      enemy.eliteSweepSpeed = (random('encounter') < 0.5 ? -1 : 1) * 4.1;
      enemy.eliteLaserCd = 99;
      ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: `elite_${enemy.eliteLaserMode}` });
      return true;
    }

    // Hidden player (cape/flying/warp): wander to random points and keep up a
    // blind defense so the room still feels alive.
    function wanderEnemy(enemy, dt) {
      if (enemy.beamTime > 0) { enemy.beamTime = 0; if (enemy.state === 'elite_laser') enemy.state = 'idle'; }
      blindDefendEnemy(enemy, dt);
      if (enemy.swingTime > 0) return;
      const bounds = ctx.bounds(enemy);
      enemy.wanderT = Math.max(0, (enemy.wanderT || 0) - dt);
      const margin = (enemy.r || 8) + bounds.wall + 4;
      const reached = enemy.wanderTx != null
        && Math.hypot(enemy.wanderTx - enemy.x, enemy.wanderTy - enemy.y) < 16;
      if (enemy.wanderTx == null || reached || enemy.wanderT <= 0) {
        enemy.wanderTx = randRange(margin, bounds.width - margin, 'encounter');
        enemy.wanderTy = randRange(margin, bounds.height - margin, 'encounter');
        enemy.wanderT = randRange(1.4, 3.2, 'encounter');
      }
      const dx = enemy.wanderTx - enemy.x;
      const dy = enemy.wanderTy - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const speed = Math.max(20, (enemy.speed || 60) * 0.45);
        steerEnemy(enemy, dx / distance, dy / distance, speed, 2.0, dt);
      } else {
        enemy.vx *= Math.pow(0.0001, dt);
        enemy.vy *= Math.pow(0.0001, dt);
      }
    }

    const BLIND_RANGED_TYPES = new Set(['laser', 'sniper', 'machine_gunner', 'cult_mage', 'summoner', 'healer', 'boss_spawner']);

    function blindDefendEnemy(enemy, dt) {
      if (enemy.boss) return; // bosses run their own scripted AI
      if (enemy.stun > 0 || enemy.airborne) return;
      enemy.attackCd = Math.max(0, Number(enemy.attackCd || 0) - dt);

      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        const player = ctx.getPlayer(enemy);
        if (enemy.swingTime <= 0 && player && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 20) {
          ctx.damagePlayer(enemy, player, enemy.dmg, angleBetween(enemy, player), 180, enemy.type);
        }
        return;
      }
      if (enemy.attackCd > 0) return;

      const angle = randRange(0, Math.PI * 2, 'encounter');
      if (BLIND_RANGED_TYPES.has(enemy.type)) {
        const tuning = tuningOf();
        const speed = 260;
        ctx.spawnProjectile(enemy, {
          x: enemy.x + Math.cos(angle) * (enemy.r + 4),
          y: enemy.y + Math.sin(angle) * (enemy.r + 4),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 4,
          life: 1.3,
          kind: 'enemy_shot',
          source: `${enemy.type}_blind_shot`,
          damage: enemy.dmg,
        });
        enemy.attackCd = randRange(1.6, 2.6, 'encounter') * (tuning?.rangedCadence || 1);
      } else {
        enemy.swingTime = 0.18;
        steerEnemy(enemy, Math.cos(angle), Math.sin(angle), (enemy.speed || 60) * 0.6, 3.0, dt);
        enemy.attackCd = randRange(1.4, 2.4, 'encounter');
      }
    }

    // --- boss helpers -------------------------------------------------------

    // Spiral-probe for the closest unblocked landing spot (findSafeEnemySpawnPoint).
    function findSafeLanding(enemy, preferredX, preferredY, radius = enemy.r) {
      const bounds = ctx.bounds(enemy);
      const clampX = value => clamp(value, bounds.wall + radius, bounds.width - bounds.wall - radius);
      const clampY = value => clamp(value, bounds.wall + radius, bounds.height - bounds.wall - radius);
      const baseX = clampX(preferredX);
      const baseY = clampY(preferredY);
      if (!ctx.isBlocked?.(enemy, baseX, baseY, radius)) return { x: baseX, y: baseY };
      const rings = [24, 48, 78, 112, 150];
      for (const ring of rings) {
        for (let step = 0; step < 10; step += 1) {
          const angle = (Math.PI * 2 * step) / 10;
          const x = clampX(baseX + Math.cos(angle) * ring);
          const y = clampY(baseY + Math.sin(angle) * ring);
          if (!ctx.isBlocked?.(enemy, x, y, radius)) return { x, y };
        }
      }
      return null;
    }

    function findBowmanWarpDestination(enemy) {
      const player = ctx.getPlayer(enemy);
      if (!player) return null;
      const bounds = ctx.bounds(enemy);
      const baseAngle = angleBetween(player, enemy);
      const idealRange = enemy.phase >= 2 ? 300 : 270;
      let best = null;
      for (let index = 0; index < 12; index += 1) {
        const angle = baseAngle + Math.PI + (index / 12) * Math.PI * 2;
        const range = idealRange + (index % 3 - 1) * 46;
        const preferredX = clamp(player.x + Math.cos(angle) * range, bounds.wall + enemy.r, bounds.width - bounds.wall - enemy.r);
        const preferredY = clamp(player.y + Math.sin(angle) * range, bounds.wall + enemy.r, bounds.height - bounds.wall - enemy.r);
        const landing = findSafeLanding(enemy, preferredX, preferredY, enemy.r);
        if (!landing || ctx.isPointThreatenedByPlayerBeam?.(enemy, landing.x, landing.y, enemy.r + 18)) continue;
        const playerDistance = dist(player.x, player.y, landing.x, landing.y);
        const travel = dist(enemy.x, enemy.y, landing.x, landing.y);
        if (travel < 120) continue;
        const score = travel - Math.abs(playerDistance - idealRange) * 1.4;
        if (!best || score > best.score) best = { ...landing, score };
      }
      return best;
    }

    function warpBowmanBane(enemy) {
      const landing = findBowmanWarpDestination(enemy);
      if (!landing) return false;
      enemy.x = landing.x;
      enemy.y = landing.y;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.windup = 0;
      enemy.beamTime = 0;
      enemy.beamTick = 0;
      enemy.projectileEvadeCd = 2.4;
      enemy.bowmanWarpCd = enemy.phase >= 2 ? 3.2 : 4.4;
      ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'bowman_warp' });
      return true;
    }

    // Forward melee arc shared by Antony's slash, the Devil's claw and Bowman's
    // thunder smash: hits every player inside reach + halfArc of the facing.
    function meleeArcStrike(enemy, angle, reachPad, halfArc, damage, knockback, sourceLabel, onHitPlayer) {
      (ctx.getPlayers?.(enemy) || []).forEach(player => {
        const pdx = player.x - enemy.x;
        const pdy = player.y - enemy.y;
        const pDist = Math.hypot(pdx, pdy) || 1;
        let delta = Math.abs(Math.atan2(pdy, pdx) - angle);
        if (delta > Math.PI) delta = Math.PI * 2 - delta;
        if (pDist <= enemy.r + player.r + reachPad && delta <= halfArc) {
          ctx.damagePlayer(enemy, player, damage, Math.atan2(pdy, pdx), knockback, sourceLabel);
          if (onHitPlayer) onHitPlayer(player);
        }
      });
    }

    function spawnPhaseSwords(enemy, count, damage, source = 'god_projectile', radius = 190) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + random('encounter') * 0.25;
        const sx = player.x + Math.cos(angle) * radius;
        const sy = player.y + Math.sin(angle) * radius;
        const travel = Math.atan2(player.y - sy, player.x - sx);
        ctx.spawnProjectile(enemy, {
          x: sx, y: sy,
          vx: Math.cos(travel) * 260, vy: Math.sin(travel) * 260,
          r: 7, life: 1.25, kind: 'sword', source, damage,
          homing: true, homingTurnRate: 1.6, homingSpeed: 280, homingAccel: 2.2,
        });
      }
    }

    function spawnGodSwordRing(enemy, count = 10, damage = 26) {
      for (let index = 0; index < count; index += 1) {
        const angle = (Math.PI * 2 * index) / count + random('encounter') * 0.18;
        ctx.spawnProjectile(enemy, {
          x: enemy.x + Math.cos(angle) * 52, y: enemy.y + Math.sin(angle) * 52,
          vx: Math.cos(angle) * 280, vy: Math.sin(angle) * 280,
          r: 8, life: 1.5, kind: 'god_sword', source: 'god_projectile', damage,
          homing: true, homingTurnRate: 1.7, homingSpeed: 300, homingAccel: 2.4,
        });
      }
    }

    function spawnCultQueenMissile(enemy, tuning) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const floor = ctx.getFloor?.() || 1;
      const floorBonus = Math.max(0, Math.floor((floor - 5) / 2));
      const count = (tuning.supportPower >= 1.22 ? 2 : 1) + floorBonus;
      const floorSpeed = 1 + Math.max(0, floor - 5) * 0.08;
      const travelSpeed = 165 * floorSpeed;
      const damage = Math.round(enemy.dmg * 0.78);
      const baseAngle = angleBetween(enemy, player);
      for (let index = 0; index < count; index += 1) {
        const spread = count === 1 ? 0 : ((index - (count - 1) / 2) / Math.max(1, count - 1)) * 0.44;
        const angle = baseAngle + spread + (random('encounter') - 0.5) * 0.24;
        ctx.spawnProjectile(enemy, {
          x: enemy.x + Math.cos(angle) * (enemy.r + 8),
          y: enemy.y + Math.sin(angle) * (enemy.r + 8),
          vx: Math.cos(angle) * travelSpeed, vy: Math.sin(angle) * travelSpeed,
          r: 8, life: 2.45, kind: 'cult_missile', source: 'queen_cult_projectile',
          damage, knockback: 155,
          homing: true,
          homingTurnRate: 2.15 * Math.min(1.24, tuning.reaction),
          homingSpeed: 235 * Math.min(1.18, tuning.reaction) * floorSpeed,
          homingAccel: 3.2,
          drainHeal: Math.max(2, Math.round(damage * 0.5)),
          statusEffects: [{ key: 'dark_drain', stacks: 1, duration: 3.5, chance: 1 }],
        });
      }
    }

    // --- boss bodies --------------------------------------------------------

    function updateCultQueenBoss(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      // Death-defying finisher: below 5% she roots, tanks through a telegraphed
      // windup, then detonates a distance-falloff blast and dies with it.
      if (!enemy.queenFinisherActive && !enemy.queenFinisherDone && enemy.hp <= enemy.max * 0.05) {
        enemy.queenFinisherActive = true;
        enemy.queenFinisherTimer = QUEEN_FINISHER_WINDUP;
        ctx.speak?.(enemy, 'Then burn with me!');
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'queen_finisher', windupSeconds: QUEEN_FINISHER_WINDUP });
      }
      if (enemy.queenFinisherActive && !enemy.queenFinisherDone) {
        enemy.defenseMultiplier = Math.max(Number(enemy.defenseMultiplier || 1), QUEEN_FINISHER_RESISTANCE);
        ctx.holdAtOneHp?.(enemy);
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.queenFinisherTimer = Math.max(0, Number(enemy.queenFinisherTimer || 0) - dt);
        const charge = 1 - enemy.queenFinisherTimer / QUEEN_FINISHER_WINDUP;
        enemy.queenFinisherShake = 3 + charge * charge * 11;
        if (enemy.queenFinisherTimer <= 0) {
          enemy.queenFinisherDone = true;
          enemy.queenFinisherShake = 0;
          ctx.blastRadius(enemy, enemy.x, enemy.y, QUEEN_FINISHER_RADIUS, Math.round(enemy.dmg), QUEEN_FINISHER_KNOCKBACK, {
            playerDamageFalloff: { centerMultiplier: 5, edgeMultiplier: 1 },
          });
          enemy.defenseMultiplier = 1;
          ctx.killEnemy?.(enemy);
        }
        return;
      }

      enemy.queenMissileCd = Math.max(0, Number(enemy.queenMissileCd || 0) - dt);
      if (enemy.queenMissileCd <= 0 && distance > 95 && distance < 580 && enemy.stun <= 0) {
        spawnCultQueenMissile(enemy, tuning);
        const floorCadence = Math.max(0.5, 1 - Math.max(0, (ctx.getFloor?.() || 1) - 5) * 0.1);
        enemy.queenMissileCd = 3.4 * Math.max(0.78, tuning.rangedCadence) * floorCadence;
      }

      enemy.summonCd = Math.max(0, Number(enemy.summonCd || 0) - dt);
      if (enemy.summonCd <= 0) {
        enemy.summonCd = 4.6 * Math.max(0.74, tuning.rangedCadence);
        if (!enemy.queenSummonLineShown) {
          enemy.queenSummonLineShown = true;
          ctx.speak?.(enemy, 'Come forth, faithful.');
        }
        const floor = ctx.getFloor?.() || 1;
        const summonCount = tuning.supportPower >= 1.22 ? 4 : 3;
        const golemChance = clamp(0.12 + Math.max(0, floor - 5) * 0.06, 0.12, 0.4);
        const eliteChance = clamp(0.18 + Math.max(0, floor - 5) * 0.07, 0.18, 0.5);
        for (let index = 0; index < summonCount; index += 1) {
          const angle = (Math.PI * 2 * index) / 3 + random('encounter') * 0.8;
          const px = enemy.x + Math.cos(angle) * 54;
          const py = enemy.y + Math.sin(angle) * 54;
          const summonType = random('encounter') < golemChance ? 'golem' : 'cult_follower';
          const summonElite = random('encounter') < eliteChance;
          ctx.spawnMinion?.(enemy, summonType, px, py, { elite: summonElite });
        }
      }

      updateCultMageEnemy(enemy, dt);
      if (enemy.attackCd <= 0 && distance < enemy.r + player.r + 18) {
        enemy.attackAnimT = 0.24;
        ctx.damagePlayer(enemy, player, enemy.dmg + 4, Math.atan2(dy, dx), 250, enemy.type);
        enemy.attackCd = 0.95 * tuning.rangedCadence;
      }
    }

    function updateBulkGolemBoss(enemy, dt) {
      enemy.speed = 78;
      enemy.jumpCd = Math.max(0, Number(enemy.jumpCd || 0) - dt);
      const player = ctx.getPlayer(enemy);
      if (!player) return;

      if (enemy.bulkJumpTime > 0) {
        enemy.bulkJumpTime = Math.max(0, enemy.bulkJumpTime - dt);
        const duration = Math.max(0.01, Number(enemy.bulkJumpDuration || 0.82));
        const progress = clamp(1 - enemy.bulkJumpTime / duration, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        enemy.x = Number(enemy.bulkJumpStartX || enemy.x) + (Number(enemy.bulkJumpTargetX || enemy.x) - Number(enemy.bulkJumpStartX || enemy.x)) * eased;
        enemy.y = Number(enemy.bulkJumpStartY || enemy.y) + (Number(enemy.bulkJumpTargetY || enemy.y) - Number(enemy.bulkJumpStartY || enemy.y)) * eased;
        enemy.jumpZ = Math.sin(progress * Math.PI) * 92;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.airborne = true;
        if (enemy.bulkJumpTime <= 0) {
          enemy.x = Number(enemy.bulkJumpTargetX || enemy.x);
          enemy.y = Number(enemy.bulkJumpTargetY || enemy.y);
          enemy.jumpZ = 0;
          enemy.airborne = false;
          enemy.jumpCd = 2.4;
          const impactRadius = 150;
          ctx.blastRadius(enemy, enemy.x, enemy.y, impactRadius, Math.round(enemy.dmg * 0.85), 330);
        }
        return;
      }

      enemy.airborne = false;
      enemy.jumpZ = 0;
      enemy.aoeTime = Math.max(0, Number(enemy.aoeTime ?? 3) - dt);
      if (enemy.aoeTime <= 0) {
        enemy.aoeTime = 3;
        if (!enemy.bulkNovaLineShown) {
          enemy.bulkNovaLineShown = true;
          ctx.speak?.(enemy, 'Break under the weight.');
        }
        ctx.blastRadius(enemy, enemy.x, enemy.y, 173, Math.round(enemy.dmg * 0.864), 200);
      }
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const nextX = enemy.x + (dx / distance) * enemy.speed * 0.25;
      const nextY = enemy.y + (dy / distance) * enemy.speed * 0.25;
      const pathBlocked = ctx.isBlocked?.(enemy, nextX, enemy.y, enemy.r) && ctx.isBlocked?.(enemy, enemy.x, nextY, enemy.r);
      if (enemy.jumpCd <= 0 && (pathBlocked || distance > 230)) {
        const angle = Math.atan2(dy, dx);
        const targetDistance = clamp(distance - 84, 80, 260);
        const landing = findSafeLanding(
          enemy,
          player.x - Math.cos(angle) * targetDistance + randRange(-34, 34, 'encounter'),
          player.y - Math.sin(angle) * targetDistance + randRange(-34, 34, 'encounter'),
          enemy.r,
        );
        if (landing) {
          enemy.bulkJumpDuration = 0.82;
          enemy.bulkJumpTime = enemy.bulkJumpDuration;
          enemy.bulkJumpStartX = enemy.x;
          enemy.bulkJumpStartY = enemy.y;
          enemy.bulkJumpTargetX = landing.x;
          enemy.bulkJumpTargetY = landing.y;
          enemy.windup = 0;
          enemy.dashTime = 0;
          enemy.jumpCd = 99;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'bulk_jump', targetX: landing.x, targetY: landing.y });
          return;
        }
        enemy.jumpCd = 0.8;
      }
      updateGolemEnemy(enemy, dt);
    }

    function updateArtificerBoss(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const hpPct = enemy.hp / enemy.max;
      const previousPhase = enemy.phase || 1;
      if (hpPct < 0.34) enemy.phase = 3;
      else if (hpPct < 0.67) enemy.phase = 2;
      else enemy.phase = 1;
      if (enemy.phase >= 2 && previousPhase < 2 && !enemy.artificerPhaseLineShown) {
        enemy.artificerPhaseLineShown = true;
        ctx.speak?.(enemy, 'Then bleed trying.');
      }

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (enemy.phase === 1) {
        enemy.speed = 132;
        updateKnaveEnemy(enemy, dt);
        return;
      }

      if (enemy.phase === 2) {
        enemy.speed = 120;
        if (enemy.attackCd <= 0) {
          spawnPhaseSwords(enemy, 8, Math.round(enemy.dmg * 0.7), 'artificer_knave_projectile');
          enemy.attackCd = 2.35 * tuning.rangedCadence;
        }
        steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 4.4, dt);
        if (distance < enemy.r + player.r + 14 && enemy.swingTime <= 0) {
          enemy.swingTime = 0.2;
        }
        if (enemy.swingTime > 0) {
          enemy.swingTime -= dt;
          if (enemy.swingTime <= 0 && distance < enemy.r + player.r + 24) {
            ctx.damagePlayer(enemy, player, enemy.dmg + 3, Math.atan2(dy, dx), 210, enemy.type);
          }
        }
        return;
      }

      enemy.speed = 62;
      steerEnemy(enemy, dx / distance, dy / distance, enemy.speed, 3.2, dt);
      if (enemy.attackCd <= 0) {
        enemy.windup = 0.72 / tuning.reaction;
        enemy.state = 'phase3_swing';
        enemy.attackCd = 6 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'artificer_heavy_swing' });
      }
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.74;
        enemy.vy *= 0.74;
        if (enemy.windup <= 0 && distance < enemy.r + player.r + 54) {
          ctx.damagePlayer(enemy, player, enemy.dmg + 16, Math.atan2(dy, dx), 340, enemy.type);
        }
      }
    }

    function spawnJusticeOfSonichu(enemy) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      const bounds = ctx.bounds(enemy);
      const cx = bounds.width / 2;
      const cy = bounds.height / 2;
      const reach = Math.hypot(bounds.width, bounds.height);
      const boltCount = 5;
      const aimAngle = player ? Math.atan2(player.y - cy, player.x - cx) : 0;
      for (let index = 0; index < boltCount; index += 1) {
        const angle = aimAngle + (index - (boltCount - 1) / 2) * (Math.PI / boltCount);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const warn = (0.7 + index * 0.16) / Math.max(0.6, tuning.reaction);
        ctx.spawnHazard?.(enemy, {
          kind: 'lightning_strike_line',
          enemy: true,
          source: 'justice_of_sonichu',
          x1: cx - dirX * reach, y1: cy - dirY * reach,
          x2: cx + dirX * reach, y2: cy + dirY * reach,
          r: 30, warn, warnTick: 0, tick: 0, interval: 0.12,
          ttl: warn + 0.55,
          damage: Math.round(enemy.dmg * 1.15),
        });
      }
    }

    function spawnBowmanThunderSmash(enemy) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const angle = angleBetween(enemy, player);
      enemy.attackAnimT = 0.3;
      enemy.swingTime = 0.32;
      ctx.emit?.('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: 'bowman_thunder_smash' });
      meleeArcStrike(enemy, angle, 70, 0.9, Math.round(enemy.dmg * 1.1), 300, enemy.type, hitPlayer => {
        ctx.applyPlayerStatus(enemy, hitPlayer, 'slow', 1, 2.4);
      });
    }

    function updateBowmanBane(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const hpPct = enemy.hp / enemy.max;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (hpPct < 0.5 && enemy.phase === 1) {
        enemy.phase = 2;
        ctx.speak?.(enemy, 'JUSTICE OF SONICHU!');
        spawnJusticeOfSonichu(enemy);
        enemy.sonichuCd = 6.5;
      }

      if (hpPct <= 0.22 && enemy.phase === 2) {
        enemy.phase = 3;
        enemy.dmg = Math.round(enemy.dmg * 1.15);
        enemy.contactDamage = enemy.dmg;
        ctx.speak?.(enemy, "You've seen nothing yet!");
        spawnJusticeOfSonichu(enemy);
        enemy.sonichuCd = 4.6;
      }

      if (enemy.phase >= 2) {
        enemy.sonichuCd = Math.max(0, Number(enemy.sonichuCd || 0) - dt);
        if (enemy.sonichuCd <= 0 && enemy.stun <= 0) {
          enemy.sonichuCd = (enemy.phase >= 3 ? 5.2 : 7.5) * tuning.rangedCadence;
          ctx.speak?.(enemy, 'JUSTICE OF SONICHU!');
          spawnJusticeOfSonichu(enemy);
        }
      }

      enemy.bowmanWarpCd = Math.max(0, Number(enemy.bowmanWarpCd || 0) - dt);
      enemy.thunderSmashCd = Math.max(0, Number(enemy.thunderSmashCd || 0) - dt);
      if (enemy.thunderSmashCd <= 0 && enemy.attackCd <= 0 && enemy.stun <= 0
        && distance < enemy.r + player.r + 74) {
        spawnBowmanThunderSmash(enemy);
        enemy.thunderSmashCd = 2.1 * tuning.rangedCadence;
        enemy.attackCd = 0.9;
        return;
      }

      enemy.columnCd = Math.max(0, Number(enemy.columnCd || 0) - dt);
      if (enemy.columnCd <= 0 && enemy.stun <= 0) {
        enemy.columnCd = enemy.phase >= 3 ? 2.0 * tuning.rangedCadence : enemy.phase >= 2 ? 2.8 * tuning.rangedCadence : 4.2 * tuning.rangedCadence;
        const columnCount = enemy.phase >= 3 ? 5 : enemy.phase >= 2 ? 4 : 2;
        const bounds = ctx.bounds(enemy);
        const predicted = { x: player.x + Number(player.vx || 0) * 0.55, y: player.y + Number(player.vy || 0) * 0.55 };
        for (let index = 0; index < columnCount; index += 1) {
          const spread = (index - (columnCount - 1) / 2) * 72;
          const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
          ctx.spawnHazard?.(enemy, {
            kind: 'lightning_column',
            enemy: true,
            source: 'bowman_bane',
            x: clamp(predicted.x + Math.cos(perpAngle) * spread + randRange(-30, 30, 'encounter'), 80, bounds.width - 80),
            y: clamp(predicted.y + Math.sin(perpAngle) * spread + randRange(-30, 30, 'encounter'), 80, bounds.height - 80),
            r: 44,
            ttl: enemy.phase >= 2 ? 3.4 : 2.6,
            tick: 0.15,
            interval: 0.38,
            damage: Math.round(enemy.dmg * 0.95),
          });
        }
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.82;
        enemy.vy *= 0.82;
        aimEnemyBeam(enemy, dt, 2.8 * tuning.reaction);
        if (enemy.windup <= 0) {
          enemy.beamTime = enemy.phase >= 2 ? 0.72 : 0.52;
          enemy.beamTick = 0;
        }
        return;
      }

      if (enemy.beamTime > 0) {
        tickEnemyBeam(enemy, dt, {
          tick: 0.1 * Math.max(0.72, tuning.rangedCadence),
          range: 480,
          knockback: 170,
          damage: Math.round(enemy.dmg * (enemy.phase >= 3 ? 1.4 : 1.25)),
          speedDamp: 0.82,
          turnRate: enemy.phase >= 2 ? 2.8 * tuning.reaction : 2.2 * tuning.reaction,
        });
        return;
      }

      if (enemy.bowmanWarpCd <= 0
        && (distance < 170 || distance > 390 || enemy.phase >= 2)
        && warpBowmanBane(enemy)) {
        return;
      }

      const desired = enemy.phase >= 2 ? 200 : 260;
      const direction = distance < desired - 30 ? -1 : distance > desired + 30 ? 1 : 0;
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.4, dt);

      if (enemy.attackCd <= 0 && distance < 420) {
        enemy.windup = (enemy.phase >= 3 ? 0.42 : enemy.phase >= 2 ? 0.54 : 0.72) / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.18);
        enemy.attackCd = (enemy.phase >= 3 ? 1.9 : enemy.phase >= 2 ? 2.4 : 3.2) * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: enemy.type });
      }
    }

    function spawnAntonyHammerSwing(enemy) {
      const player = ctx.getPlayer(enemy);
      const angle = Number.isFinite(enemy.antonyHammerAngle)
        ? enemy.antonyHammerAngle
        : (player ? angleBetween(enemy, player) : 0);
      enemy.antonyShockwave = {
        angle,
        damage: Math.round(enemy.dmg * 0.7),
        range: 320,
        speed: 620,
        travelled: enemy.r + 12,
        halfArc: 0.54,
        bandWidth: 56,
        hit: false,
      };
      ctx.emit?.('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: 'antony_hammer' });
    }

    function updateAntonyShockwave(enemy, dt) {
      const wave = enemy.antonyShockwave;
      if (!wave) return false;
      const prev = wave.travelled;
      wave.travelled += wave.speed * dt;
      const front = wave.travelled;
      if (!wave.hit) {
        (ctx.getPlayers?.(enemy) || []).forEach(player => {
          if (wave.hit) return;
          const pdx = player.x - enemy.x;
          const pdy = player.y - enemy.y;
          const pDist = Math.hypot(pdx, pdy) || 1;
          const pAngle = Math.atan2(pdy, pdx);
          let delta = Math.abs(pAngle - wave.angle);
          if (delta > Math.PI) delta = Math.PI * 2 - delta;
          const reached = pDist >= prev - wave.bandWidth / 2 - player.r
            && pDist <= front + wave.bandWidth / 2 + player.r;
          if (delta <= wave.halfArc && reached) {
            wave.hit = true;
            ctx.damagePlayer(enemy, player, wave.damage, pAngle, 320, enemy.type);
          }
        });
      }
      if (wave.travelled >= wave.range) {
        enemy.antonyShockwave = null;
        return false;
      }
      return true;
    }

    function spawnAntonyDeathBall(enemy) {
      const player = ctx.getPlayer(enemy);
      const angle = Number.isFinite(enemy.antonyDeathBallAngle)
        ? enemy.antonyDeathBallAngle
        : (player ? angleBetween(enemy, player) : 0);
      ctx.spawnProjectile(enemy, {
        x: enemy.x + Math.cos(angle) * (enemy.r + 14),
        y: enemy.y + Math.sin(angle) * (enemy.r + 14),
        vx: Math.cos(angle) * 525, vy: Math.sin(angle) * 525,
        r: 38, life: 3.4, kind: 'cold_death', source: 'antony_death_ball',
        damage: Math.round(enemy.dmg * 1.1), knockback: 230,
        statusEffects: [{ key: 'slow', chance: 1, stacks: 1, duration: 4 }],
        homing: true, homingTurnRate: 0.65, homingSpeed: 570, homingAccel: 1.1,
      });
    }

    function updateAntonyBlemmyeBoss(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      enemy.hammerCd = Math.max(0, Number(enemy.hammerCd || 0) - dt);
      enemy.biteCd = Math.max(0, Number(enemy.biteCd || 0) - dt);
      enemy.slashCd = Math.max(0, Number(enemy.slashCd || 0) - dt);
      enemy.deathBallCd = Math.max(0, Number(enemy.deathBallCd || 0) - dt);

      if (enemy.antonyShockwave) updateAntonyShockwave(enemy, dt);

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        if (enemy.windup <= 0) {
          if (enemy.state === 'antonyHammer') {
            spawnAntonyHammerSwing(enemy);
            enemy.attackCd = 1.35 * tuning.rangedCadence;
          } else if (enemy.state === 'antonyDeathBall') {
            spawnAntonyDeathBall(enemy);
            enemy.attackCd = 1.2 * tuning.rangedCadence;
          }
          enemy.state = null;
        }
        return;
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      const desired = 92;
      const direction = distance < desired - 24 ? -0.6 : 1;
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, 3.7, dt);

      // Bite: very short range life-drain chomp.
      if (enemy.biteCd <= 0 && distance < enemy.r + player.r + 26) {
        const angle = Math.atan2(dy, dx);
        const biteDamage = Math.round(enemy.dmg * 0.82);
        enemy.attackAnimT = 0.28;
        ctx.damagePlayer(enemy, player, biteDamage, angle, 240, enemy.type);
        if (random('encounter') < 0.35) {
          ctx.applyPlayerStatus(enemy, player, 'dark_drain', 2, 4.2);
          const heal = Math.round(biteDamage * 0.35);
          ctx.healEnemy(enemy, enemy, heal);
        }
        enemy.biteCd = 1.9 * tuning.rangedCadence;
        enemy.attackCd = Math.max(enemy.attackCd, 0.55);
        return;
      }

      // Slash: wide sweeping arc, no windup, punishes hugging.
      if (enemy.slashCd <= 0 && enemy.attackCd <= 0 && distance < enemy.r + player.r + 70) {
        enemy.attackAnimT = 0.3;
        enemy.swingTime = 0.32;
        ctx.emit?.('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: 'antony_slash' });
        meleeArcStrike(enemy, angleBetween(enemy, player), 66, 0.82, Math.round(enemy.dmg * 0.92), 300, enemy.type);
        enemy.slashCd = 2.45 * tuning.rangedCadence;
        enemy.attackCd = 0.85;
        if (!enemy.antonySlashLineShown) {
          enemy.antonySlashLineShown = true;
          ctx.speak?.(enemy, 'Carve you open.');
        }
        return;
      }

      // Cold death ball: charged frost orb at mid/long range.
      if (enemy.deathBallCd <= 0 && enemy.attackCd <= 0 && distance > enemy.r + player.r + 40) {
        enemy.state = 'antonyDeathBall';
        enemy.windup = 1.05 / tuning.reaction;
        enemy.antonyDeathBallAngle = Math.atan2(dy, dx);
        enemy.deathBallCd = 7.2 * tuning.rangedCadence;
        enemy.attackCd = 1.2;
        if (!enemy.antonyDeathBallLineShown) {
          enemy.antonyDeathBallLineShown = true;
          ctx.speak?.(enemy, 'Feel the cold.');
        }
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'antony_death_ball' });
        return;
      }

      // Hammer: directional shockwave that travels forward.
      if (enemy.hammerCd <= 0 && distance < 320 && enemy.attackCd <= 0) {
        enemy.state = 'antonyHammer';
        enemy.windup = 0.9 / tuning.reaction;
        enemy.antonyHammerAngle = Math.atan2(dy, dx);
        enemy.hammerCd = 4.1 * tuning.rangedCadence;
        enemy.attackCd = 1.0;
        if (!enemy.antonyHammerLineShown) {
          enemy.antonyHammerLineShown = true;
          ctx.speak?.(enemy, 'Open wide.');
        }
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'antony_hammer' });
      }
    }

    function spawnDevilRedSpikes(enemy, count = 5) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const bounds = ctx.bounds(enemy);
      const baseAngle = angleBetween(enemy, player);
      const predictedX = player.x + Number(player.vx || 0) * 0.42;
      const predictedY = player.y + Number(player.vy || 0) * 0.42;
      for (let index = 0; index < count; index += 1) {
        const spread = (index - (count - 1) / 2) * 42;
        const forward = 18 + Math.abs(index - (count - 1) / 2) * 16;
        const perp = baseAngle + Math.PI / 2;
        ctx.spawnHazard?.(enemy, {
          kind: 'red_spikes',
          enemy: true,
          source: 'handsome_devil',
          x: clamp(predictedX + Math.cos(perp) * spread + Math.cos(baseAngle) * forward + randRange(-18, 18, 'encounter'), 80, bounds.width - 80),
          y: clamp(predictedY + Math.sin(perp) * spread + Math.sin(baseAngle) * forward + randRange(-18, 18, 'encounter'), 80, bounds.height - 80),
          r: 34,
          ttl: 1.1,
          armTime: 0.48,
          damage: Math.round(enemy.dmg * 1.1),
          statusKey: 'bleed',
          statusStacks: 6,
          statusDuration: 3.4,
          hit: false,
        });
      }
    }

    function spawnDevilLavaGrid(enemy) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const bounds = ctx.bounds(enemy);
      const tile = 64;
      const thickness = 22;
      const margin = bounds.wall + 38;
      const verticals = [-1, 0, 1].map(offset => clamp(player.x + offset * 150 + randRange(-34, 34, 'encounter'), margin, bounds.width - margin));
      const horizontals = [-1, 1].map(offset => clamp(player.y + offset * 110 + randRange(-28, 28, 'encounter'), margin, bounds.height - margin));
      verticals.forEach((x, index) => {
        const top = bounds.wall + tile;
        const h = bounds.height - bounds.wall * 2 - tile * 2;
        ctx.spawnHazard?.(enemy, {
          kind: 'lava', shape: 'rect', enemy: true, source: 'handsome_devil',
          x, y: top + h / 2, left: x - thickness / 2, top, w: thickness, h,
          ttl: 4.2, phase: index * 0.7, pulse: 1.9, statusStacks: 5,
          damage: 10,
        });
      });
      horizontals.forEach((y, index) => {
        const left = bounds.wall + tile;
        const w = bounds.width - bounds.wall * 2 - tile * 2;
        ctx.spawnHazard?.(enemy, {
          kind: 'lava', shape: 'rect', enemy: true, source: 'handsome_devil',
          x: left + w / 2, y, left, top: y - thickness / 2, w, h: thickness,
          ttl: 4.2, phase: index * 0.9 + 1.3, pulse: 1.9, statusStacks: 5,
          damage: 10,
        });
      });
      ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'devil_lava_grid' });
    }

    function updateHandsomeDevilBoss(enemy, dt) {
      const tuning = tuningOf();
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const hpPct = enemy.hp / enemy.max;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      if (hpPct <= 0.5 && enemy.phase === 1) {
        enemy.phase = 2;
        enemy.attackCd = Math.min(enemy.attackCd, 0.65);
        enemy.devilLaserCd = 0.6;
        ctx.speak?.(enemy, 'Look into my eyes.');
      }

      enemy.spikeCd = Math.max(0, Number(enemy.spikeCd || 0) - dt);
      enemy.lavaGridCd = Math.max(0, Number(enemy.lavaGridCd || 0) - dt);
      enemy.devilLaserCd = Math.max(0, Number(enemy.devilLaserCd || 0) - dt);
      enemy.clawCd = Math.max(0, Number(enemy.clawCd || 0) - dt);
      enemy.giantLaserCd = Math.max(0, Number(enemy.giantLaserCd ?? 3) - dt);

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.76;
        enemy.vy *= 0.76;
        if (enemy.state === 'devilLaser' || enemy.state === 'devilGiantLaser') {
          aimEnemyBeam(enemy, dt, (enemy.state === 'devilGiantLaser' ? 1.4 : 3.2) * tuning.reaction);
        }
        if (enemy.windup <= 0 && enemy.state === 'devilLaser') {
          enemy.beamTime = 0.86;
          enemy.beamTick = 0;
        }
        if (enemy.windup <= 0 && enemy.state === 'devilGiantLaser') {
          enemy.beamTime = 1.3;
          enemy.beamTick = 0;
        }
        return;
      }

      if (enemy.beamTime > 0) {
        const isGiant = enemy.state === 'devilGiantLaser';
        tickEnemyBeam(enemy, dt, {
          tick: (isGiant ? 0.09 : 0.075) * Math.max(0.68, tuning.rangedCadence),
          range: isGiant ? 900 : (enemy.beamRange || 560),
          knockback: isGiant ? 260 : 180,
          damage: Math.round(enemy.dmg * (isGiant ? 1.35 : 0.72)),
          speedDamp: 0.84,
          turnRate: (isGiant ? 0.4 : 1.8) * tuning.reaction,
          onEnd: activeEnemy => {
            activeEnemy.attackCd = (isGiant ? 1.4 : 1.1) * tuning.rangedCadence;
            activeEnemy.giantLaserWidth = 0;
          },
        });
        return;
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.88;
        enemy.vy *= 0.88;
        return;
      }

      // Claw slash: punishes players who close to melee range, on both phases.
      if (enemy.clawCd <= 0 && enemy.attackCd <= 0 && distance < enemy.r + player.r + 70) {
        enemy.attackAnimT = 0.28;
        enemy.swingTime = 0.3;
        ctx.emit?.('ENEMY_ATTACKED', { enemyId: enemy.id, attackKind: 'devil_claw' });
        meleeArcStrike(enemy, angleBetween(enemy, player), 64, 0.86, Math.round(enemy.dmg * 1.05), 260, enemy.type, hitPlayer => {
          ctx.applyPlayerStatus(enemy, hitPlayer, 'fire', 1, 2.8);
        });
        enemy.clawCd = 1.9 * tuning.rangedCadence;
        enemy.attackCd = 0.8;
        return;
      }

      // Giant red laser: heavy long-range punish for keeping distance.
      if (enemy.giantLaserCd <= 0 && distance > 420) {
        enemy.state = 'devilGiantLaser';
        enemy.windup = 0.85 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.05);
        enemy.giantLaserWidth = 22;
        enemy.giantLaserCd = 5.4 * tuning.rangedCadence;
        if (!enemy.devilGiantLaserLineShown) {
          enemy.devilGiantLaserLineShown = true;
          ctx.speak?.(enemy, "Can't hide forever.");
        }
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'devil_giant_laser' });
        return;
      }

      if (enemy.phase === 1) {
        if (enemy.spikeCd <= 0) {
          spawnDevilRedSpikes(enemy, 5);
          enemy.spikeCd = 2.2 * tuning.rangedCadence;
        }
        if (enemy.lavaGridCd <= 0) {
          spawnDevilLavaGrid(enemy);
          enemy.lavaGridCd = 6.6 * tuning.rangedCadence;
        }
      } else if (enemy.devilLaserCd <= 0 && distance < 620) {
        enemy.state = 'devilLaser';
        enemy.windup = 0.56 / tuning.reaction;
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.09);
        enemy.devilLaserCd = 2.35 * tuning.rangedCadence;
        ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'devil_laser' });
        return;
      }

      const desired = enemy.phase >= 2 ? 250 : 170;
      const direction = distance < desired - 32 ? -1 : distance > desired + 36 ? 1 : 0.2;
      const strafe = enemy.phase >= 2 && distance < 520 ? 0.38 : 0.18;
      steerEnemy(
        enemy,
        dx / distance * direction + -dy / distance * strafe,
        dy / distance * direction + dx / distance * strafe,
        enemy.speed,
        enemy.phase >= 2 ? 5.2 : 4.1,
        dt,
      );

      if (distance < enemy.r + player.r + 12 && enemy.attackCd <= 0) {
        const angle = Math.atan2(dy, dx);
        ctx.damagePlayer(enemy, player, enemy.dmg, angle, 210, enemy.type);
        ctx.applyPlayerStatus(enemy, player, 'fire', 1, 2.8);
        enemy.attackAnimT = 0.24;
        enemy.attackCd = 0.95 * tuning.rangedCadence;
      }
    }

    function getGodRunPressure(elapsedSeconds) {
      const minutes = Math.max(0, Number(elapsedSeconds || 0) / 60);
      return {
        minutes,
        damageMultiplier: Math.min(1.9, 1.18 + minutes * 0.045),
        cadenceMultiplier: Math.max(0.48, 0.9 - minutes * 0.035),
        partitionLaserCount: minutes >= 8 ? 5 : 4,
        partitionRotationSpeed: Math.min(1.05, 0.52 + minutes * 0.035),
      };
    }

    function setGodPartitionAngles(enemy, count) {
      const beamCount = Math.max(4, Math.min(5, Math.round(Number(count || 4))));
      enemy.partitionAngles = Array.from(
        { length: beamCount },
        (_, index) => enemy.partitionAngle + (Math.PI * 2 * index) / beamCount,
      );
    }

    function tickGodPartitionLasers(enemy, dt, runPressure, phaseLevel, tuning, cadenceMult) {
      const bounds = ctx.bounds(enemy);
      enemy.beamTime -= dt;
      enemy.beamTick = Number(enemy.beamTick || 0) - dt;
      enemy.vx *= 0.78;
      enemy.vy *= 0.78;
      enemy.partitionAngle += enemy.partitionRotationDir * enemy.partitionRotationSpeed * dt;
      setGodPartitionAngles(enemy, enemy.partitionAngles?.length || runPressure.partitionLaserCount);

      if (enemy.beamTick <= 0) {
        enemy.beamTick = 0.1 * Math.max(0.68, tuning.rangedCadence * cadenceMult);
        const range = Math.hypot(bounds.width, bounds.height) * 1.15;
        (ctx.getPlayers?.(enemy) || []).forEach(player => {
          for (const beamAngle of enemy.partitionAngles) {
            const hit = segmentHitsCircle(
              enemy.x, enemy.y,
              enemy.x + Math.cos(beamAngle) * range, enemy.y + Math.sin(beamAngle) * range,
              player.x, player.y, player.r + 7,
            );
            if (hit) {
              const damage = Math.round(enemy.dmg * (phaseLevel >= 5 ? 0.42 : phaseLevel >= 4 ? 0.36 : 0.3));
              ctx.damagePlayer(enemy, player, damage, hit.angle, phaseLevel >= 4 ? 230 : 190, 'god');
              break;
            }
          }
        });
      }

      if (enemy.beamTime <= 0) {
        enemy.partitionAngles = [];
        enemy.attackCd = 1.15 * tuning.rangedCadence * cadenceMult;
        return true;
      }
      return false;
    }

    function updateGod(enemy, dt) {
      const tuning = tuningOf();
      const runPressure = getGodRunPressure(ctx.getElapsedSeconds?.() || 0);
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;

      const phaseLevel = enemy.phase || 1;
      const phaseTwo = phaseLevel >= 2;
      const phaseFour = phaseLevel >= 4;
      const phaseFive = phaseLevel >= 5;
      const phaseCadenceMult = phaseFive ? 0.42 : phaseFour ? 0.52 : phaseLevel >= 3 ? 0.6 : phaseTwo ? 0.68 : 1;
      const cadenceMult = phaseCadenceMult * runPressure.cadenceMultiplier;
      const reactionMult = phaseFive ? 1.45 : phaseFour ? 1.34 : phaseLevel >= 3 ? 1.28 : phaseTwo ? 1.22 : 1;
      const desired = phaseFive ? 138 : phaseFour ? 146 : phaseTwo ? 156 : 190;
      enemy.stun = Math.min(Number(enemy.stun || 0), Number(enemy.maxStunDuration || 0.18));

      if (enemy.windup > 0) {
        enemy.windup -= dt;
        enemy.vx *= 0.74;
        enemy.vy *= 0.74;
        if (enemy.state === 'godLaser') aimEnemyBeam(enemy, dt, (1.05 + (tuning.reaction - 1) * 3.6) * reactionMult);
        if (enemy.windup <= 0) {
          if (enemy.state === 'godLaser') {
            enemy.beamTime = phaseTwo ? 0.98 : 0.78;
            enemy.beamTick = 0;
          }
          if (enemy.state === 'godSweep') {
            enemy.beamTime = phaseFour ? 2.7 : phaseTwo ? 2.35 : 1.9;
            enemy.beamTick = 0;
            enemy.sweepSpeed = 3.9 * reactionMult * (enemy.sweepDir || 1);
          }
          if (enemy.state === 'godPartition') {
            enemy.beamTime = phaseFive ? 3.4 : phaseFour ? 3.1 : 2.7;
            enemy.beamTick = 0;
            enemy.partitionRotationSpeed = runPressure.partitionRotationSpeed * (phaseFive ? 1.35 : phaseFour ? 1.2 : 1);
          }
          if (enemy.state === 'godCharge') {
            enemy.dashTime = phaseFour ? 0.76 : phaseTwo ? 0.62 : 0.48;
            enemy.dashHit = false;
          }
          if (enemy.state === 'godSwordRing') {
            const swordCount = phaseFive ? 30 : phaseFour ? 24 : phaseTwo ? 18 : 12;
            const swordDamage = Math.round(enemy.dmg * (phaseFour ? 1.02 : phaseTwo ? 0.95 : 0.82));
            spawnGodSwordRing(enemy, swordCount, swordDamage);
            enemy.attackCd = 1.2 * tuning.rangedCadence * cadenceMult;
          }
        }
        return;
      }

      if (enemy.beamTime > 0) {
        if (enemy.state === 'godPartition') {
          tickGodPartitionLasers(enemy, dt, runPressure, phaseLevel, tuning, cadenceMult);
          return;
        }
        const isSweep = enemy.state === 'godSweep';
        tickEnemyBeam(enemy, dt, {
          tick: (isSweep ? 0.045 : 0.08) * Math.max(0.64, tuning.rangedCadence * cadenceMult),
          range: enemy.beamRange || 620,
          knockback: isSweep ? (phaseFour ? 260 : 210) : (phaseFour ? 180 : 150),
          damage: isSweep ? enemy.dmg + (phaseFive ? 38 : phaseTwo ? 28 : 18) : Math.round((enemy.dmg + (phaseFour ? 18 : phaseTwo ? 12 : 6)) * 0.25),
          speedDamp: 0.86,
          turnRate: isSweep ? 0 : (0.58 + (tuning.reaction - 1) * 2.8) * reactionMult,
          onTick: isSweep
            ? activeEnemy => {
              activeEnemy.beamAngle += activeEnemy.sweepSpeed * 0.045;
            }
            : null,
          onEnd: activeEnemy => {
            activeEnemy.attackCd = (isSweep ? 1.45 : 1) * tuning.rangedCadence * cadenceMult;
          },
        });
        return;
      }

      if (enemy.dashTime > 0) {
        enemy.dashTime -= dt;
        const dashSpeed = phaseFive ? 710 : phaseFour ? 660 : phaseTwo ? 620 : 500;
        enemy.vx = Math.cos(enemy.dashAngle) * dashSpeed;
        enemy.vy = Math.sin(enemy.dashAngle) * dashSpeed;
        if (!enemy.dashHit && dist(enemy.x, enemy.y, player.x, player.y) < enemy.r + player.r + 10) {
          enemy.dashHit = true;
          ctx.damagePlayer(enemy, player, enemy.dmg + (phaseFive ? 34 : phaseTwo ? 24 : 12), enemy.dashAngle, phaseFour ? 410 : phaseTwo ? 360 : 300, enemy.type);
        }
        if (enemy.dashTime <= 0) enemy.attackCd = 1.1 * tuning.rangedCadence * cadenceMult;
        return;
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      const direction = distance < desired - 10 ? -1 : distance > desired + 20 ? 1 : 0.5;
      steerEnemy(enemy, dx / distance * direction, dy / distance * direction, enemy.speed, phaseFour ? 6.2 : phaseTwo ? 5.5 : 4.6, dt);

      if (distance < enemy.r + player.r + 12 && enemy.attackCd <= 0) {
        const angle = Math.atan2(dy, dx);
        ctx.damagePlayer(enemy, player, enemy.dmg + (phaseFive ? 26 : phaseTwo ? 18 : 10), angle, phaseFour ? 370 : phaseTwo ? 320 : 260, enemy.type);
        enemy.attackCd = 0.8 * tuning.rangedCadence * cadenceMult;
        return;
      }

      if (enemy.attackCd <= 0) {
        const roll = random('encounter');
        const partitionChance = phaseFive ? 0.32 : phaseFour ? 0.27 : phaseLevel >= 3 ? 0.23 : phaseTwo ? 0.19 : runPressure.minutes >= 6 ? 0.14 : 0;
        if (roll < partitionChance) {
          enemy.state = 'godPartition';
          enemy.windup = 1.05 / (tuning.reaction * reactionMult);
          enemy.partitionAngle = Math.atan2(dy, dx);
          enemy.partitionRotationDir = random('encounter') < 0.5 ? -1 : 1;
          const laserCount = phaseFour ? 5 : runPressure.partitionLaserCount;
          setGodPartitionAngles(enemy, laserCount);
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_partition', laserCount });
        } else if ((phaseTwo && distance > 250 && roll > (phaseFour ? 0.46 : 0.52)) || (!phaseTwo && distance > 300 && roll > 0.68)) {
          enemy.state = 'godSweep';
          enemy.windup = 1.15 / (tuning.reaction * reactionMult);
          enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.1);
          enemy.sweepDir = random('encounter') < 0.5 ? -1 : 1;
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_sweep' });
        } else if (roll > (phaseFive ? 0.16 : phaseTwo ? 0.26 : 0.42)) {
          enemy.state = 'godLaser';
          enemy.windup = 0.82 / (tuning.reaction * reactionMult);
          enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, phaseFour ? 0.16 : phaseTwo ? 0.13 : 0.11);
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_laser' });
        } else if (roll > (phaseFour ? 0.04 : phaseTwo ? 0.08 : 0.18)) {
          enemy.state = 'godSwordRing';
          enemy.windup = 0.6 / (tuning.reaction * reactionMult);
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_sword_ring' });
        } else {
          enemy.state = 'godCharge';
          enemy.windup = 0.44 / (tuning.reaction * reactionMult);
          enemy.dashAngle = Math.atan2(dy, dx);
          ctx.emit?.('ENEMY_TELEGRAPH', { enemyId: enemy.id, attackKind: 'god_charge' });
        }
        enemy.attackCd = 1.7 * tuning.rangedCadence * cadenceMult;
      }
    }

    function updateMooggyEnemy(enemy, dt) {
      const player = ctx.getPlayer(enemy);
      if (!player) return;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const clawReach = enemy.r + player.r + MOOGGY_CLAW_REACH_PAD;

      if (enemy.beamTime > 0) {
        tickEnemyBeam(enemy, dt, {
          tick: Number(enemy.mooggyLaserTick || 0.055),
          range: 520,
          knockback: 96,
          damage: enemy.beamDamage || enemy.dmg,
          speedDamp: 0.88,
          turnRate: 8.8,
          onEnd: activeEnemy => {
            activeEnemy.attackCd = Number(activeEnemy.mooggyLaserCooldown || 0.2);
          },
        });
        return;
      }

      if (enemy.stun > 0) {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        return;
      }

      if (enemy.swingTime > 0) {
        enemy.swingTime -= dt;
        enemy.vx *= 0.7;
        enemy.vy *= 0.7;
        if (!enemy.clawHit && enemy.swingTime <= MOOGGY_CLAW_SWING * 0.5) {
          const toPlayer = Math.atan2(dy, dx);
          const angleDiff = Math.abs(Math.atan2(Math.sin(toPlayer - enemy.swingA), Math.cos(toPlayer - enemy.swingA)));
          if (distance < clawReach && angleDiff < MOOGGY_CLAW_ARC) {
            enemy.clawHit = true;
            ctx.damagePlayer(enemy, player, enemy.dmg, toPlayer, 190, 'mooggy');
            ctx.applyPlayerStatus(enemy, player, 'bleed', Number(enemy.mooggyBleedStacks || 1), 3.2);
          }
        }
        return;
      }

      const desired = 220;
      const direction = distance < desired - 34 ? -1 : distance > desired + 42 ? 1 : 0.15;
      const strafe = distance < 420 ? 0.44 : 0;
      steerEnemy(
        enemy,
        dx / distance * direction + -dy / distance * strafe,
        dy / distance * direction + dx / distance * strafe,
        enemy.speed,
        6.4,
        dt,
      );

      if (distance < clawReach && enemy.attackCd <= 0) {
        enemy.swingA = Math.atan2(dy, dx);
        enemy.swingTime = MOOGGY_CLAW_SWING;
        enemy.clawHit = false;
        enemy.attackAnimT = 0.24;
        enemy.attackCd = 0.5;
        return;
      }

      if (enemy.attackCd <= 0 && distance < 560) {
        enemy.beamAngle = Math.atan2(dy, dx) + rollEnemyBeamBias(enemy, 0.035);
        enemy.beamTime = 0.16;
        enemy.beamTick = 0;
        enemy.attackCd = Number(enemy.mooggyLaserCooldown || 0.2);
      }
    }

    return {
      steerEnemy,
      trySteerEnemyToCover,
      hasLineOfSight,
      rollEnemyBeamBias,
      aimEnemyBeam,
      tickEnemyBeam,
      updateEnemyProjectileEvade,
      updateEliteEnemyTraits,
      wanderEnemy,
      blindDefendEnemy,
      updateHunterEnemy,
      updateCultMageEnemy,
      updateKnaveEnemy,
      updateSniperEnemy,
      updateMachineGunnerEnemy,
      updateGolemEnemy,
      updateSummonerEnemy,
      updateShieldUnitEnemy,
      updateHealerEnemy,
      updateBossSpawnerEnemy,
      updateLaserEnemy,
      updateChargerEnemy,
      updateCultQueenBoss,
      updateBulkGolemBoss,
      updateArtificerBoss,
      updateBowmanBane,
      updateAntonyBlemmyeBoss,
      updateHandsomeDevilBoss,
      updateGod,
      updateMooggyEnemy,
    };
  }

  return {
    SHARED_BEHAVIOR_TYPES,
    createCampaignEnemyBehaviors,
    lineIntersectsRect,
    segmentHitsCircle,
    turnAngleToward,
  };
});
