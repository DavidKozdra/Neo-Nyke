// notifications.js — item toast notifications and icon drawing.

// How long a pickup toast (item/move/weapon) stays before it animates out.
const TOAST_HOLD_MS = 4000;
const TOAST_LEAVE_MS = 220;
// "Ready" cues fire mid-combat (a relic finished charging), so they dismiss
// faster than pickup toasts to avoid lingering during a fight.
const READY_TOAST_HOLD_MS = 1800;

export function ensureItemNotifyStack() {
  let stack = document.getElementById('itemNotifyStack');
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'itemNotifyStack';
  (document.getElementById('wrap') || document.body).appendChild(stack);
  return stack;
}

export function getRarityNameColor(rarity) {
  return Neo.RARITY_NAME_COLORS[String(rarity || '').toLowerCase()] || '#d8e9ff';
}

// GOD is the top rarity tier. ('red' is a legacy alias kept for old save data.)
export function isGodTier(rarity) {
  const r = String(rarity || '').toLowerCase();
  return r === 'god' || r === 'red';
}

export function drawItemToastIcon(canvas, item) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const color = item?.color || '#ffffff';
  const iconDef = window.NeoNykeIconDefs?.items?.[item?.key];
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (iconDef) {
    const scale = canvas.width / 32;
    ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
    ctx2d.beginPath();
    ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
    ctx2d.fill();
    ctx2d.shadowColor = iconDef.accent || color;
    ctx2d.shadowBlur = isGodTier(item?.rarity) ? 8 * scale : 5 * scale;
    ctx2d.fillStyle = color;
    iconDef.pixels.forEach(([px, py]) => {
      ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
    });
    if (iconDef.accent) {
      ctx2d.shadowBlur = 0;
      ctx2d.fillStyle = iconDef.accent;
      (iconDef.accentPixels || []).forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
    }
    ctx2d.shadowBlur = 0;
    return;
  }
  const symbol = Neo.getRarityGlyph?.(item?.rarity) || '●';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = canvas.width * 0.38;
  ctx2d.fillStyle = color;
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = isGodTier(item?.rarity) ? 8 : 5;
  ctx2d.beginPath();
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
  ctx2d.fill();
  if (item?.accent) {
    ctx2d.shadowBlur = 0;
    ctx2d.strokeStyle = item.accent;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = '#071018';
  ctx2d.font = `bold ${Math.round(canvas.width * 0.3)}px system-ui`;
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(symbol, cx, cy + 0.5);
}

export function resolveItemIconDef(itemKey) {
  return Neo.itemRegistry?.get?.(itemKey) || Neo.ITEM_DEFS?.[itemKey] || null;
}

export function drawItemIconByKey(canvas, itemKey, overrides = null) {
  const item = resolveItemIconDef(itemKey);
  if (!item) return;
  drawItemToastIcon(canvas, overrides ? { ...item, ...overrides, key: itemKey } : item);
}

export function drawItemIconCanvases(container, dataAttr = 'data-item-icon') {
  container?.querySelectorAll?.(`[${dataAttr}]`).forEach(canvas => {
    drawItemIconByKey(canvas, canvas.getAttribute(dataAttr));
  });
}

export function pushItemNotification(itemKey, amount = 1, note = '') {
  const item = resolveItemIconDef(itemKey);
  if (!item || amount <= 0) return;
  const stack = ensureItemNotifyStack();
  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = item.color || '#9ec6ff';
  const icon = document.createElement('canvas');
  icon.className = 'item-toast-icon';
  icon.width = 40;
  icon.height = 40;
  drawItemToastIcon(icon, item);
  const body = document.createElement('div');
  body.className = 'item-toast-body';
  const title = document.createElement('div');
  title.className = 'item-toast-title';
  const name = document.createElement('span');
  name.textContent = item.name;
  // Only the name takes the rarity color; the description stays white.
  const rarityColor = getRarityNameColor(item.rarity || item.category);
  name.style.color = rarityColor;
  const plus = document.createElement('span');
  plus.className = 'item-toast-amount';
  plus.textContent = `+${amount}`;
  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.style.color = '#ffffff';
  desc.textContent = note ? `${item.description} ${note}` : item.description;
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), TOAST_LEAVE_MS);
  }, TOAST_HOLD_MS);
}

// Status toasts (relic "Ready" cues, "Copied!" bonuses) are transient status
// updates — deliberately NOT the same widget as new-item pickups. They live in
// their own bottom-center stack with a compact pill style so the player never
// mistakes "Keen Eye Ready" for picking up a brand-new item.
export function ensureStatusToastStack() {
  let stack = document.getElementById('statusToastStack');
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'statusToastStack';
  (document.getElementById('wrap') || document.body).appendChild(stack);
  return stack;
}

// Low-level builder. `text` is the main message; `label` is an optional uppercase
// tag (e.g. "Ready", "Surge"); `accent`/`iconCanvas` are optional. `holdMs`
// controls how long it lingers before animating out.
export function pushStatusToast({ text, label = '', accent = '#9ec6ff', iconCanvas = null, holdMs = READY_TOAST_HOLD_MS } = {}) {
  if (!text && !label) return;
  const stack = ensureStatusToastStack();
  const toast = document.createElement('div');
  toast.className = 'status-toast';
  toast.style.setProperty('--status-toast-accent', accent);
  if (iconCanvas) {
    iconCanvas.classList.add('status-toast-icon');
    toast.append(iconCanvas);
  }
  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'status-toast-label';
    labelEl.textContent = label;
    toast.append(labelEl);
  }
  if (text) {
    const textEl = document.createElement('span');
    textEl.className = 'status-toast-text';
    textEl.textContent = text;
    toast.append(textEl);
  }
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), TOAST_LEAVE_MS);
  }, holdMs);
}

// Shown when a charge relic finishes charging (e.g. Keen Eye "Ready", Crit Charm
// "Surge"). `note` overrides the default text (used for the Charged Adapter's
// "Press X" hint).
export function pushReadyNotification(itemKey, { label = 'Ready', note = '' } = {}) {
  const item = resolveItemIconDef(itemKey);
  if (!item) return;
  const icon = document.createElement('canvas');
  icon.width = 40;
  icon.height = 40;
  drawItemToastIcon(icon, item);
  pushStatusToast({
    label,
    text: note || item.name,
    accent: item.color || '#9ec6ff',
    iconCanvas: icon,
  });
}

// Shown alongside a normal item-pickup card when a duplicate-chance roll grants a
// bonus copy. Kept separate from the pickup card so the bonus never reads as the
// item's own description.
export function pushCopiedNotification(itemKey) {
  const item = resolveItemIconDef(itemKey);
  if (!item) return;
  const icon = document.createElement('canvas');
  icon.width = 40;
  icon.height = 40;
  drawItemToastIcon(icon, item);
  pushStatusToast({
    label: 'Copied',
    text: `Bonus ${item.name}`,
    accent: item.color || '#ffd27d',
    iconCanvas: icon,
  });
}

export const ITEM_CINEMATIC_FLAVOR = {
  wizards_paw: 'Choose 2 stats to increase by 50% — choose wisely.',
  jesters_dice: 'Skip 3 floors. Chaos blooms in your wake.',
};

let cinematicTimer = null;

export function showItemCinematic(itemKey, onDone) {
  const item = resolveItemIconDef(itemKey);
  if (!item) { if (onDone) onDone(); return; }
  const el = document.getElementById('itemCinematic');
  const canvas = document.getElementById('itemCinematicCanvas');
  const nameEl = document.getElementById('itemCinematicName');
  const flavorEl = document.getElementById('itemCinematicFlavor');
  if (!el || !Neo.canvas || !nameEl || !flavorEl) { if (onDone) onDone(); return; }
  const color = item.color || '#ffcf80';
  el.style.setProperty('--cinematic-color', color);
  nameEl.textContent = item.name || itemKey;
  flavorEl.textContent = ITEM_CINEMATIC_FLAVOR[itemKey] || item.description || '';
  canvas.width = 64;
  canvas.height = 64;
  drawItemToastIcon(canvas, item);
  el.classList.remove('hidden', 'is-leaving');
  el.setAttribute('aria-hidden', 'false');
  if (cinematicTimer) clearTimeout(cinematicTimer);
  cinematicTimer = setTimeout(() => {
    el.classList.add('is-leaving');
    cinematicTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('is-leaving');
      el.setAttribute('aria-hidden', 'true');
      cinematicTimer = null;
      if (onDone) onDone();
    }, 260);
  }, 1400);
}

export function drawMoveToastIcon(canvas, moveDef) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const slotColor = { melee: '#ff9a6b', laser: '#78d7ff', smash: '#c08cff', dash: '#79f7bf' };
  const color = slotColor[moveDef?.slot] || '#9ec6ff';
  const iconDef = window.NeoNykeIconDefs?.moves?.[moveDef?.key];
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (iconDef) {
    const scale = canvas.width / 32;
    ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
    ctx2d.beginPath();
    ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
    ctx2d.fill();
    ctx2d.shadowColor = iconDef.color;
    ctx2d.shadowBlur = 7 * scale;
    ctx2d.fillStyle = iconDef.color;
    iconDef.pixels.forEach(([px, py]) => {
      ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
    });
    if (iconDef.accent) {
      ctx2d.shadowBlur = 0;
      ctx2d.fillStyle = iconDef.accent;
      (iconDef.accentPixels || []).forEach(([px, py]) => {
        ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
      });
    }
    ctx2d.shadowBlur = 0;
    return;
  }
  const slotGlyph = { melee: '⚔', laser: '✦', smash: '⬣', dash: '➤' };
  const glyph = slotGlyph[moveDef?.slot] || '✦';
  ctx2d.fillStyle = color;
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = 7;
  ctx2d.beginPath();
  ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = '#071018';
  ctx2d.font = 'bold 12px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(glyph, 15, 15.5);
}

export function drawWeaponToastIcon(canvas, weaponDef) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const color = weaponDef?.color || '#ffffff';
  const iconDef = window.NeoNykeIconDefs?.weapons?.[weaponDef?.key];
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  if (iconDef) {
    const scale = canvas.width / 32;
    ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
    ctx2d.beginPath();
    ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
    ctx2d.fill();
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 7 * scale;
    ctx2d.fillStyle = color;
    iconDef.pixels.forEach(([px, py]) => {
      ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
    });
    ctx2d.shadowBlur = 0;
    return;
  }
  ctx2d.fillStyle = color;
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = 6;
  ctx2d.beginPath();
  ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = '#071018';
  ctx2d.font = 'bold 11px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('⚔', 15, 15.5);
}

export function drawHealToastIcon(canvas, healId) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const iconDef = window.NeoNykeIconDefs?.heals?.[healId];
  const color = iconDef?.color || '#50e880';
  const scale = canvas.width / 32;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
  ctx2d.beginPath();
  ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
  ctx2d.fill();
  if (iconDef) {
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 7 * scale;
    ctx2d.fillStyle = color;
    iconDef.pixels.forEach(([px, py]) => {
      ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
    });
    ctx2d.shadowBlur = 0;
    return;
  }
  ctx2d.fillStyle = color;
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = 6;
  ctx2d.beginPath();
  ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = '#071018';
  ctx2d.font = 'bold 12px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText('+', 15, 15.5);
}

export function drawHazardKillerIcon(canvas, hazardId) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const iconDef = window.NeoNykeIconDefs?.hazards?.[hazardId];
  if (!iconDef) return;
  const scale = canvas.width / 32;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.shadowColor = iconDef.color;
  ctx2d.shadowBlur = 7 * scale;
  ctx2d.fillStyle = iconDef.color;
  iconDef.pixels.forEach(([px, py]) => {
    ctx2d.fillRect(px * 4 * scale, py * 4 * scale, 4 * scale, 4 * scale);
  });
  ctx2d.shadowBlur = 0;
}

const INVENTORY_UI_ICON_DEFS = {
  'tab-stats': {
    color: '#8fd2ff',
    accent: '#f0b97d',
    pixels: [[2,6],[3,6],[4,6],[5,6],[2,4],[3,4],[4,4],[5,4],[2,2],[3,2],[4,2],[5,2]],
    accentPixels: [[2,5],[3,5],[2,3],[3,3],[2,1],[3,1]],
  },
  'tab-relics': {
    color: '#ffd47a',
    accent: '#ffffff',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[0,3],[7,3],[0,4],[7,4],[1,5],[6,5],[2,6],[5,6],[3,7],[4,7]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'tab-weapons': {
    color: '#ff9a6b',
    accent: '#e8f7ff',
    pixels: [[5,0],[5,1],[4,2],[4,3],[3,4],[2,5],[1,6],[0,7]],
    accentPixels: [[1,5],[2,6],[3,6],[2,7]],
  },
  'tab-moves': {
    color: '#79f7bf',
    accent: '#fff1a8',
    pixels: [[4,0],[3,1],[3,2],[2,3],[4,3],[3,4],[3,5],[2,6]],
    accentPixels: [[5,0],[4,1],[5,3],[4,4]],
  },
  hp: {
    color: '#ff6b7a',
    accent: '#ffd6dd',
    pixels: [[2,1],[3,1],[5,1],[6,1],[1,2],[4,2],[7,2],[1,3],[7,3],[2,4],[6,4],[3,5],[5,5],[4,6]],
    accentPixels: [[2,2],[3,2]],
  },
  attack: {
    color: '#ffb46b',
    accent: '#e8f7ff',
    pixels: [[5,0],[5,1],[4,2],[4,3],[3,4],[2,5],[1,6],[0,7]],
    accentPixels: [[1,5],[2,6],[3,6],[2,7]],
  },
  speed: {
    color: '#ffe26b',
    accent: '#ffffff',
    pixels: [[4,0],[3,1],[3,2],[2,3],[4,3],[3,4],[3,5],[2,6]],
    accentPixels: [[5,0],[4,1],[5,3],[4,4]],
  },
  crit: {
    color: '#f5a623',
    accent: '#fff1c6',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[0,3],[3,3],[4,3],[7,3],[0,4],[3,4],[4,4],[7,4],[1,5],[6,5],[2,6],[5,6],[3,7],[4,7]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  item: {
    color: '#ffd47a',
    accent: '#ffffff',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[1,3],[3,3],[4,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[4,2],[3,4],[4,4]],
  },
  range: {
    color: '#78d7ff',
    accent: '#ffffff',
    pixels: [[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[4,1],[5,2],[6,4],[4,5]],
    accentPixels: [[6,3],[7,3]],
  },
  defense: {
    color: '#6dde88',
    accent: '#d9ffe1',
    pixels: [[2,0],[3,0],[4,0],[5,0],[1,1],[6,1],[1,2],[6,2],[1,3],[6,3],[2,4],[5,4],[3,5],[4,5],[4,6]],
    accentPixels: [[3,1],[4,1],[3,2],[4,2]],
  },
  bleed: {
    color: '#e05c5c',
    accent: '#ffd0d0',
    pixels: [[4,0],[3,1],[4,1],[3,2],[4,2],[2,3],[5,3],[2,4],[5,4],[3,5],[4,5],[4,6]],
    accentPixels: [[3,3],[3,4]],
  },
  'empty-weapon': {
    color: '#93aabc',
    accent: '#526577',
    pixels: [[5,0],[5,1],[4,2],[4,3],[3,4],[2,5],[1,6],[0,7]],
    accentPixels: [[1,5],[2,6],[3,6],[2,7]],
  },
  'empty-move': {
    color: '#93aabc',
    accent: '#526577',
    pixels: [[3,1],[4,1],[3,2],[4,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[3,5],[4,5],[3,6],[4,6]],
    accentPixels: [],
  },
  'role-princess': {
    color: '#ff9ccf',
    accent: '#fff1f8',
    pixels: [[1,2],[2,1],[3,2],[4,1],[5,2],[6,1],[7,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[1,4],[6,4],[2,5],[3,5],[4,5],[5,5],[2,6],[5,6]],
    accentPixels: [[3,4],[4,4]],
  },
  'role-knight': {
    color: '#d8d4c8',
    accent: '#ffffff',
    pixels: [[3,0],[4,0],[2,1],[5,1],[2,2],[5,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6],[4,7]],
    accentPixels: [[3,1],[4,1],[3,2],[4,2]],
  },
  'role-wizard': {
    color: '#b985ff',
    accent: '#fff1a8',
    pixels: [[4,0],[3,1],[4,1],[5,1],[2,2],[3,2],[4,2],[5,2],[6,2],[3,3],[4,3],[5,3],[3,4],[4,4],[5,4],[2,5],[6,5],[1,6],[7,6]],
    accentPixels: [[4,2],[4,3],[3,5],[5,5]],
  },
  'role-god': {
    color: '#e8c040',
    accent: '#fff8cc',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[0,3],[3,3],[4,3],[7,3],[0,4],[3,4],[4,4],[7,4],[1,5],[6,5],[2,6],[5,6],[3,7],[4,7]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'role-knave': {
    color: '#ff7a9a',
    accent: '#d7fff2',
    pixels: [[5,0],[5,1],[4,2],[4,3],[3,4],[2,5],[1,6],[0,7],[2,2],[3,3],[5,4],[6,5]],
    accentPixels: [[1,5],[2,6],[3,6],[2,7]],
  },

  // --- Run modifier icons (mods panel) ---
  // Each challenge, chaos mod and legacy upgrade gets a picture rather than the
  // text abbreviation the panel used to show, so the mods panel reads like the
  // item and shop screens. Keys are `mod-<defKey>`; the accent color is kept
  // close to each def's own `accent` so the card frame and the art agree.
  'mod-no_hit': { // struck heart with a crack through it
    color: '#ff5c78',
    accent: '#ffe0e6',
    pixels: [[2,1],[3,1],[5,1],[6,1],[1,2],[7,2],[1,3],[7,3],[2,4],[6,4],[3,5],[5,5],[4,6]],
    accentPixels: [[4,2],[3,3],[4,4],[3,5]],
  },
  'mod-no_items': { // relic orb struck through by a bar
    color: '#7fd0ff',
    accent: '#ffffff',
    pixels: [[3,1],[4,1],[2,2],[5,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[6,1],[5,2],[4,3],[3,4],[2,5],[1,6]],
  },
  'mod-fragile_body': { // heart broken down the middle
    color: '#f28b54',
    accent: '#ffe3cd',
    pixels: [[2,1],[3,1],[5,1],[6,1],[1,2],[7,2],[1,3],[7,3],[2,4],[6,4],[3,5],[5,5],[4,6]],
    accentPixels: [[4,2],[3,3],[4,3],[3,4]],
  },
  'mod-swarm_rooms': { // three stacked enemy heads
    color: '#9ce070',
    accent: '#e6ffd6',
    pixels: [[1,1],[2,1],[1,2],[2,2],[5,1],[6,1],[5,2],[6,2],[3,4],[4,4],[3,5],[4,5],[2,6],[5,6]],
    accentPixels: [[1,1],[5,1],[3,4]],
  },
  'mod-elite_hunt': { // crown over a target
    color: '#d8b0ff',
    accent: '#f6ecff',
    pixels: [[1,1],[3,1],[5,1],[1,2],[2,2],[3,2],[4,2],[5,2],[3,4],[2,5],[4,5],[1,6],[5,6],[3,7]],
    accentPixels: [[3,1],[3,4]],
  },
  'mod-cursed_shops': { // coin marked with a curse cross
    color: '#f0c85a',
    accent: '#fff4d0',
    pixels: [[2,1],[3,1],[4,1],[1,2],[5,2],[1,3],[5,3],[1,4],[5,4],[2,5],[3,5],[4,5]],
    accentPixels: [[2,2],[4,2],[3,3],[2,4],[4,4]],
  },
  'mod-glass_cannon': { // cracked crystal shard
    color: '#ff8dd2',
    accent: '#ffe4f5',
    pixels: [[3,0],[4,0],[2,1],[5,1],[2,2],[5,2],[2,3],[5,3],[2,4],[5,4],[3,5],[4,5],[3,6],[4,6]],
    accentPixels: [[4,1],[3,2],[4,3],[3,4]],
  },
  'mod-cursed_blood': { // dripping blood droplet
    color: '#85df63',
    accent: '#dcffcb',
    pixels: [[4,0],[3,1],[4,1],[3,2],[4,2],[2,3],[5,3],[2,4],[5,4],[3,5],[4,5],[4,6],[4,7]],
    accentPixels: [[3,3],[3,4]],
  },
  'mod-overcharged': { // lightning bolt
    color: '#9adfff',
    accent: '#ffffff',
    pixels: [[4,0],[3,1],[4,1],[2,2],[3,2],[2,3],[3,3],[4,3],[5,3],[3,4],[4,4],[3,5],[2,6],[3,6]],
    accentPixels: [[4,0],[3,3],[4,3]],
  },
  'mod-random_character': { // two swapped silhouettes
    color: '#ff8dd2',
    accent: '#ffe4f5',
    pixels: [[1,1],[2,1],[1,2],[2,2],[1,3],[2,3],[5,4],[6,4],[5,5],[6,5],[5,6],[6,6],[3,2],[4,2],[3,5],[4,5]],
    accentPixels: [[4,1],[4,2],[3,5],[3,6]],
  },
  'mod-random_loadout': { // four shuffled slot pips
    color: '#7fd0ff',
    accent: '#e4f6ff',
    pixels: [[1,1],[2,1],[1,2],[2,2],[5,1],[6,1],[5,2],[6,2],[1,5],[2,5],[1,6],[2,6],[5,5],[6,5],[5,6],[6,6],[3,3],[4,3],[3,4],[4,4]],
    accentPixels: [[3,3],[4,4]],
  },
  'mod-enemy_reincarnation': { // skull with a rebirth spark
    color: '#9ce070',
    accent: '#eaffdc',
    pixels: [[2,1],[3,1],[4,1],[5,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[2,5],[3,5],[4,5],[5,5],[2,6],[5,6]],
    accentPixels: [[2,3],[5,3],[3,4],[4,4]],
  },
  'mod-random_enemy_levels': { // dice face
    color: '#f0c85a',
    accent: '#fff4d0',
    pixels: [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[1,5],[6,5],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6]],
    accentPixels: [[2,2],[5,2],[3,3],[4,4],[2,5],[5,5]],
  },
  'mod-authored_first_floor': { // drafted floor plan grid
    color: '#d8b0ff',
    accent: '#f6ecff',
    pixels: [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3],[5,3],[6,3],[5,4],[6,4],[1,5],[2,5],[3,5],[1,6],[3,6]],
    accentPixels: [[2,2],[5,3],[2,6]],
  },
  'mod-rival_bounty': { // coin purse with a bounty mark
    color: '#ffd47a',
    accent: '#fff4d0',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[4,2],[3,3],[4,3]],
  },
  'mod-elite_tracker': { // radar sweep with a blip
    color: '#8dd4ff',
    accent: '#e4f6ff',
    pixels: [[3,0],[4,0],[1,1],[6,1],[0,3],[7,3],[0,4],[7,4],[1,6],[6,6],[3,7],[4,7],[3,3],[4,3],[3,4],[4,4]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'mod-god_memory': { // scroll with a divine spark
    color: '#e8c040',
    accent: '#fff8cc',
    pixels: [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[1,5],[6,5],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'mod-bank_interest': { // stacked coins rising
    color: '#ffd47a',
    accent: '#fff4d0',
    pixels: [[1,5],[2,5],[1,6],[2,6],[3,3],[4,3],[3,4],[4,4],[3,5],[4,5],[3,6],[4,6],[5,1],[6,1],[5,2],[6,2],[5,3],[6,3],[5,4],[6,4],[5,5],[6,5],[5,6],[6,6]],
    accentPixels: [[5,1],[6,1],[3,3],[1,5]],
  },
  'mod-crystal_tithe': { // loop crystal with an offering plus
    color: '#83f3ff',
    accent: '#ffffff',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[4,2],[3,3],[4,3],[3,4],[4,4]],
  },
  'mod-challenge_mastery': { // laurel-flanked star
    color: '#ffb46b',
    accent: '#fff1c6',
    pixels: [[3,1],[4,1],[3,2],[4,2],[1,3],[2,3],[5,3],[6,3],[2,4],[5,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,1],[4,1],[3,2],[4,2]],
  },
  'mod-scroll_scholar': { // open scroll with text lines
    color: '#b985ff',
    accent: '#f2e6ff',
    pixels: [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[1,5],[6,5],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6]],
    accentPixels: [[2,3],[3,3],[4,3],[2,4],[3,4],[4,4]],
  },
  'mod-first_light': { // sunrise rays over a horizon
    color: '#ffe26b',
    accent: '#fff8cc',
    pixels: [[3,1],[4,1],[2,2],[5,2],[1,3],[6,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6]],
    accentPixels: [[3,1],[4,1],[3,2],[4,2],[3,3],[4,3]],
  },
  'mod-voucher_economy': { // ticket voucher with a punch hole
    color: '#79f7bf',
    accent: '#dcfff0',
    pixels: [[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[6,3],[1,4],[6,4],[1,5],[2,5],[3,5],[4,5],[5,5],[6,5]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },

  // --- Alternate game mode icons ---
  // The alt-modes panel used single Unicode glyphs, several of which had nothing
  // to do with the mode they sat on (a wheelchair sign for Treasure Hunt, a
  // hammer-and-sickle for Multiplayer). These draw the mode instead. Keys are
  // `mode-<slug>`, matching each card's data-mode-icon attribute.
  'mode-seed_speed_run': { // stopwatch racing a seed
    color: '#ffd15a',
    accent: '#fff4d0',
    pixels: [[3,0],[4,0],[2,1],[5,1],[1,2],[6,2],[1,3],[6,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[3,3],[4,3],[5,3]],
  },
  'mode-endless': { // infinity loop: two open rings crossing at the centre
    color: '#8dd4ff',
    accent: '#e4f6ff',
    pixels: [
      [1,2],[2,2],[5,2],[6,2],
      [0,3],[3,3],[4,3],[7,3],
      [0,4],[3,4],[4,4],[7,4],
      [1,5],[2,5],[5,5],[6,5],
    ],
    accentPixels: [[3,3],[4,4],[4,3],[3,4]],
  },
  'mode-boss_rush': { // horned skull with sunken eyes and a jaw
    color: '#ff6f7f',
    accent: '#ffe0e6',
    pixels: [
      [0,0],[7,0],
      [0,1],[2,1],[3,1],[4,1],[5,1],[7,1],
      [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
      // Row 3 leaves 2 and 5 empty: the gaps are the eye sockets, so the skull
      // reads by its holes rather than by drawn-on detail.
      [1,3],[3,3],[4,3],[6,3],
      [1,4],[2,4],[3,4],[4,4],[5,4],[6,4],
      [2,5],[3,5],[4,5],[5,5],
      [2,6],[4,6],
    ],
    accentPixels: [[0,0],[7,0],[3,5],[4,5]],
  },
  'mode-rival_rumble': { // crossed duelling swords
    color: '#d8b0ff',
    accent: '#f6ecff',
    pixels: [[0,0],[7,0],[1,1],[6,1],[2,2],[5,2],[3,3],[4,3],[3,4],[4,4],[2,5],[5,5],[1,6],[6,6],[0,7],[7,7]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'mode-treasure_hunt': { // treasure chest with a keyhole
    color: '#f0c85a',
    accent: '#fff4d0',
    pixels: [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[7,2],[0,3],[7,3],[0,4],[7,4],[0,5],[7,5],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6]],
    accentPixels: [[0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[3,4],[4,4]],
  },
  'mode-online': { // networked globe with orbit
    color: '#79f7bf',
    accent: '#dcfff0',
    pixels: [[2,1],[3,1],[4,1],[5,1],[1,2],[6,2],[0,3],[7,3],[0,4],[7,4],[1,5],[6,5],[2,6],[3,6],[4,6],[5,6]],
    accentPixels: [[3,1],[4,1],[0,3],[7,3],[3,6],[4,6]],
  },
  'mode-coop': { // two hearts side by side
    color: '#ff9ccf',
    accent: '#fff1f8',
    pixels: [[0,1],[1,1],[3,1],[4,1],[5,1],[7,1],[0,2],[2,2],[3,2],[5,2],[7,2],[1,3],[6,3],[2,4],[5,4],[3,5],[4,5]],
    accentPixels: [[1,1],[4,1]],
  },
  'mode-pvp': { // two fighters clashing
    color: '#ff6f7f',
    accent: '#ffe0e6',
    pixels: [[1,0],[6,0],[2,1],[5,1],[3,2],[4,2],[2,3],[5,3],[1,4],[6,4],[2,5],[5,5],[3,6],[4,6]],
    accentPixels: [[3,2],[4,2],[3,6],[4,6]],
  },
  'mode-practice': { // target dummy on a stand
    color: '#9adfff',
    accent: '#e4f6ff',
    pixels: [[2,0],[3,0],[4,0],[5,0],[1,1],[6,1],[1,2],[6,2],[2,3],[3,3],[4,3],[5,3],[3,4],[4,4],[3,5],[4,5],[2,6],[5,6]],
    accentPixels: [[3,1],[4,1]],
  },
  'mode-challenge_practice': { // portal ring into a hub
    color: '#b985ff',
    accent: '#f2e6ff',
    pixels: [[2,0],[3,0],[4,0],[5,0],[1,1],[6,1],[0,2],[7,2],[0,3],[7,3],[0,4],[7,4],[1,5],[6,5],[2,6],[3,6],[4,6],[5,6]],
    accentPixels: [[3,2],[4,2],[3,3],[4,3],[3,4],[4,4]],
  },
  'mode-beam_practice': { // charged beam firing right
    color: '#83f3ff',
    accent: '#ffffff',
    pixels: [[1,2],[2,2],[1,3],[2,3],[1,4],[2,4],[1,5],[2,5],[3,3],[4,3],[5,3],[6,3],[7,3],[3,4],[4,4],[5,4],[6,4],[7,4]],
    accentPixels: [[1,3],[2,3],[1,4],[2,4],[6,3],[7,3],[6,4],[7,4]],
  },
  'mode-sandbox': { // gear / tuning cog
    color: '#93aabc',
    accent: '#e8f7ff',
    pixels: [[3,0],[4,0],[1,1],[3,1],[4,1],[6,1],[0,3],[1,3],[6,3],[7,3],[0,4],[1,4],[6,4],[7,4],[1,6],[3,6],[4,6],[6,6],[3,7],[4,7],[2,2],[5,2],[2,5],[5,5]],
    accentPixels: [[3,3],[4,3],[3,4],[4,4]],
  },
  'mode-resume': { // play triangle
    color: '#79f7bf',
    accent: '#dcfff0',
    pixels: [[2,1],[2,2],[3,2],[2,3],[3,3],[4,3],[2,4],[3,4],[4,4],[5,4],[2,5],[3,5],[4,5],[2,6],[3,6],[2,7]],
    accentPixels: [[2,1],[2,7]],
  },
};

// Alt-mode cards name their art with `data-mode-icon="<slug>"`; unknown slugs
// fall back to the sandbox cog rather than rendering an empty frame.
export function resolveModeIconKey(slug) {
  const key = `mode-${slug}`;
  return INVENTORY_UI_ICON_DEFS[key] ? key : 'mode-sandbox';
}

// Paints every alt-mode card canvas under a root. The cards are static HTML, so
// unlike the mods panel this has to be called when the panel opens rather than
// falling out of a re-render.
export function drawModeIconCanvases(root = document) {
  root?.querySelectorAll?.('[data-mode-icon]').forEach(canvas => {
    if (typeof canvas.getContext !== 'function') return;
    drawInventoryUiIcon(canvas, resolveModeIconKey(canvas.dataset.modeIcon));
  });
}

// Maps a mods-panel def key to its pixel icon, falling back to a per-category
// generic so a newly added mod still renders a picture before it gets bespoke
// art. Used by the challenges/chaos/legacy panes.
export function resolveModIconKey(defKey, category = 'challenge') {
  const key = `mod-${defKey}`;
  if (INVENTORY_UI_ICON_DEFS[key]) return key;
  if (category === 'chaos') return 'mod-random_enemy_levels';
  if (category === 'legacy') return 'mod-crystal_tithe';
  return 'mod-elite_hunt';
}

export function drawInventoryUiIcon(canvas, iconKey) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;
  const iconDef = INVENTORY_UI_ICON_DEFS[iconKey] || INVENTORY_UI_ICON_DEFS['empty-move'];
  const scale = canvas.width / 32;
  const cell = 4 * scale;
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.fillStyle = 'rgba(0,0,0,0.45)';
  ctx2d.beginPath();
  ctx2d.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
  ctx2d.fill();
  ctx2d.shadowColor = iconDef.color;
  ctx2d.shadowBlur = 7 * scale;
  ctx2d.fillStyle = iconDef.color;
  iconDef.pixels.forEach(([px, py]) => {
    ctx2d.fillRect(px * cell, py * cell, cell, cell);
  });
  ctx2d.shadowBlur = 0;
  if (iconDef.accent) {
    ctx2d.fillStyle = iconDef.accent;
    (iconDef.accentPixels || []).forEach(([px, py]) => {
      ctx2d.fillRect(px * cell, py * cell, cell, cell);
    });
  }
}

export function pushMoveNotification(moveKey, amount = 1) {
  const moveDef = Neo.MOVE_DEFS[moveKey];
  if (!moveDef || amount <= 0) return;
  const slotColor = { melee: '#ff9a6b', laser: '#78d7ff', smash: '#c08cff', dash: '#79f7bf' };
  const color = slotColor[moveDef.slot] || '#9ec6ff';
  const stack = ensureItemNotifyStack();
  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = color;
  const icon = document.createElement('canvas');
  icon.className = 'item-toast-icon';
  icon.width = 40;
  icon.height = 40;
  drawMoveToastIcon(icon, moveDef);
  const body = document.createElement('div');
  body.className = 'item-toast-body';
  const title = document.createElement('div');
  title.className = 'item-toast-title';
  const name = document.createElement('span');
  name.textContent = `Move: ${moveDef.name}`;
  name.style.color = color;
  const plus = document.createElement('span');
  plus.className = 'item-toast-amount';
  plus.textContent = `+${amount}`;
  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.style.color = color; // moves have no rarity — match the slot color used for the name
  desc.textContent = moveDef.desc || 'New move unlocked.';
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), TOAST_LEAVE_MS);
  }, TOAST_HOLD_MS);
}

export function pushWeaponNotification(weaponKey) {
  const def = Neo.WEAPON_DEFS[weaponKey];
  if (!def) return;
  const rarityColor = { knight: '#e8f0ff', wizard: '#c08cff', god: '#ffd23f', white: '#e8f0ff', purple: '#c08cff', red: '#ffd23f' };
  const color = def.color || rarityColor[def.rarity] || '#d9e8ff';
  const stack = ensureItemNotifyStack();
  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = color;
  const icon = document.createElement('canvas');
  icon.className = 'item-toast-icon';
  icon.width = 40;
  icon.height = 40;
  drawWeaponToastIcon(icon, def);
  const body = document.createElement('div');
  body.className = 'item-toast-body';
  const title = document.createElement('div');
  title.className = 'item-toast-title';
  const name = document.createElement('span');
  name.textContent = `Weapon: ${def.name}`;
  // Only the name takes the rarity color (god tier shows full gold); description stays white.
  const nameColor = getRarityNameColor(def.rarity);
  name.style.color = nameColor;
  const plus = document.createElement('span');
  plus.className = 'item-toast-amount';
  plus.textContent = '+1';
  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.style.color = '#ffffff';
  desc.textContent = def.description || 'New weapon acquired.';
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), TOAST_LEAVE_MS);
  }, TOAST_HOLD_MS);
}

Neo.ensureItemNotifyStack = ensureItemNotifyStack;
Neo.getRarityNameColor = getRarityNameColor;
Neo.isGodTier = isGodTier;
Neo.drawItemToastIcon = drawItemToastIcon;
Neo.resolveItemIconDef = resolveItemIconDef;
Neo.drawItemIconByKey = drawItemIconByKey;
Neo.drawItemIconCanvases = drawItemIconCanvases;
Neo.pushItemNotification = pushItemNotification;
Neo.ensureStatusToastStack = ensureStatusToastStack;
Neo.pushStatusToast = pushStatusToast;
Neo.pushReadyNotification = pushReadyNotification;
Neo.pushCopiedNotification = pushCopiedNotification;
Neo.showItemCinematic = showItemCinematic;
Neo.drawMoveToastIcon = drawMoveToastIcon;
Neo.drawWeaponToastIcon = drawWeaponToastIcon;
Neo.drawHealToastIcon = drawHealToastIcon;
Neo.drawHazardKillerIcon = drawHazardKillerIcon;
Neo.drawInventoryUiIcon = drawInventoryUiIcon;
Neo.resolveModIconKey = resolveModIconKey;
Neo.resolveModeIconKey = resolveModeIconKey;
Neo.drawModeIconCanvases = drawModeIconCanvases;
Neo.pushMoveNotification = pushMoveNotification;
Neo.pushWeaponNotification = pushWeaponNotification;
