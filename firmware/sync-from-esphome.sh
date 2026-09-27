#!/usr/bin/env bash
#
# Copy the ESPHome device config from the ESPHome Device Builder's working folder
# (~/esphome) into this repo, so it can be committed.
#
# Why a copy and not a symlink: ESPHome saves YAML by writing a temp file and moving
# it over the original, which silently replaces a symlink with a plain file. The
# working copy therefore stays in ~/esphome, and this script brings it into git.
#
# Safety: the repo is PUBLIC. Every credential must be a "!secret" reference
# (real values live in ~/esphome/secrets.yaml, which is never copied). The script
# refuses to copy if it finds a key or password written inline.
#
# Usage: firmware/sync-from-esphome.sh   (then review with `git diff` and commit)

set -euo pipefail

ESPHOME_DIR="${ESPHOME_DIR:-$HOME/esphome}"
REPO_FIRMWARE_DIR="$(cd "$(dirname "$0")" && pwd)"
DEVICES=(smart-input-module.yaml)

for device in "${DEVICES[@]}"; do
  src="$ESPHOME_DIR/$device"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: $src not found" >&2
    exit 1
  fi

  # Any key:/password: line whose value is not a !secret reference is an inline
  # credential. Bare "encryption:" (no value) is fine: it reuses the API key.
  if grep -nE '^\s*(key|password|ota_password|api_password)\s*:\s*[^[:space:]!]' "$src"; then
    echo "ERROR: $device has an inline credential (lines above). Move it to secrets.yaml and use !secret." >&2
    exit 1
  fi

  cp "$src" "$REPO_FIRMWARE_DIR/$device"
  echo "Copied $device"
done
