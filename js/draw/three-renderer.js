// three-renderer.js — 3D world renderer (Three.js). The game simulation stays in
// its 2D top-down coordinate space; this module renders that state as a 3D scene:
// rooms become real geometry (floor plane + wall boxes with door gaps), and every
// actor/prop/projectile becomes a camera-facing billboard textured with the same
// pixel-art the 2D renderer uses (via Neo.SPRITE_ATLAS / ENVIRONMENT_IMAGES).
// Game (x, y) maps to 3D (x, z); 3D y is height above the floor.
//
// The WebGL canvas (#c3d) sits BEHIND the main 2D canvas (#c). When 3D mode is
// on, environment.js skips the 2D world pass, leaving #c transparent there, so
// the minimap / overlays / HUD keep drawing on top unchanged.
import * as THREE from '../vendor/three.module.js';

const RENDER3D_STORE_KEY = 'neonyke:render3d';
const CAMERA_MODE_STORE_KEY = 'neonyke:camera3d';
const WALL_HEIGHT = 112;
const PILLAR_HEIGHT = 150;
const BLOCK_HEIGHT = 58;
const BEAM_Y = 26;          // beams travel at torso height
const SPRITE_SIZE_MULT = 3.4; // world height of a billboard = r * this (2D draws at ~r*3)

let renderer = null;
let scene = null;
let camera = null;
let glCanvas = null;
let ready = false;
let failed = false;

// Room (static) group state
let roomGroup = null;
let roomBuildKey = '';
let floorMesh = null;
let floorTexture = null;
let floorCacheKey = null;

// Lighting
let ambientLight = null;
let playerLight = null;

// Entity pools: Map<gameObject, THREE.Object3D>
const pools = {
  enemies: new Map(),
  projectiles: new Map(),
  pickups: new Map(),
  chests: new Map(),
  destructibles: new Map(),
  particles: new Map(),
  hazards: new Map(),
  offers: new Map(),
  bodies: new Map(),
};
let playerSprite = null;
let playerShadow = null;
const beamMeshes = []; // reused per-frame list of beam boxes
const hpBarPool = new Map(); // enemy -> {back, fill}

// ---------------------------------------------------------------------------
// Texture caches
// ---------------------------------------------------------------------------
const spriteTextureCache = new Map(); // `${key}|${flip}` -> THREE.Texture
const glowTextureCache = new Map();   // color -> THREE.Texture
const textTextureCache = new Map();   // `${text}|${color}` -> {texture, w, h}
const imageTextureCache = new Map();  // `${imgKey}|${frame}|${fw}` -> THREE.Texture
const tileTextureCache = new Map();   // envTileKey -> THREE.Texture

function makeCanvasTexture(canvasEl) {
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}

// Rasterize one atlas frame (sprite pixel-art) into its own texture.
function getSpriteTexture(spriteKey, flip = false) {
  const cacheKey = `${spriteKey}|${flip ? 1 : 0}`;
  const cached = spriteTextureCache.get(cacheKey);
  if (cached) return cached;
  const atlas = Neo.SPRITE_ATLAS;
  if (!atlas?.frames || !atlas.canvas) return null;
  const baseKey = String(spriteKey || '').split(':')[0];
  const frame = atlas.frames[spriteKey] || atlas.frames[baseKey] || atlas.frames.hunter;
  if (!frame) return null;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = frame.w;
  canvasEl.height = frame.h;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(frame.w, 0);
    g.scale(-1, 1);
  }
  g.drawImage(atlas.canvas, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  const texture = makeCanvasTexture(canvasEl);
  texture.userData = { renderScale: Number(frame.renderScale || 1), aspect: frame.w / frame.h };
  spriteTextureCache.set(cacheKey, texture);
  return texture;
}

// Frame of an environment sheet image (chest_0, forge_0...) as a texture.
function getImageTexture(imgKey, frame = 0, frameWidth = 24) {
  const cacheKey = `${imgKey}|${frame}|${frameWidth}`;
  const cached = imageTextureCache.get(cacheKey);
  if (cached) return cached;
  const image = Neo.ENVIRONMENT_IMAGES?.[imgKey]?.image;
  if (!image) return null;
  const fh = image.naturalHeight;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = frameWidth;
  canvasEl.height = fh;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(image, frame * frameWidth, 0, frameWidth, fh, 0, 0, frameWidth, fh);
  const texture = makeCanvasTexture(canvasEl);
  imageTextureCache.set(cacheKey, texture);
  return texture;
}

// Rasterize an environment tile (drawn procedurally into Neo.ctx) by pointing
// Neo.ctx at an offscreen canvas for the duration of the draw call.
function getEnvTileTexture(tileKey, size = 48) {
  const cached = tileTextureCache.get(tileKey);
  if (cached) return cached;
  if (typeof Neo.drawEnvironmentTile !== 'function') return null;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = size;
  canvasEl.height = size;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = g;
    Neo.drawEnvironmentTile(tileKey, 0, 0, size, size);
  } catch { /* tile failed to draw; fall through with whatever rendered */ }
  Neo.ctx = realCtx;
  const texture = makeCanvasTexture(canvasEl);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  tileTextureCache.set(tileKey, texture);
  return texture;
}

function getGlowTexture(color = '#ffffff') {
  const cached = glowTextureCache.get(color);
  if (cached) return cached;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = 32;
  canvasEl.height = 32;
  const g = canvasEl.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const texture = makeCanvasTexture(canvasEl);
  glowTextureCache.set(color, texture);
  return texture;
}

function getTextTexture(text, color = '#ffffff') {
  const cacheKey = `${text}|${color}`;
  const cached = textTextureCache.get(cacheKey);
  if (cached) return cached;
  // Damage numbers churn endlessly; keep the cache bounded.
  if (textTextureCache.size > 300) {
    const oldest = textTextureCache.keys().next().value;
    textTextureCache.get(oldest)?.texture?.dispose?.();
    textTextureCache.delete(oldest);
  }
  const font = 'bold 22px monospace';
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const w = Math.max(8, Math.ceil(measure.measureText(text).width) + 8);
  const h = 30;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = w;
  canvasEl.height = h;
  const g = canvasEl.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 4;
  g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  const entry = { texture: makeCanvasTexture(canvasEl), w, h };
  textTextureCache.set(cacheKey, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Shared geometry / materials
// ---------------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const unitCircle = new THREE.CircleGeometry(0.5, 24);

function makeBillboard(texture, opts = {}) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    color: opts.color || 0xffffff,
    depthWrite: opts.depthWrite !== false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0); // feet at position.y
  return sprite;
}

function makeShadowMesh(radius) {
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const mesh = new THREE.Mesh(unitCircle, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.renderOrder = 1;
  return mesh;
}

function disposeObject(obj) {
  obj.traverse?.(node => {
    if (node.material) {
      // Cached/shared textures survive; per-segment texture clones (marked
      // `owned`) are disposed with their material.
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(m => {
        if (m.map?.userData?.owned) m.map.dispose();
        m.dispose();
      });
    }
    if (node.geometry && node.geometry !== unitBox && node.geometry !== unitPlane && node.geometry !== unitCircle) {
      node.geometry.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// Init / resize
// ---------------------------------------------------------------------------
function initRenderer() {
  if (ready || failed) return ready;
  const mainCanvas = Neo.canvas;
  if (!mainCanvas?.parentNode) return false;
  try {
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'c3d';
    mainCanvas.parentNode.insertBefore(glCanvas, mainCanvas);
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false });
    renderer.setClearColor(0x05060d, 1);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x05060d, 900, 1900);
    camera = new THREE.PerspectiveCamera(50, 1.5, 10, 3000);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0xdfe8ff, 0.65);
    keyLight.position.set(-320, 640, -220);
    scene.add(keyLight);
    playerLight = new THREE.PointLight(0xffd9a0, 46000, 640, 1.9);
    scene.add(playerLight);
    window.addEventListener('resize', syncSize);
    syncSize();
    ready = true;
  } catch (err) {
    console.warn('[3D] WebGL init failed, staying on 2D renderer', err);
    failed = true;
  }
  return ready;
}

function syncSize() {
  if (!renderer || !Neo.canvas) return;
  const rect = Neo.canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(rect.width));
  const h = Math.max(2, Math.round(rect.height));
  if (glCanvas.width !== Math.round(w * ratio) || glCanvas.height !== Math.round(h * ratio)) {
    renderer.setPixelRatio(ratio);
    // updateStyle=true: #c3d's CSS box mirrors #c's actual layout box, so
    // theme/media-query size overrides on #c can never desync the two layers.
    renderer.setSize(w, h, true);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Static room build
// ---------------------------------------------------------------------------

// Keep the authentic 2D floor art: drawFloor() maintains a full-room cached
// canvas (Neo.environmentBackgroundCache). Refresh it by calling drawFloor with
// Neo.ctx pointed at a throwaway context, then use the cache as the texture.
function refreshFloorTexture() {
  if (typeof Neo.drawFloor !== 'function') return;
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = scratchCtx();
    Neo.drawFloor();
  } catch { /* leave whatever cache exists */ }
  Neo.ctx = realCtx;
  const cache = Neo.environmentBackgroundCache;
  if (!cache?.canvas) return;
  if (floorTexture?.image === cache.canvas && floorCacheKey === cache.key) {
    floorTexture.needsUpdate = true;
    return;
  }
  floorCacheKey = cache.key;
  if (floorTexture) floorTexture.dispose();
  floorTexture = makeCanvasTexture(cache.canvas);
  if (floorMesh) {
    floorMesh.material.map = floorTexture;
    floorMesh.material.needsUpdate = true;
  }
}

let _scratchCtx = null;
function scratchCtx() {
  if (!_scratchCtx) _scratchCtx = document.createElement('canvas').getContext('2d');
  return _scratchCtx;
}

function themeWallColor(theme) {
  // wallEdge is an rgba() string; parse to a solid color, darkened for bulk.
  const match = /rgba?\(([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(theme?.wallEdge || '');
  if (!match) return new THREE.Color(0x3c4350);
  return new THREE.Color(Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255);
}

// One env tile stretched over a whole wall reads as a giant smear up close (it
// was very visible in first person). Give each segment its own texture clone
// with UV repeat so the tile pattern actually tiles at world scale.
const WALL_TILE_UNITS = 56;
function makeWallMaterial(texture, color, lengthUnits, heightUnits = WALL_HEIGHT) {
  if (!texture) return new THREE.MeshLambertMaterial({ color });
  const tiled = texture.clone();
  tiled.wrapS = THREE.RepeatWrapping;
  tiled.wrapT = THREE.RepeatWrapping;
  tiled.repeat.set(
    Math.max(1, Math.round(lengthUnits / WALL_TILE_UNITS)),
    Math.max(1, Math.round(heightUnits / WALL_TILE_UNITS)),
  );
  tiled.needsUpdate = true;
  tiled.userData = { owned: true };
  return new THREE.MeshLambertMaterial({ map: tiled, color: 0xcfcfcf });
}

function addWallSegment(group, wallSkin, x1, x2, z1, z2) {
  const w = Math.max(1, x2 - x1);
  const d = Math.max(1, z2 - z1);
  const mesh = new THREE.Mesh(unitBox, makeWallMaterial(wallSkin.texture, wallSkin.color, Math.max(w, d)));
  mesh.scale.set(w, WALL_HEIGHT, d);
  mesh.position.set(x1 + w / 2, WALL_HEIGHT / 2, z1 + d / 2);
  group.add(mesh);
}

// A short dark passage beyond each door gap, so doorways read as tunnels to
// the next room instead of holes into the void — matters most in first person.
const CORRIDOR_DEPTH = 96;
function addDoorCorridor(group, side, wallSkin) {
  const W = Neo.ROOM_W;
  const H = Neo.ROOM_H;
  const DOOR = Neo.DOOR;
  const half = DOOR / 2;
  const midX = W / 2;
  const midZ = H / 2;
  const dark = new THREE.MeshBasicMaterial({ color: 0x0a0c12 });
  const capMaterial = new THREE.MeshBasicMaterial({ color: 0x05060d });

  const addFloorAndCeiling = (cx, cz, w, d) => {
    const floor = new THREE.Mesh(unitPlane, dark);
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(w, d, 1);
    floor.position.set(cx, 0.4, cz);
    group.add(floor);
    const top = new THREE.Mesh(unitPlane, dark);
    top.rotation.x = Math.PI / 2;
    top.scale.set(w, d, 1);
    top.position.set(cx, WALL_HEIGHT, cz);
    group.add(top);
  };
  const addCap = (cx, cz, rotY) => {
    const cap = new THREE.Mesh(unitPlane, capMaterial);
    cap.scale.set(DOOR, WALL_HEIGHT, 1);
    cap.position.set(cx, WALL_HEIGHT / 2, cz);
    cap.rotation.y = rotY;
    group.add(cap);
  };

  if (side === 'n') {
    addFloorAndCeiling(midX, -CORRIDOR_DEPTH / 2, DOOR, CORRIDOR_DEPTH);
    addWallSegment(group, wallSkin, midX - half - 10, midX - half, -CORRIDOR_DEPTH, 0);
    addWallSegment(group, wallSkin, midX + half, midX + half + 10, -CORRIDOR_DEPTH, 0);
    addCap(midX, -CORRIDOR_DEPTH, 0);
  } else if (side === 's') {
    addFloorAndCeiling(midX, H + CORRIDOR_DEPTH / 2, DOOR, CORRIDOR_DEPTH);
    addWallSegment(group, wallSkin, midX - half - 10, midX - half, H, H + CORRIDOR_DEPTH);
    addWallSegment(group, wallSkin, midX + half, midX + half + 10, H, H + CORRIDOR_DEPTH);
    addCap(midX, H + CORRIDOR_DEPTH, Math.PI);
  } else if (side === 'w') {
    addFloorAndCeiling(-CORRIDOR_DEPTH / 2, midZ, CORRIDOR_DEPTH, DOOR);
    addWallSegment(group, wallSkin, -CORRIDOR_DEPTH, 0, midZ - half - 10, midZ - half);
    addWallSegment(group, wallSkin, -CORRIDOR_DEPTH, 0, midZ + half, midZ + half + 10);
    addCap(-CORRIDOR_DEPTH, midZ, Math.PI / 2);
  } else if (side === 'e') {
    addFloorAndCeiling(W + CORRIDOR_DEPTH / 2, midZ, CORRIDOR_DEPTH, DOOR);
    addWallSegment(group, wallSkin, W, W + CORRIDOR_DEPTH, midZ - half - 10, midZ - half);
    addWallSegment(group, wallSkin, W, W + CORRIDOR_DEPTH, midZ + half, midZ + half + 10);
    addCap(W + CORRIDOR_DEPTH, midZ, -Math.PI / 2);
  }
}

function buildRoom() {
  const room = Neo.currentRoom;
  if (!room) return;
  if (roomGroup) {
    scene.remove(roomGroup);
    disposeObject(roomGroup);
  }
  roomGroup = new THREE.Group();
  const W = Neo.ROOM_W;
  const H = Neo.ROOM_H;
  const WALL = Neo.WALL;
  const DOOR = Neo.DOOR;
  const theme = Neo.getRoomArtTheme?.(room) || {};

  // Floor: the 2D renderer's cached full-room background as one textured plane.
  refreshFloorTexture();
  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture || null });
  if (!floorTexture) floorMaterial.color = new THREE.Color(theme.backdrop || '#151916');
  floorMesh = new THREE.Mesh(unitPlane, floorMaterial);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.scale.set(W, H, 1);
  floorMesh.position.set(W / 2, 0, H / 2);
  roomGroup.add(floorMesh);

  // Ground plane surrounding the room so the void isn't a hard edge.
  const apron = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ color: 0x07080f }));
  apron.rotation.x = -Math.PI / 2;
  apron.scale.set(W * 5, H * 5, 1);
  apron.position.set(W / 2, -1.5, H / 2);
  roomGroup.add(apron);

  // Walls: textured with the theme's wall tile, gaps where doors exist.
  const wallSkin = {
    texture: theme.wallTile ? getEnvTileTexture(theme.wallTile) : null,
    color: themeWallColor(theme),
  };
  const doors = room.doors || {};
  const midX = W / 2;
  const midZ = H / 2;
  const half = DOOR / 2;
  // North wall (z: 0..WALL)
  if (doors.n) {
    addWallSegment(roomGroup, wallSkin, 0, midX - half, 0, WALL);
    addWallSegment(roomGroup, wallSkin, midX + half, W, 0, WALL);
  } else {
    addWallSegment(roomGroup, wallSkin, 0, W, 0, WALL);
  }
  // South wall
  if (doors.s) {
    addWallSegment(roomGroup, wallSkin, 0, midX - half, H - WALL, H);
    addWallSegment(roomGroup, wallSkin, midX + half, W, H - WALL, H);
  } else {
    addWallSegment(roomGroup, wallSkin, 0, W, H - WALL, H);
  }
  // West wall
  if (doors.w) {
    addWallSegment(roomGroup, wallSkin, 0, WALL, 0, midZ - half);
    addWallSegment(roomGroup, wallSkin, 0, WALL, midZ + half, H);
  } else {
    addWallSegment(roomGroup, wallSkin, 0, WALL, 0, H);
  }
  // East wall
  if (doors.e) {
    addWallSegment(roomGroup, wallSkin, W - WALL, W, 0, midZ - half);
    addWallSegment(roomGroup, wallSkin, W - WALL, W, midZ + half, H);
  } else {
    addWallSegment(roomGroup, wallSkin, W - WALL, W, 0, H);
  }

  // Ceiling: a single down-facing plane at wall height. Single-sided, so the
  // third-person camera above it culls it away entirely — only the first-person
  // camera (under it) ever sees it.
  const ceiling = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
    color: new THREE.Color(theme.backdrop || '#151916').multiplyScalar(0.55),
  }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.scale.set(W, H, 1);
  ceiling.position.set(W / 2, WALL_HEIGHT, H / 2);
  roomGroup.add(ceiling);

  // Passage stubs beyond each open door.
  ['n', 's', 'w', 'e'].forEach(side => {
    if (doors[side]) addDoorCorridor(roomGroup, side, wallSkin);
  });

  // Door glow markers on the floor at each opening.
  const doorMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(themeWallColor(theme)).offsetHSL(0, 0.2, 0.25),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const addDoorPad = (x, z, w, d) => {
    const pad = new THREE.Mesh(unitPlane, doorMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.scale.set(w, d, 1);
    pad.position.set(x, 1.2, z);
    roomGroup.add(pad);
  };
  if (doors.n) addDoorPad(midX, WALL / 2, DOOR, WALL);
  if (doors.s) addDoorPad(midX, H - WALL / 2, DOOR, WALL);
  if (doors.w) addDoorPad(WALL / 2, midZ, WALL, DOOR);
  if (doors.e) addDoorPad(W - WALL / 2, midZ, WALL, DOOR);

  // Structures: pillars become real columns; anvil/forge/furniture billboard.
  (Neo.structures || []).forEach(structure => {
    if (!structure) return;
    if (structure.kind === 'pillar') {
      const w = Math.max(20, Number(structure.w || 40));
      const material = makeWallMaterial(getEnvTileTexture('wall_block'), themeWallColor(theme), w, PILLAR_HEIGHT);
      const mesh = new THREE.Mesh(unitBox, material);
      mesh.scale.set(w, PILLAR_HEIGHT, w * 0.8);
      mesh.position.set(structure.x, PILLAR_HEIGHT / 2, structure.y);
      roomGroup.add(mesh);
    } else if (structure.kind === 'anvil' || structure.kind === 'forge') {
      const texture = getImageTexture(structure.kind === 'anvil' ? 'anvil_0' : 'forge_0', 0, 24);
      if (texture) {
        const size = Math.max(32, Number(structure.w || 48)) * 1.4;
        const sprite = makeBillboard(texture);
        sprite.scale.set(size, size, 1);
        sprite.position.set(structure.x, 0, structure.y + Number(structure.h || 40) / 2);
        roomGroup.add(sprite);
      }
    } else {
      const w = Math.max(20, Number(structure.w || 40));
      const h = Math.max(20, Number(structure.h || 40));
      const mesh = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: themeWallColor(theme) }));
      mesh.scale.set(w, BLOCK_HEIGHT, h);
      mesh.position.set(structure.x, BLOCK_HEIGHT / 2, structure.y);
      roomGroup.add(mesh);
    }
  });

  scene.add(roomGroup);
}

function getRoomBuildKey() {
  const room = Neo.currentRoom;
  if (!room) return '';
  return `${room.gx},${room.gy}|${Neo.floor}|${room.type}|${(Neo.structures || []).length}|${Neo.environmentBackgroundCache?.key || ''}`;
}

// ---------------------------------------------------------------------------
// Per-frame entity sync
// ---------------------------------------------------------------------------
function syncPool(pool, list, makeFn, updateFn) {
  const seen = new Set();
  (list || []).forEach(item => {
    if (!item) return;
    let obj = pool.get(item);
    if (!obj) {
      obj = makeFn(item);
      if (!obj) return;
      pool.set(item, obj);
      scene.add(obj);
    }
    seen.add(item);
    updateFn(item, obj);
  });
  pool.forEach((obj, item) => {
    if (seen.has(item)) return;
    scene.remove(obj);
    disposeObject(obj);
    pool.delete(item);
  });
}

// Mirrors getEnemySpriteKey in entities.js (module-internal there).
function enemySpriteKey(enemy) {
  if (enemy.type === 'rival') return enemy.rivalKey;
  if (enemy.type === 'mirror_knight') return enemy.spriteKey || playerSpriteKey();
  if (enemy.type === 'machine_gunner') return Neo.SPRITE_DEFS.machine_gunner ? 'machine_gunner' : 'sniper';
  if (enemy.type === 'summoner') return Neo.SPRITE_DEFS.summoner ? 'summoner' : 'cult_mage';
  if (enemy.type === 'shield_unit') return 'golem';
  if (enemy.type === 'healer') return 'cult_follower';
  if (enemy.type === 'boss_spawner') return 'laser';
  return Neo.SPRITE_DEFS[enemy.type] ? enemy.type : 'hunter';
}

function playerSpriteKey() {
  const key = Neo.getCharacterDef?.().key;
  const spriteKey = Neo.getCharacterSpriteKey ? Neo.getCharacterSpriteKey(key) : key;
  return Neo.SPRITE_DEFS?.[spriteKey] ? spriteKey : 'thorn_knight';
}

function facingOf(actor, fallbackAngle) {
  if (Math.abs(actor.vx || 0) > 6) return actor.vx < 0 ? -1 : 1;
  return Math.cos(fallbackAngle) < 0 ? -1 : 1;
}

function makeActorGroup(spriteKey, radius) {
  const texture = getSpriteTexture(spriteKey);
  if (!texture) return null;
  const group = new THREE.Group();
  const sprite = makeBillboard(texture);
  sprite.name = 'body';
  group.add(sprite);
  const shadow = makeShadowMesh(radius);
  shadow.name = 'shadow';
  shadow.position.y = 0.6;
  group.add(shadow);
  return group;
}

function updateActorSprite(group, spriteKey, radius, flip, opts = {}) {
  const sprite = group.getObjectByName('body');
  if (!sprite) return;
  const texture = getSpriteTexture(spriteKey, flip);
  if (texture && sprite.material.map !== texture) {
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
  }
  const renderScale = Number(texture?.userData?.renderScale || 1);
  const aspect = Number(texture?.userData?.aspect || 1);
  const height = radius * SPRITE_SIZE_MULT * renderScale * (opts.squashY || 1);
  sprite.scale.set(height * aspect * (opts.squashX || 1), height, 1);
  sprite.position.y = opts.hop || 0;
  sprite.material.opacity = opts.alpha ?? 1;
  const tint = opts.tint || 0xffffff;
  if (sprite.material.color.getHex() !== tint) sprite.material.color.setHex(tint);
}

function walkBob(actor, seedX = 0) {
  const speed = Math.hypot(actor.vx || 0, actor.vy || 0);
  if (speed < 24) return { hop: 0, squashX: 1, squashY: 1 };
  const t = (Number(Neo.gameElapsedTime) || performance.now() / 1000) * 11 + seedX * 0.13;
  const s = Math.abs(Math.sin(t));
  return { hop: s * 6, squashX: 1 + (1 - s) * 0.06, squashY: 1 - (1 - s) * 0.05 };
}

function syncPlayer() {
  const p = Neo.player;
  const dying = Neo.gameState === 'dying';
  if (!p || (dying && !Neo.playerDeathAnim)) {
    if (playerSprite) playerSprite.visible = false;
    return;
  }
  if (!playerSprite) {
    playerSprite = makeActorGroup(playerSpriteKey(), p.r || 14);
    if (!playerSprite) return;
    playerShadow = playerSprite.getObjectByName('shadow');
    scene.add(playerSprite);
  }
  // First person: you are the camera — no player billboard in view.
  playerSprite.visible = !isFirstPersonActive();
  const anim = dying ? Neo.playerDeathAnim : null;
  const x = anim ? anim.x : p.x;
  const z = anim ? anim.y : p.y;
  playerSprite.position.set(x, 0, z);
  const aim = Neo.angleToMouse?.() ?? 0;
  const flip = facingOf(p, aim) < 0;
  const bob = dying ? { hop: 0, squashX: 1, squashY: 1 } : walkBob(p);
  const alpha = anim ? Math.max(0.1, 1 - anim.timer / Math.max(0.01, anim.duration)) : 1;
  const tint = anim ? 0xff6666 : (p.inv > 0 && Math.floor(Neo.frameId / 3) % 2 === 0 ? 0xff9999 : 0xffffff);
  updateActorSprite(playerSprite, playerSpriteKey(), p.r || 14, flip, { ...bob, alpha, tint });
  if (playerLight) playerLight.position.set(x, 130, z);
}

function ensureHpBar(enemy, group) {
  let bar = hpBarPool.get(enemy);
  if (!bar) {
    const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a0d10, transparent: true, opacity: 0.82, depthWrite: false }));
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff4455, transparent: true, opacity: 0.95, depthWrite: false }));
    back.center.set(0.5, 0);
    fill.center.set(0.5, 0);
    group.add(back);
    group.add(fill);
    bar = { back, fill };
    hpBarPool.set(enemy, bar);
  }
  return bar;
}

function syncEnemies() {
  syncPool(
    pools.enemies,
    Neo.enemies,
    enemy => makeActorGroup(enemySpriteKey(enemy), enemy.r || 12),
    (enemy, group) => {
      group.position.set(enemy.x, 0, enemy.y);
      const flip = (Neo.player ? Neo.player.x < enemy.x : false);
      const bob = walkBob(enemy, enemy.x);
      const stunned = Number(enemy.stun || 0) > 0;
      const tint = stunned ? 0xaad4ff : enemy.elite ? 0xffe2a8 : 0xffffff;
      updateActorSprite(group, enemySpriteKey(enemy), enemy.r || 12, flip, { ...bob, tint });
      // Health bar above the billboard once damaged.
      const hurt = Number.isFinite(enemy.hp) && Number.isFinite(enemy.max) && enemy.hp < enemy.max;
      const bar = ensureHpBar(enemy, group);
      const height = (enemy.r || 12) * SPRITE_SIZE_MULT;
      bar.back.visible = bar.fill.visible = hurt;
      if (hurt) {
        const w = Math.max(26, (enemy.r || 12) * 2.4);
        const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.max));
        bar.back.scale.set(w, 4.5, 1);
        bar.fill.scale.set(Math.max(0.001, w * ratio), 4.5, 1);
        bar.back.position.set(0, height + 10, 0);
        bar.fill.position.set(-(w - w * ratio) / 2, height + 10.2, 0);
      }
    },
  );
  // hp bars of removed enemies die with their group (child objects); prune map
  hpBarPool.forEach((bar, enemy) => { if (!pools.enemies.has(enemy)) hpBarPool.delete(enemy); });
}

function syncProjectiles() {
  syncPool(
    pools.projectiles,
    Neo.projectiles,
    () => new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    (projectile, sprite) => {
      const visual = Neo.getProjectileVisual?.(projectile) || {};
      const texture = getGlowTexture(visual.color || projectile.color || '#ffffff');
      if (sprite.material.map !== texture) {
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
      }
      const size = Math.max(10, (projectile.r || 6) * 4);
      sprite.scale.set(size, size, 1);
      sprite.position.set(projectile.x, BEAM_Y, projectile.y);
    },
  );
}

const PICKUP_STYLES = {
  potion: '#ff5d6f',
  coin: '#ffd23f',
  item: '#9fe8ff',
  crystal: '#58b7ff',
  key: '#ffe07a',
  treasureKey: '#ffe07a',
};

function syncPickups() {
  syncPool(
    pools.pickups,
    Neo.pickups,
    pickup => {
      if (pickup.type === 'ladder') {
        const group = new THREE.Group();
        const texture = getImageTexture('ladder_0', 0, Neo.ENVIRONMENT_IMAGES?.ladder_0?.image?.naturalWidth || 24);
        const plate = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0x224433,
          transparent: true,
          depthWrite: false,
        }));
        plate.rotation.x = -Math.PI / 2;
        plate.scale.set(64, 64, 1);
        plate.position.y = 1.4;
        group.add(plate);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(36, 42, 28),
          new THREE.MeshBasicMaterial({ color: 0x7dff9e, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 1.8;
        ring.name = 'ring';
        group.add(ring);
        return group;
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.center.set(0.5, 0);
      return sprite;
    },
    (pickup, obj) => {
      obj.position.set(pickup.x, 0, pickup.y);
      if (pickup.type === 'ladder') {
        const ring = obj.getObjectByName('ring');
        if (ring) {
          const t = performance.now() / 500;
          ring.material.opacity = 0.4 + Math.sin(t) * 0.2;
          ring.scale.setScalar(1 + Math.sin(t) * 0.06);
        }
        return;
      }
      const color = PICKUP_STYLES[pickup.type] || '#e8f4ff';
      const texture = getGlowTexture(color);
      if (obj.material.map !== texture) {
        obj.material.map = texture;
        obj.material.needsUpdate = true;
      }
      const bobY = 6 + Math.sin(performance.now() / 320 + pickup.x * 0.05) * 4;
      obj.position.y = bobY;
      const size = pickup.type === 'coin' ? 18 : 30;
      obj.scale.set(size, size, 1);
    },
  );
}

function syncChests() {
  syncPool(
    pools.chests,
    Neo.chests,
    () => {
      const sprite = makeBillboard(getGlowTexture('#c98a4b'));
      return sprite;
    },
    (chest, sprite) => {
      const sheetKey = chest.choiceType === 'ab'
        ? (Neo.ENVIRONMENT_IMAGES?.chest_a_b ? 'chest_a_b' : 'chest_0')
        : 'chest_0';
      const image = Neo.ENVIRONMENT_IMAGES?.[sheetKey]?.image;
      let frame = 0;
      if (image) {
        const frameCount = Math.max(1, Math.floor(image.naturalWidth / 24));
        frame = chest.open
          ? Math.min(frameCount - 1, 4 + (Math.floor(Date.now() / 180) % Math.max(1, frameCount - 4)))
          : Math.min(1, Math.floor(Date.now() / 420) % 2);
      }
      const texture = getImageTexture(sheetKey, frame, 24) || getGlowTexture('#c98a4b');
      if (sprite.material.map !== texture) {
        sprite.material.map = texture;
        sprite.material.needsUpdate = true;
      }
      sprite.scale.set(56, 56, 1);
      sprite.position.set(chest.x, 0, chest.y);
    },
  );
}

function syncDestructibles() {
  syncPool(
    pools.destructibles,
    Neo.destructibles,
    prop => {
      if (prop.kind === 'pot') {
        const texture = getEnvTileTexture('pot_clay');
        return texture ? makeBillboard(texture) : null;
      }
      if (prop.kind === 'barrel') {
        const image = Neo.ENVIRONMENT_IMAGES?.barrel_0?.image;
        const texture = image
          ? getImageTexture('barrel_0', 0, image.naturalWidth)
          : getEnvTileTexture('barrel_oak');
        return texture ? makeBillboard(texture) : null;
      }
      // wall / cover_wall / secret_wall blocks: real boxes.
      const texture = getEnvTileTexture('wall_block');
      const material = texture
        ? new THREE.MeshLambertMaterial({ map: texture, color: 0xd9d9d9 })
        : new THREE.MeshLambertMaterial({ color: 0x555f6d });
      const mesh = new THREE.Mesh(unitBox, material);
      mesh.scale.set(50, BLOCK_HEIGHT, 50);
      return mesh;
    },
    (prop, obj) => {
      const hiddenSecret = prop.kind === 'secret_wall' && prop.disguised;
      obj.visible = !prop.hidden && !prop.broken && !hiddenSecret;
      if (obj.isSprite || obj.getObjectByName?.('body')) {
        obj.scale.set(52, 52, 1);
        obj.position.set(prop.x, 0, prop.y);
      } else {
        obj.position.set(prop.x, BLOCK_HEIGHT / 2, prop.y);
      }
    },
  );
}

const HAZARD_STYLES = {
  lava: { color: 0xff7a2e, opacity: 0.85 },
  red_spikes: { color: 0xc7ccd6, opacity: 0.9 },
  thorn_mine: { color: 0xc22a3f, opacity: 0.85 },
  bomb: { color: 0xffa94d, opacity: 0.9 },
};

function syncHazards() {
  syncPool(
    pools.hazards,
    Neo.hazards,
    hazard => {
      const style = HAZARD_STYLES[hazard.kind] || { color: 0xa46bff, opacity: 0.8 };
      let material;
      if (hazard.kind === 'lava') {
        const texture = getEnvTileTexture('floor_lava');
        material = new THREE.MeshBasicMaterial({
          map: texture || null,
          color: texture ? 0xffffff : style.color,
          transparent: true,
          opacity: style.opacity,
          depthWrite: false,
        });
        if (texture) {
          material.map = texture;
        }
      } else {
        material = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false });
      }
      const geometry = hazard.shape === 'rect' ? unitPlane : unitCircle;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      return mesh;
    },
    (hazard, mesh) => {
      const w = hazard.shape === 'rect' ? hazard.w : (hazard.r || 24) * 2;
      const h = hazard.shape === 'rect' ? hazard.h : (hazard.r || 24) * 2;
      mesh.scale.set(w, h, 1);
      mesh.position.set(hazard.x, 2, hazard.y);
      if (hazard.kind === 'lava') {
        mesh.material.opacity = 0.75 + Math.sin(performance.now() / 300 + (hazard.phase || 0)) * 0.15;
      }
    },
  );
}

function syncShopOffers() {
  syncPool(
    pools.offers,
    Neo.shopOffers,
    () => {
      const group = new THREE.Group();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture('#ffd97a'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.center.set(0.5, 0);
      glow.scale.set(34, 34, 1);
      glow.name = 'glow';
      group.add(glow);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      label.center.set(0.5, 0);
      label.name = 'label';
      label.position.y = 44;
      group.add(label);
      return group;
    },
    (offer, group) => {
      group.visible = !offer.bought;
      group.position.set(offer.x, 4, offer.y);
      if (offer.bought) return;
      const canAfford = !!Neo.player && Neo.player.coins >= offer.cost;
      const entry = getTextTexture(`${offer.cost}c`, canAfford ? '#ffe07a' : '#8b93a4');
      const label = group.getObjectByName('label');
      if (label && label.material.map !== entry.texture) {
        label.material.map = entry.texture;
        label.material.needsUpdate = true;
        label.scale.set(entry.w * 0.9, entry.h * 0.9, 1);
      }
    },
  );
}

function syncParticles() {
  syncPool(
    pools.particles,
    Neo.particles,
    particle => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0.5);
      if (!particle.text) sprite.material.blending = THREE.AdditiveBlending;
      return sprite;
    },
    (particle, sprite) => {
      const life = Math.max(0, Number(particle.life || 0));
      sprite.material.opacity = Math.min(1, life * 2.2);
      if (particle.text) {
        const entry = getTextTexture(String(particle.text), particle.c || '#ffffff');
        if (sprite.material.map !== entry.texture) {
          sprite.material.map = entry.texture;
          sprite.material.needsUpdate = true;
          sprite.scale.set(entry.w * 0.95, entry.h * 0.95, 1);
        }
        sprite.position.set(particle.x, 46 + (1 - life) * 26, particle.y);
      } else {
        const texture = getGlowTexture(particle.c || '#ffffff');
        if (sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        sprite.scale.set(9, 9, 1);
        sprite.position.set(particle.x, 14, particle.y);
      }
    },
  );
}

function syncDeadBodies() {
  syncPool(
    pools.bodies,
    Neo.deadBodies,
    body => {
      const key = body.spriteKey || body.type;
      const texture = key ? getSpriteTexture(key) : null;
      if (!texture) return null;
      const mesh = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
        color: 0x9aa0ad,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (body.x * 13.37) % Math.PI;
      mesh.renderOrder = 3;
      return mesh;
    },
    (body, mesh) => {
      const size = (body.r || 12) * SPRITE_SIZE_MULT;
      mesh.scale.set(size, size, 1);
      mesh.position.set(body.x, 2.4, body.y);
      const age = Number(body.age || 0);
      const fadeStart = Neo.CORPSE_FADE_START || 4.5;
      const lifetime = Neo.CORPSE_LIFETIME || 11;
      mesh.material.opacity = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / Math.max(0.1, lifetime - fadeStart));
    },
  );
}

// ---------------------------------------------------------------------------
// Beams (player laser + enemy beams) — emissive boxes along ricochet paths.
// ---------------------------------------------------------------------------
function clearBeams() {
  beamMeshes.forEach(mesh => {
    scene.remove(mesh);
    mesh.material.dispose();
  });
  beamMeshes.length = 0;
}

function addBeamSegment(x1, z1, x2, z2, color, width = 6) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length < 2) return;
  const mesh = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  mesh.scale.set(length, width, width);
  mesh.position.set((x1 + x2) / 2, BEAM_Y, (z1 + z2) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  scene.add(mesh);
  beamMeshes.push(mesh);
}

function syncBeams() {
  clearBeams();
  const p = Neo.player;
  // Player beam weapons / laser skill while firing.
  if (p && (Neo.laserActive || Number(p.weaponBeamTime || 0) > 0) && typeof Neo.buildRicochetBeamPath === 'function') {
    const angle = Neo.angleToMouse?.() ?? 0;
    // First person: start the visible beam from the held weapon — forward and
    // to the right of the eye, far enough out that the near end of the beam box
    // doesn't blow up in perspective (visual only — damage still traces from
    // the player).
    const fp = isFirstPersonActive();
    let ox = p.x;
    let oy = p.y;
    if (fp) {
      ox += Math.cos(angle) * 60 - Math.sin(angle) * 18;
      oy += Math.sin(angle) * 60 + Math.cos(angle) * 18;
    }
    const path = Neo.buildRicochetBeamPath(ox, oy, angle, 430, Neo.PLAYER_BEAM_BOUNCES || 0) || [];
    path.forEach(seg => addBeamSegment(seg.x1, seg.y1, seg.x2, seg.y2, 0x8df0ff, fp ? 5 : 7));
  }
  // Enemy / rival beams.
  (Neo.enemies || []).forEach(enemy => {
    if (!enemy || Number(enemy.beamTime || 0) <= 0) return;
    const range = enemy.type === 'god' ? (enemy.beamRange || 620)
      : enemy.type === 'rival' ? (enemy.rivalBeamRange || 430)
        : enemy.type === 'handsome_devil' ? (enemy.beamRange || 560)
          : 430;
    const angles = Array.isArray(enemy.rivalBeamFan) && enemy.rivalBeamFan.length
      ? enemy.rivalBeamFan.map(offset => enemy.beamAngle + offset)
      : [enemy.beamAngle];
    const color = enemy.type === 'god' ? 0xffffff
      : enemy.type === 'rival' ? new THREE.Color(enemy.rivalBeamColor || '#ff00aa').getHex()
        : 0xff3358;
    angles.forEach(angle => {
      addBeamSegment(
        enemy.x, enemy.y,
        enemy.x + Math.cos(angle) * range,
        enemy.y + Math.sin(angle) * range,
        color,
        enemy.type === 'god' ? 11 : 7,
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Camera + screen projection
// ---------------------------------------------------------------------------
const CAMERA_HEIGHT = 580;
const CAMERA_BACK = 430;
const FP_EYE_HEIGHT = 34;
const camTarget = new THREE.Vector3();

// Camera mode: 'fp' (first person, the default) or 'third' (follow cam).
let cameraMode = 'fp';
try { cameraMode = localStorage.getItem(CAMERA_MODE_STORE_KEY) === 'third' ? 'third' : 'fp'; } catch { /* private mode */ }
let fpYaw = 0;
let fpPitch = -0.08;

// True when first-person is actually driving the view this frame — the aim and
// movement hooks in update.js key off this so 2D / third-person behavior is
// completely untouched otherwise.
function isFirstPersonActive() {
  return ready && Neo.render3D && cameraMode === 'fp'
    && !Neo.isSplitScreen?.() && !window.NeoTouch?.active;
}

function setCameraMode(mode) {
  cameraMode = mode === 'fp' ? 'fp' : 'third';
  try { localStorage.setItem(CAMERA_MODE_STORE_KEY, cameraMode); } catch { /* private mode */ }
  if (cameraMode !== 'fp' && document.pointerLockElement) document.exitPointerLock?.();
}

function syncPointerLock() {
  const wantLock = isFirstPersonActive() && Neo.gameState === 'play';
  if (!wantLock && document.pointerLockElement === Neo.canvas) {
    document.exitPointerLock?.();
  }
}

// Mouse-look while pointer-locked; gamepad right stick also turns the view.
// Chrome fires a spurious huge-delta mousemove when pointer lock engages (the
// pointer "jumping" to the lock position), which would wildly spin the view —
// swallow the first events after lock and reject absurd deltas.
let lockSuppressEvents = 0;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === Neo?.canvas) lockSuppressEvents = 2;
});
window.addEventListener('mousemove', event => {
  if (!isFirstPersonActive() || document.pointerLockElement !== Neo.canvas) return;
  if (lockSuppressEvents > 0) {
    lockSuppressEvents -= 1;
    return;
  }
  const mx = event.movementX || 0;
  const my = event.movementY || 0;
  if (Math.abs(mx) > 200 || Math.abs(my) > 200) return;
  fpYaw += mx * 0.0026;
  fpPitch = Math.max(-0.55, Math.min(0.45, fpPitch - my * 0.0022));
});

document.addEventListener('mousedown', () => {
  if (!isFirstPersonActive() || Neo.gameState !== 'play') return;
  if (document.pointerLockElement !== Neo.canvas) {
    Neo.canvas.requestPointerLock?.();
  }
});

function syncCamera() {
  const p = Neo.player;
  // FPS-appropriate field of view in first person; classic follow cam otherwise.
  const targetFov = isFirstPersonActive() ? 68 : 50;
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  if (isFirstPersonActive() && p) {
    const gp = window.NeoGamepad?.[0];
    if (gp?.active && gp.hasAim && Math.hypot(gp.aimX || 0, gp.aimY || 0) > 0.25) {
      fpYaw = Math.atan2(gp.aimY, gp.aimX);
    }
    const shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const jitter = shakeOn ? Math.min(6, (Neo.shake || 0) * 0.55) : 0;
    const jx = ((Neo.nextRandom?.('fx') ?? Math.random()) - 0.5) * jitter;
    const jy = ((Neo.nextRandom?.('fx') ?? Math.random()) - 0.5) * jitter;
    camera.position.set(p.x + jx, FP_EYE_HEIGHT + jy, p.y + jx * 0.6);
    const cosPitch = Math.cos(fpPitch);
    camera.lookAt(
      p.x + Math.cos(fpYaw) * cosPitch * 100,
      FP_EYE_HEIGHT + Math.sin(fpPitch) * 100,
      p.y + Math.sin(fpYaw) * cosPitch * 100,
    );
    return;
  }
  const anim = Neo.gameState === 'dying' ? Neo.playerDeathAnim : null;
  const focusX = anim ? anim.x : (p?.x ?? Neo.ROOM_W / 2);
  const focusZ = anim ? anim.y : (p?.y ?? Neo.ROOM_H / 2);
  // Bias the look-at toward room center so walls stay in frame at the edges.
  const cx = Neo.ROOM_W / 2;
  const cz = Neo.ROOM_H / 2;
  const lookX = focusX * 0.72 + cx * 0.28;
  const lookZ = focusZ * 0.72 + cz * 0.28;
  const shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
  const jitter = shakeOn ? (Neo.shake || 0) : 0;
  const sx = (Neo.nextRandom?.('fx') ?? Math.random() - 0.5) - 0.5;
  const sy = (Neo.nextRandom?.('fx') ?? Math.random() - 0.5) - 0.5;
  const kickX = shakeOn ? (Neo.shakeKickX || 0) : 0;
  const kickZ = shakeOn ? (Neo.shakeKickY || 0) : 0;
  camTarget.set(
    lookX + sx * jitter * 1.4 + kickX,
    CAMERA_HEIGHT,
    lookZ + CAMERA_BACK + sy * jitter * 1.4 + kickZ,
  );
  if (camera.position.lengthSq() === 0) camera.position.copy(camTarget);
  camera.position.lerp(camTarget, 0.14);
  camera.lookAt(lookX + kickX, 12, lookZ + kickZ);
}

// Project a world (game) position to #c canvas pixel coordinates.
const projectVector = new THREE.Vector3();
function projectToCanvas(x, y, height = 0) {
  projectVector.set(x, height, y);
  projectVector.project(camera);
  return {
    x: (projectVector.x * 0.5 + 0.5) * Neo.canvas.width,
    y: (-projectVector.y * 0.5 + 0.5) * Neo.canvas.height,
    behind: projectVector.z > 1,
  };
}

// Re-uses the existing 2D prompt drawing (distance gating included) by
// translating the 2D context so the world-coordinate draw lands at the
// projected screen position of that world point.
function drawProjectedPrompt(worldX, worldY, height, drawFn) {
  if (typeof drawFn !== 'function') return;
  const point = projectToCanvas(worldX, worldY, height);
  if (point.behind) return;
  Neo.ctx.save();
  Neo.ctx.translate(point.x - worldX, point.y - worldY);
  try { drawFn(); } catch { /* prompt drawing must never break the frame */ }
  Neo.ctx.restore();
}

function drawPrompts() {
  if (Neo.gameState !== 'play') return;
  const ladder = (Neo.pickups || []).find(pickup => pickup?.type === 'ladder');
  if (ladder && Neo.currentRoom?.cleared) {
    drawProjectedPrompt(ladder.x, ladder.y, 30, Neo.drawLadderPrompt);
  }
  if (isFirstPersonActive()) {
    drawViewmodel();
    drawCrosshair();
    if (document.pointerLockElement !== Neo.canvas) drawLockHint();
  }
}

// ---------------------------------------------------------------------------
// First-person viewmodel: the equipped weapon held at the bottom of the screen
// (Doom-style), with walk bob, a melee lunge, and laser-fire shake. Drawn as a
// 2D overlay on #c so the HUD still layers above it.
// ---------------------------------------------------------------------------
const weaponIconCache = new Map();
function getWeaponIconCanvas() {
  const key = Neo.getEquippedWeapon?.();
  if (!key) return null;
  let canvasEl = weaponIconCache.get(key);
  if (canvasEl) return canvasEl;
  const def = Neo.WEAPON_DEFS?.[key];
  if (!def || typeof Neo.drawWeaponToastIcon !== 'function') return null;
  canvasEl = document.createElement('canvas');
  canvasEl.width = 64;
  canvasEl.height = 64;
  try { Neo.drawWeaponToastIcon(canvasEl, def); } catch { return null; }
  weaponIconCache.set(key, canvasEl);
  return canvasEl;
}

// The character's own first-person arm: every playable character's sprite
// sheet carries a dedicated "arm holding the weapon" reference frame
// (`<key>:arm` in the atlas — the same art drawAimIndicator rotates in 2D).
// Art rest direction and pivot vary per character, so normalize once into an
// upright cached canvas (rotated by the rest angle around the pivot, cropped
// to visible pixels); the viewmodel then draws every character's arm in the
// same bottom-right slot at the same visual size.
const fpArmCache = new Map();
function getFpArmSprite() {
  const key = playerSpriteKey();
  if (fpArmCache.has(key)) return fpArmCache.get(key);
  const atlas = Neo.SPRITE_ATLAS;
  const frame = atlas?.frames?.[`${key}:arm`];
  if (!frame || !atlas?.canvas) { fpArmCache.set(key, null); return null; }
  const sheet = Neo.CHARACTER_SPRITE_SHEETS?.[key] || Neo.CHARACTER_SHEET_DEFS?.[key] || {};
  const baseAngle = Number.isFinite(Number(sheet.armBaseAngle)) ? Number(sheet.armBaseAngle) : 0;
  const pivot = sheet.armPivot && Number.isFinite(Number(sheet.armPivot.x))
    ? sheet.armPivot
    : { x: frame.w / 2, y: frame.h / 2 };
  const size = Math.max(frame.w, frame.h) * 3;
  const upright = document.createElement('canvas');
  upright.width = size;
  upright.height = size;
  const g = upright.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.translate(size / 2, size * 0.8);
  g.rotate(-Math.PI / 2 - baseAngle); // art rest direction now points up
  g.drawImage(atlas.canvas, frame.x, frame.y, frame.w, frame.h, -pivot.x, -pivot.y, frame.w, frame.h);
  // Crop to the visible pixel bounds so small arms still fill the slot.
  const pixels = g.getImageData(0, 0, size, size).data;
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (pixels[(y * size + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) { fpArmCache.set(key, null); return null; }
  const crop = document.createElement('canvas');
  crop.width = maxX - minX + 1;
  crop.height = maxY - minY + 1;
  const cropCtx = crop.getContext('2d');
  cropCtx.imageSmoothingEnabled = false;
  cropCtx.drawImage(upright, -minX, -minY);
  const entry = { canvas: crop };
  fpArmCache.set(key, entry);
  return entry;
}

function drawViewmodel() {
  const p = Neo.player;
  if (!p) return;
  const g = Neo.ctx;
  const W = Neo.canvas.width;
  const H = Neo.canvas.height;
  const t = performance.now() / 1000;
  const moving = Math.hypot(p.vx || 0, p.vy || 0) > 24;
  const bobX = moving ? Math.sin(t * 7.4) * 10 : Math.sin(t * 1.6) * 3;
  const bobY = moving ? Math.abs(Math.cos(t * 7.4)) * 12 : Math.sin(t * 2.1) * 4;
  // Melee swing: lunge arm and weapon toward screen center, sweeping through.
  const swingWindow = Neo.ATTACKS?.melee?.active || 0.17;
  const swing = Math.max(0, Number(p.swing || 0));
  const lunge = swing > 0 ? Math.sin(Math.min(1, 1 - swing / swingWindow) * Math.PI) : 0;
  const laserKick = Neo.laserActive ? Math.sin(t * 55) * 4 : 0;
  const armSprite = getFpArmSprite();
  const sway = moving ? Math.sin(t * 7.4) * 0.03 : Math.sin(t * 1.6) * 0.015;

  if (!armSprite) {
    // No arm art (shouldn't happen — customs map to Thorn Knight): weapon only.
    const icon = getWeaponIconCanvas();
    if (!icon) return;
    const size = Math.round(H * 0.34);
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(W * 0.62 + bobX - lunge * 130, H - size * 0.62 + bobY - lunge * 95 + laserKick);
    g.rotate(-0.55 - lunge * 1.05);
    g.drawImage(icon, -size / 2, -size / 2, size, size);
    g.restore();
    return;
  }

  // The arm frames are full "arm holding the weapon" poses, so the arm art
  // alone IS the viewmodel. Anchor its base at the bottom edge, tilted toward
  // the crosshair, rising into view Doom-style.
  const targetH = H * 0.44;
  const scale = targetH / armSprite.canvas.height;
  const targetW = armSprite.canvas.width * scale;
  g.save();
  g.imageSmoothingEnabled = false;
  g.translate(W * 0.68 + bobX - lunge * 90, H + 8 + bobY - lunge * 130 + laserKick);
  g.rotate(-0.38 + sway - lunge * 0.8);
  g.drawImage(armSprite.canvas, -targetW / 2, -targetH, targetW, targetH);
  g.restore();
}

function drawLockHint() {
  if (Neo.gameState !== 'play') return;
  const g = Neo.ctx;
  const cx = Neo.canvas.width / 2;
  const cy = Neo.canvas.height * 0.6;
  g.save();
  g.font = 'bold 14px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = 'CLICK TO LOOK AROUND  ·  F6 = THIRD PERSON';
  const w = g.measureText(text).width + 28;
  g.fillStyle = 'rgba(8, 16, 26, 0.82)';
  g.beginPath();
  g.roundRect(cx - w / 2, cy - 15, w, 30, 8);
  g.fill();
  g.strokeStyle = 'rgba(141, 240, 255, 0.5)';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#8df0ff';
  g.fillText(text, cx, cy);
  g.restore();
}

function drawCrosshair() {
  const cx = Neo.canvas.width / 2;
  const cy = Neo.canvas.height / 2;
  const g = Neo.ctx;
  g.save();
  g.strokeStyle = 'rgba(200, 240, 255, 0.9)';
  g.lineWidth = 2;
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = 2;
  g.beginPath();
  g.moveTo(cx - 9, cy); g.lineTo(cx - 3, cy);
  g.moveTo(cx + 3, cy); g.lineTo(cx + 9, cy);
  g.moveTo(cx, cy - 9); g.lineTo(cx, cy - 3);
  g.moveTo(cx, cy + 3); g.lineTo(cx, cy + 9);
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------------------
// Public: render, toggle
// ---------------------------------------------------------------------------
function render() {
  if (failed || !Neo.render3D) return false;
  if (Neo.isSplitScreen?.()) return false;         // split-screen stays on the 2D path
  if (!Neo.SPRITE_ATLAS?.canvas) return false;      // atlas not built yet
  if (!Neo.currentRoom) return false;
  if (!initRenderer()) return false;

  document.body.classList.add('render3d');
  glCanvas.style.display = 'block';
  syncSize();

  const buildKey = getRoomBuildKey();
  if (buildKey !== roomBuildKey) {
    roomBuildKey = buildKey;
    buildRoom();
  }

  // Dim ambient for dark room types so lighting mood carries over.
  const darkness = Neo.getRoomDarkness?.(Neo.currentRoom, []) || 0;
  if (ambientLight) ambientLight.intensity = 0.92 - Math.min(0.45, darkness * 2.2);

  syncPlayer();
  syncEnemies();
  syncProjectiles();
  syncPickups();
  syncChests();
  syncDestructibles();
  syncHazards();
  syncShopOffers();
  syncParticles();
  syncDeadBodies();
  syncBeams();
  syncCamera();

  renderer.render(scene, camera);
  syncPointerLock();
  drawPrompts();
  return true;
}

function setRender3D(on) {
  Neo.render3D = !!on;
  try { localStorage.setItem(RENDER3D_STORE_KEY, Neo.render3D ? '1' : '0'); } catch { /* private mode */ }
  document.body.classList.toggle('render3d', Neo.render3D);
  if (!Neo.render3D && glCanvas) glCanvas.style.display = 'none';
}

let storedPreference = '1';
try { storedPreference = localStorage.getItem(RENDER3D_STORE_KEY) ?? '1'; } catch { /* private mode */ }
Neo.render3D = storedPreference !== '0';

// Unified view mode: '2d' (original top-down) | 'third' | 'fp'. The settings
// UI and the F4/F6 hotkeys all route through this so they stay in sync; a
// 'neo-view-mode-changed' event fires on every change for UI mirrors.
function getViewMode() {
  if (!Neo.render3D) return '2d';
  return cameraMode === 'fp' ? 'fp' : 'third';
}

function setViewMode(mode) {
  const normalized = mode === 'third' || mode === 'fp' ? mode : '2d';
  if (normalized === '2d') {
    setRender3D(false);
  } else {
    setCameraMode(normalized);
    setRender3D(true);
  }
  window.dispatchEvent(new CustomEvent('neo-view-mode-changed', { detail: getViewMode() }));
}

const VIEW_MODE_LABELS = { '2d': '2D VIEW', third: 'THIRD PERSON', fp: 'FIRST PERSON' };

window.addEventListener('keydown', event => {
  if (event.repeat) return;
  if (event.code === 'F4') {
    event.preventDefault();
    setViewMode(Neo.render3D ? '2d' : cameraMode === 'fp' ? 'fp' : 'third');
    announceViewChange(VIEW_MODE_LABELS[getViewMode()]);
  } else if (event.code === 'F6' && Neo.render3D) {
    event.preventDefault();
    setViewMode(cameraMode === 'fp' ? 'third' : 'fp');
    announceViewChange(VIEW_MODE_LABELS[getViewMode()]);
  }
});

function announceViewChange(text) {
  if (!Neo.player) return;
  Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 40, life: 1.4, text, c: '#8df0ff' });
}

// The aim/movement hooks in core/update.js read this: a number (view yaw in
// radians) while first-person is driving, null otherwise.
Neo.getFirstPersonYaw = () => (isFirstPersonActive() ? fpYaw : null);

Neo.getViewMode = getViewMode;
Neo.setViewMode = setViewMode;

Neo.threeRenderer = {
  render,
  setRender3D,
  setCameraMode,
  setViewMode,
  getViewMode,
  getCameraMode: () => cameraMode,
  setYaw: value => { fpYaw = Number(value) || 0; },
  _debug: () => ({
    sceneChildren: scene?.children?.length,
    camera: camera?.position?.toArray?.().map(v => Math.round(v * 10) / 10),
    fov: camera?.fov,
    fpYaw,
    fpPitch,
    roomChildren: roomGroup?.children?.length,
    floorHasMap: !!floorMesh?.material?.map,
    contextLost: !!renderer?.getContext?.()?.isContextLost?.(),
  }),
};
Neo.setRender3D = setRender3D;
