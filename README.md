# NEO NYKE: DUNGEON GOD
<img width="732" height="162" alt="image" src="https://github.com/user-attachments/assets/a15bd69a-0700-44df-8c2f-8fa153a0a83b" />


A top-down roguelike dungeon crawler. Fight through 10 floors of procedurally arranged rooms, collect relics, upgrade your moves, and defeat the God boss.

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
- **Ladder** — exit to the next floor
- **Secret** — hidden rooms
- **Boss / God** — final floor encounters

## Systems

**Skills** — four slots (Melee, Laser, Smash, Mobility) each with independent cooldowns. Swap moves at Anvils and Shops.

**Status Effects** — Bleed, Fire, Poison, Dark Drain. Each has stacks, duration, and damage ticks.

**Relics** — passive items that persist through a run and modify your stats or abilities.

**Anvil Forge** — spend XP to permanently upgrade a weapon or move for the current run.

**Bank & Loop Crystals** — meta-progression currency carried between runs. Crystals unlock prestige challenges.

## Running the Game

Do not open the game with the `file://` protocol. ES modules and the Koz engine bridge require `http://` or `https://`.

Local run (recommended):

1. Run `npm install`.
2. Run `npm start`.
3. Open `http://localhost:5173`.

Alternative if Python is installed as `python` instead of `python3`:

1. Run `npm run start:py`.
2. Open `http://localhost:5173`.

## Development

Run `npm install` to install dependencies and configure the tracked Git hooks. The
pre-commit hook runs `npm test` and blocks commits when the test suite fails.

## Building and Deploying

Run `npm run build` before deploying. The build copies the static game files into `dist/`, which is the asset directory used by the root `wrangler.toml`.

Deploy from the repository root so Wrangler uses the root config and `server/server.js` worker.
