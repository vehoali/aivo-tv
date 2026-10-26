#!/bin/bash
# One command from source to the launcher running on the TV: test, build, sign, install, launch.
#
#   npm run deploy                     use the TV address saved last time
#   npm run deploy -- 192.168.1.20    use (and remember) this address
#
# Options (after `--` when run through npm):
#   --skip-tests     do not run npm test first
#   --no-install     stop after signing (dist/aivo-signed.wgt)
#   --no-launch      install but do not open the app
#   --profile NAME   certificate profile to sign with (default: aivo)
#   --no-bump        keep the current version number
#
# Every install raises the patch version (1.0.1 -> 1.0.2) in src/config.xml and package.json. The
# TV keys its cached icon and app files on that number: reinstalling the same version leaves the
# old icon showing. Commit the bumped files along with your change.
#
# The address is remembered in .tv-address (gitignored). The TV must be in Developer Mode with this
# Mac's IP entered, and the certificate profile must exist (docs/setup-tv.md, steps 2–6).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="AivoLnchr0.Launcher"
PORT=26101
PROFILE="aivo"
RUN_TESTS=1
INSTALL=1
LAUNCH=1
BUMP=1
TV=""

while [ $# -gt 0 ]; do
    case "$1" in
        --skip-tests) RUN_TESTS=0 ;;
        --no-install) INSTALL=0; LAUNCH=0 ;;
        --no-launch) LAUNCH=0 ;;
        --no-bump) BUMP=0 ;;
        --profile) PROFILE="${2:?--profile needs a name}"; shift ;;
        -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
        -*) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
        *) TV="$1" ;;
    esac
    shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mStopped: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------- Tools

export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
command -v sdb >/dev/null || fail "sdb not found. Install Tizen Studio to ~/tizen-studio (docs/setup-tv.md, step 3)."
command -v tizen >/dev/null || fail "tizen not found. Install Tizen Studio to ~/tizen-studio (docs/setup-tv.md, step 3)."
[ -d node_modules ] || { step "Installing project tools (npm install)"; npm install; }

# ---------- TV address

if [ "$INSTALL" = 1 ]; then
    if [ -z "$TV" ] && [ -f .tv-address ]; then TV="$(tr -d '[:space:]' < .tv-address)"; fi
    [ -n "$TV" ] || fail "No TV address. Run once with it, e.g.: npm run deploy -- 192.168.1.20"
    TV="${TV%:$PORT}"
    case "$TV" in
        *[!0-9.]*|"") fail "\"$TV\" is not an IP address like 192.168.1.20 (no < > around it)." ;;
    esac
    echo "$TV" > .tv-address
    TARGET="$TV:$PORT"
fi

# ---------- Test and build

mkdir -p dist
if [ "$RUN_TESTS" = 1 ]; then
    step "Running tests"
    npm test --silent > dist/test.log 2>&1 || { tail -30 dist/test.log; rm -f dist/test.log; fail "tests failed (output above). Fix them, or use --skip-tests."; }
    grep -E '^ℹ (pass|fail)' dist/test.log || true
    rm -f dist/test.log
fi

VERSION="$(sed -n 's/.* version="\([0-9]*\.[0-9]*\.[0-9]*\)" viewmodes.*/\1/p' src/config.xml | head -1)"
[ -n "$VERSION" ] || fail "could not read the version from src/config.xml."
# Only when installing: a build that never reaches the TV does not need a new number.
if [ "$INSTALL" = 1 ] && [ "$BUMP" = 1 ]; then
    NEW="${VERSION%.*}.$(( ${VERSION##*.} + 1 ))"
    # Tizen allows at most 65535 in the last place.
    [ "${NEW##*.}" -le 65535 ] || fail "patch version $NEW is too large; raise the minor version by hand."
    sed -i '' "s/version=\"$VERSION\" viewmodes/version=\"$NEW\" viewmodes/" src/config.xml
    grep -q "version=\"$NEW\" viewmodes" src/config.xml || fail "could not update the version in src/config.xml."
    npm version "$NEW" --no-git-tag-version --allow-same-version > /dev/null
    step "Version $VERSION -> $NEW"
    VERSION="$NEW"
fi

step "Building version $VERSION"
sh scripts/build.sh > /dev/null
echo "dist/aivo-launcher.wgt"

# ---------- Sign

step "Signing with certificate profile \"$PROFILE\""
rm -rf dist/pkg dist/aivo-signed.wgt
mkdir dist/pkg
(cd dist/pkg && unzip -q ../aivo-launcher.wgt)
tizen package -t wgt -s "$PROFILE" -- dist/pkg > dist/package.log 2>&1 || true
SIGNED="$(ls dist/pkg/*.wgt 2>/dev/null | head -1 || true)"
if [ -z "$SIGNED" ]; then
    cat dist/package.log
    fail "signing failed. Check the \"$PROFILE\" profile in Certificate Manager (docs/setup-tv.md, step 5)."
fi
# tizen names the file after the app ("Aivo Launcher.wgt"); the TV's installer fails on the space.
mv "$SIGNED" dist/aivo-signed.wgt
rm -f dist/package.log
echo "dist/aivo-signed.wgt"

[ "$INSTALL" = 1 ] || { step "Done (not installed: --no-install)"; exit 0; }

# ---------- Connect

step "Connecting to the TV at $TARGET"
sdb connect "$TARGET" > /dev/null 2>&1 || true
if ! sdb devices | grep -q "^$TARGET[[:space:]]*device"; then
    sdb devices
    fail "the TV at $TARGET is not connected. Check it is on, in Developer Mode with this Mac's IP, and on the same network (docs/setup-tv.md, step 4)."
fi
sdb devices | grep "^$TARGET"

# ---------- Install and launch

step "Installing $APP_ID"
OUT="$(tizen install -n aivo-signed.wgt -s "$TARGET" -- dist 2>&1 || true)"
# The sdb background server sometimes drops the TV between steps; reconnect and try once more.
if printf '%s' "$OUT" | grep -q 'no connected target'; then
    echo "Connection dropped; reconnecting."
    sdb connect "$TARGET" > /dev/null 2>&1 || true
    OUT="$(tizen install -n aivo-signed.wgt -s "$TARGET" -- dist 2>&1 || true)"
fi
if ! printf '%s' "$OUT" | grep -q 'successfully installed'; then
    printf '%s\n' "$OUT" | grep -vE 'installing\[[0-9]+\]'
    fail "the TV refused the install (output above). See the troubleshooting table in docs/setup-tv.md."
fi
echo "Installed."

if [ "$LAUNCH" = 1 ]; then
    step "Opening it on the TV"
    tizen run -p "$APP_ID" -s "$TARGET" 2>&1 | grep -q 'successfully launched' \
        && echo "Launched." \
        || echo "Installed, but could not open it automatically: open Aivo Launcher from Apps on the TV."
fi

step "Done"
