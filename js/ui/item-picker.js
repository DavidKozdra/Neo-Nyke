// Unified item-choice component.
//
// Every place the player picks items from the full catalogue (sandbox world
// pool, sandbox starting inventory, custom-character starter relics) renders
// through here, so search behaviour, rarity filtering, token markup and the
// empty state stay identical everywhere. Callers own the *state* (which keys
// are selected, what a click means); this module owns the *presentation* and
// the filter controls.

// Canonical tier order, shown left-to-right in the filter bar. Legacy aliases
// ('white'/'purple'/'red') are folded onto their modern tier so old save data
// still filters correctly.
const RARITY_TIERS = ['knight', 'wizard', 'blue', 'green', 'god', 'black'];

const RARITY_ALIASES = {
  white: 'knight',
  purple: 'wizard',
  red: 'god',
  artificer: 'blue',
};

export function canonicalRarity(rarity) {
  const key = String(rarity || 'knight').toLowerCase();
  return RARITY_ALIASES[key] || key;
}

function itemDef(key) {
  return Neo.itemRegistry?.get?.(key) || Neo.ITEM_DEFS?.[key] || {};
}

export function getItemLabel(key) {
  return itemDef(key).name || String(key || '').replace(/_/g, ' ');
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase();
}

// Matches on display name, raw key and rarity (both the stored value and its
// display name, so typing "artificer" finds blue-tier items).
export function itemMatchesQuery(key, query) {
  if (!query) return true;
  const item = itemDef(key);
  const rarity = canonicalRarity(item.rarity);
  return String(item.name || key).toLowerCase().includes(query)
    || String(key || '').toLowerCase().includes(query)
    || rarity.includes(query)
    || String(Neo.RARITY_DISPLAY_NAMES?.[rarity] || '').toLowerCase().includes(query);
}

// `rarities` is a Set of canonical tiers; an empty/absent set means "no rarity
// filter active", which shows everything.
export function filterItemKeys(keys, { query = '', rarities = null } = {}) {
  const q = normalizeQuery(query);
  const hasRarityFilter = rarities && rarities.size > 0;
  return (keys || []).filter(key => {
    if (hasRarityFilter && !rarities.has(canonicalRarity(itemDef(key).rarity))) return false;
    return itemMatchesQuery(key, q);
  });
}

function esc(value) {
  return Neo.escapeHtml(String(value ?? ''));
}

// Renders the search field + rarity chip row. Counts come from the *unfiltered*
// key list so a chip always advertises how many items that tier holds.
export function renderItemPickerControls(keys, state, { searchPlaceholder = 'Search items...', searchLabel = 'Search items' } = {}) {
  const counts = new Map();
  (keys || []).forEach(key => {
    const tier = canonicalRarity(itemDef(key).rarity);
    counts.set(tier, (counts.get(tier) || 0) + 1);
  });
  const active = state?.rarities instanceof Set ? state.rarities : new Set();
  const chips = RARITY_TIERS
    .filter(tier => counts.get(tier))
    .map(tier => {
      const on = active.has(tier);
      const color = Neo.RARITY_NAME_COLORS?.[tier] || '#d8e9ff';
      const name = Neo.RARITY_DISPLAY_NAMES?.[tier] || tier;
      const glyph = Neo.RARITY_GLYPHS?.[tier] || '';
      return `<button class="item-picker__chip${on ? ' is-active' : ''}" data-item-picker-rarity="${esc(tier)}" type="button" style="--chip-color:${esc(color)}" aria-pressed="${on ? 'true' : 'false'}">`
        + (glyph ? `<span class="item-picker__chip-glyph" aria-hidden="true">${esc(glyph)}</span>` : '')
        + `<span class="item-picker__chip-name">${esc(name)}</span>`
        + `<span class="item-picker__chip-count">${counts.get(tier)}</span>`
        + `</button>`;
    })
    .join('');
  const anyActive = active.size > 0;
  return `<div class="item-picker__search-row">`
      + `<input class="sandbox-search item-picker__search" type="search" data-item-picker-search placeholder="${esc(searchPlaceholder)}" aria-label="${esc(searchLabel)}" autocomplete="off" spellcheck="false" value="${esc(state?.query || '')}">`
    + `</div>`
    + `<div class="item-picker__chips" role="group" aria-label="Filter items by rarity">`
      + `<button class="item-picker__chip item-picker__chip--all${anyActive ? '' : ' is-active'}" data-item-picker-rarity="" type="button" aria-pressed="${anyActive ? 'false' : 'true'}">`
        + `<span class="item-picker__chip-name">All</span>`
        + `<span class="item-picker__chip-count">${(keys || []).length}</span>`
      + `</button>`
      + chips
    + `</div>`;
}

// Renders one item token. `mode` is 'toggle' (a button, selected or not) or
// 'stepper' (a div carrying a -/count/+ control).
function renderToken(key, { mode, selected, count, dataAttr, iconAttr, stepAttr }) {
  const item = itemDef(key);
  const label = getItemLabel(key);
  const rarity = canonicalRarity(item.rarity);
  const safeKey = esc(key);
  const tooltip = esc(item.description || 'No item description available.');
  const aria = esc(`${label}. ${item.description || 'No item description available.'}`);
  const classes = `sandbox-token sandbox-token--item item-picker__token sandbox-token--${esc(rarity)}`
    + (mode === 'stepper' ? ' sandbox-token--stepper' : '')
    + (selected ? ' is-active' : '');
  const icon = `<canvas class="sandbox-token__icon sandbox-token__icon--item" ${iconAttr}="${safeKey}" width="26" height="26" aria-hidden="true"></canvas>`;
  const name = `<span class="sandbox-token__label">${esc(label)}</span>`;
  if (mode === 'stepper') {
    return `<div class="${classes}" ${dataAttr}="${safeKey}" title="${tooltip}" aria-label="${aria}" data-tooltip="${tooltip}">`
      + icon + name
      + `<div class="sandbox-token__stepper">`
        + `<button class="sandbox-token__step" data-sbox-start-step="-1" ${stepAttr}="${safeKey}" type="button" aria-label="Decrease ${esc(label)}">−</button>`
        + `<span class="sandbox-token__count" data-sbox-start-count>${count}</span>`
        + `<button class="sandbox-token__step" data-sbox-start-step="1" ${stepAttr}="${safeKey}" type="button" aria-label="Increase ${esc(label)}">+</button>`
      + `</div>`
      + `</div>`;
  }
  return `<button class="${classes}" ${dataAttr}="${safeKey}" type="button" aria-pressed="${selected ? 'true' : 'false'}" title="${tooltip}" aria-label="${aria}" data-tooltip="${tooltip}">`
    + icon + name
    + `</button>`;
}

export function renderItemPickerEmptyState(text) {
  return `<div class="sandbox-empty">${esc(text)}</div>`;
}

// Main entry point. Renders the filtered token grid into `listEl` and hydrates
// the icon canvases. Returns the number of visible items.
//
//   keys      full candidate key list (unfiltered)
//   state     { query, rarities:Set } — owned by the caller, mutated by
//             attachItemPickerControls()
//   isActive  key -> boolean (toggle mode) — drives the selected styling
//   getCount  key -> number (stepper mode)
export function renderItemPickerList(listEl, keys, state, {
  mode = 'toggle',
  dataAttr,
  iconAttr,
  stepAttr = 'data-sbox-start-item-key',
  isActive = () => false,
  getCount = () => 0,
  emptyText = 'No items match your filters.',
} = {}) {
  if (!listEl) return 0;
  const visible = filterItemKeys(keys, state);
  listEl.innerHTML = visible.length
    ? visible.map(key => renderToken(key, {
        mode,
        dataAttr,
        iconAttr,
        stepAttr,
        selected: mode === 'stepper' ? getCount(key) > 0 : !!isActive(key),
        count: mode === 'stepper' ? Math.max(0, Math.min(99, Math.round(Number(getCount(key)) || 0))) : 0,
      })).join('')
    : renderItemPickerEmptyState(emptyText);
  Neo.drawItemIconCanvases?.(listEl, iconAttr);
  return visible.length;
}

// Wires the search input and rarity chips inside `controlsEl` to `state`,
// calling `onChange` after every mutation. Delegated, so re-rendering the
// controls markup does not detach the handlers.
export function attachItemPickerControls(controlsEl, state, onChange) {
  if (!controlsEl || controlsEl.dataset.itemPickerBound === '1') return;
  controlsEl.dataset.itemPickerBound = '1';
  if (!(state.rarities instanceof Set)) state.rarities = new Set();

  controlsEl.addEventListener('input', event => {
    const input = event.target instanceof Element ? event.target.closest('[data-item-picker-search]') : null;
    if (!input) return;
    state.query = String(input.value || '');
    onChange({ preserveSearchValue: true });
  });

  controlsEl.addEventListener('click', event => {
    const chip = event.target instanceof Element ? event.target.closest('[data-item-picker-rarity]') : null;
    if (!chip) return;
    const tier = String(chip.dataset.itemPickerRarity || '');
    // The "All" chip clears the filter; tier chips toggle independently so
    // several rarities can be shown at once.
    if (!tier) state.rarities.clear();
    else if (state.rarities.has(tier)) state.rarities.delete(tier);
    else state.rarities.add(tier);
    onChange({});
  });
}

export const ItemPicker = {
  RARITY_TIERS,
  canonicalRarity,
  getItemLabel,
  itemMatchesQuery,
  filterItemKeys,
  renderControls: renderItemPickerControls,
  renderList: renderItemPickerList,
  renderEmptyState: renderItemPickerEmptyState,
  attachControls: attachItemPickerControls,
};

Neo.ItemPicker = ItemPicker;
