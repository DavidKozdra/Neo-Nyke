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
let failedAt = 0;
let contextLost = false;
let lastRenderErrorAt = -Infinity;

// Context creation can fail transiently on mobile when Safari/Chrome is under
// memory pressure. Do not retry every animation frame, but also do not latch a
// single failure for the rest of the page lifetime.
const WEBGL_RETRY_DELAY_MS = 5000;

// Room (static) group state
let roomGroup = null;
let roomBuildKey = '';
let floorMesh = null;
let floorTexture = null;
let floorCacheKey = null;
let worldFxMesh = null;
let worldFxCanvas = null;
let worldFxTexture = null;

// Lighting
let ambientLight = null;
let playerLight = null;

// Entity pools: Map<gameObject, THREE.Object3D>
const pools = {
  players: new Map(),
  enemies: new Map(),
  projectiles: new Map(),
  pickups: new Map(),
  chests: new Map(),
  destructibles: new Map(),
  particles: new Map(),
  hazards: new Map(),
  offers: new Map(),
  bodies: new Map(),
  spawnPortals: new Map(),
  justiceBlades: new Map(),
};
let playerSprite = null;
let playerShadow = null;
let playerDeathPool = null;
const dashAfterimages = [];
let lastDashAfterimageAt = -Infinity;
let playerMeleeIndicator = null;
const beamMeshes = []; // reused per-frame list of beam boxes
const nameplatePool = new Map(); // enemy -> { sprite, texture, signature }

// ---------------------------------------------------------------------------
// Texture caches
// ---------------------------------------------------------------------------
const spriteTextureCache = new Map(); // `${key}|${flip}` -> THREE.Texture
const glowTextureCache = new Map();   // color -> THREE.Texture
const textTextureCache = new Map();   // `${text}|${color}` -> {texture, w, h}
const imageTextureCache = new Map();  // `${imgKey}|${frame}|${fw}` -> THREE.Texture
const tileTextureCache = new Map();   // envTileKey -> THREE.Texture
const shopOfferTextureCache = new Map();
const statusBadgeTextureCache = new Map();
const decorTextureCache = new Map();  // `${kind}|${r}` -> THREE.Texture

// Decor kinds that are vertical objects in the fiction. The flat floor overlay
// is right for rubble/cracks/moss (they ARE on the ground), but a candle or a
// tree painted into it reads as a decal the camera looks down at. These get
// baked individually and stood up as billboards instead.
const UPRIGHT_DECOR_KINDS = new Set(['torch', 'brazier', 'tree', 'fruit_tree']);

// Bake one decoration by running the 2D decor draw for that single item into an
// offscreen canvas. Decor draws in local space around (0,0) with the object's
// base near +r, so we translate to the canvas center and keep generous padding
// for flames and canopies that extend above the nominal radius.
function getDecorTexture(kind, r) {
  const radius = Math.max(8, Math.round(Number(r) || 12));
  const cacheKey = `${kind}|${radius}`;
  const cached = decorTextureCache.get(cacheKey);
  if (cached) return cached;
  if (typeof Neo.drawRoomDecor !== 'function') return null;
  const pad = Math.ceil(radius * 2.4);
  const size = pad * 2;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = size;
  canvasEl.height = size;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  const realDecorations = Neo.decorations;
  const realStructures = Neo.structures;
  try {
    Neo.ctx = g;
    // Draw exactly one decoration, centered, with no structures riding along.
    Neo.decorations = [{ kind, x: pad, y: pad, r: radius }];
    Neo.structures = [];
    Neo.drawRoomDecor();
  } catch { /* a missing decor kind should not break the room build */ }
  Neo.decorations = realDecorations;
  Neo.structures = realStructures;
  Neo.ctx = realCtx;
  const texture = makeCanvasTexture(canvasEl);
  // Where the object's base sits inside the canvas, as a 0..1 fraction from the
  // bottom. Decor art is centered on its point with the base around +r, so the
  // contact point is below center. The billboard uses this as its anchor.
  texture.userData = { baseFraction: (pad - radius) / size, worldSize: size };
  decorTextureCache.set(cacheKey, texture);
  return texture;
}

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

// Bake a 2D projectile silhouette (via Neo.drawProjectileShape) into its own
// texture so a shaped shot — Sarge's spinning hammer, the Death Ball orb —
// keeps the 2D art in 3D instead of collapsing to a plain glow blob. We render
// a synthetic projectile centered in the canvas; the sprite billboards it, so
// per-frame spin/pulse is dropped but the silhouette matches 2D exactly. Keyed
// by projectile kind (one texture shared across every shot of that kind).
// Projectile kinds whose 2D silhouette is distinctive enough to bake rather than
// render as a generic glow. Sarge's Hammer Throw (spinning rock-hammer) and the
// Death Ball (energy orb) both read as blobs otherwise.
const SHAPED_PROJECTILE_KINDS = new Set(['sarges_hammer', 'death_ball', 'rock']);
const shapedProjectileTextureCache = new Map(); // kind + floor tint -> THREE.Texture
function getShapedProjectileTexture(projectile) {
  const kind = projectile?.kind;
  if (!kind || typeof Neo.drawProjectileShape !== 'function' || typeof Neo.getProjectileVisual !== 'function') return null;
  const visual = Neo.getProjectileVisual(projectile) || {};
  if (!SHAPED_PROJECTILE_KINDS.has(kind)) return null;
  // Rock shots inherit the current floor tint in 2D, so their baked texture
  // must carry that same tint instead of reusing a previous room's boulder.
  const cacheKey = `${kind}|${visual.color || ''}`;
  const cached = shapedProjectileTextureCache.get(cacheKey);
  if (cached) return cached;
  // Canonical radius baked into the texture; the sprite is scaled per shot to
  // the live radius, so this only sets the internal resolution.
  const r = 20;
  const pad = Math.ceil(r * 2.2 + 12);
  const size = pad * 2;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = size;
  canvasEl.height = size;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  // Draw a synthetic, axis-aligned projectile at canvas center. vx>0 keeps the
  // travel-angle rotate at 0 so the silhouette bakes upright; trails are skipped
  // (they live in the game's particle stream, already handled in 3D).
  const synthetic = { x: pad, y: pad, vx: 1, vy: 0, r, kind, animSeed: 0, enemy: !!projectile.enemy };
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = g;
    Neo.drawProjectileShape(synthetic, { ...visual, shape: visual.shape });
  } catch { /* shape failed to bake; fall through with whatever rendered */ }
  Neo.ctx = realCtx;
  const texture = makeCanvasTexture(canvasEl);
  texture.userData = { bakedRadius: r, halfSize: pad };
  shapedProjectileTextureCache.set(cacheKey, texture);
  return texture;
}

// Status badge art is already authored for the 2D renderer. Rasterizing that
// exact badge gives 3D the same icon, stack count, border, and palette rather
// than replacing effects with anonymous colored dots.
function getStatusBadgeTexture(statusKey, stacks) {
  const count = Math.max(1, Math.min(99, Math.round(Number(stacks || 1))));
  const cacheKey = `${statusKey}|${count}`;
  const cached = statusBadgeTextureCache.get(cacheKey);
  if (cached) return cached;
  if (typeof Neo.drawStatusIconBadge !== 'function') return null;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = count > 1 ? 29 : 20;
  canvasEl.height = 18;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = g;
    Neo.drawStatusIconBadge(statusKey, count, 1, 1);
  } catch { /* a missing optional badge must not interrupt the world render */ }
  Neo.ctx = realCtx;
  const texture = makeCanvasTexture(canvasEl);
  const entry = { texture, w: canvasEl.width, h: canvasEl.height };
  statusBadgeTextureCache.set(cacheKey, entry);
  return entry;
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

// World props use the same convention as actor billboards: their feet sit on
// the floor and their shadow is a separate, floor-hugging mesh. Keeping this
// in one helper prevents a sprite's transparent padding from making it read as
// if it were hovering in the 3D camera.
function makeGroundedBillboard(texture, shadowRadius = 16) {
  const group = new THREE.Group();
  const sprite = makeBillboard(texture);
  sprite.name = 'body';
  // makeBillboard anchors sprites by their feet (center 0.5/0), but chests and
  // forges are drawn *centered* on the simulation point in 2D (drawImage at
  // -h/2). Anchoring those by the feet lifted them a half sprite off the floor.
  // Sink them so the art sits on the ground the way the 2D renderer draws it,
  // while keeping a little of the frame's transparent base below the contact
  // point so they still read as resting on the floor rather than sunk into it.
  sprite.center.set(0.5, 0.2);
  sprite.position.y = 0.6;
  group.add(sprite);
  const shadow = makeShadowMesh(shadowRadius);
  shadow.position.y = 0.35;
  group.add(shadow);
  return group;
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
  if (ready) return true;
  if (failed && performance.now() - failedAt < WEBGL_RETRY_DELAY_MS) return false;
  const mainCanvas = Neo.canvas;
  if (!mainCanvas?.parentNode) return false;
  failed = false;
  try {
    glCanvas?.remove();
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'c3d';
    mainCanvas.parentNode.insertBefore(glCanvas, mainCanvas);
    renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      antialias: false,
      alpha: false,
      // Let the browser choose the most reliable GPU. Forcing high-performance
      // can make WebGL context creation less reliable in mobile WebViews.
      powerPreference: 'default',
    });
    glCanvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      contextLost = true;
      glCanvas.style.display = 'none';
      document.body.classList.remove('render3d');
    });
    glCanvas.addEventListener('webglcontextrestored', () => {
      contextLost = false;
      roomBuildKey = '';
    });
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
    failedAt = performance.now();
    ready = false;
    renderer?.dispose?.();
    renderer = null;
    glCanvas?.remove();
    glCanvas = null;
    document.body.classList.remove('render3d');
  }
  return ready;
}

function preferredPixelRatio(width, height) {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  // A 2x drawing buffer behind a full-bleed 3:2 canvas is several million
  // pixels on a phone. The extra resolution is barely visible behind pixel art
  // but substantially increases fill rate, texture pressure, and context loss.
  let ratio = Math.min(window.devicePixelRatio || 1, coarsePointer ? 1 : 2);
  const gl = renderer?.getContext?.();
  if (gl) {
    const maxBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || Infinity;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [Infinity, Infinity];
    ratio = Math.min(
      ratio,
      maxBufferSize / width,
      maxBufferSize / height,
      maxViewport[0] / width,
      maxViewport[1] / height,
    );
  }
  return Math.max(0.5, ratio);
}

function syncSize() {
  if (!renderer || !Neo.canvas) return;
  const rect = Neo.canvas.getBoundingClientRect();
  const w = Math.max(2, Math.round(rect.width));
  const h = Math.max(2, Math.round(rect.height));
  const ratio = preferredPixelRatio(w, h);
  // WebGLRenderer.setSize() floors these values. Comparing with Math.round()
  // made fractional-DPR devices resize their drawing buffer every frame.
  const bufferW = Math.floor(w * ratio);
  const bufferH = Math.floor(h * ratio);
  if (glCanvas.width !== bufferW || glCanvas.height !== bufferH) {
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

  // Room dressing is authored entirely in the 2D renderer (rubble, cracks,
  // braziers, trees, moss and candles). Rasterize that exact pass onto a thin
  // floor overlay so 3D rooms keep their familiar visual language.
  if (Array.isArray(Neo.decorations) && Neo.decorations.length && typeof Neo.drawRoomDecor === 'function') {
    // Vertical props (candles, braziers, trees) are pulled out of the flat pass
    // and billboarded below; only genuinely flat dressing stays in the overlay.
    const flatDecor = Neo.decorations.filter(d => d && !UPRIGHT_DECOR_KINDS.has(d.kind));
    const uprightDecor = Neo.decorations.filter(d => d && UPRIGHT_DECOR_KINDS.has(d.kind));
    const decorCanvas = document.createElement('canvas');
    decorCanvas.width = W;
    decorCanvas.height = H;
    const decorCtx = decorCanvas.getContext('2d');
    decorCtx.imageSmoothingEnabled = false;
    const realCtx = Neo.ctx;
    const realStructures = Neo.structures;
    const realDecorations = Neo.decorations;
    try {
      Neo.ctx = decorCtx;
      // drawRoomDecor also draws structures; they already have real 3D forms.
      Neo.structures = [];
      Neo.decorations = flatDecor;
      Neo.drawRoomDecor();
    } catch { /* decoration omission is preferable to a failed room build */ }
    Neo.structures = realStructures;
    Neo.decorations = realDecorations;
    Neo.ctx = realCtx;

    uprightDecor.forEach(decor => {
      const radius = Math.max(8, Number(decor.r) || 12);
      const texture = getDecorTexture(decor.kind, radius);
      if (!texture) return;
      const worldSize = texture.userData.worldSize;
      const sprite = makeBillboard(texture, { depthWrite: false });
      // Anchor the sprite at the object's baked contact point so it stands on
      // the floor rather than floating or sinking by its transparent padding.
      sprite.center.set(0.5, texture.userData.baseFraction);
      sprite.scale.set(worldSize, worldSize, 1);
      sprite.position.set(decor.x, 0.6, decor.y);
      sprite.renderOrder = 2;
      roomGroup.add(sprite);
      const shadow = makeShadowMesh(radius * 0.5);
      shadow.position.set(decor.x, 1.5, decor.y);
      roomGroup.add(shadow);
      // Candles and braziers are the room's light sources in 2D; give them a
      // matching point light so 3D rooms are lit by the same fixtures.
      if (decor.kind === 'torch' || decor.kind === 'brazier') {
        const light = new THREE.PointLight(0xffb361, 0.9, radius * 14, 2);
        light.position.set(decor.x, radius * 1.4, decor.y);
        roomGroup.add(light);
      }
    });
    const decorTexture = makeCanvasTexture(decorCanvas);
    decorTexture.userData.owned = true;
    const decor = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: decorTexture, transparent: true, depthWrite: false }));
    decor.rotation.x = -Math.PI / 2;
    decor.scale.set(W, H, 1);
    decor.position.set(W / 2, 1.45, H / 2);
    decor.renderOrder = 1;
    roomGroup.add(decor);
  }

  // Structures: use the same authored environment art as the 2D renderer.
  // This matters for landmark readability: the pillar is a capital/shaft/base
  // stack, not a generic wall block, and service-room props retain their exact
  // sprite scale and animation.
  (Neo.structures || []).forEach(structure => {
    if (!structure) return;
    if (structure.kind === 'pillar') {
      const w = Math.max(20, Number(structure.w || 40));
      const mids = Math.max(0, Math.min(3, Math.floor(Number(structure.mids || 0))));
      const segments = ['pillar_1', ...Array(mids).fill('pillar_2'), 'pillar_3'];
      const shadow = makeShadowMesh(w * 0.46);
      shadow.position.set(structure.x, 0.35, structure.y);
      roomGroup.add(shadow);
      segments.forEach((key, index) => {
        const texture = getImageTexture(key, 0, 24);
        if (!texture) return;
        const sprite = makeBillboard(texture);
        sprite.scale.set(w, w, 1);
        // Start at the plinth and build upward. The 2D renderer draws this
        // same sequence from base to shaft(s) to capital.
        sprite.position.set(structure.x, 0.6 + index * w, structure.y);
        roomGroup.add(sprite);
      });
    } else if (structure.kind === 'anvil' || structure.kind === 'forge') {
      const key = structure.kind === 'anvil' ? 'anvil_0' : 'forge_0';
      const image = Neo.ENVIRONMENT_IMAGES?.[key]?.image;
      const frameCount = Math.max(1, Math.floor(Number(image?.naturalWidth || 24) / 24));
      const frame = structure.kind === 'forge' ? Math.floor(Date.now() / 220) % frameCount : 0;
      const texture = getImageTexture(key, frame, 24);
      if (texture) {
        const w = Math.max(24, Number(structure.w || 48));
        const h = Math.max(24, Number(structure.h || w));
        const prop = makeGroundedBillboard(texture, Math.min(w, h) * 0.34);
        const sprite = prop.getObjectByName('body');
        sprite.scale.set(w, h, 1);
        // Simulation coordinates are the prop center in both renderers. The
        // former +h/2 shift put every forge downstage of its interaction spot.
        prop.position.set(structure.x, 0, structure.y);
        roomGroup.add(prop);
        if (structure.kind === 'forge') {
          const animated = roomGroup.userData.animatedSprites || (roomGroup.userData.animatedSprites = []);
          animated.push({ sprite, key, frameCount, frameWidth: 24, interval: 220 });
        }
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

function syncRoomEnvironmentSprites() {
  const animated = roomGroup?.userData?.animatedSprites;
  if (!animated?.length) return;
  animated.forEach(entry => {
    const frame = Math.floor(Date.now() / entry.interval) % entry.frameCount;
    const texture = getImageTexture(entry.key, frame, entry.frameWidth);
    if (texture && entry.sprite.material.map !== texture) {
      entry.sprite.material.map = texture;
      entry.sprite.material.needsUpdate = true;
    }
  });
}

function syncWorldFxOverlay() {
  const room = Neo.currentRoom;
  const hasGhostBalls = Array.isArray(Neo.ghostBalls) && Neo.ghostBalls.length > 0;
  const hasSkySwords = Array.isArray(Neo.skySwords) && Neo.skySwords.length > 0;
  const hasChallengeVisual = room?.type === 'challenge' && !room.cleared && !!room.challengeStarted;
  if (!hasGhostBalls && !hasSkySwords && !hasChallengeVisual) {
    if (worldFxMesh) worldFxMesh.visible = false;
    return;
  }
  const W = Neo.ROOM_W;
  const H = Neo.ROOM_H;
  if (!worldFxCanvas || worldFxCanvas.width !== W || worldFxCanvas.height !== H) {
    worldFxCanvas = document.createElement('canvas');
    worldFxCanvas.width = W;
    worldFxCanvas.height = H;
    worldFxTexture?.dispose?.();
    worldFxTexture = makeCanvasTexture(worldFxCanvas);
    if (!worldFxMesh) {
      worldFxMesh = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
        map: worldFxTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      worldFxMesh.rotation.x = -Math.PI / 2;
      worldFxMesh.renderOrder = 3;
      scene.add(worldFxMesh);
    } else {
      worldFxMesh.material.map = worldFxTexture;
      worldFxMesh.material.needsUpdate = true;
    }
  }
  const g = worldFxCanvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = g;
    Neo.drawGhostBalls?.();
    Neo.drawSkySwords?.();
    Neo.drawChallengeObelisk?.();
  } catch { /* a special effect must never take down the 3D frame */ }
  Neo.ctx = realCtx;
  worldFxTexture.needsUpdate = true;
  worldFxMesh.visible = true;
  worldFxMesh.scale.set(W, H, 1);
  worldFxMesh.position.set(W / 2, 3.2, H / 2);
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
  // Character sheets (Gelleh, Sarge, etc.) are deliberately stored outside
  // SPRITE_DEFS, so treating that table as the only valid source silently
  // turned those heroes into Thorn Knight in 3D.
  return Neo.SPRITE_DEFS?.[spriteKey] || Neo.CHARACTER_SPRITE_SHEETS?.[spriteKey]
    ? spriteKey
    : 'thorn_knight';
}

function actorPlayerSpriteKey(actor, slot = null) {
  const key = actor?.character || slot?.getCharacter?.() || 'thorn_knight';
  const spriteKey = Neo.getCharacterSpriteKey ? Neo.getCharacterSpriteKey(key) : key;
  return Neo.SPRITE_DEFS?.[spriteKey] || Neo.CHARACTER_SPRITE_SHEETS?.[spriteKey]
    ? spriteKey
    : 'thorn_knight';
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
  // The 2D player is made of both a body frame and its rotating aim/arm frame.
  // Keep that composition in third person instead of reducing characters to a
  // body-only billboard.
  const arm = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false }));
  arm.center.set(0.5, 0.5);
  arm.name = 'arm';
  arm.renderOrder = 3;
  arm.visible = false;
  group.add(arm);
  const status = new THREE.Group();
  status.name = 'status-effects';
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1, 28),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 1.3;
  aura.name = 'aura';
  status.add(aura);
  group.add(status);
  // Windup circles are an important attack read in the top-down renderer.
  // Keep one under every actor and simply reveal/tint it for enemies that are
  // currently charging an attack.
  const windup = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  windup.rotation.x = -Math.PI / 2;
  windup.position.y = 1.15;
  windup.name = 'windup';
  windup.visible = false;
  group.add(windup);
  const mooggyAura = new THREE.Mesh(
    unitCircle,
    new THREE.MeshBasicMaterial({ color: 0xff1d34, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  mooggyAura.rotation.x = -Math.PI / 2;
  mooggyAura.position.y = 0.95;
  mooggyAura.name = 'mooggy-aura';
  mooggyAura.visible = false;
  group.add(mooggyAura);
  return group;
}

function syncEnemyWindup(group, enemy) {
  const windup = group.getObjectByName('windup');
  if (!windup) return;
  const active = Number(enemy.windup || 0) > 0;
  windup.visible = active;
  if (!active) return;
  const color = (enemy.type === 'charger' || enemy.type === 'golem' || enemy.type === 'bulk_golem') ? '#ff8844'
    : enemy.type === 'bowman_bane' ? '#8dd4ff'
      : enemy.type === 'handsome_devil' ? '#ff3348'
        : enemy.type === 'antony_blemmye' ? '#ffcf8a'
          : '#aa66ff';
  const radius = (enemy.r || 12) + 10 + Math.sin(Date.now() / 120) * 2;
  windup.material.color.set(color);
  windup.material.opacity = 0.8;
  windup.scale.set(radius * 2, radius * 2, 1);
}

function syncMooggyAura(group, enemy) {
  const aura = group.getObjectByName('mooggy-aura');
  if (!aura) return;
  const active = enemy.type === 'mooggy';
  aura.visible = active;
  if (!active) return;
  const radius = (enemy.r || 12) + 19;
  aura.material.opacity = 0.13 + Math.sin(Date.now() / 180) * 0.03;
  aura.scale.set(radius * 2, radius * 2, 1);
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

function syncPlayerArm(group, spriteKey, player, aim, flip, options = {}) {
  const arm = group.getObjectByName('arm');
  if (!arm) return;
  const texture = getSpriteTexture(`${spriteKey}:arm`, flip);
  if (!texture || options.hidden) {
    arm.visible = false;
    return;
  }
  const renderScale = Number(texture.userData?.renderScale || 1);
  const aspect = Number(texture.userData?.aspect || 1);
  const sheet = Neo.CHARACTER_SPRITE_SHEETS?.[spriteKey] || Neo.CHARACTER_SHEET_DEFS?.[spriteKey] || {};
  const size = (player.r || 14) * SPRITE_SIZE_MULT * renderScale;
  const recoil = Math.max(0, Number(options.recoil || 0));
  const attackProgress = Math.max(0, Math.min(1, Number(options.attackProgress || 0)));
  let angleOffset = 0;
  let swingRecoil = recoil;
  if (!window.NeoSettings?.getAccess?.()?.reduceMotion
    && ['thorn_knight', 'sarge', 'mooggy'].includes(spriteKey) && attackProgress > 0) {
    const arc = spriteKey === 'sarge' ? 1.35 : spriteKey === 'mooggy' ? 0.85 : 1.05;
    const eased = 1 - (1 - attackProgress) ** 2;
    angleOffset = -arc * (1 - eased * 2);
    swingRecoil = Math.sin(attackProgress * Math.PI) * 0.2;
  }
  const baseAngle = Number.isFinite(Number(sheet.armBaseAngle)) ? Number(sheet.armBaseAngle) : 0;
  const sourceAimAngle = flip ? Math.PI - baseAngle : baseAngle;
  const offset = sheet.armOffset || {};
  const offsetX = Number(offset.x || 0) * size / Math.max(1, Number(texture.image?.width || 24)) * (flip ? -1 : 1);
  const offsetY = Number(offset.y || 0) * size / Math.max(1, Number(texture.image?.width || 24));
  const reach = Math.max(8, (player.r || 14) * 0.68 - swingRecoil * 18);
  arm.visible = true;
  arm.material.map = texture;
  arm.material.opacity = options.alpha ?? 1;
  arm.material.rotation = -(aim - sourceAimAngle + angleOffset * (flip ? -1 : 1));
  arm.scale.set(size * aspect, size, 1);
  arm.position.set(Math.cos(aim) * reach + offsetX, size * 0.45 + offsetY, Math.sin(aim) * reach);
  arm.material.needsUpdate = true;
}

function syncActorStatus(group, actor, radius, isPlayer = false) {
  const status = group.getObjectByName('status-effects');
  if (!status) return;
  const active = [];
  (Neo.STATUS_KEYS || []).forEach(key => {
    const stacks = Number(Neo.getStatusStacks?.(actor, key) || 0);
    if (stacks > 0) active.push({ key, stacks });
  });
  if (Number(actor.stun || 0) > 0) active.push({ key: 'stun', stacks: 1 });
  status.visible = active.length > 0;
  if (!active.length) return;

  const now = performance.now() / 1000;
  const aura = status.getObjectByName('aura');
  const primary = active[0];
  const primaryColor = Neo.STATUS_STYLES?.[primary.key]?.color
    || Neo.STATUS_ICON_DEFS?.[primary.key]?.color || '#ffe66d';
  if (aura) {
    aura.material.color.set(primaryColor);
    aura.material.opacity = 0.34 + Math.sin(now * 8) * 0.1;
    const scale = Math.max(12, radius * (isPlayer ? 2.65 : 2.35)) * (1 + Math.sin(now * 6) * 0.05);
    aura.scale.set(scale, scale, 1);
  }

  const obsolete = new Set();
  status.children.forEach(child => { if (child.name.startsWith('badge:')) obsolete.add(child.name); });
  const totalWidth = active.reduce((sum, entry) => sum + (entry.stacks > 1 ? 29 : 20), 0) + Math.max(0, active.length - 1) * 3;
  let offset = -totalWidth / 2;
  active.forEach(entry => {
    const name = `badge:${entry.key}`;
    obsolete.delete(name);
    let badge = status.getObjectByName(name);
    const textureEntry = getStatusBadgeTexture(entry.key, entry.stacks);
    if (!textureEntry) return;
    if (!badge) {
      badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      badge.center.set(0.5, 0);
      badge.name = name;
      badge.renderOrder = 11;
      status.add(badge);
    }
    if (badge.material.map !== textureEntry.texture) {
      badge.material.map = textureEntry.texture;
      badge.material.needsUpdate = true;
    }
    const width = textureEntry.w;
    badge.position.set(offset + width / 2, Math.max(36, radius * SPRITE_SIZE_MULT + 18), 0);
    badge.scale.set(width, textureEntry.h, 1);
    offset += width + 3;
  });
  obsolete.forEach(name => {
    const badge = status.getObjectByName(name);
    if (badge) {
      status.remove(badge);
      badge.material.dispose();
    }
  });
}

function syncPlayerDashTrail(player, spriteKey, flip) {
  const now = performance.now() / 1000;
  const active = !isFirstPersonActive() && Number(player.dashTime || 0) > 0;
  if (active && now - lastDashAfterimageAt >= 0.038) {
    const texture = getSpriteTexture(spriteKey, flip);
    if (texture) {
      const sprite = makeBillboard(texture, { depthWrite: false, color: 0xbceeff });
      sprite.material.opacity = 0.46;
      sprite.renderOrder = 2;
      const renderScale = Number(texture.userData?.renderScale || 1);
      const aspect = Number(texture.userData?.aspect || 1);
      const height = (player.r || 14) * SPRITE_SIZE_MULT * renderScale;
      sprite.scale.set(height * aspect, height, 1);
      sprite.position.set(player.x, 0.8, player.y);
      scene.add(sprite);
      dashAfterimages.push({ sprite, born: now });
      lastDashAfterimageAt = now;
    }
  }
  for (let index = dashAfterimages.length - 1; index >= 0; index -= 1) {
    const trail = dashAfterimages[index];
    const age = now - trail.born;
    if (age >= 0.26) {
      scene.remove(trail.sprite);
      trail.sprite.material.dispose();
      dashAfterimages.splice(index, 1);
      continue;
    }
    trail.sprite.material.opacity = 0.46 * (1 - age / 0.26);
  }
}

function makeMeleeIndicator() {
  const group = new THREE.Group();
  const makeLine = (color, opacity) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    return new THREE.Line(geometry, material);
  };
  const glow = makeLine(0xd86d87, 0.32);
  glow.name = 'glow';
  group.add(glow);
  const edge = makeLine(0xffffff, 0.9);
  edge.name = 'edge';
  group.add(edge);
  const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture('#ffffff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  tip.center.set(0.5, 0.5);
  tip.name = 'tip';
  group.add(tip);
  group.visible = false;
  scene.add(group);
  return group;
}

function writeMeleeLine(line, points) {
  const attribute = line.geometry.getAttribute('position');
  points.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z));
  line.geometry.setDrawRange(0, points.length);
  attribute.needsUpdate = true;
}

function syncPlayerMeleeIndicator() {
  const p = Neo.player;
  if (!p || Number(p.swing || 0) <= 0) {
    if (playerMeleeIndicator) playerMeleeIndicator.visible = false;
    return;
  }
  if (!playerMeleeIndicator) playerMeleeIndicator = makeMeleeIndicator();
  const total = Math.max(0.01, Number(Neo.ATTACKS?.melee?.active || 0.32));
  const progress = Math.max(0, Math.min(1, 1 - Number(p.swing || 0) / total));
  const staff = Neo.getEquippedWeapon?.() === 'extending_staff';
  const color = staff ? '#ff3333' : Neo.godTimer > 0 ? '#f6e8c8' : p.character === 'gelleh' ? '#bfe4ff' : '#d86d87';
  const fade = 0.9 * Math.max(0, Math.min(1, Number(p.swing || 0) / total));
  const glow = playerMeleeIndicator.getObjectByName('glow');
  const edge = playerMeleeIndicator.getObjectByName('edge');
  const tip = playerMeleeIndicator.getObjectByName('tip');
  playerMeleeIndicator.visible = true;
  glow.material.color.set(color);
  glow.material.opacity = fade * 0.42;
  edge.material.opacity = fade;
  const angle = Number(p.swingA || Neo.angleToMouse?.() || 0);
  if (p.stabSwing) {
    const lunge = Math.sin(progress * Math.PI);
    const reach = 30 + lunge * 60;
    const points = [
      { x: p.x + Math.cos(angle) * 12, y: 8, z: p.y + Math.sin(angle) * 12 },
      { x: p.x + Math.cos(angle) * reach, y: 8, z: p.y + Math.sin(angle) * reach },
    ];
    writeMeleeLine(glow, points);
    writeMeleeLine(edge, points);
    tip.position.copy(new THREE.Vector3(points[1].x, points[1].y, points[1].z));
    tip.scale.set(14, 14, 1);
    tip.material.color.set(color);
    tip.material.opacity = fade;
    return;
  }
  const range = staff ? 130 : 55;
  const arc = staff ? 1.45 : Number(Neo.ATTACKS?.melee?.arc || 0.9);
  const direction = Number(p.swingFacing || 1) < 0 ? 1 : -1;
  const start = angle + arc * direction;
  const end = angle - arc * direction;
  const current = start + (end - start) * progress;
  const trailStart = current + arc * 0.55 * direction;
  const points = [];
  for (let index = 0; index < 33; index += 1) {
    const t = index / 32;
    const theta = trailStart + (current - trailStart) * t;
    points.push({ x: p.x + Math.cos(theta) * range, y: 7, z: p.y + Math.sin(theta) * range });
  }
  writeMeleeLine(glow, points);
  writeMeleeLine(edge, points);
  const finalPoint = points[points.length - 1];
  tip.position.set(finalPoint.x, finalPoint.y, finalPoint.z);
  tip.scale.set(staff ? 16 : 11, staff ? 16 : 11, 1);
  tip.material.color.set(color);
  tip.material.opacity = fade;
}

function syncPlayerDeathPool(anim, size, fallEase) {
  if (!playerDeathPool) {
    playerDeathPool = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({
      color: 0x5e0010,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }));
    playerDeathPool.rotation.x = -Math.PI / 2;
    playerDeathPool.renderOrder = 2;
    scene.add(playerDeathPool);
  }
  const t = Neo.clamp?.(anim.timer / anim.duration, 0, 1) ?? Math.max(0, Math.min(1, anim.timer / anim.duration));
  const poolAlpha = Math.max(0, Math.min(1, (t - 0.3) / 0.4));
  playerDeathPool.visible = poolAlpha > 0;
  playerDeathPool.position.set(anim.x, 0.45, anim.y);
  playerDeathPool.scale.set(size * (0.64 + poolAlpha * 0.24), size * (0.16 + poolAlpha * 0.08), 1);
  playerDeathPool.material.opacity = 0.45 * poolAlpha;
  playerDeathPool.rotation.z = (anim.facing < 0 ? -1 : 1) * fallEase * 0.2;
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
  const anim = dying ? Neo.playerDeathAnim : null;
  // First person normally hides the body, but the death fall must remain
  // visible in every camera mode just like the 2D corpse animation.
  playerSprite.visible = !isFirstPersonActive() || !!anim;
  const x = anim ? anim.x : p.x;
  const z = anim ? anim.y : p.y;
  playerSprite.position.set(x, 0, z);
  const currentAim = Neo.angleToMouse?.() ?? 0;
  const swingActive = !anim && Number(p.swing || 0) > 0;
  const armRecoilDuration = Math.max(0.01, Number(p.armRecoilDuration || 0.16));
  const armRecoilRemaining = Math.max(0, Number(p.armRecoilUntil || 0) - Number(Neo.gameElapsedTime || 0));
  const aim = anim ? Number(anim.facing || 1) * 0.01
    : swingActive && Number.isFinite(Number(p.swingA)) ? Number(p.swingA)
      : armRecoilRemaining > 0 && Number.isFinite(Number(p.armRecoilA)) ? Number(p.armRecoilA)
        : currentAim;
  const flip = anim ? Number(anim.facing || 1) < 0
    : swingActive && Number(p.swingFacing || 0) ? Number(p.swingFacing) < 0
      : armRecoilRemaining > 0 && Number(p.armRecoilFacing || 0) ? Number(p.armRecoilFacing) < 0
        : facingOf(p, currentAim) < 0;
  const baseKey = playerSpriteKey();
  const swingTotal = Neo.ATTACKS?.melee?.active || 0.32;
  const frameKey = !anim
    ? (Neo.getActorSpriteFrameKey?.(baseKey, p, {
      maxSpeed: p.mooggyZoomiesTime > 0 ? 640 : p.princessFlightTime > 0 ? 420 : 260,
      stepRate: p.mooggyZoomiesTime > 0 ? 11 : 7.5,
      attackProgress: Math.max(0, 1 - Number(p.swing || 0) / swingTotal),
      seedKey: 'player',
    }) || baseKey)
    : baseKey;
  let bob = !anim ? walkBob(p) : { hop: 0, squashX: 1, squashY: 1 };
  if (!anim && Number(p.dashTime || 0) > 0) {
    bob = { ...bob, hop: bob.hop + 4, squashX: bob.squashX + 0.12, squashY: bob.squashY - 0.075 };
  }
  let alpha = 1;
  let tint = p.inv > 0 && Math.floor(Neo.frameId / 3) % 2 === 0 ? 0xff9999 : 0xffffff;
  let fallEase = 0;
  if (anim) {
    const t = Neo.clamp?.(anim.timer / anim.duration, 0, 1) ?? Math.max(0, Math.min(1, anim.timer / anim.duration));
    fallEase = 1 - (1 - Math.min(t * 1.6, 1)) ** 3;
    bob = { hop: 0, squashX: 1 + 0.05 * fallEase, squashY: 1 - 0.46 * fallEase };
    tint = 0x5e2630;
    syncPlayerDeathPool(anim, Math.max(34, (anim.r || p.r || 14) * 2.5), fallEase);
  } else if (playerDeathPool) {
    playerDeathPool.visible = false;
  }
  updateActorSprite(playerSprite, frameKey, p.r || 14, flip, { ...bob, alpha, tint });
  const body = playerSprite.getObjectByName('body');
  if (body) {
    body.material.rotation = anim ? (anim.facing < 0 ? -1 : 1) * (Math.PI / 2) * fallEase : 0;
    body.center.set(0.5, anim ? 0.5 : 0);
    if (anim) body.position.y = Math.max(4, (p.r || 14) * SPRITE_SIZE_MULT * 0.28);
  }
  const recoil = armRecoilRemaining / armRecoilDuration;
  syncPlayerArm(playerSprite, baseKey, p, aim, flip, {
    hidden: !!anim || isFirstPersonActive(),
    recoil,
    attackProgress: swingActive ? Math.max(0, 1 - Number(p.swing || 0) / swingTotal) : 0,
    alpha,
  });
  syncActorStatus(playerSprite, p, p.r || 14, true);
  syncPlayerDashTrail(p, frameKey, flip);
  if (playerShadow) {
    const dashScale = Number(p.dashTime || 0) > 0 ? 1.18 : 1;
    playerShadow.scale.setScalar((p.r || 14) * 2 * dashScale);
    playerShadow.material.opacity = Number(p.dashTime || 0) > 0 ? 0.4 : 0.28;
  }
  if (playerLight) playerLight.position.set(x, 130, z);
}

// The browser's regular player-slot projection is also the source of truth for
// network peers.  Synchronize those actors into the same Three.js scene as the
// local player so first- and third-person modes do not need a multiplayer-only
// drawing path.
function syncOtherPlayers() {
  const slots = Neo.presentationPlayerSlots || [];
  const remoteSlots = slots.filter(slot => {
    const actor = slot?.getEntity?.();
    return actor && actor !== Neo.player && !slot.getDead?.();
  });
  syncPool(
    pools.players,
    remoteSlots.map(slot => slot.getEntity()),
    actor => makeActorGroup(actorPlayerSpriteKey(actor), actor.r || 14),
    (actor, group) => {
      const baseKey = actorPlayerSpriteKey(actor);
      const aim = Number.isFinite(Number(actor.swingA))
        ? Number(actor.swingA)
        : Number(actor.aimDirection || 0);
      const flip = Number(actor.swingFacing || 0)
        ? Number(actor.swingFacing) < 0
        : facingOf(actor, aim) < 0;
      const swingTotal = Neo.ATTACKS?.melee?.active || 0.32;
      const frameKey = Neo.getActorSpriteFrameKey?.(baseKey, actor, {
        maxSpeed: actor.mooggyZoomiesTime > 0 ? 640 : actor.princessFlightTime > 0 ? 420 : 260,
        stepRate: actor.mooggyZoomiesTime > 0 ? 11 : 7.5,
        attackProgress: Math.max(0, 1 - Number(actor.swing || 0) / swingTotal),
        seedKey: `player:${actor.id || actor.displayName || 'remote'}`,
      }) || baseKey;
      let bob = walkBob(actor, Number(actor.x || 0));
      if (Number(actor.dashTime || 0) > 0) {
        bob = { ...bob, hop: bob.hop + 4, squashX: bob.squashX + 0.12, squashY: bob.squashY - 0.075 };
      }
      const tint = actor.inv > 0 && Math.floor(Neo.frameId / 3) % 2 === 0 ? 0xff9999 : 0xffffff;
      group.visible = true;
      group.position.set(actor.x, 0, actor.y);
      updateActorSprite(group, frameKey, actor.r || 14, flip, { ...bob, tint });
      syncPlayerArm(group, baseKey, actor, aim, flip, {
        attackProgress: Number(actor.swing || 0) > 0
          ? Math.max(0, 1 - Number(actor.swing || 0) / swingTotal)
          : 0,
      });
      syncActorStatus(group, actor, actor.r || 14, true);
      const shadow = group.getObjectByName('shadow');
      if (shadow) {
        const dashScale = Number(actor.dashTime || 0) > 0 ? 1.18 : 1;
        shadow.scale.setScalar((actor.r || 14) * 2 * dashScale);
        shadow.material.opacity = Number(actor.dashTime || 0) > 0 ? 0.4 : 0.28;
      }
    },
  );
}

// The enemy nameplate — name + level + HP text + health bar (+ barrier bar) —
// is drawn identically to 2D by reusing the same cached bitmap the 2D renderer
// builds (Neo.buildEnemyNameplateRender). We mirror it onto a camera-facing
// billboard so 3D/first-person show the very same health bars as the original
// top-down view. The bitmap changes only when its signature does (HP crossed a
// pixel, name/barrier/danger state changed), so the texture upload is rare.
function ensureNameplate(enemy, group) {
  let plate = nameplatePool.get(enemy);
  if (!plate) {
    const texture = new THREE.Texture();
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 10; // always on top of world geometry / other enemies
    group.add(sprite);
    plate = { sprite, texture, signature: null };
    nameplatePool.set(enemy, plate);
  }
  return plate;
}

// Nameplates render at a constant on-SCREEN size (like the 2D plate, which
// doesn't grow when the camera is near), so their world scale is set per-frame
// from each enemy's distance to the camera in scaleNameplatesToScreen().
const NAMEPLATE_SCREEN_PX_PER_CANVAS_PX = 1.15; // on-screen px per source px at reference

function syncEnemies() {
  syncPool(
    pools.enemies,
    Neo.enemies,
    enemy => makeActorGroup(enemySpriteKey(enemy), enemy.r || 12),
    (enemy, group) => {
      group.position.set(enemy.x, 0, enemy.y);
      // During the shared 0.72s spawn window, 2D draws only the portal and
      // its emerging silhouette. Keep the normal actor/nameplate hidden until
      // that presentation has completed.
      group.visible = Number(enemy.spawnT || 0) <= 0;
      if (!group.visible) return;
      const flip = (Neo.player ? Neo.player.x < enemy.x : false);
      const bob = walkBob(enemy, enemy.x);
      const stunned = Number(enemy.stun || 0) > 0;
      const tint = stunned ? 0xaad4ff : enemy.elite ? 0xffe2a8 : 0xffffff;
      updateActorSprite(group, enemySpriteKey(enemy), enemy.r || 12, flip, { ...bob, tint });
      syncEnemyWindup(group, enemy);
      syncMooggyAura(group, enemy);

      // Nameplate + health bar, pixel-matched to the 2D renderer.
      const plate = ensureNameplate(enemy, group);
      const hpPct = Neo.clamp?.(enemy.hp / Math.max(1, enemy.max), 0, 1)
        ?? Math.max(0, Math.min(1, enemy.hp / Math.max(1, enemy.max)));
      let render = null;
      try { render = Neo.buildEnemyNameplateRender?.(enemy, hpPct); } catch { render = null; }
      if (render?.canvas) {
        plate.sprite.visible = true;
        // The 2D cache reuses one canvas per enemy and only repaints it when the
        // signature changes; re-point the texture and flag an upload only then.
        if (plate.texture.image !== render.canvas || plate.signature !== render.signature) {
          plate.texture.image = render.canvas;
          plate.texture.needsUpdate = true;
          plate.signature = render.signature;
        }
        plate.cw = render.canvas.width;
        plate.ch = render.canvas.height;
        // Sit just above the billboard's head, like the 2D plate above the sprite.
        const headY = (enemy.r || 12) * SPRITE_SIZE_MULT;
        plate.sprite.position.set(0, headY + 8, 0);
      } else {
        plate.sprite.visible = false;
      }
      syncActorStatus(group, enemy, enemy.r || 12);
    },
  );
  // Guard keeps an older cached module from taking down the entire 3D frame
  // while a dev server/browser refresh catches up; the current renderer always
  // supplies this function immediately below.
  if (typeof syncSpawnPortals === 'function') syncSpawnPortals();
  // Nameplate sprites die with their enemy group (child objects); prune the map.
  nameplatePool.forEach((plate, enemy) => { if (!pools.enemies.has(enemy)) nameplatePool.delete(enemy); });
}

function makeSpawnPortalObject() {
  const group = new THREE.Group();
  const pool = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({
    color: 0x4d167d, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 1.1;
  pool.name = 'pool';
  group.add(pool);
  ['outer-ring', 'inner-ring'].forEach((name, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, index ? 0.055 : 0.08, 6, 24), new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2 + index * 0.35;
    ring.name = name;
    group.add(ring);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowTexture('#cc88ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.center.set(0.5, 0.5);
  glow.position.y = 3;
  glow.name = 'glow';
  group.add(glow);
  const emerge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false }));
  emerge.center.set(0.5, 0);
  emerge.name = 'emerge';
  emerge.visible = false;
  group.add(emerge);
  return group;
}

function syncSpawnPortals() {
  const spawning = (Neo.enemies || []).filter(enemy => enemy && Number(enemy.spawnT || 0) > 0);
  syncPool(
    pools.spawnPortals,
    spawning,
    () => makeSpawnPortalObject(),
    (enemy, group) => {
      const duration = 0.72;
      const progress = Math.max(0, Math.min(1, 1 - Number(enemy.spawnT || 0) / duration));
      const emergeProgress = Math.max(0, Math.min(1, (progress - 0.35) / 0.65));
      const portalEase = 1 - (1 - Math.min(progress * 1.8, 1)) ** 3;
      const boss = Neo.BOSS_TYPES?.has(enemy.type);
      const elite = !!enemy.elite;
      const color = boss ? '#ffd060' : elite ? '#e8b030' : '#8855ff';
      const innerColor = boss ? '#fff4c0' : elite ? '#ffe080' : '#cc88ff';
      const radius = (enemy.r || 12) * (1.8 + portalEase * 0.6);
      const now = performance.now() / 1000;
      group.position.set(enemy.x, 0, enemy.y);

      const pool = group.getObjectByName('pool');
      if (pool) {
        pool.material.color.set(boss ? 0x785000 : 0x280050);
        pool.material.opacity = 0.45 * portalEase;
        pool.scale.set(radius * 1.7, radius * 0.56, 1);
      }
      const outer = group.getObjectByName('outer-ring');
      const inner = group.getObjectByName('inner-ring');
      if (outer) {
        outer.material.color.set(color);
        outer.material.opacity = 0.9 * portalEase;
        outer.scale.set(radius, radius * 0.38, 1);
        outer.rotation.z = now * 3.1;
      }
      if (inner) {
        inner.material.color.set(innerColor);
        inner.material.opacity = 0.82 * portalEase;
        inner.scale.set(radius * 0.78, radius * 0.3, 1);
        inner.rotation.z = -now * 2.1;
      }
      const glow = group.getObjectByName('glow');
      if (glow) {
        const texture = getGlowTexture(color);
        if (glow.material.map !== texture) {
          glow.material.map = texture;
          glow.material.needsUpdate = true;
        }
        glow.material.opacity = 0.62 * portalEase;
        glow.scale.set(radius * 2.3, radius * 1.3, 1);
      }
      const emerge = group.getObjectByName('emerge');
      if (emerge) {
        const flip = Neo.player ? Neo.player.x < enemy.x : false;
        const texture = getSpriteTexture(enemySpriteKey(enemy), flip);
        emerge.visible = emergeProgress > 0 && !!texture;
        if (!texture) return;
        if (emerge.material.map !== texture) {
          emerge.material.map = texture;
          emerge.material.needsUpdate = true;
        }
        const renderScale = Number(texture.userData?.renderScale || 1);
        const aspect = Number(texture.userData?.aspect || 1);
        const height = (enemy.r || 12) * SPRITE_SIZE_MULT * renderScale;
        emerge.scale.set(height * aspect, height * (0.28 + emergeProgress * 0.72), 1);
        emerge.position.y = 1.4;
        emerge.material.opacity = Math.min(1, emergeProgress * 1.8);
      }
    },
  );
}

// Give every nameplate a constant on-screen size regardless of camera distance
// — matching the 2D renderer, where the plate never grows as you approach an
// enemy. World-units-per-screen-pixel at a given depth is
// (2·tan(fov/2)·distance)/viewportHeight, so multiplying that by the desired
// on-screen pixel size yields the world scale. Called after syncCamera() so the
// camera's world position is current this frame.
const _plateWorldPos = new THREE.Vector3();
function scaleNameplatesToScreen() {
  if (!nameplatePool.size) return;
  const vpH = glCanvas?.height || renderer?.domElement?.height || 720;
  const halfFovTan = Math.tan((camera.fov * Math.PI / 180) / 2);
  const camPos = camera.position;
  nameplatePool.forEach((plate) => {
    const sprite = plate.sprite;
    if (!sprite.visible || !plate.cw) return;
    sprite.getWorldPosition(_plateWorldPos);
    const distance = Math.max(1, camPos.distanceTo(_plateWorldPos));
    const worldPerScreenPx = (2 * halfFovTan * distance) / vpH;
    const s = worldPerScreenPx * NAMEPLATE_SCREEN_PX_PER_CANVAS_PX;
    sprite.scale.set(plate.cw * s, plate.ch * s, 1);
  });
}

function syncProjectiles() {
  syncPool(
    pools.projectiles,
    Neo.projectiles,
    () => new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
    (projectile, sprite) => {
      const visual = Neo.getProjectileVisual?.(projectile) || {};
      // Shaped shots (Sarge's hammer, the Death Ball) bake their 2D silhouette;
      // everything else keeps the fast generic glow.
      const shaped = getShapedProjectileTexture(projectile);
      const texture = shaped || getGlowTexture(visual.color || projectile.color || '#ffffff');
      if (sprite.material.map !== texture) {
        sprite.material.map = texture;
        // Baked art carries its own shading; additive would wash it out.
        sprite.material.blending = shaped ? THREE.NormalBlending : THREE.AdditiveBlending;
        sprite.material.needsUpdate = true;
      }
      const size = shaped
        // Scale the baked texture so its baked radius maps to the live radius,
        // preserving the padding baked into the canvas.
        ? (texture.userData.halfSize / texture.userData.bakedRadius) * (projectile.r || 6) * 2
        : Math.max(10, (projectile.r || 6) * 4);
      sprite.scale.set(size, size, 1);
      sprite.position.set(projectile.x, BEAM_Y, projectile.y);
    },
  );
}

// Glow colors for GLOW_ONLY_PICKUP_TYPES. Types with authored 2D art bake it
// instead, so they intentionally have no entry here.
const PICKUP_STYLES = {
  crystal: '#58b7ff',
  key: '#ffe07a',
};

// Pickups bake their real 2D art by DEFAULT. The renderer used to work the
// other way around -- only a hand-listed set was baked and everything else fell
// through to a generic glow blob -- which meant every prop the 2D renderer drew
// as real art silently degraded, and each one had to be discovered by eye
// (ladders, bombs, trial altars and shrines were all found that way). Inverting
// it makes the failure mode safe: a pickup type nobody has thought about yet
// renders as its authored art instead of a nondescript blob, so new types can
// never regress this way again.
//
// Only types the 2D renderer has no case for at all stay on the glow path:
// they fall through drawPickups' if/else chain to its own generic blob, so
// baking would just reproduce the same glow at the cost of a canvas each.
// Everything with a real 2D branch bakes -- including coins (four value tiers
// with distinct colors and shapes) and potions (pixel-art sprites), which look
// like glow candidates but are authored art.
const GLOW_ONLY_PICKUP_TYPES = new Set(['crystal', 'key']);
// The challenge switch is a floor plate (a rounded pad with bolts, drawn lying
// on the ground in 2D), so it bakes onto a flat quad. The altars are upright
// consoles and bake onto billboards — standing the switch up, or laying the
// altar down, is the same mistake as the flat ladder.
const FLAT_BAKED_PICKUP_TYPES = new Set(['challengeSwitch']);
// World height baked per type. The altar art runs about y=-63 (top of screen)
// to y=+39 (below the label); the switch is a small floor pad.
// Sized from each type's actual draw extents in drawPickups, doubled (the bake
// is centered on the pickup origin, so the band must cover the largest
// coordinate in BOTH directions) with headroom for shadowBlur bleed. Too small
// clips the art; too large just wastes canvas resolution.
const BAKED_PICKUP_WORLD_SIZE = {
  challengeStarter: 150,
  challengePracticePortal: 150,
  challengeSwitch: 90,
  // Pedestal art runs about y=-57 (top of the screen panel) to y=+35 (title),
  // so a 140-unit band clears it with room for the glow.
  specialChoice: 140,
  // A plain item drop is just an 8x8 pixel icon drawn at px * 3 - 12, i.e. it
  // only spans about -12..+12. Sizing this for the charger's warning text (see
  // pickupBakeWorldSize) rendered ordinary drops at ~7% of the sprite -- a
  // speck floating in mostly-empty canvas, which is why drops looked missing.
  item: 44,
  // The portal disc tops out at portalR ~27 plus its label; a wider band just
  // wastes bake resolution and renders it soft.
  adapterPortal: 90,
  jesterPortal: 90,
  rewardChoice: 90,
  challengeItemChoice: 90,
  secretVendor: 90,
  secret_boss_chest: 90,
  coin: 60,
  potion: 60,
  apple: 60,
  fruit: 60,
  treasureKey: 60,
  crown: 60,
  descend: 70,
  returnGate: 70,
  fightGod: 70,
  secretWarp: 80,
  challengeBomb: 70,
  challengeRune: 70,
};
// Fallback for a type with no measured entry -- deliberately roomy, since
// clipping authored art is worse than a slightly soft bake.
const DEFAULT_BAKED_PICKUP_WORLD_SIZE = 120;

// A duplicate Artificer's Charger draws a dwell meter plus the
// 'NO LOOP CRYSTALS: LETHAL' warning down to y=+44, so that one pickup needs a
// far wider band than the icon it shares a type with. Widen only while the
// warning is actually on screen; every other item drop keeps the tight band
// that renders its 8x8 icon sharply.
const OVERCHARGE_ITEM_WORLD_SIZE = 110;
function pickupBakeWorldSize(pickup) {
  if (pickup.type === 'item'
    && pickup.key === 'artificer_charger'
    && (Neo.getItemCount?.('artificer_charger') || 0) > 0) {
    return OVERCHARGE_ITEM_WORLD_SIZE;
  }
  return BAKED_PICKUP_WORLD_SIZE[pickup.type] || DEFAULT_BAKED_PICKUP_WORLD_SIZE;
}
// Where the prop's contact point sits in the baked canvas, as a fraction from
// the bottom. The bake is centered on the pickup origin, which in 2D is the
// altar's base, so the origin lands at the canvas midpoint.
const BAKED_PICKUP_BASE_FRACTION = 0.5;

// Bake a pickup's 2D art onto its sprite, allocating the canvas/texture on
// first use (see ensureBakeSurface for why each sprite owns its own).
function rasterizeWorldDrawIntoSprite(sprite, pickup, worldSize) {
  const surface = ensureBakeSurface(sprite, worldSize);
  rasterizePickup2D(surface, pickup, worldSize, {
    top: -worldSize / 2,
    height: worldSize,
    offsetY: 0,
  });
}

function syncPickups() {
  syncPool(
    pools.pickups,
    Neo.pickups,
    pickup => {
      if (pickup.type === 'potion') {
        // A native bottle stays recognisable in perspective and cannot collapse
        // into the tiny red/green dot produced by a failed billboard bake.
        const bottle = new THREE.Group();
        bottle.name = 'potion3d';
        const glass = new THREE.MeshStandardMaterial({
          color: 0x5dff86, emissive: 0x16c94f, emissiveIntensity: 1.1,
          transparent: true, opacity: 0.9, roughness: 0.25, metalness: 0.05,
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 18, 10), glass);
        body.position.y = 10;
        bottle.add(body);
        const shoulder = new THREE.Mesh(new THREE.ConeGeometry(8, 7, 10), glass);
        shoulder.position.y = 22.5;
        bottle.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 8, 8), glass);
        neck.position.y = 29;
        bottle.add(neck);
        const cork = new THREE.Mesh(
          new THREE.CylinderGeometry(4.2, 4.2, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0xc58a4c, roughness: 0.9 }),
        );
        cork.position.y = 35;
        bottle.add(cork);
        return bottle;
      }
      if (pickup.type === 'ladder') {
        const group = new THREE.Group();
        const texture = getImageTexture('ladder_0', 0, Neo.ENVIRONMENT_IMAGES?.ladder_0?.image?.naturalWidth || 24);
        // The ladder is a vertical object: stand it up facing the camera. Laid
        // flat it read as a hatch decal painted on the floor.
        const body = makeBillboard(texture, { depthWrite: false });
        if (!texture) body.material.color.setHex(0x7dff9e);
        body.scale.set(64, 64, 1);
        body.position.y = 0.6;
        body.renderOrder = 2;
        group.add(body);
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
      if (GLOW_ONLY_PICKUP_TYPES.has(pickup.type)) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.center.set(0.5, 0);
        return glow;
      }
      // Everything else bakes its real 2D art (see rasterizePickup2D).
      if (FLAT_BAKED_PICKUP_TYPES.has(pickup.type)) {
        const plate = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
        plate.rotation.x = -Math.PI / 2;
        plate.renderOrder = 2;
        plate.name = 'baked2dFlat';
        return plate;
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.center.set(0.5, BAKED_PICKUP_BASE_FRACTION);
      sprite.name = 'baked2d';
      return sprite;
    },
    (pickup, obj) => {
      obj.position.set(pickup.x, 0, pickup.y);
      if (obj.name === 'potion3d') {
        const t = performance.now() / 420 + pickup.x * 0.01;
        obj.position.y = 4 + Math.sin(t) * 3;
        obj.rotation.y = t * 0.45;
        return;
      }
      if (obj.name === 'baked2d' || obj.name === 'baked2dFlat') {
        const worldSize = pickupBakeWorldSize(pickup);
        rasterizeWorldDrawIntoSprite(obj, pickup, worldSize);
        // Flat plates hug the floor; upright props stand just above it.
        obj.position.y = obj.name === 'baked2dFlat' ? 2 : 1;
        return;
      }
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
    () => makeGroundedBillboard(getGlowTexture('#c98a4b'), 20),
    (chest, group) => {
      const sprite = group.getObjectByName('body');
      if (!sprite) return;
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
      // drawChests() uses a 64px source frame. Matching that scale plus a
      // contact shadow keeps treasure grounded and recognizable in 3D.
      sprite.scale.set(64, 64, 1);
      group.position.set(chest.x, 0, chest.y);
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
      // Wooden cover walls are authored as timber barricades in 2D. Give their
      // 3D boxes the matching oak texture rather than the generic stone block.
      const wooden = prop.kind === 'cover_wall' && !prop.reinforced;
      const texture = getEnvTileTexture(wooden ? 'barrel_oak' : 'wall_block');
      const material = texture
        ? makeWallMaterial(texture, new THREE.Color(wooden ? 0x9b6334 : 0xd9d9d9), Number(prop.w || 50), BLOCK_HEIGHT)
        : new THREE.MeshLambertMaterial({ color: wooden ? 0x6b3d20 : 0x555f6d });
      const mesh = new THREE.Mesh(unitBox, material);
      mesh.scale.set(Math.max(24, Number(prop.w || 50)), BLOCK_HEIGHT, Math.max(24, Number(prop.h || 50)));
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
  healing_zone: { color: 0x35ff6f, opacity: 0.78 },
  lightning_column: { color: 0x8dd4ff, opacity: 0.85 },
};

// Hazards the 2D renderer draws as authored props. Like pickups, anything not
// handled explicitly above fell through to a flat tinted disc (or the purple
// 0xa46bff fallback for kinds with no style at all), so holy turrets, fire
// circles, graffiti, spikes and thorn mines all read as missing sprites. Bake
// the real art instead.
//
// Spikes, mines and graffiti are floor features and bake flat; the turret and
// fire circle stand up as billboards.
const BAKED_2D_HAZARD_KINDS = new Set([
  'holy_turret', 'fire_circle', 'el_barto_graffiti', 'red_spikes', 'thorn_mine',
]);
const FLAT_BAKED_HAZARD_KINDS = new Set(['red_spikes', 'thorn_mine', 'el_barto_graffiti']);
// These hazards scale every stroke off hazard.r, so a fixed band would clip a
// large instance. Size the bake as a multiple of r instead -- the widest stroke
// each kind draws, plus headroom for shadowBlur.
const BAKED_HAZARD_SIZE_FACTOR = {
  holy_turret: 3.2,
  fire_circle: 2.8,
  // Reaches r * 2 for the paint splatter, so it needs the widest band.
  el_barto_graffiti: 5,
  red_spikes: 2.6,
  thorn_mine: 2.6,
};
function bakedHazardWorldSize(hazard) {
  const r = Math.max(8, Number(hazard.r) || 32);
  return r * (BAKED_HAZARD_SIZE_FACTOR[hazard.kind] || 3);
}

// Explosive traps ("bombs") are drawn by the 2D renderer as a real prop: blast
// and trigger rings on the floor, plus a bomb body with a lit fuse standing on
// top. The generic hazard path here has no 'explosive_trap' style at all (the
// unused 'bomb' key below never matched the live hazard kind), so bombs fell
// through to the purple fallback disc and read as a missing sprite. Reuse the
// exact 2D art instead of re-authoring it: rasterize the same draw call, then
// split it across two quads so the rings stay flat and the bomb stands up.
const EXPLOSIVE_TRAP_CANVAS_SIZE = 256;

// Every quad needs its OWN canvas. A CanvasTexture only references its source;
// the actual GPU upload happens during renderer.render() at the end of the
// frame. Sharing one canvas across bombs (or across the rings/body of a single
// bomb) would leave every texture sampling whatever the last bake wrote, so
// two bombs would render identical, wrong art. Canvases hang off the pooled
// Object3D so they live and die with it.
function ensureBakeSurface(mesh, worldSize) {
  let surface = mesh.userData.bakeSurface;
  if (!surface) {
    const canvasEl = document.createElement('canvas');
    canvasEl.width = EXPLOSIVE_TRAP_CANVAS_SIZE;
    canvasEl.height = EXPLOSIVE_TRAP_CANVAS_SIZE;
    surface = { canvas: canvasEl, ctx: canvasEl.getContext('2d') };
    mesh.userData.bakeSurface = surface;
    const texture = makeCanvasTexture(canvasEl);
    // Owned: disposed with the material when the hazard leaves the pool.
    texture.userData.owned = true;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  }
  mesh.material.map.needsUpdate = true;
  mesh.scale.set(worldSize, worldSize, 1);
  return surface;
}

// Rasterize part of a 2D world draw into an offscreen canvas, in world units
// centered on the prop. `clip` keeps only a horizontal band of the art, which
// is how a single 2D drawing gets split into a floor decal and an upright
// billboard (rings on the ground, bomb body standing on top). `draw` runs with
// Neo.ctx pointed at the bake surface and the origin at the prop.
function rasterizeWorldDraw(surface, worldSize, clip, draw) {
  const { canvas: bakeCanvas, ctx: g } = surface;
  const size = EXPLOSIVE_TRAP_CANVAS_SIZE;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, size, size);
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  try {
    Neo.ctx = g;
    // Scale world units into the canvas and center the prop, then offset so the
    // requested band lands in frame.
    const scale = size / worldSize;
    g.setTransform(scale, 0, 0, scale, size / 2, size / 2 - clip.offsetY * scale);
    g.save();
    g.beginPath();
    g.rect(-worldSize / 2, clip.top, worldSize, clip.height);
    g.clip();
    draw();
    g.restore();
  } catch { /* a failed bake should not break the frame */ }
  Neo.ctx = realCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  return bakeCanvas;
}

// Bake one hazard through the shared 2D prop pass. Swapping Neo.hazards to a
// single centered copy keeps the pass to just the prop we want (drawWorldProps
// also draws the shop sign, which early-returns outside shop rooms).
function rasterizeHazard2D(surface, hazard, worldSize, clip) {
  if (typeof Neo.drawWorldProps !== 'function') return null;
  const realHazards = Neo.hazards;
  const result = rasterizeWorldDraw(surface, worldSize, clip, () => {
    Neo.hazards = [{ ...hazard, x: 0, y: 0 }];
    Neo.drawWorldProps();
  });
  Neo.hazards = realHazards;
  return result;
}

// Bake one pickup through the shared 2D pickup pass. Trial altars, challenge
// switches and practice portals are authored there as full props (plinth,
// screen, trial glyph, label); the generic 3D pickup path collapsed them to a
// colored glow blob because PICKUP_STYLES has no entry for those types.
function rasterizePickup2D(surface, pickup, worldSize, clip) {
  if (typeof Neo.drawPickups !== 'function') return null;
  const realPickups = Neo.pickups;
  const realPlayer = Neo.player;
  const result = rasterizeWorldDraw(surface, worldSize, clip, () => {
    Neo.pickups = [{ ...pickup, x: 0, y: 0 }];
    // The altar draws a proximity info panel ~170px above itself when the
    // player is near. Baked into a billboard that panel would scale with camera
    // distance and sit far outside the prop's own footprint; 3D surfaces the
    // same information through drawPrompts instead. Park the player far away
    // for the bake so only the prop itself is drawn.
    Neo.player = null;
    Neo.drawPickups();
  });
  Neo.pickups = realPickups;
  Neo.player = realPlayer;
  return result;
}

function makeExplosiveTrapObject() {
  const group = new THREE.Group();
  // Floor decal: blast radius + trigger rings, lying flat like they do in 2D.
  const rings = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false,
  }));
  rings.rotation.x = -Math.PI / 2;
  rings.position.y = 2;
  rings.renderOrder = 2;
  rings.name = 'rings';
  group.add(rings);
  // The bomb itself stands upright facing the camera.
  const body = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true, depthWrite: false,
  }));
  body.center.set(0.5, 0.06); // sit the base on the floor
  body.name = 'body';
  group.add(body);
  return group;
}

function updateExplosiveTrap(hazard, group) {
  group.position.set(hazard.x, 0, hazard.y);
  const blastR = Number(hazard.blastRadius || 88);
  const r = Number(hazard.r || 14);
  const rings = group.getObjectByName('rings');
  const body = group.getObjectByName('body');

  // Rings span the full blast radius and live at/below the hazard center.
  const ringWorld = blastR * 2 + 16;
  rasterizeHazard2D(ensureBakeSurface(rings, ringWorld), hazard, ringWorld, {
    top: -2, height: ringWorld, offsetY: 0,
  });

  // The bomb body/fuse occupies roughly r*1.2 above the center in 2D.
  const bodyWorld = r * 4;
  rasterizeHazard2D(ensureBakeSurface(body, bodyWorld), hazard, bodyWorld, {
    top: -bodyWorld / 2, height: bodyWorld / 2 + 2, offsetY: -bodyWorld / 4,
  });
  body.position.set(0, 1, 0);
}

const LIGHTNING_COLUMN_HEIGHT = 150; // tall enough to read as a floor-to-ceiling bolt

// Sarge's Lightning Columns (turrets) and lightning-cross (line) hazards need
// real vertical/linear geometry — the generic flat disc drops the vertical bolt,
// and a line hazard has no x/y/r at all so it would scale to NaN. Build a bolt
// group for a column, and a floor beam box for a strike line.
function makeLightningColumnObject() {
  const group = new THREE.Group();
  // Ground disc so the AOE footprint reads on the floor.
  const disc = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({
    color: 0x8dd4ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 2;
  disc.renderOrder = 2;
  disc.name = 'disc';
  group.add(disc);
  // Vertical bolt column.
  const column = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  column.name = 'column';
  group.add(column);
  return group;
}

function makeLightningLineObject() {
  const mesh = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({
    color: 0xbfe4ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  return mesh;
}

function makeChaosBurstObject() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({ color: 0xc86bff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.rotation.x = -Math.PI / 2;
  core.position.y = 2.2;
  core.name = 'core';
  group.add(core);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color: 0xd6aaff, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2.6;
  ring.name = 'ring';
  group.add(ring);
  for (let index = 0; index < 7; index += 1) {
    const bolt = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: index % 2 ? 0xd6aaff : 0xffe1ff, transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.AdditiveBlending }));
    bolt.name = `bolt-${index}`;
    group.add(bolt);
  }
  return group;
}

function makeHealingZoneObject() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({
    color: 0x50ff8c, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  core.rotation.x = -Math.PI / 2;
  core.position.y = 1.8;
  core.name = 'core';
  group.add(core);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({
    color: 0x35ff6f, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2.1;
  ring.name = 'ring';
  group.add(ring);
  for (let index = 0; index < 6; index += 1) {
    const plus = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({
      color: 0xcaffd8, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    plus.name = `plus-${index}`;
    group.add(plus);
  }
  return group;
}

function updateHealingZone(hazard, group) {
  const t = performance.now() * 0.004 + Number(hazard.ttl || 0);
  const pulse = 1 + Math.sin(t * 2.2) * 0.08;
  const radius = Math.max(20, Number(hazard.r || 62));
  group.position.set(hazard.x, 0, hazard.y);
  const core = group.getObjectByName('core');
  const ring = group.getObjectByName('ring');
  if (core) {
    core.scale.set(radius * 1.24 * pulse, radius * 1.24 * pulse, 1);
    core.material.opacity = 0.12 + Math.sin(t * 1.8) * 0.04;
  }
  if (ring) {
    ring.scale.set(radius * pulse, radius * pulse, 1);
    ring.material.opacity = 0.78 + Math.sin(t * 3.4) * 0.12;
  }
  for (let index = 0; index < 6; index += 1) {
    const plus = group.getObjectByName(`plus-${index}`);
    if (!plus) continue;
    const angle = t + index * (Math.PI * 2 / 6);
    const distance = radius * 0.7;
    plus.position.set(Math.cos(angle) * distance, 5, Math.sin(angle) * distance);
    plus.scale.set(8, 1.5, 1.5);
    plus.rotation.y = -angle;
  }
}

function syncHazards() {
  syncPool(
    pools.hazards,
    Neo.hazards,
    hazard => {
      if (hazard.kind === 'chaos_burst') return makeChaosBurstObject();
      if (hazard.kind === 'healing_zone') return makeHealingZoneObject();
      if (hazard.kind === 'lightning_column') return makeLightningColumnObject();
      if (hazard.kind === 'lightning_strike_line') return makeLightningLineObject();
      if (hazard.kind === 'explosive_trap') return makeExplosiveTrapObject();
      if (BAKED_2D_HAZARD_KINDS.has(hazard.kind)) {
        if (FLAT_BAKED_HAZARD_KINDS.has(hazard.kind)) {
          const plate = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
          plate.rotation.x = -Math.PI / 2;
          plate.renderOrder = 2;
          plate.name = 'bakedHazardFlat';
          return plate;
        }
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        sprite.center.set(0.5, 0.5);
        sprite.name = 'bakedHazard';
        return sprite;
      }
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
      if (mesh.name === 'bakedHazard' || mesh.name === 'bakedHazardFlat') {
        const worldSize = bakedHazardWorldSize(hazard);
        rasterizeHazard2D(ensureBakeSurface(mesh, worldSize), hazard, worldSize, {
          top: -worldSize / 2,
          height: worldSize,
          offsetY: 0,
        });
        mesh.position.set(hazard.x, mesh.name === 'bakedHazardFlat' ? 2 : worldSize / 2, hazard.y);
        return;
      }
      if (hazard.kind === 'chaos_burst') {
        updateChaosBurst(hazard, mesh);
        return;
      }
      if (hazard.kind === 'healing_zone') {
        updateHealingZone(hazard, mesh);
        return;
      }
      if (hazard.kind === 'lightning_column') {
        updateLightningColumn(hazard, mesh);
        return;
      }
      if (hazard.kind === 'lightning_strike_line') {
        updateLightningLine(hazard, mesh);
        return;
      }
      if (hazard.kind === 'explosive_trap') {
        updateExplosiveTrap(hazard, mesh);
        return;
      }
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

function updateChaosBurst(hazard, group) {
  const radius = Math.max(20, Number(hazard.r || 180));
  const t = performance.now() * 0.005 + hazard.x * 0.01;
  const flicker = 0.75 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23.7) * 0.1;
  const pulse = 1 + Math.sin(t * 2.4) * 0.06;
  const fade = hazard.ttl == null ? 1 : Math.max(0, Math.min(1, Number(hazard.ttl || 0) / 0.35));
  group.position.set(hazard.x, 0, hazard.y);
  const core = group.getObjectByName('core');
  const ring = group.getObjectByName('ring');
  if (core) {
    core.scale.set(radius, radius, 1);
    core.material.opacity = 0.2 * flicker * fade;
  }
  if (ring) {
    ring.scale.set(radius * pulse, radius * pulse, 1);
    ring.material.opacity = (0.55 + flicker * 0.3) * fade;
  }
  for (let index = 0; index < 7; index += 1) {
    const bolt = group.getObjectByName(`bolt-${index}`);
    if (!bolt) continue;
    const angle = t * 1.6 + index * (Math.PI * 2 / 7);
    const inner = radius * 0.3;
    const outer = radius * (0.85 + 0.1 * Math.sin(t * 3.1 + index));
    const length = outer - inner;
    bolt.scale.set(length, 3.2, 3.2);
    bolt.position.set(Math.cos(angle) * (inner + length / 2), 8 + Math.sin(t * 7 + index) * 2, Math.sin(angle) * (inner + length / 2));
    bolt.rotation.y = -angle;
    bolt.material.opacity = 0.78 * flicker * fade;
  }
}

function updateLightningColumn(hazard, group) {
  const diameter = (hazard.r || 24) * 2;
  group.position.set(hazard.x, 0, hazard.y);
  const disc = group.getObjectByName('disc');
  const column = group.getObjectByName('column');
  // Flicker in sync with the strike tick so the bolt pulses when it damages.
  const flicker = 0.55 + Math.abs(Math.sin(performance.now() / 90 + (hazard.x + hazard.y) * 0.01)) * 0.35;
  // Fade out over the last stretch of the hazard's life.
  const fade = hazard.ttl != null ? Math.min(1, Math.max(0, hazard.ttl / 0.6)) : 1;
  if (disc) {
    disc.scale.set(diameter, diameter, 1);
    disc.material.opacity = 0.35 * fade;
  }
  if (column) {
    const width = Math.max(10, diameter * 0.35);
    column.scale.set(width, LIGHTNING_COLUMN_HEIGHT, width);
    column.position.y = LIGHTNING_COLUMN_HEIGHT / 2 + 2;
    column.material.opacity = 0.7 * flicker * fade;
  }
}

function updateLightningLine(hazard, mesh) {
  const x1 = hazard.x1 ?? hazard.x ?? 0;
  const z1 = hazard.y1 ?? hazard.y ?? 0;
  const x2 = hazard.x2 ?? x1;
  const z2 = hazard.y2 ?? z1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  const width = Math.max(8, (hazard.r || 26) * 2);
  // Warn phase draws a thin dim guide; the live strike is a bright fat bolt.
  const warning = Number(hazard.warn || 0) > 0 && Number(hazard.warnTick || 0) < Number(hazard.warn || 0);
  const flicker = 0.5 + Math.abs(Math.sin(performance.now() / 70)) * 0.5;
  mesh.scale.set(length, warning ? 4 : width * 0.6, warning ? 4 : width);
  mesh.position.set((x1 + x2) / 2, BEAM_Y, (z1 + z2) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.material.opacity = warning ? 0.4 : 0.85 * flicker;
}

function getShopOfferTexture(offer, state) {
  const signature = [offer.type, offer.key, offer.cost, state.blocked ? 1 : 0, state.affordable ? 1 : 0].join('|');
  const cached = shopOfferTextureCache.get(signature);
  if (cached) return cached;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = 64;
  canvasEl.height = 76;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = state.blocked ? 'rgba(36,18,24,0.95)' : 'rgba(0,30,44,0.95)';
  g.fillRect(6, 4, 52, 52);
  g.strokeStyle = state.blocked ? '#ff8b98' : !state.affordable ? '#6b7480' : '#ffd966';
  g.lineWidth = 2;
  g.strokeRect(7, 5, 50, 50);
  const icon = offer.type === 'item' ? window.NeoNykeIconDefs?.items?.[offer.key]
    : offer.type === 'move' ? window.NeoNykeIconDefs?.moves?.[offer.key]
      : offer.type === 'weapon' ? window.NeoNykeIconDefs?.weapons?.[offer.key]
        : offer.type === 'potion' ? window.NeoNykeIconDefs?.pickups?.potion : null;
  const iconColor = state.blocked ? '#ff8b98' : icon?.color || (offer.type === 'item' ? '#a857ff' : offer.type === 'potion' ? '#35ff6f' : '#8fd2ff');
  if (Array.isArray(icon?.pixels)) {
    g.fillStyle = iconColor;
    icon.pixels.forEach(([x, y]) => g.fillRect(16 + x * 4, 10 + y * 4, 4, 4));
  } else {
    g.fillStyle = iconColor;
    g.beginPath(); g.arc(32, 28, 10, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = state.blocked ? '#ffccd2' : !state.affordable ? '#c4cdd6' : '#fff';
  g.font = 'bold 11px system-ui';
  g.textAlign = 'center';
  g.fillText(String(offer.cost), 32, 70);
  const texture = makeCanvasTexture(canvasEl);
  shopOfferTextureCache.set(signature, texture);
  return texture;
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
      const card = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false }));
      card.center.set(0.5, 0);
      card.name = 'card';
      card.position.y = 0.8;
      card.scale.set(64, 76, 1);
      group.add(card);
      return group;
    },
    (offer, group) => {
      group.visible = !offer.bought;
      group.position.set(offer.x, 4, offer.y);
      if (offer.bought) return;
      const state = {
        blocked: offer.type === 'item' && !!Neo.isChallengeActive?.('no_items'),
        affordable: !!Neo.player && Neo.player.coins >= offer.cost,
      };
      const texture = getShopOfferTexture(offer, state);
      const card = group.getObjectByName('card');
      if (card && card.material.map !== texture) {
        card.material.map = texture;
        card.material.needsUpdate = true;
      }
      const glow = group.getObjectByName('glow');
      if (glow) glow.material.color.set(state.blocked ? 0xff6677 : state.affordable ? 0xffd97a : 0x6b7480);
    },
  );
}

function syncParticles() {
  syncPool(
    pools.particles,
    Neo.particles,
    particle => {
      if (particle.line) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        line.userData.kind = 'line';
        return line;
      }
      if (particle.shockwave) {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.88, 1, 40),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.kind = 'shockwave';
        mesh.userData.maxLife = Math.max(0.01, Number(particle.maxLife || particle.life || 0.5));
        return mesh;
      }
      if (particle.ring) {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1, 40),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData.maxLife = Math.max(0.01, Number(particle.life || 0.5));
        return mesh;
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      sprite.center.set(0.5, 0.5);
      if (!particle.text) sprite.material.blending = THREE.AdditiveBlending;
      sprite.userData.maxLife = Math.max(0.01, Number(particle.maxLife || particle.life || 0.5));
      return sprite;
    },
    (particle, sprite) => {
      const life = Math.max(0, Number(particle.life || 0));
      if (particle.line && sprite.isLine) {
        const line = particle.line;
        const positions = sprite.geometry.getAttribute('position');
        positions.setXYZ(0, line.x1 || 0, 5, line.y1 || 0);
        positions.setXYZ(1, line.x2 || 0, 5, line.y2 || 0);
        positions.needsUpdate = true;
        sprite.material.color.set(particle.c || '#dfe8ff');
        sprite.material.opacity = Math.min(1, life * 3.4);
        return;
      }
      if (particle.shockwave && sprite.isMesh) {
        const maxLife = Math.max(0.01, Number(sprite.userData.maxLife || life));
        const progress = Math.max(0, Math.min(1, 1 - life / maxLife));
        const radius = Number(particle.radius || 48);
        const waveRadius = radius * (0.22 + progress * 0.92);
        sprite.material.color.set(particle.c || '#ff66cc');
        sprite.material.opacity = (1 - progress) * 0.8;
        sprite.scale.set(waveRadius * 2, waveRadius * 2, 1);
        sprite.position.set(particle.x, 2.2, particle.y);
        return;
      }
      if (particle.ring && sprite.isMesh) {
        const radius = Math.max(2, Number(particle.ring || 2));
        const alpha = Math.max(0, Math.min(1, life / Math.max(0.01, Number(sprite.userData.maxLife || life))));
        sprite.material.color.set(particle.c || '#ffffff');
        sprite.material.opacity = alpha * 0.82;
        sprite.scale.set(radius * 2, radius * 2, 1);
        sprite.position.set(particle.x, 2.5, particle.y);
        return;
      }
      sprite.material.opacity = Math.min(1, life * 2.2);
      if (particle.text) {
        const entry = getTextTexture(String(particle.text), particle.c || '#ffffff');
        if (sprite.material.map !== entry.texture) {
          sprite.material.map = entry.texture;
          sprite.material.needsUpdate = true;
          sprite.scale.set(entry.w * 0.95, entry.h * 0.95, 1);
        }
        sprite.position.set(particle.x, 46 + (1 - life) * 26, particle.y);
      } else if (particle.silhouette) {
        const sil = particle.silhouette;
        const texture = getSpriteTexture(sil.spriteKey, sil.facing < 0);
        const progress = Math.max(0, Math.min(1, 1 - life / Math.max(0.01, Number(sprite.userData.maxLife || life))));
        if (texture && sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        const size = Number(sil.size || 40);
        sprite.material.color.set(particle.c || '#b99cff');
        sprite.material.opacity = (1 - progress) * 0.65;
        sprite.scale.set(size, size, 1);
        sprite.position.set(particle.x, 1.2, particle.y);
      } else {
        const texture = getGlowTexture(particle.c || '#ffffff');
        if (sprite.material.map !== texture) {
          sprite.material.map = texture;
          sprite.material.needsUpdate = true;
        }
        const progress = Math.max(0, Math.min(1, 1 - life / Math.max(0.01, Number(sprite.userData.maxLife || life))));
        const size = Number(particle.size || (particle.blood ? 3 : particle.spark ? 2.2 : 3));
        const scale = particle.impact ? size * (1 + progress * 1.4) * 2.5
          : particle.spark ? size * 3.6
            : particle.smoke ? size * 2.4
              : particle.blood ? size * 2.1
                : 9;
        sprite.material.opacity = particle.smoke
          ? Math.min(0.78, Math.max(0.16, life))
          : particle.impact ? (1 - progress) * 0.85
            : Math.min(1, life * 2.2);
        sprite.scale.set(scale, scale, 1);
        sprite.position.set(particle.x, particle.smoke || particle.blood ? 3 : 14, particle.y);
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
      const group = new THREE.Group();
      const pool = new THREE.Mesh(unitCircle, new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false,
      }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.7;
      pool.name = 'blood-pool';
      group.add(pool);
      const mesh = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
        color: 0x9aa0ad,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = 'corpse';
      mesh.renderOrder = 3;
      group.add(mesh);
      return group;
    },
    (body, group) => {
      const mesh = group.getObjectByName('corpse');
      const pool = group.getObjectByName('blood-pool');
      if (!mesh) return;
      const size = (body.r || 12) * SPRITE_SIZE_MULT;
      const age = Number(body.age || 0);
      const fadeStart = Neo.CORPSE_FADE_START || 4.5;
      const lifetime = Neo.CORPSE_LIFETIME || 11;
      const fade = age < fadeStart ? 1 : Math.max(0, 1 - (age - fadeStart) / Math.max(0.1, lifetime - fadeStart));
      const fallTime = Math.max(0.01, Number(body.fallTime || Neo.CORPSE_FALL_TIME || 0.5));
      const fallEase = 1 - (1 - Math.min(1, age / fallTime)) ** 3;
      const lift = Math.max(0, Number(body.z || 0));
      const velocity = Math.hypot(Number(body.vx || 0), Number(body.vy || 0)) + Math.abs(Number(body.vz || 0)) * 0.35;
      const impactStretch = Math.max(0, Math.min(1, lift / 140 + velocity / 240));
      const squash = Math.max(0.5, 1 - 0.46 * fallEase - impactStretch * 0.18);
      const stretch = (1 + 0.05 * fallEase) * (1 + impactStretch * 0.1);
      const rotation = Number(body.angle || 0) + Number(body.fallAngle || 0) * fallEase + Number(body.angularOffset || 0);
      group.position.set(body.x, 0, body.y);
      group.rotation.y = -rotation;
      mesh.position.y = 1.5 + lift;
      mesh.scale.set(size * stretch * (Number(body.face || 1) < 0 ? -1 : 1), size * squash, 1);
      mesh.material.opacity = fade;
      mesh.material.color.set(0xffffff);
      // A launched corpse visibly pitches while airborne, then settles flat
      // into the same fallen pose as the top-down ragdoll.
      mesh.rotation.x = -Math.PI / 2 + Math.min(0.72, lift / 120) * (Number(body.vz || 0) >= 0 ? 1 : -1);
      if (pool) {
        const poolScale = Math.max(0, Math.min(1, age / 1.2)) * fade;
        const leavesBlood = body.leavesBloodPool !== false && body.bloodColor !== '' && !['golem', 'bulk_golem'].includes(body.type);
        pool.visible = leavesBlood;
        if (leavesBlood) {
          pool.material.color.set(body.type === 'god' ? 0xe0dcff : 0x5e0010);
          pool.material.opacity = (body.type === 'god' ? 0.2 : 0.32) * poolScale;
          pool.scale.set(size * (0.7 + poolScale * 0.28), size * (0.16 + poolScale * 0.1), 1);
        }
      }
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

function addBeamSegment(x1, z1, x2, z2, color, width = 6, opacity = 0.88) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const length = Math.hypot(dx, dz);
  if (length < 2) return;
  const mesh = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  mesh.scale.set(length, width, width);
  mesh.position.set((x1 + x2) / 2, BEAM_Y, (z1 + z2) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  scene.add(mesh);
  beamMeshes.push(mesh);
}

function getPlayerBeamVisual(effect = null) {
  const p = effect?.player || Neo.player;
  if (!p || typeof Neo.buildRicochetBeamPath !== 'function') return null;
  const beamWidthMultiplier = Number(Neo.getItemStats?.()?.beamWidthMultiplier || 1);

  const laserActive = effect ? !!effect.laserActive : !!Neo.laserActive;
  if (!laserActive && Neo.getEquippedWeapon?.() === 'lazer_glasses' && Number(p.weaponBeamTime || 0) > 0) {
    const angle = Neo.angleToMouse?.() ?? 0;
    return {
      color: '#cda8ff',
      width: 5 * beamWidthMultiplier,
      paths: [-0.2, 0.2].map(offset => Neo.buildRicochetBeamPath(
        p.x, p.y, angle + offset, 430, Neo.LAZER_GLASSES_BOUNCES,
      )),
    };
  }

  if (!laserActive) return null;
  const move = effect?.equippedLaser || Neo.getEquippedMove?.('laser');
  const mode = effect?.laserMode || Neo.laserMode;
  const thornBeams = mode === 'thorn_blood_beams';
  const holyEyeBeams = mode === 'holy_eye_beams';
  const angle = Number(effect?.laserAngle ?? Neo.laserAngle ?? 0);
  const fan = thornBeams ? [-0.32, -0.11, 0.11, 0.32] : holyEyeBeams ? [-0.07, 0.07] : [0];
  const activePaths = effect?.activeBeamPaths || Neo.activeBeamPaths;
  const paths = Array.isArray(activePaths) && activePaths.length
    ? activePaths
    : fan.map(offset => Neo.buildRicochetBeamPath(
      p.x,
      p.y,
      angle + offset,
      Neo.getPlayerBeamRange?.(mode, move) ?? 430,
      Neo.getPlayerBeamBounceCount?.(mode) ?? 0,
    ));
  const turtleWave = mode === 'turtle_wave';
  const loveBeam = effect ? !!effect.loveBeamCasting : !!Neo.loveBeamCasting;
  const wizardBeam = move === 'wizard_lazer';
  const mooggyBeam = move === 'mooggy_blood_beam';
  return {
    color: turtleWave ? '#74f5ff'
      : loveBeam ? '#ff9ed6'
        : mode === 'god_sweep' ? '#ffffff'
          : wizardBeam ? '#a64bff'
            : mooggyBeam ? '#ff2f57'
              : thornBeams ? '#ff3b5c'
                : holyEyeBeams ? '#ffcc33'
                  : '#ff00aa',
    width: (mode === 'god_sweep' ? 16
      : turtleWave ? 18
        : loveBeam ? 10
          : wizardBeam ? 22
            : mooggyBeam ? 11
              : thornBeams ? 6
                : holyEyeBeams ? 7
                  : 8) * beamWidthMultiplier,
    turtleWave,
    paths,
  };
}

function getEnemyBeamVisual(enemy) {
  const isPartition = enemy.type === 'god' && enemy.state === 'godPartition';
  const isDevilGiantLaser = enemy.type === 'handsome_devil' && enemy.state === 'devilGiantLaser';
  const range = enemy.type === 'god' ? (enemy.beamRange || 620)
    : enemy.type === 'rival' ? (enemy.rivalBeamRange || 430)
      : enemy.type === 'mooggy' ? 520
        : isDevilGiantLaser ? 900
          : enemy.type === 'handsome_devil' ? (enemy.beamRange || 560)
            : enemy.type === 'bowman_bane' ? 480 : 430;
  const angles = isPartition
    ? enemy.partitionAngles || []
    : enemy.type === 'rival' && Array.isArray(enemy.rivalBeamFan)
      ? enemy.rivalBeamFan.map(offset => enemy.beamAngle + offset)
      : [enemy.beamAngle];
  return {
    color: isPartition ? '#fff1a8' : enemy.type === 'god' ? '#ffffff'
      : enemy.type === 'rival' ? (enemy.rivalBeamColor || '#ff00aa')
        : enemy.type === 'mooggy' || enemy.type === 'handsome_devil' ? '#ff3348'
          : enemy.type === 'bowman_bane' ? '#8dd4ff' : '#aa66ff',
    width: isPartition ? 14 : enemy.type === 'god' && enemy.state === 'godSweep' ? 18
      : enemy.type === 'god' ? 10 : enemy.type === 'rival' ? (enemy.rivalBeamWidth || 8)
        : enemy.type === 'mooggy' ? 6 : isDevilGiantLaser ? 22
          : enemy.type === 'handsome_devil' ? 9 : 8,
    paths: angles.map(angle => Neo.buildRicochetBeamPath(
      enemy.x,
      enemy.y,
      angle,
      isPartition ? Math.hypot(Neo.ROOM_W, Neo.ROOM_H) * 1.15 : range,
      isPartition ? 0 : (Neo.getEnemyBeamBounceCount?.(enemy) ?? 0),
    )),
  };
}

function syncBeams() {
  clearBeams();
  const presentedEffects = Neo.activePlayerEffects;
  const playerBeams = Array.isArray(presentedEffects)
    ? presentedEffects.map(effect => getPlayerBeamVisual(effect)).filter(Boolean)
    : [getPlayerBeamVisual()].filter(Boolean);
  playerBeams.forEach(playerBeam => {
    const color = new THREE.Color(playerBeam.color).getHex();
    const wavePulse = 0.85 + Math.sin(performance.now() / 85) * 0.15;
    playerBeam.paths.forEach(path => path.forEach(seg => {
      // Turtle Wave gets the same wide cyan aura + whitewater core as 2D,
      // rather than relying on the normal thin beam box alone.
      if (playerBeam.turtleWave) {
        addBeamSegment(seg.x1, seg.y1, seg.x2, seg.y2, 0x74f5ff, playerBeam.width * 1.7 * wavePulse, 0.28);
        addBeamSegment(seg.x1, seg.y1, seg.x2, seg.y2, 0xa8fbff, playerBeam.width * 0.42, 0.96);
      }
      addBeamSegment(seg.x1, seg.y1, seg.x2, seg.y2, color, playerBeam.width, playerBeam.turtleWave ? 0.78 : 0.88);
    }));
  });
  // Enemy and rival beams use the same range, fan and ricochet path used by
  // combat and the top-down renderer — visual walls can never disagree with
  // what can damage the player.
  (Neo.enemies || []).forEach(enemy => {
    if (!enemy || Number(enemy.beamTime || 0) <= 0) return;
    const beam = getEnemyBeamVisual(enemy);
    const color = new THREE.Color(beam.color).getHex();
    beam.paths.forEach(path => path.forEach(seg => addBeamSegment(
      seg.x1, seg.y1, seg.x2, seg.y2, color, beam.width,
    )));
  });
}

// ---------------------------------------------------------------------------
// Titan Hammer — Sarge's smash summon. A bespoke Neo.titanHammer global (not a
// projectile/hazard/enemy), so it has no generic pool. We re-bake the 2D
// drawTitanHammer art each active frame into one reused canvas — it animates
// (hover dip, slam, pip states, fade) — and billboard it at the hammer's spot.
// ---------------------------------------------------------------------------
let titanHammerSprite = null;
let titanHammerCanvas = null;
let titanHammerTexture = null;
let titanHammerBakeHalf = 0; // canvas half-size (world units), sized to the live AOE

function syncTitanHammer() {
  const hammer = Neo.titanHammer;
  if (!hammer || typeof Neo.drawTitanHammer !== 'function') {
    if (titanHammerSprite) titanHammerSprite.visible = false;
    return;
  }

  // Size the bake canvas to enclose the AOE ring plus the pips/head that draw
  // above the spot; grows with big-AOE builds so nothing clips.
  const half = Math.ceil((hammer.radius || 110) + 56);
  if (!titanHammerCanvas || half > titanHammerBakeHalf) {
    titanHammerBakeHalf = half;
    if (!titanHammerCanvas) titanHammerCanvas = document.createElement('canvas');
    titanHammerCanvas.width = half * 2;
    titanHammerCanvas.height = half * 2;
    titanHammerTexture?.dispose();
    titanHammerTexture = makeCanvasTexture(titanHammerCanvas);
    if (!titanHammerSprite) {
      titanHammerSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: titanHammerTexture, transparent: true, alphaTest: 0.02, depthWrite: false,
      }));
      titanHammerSprite.center.set(0.5, 0.5);
      scene.add(titanHammerSprite);
    } else {
      titanHammerSprite.material.map = titanHammerTexture;
      titanHammerSprite.material.needsUpdate = true;
    }
  }
  titanHammerSprite.visible = true;

  // Re-bake: translate so the hammer's world (x,y) lands at canvas center, then
  // let drawTitanHammer paint at its real world coords into our offscreen ctx.
  const g = titanHammerCanvas.getContext('2d');
  g.clearRect(0, 0, titanHammerCanvas.width, titanHammerCanvas.height);
  g.imageSmoothingEnabled = false;
  const realCtx = Neo.ctx;
  g.save();
  g.translate(titanHammerBakeHalf - hammer.x, titanHammerBakeHalf - hammer.y);
  try {
    Neo.ctx = g;
    Neo.drawTitanHammer();
  } catch { /* draw failed; leave whatever rendered */ }
  Neo.ctx = realCtx;
  g.restore();
  titanHammerTexture.needsUpdate = true;

  // Billboard sized to the baked canvas; sit it at torso height so the head
  // hovers above the floor like the 2D art (which draws the head above the spot).
  const size = titanHammerBakeHalf * 2;
  titanHammerSprite.scale.set(size, size, 1);
  titanHammerSprite.position.set(hammer.x, BEAM_Y + 12, hammer.y);
}

// Blade Justice is a live three-sword formation, not an ordinary projectile.
// Each sword gets its own billboard in 3D. A single top-down texture bake looks
// correct from above but can disappear edge-on in first person, which is why
// the former implementation made the move appear not to spawn at all.
let justiceBladeTexture = null;

function getJusticeBladeTexture() {
  if (justiceBladeTexture) return justiceBladeTexture;
  const canvasEl = document.createElement('canvas');
  canvasEl.width = 96;
  canvasEl.height = 36;
  const g = canvasEl.getContext('2d');
  g.imageSmoothingEnabled = false;
  const cx = 48;
  const cy = 18;
  const len = 38;
  const width = 12;
  g.shadowColor = '#fff6a3';
  g.shadowBlur = 10;
  g.fillStyle = '#fff6a3';
  g.strokeStyle = '#ffd86a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + len, cy);
  g.lineTo(cx - len * 0.4, cy - width * 0.5);
  g.lineTo(cx - len * 0.62, cy);
  g.lineTo(cx - len * 0.4, cy + width * 0.5);
  g.closePath();
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(cx + len * 0.86, cy);
  g.lineTo(cx - len * 0.2, cy - width * 0.16);
  g.lineTo(cx - len * 0.4, cy);
  g.lineTo(cx - len * 0.2, cy + width * 0.16);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd86a';
  g.fillRect(cx - len * 0.62, cy - width * 0.42, width * 0.32, width * 0.84);
  justiceBladeTexture = makeCanvasTexture(canvasEl);
  return justiceBladeTexture;
}

function syncJusticeBlades() {
  const blades = [
    ...(Array.isArray(Neo.justiceBlades) ? Neo.justiceBlades : []),
    ...(Neo.enemies || []).flatMap(enemy => Array.isArray(enemy?.rivalJusticeBlades) ? enemy.rivalJusticeBlades : []),
  ];
  syncPool(
    pools.justiceBlades,
    blades,
    () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getJusticeBladeTexture(), transparent: true, alphaTest: 0.02, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      sprite.center.set(0.5, 0.5);
      sprite.renderOrder = 5;
      return sprite;
    },
    (blade, sprite) => {
      const alpha = Math.max(0, Math.min(1, Number(blade.life || 0) / 0.4));
      const radius = Number(blade.radius || 16);
      const length = radius * 2.6;
      const width = radius * 0.9;
      sprite.position.set(blade.x, BEAM_Y + 10, blade.y);
      sprite.scale.set(length * 2, width * 2, 1);
      // The simulation's live swing angle drives the visible sword orientation,
      // so the three separate blades keep their authored formation and sweep.
      sprite.material.rotation = -Number(blade.angle || 0);
      sprite.material.opacity = alpha;
    },
  );
}

// ---------------------------------------------------------------------------
// Camera + screen projection
// ---------------------------------------------------------------------------
const CAMERA_HEIGHT = 580;
const CAMERA_BACK = 430;
const FP_EYE_HEIGHT = 34;
// Below this the residual shake is sub-pixel on screen but still re-randomises
// the camera every frame; treat it as zero so the view actually comes to rest.
const SHAKE_EPSILON = 0.05;
// Stable, time-based shake axes. Camera code used to pull new RNG values every
// render frame, producing high-frequency buzzing and refresh-rate-dependent
// motion in both first-person and overhead 3D views.
function getCameraShakeAxes(nowMs) {
  const phase = Number(nowMs || 0) * 0.018;
  return {
    x: Math.sin(phase) * 0.72 + Math.sin(phase * 1.73 + 0.8) * 0.28,
    y: Math.cos(phase * 1.19 + 0.35) * 0.7 + Math.sin(phase * 1.91) * 0.3,
  };
}
// The simulation advances on a fixed 20 Hz tick while we render at display rate,
// so Neo.player.x/y only changes every ~50ms and the camera would visibly
// stair-step toward it. Smoothing the *focus point* over render time turns those
// steps back into continuous motion. Time-based so the feel is identical at 60,
// 120 or 144Hz (a fixed per-frame lerp factor is faster on faster displays).
const CAMERA_FOCUS_SMOOTH_HZ = 12;
const CAMERA_FOLLOW_SMOOTH_HZ = 9;
const camFocus = { x: 0, z: 0, valid: false };
let lastCameraSyncAt = 0;
const camTarget = new THREE.Vector3();
const mouseAimNdc = new THREE.Vector2();
const mouseAimRay = new THREE.Raycaster();

// Camera mode: 'third' (follow cam, the default) or 'fp' (first person).
// Only an explicit stored 'fp' opts into first person, so players who turn 3D
// on land in the follow cam rather than being dropped straight into FP.
let cameraMode = 'third';
try { cameraMode = localStorage.getItem(CAMERA_MODE_STORE_KEY) === 'fp' ? 'fp' : 'third'; } catch { /* private mode */ }
let fpYaw = 0;
let fpPitch = -0.08;

// True when first-person is actually driving the view this frame — the aim and
// movement hooks in update.js key off this so 2D / third-person behavior is
// completely untouched otherwise.
function isFirstPersonActive() {
  return ready && Neo.render3D && cameraMode === 'fp'
    && !Neo.isSplitScreen?.() && !window.NeoTouch?.active;
}

// The old 2D aim conversion treats canvas pixels as world pixels. That is
// correct for the top-down camera but points beside the cursor in perspective
// third person. Intersect the current 3D camera ray with the floor instead so
// the shared simulation receives the same intended world target the player is
// actually pointing at.
function projectCanvasMouseToWorld(canvasX, canvasY) {
  if (!ready || !Neo.render3D || cameraMode !== 'third' || Neo.isSplitScreen?.() || !camera || !Neo.canvas) return null;
  const width = Math.max(1, Number(Neo.canvas.width || 1));
  const height = Math.max(1, Number(Neo.canvas.height || 1));
  mouseAimNdc.set((Number(canvasX || 0) / width) * 2 - 1, 1 - (Number(canvasY || 0) / height) * 2);
  mouseAimRay.setFromCamera(mouseAimNdc, camera);
  const directionY = mouseAimRay.ray.direction.y;
  if (Math.abs(directionY) < 1e-5) return null;
  const distance = -mouseAimRay.ray.origin.y / directionY;
  if (!(distance > 0) || !Number.isFinite(distance)) return null;
  return {
    x: mouseAimRay.ray.origin.x + mouseAimRay.ray.direction.x * distance,
    y: mouseAimRay.ray.origin.z + mouseAimRay.ray.direction.z * distance,
  };
}

function setCameraMode(mode) {
  cameraMode = mode === 'fp' ? 'fp' : 'third';
  try { localStorage.setItem(CAMERA_MODE_STORE_KEY, cameraMode); } catch { /* private mode */ }
  if (cameraMode !== 'fp' && document.pointerLockElement) document.exitPointerLock?.();
}

const POINTER_LOCK_UI_SELECTORS = [
  '#shopPanel', '#invPanel', '#anvilPanel', '#specialRoomPanel',
  '#wizardPawModal', '#extraBatteryModal', '#scrollControlModal', '#voucherModal',
  '#settingsModal', '#pause', '#itemCinematic', '#tutorialOverlay', '#dialogueOverlay',
  '#birthdayModal', '#sandboxPanel', '#sandboxPanelBackdrop', '#runHistoryPanel',
];

function isActuallyVisible(element) {
  if (!element || !element.isConnected) return false;
  // Several overlays hide only their parent (not every descendant). In
  // particular #sandboxPanelBackdrop remains `display: block` while its
  // #sandboxPanel parent is `.hidden`; checking the node alone made ordinary
  // gameplay falsely appear to have a blocking UI open.
  if (element.closest('.hidden, [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function hasPointerLockBlockingUi() {
  if (Neo.isOverlayBlockingInput?.() || Neo.uiController?.isDialogueOpen?.()) return true;
  return POINTER_LOCK_UI_SELECTORS.some(selector => isActuallyVisible(document.querySelector(selector)));
}

function syncPointerLock() {
  const wantLock = isFirstPersonActive() && Neo.gameState === 'play' && !hasPointerLockBlockingUi();
  if (!wantLock && document.pointerLockElement === Neo.canvas) {
    pointerLockReleasedByGame = true;
    document.exitPointerLock?.();
  }
}

// Mouse-look while pointer-locked; gamepad right stick also turns the view.
// Use a capture-phase document listener: pointer-lock movement is dispatched
// at document level in some browsers and can otherwise miss a window listener
// when UI code stops a bubbling mouse event.
let pointerLockRequested = false;
let pointerLockPendingTimer = null;
// Set when the game exits pointer lock on purpose, so the pointerlockchange
// handler can tell a deliberate release from the player pressing Esc.
let pointerLockReleasedByGame = false;

function clearPointerLockPending() {
  if (pointerLockPendingTimer != null) window.clearTimeout(pointerLockPendingTimer);
  pointerLockPendingTimer = null;
}

document.addEventListener('pointerlockchange', () => {
  const wasLocked = pointerLockRequested;
  pointerLockRequested = document.pointerLockElement === Neo?.canvas;
  clearPointerLockPending();
  // Esc while pointer-locked is consumed by the browser to exit the lock, so the
  // keydown never reaches the pause handler in js/ui/panels.js and the player has
  // to press it a second time. Treat that unlock as the pause request — but only
  // when the game itself did not ask for it. syncPointerLock() and the resume
  // click both release the lock deliberately, and pausing on those would reopen
  // the pause menu the player just dismissed.
  if (wasLocked && !pointerLockRequested && !pointerLockReleasedByGame
    && isFirstPersonActive() && Neo.gameState === 'play') {
    Neo.pauseGame?.();
  }
  pointerLockReleasedByGame = false;
});
document.addEventListener('pointerlockerror', () => {
  pointerLockRequested = false;
  clearPointerLockPending();
});
document.addEventListener('mousemove', event => {
  if (!isFirstPersonActive() || document.pointerLockElement !== Neo.canvas) return;
  const mx = event.movementX || 0;
  const my = event.movementY || 0;
  // Chrome can emit one huge movement as it transitions into lock; reject
  // only that implausible delta, never ordinary first input from the player.
  if (Math.abs(mx) > 200 || Math.abs(my) > 200) return;
  fpYaw += mx * 0.0026;
  fpPitch = Math.max(-0.55, Math.min(0.45, fpPitch - my * 0.0022));
}, true);

function requestGameplayPointerLock(event) {
  if (event.button != null && event.button !== 0) return;
  if (!isFirstPersonActive() || Neo.gameState !== 'play' || hasPointerLockBlockingUi()) return;
  const canvas = Neo.canvas;
  if (!canvas) return;
  // In 3D the transparent HUD can be the event target even when the player
  // clearly clicked the world. Accept any click inside the gameplay viewport,
  // but never steal a click from a real control or an open panel.
  const rect = canvas.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('button, input, select, textarea, a, [contenteditable="true"], [role="button"], .panel-shell:not(.hidden), .overlay:not(.hidden), [data-no-pointer-lock]')) return;
  if (document.pointerLockElement !== Neo.canvas) {
    pointerLockRequested = true;
    clearPointerLockPending();
    // A rejected/ignored request does not reliably fire pointerlockerror in
    // every browser. Clear the pending flag shortly after it fails so the player
    // is never left with a permanently "locking" camera.
    pointerLockPendingTimer = window.setTimeout(() => {
      if (document.pointerLockElement !== Neo.canvas) pointerLockRequested = false;
      pointerLockPendingTimer = null;
    }, 750);
    try {
      const request = canvas.requestPointerLock?.();
      request?.catch?.(() => {
        pointerLockRequested = false;
        clearPointerLockPending();
      });
    } catch {
      pointerLockRequested = false;
      clearPointerLockPending();
    }
  }
}
// Capture at document level so transparent HUD layers and their event handlers
// cannot prevent the trusted world-click gesture from reaching pointer lock.
document.addEventListener('pointerdown', requestGameplayPointerLock, true);

function syncCamera() {
  const p = Neo.player;
  // FPS-appropriate field of view in first person; classic follow cam otherwise.
  const targetFov = isFirstPersonActive() ? 68 : 50;
  if (camera.fov !== targetFov) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  const anim = Neo.gameState === 'dying' ? Neo.playerDeathAnim : null;
  const rawFocusX = anim ? anim.x : (p?.x ?? Neo.ROOM_W / 2);
  const rawFocusZ = anim ? anim.y : (p?.y ?? Neo.ROOM_H / 2);
  // Render-time delta (not simulation dt): this smoothing exists precisely to
  // bridge render frames between simulation ticks. Clamped so a stall or a
  // backgrounded tab doesn't produce one huge catch-up jump.
  const now = performance.now();
  const frameDt = lastCameraSyncAt ? Math.min(0.1, Math.max(0, (now - lastCameraSyncAt) / 1000)) : 0;
  lastCameraSyncAt = now;
  // Snap on the first frame and on hard cuts (room change/respawn) rather than
  // sliding the camera across the level.
  if (!camFocus.valid || Math.hypot(rawFocusX - camFocus.x, rawFocusZ - camFocus.z) > 400) {
    camFocus.x = rawFocusX;
    camFocus.z = rawFocusZ;
    camFocus.valid = true;
  } else if (frameDt > 0) {
    // First person sits at eye level with no follow lerp behind it, so it needs
    // to track tighter than the third-person cam or aiming feels laggy.
    const hz = isFirstPersonActive() ? CAMERA_FOCUS_SMOOTH_HZ * 2.2 : CAMERA_FOCUS_SMOOTH_HZ;
    const k = 1 - Math.exp(-hz * frameDt);
    camFocus.x += (rawFocusX - camFocus.x) * k;
    camFocus.z += (rawFocusZ - camFocus.z) * k;
  }
  if (isFirstPersonActive() && p) {
    const gp = window.NeoGamepad?.[0];
    if (gp?.active && gp.hasAim && Math.hypot(gp.aimX || 0, gp.aimY || 0) > 0.25) {
      fpYaw = Math.atan2(gp.aimY, gp.aimX);
    }
    const shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
    const rawShake = shakeOn ? (Neo.shake || 0) : 0;
    // Same residual-shake deadzone as third person: at eye level even a tiny
    // offset is very visible, since there is no follow lerp to absorb it.
    const jitter = rawShake > SHAKE_EPSILON ? Math.min(4, rawShake * 0.38) : 0;
    const shakeAxes = getCameraShakeAxes(now);
    const jx = shakeAxes.x * jitter;
    const jy = shakeAxes.y * jitter * 0.55;
    const jz = shakeAxes.y * jitter * 0.7;
    const eyeX = camFocus.x;
    const eyeZ = camFocus.z;
    camera.position.set(eyeX + jx, FP_EYE_HEIGHT + jy, eyeZ + jz);
    const cosPitch = Math.cos(fpPitch);
    camera.lookAt(
      eyeX + jx + Math.cos(fpYaw) * cosPitch * 100,
      FP_EYE_HEIGHT + jy + Math.sin(fpPitch) * 100,
      eyeZ + jz + Math.sin(fpYaw) * cosPitch * 100,
    );
    return;
  }
  const focusX = camFocus.x;
  const focusZ = camFocus.z;
  // Bias the look-at toward room center so walls stay in frame at the edges.
  const cx = Neo.ROOM_W / 2;
  const cz = Neo.ROOM_H / 2;
  const lookX = focusX * 0.72 + cx * 0.28;
  const lookZ = focusZ * 0.72 + cz * 0.28;
  const shakeOn = window.NeoSettings?.getAccess()?.screenShake !== false;
  // Shake decays asymptotically and is only snapped to 0 once trauma fully
  // clears, so it lingers as a sub-pixel value long after an impact. Without a
  // deadzone the camera keeps re-randomising around its target forever, which
  // reads as the "random" jitter at rest.
  const rawShake = shakeOn ? (Neo.shake || 0) : 0;
  const jitter = rawShake > SHAKE_EPSILON ? rawShake : 0;
  const shakeAxes = getCameraShakeAxes(now);
  const sx = shakeAxes.x;
  const sy = shakeAxes.y;
  const kickX = shakeOn ? (Neo.shakeKickX || 0) : 0;
  const kickZ = shakeOn ? (Neo.shakeKickY || 0) : 0;
  const shakeX = sx * jitter * 0.85 + kickX;
  const shakeZ = sy * jitter * 0.85 + kickZ;
  camTarget.set(
    lookX + shakeX,
    CAMERA_HEIGHT,
    lookZ + CAMERA_BACK + shakeZ,
  );
  // Framerate-independent follow. The old fixed 0.14 per-frame lerp chased the
  // target more than twice as fast at 144Hz as at 60Hz, so the camera's trail
  // (and any residual wobble) changed with the player's refresh rate.
  if (camera.position.lengthSq() === 0 || frameDt <= 0) camera.position.copy(camTarget);
  else camera.position.lerp(camTarget, 1 - Math.exp(-CAMERA_FOLLOW_SMOOTH_HZ * frameDt));
  // Translate the eye and focus together. Rotating the camera toward a fixed
  // focus while its position jittered was the source of the odd aim wobble.
  camera.lookAt(lookX + shakeX, 12, lookZ + shakeZ);
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

function drawChargeHud() {
  const p = Neo.player;
  if (!p || Neo.gameState !== 'play') return;
  const draw = () => {
    Neo.drawHealingZoneChargeBar?.();
    Neo.drawDeathBallChargeBar?.();
    Neo.drawNimrodStompChargeBar?.();
    Neo.drawLoveBombChargeBar?.();
    Neo.drawGhostBallChargeBar?.();
  };
  if (isFirstPersonActive()) {
    // There is no player position to project from the camera's own eye. Keep
    // the shared 2D meter layout intact, anchored just below the crosshair.
    Neo.ctx.save();
    Neo.ctx.translate(Neo.canvas.width / 2 - p.x, Neo.canvas.height * 0.72 - p.y);
    draw();
    Neo.ctx.restore();
    return;
  }
  drawProjectedPrompt(p.x, p.y, Math.max(26, (p.r || 14) * SPRITE_SIZE_MULT), draw);
}

function drawPrompts() {
  if (Neo.gameState !== 'play') return;
  const ladder = (Neo.pickups || []).find(pickup => pickup?.type === 'ladder');
  if (ladder && Neo.currentRoom?.cleared) {
    drawProjectedPrompt(ladder.x, ladder.y, 30, Neo.drawLadderPrompt);
  }
  drawChargeHud();
  if (isFirstPersonActive()) {
    drawViewmodel();
    drawCrosshair();
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
  if (!Neo.render3D) return false;
  if (Neo.isSplitScreen?.()) return false;         // split-screen stays on the 2D path
  if (!Neo.SPRITE_ATLAS?.canvas) return false;      // atlas not built yet
  if (!Neo.currentRoom) return false;
  if (!initRenderer()) return false;
  if (contextLost || renderer.getContext?.().isContextLost?.()) return false;

  try {
    document.body.classList.add('render3d');
    glCanvas.style.display = 'block';
    syncSize();

    const buildKey = getRoomBuildKey();
    if (buildKey !== roomBuildKey) {
      roomBuildKey = buildKey;
      buildRoom();
    }
    syncRoomEnvironmentSprites();
    syncWorldFxOverlay();

    // Dim ambient for dark room types so lighting mood carries over.
    const darkness = Neo.getRoomDarkness?.(Neo.currentRoom, []) || 0;
    if (ambientLight) ambientLight.intensity = 0.92 - Math.min(0.45, darkness * 2.2);

    syncPlayer();
    syncOtherPlayers();
    syncPlayerMeleeIndicator();
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
    syncJusticeBlades();
    syncTitanHammer();
    syncCamera();
    scaleNameplatesToScreen();

    renderer.render(scene, camera);
    syncPointerLock();
    drawPrompts();
    return true;
  } catch (err) {
    // A mobile driver can reject a texture allocation or lose its context in
    // the middle of a frame. Keep the game playable through the normal 2D path
    // and allow a later frame/context restoration to recover 3D.
    const now = performance.now();
    if (now - lastRenderErrorAt > WEBGL_RETRY_DELAY_MS) {
      console.warn('[3D] Frame failed, temporarily using the 2D renderer', err);
      lastRenderErrorAt = now;
    }
    glCanvas.style.display = 'none';
    document.body.classList.remove('render3d');
    return false;
  }
}

function setRender3D(on) {
  Neo.render3D = !!on;
  try { localStorage.setItem(RENDER3D_STORE_KEY, Neo.render3D ? '1' : '0'); } catch { /* private mode */ }
  document.body.classList.toggle('render3d', Neo.render3D);
  if (!Neo.render3D && glCanvas) glCanvas.style.display = 'none';
}

// 2D is the default view: only an explicit stored '1' turns 3D on, so a first
// time visitor always lands in the original top-down game. Existing players who
// chose 3D keep it, and F4 still toggles.
let storedPreference = '0';
try { storedPreference = localStorage.getItem(RENDER3D_STORE_KEY) ?? '0'; } catch { /* private mode */ }
Neo.render3D = storedPreference === '1';

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
Neo.projectCanvasMouseToWorld = projectCanvasMouseToWorld;
Neo.hasPointerLockBlockingUi = hasPointerLockBlockingUi;

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
    ready,
    failed,
    contextLost,
    requested3D: !!Neo.render3D,
    viewMode: getViewMode(),
    coarsePointer: !!window.matchMedia?.('(pointer: coarse)')?.matches,
    devicePixelRatio: window.devicePixelRatio || 1,
    drawingBuffer: glCanvas ? [glCanvas.width, glCanvas.height] : null,
    cssSize: glCanvas ? [
      Math.round(glCanvas.getBoundingClientRect().width),
      Math.round(glCanvas.getBoundingClientRect().height),
    ] : null,
    webglVersion: renderer?.getContext?.().getParameter?.(renderer.getContext().VERSION) || null,
    sceneChildren: scene?.children?.length,
    camera: camera?.position?.toArray?.().map(v => Math.round(v * 10) / 10),
    fov: camera?.fov,
    fpYaw,
    fpPitch,
    roomChildren: roomGroup?.children?.length,
    justiceBlades: pools.justiceBlades.size,
    otherPlayers: pools.players.size,
    beams: beamMeshes.length,
    floorHasMap: !!floorMesh?.material?.map,
    driverContextLost: !!renderer?.getContext?.()?.isContextLost?.(),
  }),
};
Neo.setRender3D = setRender3D;
