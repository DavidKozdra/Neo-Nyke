// Run once: node generate-icons.js
// Generates PWA icons from the game's source icon (assets/icons/neo-nyke_Icon.png)
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(__dirname, 'assets', 'icons');
const srcPath = path.join(outDir, 'neo-nyke_Icon.png');
fs.mkdirSync(outDir, { recursive: true });

(async function main() {
  const src = await loadImage(srcPath);

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0, size, size);
    const out = path.join(outDir, `icon-${size}x${size}.png`);
    fs.writeFileSync(out, canvas.toBuffer('image/png'));
    console.log(`Generated ${out}`);
  }

  // Maskable icon: scale to 80% with a safe-zone padding on the theme background.
  const mSize = 512;
  const mCanvas = createCanvas(mSize, mSize);
  const mCtx = mCanvas.getContext('2d');
  mCtx.fillStyle = '#0a0a0f';
  mCtx.fillRect(0, 0, mSize, mSize);
  const pad = mSize * 0.1;
  const inner = mSize * 0.8;
  mCtx.drawImage(src, pad, pad, inner, inner);
  fs.writeFileSync(path.join(outDir, 'icon-maskable-512x512.png'), mCanvas.toBuffer('image/png'));
  console.log('Generated maskable icon');
})().catch((err) => { console.error(err); process.exit(1); });
