#!/usr/bin/env bash
# Rasterizes public/icon.svg into the PNG icons the manifest and iOS need. Requires rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/../public"
for icon_size in 192 512; do
  rsvg-convert -w "$icon_size" -h "$icon_size" icon.svg -o "icon-$icon_size.png"
done
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
