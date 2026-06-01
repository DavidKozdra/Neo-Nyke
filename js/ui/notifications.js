// notifications.js — item toast notifications and icon drawing.

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
    ctx2d.shadowBlur = item?.rarity === 'god' ? 8 * scale : 5 * scale;
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
  const symbolByRarity = { god: '✦', purple: '◆', wizard: '✹', knight: '⚔', white: '●' };
  const symbol = symbolByRarity[item?.rarity] || '●';
  ctx2d.fillStyle = color;
  ctx2d.shadowColor = color;
  ctx2d.shadowBlur = item?.rarity === 'god' ? 8 : 5;
  ctx2d.beginPath();
  ctx2d.arc(15, 15, 12, 0, Math.PI * 2);
  ctx2d.fill();
  if (item?.accent) {
    ctx2d.shadowBlur = 0;
    ctx2d.strokeStyle = item.accent;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(15, 15, 14, 0, Math.PI * 2);
    ctx2d.stroke();
  }
  ctx2d.shadowBlur = 0;
  ctx2d.fillStyle = '#071018';
  ctx2d.font = 'bold 12px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.fillText(symbol, 15, 15.5);
}

export function pushItemNotification(itemKey, amount = 1, note = '') {
  const item = Neo.itemRegistry.get(itemKey) || Neo.ITEM_DEFS[itemKey];
  if (!item || amount <= 0) return;
  const stack = ensureItemNotifyStack();
  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = item.color || '#9ec6ff';
  const icon = document.createElement('canvas');
  icon.className = 'item-toast-icon';
  icon.width = 30;
  icon.height = 30;
  drawItemToastIcon(icon, item);
  const body = document.createElement('div');
  body.className = 'item-toast-body';
  const title = document.createElement('div');
  title.className = 'item-toast-title';
  const name = document.createElement('span');
  name.textContent = item.name;
  name.style.color = getRarityNameColor(item.rarity || item.category);
  const plus = document.createElement('span');
  plus.className = 'item-toast-amount';
  plus.textContent = `+${amount}`;
  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.textContent = note ? `${item.description} ${note}` : item.description;
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

export const ITEM_CINEMATIC_FLAVOR = {
  wizards_paw: 'Choose 2 stats to triple — choose wisely.',
  jesters_dice: 'Skip 3 floors. Chaos blooms in your wake.',
};

let cinematicTimer = null;

export function showItemCinematic(itemKey, onDone) {
  const item = Neo.itemRegistry.get(itemKey) || Neo.ITEM_DEFS[itemKey];
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
  'role-assassin': {
    color: '#ff7a9a',
    accent: '#d7fff2',
    pixels: [[5,0],[5,1],[4,2],[4,3],[3,4],[2,5],[1,6],[0,7],[2,2],[3,3],[5,4],[6,5]],
    accentPixels: [[1,5],[2,6],[3,6],[2,7]],
  },
};

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
  icon.width = 30;
  icon.height = 30;
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
  desc.textContent = moveDef.desc || 'New move unlocked.';
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

export function pushWeaponNotification(weaponKey) {
  const def = Neo.WEAPON_DEFS[weaponKey];
  if (!def) return;
  const rarityColor = { knight: '#e8f0ff', wizard: '#c08cff', god: '#ff7070', white: '#e8f0ff', purple: '#c08cff', red: '#ff7070' };
  const color = def.color || rarityColor[def.rarity] || '#d9e8ff';
  const stack = ensureItemNotifyStack();
  const toast = document.createElement('div');
  toast.className = 'item-toast';
  toast.style.borderColor = color;
  const icon = document.createElement('canvas');
  icon.className = 'item-toast-icon';
  icon.width = 30;
  icon.height = 30;
  drawWeaponToastIcon(icon, def);
  const body = document.createElement('div');
  body.className = 'item-toast-body';
  const title = document.createElement('div');
  title.className = 'item-toast-title';
  const name = document.createElement('span');
  name.textContent = `Weapon: ${def.name}`;
  name.style.color = getRarityNameColor(def.rarity);
  const plus = document.createElement('span');
  plus.className = 'item-toast-amount';
  plus.textContent = '+1';
  const desc = document.createElement('div');
  desc.className = 'item-toast-desc';
  desc.textContent = def.description || 'New weapon acquired.';
  title.append(name, plus);
  body.append(title, desc);
  toast.append(icon, body);
  stack.prepend(toast);
  while (stack.children.length > 4) stack.removeChild(stack.lastElementChild);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

Neo.ensureItemNotifyStack = ensureItemNotifyStack;
Neo.getRarityNameColor = getRarityNameColor;
Neo.drawItemToastIcon = drawItemToastIcon;
Neo.pushItemNotification = pushItemNotification;
Neo.showItemCinematic = showItemCinematic;
Neo.drawMoveToastIcon = drawMoveToastIcon;
Neo.drawWeaponToastIcon = drawWeaponToastIcon;
Neo.drawHealToastIcon = drawHealToastIcon;
Neo.drawInventoryUiIcon = drawInventoryUiIcon;
Neo.pushMoveNotification = pushMoveNotification;
Neo.pushWeaponNotification = pushWeaponNotification;
