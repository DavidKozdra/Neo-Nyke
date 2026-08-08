# NEO NYKE: DUNGEON GOD
<img width="732" height="162" alt="image" src="https://github.com/user-attachments/assets/a15bd69a-0700-44df-8c2f-8fa153a0a83b" />


A top-down roguelike dungeon crawler. Fight through 10-floor descents, refuse the crown, and carry one evolving build through the authored 20-loop GODLOOP campaign.

## Characters

| Character | Style |
|-----------|-------|
| **Thorn Knight** | Starter. Bleed-focused melee fighter. |
| **Metao** | Wizard. Lower damage, compensated by range and fire/chaos abilities. |
| **Granialla** | Unlocked by beating the final boss. Healing-focused. |

## Controls

| Input | Action |
|-------|--------|
| `W A S D` | Move |
| `LMB` | Slash / melee attack |
| `RMB` | Beam attack |
| `R` | Smash |
| `Shift` | Mobility skill |
| `I` | Inventory |

Controls are fully remappable in Settings.

## Room Types

- **Combat** — enemy encounters
- **Shop** — buy items, weapons, moves, and heals with coins
- **Treasure** — chests with item drops
- **Anvil** — spend XP to upgrade weapons and moves
- **Challenge** — optional modifiers (No Hit, No Items, etc.)
- **God Altar** — sacrifice health, relics, or safety for run power
- **Bounty Board / Hunts** — track named elite targets through Execution, Capture, or Theft contracts; escaped quarry returns stronger and drops trophies
- **Reliquary** — fuse, distill, or duplicate owned relics
- **Sanctuary** — restore health, supplies, charges, or cleanse curses
- **Oracle** — reveal or rewrite part of the current floor
- **Portal Chamber** — teleport, reroute, or abandon the current floor
- **Prison** — rescue one specialist for an immediate run bonus
- **Wishing Well** — gamble coins or maximum health on a hidden outcome
- **Living Chronicle** *(Loop 2+)* — rewrite wounds, memories, or the floor itself
- **War Foundry** *(Loop 4+)* — add permanent attack, armor, or forge resources
- **Mutation Lab** *(Loop 7+)* — splice risky permanent mutations into a build
- **Astral Observatory** *(Loop 10+)* — chart secrets or claim power from the stars
- **Void Market** *(Loop 14+)* — make late-game trades ordinary shops refuse
- **Ladder** — exit to the next floor
- **Secret** — hidden rooms
- **Boss / God** — final floor encounters

## Systems

**Skills** — four slots (Melee, Laser, Smash, Mobility) each with independent cooldowns. Swap moves at Anvils and Shops.

**Status Effects** — Bleed, Fire, Poison, Dark Drain. Each has stacks, duration, and damage ticks.

**Relics** — passive items that persist through a run and modify your stats or abilities.

**Anvil Forge** — spend XP to permanently upgrade a weapon or move for the current run.

**Bank & Loop Crystals** — meta-progression currency carried between runs. Crystals unlock prestige challenges.

**20-Loop Protocol** — every loop has a named milestone and unlock gate. Later loops grow from one to three service rooms and one to three secrets per floor, add Echo Caches, Blood Forges, Time Capsules, Mimic Dens, Star Shrines, and Null Chambers, and widen the inter-loop Artificer reward from one-of-three to two-of-six. Loop transitions restore a scaling portion of health so reaching and completing GODLOOP is a supported long-run objective; play can continue beyond it.

## Running the Game

Do not open the game with the `file://` protocol. ES modules and the Koz engine bridge require `http://` or `https://`.

Local run (recommended):

1. Run `npm install`.
2. Run `npm start`.
3. Open `http://localhost:5173`.

Optional mobile startup smoke check (requires Playwright browsers):

1. Start the game with `npm start`.
2. In another terminal run `npm run mobile:pwa-smoke` (optionally pass URL as first arg and timeout ms as second arg).
3. Confirm it prints `[mobile-pwa-smoke] pass`.

Alternative if Python is installed as `python` instead of `python3`:

1. Run `npm run start:py`.
2. Open `http://localhost:5173`.

## Development

Run `npm install` to install dependencies and configure the tracked Git hooks. The
pre-commit hook runs `npm run precache`, `npm run test:pwa-contract`,
`npm run precache:check`, `npm run i18n:check` (via
`node scripts/check-i18n.js --strict`), and the main Jest suite. It blocks commits
when the offline manifest changes without regeneration, locale validation fails, or
any tests fail.

`npm test` now includes the same PWA contract checks (`test:pwa-contract`) plus
the full Jest suite, so running tests locally enforces the mobile-first PWA
regression checks before merge.

When adding new moves, items, weapons, achievements, or other extracted game
content, run `npm run i18n:sync` first so the locale files receive the new keys,
then translate the new values before committing. `npm run i18n:fill` can fill
newly synced fallback values across the supported locale files. Use
`npm run i18n:check:structure` only when you need a key-parity-only diagnostic.

## Building and Deploying

Run `npm run build` before deploying. The build copies the static game files into `dist/`, which is the asset directory used by the root `wrangler.toml`.

Deploy from the repository root so Wrangler uses the root config and `server/server.js` worker.
