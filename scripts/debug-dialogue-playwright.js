const { chromium } = require('playwright');

const baseUrl = process.env.NEONYKE_BASE_URL || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const messages = [];
  page.on('console', message => messages.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => messages.push(`pageerror:${error.message}`));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#creditsBtn').click();
  await page.locator('#creditsGalleryBtn').click();
  await page.locator('#creditsSceneList .credits-gallery__item').first().click();

  const gallerySamples = [];
  for (let elapsed = 0; elapsed <= 500; elapsed += 50) {
    if (elapsed) await page.waitForTimeout(50);
    gallerySamples.push(await page.evaluate(elapsedMs => ({
      elapsedMs,
      gameState: window.Neo?.gameState,
      loopStarted: window.Neo?.loopStarted,
      overlayHidden: document.querySelector('#dialogueOverlay')?.classList.contains('hidden'),
      overlayDisplay: getComputedStyle(document.querySelector('#dialogueOverlay')).display,
      speaker: document.querySelector('#dialogueSpeaker')?.textContent,
      text: document.querySelector('#dialogueText')?.textContent,
    }), elapsed));
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.body.classList.add('tutorial-cutscene-active');
    window.Neo?.uiController?.playDialogue?.([{
      speaker: 'SARGE',
      text: 'When I talk, the world stands still, and we have all the time on earth. Read first. Move second. The bright marker always points at exactly what you need. Training begins when every recruit understands the objective and follows the command.',
    }], { returnState: 'menu' });
  });

  const tutorialSamples = [];
  for (let elapsed = 0; elapsed <= 1600; elapsed += 100) {
    if (elapsed) await page.waitForTimeout(100);
    tutorialSamples.push(await page.evaluate(elapsedMs => {
      const node = document.querySelector('#dialogueText');
      return {
        elapsedMs,
        text: node?.textContent,
        height: node?.getBoundingClientRect().height,
        scrollHeight: node?.scrollHeight,
        wrap: getComputedStyle(node).textWrap,
        overflow: getComputedStyle(node).overflow,
      };
    }, elapsed));
  }

  console.log(JSON.stringify({ gallerySamples, tutorialSamples, messages }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
