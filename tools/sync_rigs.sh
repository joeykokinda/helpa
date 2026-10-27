#!/usr/bin/env bash
# Copies the app's rig catalogs into the backend, which embeds them. Run after editing any catalog.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -f "$root"/backend/rigs/*.json
cp "$root"/app/app/components/rig/catalogs/*.json "$root"/backend/rigs/
ls "$root"/backend/rigs
