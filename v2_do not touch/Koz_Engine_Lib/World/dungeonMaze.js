(function initDungeonMazeLib(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDungeonMazeApi() {
/**
 * Dungeon and maze generation utilities.
 * Provides procedural dungeon generation with rooms and corridors.
 */
function normalizeOdd(value, fallback) {
    let n = Math.max(5, Math.floor(Number(value)) || fallback);
    if (n % 2 === 0) n += 1;
    return n;
  }

/**
 * Creates an RNG function from various inputs.
 * @param {Function|undefined} rng - RNG function or undefined
 * @returns {Function} RNG function
 */
function makeRng(rng) {
    if (typeof rng === "function") return rng;
    return Math.random;
  }

/**
 * Shuffles an array in place using Fisher-Yates.
 * @param {Array} list - Array to shuffle
 * @param {Function} rng - Random number function
 * @returns {Array} Shuffled array
 */
function shuffle(list, rng) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

/**
 * Creates a 2D grid filled with a value.
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 * @param {*} fill - Value to fill with
 * @returns {Array} 2D grid array
 */
function createGrid(cols, rows, fill) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) row.push(fill);
      grid.push(row);
    }
    return grid;
  }

/**
 * Carves a room into the grid.
 * @param {Array} grid - 2D grid
 * @param {Object} room - Room definition {x, y, width, height}
 * @param {*} floorTile - Tile type for floor
 */
function carveRoom(grid, room, floorTile) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        grid[y][x] = floorTile;
      }
    }
  }

/**
 * Checks if two rooms intersect.
 * @param {Object} a - First room
 * @param {Object} b - Second room
 * @param {number} padding - Padding between rooms
 * @returns {boolean} True if rooms intersect
 */
function intersectsRoom(a, b, padding) {
    const pad = Math.max(0, Math.floor(Number(padding)) || 0);
    return !(
      a.x + a.width + pad <= b.x ||
      b.x + b.width + pad <= a.x ||
      a.y + a.height + pad <= b.y ||
      b.y + b.height + pad <= a.y
    );
  }

/**
 * Generates a dungeon maze with rooms and corridors.
 * @param {Object} options - Generation options
 * @returns {Object} Generated dungeon with grid and rooms
 */
function generateDungeonMaze(options) {
    const opts = options || {};
    const cols = normalizeOdd(opts.cols, 31);
    const rows = normalizeOdd(opts.rows, 31);
    const rng = makeRng(opts.rng);
    const wallTile = opts.wallTile !== undefined ? opts.wallTile : "Wall";
    const floorTile = opts.floorTile !== undefined ? opts.floorTile : "Floor";
    const grid = createGrid(cols, rows, wallTile);
    const rooms = [];
    const roomAttempts = Math.max(0, Math.floor(Number(opts.roomAttempts)) || 0);
    const roomMinSize = Math.max(3, Math.floor(Number(opts.roomMinSize)) || 3);
    const roomMaxSize = Math.max(roomMinSize, Math.floor(Number(opts.roomMaxSize)) || 7);
    const roomPadding = Math.max(0, Math.floor(Number(opts.roomPadding)) || 1);

    for (let attempt = 0; attempt < roomAttempts; attempt++) {
      let width = roomMinSize + Math.floor(rng() * (roomMaxSize - roomMinSize + 1));
      let height = roomMinSize + Math.floor(rng() * (roomMaxSize - roomMinSize + 1));
      if (width % 2 === 0) width += 1;
      if (height % 2 === 0) height += 1;

      const x = 1 + Math.floor(rng() * Math.max(1, Math.floor((cols - width - 1) / 2))) * 2;
      const y = 1 + Math.floor(rng() * Math.max(1, Math.floor((rows - height - 1) / 2))) * 2;
      const room = { x: x, y: y, width: width, height: height };
      if (rooms.some(function collides(existing) { return intersectsRoom(existing, room, roomPadding); })) continue;
      rooms.push(room);
      carveRoom(grid, room, floorTile);
    }

    function carveFrom(x, y) {
      grid[y][x] = floorTile;
      const directions = shuffle([[0, -2], [2, 0], [0, 2], [-2, 0]], rng);
      for (const dir of directions) {
        const nx = x + dir[0];
        const ny = y + dir[1];
        if (nx <= 0 || nx >= cols - 1 || ny <= 0 || ny >= rows - 1) continue;
        if (grid[ny][nx] === floorTile) continue;
        grid[y + dir[1] / 2][x + dir[0] / 2] = floorTile;
        carveFrom(nx, ny);
      }
    }

    for (let y = 1; y < rows; y += 2) {
      for (let x = 1; x < cols; x += 2) {
        if (grid[y][x] !== floorTile) carveFrom(x, y);
      }
    }

    for (const room of rooms) {
      const candidates = [];
      for (let x = room.x; x < room.x + room.width; x++) {
        candidates.push([x, room.y - 1], [x, room.y + room.height]);
      }
      for (let y = room.y; y < room.y + room.height; y++) {
        candidates.push([room.x - 1, y], [room.x + room.width, y]);
      }
      const connectors = shuffle(candidates, rng).slice(0, Math.max(1, Math.floor(Number(opts.roomConnectors)) || 2));
      for (const connector of connectors) {
        const x = connector[0];
        const y = connector[1];
        if (x <= 0 || x >= cols - 1 || y <= 0 || y >= rows - 1) continue;
        grid[y][x] = floorTile;
      }
    }

    let firstFloor = null;
    let lastFloor = null;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (grid[y][x] !== floorTile) continue;
        if (!firstFloor) firstFloor = { x: x, y: y };
        lastFloor = { x: x, y: y };
      }
    }

    return {
      cols: cols,
      rows: rows,
      grid: grid,
      rooms: rooms,
      start: firstFloor,
      exit: lastFloor,
      wallTile: wallTile,
      floorTile: floorTile,
    };
  }

  return {
    generateDungeonMaze: generateDungeonMaze,
  };
});
