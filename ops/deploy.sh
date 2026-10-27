#!/usr/bin/env bash
# Run as the deployment user; sudo touches ONLY chip-wars.service and its container.
set -euo pipefail
umask 077
ARCHIVE=${1:?Usage: deploy.sh /tmp/chip-wars-<sha>.tar.gz <git-sha> [port]}
VERSION=${2:?Missing verified Git SHA}
PORT=${3:-4187}
ROOT="$HOME/chip-wars"
ENV_FILE="$HOME/.config/chip-wars/environment"
IMAGE=${CHIP_WARS_NODE_IMAGE:-node:24.21.0-bookworm-slim}
[[ "$VERSION" =~ ^[a-f0-9]{7,40}$ ]] || { echo 'Invalid version'; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1024 && PORT < 65536 )) || { echo 'Invalid port'; exit 1; }
[[ "$IMAGE" =~ ^node:(22|24)([.-][a-zA-Z0-9.-]+)?(@sha256:[a-f0-9]{64})?$ ]] || { echo 'Only official Node 22/24 runtime supported'; exit 1; }
[[ "$ARCHIVE" == /tmp/chip-wars-*.tar.gz && -f "$ARCHIVE" ]] || { echo 'Archive must be an existing /tmp/chip-wars-*.tar.gz'; exit 1; }
[[ "$(realpath -m "$ROOT")" == "$HOME/chip-wars" && ! -L "$ROOT" ]] || { echo 'Unexpected target path'; exit 1; }
sudo -n true
command -v docker >/dev/null
EXISTING_UNIT=$(systemctl show chip-wars.service --property=Description --value 2>/dev/null || true)
[[ -z "$EXISTING_UNIT" || "$EXISTING_UNIT" == chip-wars.service || "$EXISTING_UNIT" == 'Chip-Wars isolated game service' ]] || { echo 'Unit name belongs to another app'; exit 1; }
EXISTING_CONTAINER=$(sudo -n docker inspect --format '{{index .Config.Labels "app"}}' chip-wars 2>/dev/null || true)
[[ -z "$EXISTING_CONTAINER" || "$EXISTING_CONTAINER" == chip-wars ]] || { echo 'Container name belongs to another app'; exit 1; }
LISTENERS=$(ss -H -ltn "sport = :$PORT")
if [[ -n "$LISTENERS" ]] && ! systemctl is-active --quiet chip-wars.service; then
  echo 'Candidate port is occupied; no changes made'; exit 1
fi
# Protect against unsafe archive paths/symlinks; bundle is built from committed files.
if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env($|/))'; then
  echo 'Unsafe archive'; exit 1
fi
mkdir -p "$ROOT/releases" "$ROOT/runtime" "$(dirname "$ENV_FILE")"
chmod 755 "$ROOT" "$ROOT/releases"
chmod 700 "$(dirname "$ENV_FILE")"
# Container uid 1000 persists only the bounded provider usage ledger here.
sudo -n chown 1000:1000 "$ROOT/runtime"
chmod 700 "$ROOT/runtime"
if [[ ! -f "$ENV_FILE" ]]; then
  printf 'HOST=0.0.0.0\nPORT=%s\nLLM_DAILY_LIMIT=60\nLLM_LEDGER_PATH=/state/llm-usage.json\n' "$PORT" > "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
grep -q "^PORT=$PORT$" "$ENV_FILE" || { echo 'Configured PORT must match selected port'; exit 1; }
RELEASE="$ROOT/releases/$VERSION"
if [[ ! -d "$RELEASE" ]]; then
  mkdir "$RELEASE"
  tar -xzf "$ARCHIVE" -C "$RELEASE" --no-same-owner --no-same-permissions
  chmod -R a+rX "$RELEASE"
fi
test -f "$RELEASE/dist/index.html"
test -f "$RELEASE/server/index.mjs"
test -f "$RELEASE/ops/chip-wars.service.template"
sudo -n docker image inspect "$IMAGE" >/dev/null 2>&1 || sudo -n docker pull "$IMAGE"
source "$RELEASE/ops/release-paths.sh"
OLD=$(chip_wars_current_release "$ROOT")
if [[ -n "$OLD" ]]; then
  [[ "$OLD" == "$ROOT/releases/"* && -d "$OLD" ]] || { echo 'Unexpected current release'; exit 1; }
  ln -sfn "$OLD" "$ROOT/previous"
fi
rollback_on_error() {
  trap - ERR
  echo 'Deployment failed; restoring only Chip-Wars'
  sudo -n systemctl stop chip-wars.service || true
  if [[ -n "$OLD" ]]; then
    ln -sfn "$OLD" "$ROOT/current"
    sudo -n systemctl start chip-wars.service || true
  fi
  exit 1
}
trap rollback_on_error ERR
sudo -n systemctl stop chip-wars.service 2>/dev/null || true
ln -sfn "$RELEASE" "$ROOT/current"
UNIT=$(mktemp /tmp/chip-wars-unit.XXXXXX)
sed -e "s|@ROOT@|$ROOT|g" -e "s|@PORT@|$PORT|g" -e "s|@ENV@|$ENV_FILE|g" -e "s|@IMAGE@|$IMAGE|g" "$RELEASE/ops/chip-wars.service.template" > "$UNIT"
sudo -n install -m 644 "$UNIT" /etc/systemd/system/chip-wars.service
rm -f "$UNIT"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now chip-wars.service
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health"; then
    printf '\nHealthy release %s\n' "$VERSION"
    trap - ERR
    exit 0
  fi
  sleep 1
done
false
