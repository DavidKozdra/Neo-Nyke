(function initAStarLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAStarApi() {
/**
 * Binary Min-Heap implementation for efficient priority queue operations.
 * Used by A* pathfinding to manage the open set of nodes to explore.
 * @private
 */
class MinHeap {
  /**
   * Creates a new MinHeap.
   * @param {Function} scoreFn - Function to extract score from heap items
   */
  constructor(scoreFn) {
    this.data = [];
    this.scoreFn = scoreFn;
  }
  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  get size() { return this.data.length; }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scoreFn(this.data[i]) < this.scoreFn(this.data[parent])) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else break;
    }
  }
  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.scoreFn(this.data[l]) < this.scoreFn(this.data[smallest])) smallest = l;
      if (r < n && this.scoreFn(this.data[r]) < this.scoreFn(this.data[smallest])) smallest = r;
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else break;
    }
  }
}

/**
 * Pre-allocated A* buffers - reused across calls via generation counter.
 * Avoids garbage collection by reusing typed arrays and using integer generations
 * instead of clearing arrays between searches.
 * @private
 */
const _astar = {
  rows: 0,
  cols: 0,
  generation: 0,
  gScore: null,      // Float64Array (flat)
  fScore: null,      // Float64Array (flat)
  genStamp: null,    // Uint32Array (flat) — tracks which generation wrote each cell
  cameFromX: null,   // Int32Array (flat) — Int32 supports maps up to ~2 billion cols
  cameFromY: null,   // Int32Array (flat)
  hasCameFrom: null, // Uint32Array — generation stamp for cameFrom validity
  closedStamp: null, // Uint32Array — per-call closed set
  openStamp: null,   // Uint32Array — per-call open set

  ensure(r, c) {
    if (this.rows === r && this.cols === c && this.gScore) return;
    const n = r * c;
    this.rows = r;
    this.cols = c;
    this.gScore = new Float64Array(n);
    this.fScore = new Float64Array(n);
    this.genStamp = new Uint32Array(n);
    this.cameFromX = new Int32Array(n);
    this.cameFromY = new Int32Array(n);
    this.hasCameFrom = new Uint32Array(n);
    this.closedStamp = new Uint32Array(n);
    this.openStamp = new Uint32Array(n);
    this.generation = 0;
  },

  reset() {
    // Instead of clearing arrays, bump the generation counter.
    // Any cell whose genStamp !== generation is treated as Infinity / false.
    this.generation++;
    // Guard against overflow (very unlikely but safe)
    if (this.generation > 0xFFFFFFF0) {
      this.genStamp.fill(0);
      this.hasCameFrom.fill(0);
      this.generation = 1;
    }
  },

  idx(r, c) { return r * this.cols + c; },

  getG(r, c) {
    const i = this.idx(r, c);
    return this.genStamp[i] === this.generation ? this.gScore[i] : Infinity;
  },
  setG(r, c, v) {
    const i = this.idx(r, c);
    this.gScore[i] = v;
    this.genStamp[i] = this.generation;
  },
  getF(r, c) {
    const i = this.idx(r, c);
    return this.genStamp[i] === this.generation ? this.fScore[i] : Infinity;
  },
  setF(r, c, v) {
    const i = this.idx(r, c);
    this.fScore[i] = v;
    this.genStamp[i] = this.generation;
  },
  setCameFrom(r, c, fr, fc) {
    const i = this.idx(r, c);
    this.cameFromX[i] = fc;
    this.cameFromY[i] = fr;
    this.hasCameFrom[i] = this.generation;
  },
  getCameFrom(r, c) {
    const i = this.idx(r, c);
    if (this.hasCameFrom[i] !== this.generation) return null;
    return { x: this.cameFromX[i], y: this.cameFromY[i] };
  }
};

/**
 * A* pathfinding with binary heap.
 * Uses pre-allocated typed arrays to avoid GC pressure.
 * @param {Array} grid - 2D grid array
 * @param {Object} start - {x, y}
 * @param {Object} goal - {x, y}
 * @param {boolean} allowWater - if true, water tiles are walkable (for boats)
 * @param {Array} portCities - array of port city locations [{x,y},...] for land/water transition gating
 * @param {boolean} waterOnly - if true, only water tiles are walkable (for pirates)
 */
function aStar(grid, start, goal, allowWater = false, portCities = null, waterOnly = false) {
  const rows = grid.length;
  const cols = grid[0].length;

  _astar.ensure(rows, cols);
  _astar.reset();

  // Reuse pre-allocated closed/open stamp arrays
  const closedStamp = _astar.closedStamp;
  const openStamp = _astar.openStamp;
  const gen = _astar.generation;

  // Weighted heuristic — slight overestimate steers A* more aggressively toward goal,
  // drastically reducing nodes expanded on large/costly maps.
  function heuristic(ax, ay, bx, by) {
    return (Math.abs(ax - bx) + Math.abs(ay - by)) * 1.2;
  }

  _astar.setG(start.y, start.x, 0);
  _astar.setF(start.y, start.x, heuristic(start.x, start.y, goal.x, goal.y));

  const openSet = new MinHeap(n => _astar.getF(n.y, n.x));
  openSet.push(start);
  openStamp[start.y * cols + start.x] = gen;

  // Pre-compute port tile set for fast lookup
  let portTileSet = null;
  if (portCities) {
    portTileSet = new Set();
    for (const pc of portCities) {
      // Keep A* transition rules aligned with Player._isNearPort() (radius 2).
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const px = pc.x + dx, py = pc.y + dy;
          if (px >= 0 && px < cols && py >= 0 && py < rows) {
            portTileSet.add(py * cols + px);
          }
        }
      }
    }
    // Note: an empty set means "no legal land↔water transitions".
  }

  // Iteration cap — scale with Manhattan distance between start and goal.
  // Flat caps like 200K hurt long paths on large maps while still being too
  // expensive when many entities search simultaneously. Using distance × K
  // gives proportional budget: short paths fail fast, long paths get more room.
  const manhattanDist = Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y);
  const maxIter = Math.min(
    manhattanDist * 80,   // ~80 nodes explored per tile of straight-line distance
    rows * cols,          // never exceed total map size
    150000                // hard upper bound to protect frame time
  );
  let iterations = 0;

  while (openSet.size > 0) {
    if (++iterations > maxIter) return []; // give up — no path within budget

    const current = openSet.pop();
    const ci = current.y * cols + current.x;
    openStamp[ci] = 0;

    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let c = current;
      let from = _astar.getCameFrom(c.y, c.x);
      while (from) {
        path.unshift(c);
        c = from;
        from = _astar.getCameFrom(c.y, c.x);
      }
      return path;
    }

    closedStamp[ci] = gen;

    const currentType = grid[current.y][current.x].options[0];

    for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (closedStamp[ni] === gen) continue;

      const tile = grid[ny][nx];
      if (!tile) continue;

      const nextType = tile.options[0];

      // Water traversal rules
      if (nextType === 'Water' && !allowWater) continue;
      if (waterOnly && nextType !== 'Water') continue;

      // Port-only land↔water transitions
      if (portTileSet !== null && currentType !== nextType) {
        const isTransition = (currentType === 'Water' && nextType !== 'Water') ||
                             (currentType !== 'Water' && nextType === 'Water');
        if (isTransition) {
          // The LAND side of the transition must be near a port
          const landIdx = (nextType === 'Water')
            ? current.y * cols + current.x
            : ni;
          if (!portTileSet.has(landIdx)) continue;
        }
      }

      // Cost calculation — elevation scaled gently so mountains are slow but reachable
      const elevationCost = Math.abs(elevationMap[ny][nx] - elevationMap[current.y][current.x]) * 3;
      const baseTileCost = nextType === 'Water' ? 2 : (baseDiff[nextType] || 1);
      const tentativeG = _astar.getG(current.y, current.x) + baseTileCost + (nextType === 'Water' ? 0 : elevationCost);

      if (tentativeG < _astar.getG(ny, nx)) {
        _astar.setCameFrom(ny, nx, current.y, current.x);
        _astar.setG(ny, nx, tentativeG);
        _astar.setF(ny, nx, tentativeG + heuristic(nx, ny, goal.x, goal.y));

        if (openStamp[ni] !== gen) {
          openSet.push({ x: nx, y: ny });
          openStamp[ni] = gen;
        }
      }
    }
  }

  return []; // No path found
}

return {
  MinHeap,
  aStar,
};
});
