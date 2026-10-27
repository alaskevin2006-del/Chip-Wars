#!/usr/bin/env bash
set -euo pipefail
ROOT="$HOME/chip-wars"
[[ "$(realpath -m "$ROOT")" == "$HOME/chip-wars" && ! -L "$ROOT" ]] || exit 1
PREVIOUS=$(readlink -f "$ROOT/previous")
[[ "$PREVIOUS" == "$ROOT/releases/"* && -f "$PREVIOUS/server/index.mjs" ]] || { echo 'No valid previous release'; exit 1; }
CURRENT=$(readlink -f "$ROOT/current")
sudo -n systemctl stop chip-wars.service
ln -sfn "$PREVIOUS" "$ROOT/current"
ln -sfn "$CURRENT" "$ROOT/previous"
sudo -n systemctl start chip-wars.service
echo 'Restored previous Chip-Wars release. Verify /api/health and home page.'
