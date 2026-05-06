// Run once: node generate-icons.js
// Generates PWA icons from the game's SVG logo into assets/icons/
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(__dirname, 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function drawIcon(ctx, size) {
  const s = size;
  // Background
  ctx.fillStyle = '#0a0a0f';
  roundRect(ctx, 0, 0, s, s, s * 0.18);
  ctx.fill();

  // Glow effect (soft shadow)
  ctx.shadowColor = '#cc3333';
  ctx.shadowBlur = s * 0.08;

  const cx = s / 2;
  // Blade (triangle top)
  ctx.beginPath();
  ctx.moveTo(cx, s * 0.13);
  ctx.lineTo(cx + s * 0.047, s * 0.44);
  ctx.lineTo(cx, s * 0.48);
  ctx.lineTo(cx - s * 0.047, s * 0.44);
  ctx.closePath();
  ctx.fillStyle = '#cc3333';
  ctx.fill();

  // Handle
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.047, s * 0.47, s * 0.094, s * 0.34, s * 0.03);
  ctx.fillStyle = '#cc3333';
  ctx.fill();

  // Guard (crossguard)
  ctx.shadowColor = '#e8a020';
  ctx.shadowBlur = s * 0.06;
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.19, s * 0.44, s * 0.375, s * 0.078, s * 0.025);
  ctx.fillStyle = '#e8a020';
  ctx.fill();

  // Pommel
  ctx.beginPath();
  ctx.arc(cx, s * 0.845, s * 0.056, 0, Math.PI * 2);
  ctx.fillStyle = '#e8a020';
  ctx.fill();

  ctx.shadowBlur = 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  drawIcon(ctx, size);
  const out = path.join(outDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(`Generated ${out}`);
}

// Also generate a maskable icon (with padding/safe zone)
const mSize = 512;
const mCanvas = createCanvas(mSize, mSize);
const mCtx = mCanvas.getContext('2d');
mCtx.fillStyle = '#0a0a0f';
mCtx.fillRect(0, 0, mSize, mSize);
// Scale icon down to 80% for safe zone
mCtx.save();
const pad = mSize * 0.1;
mCtx.translate(pad, pad);
mCtx.scale(0.8, 0.8);
drawIcon(mCtx, mSize);
mCtx.restore();
fs.writeFileSync(path.join(outDir, 'icon-maskable-512x512.png'), mCanvas.toBuffer('image/png'));
console.log('Generated maskable icon');
