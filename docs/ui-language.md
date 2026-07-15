# NeoNyke menu UI language

The game uses a pixel-arcade interface, not a glass or SaaS dashboard.

## Keep

- VT323 for UI and Press Start 2P only for the main-menu logo.
- Pixel item, move, character, and stat icons.
- Dark opaque menu surfaces, with rarity and room colors as category markers.
- Bright feedback for gameplay events, danger, pickups, and a selected choice.

## Menu rules

1. Use the shared panel, card, and button classes before adding a component-specific treatment.
2. Menu frames use 4–6px corners and a single clear border. Pills are only for compact counters or status.
3. A card gets one accent edge or icon tint. Do not add a gradient, glow, tinted background, and colored border together.
4. Reserve persistent glow or a double outline for selected, dangerous, newly unlocked, or otherwise actionable state.
5. Use title, name, value, then supporting copy. Do not add an eyebrow unless it distinguishes a real category.
6. Keep primary text at normal contrast. Accent colors support the text; they do not replace it.
7. Use custom pixel icons wherever an item, move, character, stat, or room already has one. Avoid emoji in gameplay menus.

## Review checklist

- Can a player identify the title, action, cost/value, and selected state in one scan?
- Is every border, glow, and color communicating a state or category?
- Does this look like it belongs beside the HUD and inventory, not a web dashboard?
- Does it remain readable at the minimum supported font scale and on a small screen?
