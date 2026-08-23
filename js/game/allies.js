// allies.js — live browser adapter for the shared ally roster.

function localOwnerId(player = Neo.player) {
  if (!player) return '';
  if (!player.id) player.id = 'local-player-1';
  return String(player.id);
}

function ensureLocalAllies() {
  if (!Neo.allies || typeof Neo.allies !== 'object' || Array.isArray(Neo.allies)) Neo.allies = {};
  if (Neo.player) {
    localOwnerId(Neo.player);
    Neo.player.recruitedAllyIds = Array.isArray(Neo.player.recruitedAllyIds) ? Neo.player.recruitedAllyIds : [];
  }
  return Neo.allies;
}

function getLocalAllyPlayers() {
  const players = {};
  (Neo.getActivePlayerSlots?.() || []).forEach(slot => {
    const actor = slot?.getEntity?.();
    if (!actor) return;
    const id = localOwnerId(actor);
    players[id] = actor;
  });
  if (Neo.player) players[localOwnerId(Neo.player)] = Neo.player;
  return players;
}

function getLocalAllyState() {
  return {
    allies: ensureLocalAllies(),
    players: getLocalAllyPlayers(),
    nextEntityId: Math.max(1, Number(Neo.allyIdSeq || 1)),
  };
}

function commitLocalAllyState(state) {
  Neo.allies = state.allies || {};
  Neo.allyIdSeq = Math.max(Number(Neo.allyIdSeq || 1), Number(state.nextEntityId || 1));
}

function activeLocalAllies() {
  return Object.values(ensureLocalAllies()).filter(ally => ally?.status === 'active');
}

export function drawAllyPortrait(canvas, ally, options = {}) {
  if (!canvas || !ally) return;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const width = canvas.width || 64;
  const height = canvas.height || 64;
  const appearance = ally.appearance || {};
  const palettes = globalThis.NeoNyke?.simulation?.ALLY_PALETTES || [];
  const palette = palettes[Number(appearance.palette || 0) % Math.max(1, palettes.length)]
    || ['#70e1ff', '#2458aa', '#e9fbff'];
  const scale = Math.min(width, height) / 64;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(width / 2, height / 2 + 5 * scale);
  const moving = options.moving ?? Math.hypot(Number(ally.vx || 0), Number(ally.vy || 0)) > 10;
  const bob = moving ? Math.sin(Number(Neo.gameElapsedTime || 0) * 10 + Number(ally.seed || 0)) * 2 * scale : 0;
  ctx.translate(0, bob);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 20 * scale, 17 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette[1];
  const bodyW = (18 + Number(appearance.body || 0) * 1.5) * scale;
  ctx.fillRect(-bodyW / 2, -2 * scale, bodyW, 24 * scale);
  ctx.fillStyle = palette[0];
  const headR = (11 + Number(appearance.head || 0) % 3) * scale;
  ctx.beginPath();
  ctx.arc(0, -9 * scale, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette[2];
  const eyeGap = (4 + Number(appearance.eyes || 0) % 3) * scale;
  ctx.fillRect(-eyeGap - scale, -11 * scale, 3 * scale, 3 * scale);
  ctx.fillRect(eyeGap - 2 * scale, -11 * scale, 3 * scale, 3 * scale);
  ctx.fillStyle = palette[0];
  if (Number(appearance.accessory || 0) % 3 === 0) {
    ctx.fillRect(-15 * scale, -24 * scale, 30 * scale, 5 * scale);
    ctx.fillRect(-8 * scale, -30 * scale, 16 * scale, 7 * scale);
  } else if (Number(appearance.accessory || 0) % 3 === 1) {
    ctx.beginPath();
    ctx.moveTo(-headR, -16 * scale); ctx.lineTo(-17 * scale, -28 * scale); ctx.lineTo(-6 * scale, -20 * scale); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR, -16 * scale); ctx.lineTo(17 * scale, -28 * scale); ctx.lineTo(6 * scale, -20 * scale); ctx.fill();
  } else {
    ctx.fillRect(-3 * scale, -31 * scale, 6 * scale, 12 * scale);
  }
  ctx.fillStyle = palette[2];
  ctx.font = `bold ${Math.max(8, Math.round(10 * scale))}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String((ally.archetypeKey || 'a').charAt(0)).toUpperCase(), 0, 10 * scale);
  ctx.restore();
}

export function drawAllyPortraits(container = document) {
  container?.querySelectorAll?.('[data-ally-id], [data-ally-offer-index]')?.forEach(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) return;
    let ally = null;
    if (canvas.dataset.allyId) ally = ensureLocalAllies()[canvas.dataset.allyId];
    if (!ally && canvas.dataset.allyOfferIndex != null) {
      ally = Neo.currentRoom?.shopAllyOffers?.[Number(canvas.dataset.allyOfferIndex)];
    }
    if (ally) drawAllyPortrait(canvas, ally);
  });
}

function ownerForAlly(ally, players = getLocalAllyPlayers()) {
  return players[ally?.ownerId] || Neo.player || null;
}

function nearestAllyEnemy(ally, radius = 720) {
  let target = null;
  let bestSq = radius * radius;
  (Neo.enemies || []).forEach(enemy => {
    if (!enemy || enemy.dead || enemy.spawnT > 0 || enemy.type === 'rival' && enemy.rivalData?.friend) return;
    const dx = enemy.x - ally.x;
    const dy = enemy.y - ally.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestSq) { bestSq = distanceSq; target = enemy; }
  });
  return target ? { target, distance: Math.sqrt(bestSq) } : null;
}

function allyMoveDamage(ally, moveKey, gifted = false) {
  const base = Number(Neo.MOVE_BASE_STATS?.[moveKey]?.damage || ally.basicDamage || 8);
  const owner = ownerForAlly(ally);
  const forgeSteps = owner?.anvilUpgrades?.move?.[moveKey]?.damage || 0;
  const forgeStep = globalThis.NeoNyke?.simulation?.MOVE_UPGRADEABLE_STATS?.damage?.step || 5;
  return Math.max(2, (base + forgeSteps * forgeStep) * (gifted ? 0.70 : 0.55));
}

function allyMoveCooldown(ally, moveKey, gifted = false) {
  const owner = ownerForAlly(ally);
  const base = Math.max(0.5, Number(Neo.MOVE_BASE_STATS?.[moveKey]?.cooldown || 3));
  const forgeSteps = gifted ? Number(owner?.anvilUpgrades?.move?.[moveKey]?.cooldown || 0) : 0;
  return Math.max(0.35, (base - forgeSteps * 0.05) * (gifted ? 1 : 1.15));
}

function emitAllyAttackFx(ally, target, moveKey, color) {
  const presentation = globalThis.NeoNyke?.content?.MOVE_PRESENTATION_DEFS?.[moveKey] || {};
  const effectColor = presentation.color || color || '#80e8ff';
  Neo.spawnParticle?.({
    x: ally.x, y: ally.y, life: 0.2, c: effectColor,
    line: {
      x1: ally.x, y1: ally.y, x2: target.x, y2: target.y,
      w: presentation.style === 'heavy' ? 6 : 3,
      jag: presentation.kind === 'chain' ? 8 : 2, seg: 6,
      phase: Neo.nextRandom?.('fx') * Math.PI * 2,
    },
  });
  ally.attackFlash = 0.22;
}

function castAllyMove(ally, targetInfo, moveKey, gifted = false) {
  if (!moveKey || !targetInfo?.target) return false;
  const target = targetInfo.target;
  const stats = Neo.MOVE_BASE_STATS?.[moveKey] || {};
  const presentation = globalThis.NeoNyke?.content?.MOVE_PRESENTATION_DEFS?.[moveKey] || {};
  const range = Math.max(90, Number(stats.range || ally.attackRange || 360));
  if (targetInfo.distance > range + Number(target.r || 16)) return false;
  const damage = allyMoveDamage(ally, moveKey, gifted);
  const color = presentation.color || '#80e8ff';
  const angle = Math.atan2(target.y - ally.y, target.x - ally.x);
  const aoeKinds = new Set(['aoe', 'aura', 'status', 'summon', 'cross', 'column', 'dash_aoe']);
  if (moveKey === 'healing_zone' || presentation.kind === 'support') {
    const state = getLocalAllyState();
    const heal = Math.max(5, ally.maxHealth * 0.16);
    globalThis.NeoNyke?.simulation?.healAlly?.(state, ally.id, heal);
    Neo.ringBurst?.(ally.x, ally.y, 62, '#47ff7d', 0.45);
  } else if (aoeKinds.has(presentation.kind)) {
    const radius = Math.max(80, Number(stats.range || 130));
    (Neo.enemies || []).forEach(enemy => {
      if (!enemy || enemy.dead || Neo.dist(ally.x, ally.y, enemy.x, enemy.y) > radius + Number(enemy.r || 0)) return;
      Neo.hitEnemy?.(enemy, damage, Math.atan2(enemy.y - ally.y, enemy.x - ally.x), 90, color, {
        attacker: ally, source: `ally:${moveKey}`,
      });
    });
    Neo.ringBurst?.(ally.x, ally.y, radius, color, 0.4);
  } else {
    Neo.hitEnemy?.(target, damage, angle, presentation.style === 'heavy' ? 150 : 80, color, {
      attacker: ally, source: `ally:${moveKey}`,
      bleedChance: ally.bleedChance,
    });
    emitAllyAttackFx(ally, target, moveKey, color);
  }
  ally.moveCooldowns[moveKey] = allyMoveCooldown(ally, moveKey, gifted);
  return true;
}

function useAllyBasicAttack(ally, targetInfo) {
  const target = targetInfo?.target;
  if (!target || ally.attackCooldown > 0) return false;
  const archetype = globalThis.NeoNyke?.content?.ALLY_ARCHETYPES?.[ally.archetypeKey];
  const reach = Number(ally.attackRange || archetype?.attackRange || 70) + Number(target.r || 0);
  if (targetInfo.distance > reach) return false;
  const angle = Math.atan2(target.y - ally.y, target.x - ally.x);
  if (archetype?.attack === 'ranged') {
    Neo.spawnProjectile?.({
      x: ally.x, y: ally.y,
      vx: Math.cos(angle) * 480, vy: Math.sin(angle) * 480,
      r: 4, life: 1.4, enemy: false, owner: ally,
      kind: 'ally_bolt', source: `ally:${ally.archetypeKey}`,
      damage: ally.basicDamage, knockback: 55, color: '#80e8ff',
      hitOptions: { attacker: ally, bleedChance: ally.bleedChance },
    });
  } else {
    Neo.hitEnemy?.(target, ally.basicDamage, angle, 85, '#8dffbd', {
      attacker: ally, source: `ally:${ally.archetypeKey}`, bleedChance: ally.bleedChance,
    });
  }
  if (ally.fireBug && !target.dead) Neo.applyFire?.(target, 1, 3.5, 'bug_card');
  ally.attackCooldown = Math.max(0.1, Number(ally.attackInterval || 0.7));
  ally.attackFlash = 0.16;
  return true;
}

function moveLocalAlly(ally, owner, targetInfo, dt, index) {
  const target = targetInfo?.target;
  const ranged = ally.tags?.includes('attack:ranged');
  const desiredRange = target ? (ranged ? Math.min(250, Number(ally.attackRange || 300) * 0.62) : 34) : 0;
  const orbit = Number(Neo.gameElapsedTime || 0) * 0.7 + index * 2.399;
  const goalX = target ? target.x : owner.x + Math.cos(orbit) * (52 + index * 5);
  const goalY = target ? target.y : owner.y + Math.sin(orbit) * (38 + index * 4);
  const dx = goalX - ally.x;
  const dy = goalY - ally.y;
  const distance = Math.hypot(dx, dy) || 1;
  const tooClose = target && ranged && distance < desiredRange * 0.62;
  let direction = distance > desiredRange + 10 ? 1 : tooClose ? -1 : 0;
  if (!target && distance < 14) direction = 0;
  const desiredVx = direction * dx / distance * Number(ally.speed || 170);
  const desiredVy = direction * dy / distance * Number(ally.speed || 170);
  ally.vx += (desiredVx - ally.vx) * Math.min(1, dt * 7);
  ally.vy += (desiredVy - ally.vy) * Math.min(1, dt * 7);
  ally.x = Neo.clamp(ally.x + ally.vx * dt, Neo.WALL + ally.radius, Neo.ROOM_W - Neo.WALL - ally.radius);
  ally.y = Neo.clamp(ally.y + ally.vy * dt, Neo.WALL + ally.radius, Neo.ROOM_H - Neo.WALL - ally.radius);
  if (Neo.dist(ally.x, ally.y, owner.x, owner.y) > 680) {
    ally.x = owner.x + Math.cos(orbit) * 38;
    ally.y = owner.y + Math.sin(orbit) * 30;
    ally.vx = 0;
    ally.vy = 0;
  }
}

function applyEnemyContactToAllies(state, allies) {
  (Neo.enemies || []).forEach(enemy => {
    if (!enemy || enemy.dead || enemy.spawnT > 0 || enemy.type === 'rival' && enemy.rivalData?.friend) return;
    enemy.allyContactCooldowns = enemy.allyContactCooldowns || {};
    Object.keys(enemy.allyContactCooldowns).forEach(id => {
      enemy.allyContactCooldowns[id] = Math.max(0, Number(enemy.allyContactCooldowns[id] || 0) - 0.05);
    });
    allies.forEach(ally => {
      if (Number(enemy.allyContactCooldowns[ally.id] || 0) > 0) return;
      if (Neo.dist(enemy.x, enemy.y, ally.x, ally.y) > Number(enemy.r || 14) + ally.radius + 5) return;
      const result = globalThis.NeoNyke?.simulation?.damageAlly?.(state, ally.id, Math.max(1, Number(enemy.dmg || 8)), {
        owner: ownerForAlly(ally), playersById: state.players,
      });
      enemy.allyContactCooldowns[ally.id] = 0.8;
      if (result?.died) {
        Neo.spawnParticle?.({ x: ally.x, y: ally.y - 22, life: 1, text: result.respawning ? 'RETURNS IN 15' : 'ALLY DOWN', c: '#ff708d' });
        Neo.markInventoryPanelDirty?.();
        Neo.scheduleRunSave?.();
      }
    });
  });
}

export function updateAllies(dt) {
  if (!Neo.player) return;
  const state = getLocalAllyState();
  const events = globalThis.NeoNyke?.simulation?.advanceAllies?.(state, dt, state.players) || [];
  const allies = Object.values(state.allies).filter(ally => ally?.status === 'active');
  allies.forEach((ally, index) => {
    ally.attackFlash = Math.max(0, Number(ally.attackFlash || 0) - dt);
    const owner = ownerForAlly(ally, state.players);
    if (!owner) return;
    const targetInfo = nearestAllyEnemy(ally);
    moveLocalAlly(ally, owner, targetInfo, dt, index);
    const giftedKey = ally.transferredMove?.key || '';
    const nativeReady = ally.nativeMoveKey && Number(ally.moveCooldowns?.[ally.nativeMoveKey] || 0) <= 0;
    const giftedReady = giftedKey && Number(ally.moveCooldowns?.[giftedKey] || 0) <= 0;
    if (giftedReady && castAllyMove(ally, targetInfo, giftedKey, true)) return;
    if (nativeReady && castAllyMove(ally, targetInfo, ally.nativeMoveKey, false)) return;
    useAllyBasicAttack(ally, targetInfo);
  });
  applyEnemyContactToAllies(state, allies);
  commitLocalAllyState(state);
  events.forEach(event => {
    if (event.type === 'ALLY_RESPAWNED') {
      const ally = state.allies[event.allyId];
      Neo.spawnParticle?.({ x: ally?.x || Neo.player.x, y: (ally?.y || Neo.player.y) - 24, life: 1, text: `${ally?.name || 'ALLY'} RETURNS`, c: '#8dffbd' });
      Neo.markInventoryPanelDirty?.();
      Neo.scheduleRunSave?.();
    }
  });
}

export function transferMoveToLocalAlly(allyId, moveKey) {
  const state = getLocalAllyState();
  const result = globalThis.NeoNyke?.simulation?.transferMoveToAlly?.(state, Neo.player, allyId, moveKey, globalThis.NeoNyke?.content || {});
  commitLocalAllyState(state);
  if (result?.ok) {
    Neo.scheduleRunSave?.();
    Neo.markInventoryPanelDirty?.();
  }
  return result;
}

export function recallLocalAllyMove(allyId) {
  const state = getLocalAllyState();
  const result = globalThis.NeoNyke?.simulation?.recallAllyMove?.(state, Neo.player, allyId);
  commitLocalAllyState(state);
  if (result?.ok) { Neo.scheduleRunSave?.(); Neo.markInventoryPanelDirty?.(); }
  return result;
}

export function dismissLocalAlly(allyId) {
  const state = getLocalAllyState();
  const result = globalThis.NeoNyke?.simulation?.dismissAlly?.(state, Neo.player, allyId);
  commitLocalAllyState(state);
  if (result?.ok) { Neo.scheduleRunSave?.(); Neo.markInventoryPanelDirty?.(); }
  return result;
}

export function damageLocalAlly(allyId, damage, options = {}) {
  const state = getLocalAllyState();
  const ally = state.allies[String(allyId || '')];
  const result = globalThis.NeoNyke?.simulation?.damageAlly?.(state, allyId, damage, {
    ...options, owner: ownerForAlly(ally, state.players), playersById: state.players,
  });
  commitLocalAllyState(state);
  if (result?.died) {
    if (ally?.source?.kind === 'rival') {
      const rival = (Neo.rivals || []).find(entry => String(entry.rivalId || entry.characterKey) === String(ally.source.key));
      if (rival) { rival.dead = true; rival.lives = 0; }
    }
    Neo.scheduleRunSave?.();
    Neo.markInventoryPanelDirty?.();
  }
  return result;
}

Neo.ensureLocalAllies = ensureLocalAllies;
Neo.getActiveAllies = activeLocalAllies;
Neo.updateAllies = updateAllies;
Neo.transferMoveToAlly = transferMoveToLocalAlly;
Neo.recallAllyMove = recallLocalAllyMove;
Neo.dismissAlly = dismissLocalAlly;
Neo.damageAlly = damageLocalAlly;
Neo.drawAllyPortrait = drawAllyPortrait;
Neo.drawAllyPortraits = drawAllyPortraits;
