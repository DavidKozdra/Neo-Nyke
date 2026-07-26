(function initializeSharedBeamPathSystem(root, factory) {
  const api = factory();
  const namespace = root.NeoNyke = root.NeoNyke || {};
  namespace.simulation = namespace.simulation || {};
  Object.assign(namespace.simulation, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedBeamPathApi() {
  'use strict';

  const DEFAULT_EPSILON = 0.0001;
  const DEFAULT_NUDGE = 0.65;

  function rayRectHit(originX, originY, dirX, dirY, rect, maxDistance, epsilon = DEFAULT_EPSILON) {
    const minX = Number(rect?.x || 0);
    const maxX = minX + Number(rect?.w || 0);
    const minY = Number(rect?.y || 0);
    const maxY = minY + Number(rect?.h || 0);
    let nearTime = -Infinity;
    let farTime = Infinity;
    let nearNormalX = 0;
    let nearNormalY = 0;
    let farNormalX = 0;
    let farNormalY = 0;

    if (Math.abs(dirX) < epsilon) {
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

    if (Math.abs(dirY) < epsilon) {
      if (originY < minY || originY > maxY) return null;
    } else {
      let t1 = (minY - originY) / dirY;
      let t2 = (maxY - originY) / dirY;
      let n1y = dirY > 0 ? -1 : 1;
      let n2y = -n1y;
      if (t1 > t2) { [t1, t2] = [t2, t1]; [n1y, n2y] = [n2y, n1y]; }
      if (t1 > nearTime) { nearTime = t1; nearNormalX = 0; nearNormalY = n1y; }
      if (t2 < farTime) { farTime = t2; farNormalX = 0; farNormalY = n1y; }
    }

    if (nearTime > farTime || farTime < epsilon) return null;
    let distance = nearTime;
    let normalX = nearNormalX;
    let normalY = nearNormalY;
    if (distance < epsilon) { distance = farTime; normalX = farNormalX; normalY = farNormalY; }
    if (distance < epsilon || distance > maxDistance) return null;
    return { distance, x: originX + dirX * distance, y: originY + dirY * distance, normalX, normalY };
  }

  function findRicochetHit(originX, originY, dirX, dirY, maxDistance, rects, epsilon = DEFAULT_EPSILON) {
    let closest = null;
    for (const rect of rects || []) {
      const hit = rayRectHit(originX, originY, dirX, dirY, rect, maxDistance, epsilon);
      if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
    }
    return closest;
  }

  function finalizePath(path) {
    let totalLength = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    path.forEach(segment => {
      segment.length = Number.isFinite(segment.length)
        ? segment.length : Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
      totalLength += segment.length;
      left = Math.min(left, segment.x1, segment.x2);
      top = Math.min(top, segment.y1, segment.y2);
      right = Math.max(right, segment.x1, segment.x2);
      bottom = Math.max(bottom, segment.y1, segment.y2);
    });
    path.totalLength = totalLength;
    path.bounds = path.length
      ? { left, top, right, bottom, width: right - left, height: bottom - top }
      : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    return path;
  }

  // Pure, deliberately uncached geometry. Runtime adapters own caching and the
  // source of collision rectangles; campaign and authority share every rule.
  function buildCampaignRicochetBeamPath(options = {}) {
    const path = [];
    let remaining = Math.max(0, Number(options.range || 0));
    let startX = Number(options.originX || 0);
    let startY = Number(options.originY || 0);
    let currentAngle = Number.isFinite(options.angle) ? options.angle : 0;
    const bounceLimit = Math.max(0, Math.floor(Number(options.maxBounces || 0)));
    const nudge = Math.max(0, Number(options.nudge ?? DEFAULT_NUDGE));
    const epsilon = Math.max(0.0000001, Number(options.epsilon ?? DEFAULT_EPSILON));
    const rects = Array.isArray(options.rects) ? options.rects : [];

    for (let bounce = 0; remaining > nudge; bounce += 1) {
      const dirX = Math.cos(currentAngle);
      const dirY = Math.sin(currentAngle);
      const hit = findRicochetHit(startX, startY, dirX, dirY, remaining, rects, epsilon);
      if (!hit) {
        path.push({ x1: startX, y1: startY, x2: startX + dirX * remaining, y2: startY + dirY * remaining, angle: currentAngle, length: remaining, hitWall: false });
        break;
      }
      const segmentLength = Math.max(0, hit.distance);
      if (segmentLength > epsilon) path.push({ x1: startX, y1: startY, x2: hit.x, y2: hit.y, angle: currentAngle, length: segmentLength, hitWall: true });
      if (bounce >= bounceLimit) break;
      remaining = Math.max(0, remaining - segmentLength - nudge);
      const dot = dirX * hit.normalX + dirY * hit.normalY;
      const reflectX = dirX - 2 * dot * hit.normalX;
      const reflectY = dirY - 2 * dot * hit.normalY;
      currentAngle = Math.atan2(reflectY, reflectX);
      startX = hit.x + reflectX * nudge;
      startY = hit.y + reflectY * nudge;
    }
    return finalizePath(path);
  }

  function campaignBeamPathHitsCircle(path, cx, cy, radius) {
    const bounds = path?.bounds;
    if (bounds && (cx + radius < bounds.left || cx - radius > bounds.right || cy + radius < bounds.top || cy - radius > bounds.bottom)) return null;
    for (const segment of path || []) {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const lengthSquared = dx * dx + dy * dy;
      if (!lengthSquared) continue;
      const t = Math.max(0, Math.min(1, ((cx - segment.x1) * dx + (cy - segment.y1) * dy) / lengthSquared));
      const hitX = segment.x1 + t * dx;
      const hitY = segment.y1 + t * dy;
      if ((hitX - cx) ** 2 + (hitY - cy) ** 2 <= radius * radius) return segment;
    }
    return null;
  }

  function campaignBeamPathHitsRect(path, rect, padding = 0) {
    const expanded = {
      x: Number(rect?.x || 0) - padding,
      y: Number(rect?.y || 0) - padding,
      w: Math.max(0, Number(rect?.w || 0) + padding * 2),
      h: Math.max(0, Number(rect?.h || 0) + padding * 2),
    };
    for (const segment of path || []) {
      const dx = segment.x2 - segment.x1;
      const dy = segment.y2 - segment.y1;
      const length = Math.hypot(dx, dy);
      if (length <= 0) continue;
      if (rayRectHit(segment.x1, segment.y1, dx / length, dy / length, expanded, length)) return segment;
    }
    return null;
  }

  function getCampaignPlayerBeamBounceCount(mode = 'beam') {
    return (mode === 'beam' || mode === 'thorn_blood_beams' || mode === 'blood_beam' || mode === 'love_beam') ? 2 : 1;
  }

  return {
    rayRectHit,
    findRicochetHit,
    buildCampaignRicochetBeamPath,
    campaignBeamPathHitsCircle,
    campaignBeamPathHitsRect,
    getCampaignPlayerBeamBounceCount,
  };
});
