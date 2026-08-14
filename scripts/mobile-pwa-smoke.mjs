#!/usr/bin/env node
/* eslint-disable no-console */

import { chromium, devices, webkit } from 'playwright';

const device = devices['iPhone 13'];
const args = process.argv.slice(2);

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`Usage: npm run mobile:pwa-smoke [url] [timeoutMs]

  url       URL of the game to load (default: http://127.0.0.1:5173/)
  timeoutMs Maximum wait time in ms per step (default: 30000)
`);
  process.exit(0);
}

const url = args[0] ?? 'http://127.0.0.1:5173/';
const timeoutRaw = Number(args[1] ?? 30000);
const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30000;

function fail(message) {
  console.error(`[mobile-pwa-smoke] ${message}`);
  process.exit(1);
}

(async () => {
  const launchCandidates = [
    {
      name: 'chromium',
      launch: () => chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      }),
    },
    {
      name: 'webkit',
      launch: () => webkit.launch({
        headless: true,
      }),
    },
  ];

  let browser;
  const launchErrors = [];
  for (const candidate of launchCandidates) {
    try {
      browser = await candidate.launch();
      break;
    } catch (error) {
      launchErrors.push(`${candidate.name}: ${String(error?.message ?? error)}`);
    }
  }

  if (!browser) {
    console.error('[mobile-pwa-smoke] no browser could be launched:');
    for (const item of launchErrors) {
      console.error(`  - ${item}`);
    }
    console.error('[mobile-pwa-smoke] install browser + OS deps before retrying (e.g. npx playwright install, npx playwright install-deps).');
    process.exit(1);
  }

  try {
    const context = await browser.newContext({
      ...device,
    });

    await context.addInitScript(() => {
      // Ensure each run in automation starts without stale in-page state.
      window.__neonykePwaRegistrationState = null;
    });

    const page = await context.newPage();
    page.on('pageerror', (error) => {
      console.error('[mobile-pwa-smoke] page error:', error?.message ?? String(error));
    });

    page.on('console', (message) => {
      const type = message.type();
      if (type === 'error' || type === 'warning') {
        const text = message.text();
        if (!text.includes('Service worker registration failed') && !text.includes('pwa')) {
          console.info(`[mobile-pwa-smoke] console ${type}: ${text}`);
        }
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });

    try {
      await page.waitForFunction(() => !document.querySelector('#bootLoading'), {
        timeout: timeoutMs,
      });
    } catch (error) {
      fail(`boot loading overlay did not clear within ${timeoutMs}ms`);
    }

    const runtimeState = await page.evaluate(() => ({
      hasCanvas: !!document.querySelector('canvas#c'),
      canvasRect: (() => {
        const canvas = document.querySelector('canvas#c');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })(),
      pwaState: window.__neonykePwaRegistrationState,
      hasBootError: !!document.querySelector('.boot-loading__error'),
      hasGameScript: !!document.querySelector('script[src=\"js/main.js\"]'),
      title: document.title,
    }));

    if (!runtimeState.hasCanvas) {
      fail('no canvas#c found after load');
    }

    if (!runtimeState.canvasRect || runtimeState.canvasRect.width <= 0 || runtimeState.canvasRect.height <= 0) {
      fail(`canvas has invalid dimensions: ${JSON.stringify(runtimeState.canvasRect)}`);
    }

    if (runtimeState.hasBootError && runtimeState.pwaState && runtimeState.pwaState.result?.success === false) {
      fail(`boot ended with a persistent boot error after all SW candidates: ${JSON.stringify(runtimeState.pwaState)}`);
    }

    if (!runtimeState.title?.includes('NEO NYKE')) {
      fail(`unexpected title: ${runtimeState.title}`);
    }

    console.log('[mobile-pwa-smoke] pass');
    console.log(JSON.stringify(runtimeState, null, 2));
  } finally {
    await browser.close();
  }
})();
