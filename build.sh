#!/usr/bin/env bash
# Concatenates split game source files into a single bundle.
# Output: js/game.bundle.js
# Usage: ./build.sh
set -euo pipefail

OUT="js/game.bundle.js"

cat \
  js/core/game-core.js \
  js/ui/input.js \
  js/core/status.js \
  js/core/perf.js \
  js/ui/notifications.js \
  js/ui/panels.js \
  js/core/game-state.js \
  js/game/rooms.js \
  js/game/enemies.js \
  js/game/player.js \
  js/game/combat.js \
  js/core/update.js \
  js/game/world.js \
  js/game/hud.js \
  js/draw/viewport.js \
  js/draw/environment.js \
  js/draw/lighting.js \
  js/draw/props.js \
  js/draw/atlas.js \
  js/draw/entities.js \
  js/draw/hud.js \
  js/ui/controller.js \
  js/core/save-store.js \
  js/core/math-utils.js \
  > "$OUT"

echo "Built $OUT ($(wc -l < "$OUT") lines)"
