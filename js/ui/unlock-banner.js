// unlock-banner.js — big celebratory unlock banners, a reusable DOM confetti
// canvas, and per-run unlock tracking for the win/death summary panels.
//
// Three unlock "types" feed this system: 'character', 'achievement', and
// 'difficulty'. Each unlock is recorded onto Neo.runUnlocks (deduped by a
// composite key) so the end screens can show a "UNLOCKED THIS RUN" section,
// and — unless suppressed — pops a center-screen banner with a confetti burst.

const UNLOCK_TYPE_META = {
  character:  { kicker: 'NEW HERO UNLOCKED',       color: '#ffd27d' },
  achievement:{ kicker: 'ACHIEVEMENT UNLOCKED',    color: '#83f3ff' },
  difficulty: { kicker: 'DIFFICULTY UNLOCKED',     color: '#ff9ccf' },
};

// ── Overlay particle system ──────────────────────────────────────────────────
// Celebration FX (confetti today) run on the SHARED particle model rather than
// a bespoke loop: the same spawn/tick/draw shapes the world particles use, on a
// dedicated screen-space canvas.
//
// Why a separate canvas rather than Neo.particles on the game canvas:
//   * the game loop is stopped on the menu / win / death screens, exactly when
//     these fire, so world particles would spawn and never move;
//   * world particles are drawn inside the camera transform, so screen-space
//     coordinates (window.innerWidth * 0.25) would land in arbitrary world
//     positions and scroll with the camera;
//   * #c sits below the win/death overlays, which is what we are decorating.
// This canvas owns its own rAF so it animates whenever it has work, whatever
// the game loop is doing. It self-stops when empty, so it costs nothing idle.

let overlayCanvas = null;
let overlayCtx = null;
let overlayParticles = [];
let overlayRaf = 0;
let overlayLastTs = 0;

// Matches the world cap's intent (world.js MAX_PARTICLES) so a stuck emitter
// can never grow this unbounded.
const OVERLAY_MAX_PARTICLES = 400;

function accessSettings() {
  return window.NeoSettings?.getAccess?.() || {};
}

function ensureOverlayCanvas() {
  if (overlayCanvas) return overlayCanvas;
  overlayCanvas = document.createElement('canvas');
  // Kept as #confettiCanvas: style.css targets this id, and the princess theme
  // excludes it by id (`canvas:not(#confettiCanvas)`).
  overlayCanvas.id = 'confettiCanvas';
  overlayCanvas.setAttribute('aria-hidden', 'true');
  (document.getElementById('wrap') || document.body).appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');
  resizeOverlayCanvas();
  return overlayCanvas;
}

// Assigning canvas.width/height CLEARS the canvas and resets the transform, so
// this must only run when the size actually changed — calling it per spawn is
// what used to wipe an in-flight burst when a second one started (the win
// screen fires two).
function resizeOverlayCanvas() {
  if (!overlayCanvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (overlayCanvas.width === w && overlayCanvas.height === h) return;
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Same field-list shape as world.js spawnParticle: an explicit set of props so
// a particle is always a fixed hidden class, never a partial object.
function spawnOverlayParticle(props) {
  if (overlayParticles.length >= OVERLAY_MAX_PARTICLES) return;
  overlayParticles.push({
    x: props.x, y: props.y,
    vx: props.vx ?? 0, vy: props.vy ?? 0,
    life: props.life, ttl: props.ttl ?? props.life,
    c: props.c ?? '#fff',
    size: props.size ?? 4,
    rotation: props.rotation ?? 0,
    spin: props.spin ?? 0,
    gravity: props.gravity ?? 0,
    drag: props.drag ?? 0,
    sway: props.sway ?? 0,
    swayRate: props.swayRate ?? 0,
    swayAmount: props.swayAmount ?? 0,
    confetti: props.confetti ?? false,
  });
  startOverlayLoop();
}

function updateOverlayParticles(dt) {
  const h = window.innerHeight;
  let writeIndex = 0;
  for (let index = 0; index < overlayParticles.length; index += 1) {
    const particle = overlayParticles[index];
    particle.life -= dt;
    if (particle.gravity) particle.vy += particle.gravity * dt;
    if (particle.drag) particle.vx *= particle.drag;
    if (particle.swayRate) particle.sway += dt * particle.swayRate;
    particle.x += (particle.vx + Math.sin(particle.sway) * particle.swayAmount) * dt;
    particle.y += particle.vy * dt;
    if (particle.spin) particle.rotation += particle.spin * dt;
    // Drop anything expired or fallen well past the viewport.
    if (particle.life > 0 && particle.y <= h + 40) {
      overlayParticles[writeIndex] = particle;
      writeIndex += 1;
    }
  }
  overlayParticles.length = writeIndex;
}

function drawOverlayParticles() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  for (let index = 0; index < overlayParticles.length; index += 1) {
    const particle = overlayParticles[index];
    // Fade over the final 0.5s of life.
    const fade = particle.life < 0.5 ? Math.max(0, particle.life / 0.5) : 1;
    overlayCtx.save();
    overlayCtx.globalAlpha = fade;
    overlayCtx.translate(particle.x, particle.y);
    overlayCtx.rotate(particle.rotation);
    overlayCtx.fillStyle = particle.c;
    // Flakes are wider than they are tall, so the spin reads as a tumble.
    overlayCtx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
    overlayCtx.restore();
  }
}

function stepOverlay(ts) {
  const dt = Math.min(0.05, (ts - overlayLastTs) / 1000);
  overlayLastTs = ts;
  updateOverlayParticles(dt);
  drawOverlayParticles();
  if (overlayParticles.length) {
    overlayRaf = requestAnimationFrame(stepOverlay);
  } else {
    overlayRaf = 0;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
}

function startOverlayLoop() {
  if (overlayRaf) return;
  overlayLastTs = performance.now();
  overlayRaf = requestAnimationFrame(stepOverlay);
}

const CONFETTI_COLORS = ['#ffd27d', '#83f3ff', '#ff9ccf', '#7bffa3', '#c08cff', '#ffe26b', '#ff7a9a'];

function spawnConfetti(options = {}) {
  const access = accessSettings();
  // Honour the same accessibility switches the world particles respect: no
  // burst at all under reduceMotion, a much smaller one under reduceParticles.
  if (access.reduceMotion) return;
  ensureOverlayCanvas();
  resizeOverlayCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  let count = Math.max(1, Math.round(options.count ?? 140));
  if (access.reduceParticles) count = Math.max(1, Math.round(count * 0.25));
  const colors = options.colors && options.colors.length ? options.colors : CONFETTI_COLORS;
  // Burst originates from a point (default: top-center) and fans down/out.
  const originX = options.x ?? w / 2;
  const originY = options.y ?? h * 0.28;
  // Cosmetic only — uses Math.random(), never Neo.rng (the seeded game RNG),
  // so confetti never affects run determinism (seeded replays / competitive).
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 320 + Math.random() * 460;
    const ttl = 1.8 + Math.random() * 1.2;
    spawnOverlayParticle({
      x: originX + (Math.random() - 0.5) * 120,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 7,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      c: colors[Math.floor(Math.random() * colors.length)],
      life: ttl, ttl,
      gravity: 900,
      drag: 0.99,
      sway: Math.random() * Math.PI * 2,
      swayRate: 6,
      swayAmount: 40,
      confetti: true,
    });
  }
}

// ── Banner ───────────────────────────────────────────────────────────────────
// Banners queue so two near-simultaneous unlocks don't stomp each other.

const bannerQueue = [];
let bannerActive = false;

function ensureBannerEl() {
  let el = document.getElementById('unlockBanner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'unlockBanner';
  el.className = 'unlock-banner hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="unlock-banner-card">
      <canvas class="unlock-banner-icon" width="64" height="64"></canvas>
      <div class="unlock-banner-text">
        <span class="unlock-banner-kicker"></span>
        <span class="unlock-banner-name"></span>
        <span class="unlock-banner-desc"></span>
      </div>
    </div>`;
  (document.getElementById('wrap') || document.body).appendChild(el);
  return el;
}

function drawBannerIcon(canvas, unlock) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (unlock.type === 'character') {
    // Draw the hero sprite if the helper is available.
    const spriteKey = Neo.CHARACTER_DEFS?.[unlock.key]?.spriteKey || unlock.key;
    if (typeof Neo.drawSpriteToCanvas === 'function' && Neo.resolveKillerSprite) {
      Neo.drawSpriteToCanvas(canvas, Neo.resolveKillerSprite(spriteKey), canvas.width);
      return;
    }
  }
  // Fallback: a glyph (achievement icon, or a star) on a soft disc.
  const color = unlock.color || '#ffd27d';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx2d.fillStyle = 'rgba(8,14,22,0.85)';
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, canvas.width * 0.46, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = 14;
  ctx2d.fillStyle = color;
  ctx2d.font = `bold ${Math.round(canvas.width * 0.5)}px system-ui`;
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(String(unlock.icon || '★'), cx, cy + 1);
  ctx2d.shadowBlur = 0;
}

function presentNextBanner() {
  if (bannerActive) return;
  const unlock = bannerQueue.shift();
  if (!unlock) return;
  bannerActive = true;
  const el = ensureBannerEl();
  const meta = UNLOCK_TYPE_META[unlock.type] || UNLOCK_TYPE_META.achievement;
  const color = unlock.color || meta.color;
  el.style.setProperty('--unlock-color', color);
  el.querySelector('.unlock-banner-kicker').textContent = unlock.kicker || meta.kicker;
  el.querySelector('.unlock-banner-name').textContent = unlock.name || unlock.key || 'Unlocked';
  el.querySelector('.unlock-banner-desc').textContent = unlock.desc || '';
  drawBannerIcon(el.querySelector('.unlock-banner-icon'), { ...unlock, color });
  el.classList.remove('hidden', 'is-leaving');
  el.setAttribute('aria-hidden', 'false');
  // Confetti tuned to the banner color plus the palette.
  spawnConfetti({ colors: [color, ...CONFETTI_COLORS], y: window.innerHeight * 0.22 });
  Neo.playSfx?.(unlock.type === 'achievement' ? 'achievement' : 'secret_reveal');
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('is-leaving');
      el.setAttribute('aria-hidden', 'true');
      bannerActive = false;
      presentNextBanner();
    }, 360);
  }, 3000);
}

function showUnlockBanner(unlock) {
  if (!unlock) return;
  bannerQueue.push(unlock);
  presentNextBanner();
}

// ── Per-run unlock tracking ──────────────────────────────────────────────────

function unlockKey(unlock) {
  return `${unlock.type}:${unlock.key}`;
}

function resetRunUnlocks() {
  Neo.runUnlocks = [];
}

// Records an unlock for the end-of-run summary and (unless options.silent)
// pops a banner. Deduped per run so the same unlock can't be listed twice.
function recordUnlock(unlock, options = {}) {
  if (!unlock || !unlock.type || !unlock.key) return;
  if (!Array.isArray(Neo.runUnlocks)) Neo.runUnlocks = [];
  const meta = UNLOCK_TYPE_META[unlock.type] || UNLOCK_TYPE_META.achievement;
  const normalized = {
    type: unlock.type,
    key: unlock.key,
    name: unlock.name || unlock.key,
    desc: unlock.desc || '',
    icon: unlock.icon || '',
    color: unlock.color || meta.color,
    kicker: unlock.kicker || meta.kicker,
  };
  if (Neo.runUnlocks.some(u => unlockKey(u) === unlockKey(normalized))) return;
  Neo.runUnlocks.push(normalized);
  if (!options.silent) showUnlockBanner(normalized);
}

const CHARACTER_RARITY_COLOR = {
  princess: '#ff9ccf', knight: '#e8f0ff', wizard: '#c08cff',
  god: '#ffd23f', knave: '#ff7a9a',
};

// Convenience wrappers used by the various unlock sites.
function recordCharacterUnlock(characterKey, options = {}) {
  const def = Neo.CHARACTER_DEFS?.[characterKey];
  if (!def) return;
  const lore = Neo.HERO_DISPLAY?.[characterKey]?.lore || '';
  recordUnlock({
    type: 'character',
    key: characterKey,
    name: def.name || characterKey,
    desc: lore.length > 90 ? `${lore.slice(0, 88)}…` : lore,
    color: CHARACTER_RARITY_COLOR[def.rarity] || '#ffd27d',
  }, options);
}

function recordAchievementUnlock(achievement, options = {}) {
  if (!achievement) return;
  recordUnlock({
    type: 'achievement',
    key: achievement.id,
    name: achievement.name || achievement.id,
    desc: achievement.desc || '',
    icon: achievement.icon || '🏆',
  }, options);
}

function recordDifficultyUnlock(difficultyKey, options = {}) {
  const def = Neo.DIFFICULTY_DEFS?.[difficultyKey];
  if (!def) return;
  recordUnlock({
    type: 'difficulty',
    key: difficultyKey,
    name: (def.name || difficultyKey).toUpperCase(),
    desc: def.description || `${(def.name || difficultyKey)} difficulty is now available.`,
    icon: '☗',
  }, options);
}

window.addEventListener('resize', resizeOverlayCanvas);

Neo.spawnConfetti = spawnConfetti;
Neo.showUnlockBanner = showUnlockBanner;
Neo.recordUnlock = recordUnlock;
Neo.recordCharacterUnlock = recordCharacterUnlock;
Neo.recordAchievementUnlock = recordAchievementUnlock;
Neo.recordDifficultyUnlock = recordDifficultyUnlock;
Neo.resetRunUnlocks = resetRunUnlocks;
if (!Array.isArray(Neo.runUnlocks)) Neo.runUnlocks = [];
