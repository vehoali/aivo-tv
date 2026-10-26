# 2016 TVs (Tizen 2.4): compatibility notes

Arn0 Launcher, which this is based on, was written on a 2022 Q70B (Chromium M85). Aivo Launcher
also targets the 2016 range, which runs Tizen 2.4 with a web engine Samsung lists as **WebKit
r152340**, a mid-2013 build, roughly Safari 7.

**Status.** The port was made for a TV first thought to be a 2016 KU7020. It turned out to be a
**UE65RU7020 (2019, Tizen 5.0, Chromium M63)**, on which the launcher is installed and runs; there
the compatibility layer finds everything it checks for and installs nothing. The 2016 support
below is therefore tested only against a model of the 2016 engine, not yet on 2016 hardware.

| Model year | Tizen | Web engine (Samsung spec) | Status |
| --- | --- | --- | --- |
| 2016 | 2.4 | WebKit r152340 | modelled in `npm test`; untested on hardware |
| 2019 | 5.0 | Chromium M63 | installed and running (UE65RU7020) |
| 2022 | 6.5 | Chromium M85 | the original Arn0 Launcher's reference TV |

Installation is in [setup-tv.md](setup-tv.md). This page covers what was changed for the old
engine, what to check once it is on the TV, and what could not be verified without one.

## What changed for the old engine

| Area | 2022 code | Now |
| --- | --- | --- |
| Promise, `Array.find`, `padStart`, `Object.assign`, `performance.now`, `requestAnimationFrame` | native | polyfilled by `js/compat.js` when missing, untouched when present |
| `el.style.transform` / `transition` | unprefixed | `Compat.setStyle`, which picks `webkitTransform` and rewrites `transform` inside transition lists |
| Page Visibility | `document.hidden`, `visibilitychange` | `Compat.hidden()`, `Compat.onVisibilityChange` (also `webkitvisibilitychange`) |
| Dates | `toLocaleDateString` with options (needs Intl) | `Compat.formatDate`: built-in English, Spanish and French names, identical to Intl output |
| `classList.toggle(name, force)` | native | fixed when the engine ignores `force` |
| Brand gradients set from JS | `style.background = 'linear-gradient(…)'` | `Compat.setBackground`, which falls back to `-webkit-linear-gradient` |
| Web Audio | `AudioContext`, `createGain`, `start` | also `webkitAudioContext`, `createGainNode`, `noteOn` |
| Colour keys | `registerKeyBatch` | falls back to `registerKey` per key |
| Weather request | `xhr.timeout` | a backup timer as well |
| CSS custom properties | 7 variables, 62 uses | plain values; the font is set on `<body>` |
| CSS grid, `gap` | All apps, photo picker, Settings columns, hints, screen saver | inline-blocks and margins; Settings puts its two columns in the DOM row by row |
| Prefixes | none | every flex, transform and transition declaration also has its `-webkit-` form (`npm run prefix`) |
| Fonts | variable WOFF2 with weight ranges | 24 static WOFF files, 6 weights × 4 families (`fonts/static/`) |
| `background: … center / cover` | shorthand | longhands |
| `config.xml` | `required_version="3.0"` | `2.3` |

Newer TVs take the same code paths as before. Every polyfill is skipped where the feature exists,
and `npm test` runs the whole app against both engines.

## First checks on the TV

These are the parts no test here can stand in for. Run them in this order:

1. **Lab → Render probe: environment and CSS support.** The log should list the active polyfills
   (`Compat polyfills: Promise, …`) and `transform as webkitTransform`. If the list is empty, the
   firmware has a newer engine than expected, which is good news.
2. **Lab → Render probe: everything.** This shows how the 2016 chip handles focus moves. If the
   frame rate is poor, the cheapest wins are turning off **App names → When selected** and using
   **Background → Off** (no photo decode).
3. **App row and All apps.** Check that the tiles line up, that focus scaling looks right, and
   that the brand logos are centred (`object-fit` is missing on this engine, but the SVG logos keep
   their own aspect ratio).
4. **A console tile.** It switches HDMI, then opens Samsung's TV viewer, `org.tizen.tv-viewer`.
   If the input switches but the screen stays on the launcher, that app id differs on this
   firmware. Set the tile to **Inside the launcher** in Settings → Consoles.
5. **Settings → Samsung Home.** The 2022 id (`com.samsung.tv.csfs`) probably does not exist on a
   2016 TV. Find the right id under **All apps** (the focused app's id is shown) and set
   `samsungHomeApp` in `src/js/config.local.js`.
6. **Screen saver → Show it now.** It pans two 2240×1260 photo layers. If it stutters, increase
   **Change photo every** or turn the screen saver off.
7. **Navigation sound.** Run **Lab → Sound: report audio latency**. Old engines often report no
   figures, so judge by ear and turn it off if the click lags.

## What was not verified

Everything above was checked with a model of the 2016 engine (`test/helpers/legacy-env.js`),
which removes what WebKit r152340 lacks from a modern DOM. A modern browser was used for layout.
The model cannot reproduce:

- rendering or layout quirks of the 2013 flexbox implementation
- performance on the 2016 hardware
- which Samsung app ids (TV viewer, Smart Hub) exist on that firmware
- whether `tizen.systeminfo` reports `VIDEOSOURCE` on Tizen 2.4, which the console tiles need

If something misbehaves on the TV, set `devLogUrl` in `src/js/config.local.js`, run
`npm run devlog`, and the Lab results arrive in `logs/tv.jsonl` on your computer.

## Development

```sh
npm install            # dev tools only: postcss, autoprefixer, jsdom, acorn
npm test               # 77 checks: ES5 syntax, legacy lint, polyfills, app on both engines, package
npm run prefix         # after editing css/style.css
python3 scripts/make-static-fonts.py   # only if a font or a weight changes (needs fonttools)
```

`npm test` fails on anything the 2016 engine would reject: an unprefixed transform written from
JS, `document.hidden`, a CSS variable, grid, `gap`, a WOFF2 font, a missing `-webkit-` prefix, a
`required_version` above 2.4, and so on. The rules are in `test/static.test.mjs`.
