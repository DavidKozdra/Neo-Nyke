// Run once: node generate-icons.js
//
// Generates the full NeoNyke icon set + the title image directly from the
// game's cinematic menu-title styling: the "NN" wordmark set in Press Start 2P
// with the icy-blue gradient and layered glow used by #menuCinema, on the dark
// badge. The old flow scaled a pre-baked PNG; this one draws the mark natively
// so it stays crisp at every size and matches the in-game title exactly.
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// Press Start 2P — the menu title face. node-canvas needs TTF/OTF (not woff2),
// so a decompressed copy lives alongside the shipped woff2.
const FONT_FAMILY = 'Press Start 2P';
const ttfPath = path.join(__dirname, 'assets', 'fonts', 'PressStart2P.ttf');
if (!fs.existsSync(ttfPath)) {
  console.error(
    'Missing ' + ttfPath + '\n' +
    'Decompress the shipped woff2 first, e.g.:\n' +
    '  woff2_decompress assets/fonts/PressStart2P-Latin.woff2  (produces the .woff2 name .ttf)\n' +
    'then rename/move it to assets/fonts/PressStart2P.ttf'
  );
  process.exit(1);
}
registerFont(ttfPath, { family: FONT_FAMILY });

// Gradient stops lifted verbatim from the CSS .menu-letter fill.
const TITLE_GRAD = [
  [0.00, '#a8c8ff'],   // --menu-accent-strong
  [0.34, '#e8eaf6'],   // --menu-text
  [0.64, '#5b8dd9'],   // --menu-accent
  [1.00, '#7090b0'],   // --menu-text-soft
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── The app icon: "NN" title styling squared into a badge ──────────────────
// Drawn in a 0..64 unit space then scaled to `s`, so it centers and stays crisp
// at any size. Mirrors the approved artifact's drawMark().
function drawIcon(ctx, s) {
  const u = s / 64;
  ctx.clearRect(0, 0, s, s);
  ctx.imageSmoothingEnabled = true;

  // badge background
  const r = 14 * u;
  roundRect(ctx, 2 * u, 2 * u, 60 * u, 60 * u, r);
  const bg = ctx.createLinearGradient(0, 0, 0, s);
  bg.addColorStop(0, '#0b1728');
  bg.addColorStop(1, '#05070e');
  ctx.fillStyle = bg;
  ctx.fill();

  // inner glow ring — thin and close to the edge so it frames without crowding.
  ctx.lineWidth = Math.max(1, 1.25 * u);
  ctx.strokeStyle = 'rgba(80,120,200,0.30)'; // --menu-glow
  roundRect(ctx, 3.5 * u, 3.5 * u, 57 * u, 57 * u, r - 2 * u);
  ctx.stroke();

  // "NN" fit to ~84% of the badge width so it reads clearly even at 16px.
  const text = 'NN';
  let fontPx = 30 * u;
  ctx.font = fontPx + 'px "' + FONT_FAMILY + '"';
  const w = ctx.measureText(text).width || 1;
  const maxW = 54 * u;
  fontPx = fontPx * (maxW / w);
  ctx.font = fontPx + 'px "' + FONT_FAMILY + '"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = 32 * u;
  const cy = 33 * u;
  const target = 50 * u;

  const grad = ctx.createLinearGradient(0, cy - target / 2, 0, cy + target / 2);
  TITLE_GRAD.forEach(([o, c]) => grad.addColorStop(o, c));

  // hard drop shadow (CSS: 0 3px 0 rgba(0,0,0,.9))
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(text, cx, cy + Math.max(1, 2.5 * u));

  // soft blue glow — kept modest so the bigger glyphs don't bloom into each other
  ctx.save();
  ctx.shadowColor = 'rgba(90,130,210,0.55)';
  ctx.shadowBlur = 7 * u;
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.restore();

  // crisp pass on top
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
}

function renderIcon(size) {
  const canvas = createCanvas(size, size);
  drawIcon(canvas.getContext('2d'), size);
  return canvas;
}

// ── The title image: "NEO NYKE" per-letter, styled like #menuCinema ─────────
// Transparent background (the title overlays the animated menu). Aspect ~3:1 to
// match the previous NeoNykeTitle.png (2172x724).
function renderTitle(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const text = 'NEO NYKE';
  // Size the font to fill the width with a comfortable margin.
  let fontPx = Math.round(height * 0.5);
  ctx.font = fontPx + 'px "' + FONT_FAMILY + '"';
  const maxW = width * 0.88;
  const measured = ctx.measureText(text).width || 1;
  if (measured > maxW) {
    fontPx = Math.floor(fontPx * (maxW / measured));
    ctx.font = fontPx + 'px "' + FONT_FAMILY + '"';
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = width / 2;
  const cy = height / 2;
  const capH = fontPx * 0.7; // Press Start 2P glyphs fill ~0.7em; align the gradient to that

  const grad = ctx.createLinearGradient(0, cy - capH / 2, 0, cy + capH / 2);
  TITLE_GRAD.forEach(([o, c]) => grad.addColorStop(o, c));

  const dropY = Math.max(2, Math.round(fontPx * 0.05));
  // Keep the glow proportionally small — the CSS title's blur is ~8-24px against
  // a ~64px glyph, so scale to a similar ratio. A single soft halo reads far
  // cleaner at this resolution than stacked large-radius passes (which pool into
  // solid blobs).
  const glow = Math.round(fontPx * 0.09);

  // hard drop shadow (CSS: 0 3px 0 rgba(0,0,0,.9))
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(text, cx, cy + dropY);

  // single soft blue halo
  ctx.save();
  ctx.shadowColor = 'rgba(120,160,235,0.55)';
  ctx.shadowBlur = glow;
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.restore();

  // crisp pass on top for edge definition
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);

  return canvas;
}

(function main() {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  // Master source icon (kept as the 1254x1254 asset other tooling references).
  const master = renderIcon(1254);
  fs.writeFileSync(path.join(outDir, 'neo-nyke_Icon.png'), master.toBuffer('image/png'));
  console.log('Generated neo-nyke_Icon.png (1254x1254)');

  // PWA sizes — render each at native resolution (crisper than downscaling).
  for (const size of sizes) {
    const canvas = renderIcon(size);
    const out = path.join(outDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(out, canvas.toBuffer('image/png'));
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Maskable icon: badge scaled into the safe zone (80%) on the theme ground.
  const mSize = 512;
  const mCanvas = createCanvas(mSize, mSize);
  const mCtx = mCanvas.getContext('2d');
  mCtx.fillStyle = '#05070e';
  mCtx.fillRect(0, 0, mSize, mSize);
  const inner = renderIcon(Math.round(mSize * 0.8));
  const pad = Math.round(mSize * 0.1);
  mCtx.drawImage(inner, pad, pad);
  fs.writeFileSync(path.join(outDir, 'icon-maskable-512x512.png'), mCanvas.toBuffer('image/png'));
  console.log('Generated icon-maskable-512x512.png');

  // Title image — same dimensions as the previous NeoNykeTitle.png.
  const title = renderTitle(2172, 724);
  fs.writeFileSync(path.join(outDir, 'NeoNykeTitle.png'), title.toBuffer('image/png'));
  console.log('Generated NeoNykeTitle.png (2172x724)');
})();
