// Shared pillar sprite renderer used by gameplay and all menu backgrounds.
// Kept as a small global utility because menu-background.js is a deferred
// classic script while the gameplay renderer is loaded through ES modules.
(function installPillarRenderer(root) {
  function unwrapImage(asset) {
    return asset?.image || asset || null;
  }

  function resolveImage(images, key) {
    return unwrapImage(images?.[key])
      || unwrapImage(root.Neo?.ENVIRONMENT_IMAGES?.[key]);
  }

  function drawPillarSprite(ctx, pillar, images = null) {
    if (!ctx || !pillar) return false;
    const x = Number(pillar.x || 0);
    const y = Number(pillar.y || 0);
    const structureW = Math.max(24, Number(pillar.w || 34));
    const structureH = Math.max(24, Number(pillar.h || structureW));
    const baseImage = resolveImage(images, 'pillar_1');
    const shaftImage = resolveImage(images, 'pillar_2');
    const capImage = resolveImage(images, 'pillar_3');

    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;

    if (baseImage && shaftImage && capImage) {
      const mids = Math.max(0, Math.min(3, Math.floor(Number(pillar.mids || 0))));
      const segments = [capImage, ...Array(mids).fill(shaftImage), baseImage];
      const segmentH = structureW;
      const totalH = segmentH * segments.length;
      // pillar.y is the centre of the base footprint. Height variation grows
      // upward and therefore never moves the ground line or collision plinth.
      const top = structureH / 2 - totalH;
      segments.forEach((segment, index) => {
        ctx.drawImage(segment, -structureW / 2, top + index * segmentH, structureW, segmentH);
      });
      ctx.restore();
      return true;
    }

    const legacyImage = resolveImage(images, 'pillar');
    if (legacyImage) {
      const legacyH = structureH * 1.35;
      ctx.drawImage(legacyImage, -structureW / 2, structureH / 2 - legacyH, structureW, legacyH);
      ctx.restore();
      return true;
    }

    ctx.restore();
    return false;
  }

  root.NeoPillarRenderer = Object.freeze({ drawPillarSprite });
}(globalThis));
