#!/usr/bin/env bash
# Print a validated previous release, or nothing for a genuine first install.
chip_wars_current_release() {
  local taskRoot taskCurrent taskResolved
  taskRoot=$(realpath -m "$1")
  taskCurrent="$taskRoot/current"
  if [[ ! -e "$taskCurrent" && ! -L "$taskCurrent" ]]; then
    return 0
  fi
  [[ -L "$taskCurrent" ]] || { echo 'Current release must be a symlink' >&2; return 1; }
  taskResolved=$(readlink -f "$taskCurrent" 2>/dev/null || true)
  [[ "$taskResolved" == "$taskRoot/releases/"* && -d "$taskResolved" ]] || { echo 'Unexpected current release' >&2; return 1; }
  printf '%s\n' "$taskResolved"
}
