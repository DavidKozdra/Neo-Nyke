import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/home/davidk/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:8765/index.html', { waitUntil: 'load' });
try { await page.waitForSelector('#menuLetters .menu-letter.landed', { timeout: 20000 }); }
catch (e) { console.log('menu letters did not appear:', e.message); }
await page.waitForTimeout(2500);

await page.screenshot({ path: '/tmp/nn-menu.png' });

const info = await page.evaluate(() => {
  const pick = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { font: cs.fontFamily.split(',')[0], size: cs.fontSize };
  };
  return { navBtn: pick('.nav-btn'), minor: pick('.nav-btn--minor'), title: pick('.menu-letter') };
});
console.log('INFO', JSON.stringify(info));
console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
await browser.close();
