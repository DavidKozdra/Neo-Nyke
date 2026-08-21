const { chromium } = require('playwright');

const baseUrl = String(
  process.argv[2]
  || process.env.NEONYKE_MULTIPLAYER_URL
  || 'http://127.0.0.1:8789',
).replace(/\/$/, '');

async function openMultiplayer(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#altModesBtn').click();
  await page.locator('.altmodes-tab[data-tab="online"]').click();
  await page.locator('#multiplayerBtn').click();
  await page.locator('#multiplayerCreateRoom').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#multiplayerCreateRoom')?.disabled,
    undefined, { timeout: 10_000 });
}

async function waitForStatus(page, status) {
  await page.waitForFunction(expected => (
    globalThis.Neo?.gameSession?.snapshot?.().status === expected
  ), status, { timeout: 20_000 });
}

async function waitForPauseState(page, expected) {
  await page.waitForFunction(target => {
    const snapshot = globalThis.Neo?.gameSession?.snapshot?.();
    const view = globalThis.Neo?.multiplayerGameView;
    const pauseVisible = !document.querySelector('#pause')?.classList.contains('hidden');
    return snapshot?.pauseState?.paused === target
      && view?.paused === target
      && pauseVisible === target;
  }, expected, { timeout: 10_000 });
}

async function readChatLayout(page) {
  const layout = await page.evaluate(() => {
    const rect = selector => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    };
    return {
      panel: rect('.coop-lobby__chat'),
      log: rect('#coopLobbyChatLog'),
      input: rect('#coopLobbyChatInput'),
      send: rect('#coopLobbyChatForm button[type="submit"]'),
    };
  });
  const { panel, log, input, send } = layout;
  if (!panel || !log || !input || !send
    || panel.height < 215
    || log.height < 108
    || input.width < 100
    || send.width < 60 || send.width > 68
    || Math.abs(input.y - send.y) > 2) {
    throw new Error(`Party chat layout is cramped or wrapped: ${JSON.stringify(layout)}`);
  }
  return layout;
}

async function createRunningParty(browser, pauseMode) {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  await Promise.all(contexts.map(context => context.addInitScript(apiBase => {
    globalThis.NEO_MULTIPLAYER_API_BASE = apiBase;
    // Browser focus changes are incidental to a two-page headless test. The
    // explicit Escape actions below are the behavior under test.
    try {
      const key = 'neonyke:settings';
      const settings = JSON.parse(localStorage.getItem(key) || '{}');
      settings.gameplay = { ...(settings.gameplay || {}), pauseOnBlur: false };
      localStorage.setItem(key, JSON.stringify(settings));
    } catch {}
  }, `${baseUrl}/api/multiplayer`)));
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));

  await Promise.all([openMultiplayer(host), openMultiplayer(guest)]);
  await host.locator('#multiplayerVisibilityToggle').click();
  if (pauseMode === 'vote') await host.locator('#multiplayerPauseModeToggle').click();
  await host.locator('#multiplayerCreateRoom').click();
  await waitForStatus(host, 'waiting');
  const roomCode = await host.evaluate(() => globalThis.Neo.gameSession.snapshot().roomCode);
  if (pauseMode === 'vote') {
    // Exercise the authority-backed toggle in the actual lobby too, not only
    // the pre-create option. Round-trip through shared and back to vote.
    await host.locator('#coopLobbyPauseMode').click();
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.pauseMode === 'shared');
    await host.locator('#coopLobbyPauseMode').click();
    await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.pauseMode === 'vote');
  }

  await guest.locator('#multiplayerRoomCode').fill(roomCode);
  await guest.locator('#multiplayerJoinRoom').click();
  await waitForStatus(guest, 'waiting');
  await host.waitForFunction(() => globalThis.Neo.gameSession.snapshot().lobbyState?.members?.length === 2);
  const chatLayout = await readChatLayout(host);

  await host.locator('#coopLobbyPicker [data-char="princess"]').click();
  await guest.locator('#coopLobbyPicker [data-char="gelleh"]').click();
  await Promise.all([
    host.locator('#coopLobbyReady').click(),
    guest.locator('#coopLobbyReady').click(),
  ]);
  await Promise.all([waitForStatus(host, 'running'), waitForStatus(guest, 'running')]);
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (
    globalThis.Neo?.multiplayerGameView?.active === true
    && globalThis.Neo?.gameSession?.snapshot?.().pauseState?.pauseMode
  ), undefined, { timeout: 30_000 })));

  return { contexts, host, guest, roomCode, chatLayout };
}

async function proveShared(browser) {
  const party = await createRunningParty(browser, 'shared');
  const { contexts, host, guest, roomCode, chatLayout } = party;
  try {
    await host.bringToFront();
    await host.keyboard.press('Escape');
    await Promise.all([waitForPauseState(host, true), waitForPauseState(guest, true)]);
    await host.evaluate(() => globalThis.Neo.detachBrowserMultiplayerGame());
    await host.waitForFunction(() => !globalThis.Neo.multiplayerGameView
      && globalThis.Neo.gameSession.snapshot().pauseState.paused === true);
    await host.evaluate(() => document.querySelector('#multiplayerResumeBtn').click());
    await waitForPauseState(host, true);
    const frozenTicks = await Promise.all([host, guest].map(page => page.evaluate(() => (
      globalThis.Neo.gameSession.snapshot().gameState.tick
    ))));
    await host.waitForTimeout(400);
    const ticksWhilePaused = await Promise.all([host, guest].map(page => page.evaluate(() => (
      globalThis.Neo.gameSession.snapshot().gameState.tick
    ))));
    if (ticksWhilePaused.some((tick, index) => tick !== frozenTicks[index])) {
      throw new Error(`Shared pause did not freeze client ticks ${frozenTicks.join(', ')}: ${ticksWhilePaused.join(', ')}`);
    }

    await guest.bringToFront();
    await guest.keyboard.press('Escape');
    await Promise.all([waitForPauseState(host, false), waitForPauseState(guest, false)]);
    await host.waitForFunction(tick => globalThis.Neo.gameSession.snapshot().gameState.tick > tick,
      frozenTicks[0], { timeout: 5_000 });
    return {
      roomCode,
      chatLayout,
      frozenTicks,
      resumedTick: await host.evaluate(() => globalThis.Neo.gameSession.snapshot().gameState.tick),
    };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

async function proveVote(browser) {
  const party = await createRunningParty(browser, 'vote');
  const { contexts, host, guest, roomCode, chatLayout } = party;
  try {
    const hostPlayerId = await host.evaluate(() => globalThis.Neo.gameSession.snapshot().playerId);
    const guestPlayerId = await guest.evaluate(() => globalThis.Neo.gameSession.snapshot().playerId);

    await host.bringToFront();
    await host.keyboard.press('Escape');
    await Promise.all([host, guest].map(page => page.waitForFunction(playerId => {
      const state = globalThis.Neo.gameSession.snapshot().pauseState;
      return state.pauseMode === 'vote' && state.paused === false && state.target === 'pause'
        && state.requiredVotes === 2 && state.votes.length === 1 && state.votes.includes(playerId)
        && globalThis.Neo.multiplayerGameView.paused === false;
    }, hostPlayerId, { timeout: 10_000 })));

    await guest.bringToFront();
    await guest.keyboard.press('Escape');
    await Promise.all([waitForPauseState(host, true), waitForPauseState(guest, true)]);
    const frozenTicks = await Promise.all([host, guest].map(page => page.evaluate(() => (
      globalThis.Neo.gameSession.snapshot().gameState.tick
    ))));
    await host.waitForTimeout(300);
    const ticksWhilePaused = await Promise.all([host, guest].map(page => page.evaluate(() => (
      globalThis.Neo.gameSession.snapshot().gameState.tick
    ))));
    if (ticksWhilePaused.some((tick, index) => tick !== frozenTicks[index])) {
      throw new Error(`Vote pause did not freeze client ticks ${frozenTicks.join(', ')}: ${ticksWhilePaused.join(', ')}`);
    }

    await host.bringToFront();
    await host.keyboard.press('Escape');
    await Promise.all([host, guest].map(page => page.waitForFunction(playerId => {
      const state = globalThis.Neo.gameSession.snapshot().pauseState;
      return state.paused === true && state.target === 'resume'
        && state.requiredVotes === 2 && state.votes.length === 1 && state.votes.includes(playerId)
        && globalThis.Neo.multiplayerGameView.paused === true;
    }, hostPlayerId, { timeout: 10_000 })));

    await guest.bringToFront();
    await guest.keyboard.press('Escape');
    await Promise.all([waitForPauseState(host, false), waitForPauseState(guest, false)]);
    await host.waitForFunction(tick => globalThis.Neo.gameSession.snapshot().gameState.tick > tick,
      frozenTicks[0], { timeout: 5_000 });
    return {
      roomCode,
      chatLayout,
      voters: [hostPlayerId, guestPlayerId],
      frozenTicks,
      resumedTick: await host.evaluate(() => globalThis.Neo.gameSession.snapshot().gameState.tick),
    };
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const shared = await proveShared(browser);
    const vote = await proveVote(browser);
    console.log(JSON.stringify({ baseUrl, shared, vote }, null, 2));
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
