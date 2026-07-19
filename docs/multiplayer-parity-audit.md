# Multiplayer parity audit

Target: the server resolves authoritative outcomes and broadcasts campaign state/events; every browser uses the existing campaign presentation and UI. Multiplayer must not own reduced gameplay content or a second renderer.

## Verified shared or repaired

- Campaign renderer and HUD are used by multiplayer; the duplicate network HUD is hidden.
- Multiplayer enters the normal `play`/`pause` presentation states. The local campaign simulation is explicitly disabled while a network authority is active.
- FPS mouse-look, pointer lock, pause, Settings, shop/inventory/forge/special-room panels can therefore use their normal handlers.
- Player laser commands use the same canonical pointer/FPS-yaw conversion.
- Room dimensions are the shared 900×700 geometry.
- Authored templates, pillars, chambers, decorations, destructibles and static hazards are generated into authoritative room state. Client-side room fabrication was deleted.
- Authority movement and client prediction use the same obstacle collision operation.
- Lava and explosive-trap state/damage are authority-owned.
- Move and weapon catalogs are complete in shared content (47 campaign moves and 15 campaign weapons in the browser audit).
- Forge commits, inventory equip/reorder commands, shop purchases and special-room choices have shared command resolvers.
- Pickup/shop events now invoke the normal campaign item/move/weapon notifications.
- The canonical 68-relic and 6-scroll definitions are loaded once by both browser UI and authority code; the former 916-line browser copy was removed.
- Campaign item-stat derivation is shared by local play and authority. Movement, XP, coin/potion pickup, duplication, attack speed, outgoing damage, damage reduction, flat reduction and Iron Lung now consume that shared result.
- Removed a network export that overwrote the canonical item-collection transaction in the browser. This collision was why inventory increased without the normal item notification in both modes.
- Timed tool state now produces authority pulses for missiles, regeneration, lightning, mines, cape concealment and vacuum pickup radius; panic, sparkle, heal and shield activations mutate authority state.
- Shop stock, prices, item/move/weapon acquisition, next-tier trades, healing and stored potions now resolve through one shared campaign operation. Browser-only item/move/weapon stock generators and direct purchase mutations were deleted.
- Shared shop stock preserves campaign rules for difficulty offer counts, Rich Man's Luck extras, character-exclusive moves, God Sweep unlocks, projectile-weapon representation and featured-god premium pricing.
- Enemy damage scaling is now one headless campaign operation in local play and authority: character/item/boss/bleed/bounty/challenge multipliers, elite and loop resistance, defense and flat reduction no longer have separate formulas.
- Crit chance, forced crits and rollback now resolve through one shared hit operation in local play and authority.
- Status storage/application, six-stack limits, duration/resistance math, player cold budgets, slow movement, enemy/player DoT formulas, bleed resistance and item/weapon on-hit proc rolls now resolve through `SharedStatusSystem` in both campaign and authority. Network presentation consumes the authority's real `statuses` map; legacy network bleed/fire/poison/freeze counters and reconstructed client statuses were deleted.
- Level-up XP growth, health/attack/attack-speed gains, Artificer bonuses and character milestones now resolve through one shared progression operation. Authority no longer overwrites a hero's character damage multiplier on level-up.
- Browser Playwright proves the normal campaign pause/settings flow, 2D/FPS/third-person rendering, two visible heroes, exact FPS beam yaw, Blade Justice, starter inventories, the normal item pickup card and clean server leave across two clients.
- Destructibles (pots, barrels, tables, walls) now break on the authority from melee sweeps, beams, AOE smashes and projectiles through one shared mutation, with the campaign break outcomes: pot coin/item loot, barrel 130-radius blast that chains to nearby props and damages enemies, and hidden-prop reveal on wall breaks. The client consumes `DESTRUCTIBLE_HIT`/`DESTRUCTIBLE_BROKEN` events to play the normal campaign hit/break/explosion FX and sounds.
- The local hero renders through the full campaign `drawPlayer` path in networked play (status rings, barrier bar, god tint, sprite scale, weapon range preview); only remote allies get the tinted `drawPlayerSlot` treatment with a name label.
- Pickup presentation is per-type like the campaign: the coin ring/chime only plays for coin pickups, potions show the authoritative heal popup, and item pickups show the normal card plus the compact "Copied!" toast on a duplicate roll.
- Encounter counts, seeded wave composition, ladder support units and floor-boss selection now come from `SharedEncounterSystem`; authority no longer maintains its fixed 1/2/3-enemy counts or a separate enemy pool.
- Projectile ricochet rolls, item speed/lifetime/pierce/homing modifiers, homing steering, movement integration, blocker reflection and perpendicular sub-spawn descriptors now come from `SharedProjectileSystem` in browser and authority.
- Wizard's Paw, Extra Battery, vouchers and all six control-scroll transactions (including pending queues, reroll, replace, abundance and pool weighting) now resolve through `SharedAcquisitionSystem` and validated game commands.
- Kill healing and kill-charge progression for Insurance, Keen Eye, Crit Charm, Chrono Spring, Charged Adapter, Robot Arm and Hemes Scarf now resolve through `SharedEventItemSystem` in both runtimes.
- Destructible HP/break state, secret-wall intent, hidden-group reveal, pot rewards, barrel blast intent and post-loop green drops now resolve through `SharedWorldMutationSystem`; local code retains only FX/audio and authority retains entity/event materialization.

## Still blocking literal 1:1 parity

1. **Enemy behavior bodies**
   - Type dispatch and encounter construction are shared, but single-player still executes the authored per-enemy handlers in `game/enemies.js` while authority executes a generic ranged/melee behavior in `NetworkCombatSystem.js`.
   - Boss phases, elite traits, projectile evasion, obstacle breaking, hidden-player wandering, bounty control and named boss attacks are not one shared operation yet.

2. **Remaining item procs and acquisition side effects**
   - The live campaign's 74 definitions and derived passive/stat table are now shared, but event-driven effects still need extraction.
   - On-hit status rolls, core kill-charge/healing, paid/co-op/rival revive reset, scroll, voucher, Wizard's Paw, Extra Battery and the complete Jester pickup/gate/floor-skip transaction are shared now. Remaining event-driven character/item synergies still need extraction.

3. **Combat execution**
   - Damage scaling, crit resolution, status application/ticking/on-hit status procs and core projectile trajectories are shared, but authority still has separate implementations for attack sequencing, beams, persistent moves and portions of projectile hit/collision disposition.
   - Several authored move sequences are projected from events for appearance instead of consuming the exact campaign gameplay entities.
   - Boomerang catch, drain, love-bomb detonation and several move-specific projectile dispositions still need extraction.

4. **Chests and reward-selection flows**
   - Campaign and authority now open direct, potion, A/B and treasure-hunt exit chests through `SharedChestSystem`; authored choice lists are preserved and selection claims flow through the same duplication/Jester acquisition transaction as ordinary pickups.
   - Scroll selection, Wizard's Paw, Extra Battery and duplicate pickup collection use shared transactions. Secret vendor/boss rewards and several named selection events still need the same treatment.

5. **Special/challenge/secret/garden rooms**
   - Seven service-room choices share an outcome resolver. Challenge type selection, starter gating, completion/failure, circuit/rune/bomb pickup mutations and rewards now use `SharedRoomLifecycleSystem` from campaign and authority.
   - Secret vendor/warp plans and purchases, secret-boss chest claims, garden fruit growth/collection/respawn and normal/treasure-hunt ladder outcomes are shared. The authority still needs the complete authored per-tick Protect/Storm/Rune/Bomb enemy-pressure bodies and Bowman Bane encounter/escape construction.

6. **World mutation**
   - Pots, barrels, breakable walls and hidden-prop reveals now share an authoritative break lifecycle with campaign loot/blast outcomes.
   - Secret-wall break intent, cover HP, reveals, post-loop green drops, garden nodes and moving pickup/hazard boundary reflection are shared. Remaining named room-projectile dispositions are covered by the broader combat-execution blocker above.

7. **Remaining run services**
   - XP, canonical level-up gains, coins, floors and revive have authority state. Authority events now update serialized achievement/tutorial/unlock service state; matching clients feed those events into the existing campaign achievement/tutorial presentation. Cloudflare Durable Objects checkpoint the complete serialized simulation and random-stream state every second.
   - Account-level meta merging and the complete mechanics of every alternate campaign mode still require explicit multiplayer policy; they are not silently written through the legacy single-player save schema.

8. **Prediction/reconciliation coverage**
   - Player obstacle prediction, responsive velocity, timed speed boosts, item speed and status slow math are shared between authority and client prediction. Accepted dash/warp destinations are applied immediately to the local predicted hero.
   - Knockback uses the same resisted impulse operation in campaign, authority and local prediction. Authoritative room/floor transitions snap prediction to the canonical entrance, and moving pickups/hazards consume the shared reflection operation.

## Deletion rule for remaining work

For each blocking row: extract the existing campaign mutation into a DOM-free operation; call it from local campaign and server authority; broadcast its state/events; let the normal browser renderer/UI consume them; delete the corresponding branch from `NetworkCombatSystem` or `NetworkGameView`.
