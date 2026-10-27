#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/release-paths.sh"
taskTemp=$(mktemp -d "${TMPDIR:-/tmp}/chip-wars-ops-test.XXXXXX")
taskRoot="$taskTemp/game"
mkdir -p "$taskRoot/releases/test-release" "$taskTemp/outside"
[[ -z "$(chip_wars_current_release "$taskRoot")" ]]
ln -s "$taskRoot/releases/test-release" "$taskRoot/current"
[[ "$(chip_wars_current_release "$taskRoot")" == "$(realpath "$taskRoot/releases/test-release")" ]]
rm "$taskRoot/current"
ln -s "$taskTemp/outside" "$taskRoot/current"
if chip_wars_current_release "$taskRoot" 2>/dev/null; then echo 'Unsafe external link accepted'; exit 1; fi
rm "$taskRoot/current"
ln -s "$taskRoot/releases/missing" "$taskRoot/current"
if chip_wars_current_release "$taskRoot" 2>/dev/null; then echo 'Broken link accepted'; exit 1; fi
rm "$taskRoot/current"
mkdir "$taskRoot/current"
if chip_wars_current_release "$taskRoot" 2>/dev/null; then echo 'Non-link accepted'; exit 1; fi
echo 'PASS: first install, existing release, outside link, broken link, non-link (5 cases)'
