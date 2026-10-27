#!/usr/bin/env bash
set -euo pipefail
# Read-only inventory. Never prints environment files or existing project configs.
printf 'HOME AND STORAGE\n'
pwd
df -h "$HOME"
printf '\nLISTENERS\n'
ss -lntup
printf '\nRUNNING SERVICES\n'
systemctl list-units --type=service --state=running --no-pager
printf '\nRUNTIME\n'
command -v node >/dev/null && node -v || true
command -v docker >/dev/null && sudo -n docker version --format '{{.Server.Version}}' || true
printf '\nEXISTING CONTAINERS\n'
sudo -n docker ps --format '{{.ID}} {{.Names}} {{.Image}} {{.Ports}}'
printf '\nISOLATED TARGET\n'
test ! -e "$HOME/chip-wars" || ls -ld "$HOME/chip-wars"
ss -H -ltn 'sport = :4187'
printf '\nFIREWALL\n'
sudo -n ufw status || true
