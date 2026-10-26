#!/bin/sh
# Packages src/ into dist/aivo-launcher.wgt (unsigned; Apps2Samsung signs it on install).
set -eu
cd "$(dirname "$0")/.."

[ -f src/icon.png ] || node scripts/make-icon.mjs
# index.html always loads this; an absent file would only be a console error, but there is no
# reason to ship one. Gitignored, so creating it here cannot dirty the tree.
[ -f src/js/config.local.js ] || echo '/* No local overrides. See config.local.example.js. */' > src/js/config.local.js
node scripts/build-marks.mjs

mkdir -p dist
rm -f dist/aivo-launcher.wgt
# fonts/*.woff2 are the variable sources of fonts/static/ (scripts/make-static-fonts.py); only the
# static WOFF files are referenced, and they are what the 2016 engine can read.
(cd src && zip -q -r -X ../dist/aivo-launcher.wgt . -x '*.DS_Store' -x '.*' -x 'img/marks/*' -x 'fonts/*.woff2' \
  -x 'img/easter-egg/*.jpg' -x 'img/easter-egg/runner.png' -x 'img/easter-egg/obstacle.png' \
  -x 'img/easter-egg/obstacle-face.png')

echo "Built dist/aivo-launcher.wgt"
unzip -l dist/aivo-launcher.wgt
