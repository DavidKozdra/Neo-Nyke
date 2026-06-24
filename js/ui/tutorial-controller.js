// tutorial-controller.js — visual, action-gated first-run tutorial.

import { TUTORIAL_LESSON_SCENE, TUTORIAL_SCENES } from '../tutorial/scenes.js';

export const TUTORIAL_VERSION = 2;

const BUTTON_NAMES = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y',
  4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'VIEW', 9: 'MENU', 10: 'L3', 11: 'R3',
};

export function findRoomPath(rooms, start, target) {
  if (!start || !target) return [];
  if (start === target) return [start];
  const byKey = new Map((rooms || []).map(room => [`${room.gx},${room.gy}`, room]));
  const queue = [start];
  const previous = new Map([[start, null]]);
  const vectors = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  while (queue.length) {
    const room = queue.shift();
    for (const [direction, [dx, dy]] of Object.entries(vectors)) {
      if (!room.doors?.[direction]) continue;
      const next = byKey.get(`${room.gx + dx},${room.gy + dy}`);
      if (!next || next.secret || previous.has(next)) continue;
      previous.set(next, room);
      if (next === target) {
        const path = [next];
        let cursor = room;
        while (cursor) {
          path.unshift(cursor);
          cursor = previous.get(cursor);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

function roomKey(room) {
  return room ? `${room.gx},${room.gy}` : '';
}

function roomFromKey(key) {
  const [gx, gy] = String(key || '').split(',').map(Number);
  return (Neo.rooms || []).find(room => room.gx === gx && room.gy === gy) || null;
}

function getInputMode() {
  if (window.NeoTouch?.active || window.NeoSettings?.isTouchControlsEnabled?.()) return 'touch';
  if (window.NeoGamepad?.[0]?.active) return 'gamepad';
  return 'keyboard';
}

function getActionLabel(action, fallback) {
  const mode = getInputMode();
  if (mode === 'touch') {
    const bindings = window.NeoSettings?.getTouchBindings?.() || {};
    const labels = { touchA: 'A', touchB: 'B', touchX: 'X', touchY: 'Y', touchDash: 'DASH' };
    const match = Object.entries(bindings).find(([, value]) => value === action);
    if (match) return labels[match[0]] || fallback;
    if (action === 'inventory') return 'MENU → INVENTORY';
    if (action === 'interact') return 'CLIMB / PROMPT';
  }
  if (mode === 'gamepad') {
    const bindings = window.NeoSettings?.getGamepadBindings?.() || {};
    const match = Object.entries(bindings).find(([, value]) => value === action);
    if (match) return BUTTON_NAMES[Number(match[0])] || fallback;
  }
  return Neo.getControlHint?.(action, fallback) || String(fallback || '').toUpperCase();
}

function getMovementLabel() {
  if (getInputMode() === 'touch') return 'LEFT JOYSTICK';
  if (getInputMode() === 'gamepad') return 'LEFT STICK';
  return Neo.getMovementControlHint?.() || 'W/A/S/D';
}

function targetDom(selector, padding = 10) {
  return { kind: 'dom', selector, padding };
}

function targetWorld(getter, options = {}) {
  return { kind: 'world', getter, padding: options.padding ?? 16, route: !!options.route };
}

function targetMinimap() {
  return { kind: 'minimap', padding: 8 };
}

function createSteps() {
  return [
    {
      id: 'welcome',
      chapter: 'START HERE',
      title: 'Learn by doing',
      text: () => 'This is a safe first floor. The tutorial points at the exact control or place you need. Complete the shown action to continue.',
      manual: true,
    },
    {
      id: 'move',
      chapter: 'MOVEMENT',
      title: 'Move your hero',
      text: () => `Hold ${getMovementLabel()} and move for a moment.`,
      target: targetWorld(() => Neo.player, { padding: 28 }),
      complete: state => !!state.completed?.move,
    },
    {
      id: 'hud',
      chapter: 'HUD',
      title: 'Health and experience',
      text: () => 'Your HP and XP are shown here. HP reaching zero ends the run. XP pays for Forge upgrades and raises your level.',
      target: targetDom('#playerStats', 8),
      manual: true,
    },
    {
      id: 'objectives',
      chapter: 'HUD',
      title: 'Follow one objective',
      text: () => 'The objective panel shows the current job. During the tutorial it stays short so you always know what to do next.',
      target: targetDom('#objectiveTracker', 8),
      manual: true,
    },
    {
      id: 'minimap',
      chapter: 'NAVIGATION',
      title: 'Read the minimap',
      text: () => 'YOU marks your room. SHOP, FORGE, and EXIT are labeled. The tutorial also highlights the correct doorway.',
      target: targetMinimap(),
      manual: true,
    },
    {
      id: 'route_training',
      chapter: 'COMBAT ROOM',
      title: 'Enter the training room',
      text: () => 'Follow the pulsing doorway. Sarge will explain the room when you enter.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.trainingRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_training,
    },
    {
      id: 'dash',
      chapter: 'COMBAT',
      title: 'Dash through danger',
      text: () => `Press ${getActionLabel('dash', 'SHIFT')}. Dashing gives a short burst of invulnerability.`,
      target: targetDom('[data-skill="dash"]', 8),
      complete: state => !!state.completed?.dash,
    },
    {
      id: 'melee',
      chapter: 'COMBAT',
      title: 'Use your close attack',
      text: () => `Aim at the training dummy and press ${getActionLabel('slash', 'LMB')}.`,
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      complete: state => !!state.completed?.melee,
    },
    {
      id: 'laser',
      chapter: 'COMBAT',
      title: 'Use your ranged attack',
      text: () => `Aim at the dummy and press ${getActionLabel('laser', 'RMB')}.`,
      target: targetDom('[data-skill="laser"]', 8),
      complete: state => !!state.completed?.laser,
    },
    {
      id: 'smash',
      chapter: 'COMBAT',
      title: 'Use your heavy move',
      text: () => `Press ${getActionLabel('smash', 'R')}. Heavy moves hit hard or control space.`,
      target: targetDom('[data-skill="smash"]', 8),
      complete: state => !!state.completed?.smash,
    },
    {
      id: 'fight',
      chapter: 'COMBAT',
      title: 'Defeat the dummy',
      text: () => 'Combine your attacks and finish the training dummy. Watch the action cards for cooldowns.',
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      complete: state => !!state.completed?.fight,
    },
    {
      id: 'relic',
      chapter: 'BUILD',
      title: 'Pick up the relic',
      text: () => 'Walk over the glowing relic. Relics stay active for the rest of this run and shape your build.',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.tutorialRelic), { padding: 22 }),
      complete: state => !!state.completed?.relic,
    },
    {
      id: 'inventory_open',
      chapter: 'INVENTORY',
      title: 'Open Inventory',
      text: () => `Press ${getActionLabel('inventory', 'I')} to inspect your build.`,
      target: targetDom('.touch-hamburger', 8),
      complete: state => !!state.completed?.inventory_open,
    },
    {
      id: 'inventory_relics',
      chapter: 'INVENTORY',
      title: 'Open the Relics tab',
      text: () => 'Select Relics to see every passive upgrade and its exact effect.',
      target: targetDom('#invPanel [data-inv-tab="items"]', 8),
      complete: state => !!state.completed?.inventory_relics,
    },
    {
      id: 'inventory_moves',
      chapter: 'INVENTORY',
      title: 'Open the Moves tab',
      text: () => 'Select Moves. This panel shows what each action slot currently uses and where moves can be equipped.',
      target: targetDom('#invPanel [data-inv-tab="equipped"]', 8),
      complete: state => !!state.completed?.inventory_moves,
    },
    {
      id: 'route_treasure',
      chapter: 'TREASURE ROOM',
      title: 'Go to the Treasure room',
      text: () => 'Follow the highlighted doorway to the chest room.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.treasureRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_treasure,
    },
    {
      id: 'treasure_open',
      chapter: 'TREASURE ROOM',
      title: 'Open the chest',
      text: () => 'Walk into the chest and collect what comes out.',
      target: targetWorld(() => Neo.chests?.find(chest => !chest?.open), { padding: 24 }),
      complete: state => !!state.completed?.treasure_open,
    },
    {
      id: 'route_shop',
      chapter: 'SHOP',
      title: 'Go to the Shop',
      text: () => 'Close Inventory and follow the pulsing doorway. The minimap labels the destination SHOP.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.shopRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_shop,
    },
    {
      id: 'shop_open',
      chapter: 'SHOP',
      title: 'Open the Shop',
      text: () => `Press ${getActionLabel('interact', 'E')} or tap the prompt.`,
      target: targetDom('#interactPrompt', 10),
      complete: state => !!state.completed?.shop_open,
    },
    {
      id: 'shop_buy',
      chapter: 'SHOP',
      title: 'Buy the highlighted relic',
      text: () => 'Prices use run coins. Buy the TRAINING PICK to add another real relic to this run.',
      target: targetDom('.shop-buy[data-tutorial-offer="true"]', 10),
      complete: state => !!state.completed?.shop_buy,
    },
    {
      id: 'route_forge',
      chapter: 'FORGE',
      title: 'Go to the Forge',
      text: () => 'Close the Shop and follow the highlighted doorway to FORGE.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.forgeRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_forge,
    },
    {
      id: 'forge_open',
      chapter: 'FORGE',
      title: 'Open the Forge',
      text: () => `Press ${getActionLabel('interact', 'E')} or tap the prompt.`,
      target: targetDom('#interactPrompt', 10),
      complete: state => !!state.completed?.forge_open,
    },
    {
      id: 'forge_stage',
      chapter: 'FORGE',
      title: 'Stage an upgrade',
      text: () => 'Press + on any available stat. The tutorial Forge Voucher makes this step free.',
      target: targetDom('#anvilPanel .anvil-stat-btn[data-dir="1"]:not([disabled])', 10),
      complete: state => !!state.completed?.forge_stage,
    },
    {
      id: 'forge_confirm',
      chapter: 'FORGE',
      title: 'Confirm the upgrade',
      text: () => 'Confirm Upgrades to permanently apply the staged increase for this run.',
      target: targetDom('#anvilConfirm:not([disabled])', 10),
      complete: state => !!state.completed?.forge_confirm,
    },
    {
      id: 'route_challenge',
      chapter: 'CHALLENGE ROOM',
      title: 'Go to the Bomb trial',
      text: () => 'Follow the highlighted doorway to the Challenge room.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.challengeRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_challenge,
    },
    {
      id: 'challenge_start',
      chapter: 'CHALLENGE ROOM',
      title: 'Start the trial',
      text: () => 'Touch the central trial marker to begin.',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'challengeStarter'), { padding: 24 }),
      complete: state => !!state.completed?.challenge_start,
    },
    {
      id: 'challenge_bombs',
      chapter: 'CHALLENGE ROOM',
      title: 'Defuse every blue bomb',
      text: () => 'Touch blue bombs only. Avoid every red bomb.',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'challengeBomb' && pickup.safe), { padding: 24 }),
      complete: state => !!state.completed?.challenge_bombs,
    },
    {
      id: 'route_ladder',
      chapter: 'EXIT',
      title: 'Go to the Exit',
      text: () => 'Close the Forge and follow the highlighted doorway to EXIT.',
      target: targetWorld(() => getNextDoorPoint(Neo.tutorialState?.ladderRoomKey), { padding: 28, route: true }),
      complete: state => !!state.completed?.route_ladder,
    },
    {
      id: 'ladder_use',
      chapter: 'EXIT',
      title: 'Use the ladder',
      text: () => `Stand on the ladder and press ${getActionLabel('interact', 'E')}. Floor 2 continues as a normal run.`,
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'ladder'), { padding: 28 }),
      complete: state => !!state.completed?.ladder_use,
    },
  ];
}

function getNextDoorPoint(destinationKey) {
  const destination = roomFromKey(destinationKey);
  const current = Neo.currentRoom;
  const path = findRoomPath(Neo.rooms, current, destination);
  const next = path[1];
  if (!current || !next) return null;
  if (next.gx > current.gx) return { x: Neo.ROOM_W - Neo.WALL - 12, y: Neo.ROOM_H / 2, tutorialDoor: true };
  if (next.gx < current.gx) return { x: Neo.WALL + 12, y: Neo.ROOM_H / 2, tutorialDoor: true };
  if (next.gy > current.gy) return { x: Neo.ROOM_W / 2, y: Neo.ROOM_H - Neo.WALL - 12, tutorialDoor: true };
  return { x: Neo.ROOM_W / 2, y: Neo.WALL + 12, tutorialDoor: true };
}

function normalizeRect(rect, padding = 0) {
  if (!rect) return null;
  const left = Number(rect.left ?? rect.x) - padding;
  const top = Number(rect.top ?? rect.y) - padding;
  const right = Number(rect.right ?? (Number(rect.x) + Number(rect.width))) + padding;
  const bottom = Number(rect.bottom ?? (Number(rect.y) + Number(rect.height))) + padding;
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(12, right - left),
    height: Math.max(12, bottom - top),
  };
}

function resolveWorldRect(entity, padding = 0) {
  if (!entity || !Neo.canvas) return null;
  const rect = Neo.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const radius = Math.max(10, Number(entity.r || 16));
  const scaleX = rect.width / Neo.canvas.width;
  const scaleY = rect.height / Neo.canvas.height;
  const x = rect.left + (Number(entity.x) - Number(Neo.camera?.x || 0)) * scaleX;
  const y = rect.top + (Number(entity.y) - Number(Neo.camera?.y || 0)) * scaleY;
  return normalizeRect({
    left: x - radius * scaleX,
    top: y - radius * scaleY,
    right: x + radius * scaleX,
    bottom: y + radius * scaleY,
  }, padding);
}

function createTutorialState(active = false) {
  return {
    version: TUTORIAL_VERSION,
    active: !!active,
    step: 'welcome',
    completed: {},
    movedFor: 0,
    dummySpawned: false,
    relicSpawned: false,
      resourcesGranted: false,
      trainingRoomKey: '',
      treasureRoomKey: '',
      shopRoomKey: '',
      forgeRoomKey: '',
      challengeRoomKey: '',
      ladderRoomKey: '',
      seenScenes: {},
    lastCelebratedStep: '',
  };
}

export function createTutorialController() {
  const steps = createSteps();
  const overlay = document.getElementById('tutorialOverlay');
  const spotlight = overlay?.querySelector('.tutorial-spotlight');
  const card = document.getElementById('tutorialCard');
  const hole = document.getElementById('tutorialSpotlightHole');
  const ring = document.getElementById('tutorialTargetRing');
  const speaker = document.getElementById('tutorialSpeaker');
  const title = document.getElementById('tutorialTitle');
  const text = document.getElementById('tutorialText');
  const progress = document.getElementById('tutorialProgress');
  const gate = document.getElementById('tutorialGate');
  const hint = document.getElementById('tutorialHint');
  const previous = document.getElementById('tutorialPrevBtn');
  const next = document.getElementById('tutorialNextBtn');
  const skip = document.getElementById('tutorialSkipBtn');
  let lastLayoutAt = 0;
  let lastStepId = '';
  let gamepadConfirmHeld = false;

  if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay);

  const getState = () => Neo.tutorialState;
  const getIndex = () => Math.max(0, steps.findIndex(step => step.id === getState()?.step));
  const getStep = () => steps[getIndex()] || steps[0];

  function normalizeState(state, active = false) {
    const base = createTutorialState(active);
    if (!state || typeof state !== 'object') return base;
    const merged = {
      ...base,
      ...state,
      version: TUTORIAL_VERSION,
      active: state.active === undefined ? !!active : !!state.active,
      completed: state.completed && typeof state.completed === 'object' ? { ...state.completed } : {},
      seenScenes: state.seenScenes && typeof state.seenScenes === 'object' ? { ...state.seenScenes } : {},
    };
    if (!steps.some(step => step.id === merged.step)) {
      const legacyMap = { move: 'move', dash: 'dash', fight: 'fight', relic: 'relic', forge: 'route_forge', panel: 'inventory_open', ladder: 'route_ladder' };
      merged.step = legacyMap[state.step] || 'welcome';
      if (state.moved) merged.completed.move = true;
      if (state.dashed) merged.completed.dash = true;
      if (state.gotKill) merged.completed.fight = true;
      if (state.gotRelic) merged.completed.relic = true;
      if (state.openedInventory) merged.completed.inventory_open = true;
      if (state.openedForge) merged.completed.forge_open = true;
      if (state.usedLadder) merged.completed.ladder_use = true;
    }
    return merged;
  }

  function isStepComplete(step = getStep()) {
    const state = getState();
    if (!state || !step) return false;
    if (step.manual) return !!state.completed?.[step.id];
    return typeof step.complete === 'function' ? !!step.complete(state) : !!state.completed?.[step.id];
  }

  function advanceCompletedSteps() {
    const state = getState();
    if (!state?.active) return;
    let index = getIndex();
    let changed = false;
    while (index < steps.length - 1 && isStepComplete(steps[index])) {
      index += 1;
      state.step = steps[index].id;
      changed = true;
    }
    if (changed) {
      Neo.playSfx?.('achievement');
      Neo.scheduleRunSave?.();
      Neo.updateObjective?.();
    }
  }

  function setCompleted(id) {
    const state = getState();
    if (!state?.active || !id) return false;
    if (!state.completed || typeof state.completed !== 'object') state.completed = {};
    if (state.completed[id]) return false;
    state.completed[id] = true;
    advanceCompletedSteps();
    return true;
  }

  function signal(type, payload = {}) {
    const state = getState();
    if (!state?.active) return false;
    const current = state.step;
    if (type === 'move' && current === 'move') setCompleted('move');
    if (type === 'attack' && payload.action === current && ['melee', 'laser', 'smash'].includes(current)) setCompleted(current);
    if (type === 'dash' && current === 'dash') setCompleted('dash');
    if (type === 'enemy-killed' && payload.tutorialDummy && current === 'fight') setCompleted('fight');
    if (type === 'relic-collected' && payload.tutorialRelic && current === 'relic') setCompleted('relic');
    if (type === 'panel-open' && payload.panel === 'inventory' && current === 'inventory_open') setCompleted('inventory_open');
    if (type === 'inventory-tab' && payload.tab === 'items' && current === 'inventory_relics') setCompleted('inventory_relics');
    if (type === 'inventory-tab' && payload.tab === 'equipped' && current === 'inventory_moves') setCompleted('inventory_moves');
    if (type === 'room-enter') {
      const key = roomKey(payload.room);
      if (current === 'route_training' && key && key === state.trainingRoomKey) setCompleted('route_training');
      if (current === 'route_treasure' && key && key === state.treasureRoomKey) setCompleted('route_treasure');
      if (current === 'route_shop' && key && key === state.shopRoomKey) setCompleted('route_shop');
      if (current === 'route_forge' && key && key === state.forgeRoomKey) setCompleted('route_forge');
      if (current === 'route_challenge' && key && key === state.challengeRoomKey) setCompleted('route_challenge');
      if (current === 'route_ladder' && key && key === state.ladderRoomKey) setCompleted('route_ladder');
    }
    if (type === 'chest-open' && current === 'treasure_open') setCompleted('treasure_open');
    if (type === 'panel-open' && payload.panel === 'shop' && current === 'shop_open') setCompleted('shop_open');
    if (type === 'shop-purchase' && payload.tutorialOffer && current === 'shop_buy') setCompleted('shop_buy');
    if (type === 'panel-open' && payload.panel === 'forge' && current === 'forge_open') setCompleted('forge_open');
    if (type === 'forge-stage' && current === 'forge_stage') setCompleted('forge_stage');
    if (type === 'forge-confirm' && current === 'forge_confirm') setCompleted('forge_confirm');
    if (type === 'challenge-started' && current === 'challenge_start') setCompleted('challenge_start');
    if (type === 'challenge-completed' && payload.challengeType === 'bomb' && current === 'challenge_bombs') setCompleted('challenge_bombs');
    if (type === 'ladder-use' && current === 'ladder_use') {
      setCompleted('ladder_use');
      complete();
    }
    render(true);
    return true;
  }

  function manualNext() {
    const step = getStep();
    if (!step?.manual) return;
    setCompleted(step.id);
    render(true);
  }

  function back() {
    const state = getState();
    if (!state?.active) return;
    const index = getIndex();
    if (index <= 0) return;
    state.step = steps[index - 1].id;
    render(true);
    Neo.updateObjective?.();
  }

  function skipTutorial() {
    if (!getState()?.active) return;
    if (!window.confirm('Skip the guided tutorial? You will stay in this run and can replay the tutorial from the main menu.')) return;
    getState().active = false;
    Neo.metaProgress.tutorialCompleted = true;
    Neo.metaProgress.tutorialVersion = TUTORIAL_VERSION;
    Neo.persistMetaSoon?.();
    hide();
    Neo.updateObjective?.();
  }

  function complete() {
    const state = getState();
    if (!state) return;
    state.active = false;
    Neo.metaProgress.tutorialCompleted = true;
    Neo.metaProgress.tutorialVersion = TUTORIAL_VERSION;
    Neo.persistMetaSoon?.();
    Neo.playSfx?.('victory');
    hide();
  }

  function resolveTarget(step) {
    const spec = step?.target;
    if (!spec) return null;
    if (spec.kind === 'dom') {
      const element = document.querySelector(spec.selector);
      if (!element || element.closest('.hidden,[aria-hidden="true"]')) return null;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return { ...normalizeRect(rect, spec.padding), route: !!spec.route };
    }
    if (spec.kind === 'world') {
      const entity = spec.getter?.();
      const resolved = resolveWorldRect(entity, spec.padding);
      return resolved ? { ...resolved, route: !!spec.route } : null;
    }
    if (spec.kind === 'minimap') {
      const rect = Neo.minimapLayoutState?.viewportBounds;
      const resolved = normalizeRect(rect, spec.padding);
      return resolved ? { ...resolved, route: false } : null;
    }
    return null;
  }

  function placeCard(targetRect) {
    if (!card) return;
    const margin = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    spotlight?.setAttribute('viewBox', `0 0 ${viewportW} ${viewportH}`);
    const cardRect = card.getBoundingClientRect();
    if (viewportW <= 720) {
      const targetCenterY = targetRect ? targetRect.top + targetRect.height / 2 : viewportH / 2;
      const placeTop = !targetRect || targetCenterY > viewportH / 2;
      const touchControlsVisible = window.NeoSettings?.isTouchControlsEnabled?.() === true;
      const safeBottom = touchControlsVisible ? 190 : margin;
      card.style.left = `${margin}px`;
      card.style.top = placeTop ? `${margin}px` : 'auto';
      card.style.bottom = placeTop ? 'auto' : `${safeBottom}px`;
      card.style.width = `${Math.max(280, viewportW - margin * 2)}px`;
      return;
    }
    card.style.bottom = 'auto';
    card.style.width = '';
    const candidates = targetRect ? [
      { left: targetRect.right + 18, top: targetRect.top + targetRect.height / 2 - cardRect.height / 2 },
      { left: targetRect.left - cardRect.width - 18, top: targetRect.top + targetRect.height / 2 - cardRect.height / 2 },
      { left: targetRect.left + targetRect.width / 2 - cardRect.width / 2, top: targetRect.bottom + 18 },
      { left: targetRect.left + targetRect.width / 2 - cardRect.width / 2, top: targetRect.top - cardRect.height - 18 },
    ] : [{ left: viewportW / 2 - cardRect.width / 2, top: viewportH - cardRect.height - 28 }];
    const scored = candidates.map(candidate => {
      const left = Math.max(margin, Math.min(viewportW - cardRect.width - margin, candidate.left));
      const top = Math.max(margin, Math.min(viewportH - cardRect.height - margin, candidate.top));
      const overlap = targetRect
        ? Math.max(0, Math.min(left + cardRect.width, targetRect.right) - Math.max(left, targetRect.left))
          * Math.max(0, Math.min(top + cardRect.height, targetRect.bottom) - Math.max(top, targetRect.top))
        : 0;
      return { left, top, overlap };
    }).sort((a, b) => a.overlap - b.overlap);
    card.style.left = `${scored[0].left}px`;
    card.style.top = `${scored[0].top}px`;
  }

  function layoutTarget(step) {
    const targetRect = resolveTarget(step);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const hasTarget = !!targetRect;
    if (hole) {
      hole.setAttribute('x', String(hasTarget ? targetRect.left : viewportW / 2 - 1));
      hole.setAttribute('y', String(hasTarget ? targetRect.top : viewportH / 2 - 1));
      hole.setAttribute('width', String(hasTarget ? targetRect.width : 2));
      hole.setAttribute('height', String(hasTarget ? targetRect.height : 2));
      hole.setAttribute('rx', String(hasTarget ? Math.min(18, targetRect.height / 3) : 1));
    }
    if (ring) {
      ring.classList.toggle('hidden', !hasTarget);
      ring.classList.toggle('tutorial-target-ring--route', !!targetRect?.route);
      if (hasTarget) {
        ring.style.left = `${targetRect.left}px`;
        ring.style.top = `${targetRect.top}px`;
        ring.style.width = `${targetRect.width}px`;
        ring.style.height = `${targetRect.height}px`;
      }
    }
    placeCard(targetRect);
  }

  function render(force = false) {
    const state = getState();
    if (!state?.active || !Neo.isFirstRunTutorialEngaged?.()) {
      hide();
      return;
    }
    const step = getStep();
    overlay?.classList.remove('hidden');
    overlay?.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.style.display = 'block';
    document.body.classList.add('tutorial-active');
    if (speaker) speaker.textContent = step.chapter || 'TUTORIAL';
    if (title) title.textContent = step.title || 'Tutorial';
    if (text) text.textContent = step.text?.() || '';
    if (progress) progress.textContent = `${getIndex() + 1} / ${steps.length}`;
    if (gate) gate.textContent = step.manual ? 'Review this, then continue.' : 'Complete the highlighted action.';
    if (hint) hint.textContent = step.manual ? 'CONTINUE WHEN READY' : 'THE TUTORIAL ADVANCES AUTOMATICALLY';
    if (previous) previous.disabled = getIndex() <= 0;
    if (next) {
      next.hidden = !step.manual;
      next.disabled = !step.manual;
      next.textContent = 'Continue';
    }
    if (force || lastStepId !== step.id) {
      lastStepId = step.id;
      card?.classList.remove('tutorial-card--enter');
      void card?.offsetWidth;
      card?.classList.add('tutorial-card--enter');
    }
    layoutTarget(step);
  }

  function hide() {
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.style.display = 'none';
    ring?.classList.add('hidden');
    document.body.classList.remove('tutorial-active');
  }

  function tick() {
    const state = getState();
    if (!state?.active) {
      hide();
      return;
    }
    if (Neo.gameState === 'play') {
      if (state.step === 'melee' || state.step === 'laser' || state.step === 'smash' || state.step === 'fight') {
        Neo.ensureTutorialDummyEnemy?.();
      }
      if (state.step === 'relic') Neo.ensureTutorialRelicPickup?.();
    }
    advanceCompletedSteps();
    const gamepadConfirm = !!window.NeoGamepad?.[0]?.buttonStates?.[0];
    if (gamepadConfirm && !gamepadConfirmHeld && getStep()?.manual) manualNext();
    gamepadConfirmHeld = gamepadConfirm;
    const now = performance.now();
    if (now - lastLayoutAt >= 50) {
      lastLayoutAt = now;
      render();
    }
  }

  function bind() {
    previous?.addEventListener('click', back);
    next?.addEventListener('click', manualNext);
    skip?.addEventListener('click', skipTutorial);
    window.addEventListener('resize', () => render(true), { passive: true });
    window.addEventListener('neo:settings-changed', () => render(true));
    window.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || !getState()?.active || !getStep()?.manual) return;
      event.preventDefault();
      manualNext();
    });
    Neo.gameEvents?.on?.('room:enter', ({ room }) => {
      signal('room-enter', { room });
      playRoomScene(room);
    });
    Neo.gameEvents?.on?.('challenge:started', ({ room, challengeType }) => {
      signal('challenge-started', { room, challengeType });
    });
    Neo.gameEvents?.on?.('challenge:completed', ({ room, challengeType }) => {
      signal('challenge-completed', { room, challengeType });
    });
  }

  function playRoomScene(room) {
    const state = getState();
    if (!state?.active || !room?.tutorialLesson) return false;
    const sceneId = TUTORIAL_LESSON_SCENE[room.tutorialLesson];
    const scene = TUTORIAL_SCENES[sceneId];
    if (!scene || state.seenScenes?.[sceneId] || Neo.uiController?.isDialogueOpen?.()) return false;
    const started = Neo.uiController?.playDialogue?.(scene.lines, {
      returnState: 'play',
      onComplete: () => {
        if (!state.seenScenes || typeof state.seenScenes !== 'object') state.seenScenes = {};
        state.seenScenes[sceneId] = true;
        Neo.scheduleRunSave?.();
        render(true);
      },
    });
    if (started) {
      Neo.clearGameplayInput?.();
      Neo.setShopPanelOpen?.(false, { animateClose: false });
      Neo.setInventoryPanelOpen?.(false, { animateClose: false });
      hide();
    }
    return !!started;
  }

  function start() {
    Neo.tutorialState = normalizeState(Neo.tutorialState, true);
    Neo.tutorialState.active = true;
    render(true);
  }

  function syncFromState() {
    Neo.tutorialState = normalizeState(Neo.tutorialState, false);
    if (Neo.tutorialState.active) start();
    else hide();
  }

  function getCurrentMessage() {
    const step = getStep();
    return step?.text?.() || '';
  }

  function getCurrentObjectiveEntries() {
    const step = getStep();
    if (!getState()?.active || !step) return [];
    return [{ text: step.title || 'Tutorial', state: isStepComplete(step) ? 'done' : 'warn' }];
  }

  bind();
  return {
    steps,
    start,
    tick,
    signal,
    back,
    skip: skipTutorial,
    complete,
    syncFromState,
    normalizeState,
    getCurrentMessage,
    getCurrentObjectiveEntries,
  };
}

Neo.TUTORIAL_VERSION = TUTORIAL_VERSION;
Neo.createTutorialController = createTutorialController;
