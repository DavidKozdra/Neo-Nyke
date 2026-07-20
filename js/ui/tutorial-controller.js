// tutorial-controller.js — visual, action-gated first-run tutorial.

import { TUTORIAL_LESSON_SCENE, TUTORIAL_SCENES } from '../tutorial/scenes.js';

window.NeoTutorialScenes = TUTORIAL_SCENES;
window.NeoI18n?.localizeTutorialScenes?.(TUTORIAL_SCENES);

export const TUTORIAL_VERSION = 7;

const BUTTON_NAMES = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y',
  4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'VIEW', 9: 'MENU', 10: 'L3', 11: 'R3',
};
const DEFAULT_TOUCH_BINDINGS = {
  touchA: 'slash',
  touchB: 'laser',
  touchY: 'smash',
  touchX: 'ascend',
  touchDash: 'dash',
};
const DEFAULT_GAMEPAD_BINDINGS = {
  0: 'slash', 1: 'dash', 2: 'laser', 3: 'smash',
  4: 'inventory', 5: 'dash', 6: 'activateAll', 7: 'interact',
  8: 'inventory', 9: 'pause', 10: 'ascend', 11: 'interact',
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

// Helpers for the guided "find the HUD editor" path (Pause → Settings → HUD →
// Preview). Read live DOM/state so the steps can poll for completion.
function isSettingsModalOpen() {
  const modal = document.getElementById('settingsModal');
  return !!modal && !modal.classList.contains('hidden');
}

function isHudSettingsTabActive() {
  if (!isSettingsModalOpen()) return false;
  // The HUD panel (#stab-hud) is un-hidden when its tab is active.
  const panel = document.getElementById('stab-hud');
  return !!panel && !panel.classList.contains('hidden');
}

// Close settings (if open) and return to play. Mirrors the pause-menu Resume so
// the tutorial leaves the player back in the game after the HUD detour.
function closeSettingsAndResume() {
  if (isSettingsModalOpen()) document.getElementById('settingsClose')?.click();
  if (Neo.gameState === 'pause' && !Neo.inventoryPauseActive) Neo.resumeGame?.();
}

function getActionLabel(action, fallback) {
  const mode = getInputMode();
  if (mode === 'touch') {
    const bindings = { ...DEFAULT_TOUCH_BINDINGS, ...(window.NeoSettings?.getTouchBindings?.() || {}) };
    const labels = { touchA: 'A BUTTON', touchB: 'B BUTTON', touchX: 'X BUTTON', touchY: 'Y BUTTON', touchDash: 'DASH BUTTON' };
    const match = Object.entries(bindings).find(([, value]) => value === action);
    if (match) return labels[match[0]] || fallback;
    if (action === 'inventory') return 'MENU → INVENTORY';
    if (action === 'interact') return 'TAP THE PROMPT';
  }
  if (mode === 'gamepad') {
    const bindings = { ...DEFAULT_GAMEPAD_BINDINGS, ...(window.NeoSettings?.getGamepadBindings?.() || {}) };
    const match = Object.entries(bindings).find(([, value]) => value === action);
    if (match) return BUTTON_NAMES[Number(match[0])] || fallback;
  }
  return window.NeoSettings?.getBindingLabel?.(action)
    || Neo.getControlHint?.(action, fallback)
    || String(fallback || '').toUpperCase();
}

function getMovementLabel() {
  if (getInputMode() === 'touch') return 'LEFT JOYSTICK';
  if (getInputMode() === 'gamepad') return 'LEFT STICK';
  return Neo.getMovementControlHint?.() || 'W/A/S/D';
}

// Touch has no fire-all key — players tap a tool slot to activate it — so point
// them at the slots there. Keyboard/gamepad get the real "fire all" binding.
function getActivateAllLabel() {
  if (getInputMode() === 'touch') return 'TAP A TOOL SLOT';
  return getActionLabel('activateAll', 'SPACE');
}

function getLadderLabel() {
  if (getInputMode() !== 'touch') return getActionLabel('interact', 'E');
  const bindings = { ...DEFAULT_TOUCH_BINDINGS, ...(window.NeoSettings?.getTouchBindings?.() || {}) };
  const labels = { touchA: 'A BUTTON', touchB: 'B BUTTON', touchX: 'X BUTTON', touchY: 'Y BUTTON', touchDash: 'DASH BUTTON' };
  const match = Object.entries(bindings).find(([, value]) => value === 'ascend');
  return match ? `${labels[match[0]]} / TAP LADDER` : 'TAP LADDER';
}

// A route step asks the player to walk to a doorway, but a gameplay panel
// (Inventory/Shop/Forge) opened by the previous lesson may still be covering the
// screen. Detect it so the instruction can tell the player to close it first and
// point the highlight at that panel's close button.
const OPEN_GAME_PANELS = [
  { uiKey: 'invPanel', name: 'Inventory', closeSelector: '#invClose' },
  { uiKey: 'shopPanel', name: 'Shop', closeSelector: '#shopClose' },
  { uiKey: 'anvilPanel', name: 'Forge', closeSelector: '#anvilClose' },
];

function getOpenGamePanelInfo() {
  return OPEN_GAME_PANELS.find(panel => Neo.isPanelOpen?.(Neo.ui?.[panel.uiKey])) || null;
}

function getOpenGamePanel() {
  return getOpenGamePanelInfo()?.name || '';
}

// "Inventory" reads as a proper noun ("Close Inventory"); "Shop"/"Forge" take
// an article ("Close the Shop").
function closePanelPhrase(panel) {
  return panel === 'Inventory' ? 'Close Inventory' : `Close the ${panel}`;
}

// Shared text/command for any "walk to the door" step. When a panel is still
// open it asks the player to close it first so the highlighted doorway is
// actually reachable and visible.
function routeText(destinationLine) {
  const open = getOpenGamePanel();
  return open
    ? `${closePanelPhrase(open)}, then ${destinationLine}`
    : destinationLine.charAt(0).toUpperCase() + destinationLine.slice(1);
}

function routeCommand() {
  const open = getOpenGamePanel();
  return open ? `CLOSE THE ${open.toUpperCase()}` : 'GO THROUGH THE TARGET DOOR';
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

// Route highlight: point at the open panel's close button while a panel is open,
// otherwise fall back to the doorway the player needs to walk through.
function targetRoute(doorGetter) {
  return { kind: 'route', doorGetter, padding: 28 };
}

const TUTORIAL_ROOM_NAMES = {
  trainingRoomKey: 'Training Room',
  treasureRoomKey: 'Treasure Room',
  shopRoomKey: 'Shop',
  forgeRoomKey: 'Forge',
  challengeRoomKey: 'Bomb Trial',
  ladderRoomKey: 'Exit',
  secretRoomKey: 'Start Room',
};

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
      text: () => 'Move your hero for a moment.',
      command: getMovementLabel,
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
    // Walk the player along the real path to the HUD layout editor —
    // Pause → Settings → HUD tab → Preview layout — so they can find it again
    // themselves later. Each step highlights the actual control and completes
    // when the player reaches the next screen. These steps stay engaged while
    // the game is paused (liveDuringPause) since the pause menu / settings put
    // the game into the 'pause' state where the tutorial overlay normally hides.
    {
      id: 'hud_pause',
      chapter: 'HUD',
      title: 'Open the pause menu',
      text: () => 'You can rearrange your HUD whenever you like. Let’s find the editor together — start by opening the pause menu.',
      command: () => getInputMode() === 'touch' ? 'MENU → PAUSE' : getActionLabel('pause', 'ESC'),
      commandLabel: getInputMode() === 'touch' ? 'TAP' : 'PRESS',
      liveDuringPause: true,
      complete: () => Neo.gameState === 'pause' && !Neo.inventoryPauseActive,
    },
    {
      id: 'hud_settings',
      chapter: 'HUD',
      title: 'Open Settings',
      text: () => 'Choose Settings to reach every option, including the HUD layout.',
      command: () => 'SETTINGS',
      commandLabel: 'TAP',
      liveDuringPause: true,
      target: targetDom('#pauseSettings', 8),
      complete: () => isSettingsModalOpen(),
    },
    {
      id: 'hud_settings_tab',
      chapter: 'HUD',
      title: 'Open the HUD tab',
      text: () => 'Settings is split into tabs. Open the HUD tab to find layout and sizing.',
      command: () => 'HUD TAB',
      commandLabel: 'TAP',
      liveDuringPause: true,
      target: targetDom('#settingsModal .stab[data-tab="hud"]', 8),
      complete: () => isHudSettingsTabActive(),
    },
    {
      id: 'hud_preview_open',
      chapter: 'HUD',
      title: 'Open the layout editor',
      text: () => 'Under HUD Layout, choose “Preview layout” to open the editor — the same one you can come back to anytime.',
      command: () => 'PREVIEW LAYOUT',
      commandLabel: 'TAP',
      liveDuringPause: true,
      target: targetDom('#hudLayoutPreviewBtn', 8),
      complete: () => window.NeoSettings?.isHudLayoutEditorOpen?.() === true,
    },
    {
      id: 'hud_layout',
      chapter: 'HUD',
      title: 'Make the HUD yours',
      text: () => 'This is the editor. Drag any panel to move it, grab a corner to resize, or tap the eye to hide it. Remember: Pause → Settings → HUD → Preview layout gets you back here anytime. Hit Done when you’re finished.',
      command: () => 'WHEN READY → DONE',
      commandLabel: 'FINISH',
      manual: true,
      liveDuringPause: true,
      // The body class lifts the tutorial card above the editor (z 9000) so its
      // instructions and Continue button stay readable over the editor. The
      // player finishes explicitly via the editor's "Done" or the card's
      // Continue button (handled by manualNext) — dragging is optional.
      onEnter: () => document.body.classList.add('tutorial-hud-editing'),
      onExit: () => {
        document.body.classList.remove('tutorial-hud-editing');
        // Close the editor + settings and return to play so the next lesson
        // resumes cleanly, however the player advanced.
        window.NeoSettings?.closeHudLayoutEditor?.();
        closeSettingsAndResume();
      },
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
      text: () => routeText('follow the pulsing doorway. Sarge will explain the room when you enter.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.trainingRoomKey)),
      roomKey: 'trainingRoomKey',
      routeStep: true,
      completeWhen: ['dwell_do'],
    },
    {
      id: 'dash',
      chapter: 'COMBAT',
      title: 'Dash through danger',
      text: () => 'Dashing gives a short burst of invulnerability.',
      command: () => getActionLabel('dash', 'SHIFT'),
      target: targetDom('[data-skill="dash"]', 8),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.dash,
    },
    {
      id: 'melee',
      chapter: 'COMBAT',
      title: 'Use your close attack',
      text: () => 'Aim at the training dummy and use your close attack.',
      command: () => getActionLabel('slash', 'LMB'),
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.melee,
    },
    {
      id: 'laser',
      chapter: 'COMBAT',
      title: 'Use your ranged attack',
      text: () => 'Aim at the dummy and use your ranged attack.',
      command: () => getActionLabel('laser', 'RMB'),
      target: targetDom('[data-skill="laser"]', 8),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.laser,
    },
    {
      id: 'smash',
      chapter: 'COMBAT',
      title: 'Use your heavy move',
      text: () => 'Heavy moves hit hard or control space.',
      command: () => getActionLabel('smash', 'R'),
      target: targetDom('[data-skill="smash"]', 8),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.smash,
    },
    {
      id: 'tools_fire',
      chapter: 'COMBAT',
      title: 'Fire your tools',
      text: () => `Tools are activatable gear, not passive relics. Your training tool is already equipped below the move bar. Use its numbered slot — or tap the tool on touch. ${getActionLabel('activateAll', 'SPACE')} fires every equipped tool together. Fire it now.`,
      command: () => getActivateAllLabel(),
      target: targetDom('#equipmentSlots', 8),
      roomKey: 'trainingRoomKey',
      // Every tutorial character is guaranteed an equipped teaching tool by
      // grantTutorialTeachingTool(), so make this a real learn-by-doing gate.
      complete: state => !!state.completed?.tools_fire,
    },
    {
      id: 'status_lesson',
      chapter: 'COMBAT',
      title: 'Read a status effect',
      text: () => 'The dummy is bleeding — damage that keeps ticking on its own, even after you stop hitting it. Fire, poison, slow and more stack the same way. Watch the red numbers tick down.',
      command: () => 'WATCH THE DUMMY BLEED',
      commandLabel: 'LESSON',
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      roomKey: 'trainingRoomKey',
      // The tutorial keeps a bleed freely ticking on the dummy for this step
      // (ensureTutorialDummyStatus), so the lesson is demonstrated for every
      // character — not just the blood-beam roster, and never gated on an RNG
      // proc. Clears on a short dwell (so the player actually watches it tick),
      // on a status the player lands themselves, or the fight as a hard fallback.
      complete: state => !!state.completed?.status_lesson || !!state.completed?.fight,
    },
    {
      id: 'crit_lesson',
      chapter: 'COMBAT',
      title: 'Land a critical hit',
      text: () => 'About 1 in 20 hits crits for extra damage — a big yellow number. Keep wailing on the dummy until you see one.',
      command: () => 'LAND A CRIT',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      roomKey: 'trainingRoomKey',
      // Auto-clears on the first crit; the fight step itself is the fallback so
      // a cold RNG streak that kills the dummy first can never stall the lesson.
      complete: state => !!state.completed?.crit_lesson || !!state.completed?.fight,
    },
    {
      id: 'fight',
      chapter: 'COMBAT',
      title: 'Defeat the dummy',
      text: () => 'Combine your attacks and finish the training dummy. Watch the action cards for cooldowns.',
      command: () => 'DEFEAT THE DUMMY',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy?.tutorialDummy), { padding: 24 }),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.fight,
    },
    {
      id: 'relic',
      chapter: 'BUILD',
      title: 'Pick up the relic',
      text: () => 'Walk over the glowing relic. Relics stay active for the rest of this run and shape your build.',
      command: () => 'WALK OVER THE RELIC',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.tutorialRelic), { padding: 22 }),
      roomKey: 'trainingRoomKey',
      complete: state => !!state.completed?.relic,
    },
    {
      id: 'secret_reveal_do',
      chapter: 'NAVIGATION',
      title: 'Find the secret room',
      text: () => 'Not every wall is real. Bump the highlighted wall to reveal a hidden passage — secret rooms hide vendors and warps.',
      command: () => 'BUMP THE HIGHLIGHTED WALL',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.destructibles?.find(prop => prop?.kind === 'secret_wall' && !prop.secretRevealed), { padding: 24 }),
      roomKey: 'secretRoomKey',
      // Skip cleanly if no secret room could be placed (all lesson rooms boxed
      // in) so the missing anchor can never soft-lock the tutorial.
      complete: state => !!state.completed?.secret_reveal_do || !state.secretRoomKey,
    },
    {
      id: 'inventory_open',
      chapter: 'INVENTORY',
      title: 'Open Inventory',
      text: () => 'Open Inventory to inspect your build.',
      command: () => getActionLabel('inventory', 'I'),
      target: targetDom('.touch-hamburger', 8),
      complete: state => !!state.completed?.inventory_open,
    },
    {
      id: 'inventory_relics',
      chapter: 'INVENTORY',
      title: 'Open the Relics tab',
      text: () => 'Select Relics to see every passive upgrade and its exact effect.',
      command: () => 'SELECT RELICS',
      commandLabel: 'GOAL',
      target: targetDom('#invPanel [data-inv-tab="items"]', 8),
      complete: state => !!state.completed?.inventory_relics,
    },
    {
      id: 'inventory_tools',
      chapter: 'INVENTORY',
      title: 'Find and arrange your tools',
      text: () => 'Open Tools. Tools activate on command; relics are passive and always on. A tool’s position here sets its numbered hotkey. Drag it or use the arrows to reorder the tool bar.',
      command: () => 'SELECT TOOLS',
      commandLabel: 'GOAL',
      target: targetDom('#invPanel [data-inv-tab="tools"]', 8),
      complete: state => !!state.completed?.inventory_tools,
    },
    {
      id: 'inventory_moves',
      chapter: 'INVENTORY',
      title: 'Open the Moves tab',
      text: () => 'Select Moves. This panel shows what each action slot currently uses and where moves can be equipped.',
      command: () => 'SELECT MOVES',
      commandLabel: 'GOAL',
      target: targetDom('#invPanel [data-inv-tab="equipped"]', 8),
      complete: state => !!state.completed?.inventory_moves,
    },
    {
      id: 'inventory_weapons',
      chapter: 'INVENTORY',
      title: 'Match your weapon to your style',
      text: () => 'Open the Weapons tab. Any weapon works on any character, but one matching your class’s style deals about 25% more damage. Swapping changes your damage, never your other stats.',
      command: () => 'SELECT WEAPONS',
      commandLabel: 'GOAL',
      target: targetDom('#invPanel [data-inv-tab="weapons"]', 8),
      complete: state => !!state.completed?.inventory_weapons,
    },
    {
      id: 'moves_equip_explain',
      chapter: 'INVENTORY',
      title: 'Own a move vs equip a move',
      text: () => 'Owning a move means you can swap to it. Equipping puts it in an action slot so it fires from the action bar. Back on the Moves tab, you have a spare move ready to equip.',
      command: () => 'SELECT MOVES',
      commandLabel: 'GOAL',
      manual: true,
      target: targetDom('#invPanel [data-inv-tab="equipped"]', 8),
    },
    {
      id: 'moves_equip_do',
      chapter: 'INVENTORY',
      title: 'Swap a move',
      text: () => 'Equip the spare move into its slot. Changing a move swaps what you can do — it never lowers your stats.',
      command: () => 'EQUIP A MOVE',
      commandLabel: 'GOAL',
      target: targetDom('#invPanel [data-inv-tab="equipped"]', 8),
      complete: state => !!state.completed?.moves_equip_do,
    },
    {
      id: 'route_treasure',
      chapter: 'TREASURE ROOM',
      title: 'Go to the Treasure room',
      text: () => routeText('follow the highlighted doorway to the chest room.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.treasureRoomKey)),
      roomKey: 'treasureRoomKey',
      routeStep: true,
      completeWhen: ['treasure_collect'],
    },
    {
      id: 'treasure_open',
      chapter: 'TREASURE ROOM',
      title: 'Open the chest',
      text: () => 'Walk into the chest to crack it open.',
      command: () => 'WALK INTO THE CHEST',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.chests?.find(chest => !chest?.open), { padding: 24 }),
      roomKey: 'treasureRoomKey',
      complete: state => !!state.completed?.treasure_open,
    },
    {
      id: 'treasure_collect',
      chapter: 'TREASURE ROOM',
      title: 'Grab the reward',
      text: () => 'Walk over the reward to pick it up. Risky pickups later on ask for a hold instead of a walk-over — the same room name, a different rulebook.',
      command: () => 'WALK OVER THE REWARD',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'item' && pickup.tutorialTreasureItem), { padding: 28 }),
      roomKey: 'treasureRoomKey',
      complete: state => !!state.completed?.treasure_collect,
    },
    {
      id: 'route_shop',
      chapter: 'SHOP',
      title: 'Go to the Shop',
      text: () => routeText('follow the pulsing doorway. The minimap labels the destination SHOP.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.shopRoomKey)),
      roomKey: 'shopRoomKey',
      routeStep: true,
      completeWhen: ['shop_buy'],
    },
    {
      id: 'shop_open',
      chapter: 'SHOP',
      title: 'Open the Shop',
      text: () => 'Use the interaction prompt to open the Shop.',
      command: () => getActionLabel('interact', 'E'),
      target: targetDom('#interactPrompt', 10),
      roomKey: 'shopRoomKey',
      complete: state => !!state.completed?.shop_open,
    },
    {
      id: 'shop_buy',
      chapter: 'SHOP',
      title: 'Buy the highlighted relic',
      text: () => 'Prices use run coins. Buy the TRAINING PICK to add another real relic to this run.',
      command: () => 'BUY TRAINING PICK',
      commandLabel: 'GOAL',
      target: targetDom('.shop-buy[data-tutorial-offer="true"]', 10),
      roomKey: 'shopRoomKey',
      complete: state => !!state.completed?.shop_buy,
    },
    {
      id: 'route_forge',
      chapter: 'FORGE',
      title: 'Go to the Forge',
      text: () => routeText('follow the highlighted doorway to FORGE.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.forgeRoomKey)),
      roomKey: 'forgeRoomKey',
      routeStep: true,
      completeWhen: ['forge_confirm'],
    },
    {
      id: 'forge_open',
      chapter: 'FORGE',
      title: 'Open the Forge',
      text: () => 'Use the interaction prompt to open the Forge.',
      command: () => getActionLabel('interact', 'E'),
      target: targetDom('#interactPrompt', 10),
      roomKey: 'forgeRoomKey',
      complete: state => !!state.completed?.forge_open,
    },
    {
      id: 'forge_item_select',
      chapter: 'FORGE',
      title: 'Pick an item',
      text: () => 'Switch to the Moves tab and pick a move to upgrade.',
      command: () => 'SELECT AN ITEM',
      target: targetDom('#anvilMovesTab .anvil-item-btn[data-item]', 10),
      roomKey: 'forgeRoomKey',
      complete: state => !!state.completed?.forge_item_select,
    },
    {
      id: 'forge_pay_currency',
      chapter: 'FORGE',
      title: 'Choose XP or gold',
      text: () => 'Toggle Pay With to switch between XP and gold.',
      command: () => 'CHOOSE GOLD',
      target: targetDom('#anvilPayGold', 10),
      roomKey: 'forgeRoomKey',
      complete: state => !!state.completed?.forge_pay_currency,
    },
    {
      id: 'forge_stage',
      chapter: 'FORGE',
      title: 'Stage an upgrade',
      text: () => 'Press + on any available stat. The tutorial Forge Voucher makes this step free.',
      command: () => 'PRESS +',
      target: targetDom('#anvilPanel .anvil-stat-btn[data-dir="1"]:not([disabled])', 10),
      roomKey: 'forgeRoomKey',
      complete: state => !!state.completed?.forge_stage,
    },
    {
      id: 'forge_confirm',
      chapter: 'FORGE',
      title: 'Confirm the upgrade',
      text: () => 'Confirm Upgrades to permanently apply the staged increase for this run.',
      command: () => 'CONFIRM UPGRADES',
      commandLabel: 'GOAL',
      target: targetDom('#anvilConfirm:not([disabled])', 10),
      roomKey: 'forgeRoomKey',
      complete: state => !!state.completed?.forge_confirm,
    },
    {
      id: 'route_challenge',
      chapter: 'CHALLENGE ROOM',
      title: 'Go to the Bomb trial',
      text: () => routeText('follow the highlighted doorway to the Challenge room.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.challengeRoomKey)),
      roomKey: 'challengeRoomKey',
      routeStep: true,
      completeWhen: ['challenge_bombs'],
    },
    {
      id: 'challenge_start',
      chapter: 'CHALLENGE ROOM',
      title: 'Start the trial',
      text: () => 'Touch the central trial marker to begin.',
      command: () => 'TOUCH TRIAL MARKER',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'challengeStarter'), { padding: 24 }),
      roomKey: 'challengeRoomKey',
      complete: state => !!state.completed?.challenge_start,
    },
    {
      id: 'challenge_bombs',
      chapter: 'CHALLENGE ROOM',
      title: 'Defuse every blue bomb',
      text: () => 'Touch blue bombs only. Avoid every red bomb.',
      command: () => 'TOUCH BLUE BOMBS ONLY',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'challengeBomb' && pickup.safe), { padding: 24 }),
      roomKey: 'challengeRoomKey',
      complete: state => !!state.completed?.challenge_bombs,
    },
    {
      id: 'route_ladder',
      chapter: 'EXIT',
      title: 'Go to the Exit',
      text: () => routeText('follow the highlighted doorway to EXIT.'),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(Neo.tutorialState?.ladderRoomKey)),
      roomKey: 'ladderRoomKey',
      routeStep: true,
      completeWhen: ['ladder_fight', 'ladder_use'],
    },
    {
      id: 'ladder_fight',
      chapter: 'EXIT — FINAL WAVE',
      title: 'Clear the locked Exit room',
      text: () => 'Ladder rooms lock only while their final wave is alive. Defeat every enemy; the doors unlock and the ladder appears automatically.',
      command: () => 'DEFEAT THE FINAL WAVE',
      commandLabel: 'GOAL',
      target: targetWorld(() => Neo.enemies?.find(enemy => enemy && !enemy.dead), { padding: 24 }),
      roomKey: 'ladderRoomKey',
      complete: state => !!state.completed?.ladder_fight || (roomKey(Neo.currentRoom) === state.ladderRoomKey && Neo.currentRoom?.cleared),
    },
    {
      id: 'ladder_use',
      chapter: 'EXIT',
      title: 'Use the ladder',
      text: () => 'Stand on the ladder to continue to Floor 2 and the normal run.',
      command: getLadderLabel,
      target: targetWorld(() => Neo.pickups?.find(pickup => pickup?.type === 'ladder'), { padding: 28 }),
      roomKey: 'ladderRoomKey',
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
    // Index of an earlier step the player chose to re-read with Back. Null when
    // following the live tutorial. Review is purely cosmetic — the live `step`
    // keeps advancing underneath — so it never persists across reloads.
    reviewIndex: null,
    completed: {},
    movedFor: 0,
    statusWatchedFor: 0,
    dummySpawned: false,
    relicSpawned: false,
    resourcesGranted: false,
    trainingRoomKey: '',
    treasureRoomKey: '',
    shopRoomKey: '',
    forgeRoomKey: '',
    challengeRoomKey: '',
    ladderRoomKey: '',
    secretRoomKey: '',
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
  const minimapRing = document.getElementById('tutorialMinimapRing');
  const speaker = document.getElementById('tutorialSpeaker');
  const title = document.getElementById('tutorialTitle');
  const text = document.getElementById('tutorialText');
  const command = document.getElementById('tutorialCommand');
  const commandLabel = document.getElementById('tutorialCommandLabel');
  const commandValue = document.getElementById('tutorialCommandValue');
  const progress = document.getElementById('tutorialProgress');
  const progressBar = document.getElementById('tutorialProgressBar');
  const gate = document.getElementById('tutorialGate');
  const hint = document.getElementById('tutorialHint');
  const previous = document.getElementById('tutorialPrevBtn');
  const next = document.getElementById('tutorialNextBtn');
  const skip = document.getElementById('tutorialSkipBtn');
  let lastLayoutAt = 0;
  let lastStepId = '';
  let lastChapter = '';
  let lastLiveStepId = '';
  let gamepadConfirmHeld = false;

  // Fire a step's onEnter/onExit side-effects when the *live* step changes
  // (ignores Back/Forward review navigation, which only moves the display
  // cursor). Lets a step open/close a panel — e.g. the HUD layout editor.
  function runLiveStepLifecycle() {
    const liveStep = getStep();
    const liveId = liveStep?.id || '';
    if (liveId === lastLiveStepId) return;
    const prev = steps.find(step => step.id === lastLiveStepId);
    lastLiveStepId = liveId;
    try { prev?.onExit?.(); } catch (e) { /* never let a side-effect break the tutorial */ }
    try { liveStep?.onEnter?.(); } catch (e) { /* same */ }
  }

  if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay);

  const getState = () => Neo.tutorialState;
  const getIndex = () => Math.max(0, steps.findIndex(step => step.id === getState()?.step));
  const getStep = () => steps[getIndex()] || steps[0];
  const getCurrentRoomKey = () => roomKey(Neo.currentRoom);

  // When the player hits Back we park on an earlier step to re-read it without
  // rewinding real progress. `reviewIndex` is the step being shown; null means
  // we're on the live step.
  const isReviewing = () => Number.isInteger(getState()?.reviewIndex);
  const getDisplayIndex = () => (isReviewing() ? getState().reviewIndex : getIndex());
  const getDisplayStep = () => steps[getDisplayIndex()] || steps[0];

  function isInStepRoom(step, state = getState()) {
    if (!step?.roomKey) return true;
    const requiredRoomKey = String(state?.[step.roomKey] || '');
    return !!requiredRoomKey && getCurrentRoomKey() === requiredRoomKey;
  }

  function areCompletionMilestonesDone(step, state = getState()) {
    return Array.isArray(step?.completeWhen)
      && step.completeWhen.length > 0
      && step.completeWhen.every(id => !!state?.completed?.[id]);
  }

  function getPresentedStep(step = getDisplayStep()) {
    const state = getState();
    if (!step?.roomKey || isInStepRoom(step, state)) return step;
    const destinationKey = state?.[step.roomKey];
    const destinationName = TUTORIAL_ROOM_NAMES[step.roomKey] || 'lesson room';
    const returning = !step.routeStep || !!roomFromKey(destinationKey)?.visited;
    return {
      ...step,
      chapter: 'NAVIGATION',
      title: `${returning ? 'Return to' : 'Go to'} ${destinationName}`,
      text: () => returning
        ? routeText(`this lesson is not finished. Follow the target doors back to the ${destinationName}.`)
        : routeText(`follow the target doors to the ${destinationName}.`),
      command: routeCommand,
      commandLabel: 'GOAL',
      target: targetRoute(() => getNextDoorPoint(destinationKey)),
    };
  }

  function normalizeState(state, active = false) {
    const base = createTutorialState(active);
    if (!state || typeof state !== 'object') return base;
    const merged = {
      ...base,
      ...state,
      version: TUTORIAL_VERSION,
      active: state.active === undefined ? !!active : !!state.active,
      reviewIndex: null,
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
    if (step.routeStep) return isInStepRoom(step, state) || areCompletionMilestonesDone(step, state);
    return typeof step.complete === 'function' ? !!step.complete(state) : !!state.completed?.[step.id];
  }

  // Flash the card + ring and burst a world particle when a lesson is cleared.
  // Deduped via state.lastCelebratedStep so the 50ms render throttle can't
  // double-fire it. Reduced-motion users still get the sfx; CSS disables the
  // animations.
  function celebrateStep(step) {
    if (!step) return;
    const state = getState();
    if (state) state.lastCelebratedStep = step.id;
    if (card) {
      card.classList.remove('tutorial-card--celebrate');
      void card.offsetWidth;
      card.classList.add('tutorial-card--celebrate');
    }
    if (ring) {
      ring.classList.remove('tutorial-target-ring--clear');
      void ring.offsetWidth;
      ring.classList.add('tutorial-target-ring--clear');
    }
    const entity = step.target?.kind === 'world' ? step.target.getter?.() : null;
    if (entity && Number.isFinite(entity.x) && Number.isFinite(entity.y)) {
      Neo.spawnParticle?.({ x: entity.x, y: entity.y - 22, life: 0.7, text: 'NICE!', c: '#7CFFA0' });
    }
  }

  function advanceCompletedSteps() {
    const state = getState();
    if (!state?.active) return;
    // While the player is re-reading an earlier step, freeze the live cursor so
    // the card doesn't jump out from under them. Completions still register on
    // state.completed; we catch up the moment they leave review.
    if (isReviewing()) return;
    let index = getIndex();
    let changed = false;
    const cleared = [];
    while (index < steps.length - 1 && isStepComplete(steps[index])) {
      cleared.push(steps[index]);
      index += 1;
      state.step = steps[index].id;
      changed = true;
    }
    if (changed) {
      const justCleared = cleared[cleared.length - 1];
      if (justCleared && state.lastCelebratedStep !== justCleared.id) {
        Neo.playSfx?.('powerup');
        celebrateStep(justCleared);
      } else {
        Neo.playSfx?.('achievement');
      }
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
    const currentRoomKey = getCurrentRoomKey();
    if (type === 'move') setCompleted('move');
    if (type === 'attack' && ['melee', 'laser', 'smash'].includes(payload.action)) setCompleted(payload.action);
    if (type === 'dash') setCompleted('dash');
    if (type === 'crit-dealt') setCompleted('crit_lesson');
    // status-applied: the player landed a status themselves (kept as a fast path
    // for the blood-beam roster). status-lesson-watched: the freely-given demo
    // bleed has ticked long enough for the player to read it (every character).
    if (type === 'status-applied' || type === 'status-lesson-watched') setCompleted('status_lesson');
    if (type === 'tool-fired' || type === 'tools-fired-all') setCompleted('tools_fire');
    if (type === 'enemy-killed' && payload.tutorialDummy) setCompleted('fight');
    if (type === 'relic-collected' && payload.tutorialRelic) setCompleted('relic');
    if (type === 'hud-layout-edit') setCompleted('hud_layout');
    if (type === 'panel-open' && payload.panel === 'inventory') setCompleted('inventory_open');
    if (type === 'inventory-tab' && payload.tab === 'items') setCompleted('inventory_relics');
    if (type === 'inventory-tab' && payload.tab === 'tools') setCompleted('inventory_tools');
    if (type === 'inventory-tab' && payload.tab === 'equipped') setCompleted('inventory_moves');
    if (type === 'inventory-tab' && payload.tab === 'weapons') setCompleted('inventory_weapons');
    if (type === 'move-equipped') setCompleted('moves_equip_do');
    if (type === 'chest-open' && currentRoomKey === state.treasureRoomKey) setCompleted('treasure_open');
    if (type === 'treasure-item-collected' && currentRoomKey === state.treasureRoomKey) setCompleted('treasure_collect');
    if (type === 'secret-revealed') setCompleted('secret_reveal_do');
    if (type === 'panel-open' && payload.panel === 'shop' && currentRoomKey === state.shopRoomKey) setCompleted('shop_open');
    if (type === 'shop-purchase' && payload.tutorialOffer) setCompleted('shop_buy');
    if (type === 'panel-open' && payload.panel === 'forge' && currentRoomKey === state.forgeRoomKey) setCompleted('forge_open');
    if (type === 'forge-item-select' && payload.itemType === 'move' && currentRoomKey === state.forgeRoomKey) setCompleted('forge_item_select');
    if (type === 'forge-pay-currency' && payload.currency === 'gold' && currentRoomKey === state.forgeRoomKey) setCompleted('forge_pay_currency');
    if (type === 'forge-stage' && currentRoomKey === state.forgeRoomKey) setCompleted('forge_stage');
    if (type === 'forge-confirm' && currentRoomKey === state.forgeRoomKey) setCompleted('forge_confirm');
    if (type === 'challenge-started' && payload.challengeType === 'bomb') setCompleted('challenge_start');
    if (type === 'challenge-completed' && payload.challengeType === 'bomb') setCompleted('challenge_bombs');
    if (type === 'enemy-killed' && currentRoomKey === state.ladderRoomKey
      && Neo.currentRoom?.cleared) setCompleted('ladder_fight');
    if (type === 'room-enter') {
      if (currentRoomKey === state.trainingRoomKey) setCompleted('dwell_do');
      advanceCompletedSteps();
    }
    if (type === 'ladder-use') {
      setCompleted('ladder_use');
      complete();
    }
    render(true);
    return true;
  }

  // Leave review and snap back to the live step, catching up any completions
  // earned (or auto-advances missed) while the card was parked.
  function exitReview() {
    const state = getState();
    if (!state || !isReviewing()) return false;
    state.reviewIndex = null;
    advanceCompletedSteps();
    render(true);
    Neo.updateObjective?.();
    return true;
  }

  // The Continue button does double duty: while reviewing it returns to the
  // live step; on a manual lesson it marks the lesson read and moves on.
  function manualNext() {
    if (exitReview()) return;
    const step = getPresentedStep();
    if (!step?.manual) return;
    setCompleted(step.id);
    render(true);
  }

  // Back steps the display cursor toward the first step so the player can
  // re-read anything they've passed. It never rewinds real progress: the live
  // `step` is untouched, only `reviewIndex` moves.
  function back() {
    const state = getState();
    if (!state?.active) return;
    const fromIndex = getDisplayIndex();
    if (fromIndex <= 0) return;
    state.reviewIndex = fromIndex - 1;
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
    playSummaryScene();
  }

  // The graduation beat — only fires on genuine ladder completion (complete()),
  // never on skipTutorial(). It runs after the tutorial state is already
  // deactivated, so playDialogue drives it as a normal cutscene.
  function playSummaryScene() {
    const scene = TUTORIAL_SCENES.summary;
    if (!scene || Neo.uiController?.isDialogueOpen?.()) return;
    if (Neo.player) {
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 24, life: 1.1, text: 'TUTORIAL COMPLETE!', c: '#ffe66f' });
    }
    Neo.uiController?.playDialogue?.(scene.lines, { returnState: 'play' });
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
    if (spec.kind === 'route') {
      // While a panel covers the screen, highlight its close button so the
      // player can clear it before the doorway highlight makes sense. This case
      // keeps the dimming spotlight (routeDoor=false) so the one button stands
      // out against the open panel; only the actual world doorway drops the tint.
      const open = getOpenGamePanelInfo();
      if (open) {
        const button = document.querySelector(open.closeSelector);
        if (button && !button.closest('.hidden,[aria-hidden="true"]')) {
          const rect = button.getBoundingClientRect();
          if (rect.width && rect.height) return { ...normalizeRect(rect, 8), route: true, routeDoor: false };
        }
      }
      const resolved = resolveWorldRect(spec.doorGetter?.(), spec.padding);
      return resolved ? { ...resolved, route: true, routeDoor: true } : null;
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
      // Don't force full width — honour the CSS cap so the card stays a
      // readable size and leaves the right edge free for the hamburger.
      card.style.width = '';
      const cardW = card.getBoundingClientRect().width;
      if (placeTop) {
        // Top-anchored: keep clear of the top-right hamburger (~38px + insets,
        // ~54px total). Left-align unless that would collide, then shift left.
        const hamburgerSafe = touchControlsVisible ? 54 : 0;
        const maxLeft = viewportW - cardW - margin - hamburgerSafe;
        card.style.left = `${Math.max(margin, maxLeft)}px`;
        card.style.top = `${margin}px`;
        card.style.bottom = 'auto';
      } else {
        // Bottom-anchored: clear the joystick (left, up to 45vw / 220px) and the
        // button cluster (right, ~170px) so the controls are never covered.
        const controlsHeight = touchControlsVisible
          ? Math.min(220, viewportW * 0.45) + margin
          : margin;
        card.style.left = `${margin}px`;
        card.style.top = 'auto';
        card.style.bottom = `${controlsHeight}px`;
      }
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

  // The minimap highlight that rides alongside a route step, so the player
  // learns to read the minimap while a doorway arrow points the way. Returns
  // false (and hides the ring) when the minimap isn't on screen.
  function layoutMinimapRing(show) {
    if (!minimapRing) return false;
    const rect = show ? normalizeRect(Neo.minimapLayoutState?.viewportBounds, 8) : null;
    if (!rect) {
      minimapRing.classList.add('hidden');
      return false;
    }
    minimapRing.classList.remove('hidden');
    minimapRing.style.left = `${rect.left}px`;
    minimapRing.style.top = `${rect.top}px`;
    minimapRing.style.width = `${rect.width}px`;
    minimapRing.style.height = `${rect.height}px`;
    return true;
  }

  function layoutTarget(step) {
    const targetRect = resolveTarget(step);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const hasTarget = !!targetRect;
    // On "go to the door" steps we point an arrow at the doorway and light up
    // the minimap instead of tinting the whole screen, which read as harsh when
    // the player just needs a direction. The dim spotlight stays for in-place UI
    // lessons (and for the panel close-button highlight, where routeDoor is
    // false) so the highlighted control still stands out.
    const routeMode = !!targetRect?.routeDoor;
    overlay?.classList.toggle('tutorial-route', routeMode);
    layoutMinimapRing(routeMode);
    const edgeMargin = 28;
    const targetCenterX = hasTarget ? targetRect.left + targetRect.width / 2 : viewportW / 2;
    const targetCenterY = hasTarget ? targetRect.top + targetRect.height / 2 : viewportH / 2;
    const offscreen = hasTarget && (
      targetRect.right < edgeMargin
      || targetRect.left > viewportW - edgeMargin
      || targetRect.bottom < edgeMargin
      || targetRect.top > viewportH - edgeMargin
    );
    let offscreenDirection = '';
    if (offscreen) {
      const dx = targetCenterX - viewportW / 2;
      const dy = targetCenterY - viewportH / 2;
      offscreenDirection = Math.abs(dx) >= Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up' : 'down');
    }
    if (hole) {
      hole.setAttribute('x', String(hasTarget && !offscreen ? targetRect.left : viewportW / 2 - 1));
      hole.setAttribute('y', String(hasTarget && !offscreen ? targetRect.top : viewportH / 2 - 1));
      hole.setAttribute('width', String(hasTarget && !offscreen ? targetRect.width : 2));
      hole.setAttribute('height', String(hasTarget && !offscreen ? targetRect.height : 2));
      hole.setAttribute('rx', String(hasTarget && !offscreen ? Math.min(18, targetRect.height / 3) : 1));
    }
    if (ring) {
      ring.classList.toggle('hidden', !hasTarget);
      ring.classList.toggle('tutorial-target-ring--route', !!targetRect?.route);
      ring.classList.toggle('tutorial-target-ring--offscreen', offscreen);
      ring.dataset.direction = offscreenDirection;
      if (hasTarget) {
        const width = offscreen ? 86 : targetRect.width;
        const height = offscreen ? 62 : targetRect.height;
        const left = offscreen
          ? Math.max(edgeMargin, Math.min(viewportW - width - edgeMargin, targetCenterX - width / 2))
          : targetRect.left;
        const top = offscreen
          ? Math.max(edgeMargin, Math.min(viewportH - height - edgeMargin, targetCenterY - height / 2))
          : targetRect.top;
        ring.style.left = `${left}px`;
        ring.style.top = `${top}px`;
        ring.style.width = `${width}px`;
        ring.style.height = `${height}px`;
      }
    }
    placeCard(offscreen ? null : targetRect);
  }

  // The tutorial overlay normally only shows during 'play' (via
  // isFirstRunTutorialEngaged). Steps flagged liveDuringPause keep it visible
  // through the pause menu / settings — needed for the guided HUD-editor path.
  function isEngaged() {
    const state = getState();
    if (!state?.active || Neo.gameMode !== 'normal') return false;
    if (Neo.isFirstRunTutorialEngaged?.()) return true;
    return Neo.gameState === 'pause' && !!getStep()?.liveDuringPause;
  }

  function render(force = false) {
    const state = getState();
    if (!state?.active || !isEngaged()) {
      hide();
      return;
    }
    runLiveStepLifecycle();
    const step = getPresentedStep();
    overlay?.classList.remove('hidden');
    overlay?.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.style.display = 'block';
    document.body.classList.add('tutorial-active');
    if (overlay) overlay.dataset.inputMode = getInputMode();
    const chapter = step.chapter || 'TUTORIAL';
    if (speaker) {
      speaker.textContent = chapter;
      // A new chapter gets a one-beat "announce" flash + stinger so the long
      // run of lessons reads as distinct acts rather than a flat checklist.
      if (chapter !== lastChapter) {
        speaker.classList.remove('tutorial-speaker--announce');
        void speaker.offsetWidth;
        speaker.classList.add('tutorial-speaker--announce');
        if (lastChapter) Neo.playSfx?.('powerup');
        lastChapter = chapter;
      }
    }
    if (title) title.textContent = step.title || 'Tutorial';
    if (text) text.textContent = step.text?.() || '';
    const nextCommand = String(step.command?.() || '').trim();
    if (command) {
      command.hidden = !nextCommand;
      command.classList.toggle('hidden', !nextCommand);
    }
    if (commandLabel) commandLabel.textContent = nextCommand ? (step.commandLabel || 'PRESS') : '';
    if (commandValue) commandValue.textContent = nextCommand;
    const reviewing = isReviewing();
    const displayIndex = getDisplayIndex();
    if (progress) progress.textContent = `${displayIndex + 1} / ${steps.length}`;
    if (progressBar) progressBar.style.width = `${((displayIndex + 1) / steps.length) * 100}%`;
    if (gate) gate.hidden = true;
    if (hint) {
      hint.textContent = reviewing ? 'REVIEWING — HIT RESUME TO RETURN'
        : (step.manual ? 'GOT IT? HIT CONTINUE' : 'DO THE ACTION — IT ADVANCES ON ITS OWN');
    }
    if (previous) previous.disabled = displayIndex <= 0;
    // While reviewing, the forward button always shows so the player can jump
    // straight back to the live step; otherwise it only appears on manual cards.
    if (next) {
      next.hidden = !reviewing && !step.manual;
      next.disabled = !reviewing && !step.manual;
      next.textContent = reviewing ? 'Resume' : 'Continue';
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
    // Tear down the live step (closes any panel it opened, e.g. the HUD layout
    // editor) so skipping/completing the tutorial never strands an open overlay.
    // Guarded so the per-tick hide() while inactive only runs onExit once.
    if (lastLiveStepId) {
      const prev = steps.find(step => step.id === lastLiveStepId);
      lastLiveStepId = '';
      try { prev?.onExit?.(); } catch (e) { /* never let a side-effect break teardown */ }
    }
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.style.display = 'none';
    ring?.classList.add('hidden');
    minimapRing?.classList.add('hidden');
    overlay?.classList.remove('tutorial-route');
    document.body.classList.remove('tutorial-active');
  }

  function tick() {
    const state = getState();
    if (!state?.active) {
      hide();
      return;
    }
    if (Neo.gameState === 'play') {
      const step = getStep();
      if (isInStepRoom(step, state) && (state.step === 'melee' || state.step === 'laser' || state.step === 'smash' || state.step === 'fight')) {
        Neo.ensureTutorialDummyEnemy?.();
      }
      if (isInStepRoom(step, state) && state.step === 'relic') Neo.ensureTutorialRelicPickup?.();
    }
    advanceCompletedSteps();
    const gamepadConfirm = !!window.NeoGamepad?.[0]?.buttonStates?.[0];
    if (gamepadConfirm && !gamepadConfirmHeld && (isReviewing() || getStep()?.manual)) manualNext();
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
      if (event.key !== 'Enter' || !getState()?.active || !(isReviewing() || getStep()?.manual)) return;
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
    const step = getStep();
    // The secret vendor room is never a step's target room, so it gets a pass:
    // its scene is a payoff the moment the player walks into the revealed room.
    if (room.tutorialLesson !== 'start' && room.tutorialLesson !== 'secret'
      && (!step?.roomKey || roomKey(room) !== state[step.roomKey])) return false;
    const sceneId = TUTORIAL_LESSON_SCENE[room.tutorialLesson];
    const scene = TUTORIAL_SCENES[sceneId];
    if (!scene || state.seenScenes?.[sceneId] || Neo.uiController?.isDialogueOpen?.()) return false;
    const started = Neo.uiController?.playDialogue?.(scene.lines, {
      returnState: 'play',
      onComplete: () => {
        document.body.classList.remove('tutorial-cutscene-active');
        Neo.scheduleRunSave?.();
        render(true);
      },
    });
    if (started) {
      // Mark the scene seen as soon as it actually starts, not when it finishes —
      // otherwise leaving the room mid-dialogue (e.g. dashing back out the door
      // before onComplete fires) leaves it "unseen" and replays it on re-entry.
      if (!state.seenScenes || typeof state.seenScenes !== 'object') state.seenScenes = {};
      state.seenScenes[sceneId] = true;
      document.body.classList.add('tutorial-cutscene-active');
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

  // The in-world objective tracker and step message always reflect the live
  // step, never a step being re-read in review mode — the card alone shows the
  // reviewed lesson, so the HUD objective shouldn't desync to a past "done".
  function getCurrentMessage() {
    const step = getPresentedStep(getStep());
    return step?.text?.() || '';
  }

  function getCurrentObjectiveEntries() {
    const step = getPresentedStep(getStep());
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
    // Live step id (ignores Back/Forward review). Lets a panel a step opened —
    // e.g. the HUD layout editor — tell whether its tutorial step is active.
    getLiveStepId: () => (getState()?.active ? getStep()?.id || '' : ''),
  };
}

Neo.TUTORIAL_VERSION = TUTORIAL_VERSION;
Neo.createTutorialController = createTutorialController;
