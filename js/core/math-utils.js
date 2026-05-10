  function makeRNG(seed) {
    return mulberry32(xmur3(seed)());
  }

  function buildWeightTable(entries) {
    let total = 0;
    const cumulative = entries.map(([key, weight]) => {
      total += Math.max(0, Number(weight) || 0);
      return [key, total];
    });
    return { total, cumulative };
  }

  function rollFromWeightTable(table, stream = 'loot', random = null) {
    if (!table || table.total <= 0 || !table.cumulative.length) return 'neo_knife';
    const roll = (typeof random === 'function' ? random() : nextRandom(stream)) * table.total;
    let lo = 0;
    let hi = table.cumulative.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (roll < table.cumulative[mid][1]) hi = mid;
      else lo = mid + 1;
    }
    return table.cumulative[lo]?.[0] || 'neo_knife';
  }

  function mulberry32(a) {
    return function nextRandom() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function xmur3(seed) {
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

  function rand(max = 1, min = 0, stream = 'encounter') {
    return min + (max - min) * nextRandom(stream);
  }

  function irand(min, max, stream = 'encounter') {
    return Math.floor(rand(max + 1, min, stream));
  }

  function shuffle(array, stream = 'encounter') {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextRandom(stream) * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function shuffleWithRandom(array, random) {
    const copy = [...array];
    const next = typeof random === 'function' ? random : () => nextRandom('encounter');
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(next() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const testX = clamp(cx, rx, rx + rw);
    const testY = clamp(cy, ry, ry + rh);
    const dx = cx - testX;
    const dy = cy - testY;
    return dx * dx + dy * dy < r * r;
  }

  function getDestructibleRect(prop) {
    const w = Number.isFinite(prop?.w) && prop.w > 0 ? prop.w : (prop?.r || 0) * 2;
    const h = Number.isFinite(prop?.h) && prop.h > 0 ? prop.h : (prop?.r || 0) * 2;
    return {
      x: prop.x - w / 2,
      y: prop.y - h / 2,
      w,
      h,
    };
  }

  function destructibleIntersectsCircle(prop, x, y, r) {
    const rect = getDestructibleRect(prop);
    return circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h);
  }

  function isBlocked(x, y, r) {
    if (walls.some(wall => circleRect(x, y, r, wall.x, wall.y, wall.w, wall.h))) return true;
    if (structures.some(structure => circleRect(x, y, r, structure.x - structure.w / 2, structure.y - structure.h / 2, structure.w, structure.h))) return true;
    return destructibles.some(prop => !prop.broken && !prop.hidden && destructibleIntersectsCircle(prop, x, y, r));
  }

  function beamHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    const lineLengthSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (lineLengthSq === 0) return false;
    let t = ((cx - x1) * (x2 - x1) + (cy - y1) * (y2 - y1)) / lineLengthSq;
    t = clamp(t, 0, 1);
    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);
    return dist(px, py, cx, cy) <= radius;
  }

  function getPlayerBeamRange(mode = laserMode, moveKey = getEquippedMove('laser')) {
    if (mode === 'god_sweep') return 560;
    if (mode === 'turtle_wave') return 620;
    if (moveKey === 'love_beam') return 500;
    return ATTACKS.laser.range;
  }

  function getPlayerBeamBounceCount(mode = laserMode) {
    return mode === 'beam' ? PLAYER_BEAM_BOUNCES : HEAVY_BEAM_BOUNCES;
  }

  function getEnemyBeamBounceCount(enemy) {
    if (!enemy) return ENEMY_BEAM_BOUNCES;
    return enemy.type === 'god' ? HEAVY_BEAM_BOUNCES : ENEMY_BEAM_BOUNCES;
  }

  function getBeamReflectRects() {
    const rects = walls.slice();
    structures.forEach(structure => {
      if (!structure || !Number.isFinite(structure.x) || !Number.isFinite(structure.y)) return;
      if (!Number.isFinite(structure.w) || !Number.isFinite(structure.h) || structure.w <= 0 || structure.h <= 0) return;
      rects.push({
        x: structure.x - structure.w / 2,
        y: structure.y - structure.h / 2,
        w: structure.w,
        h: structure.h,
      });
    });
    destructibles.forEach(prop => {
      if (!prop || prop.broken || prop.hidden || prop.kind !== 'cover_wall') return;
      const rect = getDestructibleRect(prop);
      if (rect.w > 0 && rect.h > 0) rects.push(rect);
    });
    return rects;
  }

  function rayRectHit(originX, originY, dirX, dirY, rect, maxDistance) {
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

    if (Math.abs(dirX) < BEAM_RICOCHET_EPSILON) {
      if (originX < minX || originX > maxX) return null;
    } else {
      let t1 = (minX - originX) / dirX;
      let t2 = (maxX - originX) / dirX;
      let n1x = dirX > 0 ? -1 : 1;
      let n2x = -n1x;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1x, n2x] = [n2x, n1x];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = n1x;
        nearNormalY = 0;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = n2x;
        farNormalY = 0;
      }
    }

    if (Math.abs(dirY) < BEAM_RICOCHET_EPSILON) {
      if (originY < minY || originY > maxY) return null;
    } else {
      let t1 = (minY - originY) / dirY;
      let t2 = (maxY - originY) / dirY;
      let n1y = dirY > 0 ? -1 : 1;
      let n2y = -n1y;
      if (t1 > t2) {
        [t1, t2] = [t2, t1];
        [n1y, n2y] = [n2y, n1y];
      }
      if (t1 > nearTime) {
        nearTime = t1;
        nearNormalX = 0;
        nearNormalY = n1y;
      }
      if (t2 < farTime) {
        farTime = t2;
        farNormalX = 0;
        farNormalY = n2y;
      }
    }

    if (nearTime > farTime || farTime < BEAM_RICOCHET_EPSILON) return null;
    let distance = nearTime;
    let normalX = nearNormalX;
    let normalY = nearNormalY;
    if (distance < BEAM_RICOCHET_EPSILON) {
      distance = farTime;
      normalX = farNormalX;
      normalY = farNormalY;
    }
    if (distance < BEAM_RICOCHET_EPSILON || distance > maxDistance) return null;
    return {
      distance,
      x: originX + dirX * distance,
      y: originY + dirY * distance,
      normalX,
      normalY,
    };
  }

  function findBeamRicochetHit(originX, originY, dirX, dirY, maxDistance, rects) {
    let closest = null;
    rects.forEach(rect => {
      const hit = rayRectHit(originX, originY, dirX, dirY, rect, maxDistance);
      if (!hit) return;
      if (!closest || hit.distance < closest.distance) closest = hit;
    });
    return closest;
  }

  function buildRicochetBeamPath(originX, originY, angle, range, maxBounces = 0) {
    const path = [];
    let remaining = Math.max(0, Number(range || 0));
    let startX = originX;
    let startY = originY;
    let currentAngle = Number.isFinite(angle) ? angle : 0;
    const bounceLimit = Math.max(0, Math.floor(Number(maxBounces || 0)));
    const rects = getBeamReflectRects();

    for (let bounce = 0; remaining > BEAM_RICOCHET_NUDGE; bounce += 1) {
      const dirX = Math.cos(currentAngle);
      const dirY = Math.sin(currentAngle);
      const hit = findBeamRicochetHit(startX, startY, dirX, dirY, remaining, rects);
      if (!hit) {
        const endX = startX + dirX * remaining;
        const endY = startY + dirY * remaining;
        path.push({ x1: startX, y1: startY, x2: endX, y2: endY, angle: currentAngle, length: remaining, hitWall: false });
        break;
      }

      const segmentLength = Math.max(0, hit.distance);
      if (segmentLength > BEAM_RICOCHET_EPSILON) {
        path.push({ x1: startX, y1: startY, x2: hit.x, y2: hit.y, angle: currentAngle, length: segmentLength, hitWall: true });
      }
      if (bounce >= bounceLimit) break;

      remaining = Math.max(0, remaining - segmentLength - BEAM_RICOCHET_NUDGE);
      const dot = dirX * hit.normalX + dirY * hit.normalY;
      const reflectX = dirX - 2 * dot * hit.normalX;
      const reflectY = dirY - 2 * dot * hit.normalY;
      currentAngle = Math.atan2(reflectY, reflectX);
      startX = hit.x + reflectX * BEAM_RICOCHET_NUDGE;
      startY = hit.y + reflectY * BEAM_RICOCHET_NUDGE;
    }

    return path;
  }

  function beamPathHitsCircle(path, cx, cy, radius) {
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (beamHitsCircle(segment.x1, segment.y1, segment.x2, segment.y2, cx, cy, radius)) return segment;
    }
    return null;
  }

  function beamPathHitsDestructible(path, prop, padding = 0) {
    const rect = getDestructibleRect(prop);
    for (let index = 0; index < path.length; index += 1) {
      const segment = path[index];
      if (lineIntersectsRect(segment.x1, segment.y1, segment.x2, segment.y2, rect, padding)) return segment;
    }
    return null;
  }

  function getBeamPathLength(path) {
    return path.reduce((sum, segment) => sum + (segment.length || Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)), 0);
  }

  function getBeamPathEnd(path) {
    const last = path[path.length - 1];
    return last ? { x: last.x2, y: last.y2 } : { x: 0, y: 0 };
  }

  function sampleBeamPath(path, amount) {
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
          dx: dirX,
          dy: dirY,
          nx: -dirY,
          ny: dirX,
          t: clamp((traversed + length * localT) / totalLength, 0, 1),
          angle: segment.angle,
        };
      }
      targetDistance -= length;
      traversed += length;
    }
    return null;
  }

  function drawTaperedBeamPath(path, options = {}) {
    const totalLength = getBeamPathLength(path);
    if (!totalLength) return;
    const color = options.color || '#ff00aa';
    const glow = options.glow || color;
    const maxWidth = Number(options.maxWidth || 8);
    let traversed = 0;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = glow;
    ctx.shadowBlur = Number(options.shadowBlur || 18);
    path.forEach(segment => {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = segment.length || Math.hypot(dx, dy);
      if (!length) return;
      const dirX = dx / length;
      const dirY = dy / length;
      const normalX = -dirY;
      const normalY = dirX;
      const subSegments = Math.max(2, Math.ceil(length / 32));
      for (let index = 0; index < subSegments; index += 1) {
        const t0 = index / subSegments;
        const t1 = (index + 1) / subSegments;
        const globalT0 = (traversed + length * t0) / totalLength;
        const globalT1 = (traversed + length * t1) / totalLength;
        const taper0 = 1 - globalT0 * globalT0;
        const taper1 = 1 - globalT1 * globalT1;
        const w0 = maxWidth * taper0 * 0.5;
        const w1 = maxWidth * taper1 * 0.5;
        const x0 = segment.x1 + dx * t0;
        const y0 = segment.y1 + dy * t0;
        const x1 = segment.x1 + dx * t1;
        const y1 = segment.y1 + dy * t1;
        ctx.beginPath();
        ctx.moveTo(x0 + normalX * w0, y0 + normalY * w0);
        ctx.lineTo(x1 + normalX * w1, y1 + normalY * w1);
        ctx.lineTo(x1 - normalX * w1, y1 - normalY * w1);
        ctx.lineTo(x0 - normalX * w0, y0 - normalY * w0);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      traversed += length;
    });

    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.5, maxWidth * 0.22);
    ctx.lineCap = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function strokeBeamPath(path, options = {}) {
    if (!path.length) return;
    const color = options.color || '#aa66ff';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Number(options.width || 7);
    ctx.shadowColor = color;
    ctx.shadowBlur = Number(options.shadowBlur || 14);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path.forEach(segment => {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function getBeamEnd(x, y, angle, range) {
    return {
      x: x + Math.cos(angle) * range,
      y: y + Math.sin(angle) * range,
    };
  }

  // Expose touch-accessible APIs for mobile hamburger menu
  window._neoGame = { pauseGame, resumeGame, toggleInventoryPanel };
})();
