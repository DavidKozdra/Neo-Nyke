const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
  await page.goto('http://localhost:5173/index.html');
  await page.waitForTimeout(1500);

  await page.getByText('NEW RUN', { exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'PRINCESS. Available.' }).first().click();
  await page.waitForTimeout(1000);
  await page.getByText('ENTER DUNGEON', { exact: true }).click();
  await page.waitForTimeout(2500);

  const result = await page.evaluate(() => {
    const p = window.Neo.player;
    const enemy = window.Neo.spawnEnemy('hunter', p.x + 60, p.y);
    enemy.hp = 1000; enemy.maxHp = 1000; enemy.speed = 0; enemy.vx = 0; enemy.vy = 0;
    window.Neo.mouse.worldX = enemy.x;
    window.Neo.mouse.worldY = enemy.y;
    p.hp = Math.max(1, p.maxHp - 100);

    window.Neo.mouse.right = true;
    window.Neo.mouse.rightQueued = true;
    window.Neo.tryLaser();

    const dt = 1 / 60;
    const hpBefore = p.hp;
    const enemyHpBefore = enemy.hp;
    const frameLog = [];
    for (let i = 0; i < 60; i += 1) {
      window.Neo.mouse.right = true;
      window.Neo.update(dt);
      if (i < 15) {
        frameLog.push({
          i,
          laserActive: window.Neo.laserActive,
          laserTick: Number(window.Neo.laserTick).toFixed(3),
          enemyHp: enemy.hp,
          enemyInv: Number(enemy.inv || 0).toFixed(3),
          enemyDead: !!enemy.dead,
          enemyXY: { x: Math.round(enemy.x), y: Math.round(enemy.y) },
        });
      }
    }

    return {
      equippedLaser: window.Neo.getEquippedMove('laser'),
      enemyDamageTaken: enemyHpBefore - enemy.hp,
      playerHealGained: p.hp - hpBefore,
      frameLog,
    };
  });
  console.log('--- RESULT ---', JSON.stringify(result, null, 2));
  console.log('--- ERRORS ---', errors);

  await browser.close();
})();
