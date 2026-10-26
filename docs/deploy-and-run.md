# Deploy and run

Day-to-day use of Aivo Launcher: trying it on the Mac, putting it on the TV, opening it, changing
it, and fixing the usual problems. Everything here assumes the one-time setup in
[setup-tv.md](setup-tv.md) is done (Developer Mode on the TV, Tizen Studio, the `aivo`
certificate). If it is not, start there.

## Contents

1. [Before you start](#1-before-you-start)
2. [Run it on the Mac (preview)](#2-run-it-on-the-mac-preview)
3. [Deploy to the TV](#3-deploy-to-the-tv)
4. [Open it on the TV](#4-open-it-on-the-tv)
5. [Make it quick to reach](#5-make-it-quick-to-reach)
6. [Change something and redeploy](#6-change-something-and-redeploy)
7. [Save your changes to GitHub](#7-save-your-changes-to-github)
8. [When the TV or network changes](#8-when-the-tv-or-network-changes)
9. [Remove it from the TV](#9-remove-it-from-the-tv)
10. [Troubleshooting](#10-troubleshooting)
11. [Command reference](#11-command-reference)

## 1. Before you start

Open **Terminal** and go to the project. A new terminal window always starts in your home folder,
so do this every time:

```sh
cd ~/Projects/aivo-tv
```

Check the tools are in place. Each line should print a version, not an error:

```sh
node --version          # 20 or newer
sdb version             # Smart Development Bridge 4.x
tizen version           # Tizen CLI 2.x
```

If `sdb` or `tizen` is "command not found", run `source ~/.zshrc` (or open a new terminal window).
If they are still missing, Tizen Studio is not installed: see [setup-tv.md](setup-tv.md), step 3.

The first time on a new Mac, or after deleting `node_modules`, install the project's tools:

```sh
npm install
```

> **Placeholders.** Anything in angle brackets in these docs, like `<tv-ip>`, is something you
> replace — brackets included. `npm run deploy -- <tv-ip>` becomes
> `npm run deploy -- 192.168.1.20`. Typing the brackets gives `no such file or directory`.

## 2. Run it on the Mac (preview)

The preview runs the launcher in your browser with a stand-in for the TV, so you can try changes
without touching the TV:

```sh
npm run preview
```

Open <http://localhost:8080>. The keyboard plays the remote:

| Key | Remote |
| --- | --- |
| Arrow keys | Arrows |
| Enter | OK |
| Esc or Backspace | Back |
| `R` `G` `Y` `B` | Red, Green, Yellow, Blue |

Launching apps and switching HDMI inputs only print a message in the preview; they work on the TV.
The preview's app list is a fixed sample, so some of your apps (BBC iPlayer, for example) appear
only on the TV.

**Stop the preview with Ctrl+C** (Control, not ⌘). Ctrl+Z only pauses it: the page stops loading
and the port stays busy. If that happens, type `fg` to resume it, or `kill %1` to end it.

To run the automated checks without the TV:

```sh
npm test                # expect: pass 78, fail 0
```

## 3. Deploy to the TV

Turn the TV on. Then:

```sh
npm run deploy
```

That one command:

1. runs the tests (and stops if any fail),
2. raises the version number (1.0.3 → 1.0.4) so the TV refreshes its cached icon and files,
3. builds the package,
4. signs it with your `aivo` certificate,
5. connects to the TV,
6. installs it over the existing copy, keeping its settings,
7. opens it on the TV.

A good run ends like this:

```
==> Installing AivoLnchr0.Launcher
Installed.

==> Opening it on the TV
Launched.

==> Done
```

**The first time** (or after the TV's address changes), give the address once; it is remembered
in `.tv-address` after that:

```sh
npm run deploy -- 192.168.1.20
```

Find the address on the TV under **Settings → General → Network → Network Status → IP Settings**.

Useful options, always after `--`:

| Command | Does |
| --- | --- |
| `npm run deploy -- --skip-tests` | faster: skips the tests |
| `npm run deploy -- --no-launch` | installs but does not open it |
| `npm run deploy -- --no-install` | builds and signs only, the TV is not touched |
| `npm run deploy -- --no-bump` | keeps the current version number |
| `npm run deploy -- --help` | lists all options |

If anything fails, the script stops with a one-line explanation and the step it failed at. See
[Troubleshooting](#10-troubleshooting).

## 4. Open it on the TV

`npm run deploy` opens it for you. Otherwise: **Home** → **Apps** → **Aivo Launcher**.

Once it is open:

| Where | How |
| --- | --- |
| Open an app | Arrows to the tile, **OK** |
| Settings | **Up** to the gear in the top-right corner, **OK** |
| Background / wallpaper | Settings → **Background** → Off, Photo or Rotate |
| Apps on the Home row | Settings → **Apps on Home** |
| Every installed app | the **All apps** tile at the end of the row |
| Back out of a screen | **Back** |

Settings are saved on the TV. They survive restarts and redeploys, but not uninstalling.

## 5. Make it quick to reach

The remote's **Home** button always opens Samsung's own home screen (Smart Hub). Samsung does not
let apps replace it, so Aivo Launcher cannot take over that button. These supported settings get
close:

1. **First on the Home bar.** Press **Home**, highlight **Aivo Launcher**, press **Down** (or hold
   **OK**), choose **Move**, move it to the far left and press **OK**. From then on, **Home → OK**
   opens it.
2. **Back after power-on.** **Settings → General → Smart Features → Autorun Last App: On.** If Aivo
   Launcher was open when the TV was switched off, it reopens at power-on.
3. **Keep Smart Hub out of the way.** In the same menu, **Autorun Smart Hub: Off**.

Menu names vary slightly between firmware versions.

## 6. Change something and redeploy

Every change ends with `npm run deploy`. The usual ones:

### Which apps are on the Home row

Easiest, on the TV: Settings → **Apps on Home**. OK on an app in the right-hand list adds it; OK
on one in the left-hand list moves or removes it.

Or in the project, so it is the default after any reinstall: open `src/js/config.local.js`

```sh
open -e src/js/config.local.js
```

and edit the `apps` list. Each entry matches an installed app by name, or exactly by id:

```js
apps: [
    { match: 'netflix', label: 'Netflix', brand: 'netflix' },
    { id: 'AbCdEfGhIj.SomeApp', label: 'Some app' }   // id shown in All apps, bottom left
],
```

An app has to be installed on the TV first (Samsung's **Apps** store). The TV's own Apps on Home
choice wins over the file once you have used it. Keep commas and brackets as they are: one
missing comma stops the launcher loading. Check with `npm run preview` before deploying.

### Your own wallpapers

1. Put photos in `~/Pictures/tv-wallpapers`. Landscape photos work best (portrait ones lose the top
   and bottom). The file name becomes the title: `beach-day.jpg` shows as "Beach day".
2. Run:

   ```sh
   node scripts/prepare-wallpapers.mjs ~/Pictures/tv-wallpapers
   npm run deploy
   ```

3. On the TV: Settings → **Background** → **Photo** (pick one) or **Rotate**.

Each run replaces your previous set with what is in the folder now. Your photos are added after
the ten bundled ones, stripped of camera and location data, and **never committed to git**.

### The app icon

Replace `src/icon.png` with a square 512×512 PNG, then deploy:

```sh
sips -z 512 512 ~/Downloads/my-icon.png --out src/icon.png
npm run deploy
```

If the TV still shows the old icon, restart it (hold the power button until it turns off and on).

### Weather, language, consoles

All in `src/js/config.local.js`: `weather: { latitude, longitude }`, `locale: 'en-GB'`, and
`inputs: [{ hdmi: 1, label: 'PlayStation 5', brand: 'playstation' }]` (`[]` for no console row).
See [config.local.example.js](../src/js/config.local.example.js) for every option.

## 7. Save your changes to GitHub

Each deploy raises the version in `src/config.xml`, `package.json` and `package-lock.json`. Commit
those along with your change:

```sh
git status                      # see what changed
git add <the files you changed> src/config.xml package.json package-lock.json
git commit -m "Describe the change"
git push
```

Prefer naming files over `git add -A`. Your personal files are protected either way: git ignores
`config.local.js`, your wallpapers, `.tv-address` and certificates, and `npm test` fails if those
ignore rules are ever removed.

## 8. When the TV or network changes

- **TV restarted:** nothing to do. `npm run deploy` reconnects by itself.
- **TV got a new IP address** (new router, DHCP change): `npm run deploy -- <new-tv-ip>` once.
- **Mac got a new IP address:** the TV only accepts connections from the address entered in
  Developer Mode. On the TV: **Home → Apps**, enter **1 2 3 4 5**, put in the Mac's new address,
  restart the TV. The Mac's address is under *System Settings → Wi-Fi → Details*.
- **Developer Mode switched itself off** (it can after a firmware update): turn it on again as
  above.

## 9. Remove it from the TV

On the TV: **Home → Apps**, highlight **Aivo Launcher**, open its options, **Delete**. Or from the
Mac:

```sh
tizen uninstall -p AivoLnchr0 -s 192.168.1.20:26101
```

Uninstalling erases the launcher's settings on the TV. The TV is otherwise left exactly as it was.

## 10. Troubleshooting

| What you see | What to do |
| --- | --- |
| `Could not read package.json` | You are not in the project: `cd ~/Projects/aivo-tv` |
| `npm` prints `arn0-tv-launcher@0.2.0` | You are in an old, unported copy of the project; `cd ~/Projects/aivo-tv` |
| `zsh: command not found: sdb` | `source ~/.zshrc`, or open a new terminal window |
| `no such file or directory: TV-IP` | Replace the placeholder with the real address, no `< >` |
| `Stopped: tests failed` | Read the failing test above it; fix it, or `--skip-tests` to deploy anyway |
| `Stopped: signing failed` | The `aivo` certificate profile is missing or its password changed: [setup-tv.md](setup-tv.md), step 5 |
| `Stopped: the TV at … is not connected` | TV on? Same network? Developer Mode on with the Mac's current IP? Then restart the TV and retry |
| `Connection dropped; reconnecting.` | Normal: the connection blinked and the script retried |
| `Stopped: the TV refused the install` | Read the output above it. Certificate errors: the TV's DUID is not in the `aivo` profile (setup step 5) |
| Installed, but the TV shows the old icon or old files | Make sure the version went up (don't use `--no-bump`), then restart the TV |
| Installed, but an app is missing from the row | It is not installed on the TV, or its name differs: use its exact id from **All apps** |
| Home button opens Samsung's home, not Aivo | Expected: see [Make it quick to reach](#5-make-it-quick-to-reach) |
| The preview page does not load | A paused preview holds the port: `fg` then Ctrl+C, or `kill %1` |
| A blank or broken screen on the TV | See "A blank or broken screen" in [setup-tv.md](setup-tv.md#troubleshooting) for capturing the TV's log |

## 11. Command reference

Run from `~/Projects/aivo-tv`:

| Command | Does |
| --- | --- |
| `npm install` | install the project's tools (first time) |
| `npm run preview` | run in the browser at <http://localhost:8080> |
| `npm test` | the automated checks |
| `npm run deploy` | test, bump version, build, sign, install and open on the TV |
| `npm run deploy -- <tv-ip>` | the same, with a new TV address |
| `npm run build` | build the unsigned package only (`dist/aivo-launcher.wgt`) |
| `node scripts/prepare-wallpapers.mjs <folder>` | turn your photos into wallpapers |
| `npm run prefix` | after editing `src/css/style.css`: regenerate the older-TV CSS prefixes |
| `npm run devlog` | receive the TV's Lab logs into `logs/tv.jsonl` |
| `sdb devices` | is the TV connected? |
| `sdb connect <tv-ip>:26101` | connect by hand |
