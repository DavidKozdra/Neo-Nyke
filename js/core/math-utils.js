// math-utils.js — utility math, RNG, and beam functions.

export function makeRNG(seed) {
  return mulberry32(xmur3(seed)());
}

export function buildWeightTable(entries) {
  let total = 0;
  const cumulative = entries.map(([key, weight]) => {
    total += Math.max(0, Number(weight) || 0);
    return [key, total];
  });
  return { total, cumulative };
}

export function rollFromWeightTable(table, stream = 'loot', random = null) {
  if (!table || table.total <= 0 || !table.cumulative.length) return 'neo_knife';
  const roll = (typeof random === 'function' ? random() : Neo.nextRandom(stream)) * table.total;
  let lo = 0;
  let hi = table.cumulative.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (roll < table.cumulative[mid][1]) hi = mid;
    else lo = mid + 1;
  }
  return table.cumulative[lo]?.[0] || 'neo_knife';
}

export function mulberry32(a) {
  return function nextRandom() {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function xmur3(seed) {
  let h = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index += 1) {
    h = Math.imul(h ^ seed.charCodeAt(index), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return function seedFn() {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return (h ^ h >>> 16) >>> 0;
  };
}

export function rand(max = 1, min = 0, stream = 'encounter') {
  return min + (max - min) * Neo.nextRandom(stream);
}

export function irand(min, max, stream = 'encounter') {
  return Math.floor(rand(max + 1, min, stream));
}

export function shuffle(array, stream = 'encounter') {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Neo.nextRandom(stream) * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function shuffleWithRandom(array, random) {
  const copy = [...array];
  const next = typeof random === 'function' ? random : () => Neo.nextRandom('encounter');
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function unorderedRemoveAt(array, index, recyclePool = null) {
  if (!array) return null;
  const lastIndex = array.length - 1;
  if (index < 0 || index > lastIndex) return null;
  const removed = array[index];
  if (index !== lastIndex) array[index] = array[lastIndex];
  array.pop();
  if (recyclePool && removed) recyclePool.push(removed);
  return removed;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Shortest distance from point (px,py) to the line segment (ax,ay)-(bx,by).
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const testX = clamp(cx, rx, rx + rw);
  const testY = clamp(cy, ry, ry + rh);
  const dx = cx - testX;
  const dy = cy - testY;
  return dx * dx + dy * dy < r * r;
}

export function getDestructibleRect(prop) {
  const w = Number.isFinite(prop?.w) && prop.w > 0 ? prop.w : (prop?.r || 0) * 2;
  const h = Number.isFinite(prop?.h) && prop.h > 0 ? prop.h : (prop?.r || 0) * 2;
  return { x: prop.x - w / 2, y: prop.y - h / 2, w, h };
}

export function destructibleIntersectsCircle(prop, x, y, r) {
  const rect = getDestructibleRect(prop);
  return circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h);
}

export function getClosedDoorBlockerRects(room = Neo.currentRoom) {
  if (!room) return [];
  const roomLocked = typeof Neo.isRoomLocked === 'function' ? Neo.isRoomLocked() : false;
  const hasExit = dir => typeof Neo.hasRoomExit === 'function'
    ? Neo.hasRoomExit(room, dir)
    : !!room?.doors?.[dir];
  const doorX = (Neo.ROOM_W - Neo.DOOR) / 2;
  const doorY = (Neo.ROOM_H - Neo.DOOR) / 2;
  const blockers = [];
  if (roomLocked || !hasExit('n')) blockers.push({ x: doorX, y: 0, w: Neo.DOOR, h: Neo.WALL, door: 'n' });
  if (roomLocked || !hasExit('s')) blockers.push({ x: doorX, y: Neo.ROOM_H - Neo.WALL, w: Neo.DOOR, h: Neo.WALL, door: 's' });
  if (roomLocked || !hasExit('w')) blockers.push({ x: 0, y: doorY, w: Neo.WALL, h: Neo.DOOR, door: 'w' });
  if (roomLocked || !hasExit('e')) blockers.push({ x: Neo.ROOM_W - Neo.WALL, y: doorY, w: Neo.WALL, h: Neo.DOOR, door: 'e' });
  return blockers;
}

export function isBlocked(x, y, r) {
  if (Neo.walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
  if (getClosedDoorBlockerRects().some(door => circleRect(x, y, r, door.x, door.y, door.w, door.h))) return true;
  if (Neo.structures.some(s => circleRect(x, y, r, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h))) return true;
  // Disguised secret walls are pass-through: the player walks into them to open
  // the passage (see updateWorldProps), so they never act as a solid blocker.
  return Neo.destructibles.some(prop => !prop.broken && !prop.hidden
    && !(prop.kind === 'secret_wall' && prop.disguised)
    && destructibleIntersectsCircle(prop, x, y, r));
}

export function beamHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) return false;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lineLengthSq;
  t = clamp(t, 0, 1);
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const hitDx = px - cx;
  const hitDy = py - cy;
  return hitDx * hitDx + hitDy * hitDy <= radius * radius;
}

export function getPlayerBeamRange(mode = Neo.laserMode, moveKey = Neo.getEquippedMove('laser')) {
  if (mode === 'god_sweep') return 560;
  if (mode === 'turtle_wave') return 620;
  if (moveKey === 'love_beam') return 500;
  return Neo.ATTACKS.laser.range;
}

export function getPlayerBeamBounceCount(mode = Neo.laserMode) {
  return mode === 'beam' ? Neo.PLAYER_BEAM_BOUNCES : Neo.HEAVY_BEAM_BOUNCES;
}

export function getEnemyBeamBounceCount(enemy) {
  if (!enemy) return Neo.ENEMY_BEAM_BOUNCES;
  return enemy.type === 'god' ? Neo.HEAVY_BEAM_BOUNCES : Neo.ENEMY_BEAM_BOUNCES;
}

let beamReflectRectsCacheFrame = -1;
let beamReflectRectsCache = null;

export function getBeamReflectRects() {
  const frameId = Number(Neo.frameId || 0);
  if (beamReflectRectsCacheFrame === frameId && beamReflectRectsCache) return beamReflectRectsCache;

  const rects = Neo.walls.concat(getClosedDoorBlockerRects());
  Neo.structures.forEach(structure => {
    if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
    if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
    rects.push({ x: structure.x - structure.w / 2, y: structure.y - structure.h / 2, w: structure.w, h: structure.h });
  });
  Neo.destructibles.forEach(prop => {
    if (!prop || prop.broken || prop.hidden) return;
    if (prop.kind !== 'cover_wall' && prop.kind !== 'wall' && prop.kind !== 'secret_wall') return;
    const rect = getDestructibleRect(prop);
    if (rect.w > 0 && rect.h > 0) rects.push(rect);
  });
  beamReflectRectsCacheFrame = frameId;
  beamReflectRectsCache = rects;
  return rects;
}

export function rayRectHit(originX, originY, dirX, dirY, rect, maxDistance) {
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;
  let nearTime = -Infinity;
  let farTime = Infinity;
  let nearNormalX = 0;
  let nearNormalY = 0;
  let farNormalX = 0;
  let farNormalY = 0;
  const eps = Neo.BEAM_RICOCHET_EPSILON;

  if (Math.abs(dirX) < eps) {
    if (originX < minX || originX > maxX) return null;
  } else {
    let t1 = (minX - originX) / dirX;
    let t2 = (maxX - originX) / dirX;
    let n1x = dirX > 0 ? -1 : 1;
    let n2x = -n1x;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1x, n2x] = [n2x, n1x]; }
    if (t1 > nearTime) { nearTime = t1; nearNormalX = n1x; nearNormalY = 0; }
    if (t2 < farTime) { farTime = t2; farNormalX = n2x; farNormalY = 0; }
  }

  if (Math.abs(dirY) < eps) {
    if (originY < minY || originY > maxY) return null;
  } else {
    let t1 = (minY - originY) / dirY;
    let t2 = (maxY - originY) / dirY;
    let n1y = dirY > 0 ? -1 : 1;
    let n2y = -n1y;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1y, n2y] = [n2y, n1y]; }
    if (t1 > nearTime) { nearTime = t1; nearNormalX = 0; nearNormalY = n1y; }
    if (t2 < farTime) { farTime = t2; farNormalX = 0; farNormalY = n2y; }
  }

  if (nearTime > farTime || farTime < eps) return null;
  let distance = nearTime;
  let normalX = nearNormalX;
  let normalY = nearNormalY;
  if (distance < eps) { distance = farTime; normalX = farNormalX; normalY = farNormalY; }
  if (distance < eps || distance > maxDistance) return null;
  return { distance, x: originX + dirX * distance, y: originY + dirY * distance, normalX, normalY };
}

export function findBeamRicochetHit(originX, originY, dirX, dirY, maxDistance, rects) {
  let closest = null;
  rects.forEach(rect => {
    const hit = rayRectHit(originX, originY, dirX, dirY, rect, maxDistance);
    if (!hit) return;
    if (!closest || hit.distance < closest.distance) closest = hit;
  });
  return closest;
}

let beamPathCacheFrame = -1;
const beamPathCache = new Map();

function quantizeBeamCacheValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 'NaN';
  return numeric.toFixed(3);
}

function finalizeBeamPath(path) {
  let totalLength = 0;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Number.isFinite(segment.length) ? segment.length : Math.hypot(dx, dy);
    segment.length = length;
    totalLength += length;
    left = Math.min(left, segment.x1, segment.x2);
    top = Math.min(top, segment.y1, segment.y2);
    right = Math.max(right, segment.x1, segment.x2);
    bottom = Math.max(bottom, segment.y1, segment.y2);
  }
  path.totalLength = totalLength;
  path.bounds = path.length
    ? { left, top, right, bottom, width: right - left, height: bottom - top }
    : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  return path;
}

function buildRicochetBeamPathUncached(originX, originY, angle, range, maxBounces = 0) {
  const path = [];
  let remaining = Math.max(0, Number(range || 0));
  let startX = originX;
  let startY = originY;
  let currentAngle = Number.isFinite(angle) ? angle : 0;
  const bounceLimit = Math.max(0, Math.floor(Number(maxBounces || 0)));
  const rects = getBeamReflectRects();
  const nudge = Neo.BEAM_RICOCHET_NUDGE;
  const eps = Neo.BEAM_RICOCHET_EPSILON;

  for (let bounce = 0; remaining > nudge; bounce += 1) {
    const dirX = Math.cos(currentAngle);
    const dirY = Math.sin(currentAngle);
    const hit = findBeamRicochetHit(startX, startY, dirX, dirY, remaining, rects);
    if (!hit) {
      path.push({ x1: startX, y1: startY, x2: startX + dirX * remaining, y2: startY + dirY * remaining, angle: currentAngle, length: remaining, hitWall: false });
      break;
    }
    const segmentLength = Math.max(0, hit.distance);
    if (segmentLength > eps) {
      path.push({ x1: startX, y1: startY, x2: hit.x, y2: hit.y, angle: currentAngle, length: segmentLength, hitWall: true });
    }
    if (bounce >= bounceLimit) break;
    remaining = Math.max(0, remaining - segmentLength - nudge);
    const dot = dirX * hit.normalX + dirY * hit.normalY;
    const reflectX = dirX - 2 * dot * hit.normalX;
    const reflectY = dirY - 2 * dot * hit.normalY;
    currentAngle = Math.atan2(reflectY, reflectX);
    startX = hit.x + reflectX * nudge;
    startY = hit.y + reflectY * nudge;
  }
  return finalizeBeamPath(path);
}

export function buildRicochetBeamPath(originX, originY, angle, range, maxBounces = 0) {
  const frameId = Number(Neo.frameId || 0);
  if (beamPathCacheFrame !== frameId) {
    beamPathCacheFrame = frameId;
    beamPathCache.clear();
  }

  const key = `${quantizeBeamCacheValue(originX)}|${quantizeBeamCacheValue(originY)}|${quantizeBeamCacheValue(angle)}|${quantizeBeamCacheValue(range)}|${Math.max(0, Math.floor(Number(maxBounces || 0)))}`;

  const cached = beamPathCache.get(key);
  if (cached) return cached;

  const path = buildRicochetBeamPathUncached(originX, originY, angle, range, maxBounces);
  beamPathCache.set(key, path);
  return path;
}

export function beamPathHitsCircle(path, cx, cy, radius) {
  const bounds = getBeamPathBounds(path);
  if (
    bounds
    && (cx + radius < bounds.left
      || cx - radius > bounds.right
      || cy + radius < bounds.top
      || cy - radius > bounds.bottom)
  ) {
    return null;
  }
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (beamHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, cx, cy, radius)) return segment;
  }
  return null;
}

export function beamPathHitsDestructible(path, prop, padding = 0) {
  const rect = getDestructibleRect(prop);
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    if (Neo.lineIntersectsRect(segment.x1, segment.y1, segment.x2, segment.y2, rect, padding)) return segment;
  }
  return null;
}

export function getBeamPathLength(path) {
  if (!Array.isArray(path)) return 0;
  if (Number.isFinite(path.totalLength)) return path.totalLength;
  return finalizeBeamPath(path).totalLength;
}

export function getBeamPathBounds(path) {
  if (!Array.isArray(path)) return null;
  if (path.bounds) return path.bounds;
  return finalizeBeamPath(path).bounds;
}

export function getBeamPathEnd(path) {
  const last = path[path.length - 1];
  return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
}

export function sampleBeamPath(path, amount) {
  const totalLength = getBeamPathLength(path);
  if (!totalLength) return null;
  let targetDistance = clamp(Number(amount || 0), 0, 1) * totalLength;
  let traversed = 0;
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = segment.length || Math.hypot(dx, dy);
    if (!length) continue;
    if (targetDistance <= length || index === path.length - 1) {
      const localT = clamp(targetDistance / length, 0, 1);
      const dirX = dx / length;
      const dirY = dy / length;
      return {
        x: segment.x1 + dx * localT,
        y: segment.y1 + dy * localT,
        dx: dirX, dy: dirY, nx: -dirY, ny: dirX,
        t: clamp((traversed + length * localT) / totalLength, 0, 1),
        angle: segment.angle,
      };
    }
    targetDistance -= length;
    traversed += length;
  }
  return null;
}

export function drawTaperedBeamPath(path, options = {}) {
  const totalLength = getBeamPathLength(path);
  if (!totalLength) return;
  const color = options.color || '#ff00aa';
  const glow = options.glow || color;
  const maxWidth = Number(options.maxWidth || 8);
  const minWidthRatio = clamp(Number(options.minWidthRatio || 0), 0, 1);
  const taperPower = Math.max(0.25, Number(options.taperPower || 2));
  const requestedSegmentLength = Math.max(24, Number(options.segmentLength || 32));
  const alpha = Neo.clamp ? Neo.clamp(Number(options.alpha ?? 0.92), 0, 1) : Math.max(0, Math.min(1, Number(options.alpha ?? 0.92)));
  const coreColor = options.coreColor === false ? '' : String(options.coreColor || 'rgba(255,255,255,0.7)');
  const coreAlpha = clamp(Number(options.coreAlpha ?? 1), 0, 1);
  const coreWidth = Math.max(0, Number(options.coreWidth ?? Math.max(1.5, maxWidth * 0.22)));
  let traversed = 0;

  // When the screen is busy in performance mode, drop the beam's shadow glow —
  // shadowBlur is costly and the beam reads fine without it during a particle flood.
  const lowFx = options.lowFx === true
    || (window.NeoSettings?.isPerformanceMode?.() !== false && (Neo.particles?.length || 0) > 80);
  const segmentLength = lowFx ? Math.max(64, requestedSegmentLength) : requestedSegmentLength;
  Neo.ctx.save();
  Neo.ctx.globalAlpha *= alpha;
  Neo.ctx.shadowColor = glow;
  Neo.ctx.shadowBlur = lowFx ? 0 : Number(options.shadowBlur || 18);
  Neo.ctx.fillStyle = color;
  Neo.ctx.beginPath();
  for (let segmentIndex = 0; segmentIndex < path.length; segmentIndex += 1) {
    const segment = path[segmentIndex];
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = segment.length || Math.hypot(dx, dy);
    if (!length) continue;
    const dirX = dx / length;
    const dirY = dy / length;
    const normalX = -dirY;
    const normalY = dirX;
    const subSegments = Math.max(1, Math.ceil(length / segmentLength));
    for (let index = 0; index < subSegments; index += 1) {
      const t0 = index / subSegments;
      const t1 = (index + 1) / subSegments;
      const globalT0 = (traversed + length * t0) / totalLength;
      const globalT1 = (traversed + length * t1) / totalLength;
      const taper0 = minWidthRatio + (1 - minWidthRatio) * (1 - Math.pow(globalT0, taperPower));
      const taper1 = minWidthRatio + (1 - minWidthRatio) * (1 - Math.pow(globalT1, taperPower));
      const w0 = maxWidth * taper0 * 0.5;
      const w1 = maxWidth * taper1 * 0.5;
      const x0 = segment.x1 + dx * t0;
      const y0 = segment.y1 + dy * t0;
      const x1 = segment.x1 + dx * t1;
      const y1 = segment.y1 + dy * t1;
      Neo.ctx.moveTo(x0 + normalX * w0, y0 + normalY * w0);
      Neo.ctx.lineTo(x1 + normalX * w1, y1 + normalY * w1);
      Neo.ctx.lineTo(x1 - normalX * w1, y1 - normalY * w1);
      Neo.ctx.lineTo(x0 - normalX * w0, y0 - normalY * w0);
      Neo.ctx.closePath();
    }
    traversed += length;
  }
  Neo.ctx.fill();

  if (coreColor && coreWidth > 0 && coreAlpha > 0) {
    Neo.ctx.globalAlpha *= coreAlpha;
    Neo.ctx.shadowBlur = lowFx ? 0 : Number(options.coreShadowBlur ?? 6);
    Neo.ctx.strokeStyle = coreColor;
    Neo.ctx.lineWidth = coreWidth;
    Neo.ctx.lineCap = 'round';
    Neo.ctx.lineJoin = 'round';
    Neo.ctx.beginPath();
    path.forEach((segment, index) => {
      if (index === 0) Neo.ctx.moveTo(segment.x1, segment.y1);
      else if (segment.x1 !== path[index - 1].x2 || segment.y1 !== path[index - 1].y2) Neo.ctx.moveTo(segment.x1, segment.y1);
      Neo.ctx.lineTo(segment.x2, segment.y2);
    });
    Neo.ctx.stroke();
  }
  Neo.ctx.restore();
}

export function strokeBeamPath(path, options = {}) {
  drawTaperedBeamPath(path, {
    color: options.color || '#aa66ff',
    glow: options.glow || options.color || '#aa66ff',
    maxWidth: Number(options.width || 7),
    minWidthRatio: Number(options.minWidthRatio ?? 0.18),
    taperPower: Number(options.taperPower || 1.5),
    segmentLength: Number(options.segmentLength || 56),
    shadowBlur: Number(options.shadowBlur || 14),
    alpha: Number(options.alpha ?? 0.92),
    coreColor: options.coreColor || 'rgba(255,255,255,0.58)',
    coreAlpha: Number(options.coreAlpha ?? 1),
    coreWidth: Number(options.coreWidth ?? Math.max(1.2, Number(options.width || 7) * 0.18)),
    coreShadowBlur: Number(options.coreShadowBlur ?? 4),
    lowFx: options.lowFx === true,
  });
}

export function getBeamEnd(x, y, angle, range) {
  return { x: x + Math.cos(angle) * range, y: y + Math.sin(angle) * range };
}

function triggerInteract() {
  if (Neo.gameState !== 'play') return;
  const inShopRoom = Neo.currentRoom?.type === 'shop';
  const inAnvilRoom = Neo.currentRoom?.type === 'anvil';
  if (inShopRoom && !Neo.shopKeyLatch) {
    if (Neo.toggleShopPanel) Neo.toggleShopPanel();
    else if (Neo.ui?.shopPanel) Neo.ui.shopPanel.classList.toggle('hidden');
    Neo.shopKeyLatch = true;
    setTimeout(() => { Neo.shopKeyLatch = false; }, 200);
  }
  if (inAnvilRoom && !Neo.anvilKeyLatch) {
    if (Neo.toggleAnvilPanel) Neo.toggleAnvilPanel();
    else if (Neo.ui?.anvilPanel) Neo.ui.anvilPanel.classList.toggle('hidden');
    Neo.anvilKeyLatch = true;
    setTimeout(() => { Neo.anvilKeyLatch = false; }, 200);
  }
}

// Touch-accessible APIs for mobile hamburger menu
window._neoGame = {
  pauseGame:            () => Neo.pauseGame(),
  resumeGame:           () => Neo.resumeGame(),
  toggleInventoryPanel: () => Neo.toggleInventoryPanel(),
  triggerInteract,
};

// Wire onto Neo for runtime callers that use Neo.X directly
Neo.makeRNG = makeRNG;
Neo.buildWeightTable = buildWeightTable;
Neo.rollFromWeightTable = rollFromWeightTable;
Neo.mulberry32 = mulberry32;
Neo.xmur3 = xmur3;
Neo.rand = rand;
Neo.irand = irand;
Neo.shuffle = shuffle;
Neo.shuffleWithRandom = shuffleWithRandom;
Neo.unorderedRemoveAt = unorderedRemoveAt;
Neo.clamp = clamp;
Neo.dist = dist;
Neo.distToSegment = distToSegment;
Neo.circleRect = circleRect;
Neo.getDestructibleRect = getDestructibleRect;
Neo.destructibleIntersectsCircle = destructibleIntersectsCircle;
Neo.getClosedDoorBlockerRects = getClosedDoorBlockerRects;
Neo.isBlocked = isBlocked;
Neo.beamHitsCircle = beamHitsCircle;
Neo.getPlayerBeamRange = getPlayerBeamRange;
Neo.getPlayerBeamBounceCount = getPlayerBeamBounceCount;
Neo.getEnemyBeamBounceCount = getEnemyBeamBounceCount;
Neo.getBeamReflectRects = getBeamReflectRects;
Neo.rayRectHit = rayRectHit;
Neo.findBeamRicochetHit = findBeamRicochetHit;
Neo.buildRicochetBeamPath = buildRicochetBeamPath;
Neo.beamPathHitsCircle = beamPathHitsCircle;
Neo.beamPathHitsDestructible = beamPathHitsDestructible;
Neo.getBeamPathLength = getBeamPathLength;
Neo.getBeamPathBounds = getBeamPathBounds;
Neo.getBeamPathEnd = getBeamPathEnd;
Neo.sampleBeamPath = sampleBeamPath;
Neo.drawTaperedBeamPath = drawTaperedBeamPath;
Neo.strokeBeamPath = strokeBeamPath;
Neo.getBeamEnd = getBeamEnd;
