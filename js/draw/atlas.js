// atlas.js — Environment tile atlas builder.
export function buildEnvironmentTileAtlas() {
    const entries = Object.entries(Neo.ENV_TILE_DEFS);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = Math.max(1, Neo.ENV_TILE_SOURCE_SIZE * Math.max(1, entries.length));
    canvasEl.height = Neo.ENV_TILE_SOURCE_SIZE;
    const atlasCtx = canvasEl.getContext('2d');
    atlasCtx.imageSmoothingEnabled = false;
    const frames = {};
    entries.forEach(([key, def], index) => {
      const ox = index * Neo.ENV_TILE_SOURCE_SIZE;
      frames[key] = { x: ox, y: 0, w: Neo.ENV_TILE_SOURCE_SIZE, h: Neo.ENV_TILE_SOURCE_SIZE };
      drawEnvironmentTileAsset(atlasCtx, ox, 0, Neo.ENV_TILE_SOURCE_SIZE, def || {});
    });
    return { canvas: canvasEl, frames };
  }

export function drawEnvironmentTileAsset(g, ox, oy, size, def) {
    g.save();
    if (!def.transparent) {
      g.fillStyle = def.base || '#343832';
      g.fillRect(ox, oy, size, size);
    }

    if (def.kind === 'floor') {
      drawFloorTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'plank') {
      drawPlankTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'wall') {
      drawWallTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'threshold') {
      drawThresholdTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pillar') {
      drawPillarTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'block') {
      drawBlockTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'pot') {
      drawPotTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'barrel') {
      drawBarrelTileAsset(g, ox, oy, size, def);
    } else if (def.kind === 'lava') {
      drawLavaTileAsset(g, ox, oy, size, def);
    }

    drawTileCracks(g, ox, oy, def);
    drawTileChips(g, ox, oy, def);
    g.restore();
  }

export function drawFloorTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.shade || '#252823';
    g.fillRect(ox, oy + size - 3, size, 3);
    g.fillRect(ox + size - 3, oy, 3, size);
    g.fillStyle = def.edge || '#4c5047';
    g.fillRect(ox + 1, oy + 1, size - 3, 1);
    g.fillRect(ox + 1, oy + 1, 1, size - 3);
    g.strokeStyle = def.mortar || '#1c1f1d';
    g.lineWidth = 1;
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

export function drawPlankTileAsset(g, ox, oy, size, def) {
    drawFloorTileAsset(g, ox, oy, size, def);
  }

export function drawWallTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#303832';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#202722';
    g.fillRect(ox, oy + 8, size, 8);
    g.fillStyle = def.edge || '#586257';
    g.fillRect(ox + 1, oy + 1, size - 2, 2);
    g.fillRect(ox + 1, oy + 8, size - 2, 1);
    g.strokeStyle = def.mortar || '#151917';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
    g.beginPath();
    g.moveTo(ox + 7.5, oy);
    g.lineTo(ox + 7.5, oy + 8);
    g.moveTo(ox + 11.5, oy + 8);
    g.lineTo(ox + 11.5, oy + size);
    g.stroke();
    if (def.ember) {
      g.fillStyle = def.ember;
      g.fillRect(ox + 3, oy + 12, 1, 1);
      g.fillRect(ox + 13, oy + 4, 1, 1);
    }
    if (def.ivy) {
      g.fillStyle = def.ivy;
      g.fillRect(ox + 1, oy + 2, 2, 1);
      g.fillRect(ox + 2, oy + 6, 1, 3);
      g.fillRect(ox + 11, oy + 3, 2, 1);
      g.fillRect(ox + 12, oy + 7, 1, 3);
    }
  }

export function drawThresholdTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#3d4038';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#292d29';
    g.fillRect(ox, oy + size - 4, size, 4);
    g.fillStyle = def.edge || '#655a45';
    g.fillRect(ox + 1, oy + 2, size - 2, 2);
    g.fillRect(ox + 2, oy + 7, size - 4, 1);
    g.strokeStyle = def.mortar || '#1b1f1d';
    g.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);
  }

export function drawPillarTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(ox + 3, oy + 12, 10, 2);
    g.fillStyle = def.shade || '#252b27';
    g.fillRect(ox + 2, oy + 2, 12, 12);
    g.fillStyle = def.base || '#4a4d43';
    g.fillRect(ox + 3, oy + 1, 10, 11);
    g.fillStyle = def.edge || '#727060';
    g.fillRect(ox + 4, oy + 2, 8, 2);
    g.fillRect(ox + 4, oy + 10, 8, 2);
    g.strokeStyle = def.mortar || '#191d1b';
    g.strokeRect(ox + 2.5, oy + 1.5, 11, 12);
  }

export function drawBlockTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(ox + 2, oy + 12, 12, 2);
    g.fillStyle = def.shade || '#222823';
    g.fillRect(ox + 1, oy + 2, 14, 12);
    g.fillStyle = def.base || '#394038';
    g.fillRect(ox + 2, oy + 1, 12, 11);
    g.fillStyle = def.edge || '#626858';
    g.fillRect(ox + 2, oy + 2, 12, 1);
    g.fillRect(ox + 2, oy + 7, 12, 1);
    g.strokeStyle = def.mortar || '#171c1a';
    g.strokeRect(ox + 1.5, oy + 1.5, 13, 12);
    if (def.hiddenMark) {
      g.fillStyle = def.hiddenMark;
      g.fillRect(ox + 7, oy + 4, 2, 1);
      g.fillRect(ox + 8, oy + 5, 1, 3);
    }
  }

export function drawPotTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 4, oy + 13, 8, 2);
    g.fillStyle = def.shade || '#57331f';
    g.fillRect(ox + 5, oy + 5, 7, 8);
    g.fillStyle = def.base || '#9b6744';
    g.fillRect(ox + 6, oy + 4, 5, 9);
    g.fillRect(ox + 5, oy + 6, 7, 5);
    g.fillStyle = def.edge || '#d19a68';
    g.fillRect(ox + 6, oy + 4, 5, 1);
    g.fillRect(ox + 7, oy + 2, 3, 2);
    g.fillStyle = def.mortar || '#25150d';
    g.fillRect(ox + 5, oy + 11, 7, 1);
  }

export function drawBarrelTileAsset(g, ox, oy, size, def) {
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(ox + 3, oy + 13, 10, 2);
    g.fillStyle = def.shade || '#3d2414';
    g.fillRect(ox + 4, oy + 3, 9, 11);
    g.fillStyle = def.base || '#7a4c27';
    g.fillRect(ox + 5, oy + 2, 7, 11);
    g.fillStyle = def.edge || '#b17a42';
    g.fillRect(ox + 5, oy + 3, 7, 1);
    g.fillRect(ox + 5, oy + 11, 7, 1);
    g.fillStyle = def.band || '#2b2d2c';
    g.fillRect(ox + 4, oy + 5, 9, 1);
    g.fillRect(ox + 4, oy + 10, 9, 1);
  }

export function drawLavaTileAsset(g, ox, oy, size, def) {
    g.fillStyle = def.base || '#c43412';
    g.fillRect(ox, oy, size, size);
    g.fillStyle = def.shade || '#6a1604';
    g.fillRect(ox, oy + size - 3, size, 3);
    g.fillRect(ox, oy + 7, size, 1);
    g.fillStyle = def.edge || '#ff9a3a';
    g.fillRect(ox + 1, oy + 1, size - 2, 1);
    g.fillRect(ox + 2, oy + 4, size - 5, 1);
    g.fillRect(ox + 4, oy + 10, size - 7, 1);
    g.fillStyle = def.crust || '#2c0a04';
    g.fillRect(ox + 5, oy + 2, 1, 3);
    g.fillRect(ox + 6, oy + 5, 3, 1);
    g.fillRect(ox + 10, oy + 6, 1, 3);
    g.fillRect(ox + 2, oy + 9, 1, 2);
    g.fillRect(ox + 11, oy + 11, 3, 1);
    g.fillRect(ox + 8, oy + 13, 1, 2);
    g.fillStyle = def.ember || '#ffe27a';
    g.fillRect(ox + 3, oy + 6, 1, 1);
    g.fillRect(ox + 12, oy + 3, 1, 1);
    g.fillRect(ox + 7, oy + 11, 1, 1);
    g.fillRect(ox + 13, oy + 9, 1, 1);
    g.fillRect(ox + 5, oy + 14, 1, 1);
  }

export function drawTileCracks(g, ox, oy, def) {
    if (!Array.isArray(def.cracks)) return;
    g.strokeStyle = def.mortar || '#151917';
    g.lineWidth = 1;
    def.cracks.forEach(points => {
      if (!Array.isArray(points) || points.length < 4) return;
      g.beginPath();
      g.moveTo(ox + points[0], oy + points[1]);
      for (let index = 2; index < points.length - 1; index += 2) {
        g.lineTo(ox + points[index], oy + points[index + 1]);
      }
      g.stroke();
    });
  }

export function drawTileChips(g, ox, oy, def) {
    if (!Array.isArray(def.chips)) return;
    g.fillStyle = def.shade || '#252823';
    def.chips.forEach(chip => {
      if (!Array.isArray(chip) || chip.length < 4) return;
      g.fillRect(ox + chip[0], oy + chip[1], chip[2], chip[3]);
    });
  }

  // Expose on Neo
  Neo.buildEnvironmentTileAtlas = buildEnvironmentTileAtlas;
  Neo.drawEnvironmentTileAsset = drawEnvironmentTileAsset;
  Neo.drawFloorTileAsset = drawFloorTileAsset;
  Neo.drawPlankTileAsset = drawPlankTileAsset;
  Neo.drawWallTileAsset = drawWallTileAsset;
  Neo.drawThresholdTileAsset = drawThresholdTileAsset;
  Neo.drawPillarTileAsset = drawPillarTileAsset;
  Neo.drawBlockTileAsset = drawBlockTileAsset;
  Neo.drawPotTileAsset = drawPotTileAsset;
  Neo.drawBarrelTileAsset = drawBarrelTileAsset;
  Neo.drawLavaTileAsset = drawLavaTileAsset;
  Neo.drawTileCracks = drawTileCracks;
  Neo.drawTileChips = drawTileChips;
// 
