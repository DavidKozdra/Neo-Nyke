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

// ── Confetti ─────────────────────────────────────────────────────────────────
// A single full-screen, pointer-transparent canvas reused for every burst. It
// self-stops its rAF loop when no particles remain so it costs nothing idle.

let confettiCanvas = null;
let confettiCtx = null;
let confettiParticles = [];
let confettiRaf = 0;
let confettiLastTs = 0;

function ensureConfettiCanvas() {
  if (confettiCanvas) return confettiCanvas;
  confettiCanvas = document.createElement('canvas');
  confettiCanvas.id = 'confettiCanvas';
  confettiCanvas.setAttribute('aria-hidden', 'true');
  (document.getElementById('wrap') || document.body).appendChild(confettiCanvas);
  confettiCtx = confettiCanvas.getContext('2d');
  return confettiCanvas;
}

function resizeConfettiCanvas() {
  if (!confettiCanvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  confettiCanvas.width = Math.floor(window.innerWidth * dpr);
  confettiCanvas.height = Math.floor(window.innerHeight * dpr);
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const CONFETTI_COLORS = ['#ffd27d', '#83f3ff', '#ff9ccf', '#7bffa3', '#c08cff', '#ffe26b', '#ff7a9a'];

function spawnConfetti(options = {}) {
  ensureConfettiCanvas();
  resizeConfettiCanvas();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const count = Math.max(1, Math.round(options.count ?? 140));
  const colors = options.colors && options.colors.length ? options.colors : CONFETTI_COLORS;
  // Burst originates from a point (default: top-center) and fans down/out.
  const originX = options.x ?? w / 2;
  const originY = options.y ?? h * 0.28;
  // Cosmetic only — uses Math.random(), never Neo.rng (the seeded game RNG),
  // so confetti never affects run determinism (seeded replays / competitive).
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 320 + Math.random() * 460;
    confettiParticles.push({
      x: originX + (Math.random() - 0.5) * 120,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 12,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0,
      ttl: 1.8 + Math.random() * 1.2,
      sway: Math.random() * Math.PI * 2,
    });
  }
  if (!confettiRaf) {
    confettiLastTs = performance.now();
    confettiRaf = requestAnimationFrame(stepConfetti);
  }
}

function stepConfetti(ts) {
  const dt = Math.min(0.05, (ts - confettiLastTs) / 1000);
  confettiLastTs = ts;
  const h = window.innerHeight;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  const gravity = 900;
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.life += dt;
    if (p.life >= p.ttl || p.y > h + 40) { confettiParticles.splice(i, 1); continue; }
    p.vy += gravity * dt;
    p.vx *= 0.99;
    p.sway += dt * 6;
    p.x += (p.vx + Math.sin(p.sway) * 40) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const fade = p.life > p.ttl - 0.5 ? Math.max(0, (p.ttl - p.life) / 0.5) : 1;
    confettiCtx.save();
    confettiCtx.globalAlpha = fade;
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    confettiCtx.restore();
  }
  if (confettiParticles.length) {
    confettiRaf = requestAnimationFrame(stepConfetti);
  } else {
    confettiRaf = 0;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
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
  god: '#ffd23f', assassin: '#ff7a9a',
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

window.addEventListener('resize', resizeConfettiCanvas);

Neo.spawnConfetti = spawnConfetti;
Neo.showUnlockBanner = showUnlockBanner;
Neo.recordUnlock = recordUnlock;
Neo.recordCharacterUnlock = recordCharacterUnlock;
Neo.recordAchievementUnlock = recordAchievementUnlock;
Neo.recordDifficultyUnlock = recordDifficultyUnlock;
Neo.resetRunUnlocks = resetRunUnlocks;
if (!Array.isArray(Neo.runUnlocks)) Neo.runUnlocks = [];
