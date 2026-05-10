#!/usr/bin/env bash
# Concatenates split game source files into a single bundle.
# Output: js/game.bundle.js
# Usage: ./build.sh
set -euo pipefail

OUT="js/game.bundle.js"

cat \
  js/game-core.js \
  js/ui.js \
  js/game-state.js \
  js/rooms.js \
  js/enemies.js \
  js/player.js \
  js/combat.js \
  js/update.js \
  js/world.js \
  js/hud.js \
  js/draw.js \
  > "$OUT"

echo "Built $OUT ($(wc -l < "$OUT") lines)"
