# Putting it on a Samsung TV

From a fresh Mac to the launcher running on the TV. Done end to end on a UE65RU7020 (2019,
Tizen 5.0) with Tizen SDK 10 on macOS; other Samsung TVs from 2016 on follow the same steps.
Installing is reversible: uninstall the app and the TV is exactly as it was.

You need:

- a Mac and the TV on the **same network**
- a **Samsung account** (for the signing certificate)
- the TV's remote. If it has no number keys (a Smart Remote), its **123** button shows a number pad

New terminal windows start in your home folder, so begin every session with
`cd ~/Projects/aivo-tv`. If `npm` says it cannot find `package.json`, that is the reason.

## 1. Build the package on the Mac

```sh
cd ~/Projects/aivo-tv
npm install
npm test                 # expect: pass 77, fail 0
cp src/js/config.local.example.js src/js/config.local.js    # first time only
open -e src/js/config.local.js                               # your apps, consoles, weather
npm run preview          # check it at http://localhost:8080, then Ctrl+C (not Ctrl+Z)
npm run build            # -> dist/aivo-launcher.wgt, about 96 files
```

The first line `npm` prints should read `aivo-tv-launcher@1.0.0`. Anything else means you are in
another copy of the project.

## 2. Turn on Developer Mode on the TV

1. On the Mac, note its IP address: *System Settings → Wi-Fi → Details*.
2. On the TV, press **Home** and open **Apps**.
3. Enter **1 2 3 4 5** with the remote (press **123** first for the number pad).
4. Switch **Developer mode** to **On**, enter the Mac's IP address, press **OK**.
5. Restart the TV: hold the power button until it turns off and on again.
6. Note the TV's IP address: *Settings → Network → Network Status → IP Settings*.

If the Mac's IP address changes later (a router restart can do it), enter the new one here again.

## 3. Install Tizen Studio (command-line version)

1. Download the macOS **CLI installer** from
   <https://developer.tizen.org/development/tizen-studio/download>, e.g.
   `web-cli_Tizen_SDK_10.0_usa_macos-64.bin`.
2. Run it, answering **Y** to the default location (`~/tizen-studio`):

   ```sh
   chmod +x ~/Downloads/web-cli_Tizen_SDK_10.0_usa_macos-64.bin
   ~/Downloads/web-cli_Tizen_SDK_10.0_usa_macos-64.bin --accept-license
   ```

   If macOS blocks it: *System Settings → Privacy & Security → Open Anyway*, then run it again.
   A line `rm: …/.package-manager/jdk: No such file or directory` is harmless.

3. **Fix the package server.** The installer may configure `http://usa.sdk-dl.tizen.org`, which
   now refuses plain HTTP, and every later step fails with *Cannot connect the repository
   server*. Point it at the main server over HTTPS:

   ```sh
   sed -i '' 's#^Repository: .*#Repository: https://download.tizen.org/sdk/tizenstudio#' ~/tizen-studio/.info/repository.info
   ```

4. Install the Samsung packages. Close any Package Manager window first: two package managers at
   once cancel each other.

   ```sh
   ~/tizen-studio/package-manager/package-manager-cli.bin install --accept-license Certificate-Manager,cert-add-on,TV-SAMSUNG-Extension-Tools
   ```

   Check with `~/tizen-studio/package-manager/package-manager-cli.bin show-pkgs`: those three
   (and `TV-SAMSUNG-Extension-Resources`) should start with `i`, not `ni`. Do not run the installer
   `.bin` again afterwards; it can undo step 3.

5. Put the tools on your PATH, then load it:

   ```sh
   echo 'export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   sdb version && tizen version
   ```

## 4. Connect to the TV

Use the TV's real IP address from step 2.6 (no `< >` around it), and keep `:26101`:

```sh
sdb connect 192.168.1.20:26101
sdb devices
```

`sdb devices` must list the TV, e.g. `192.168.1.20:26101   device   UE65RU7020KXXU`. An empty list
means it is not connected: check Developer Mode, the Mac IP entered on the TV, and that both are
on the same network, then restart the TV and try again. **Do not continue until the TV is listed.**

## 5. Create the Samsung certificate (once)

The certificate must be made **while the TV is connected**: it reads the TV's DUID, and a TV only
installs packages signed for its own DUID.

```sh
open ~/tizen-studio/tools/certificate-manager/certificate-manager.app
```

1. Click **+**, choose **Samsung**, then device type **TV**.
2. Profile name: `aivo`.
3. **Create a new author certificate**: a name and a password. **Write the password down and back
   up the author certificate** (Certificate Manager shows where it saved the `.p12` file). Every
   future update must be signed with this same certificate, or the TV will refuse it. Keep the
   backup outside the project folder; `.gitignore` already blocks `*.p12` from commits.
4. Sign in with your Samsung account.
5. Distributor certificate: privilege **Public**. The TV's DUID is filled in from the connected
   TV. If the DUID list is empty, go back to step 4.
6. **Finish**.

## 6. Allow the TV to accept your apps

```sh
open ~/tizen-studio/tools/device-manager/bin/device-manager.app
```

Right-click the TV and choose **Permit to install applications**.

## 7. Sign and install

One command does it all: tests, build, sign, connect, install, and open the app on the TV. Give
the TV's address the first time; it is remembered in `.tv-address` (gitignored) after that.

```sh
cd ~/Projects/aivo-tv
npm run deploy -- 192.168.1.20     # first time
npm run deploy                      # every time after
```

It stops with a plain message at the first thing that goes wrong (tests failing, signing, the TV
not connected, the install refused). Options, after `--`: `--skip-tests`, `--no-install` (build
and sign only), `--no-launch`, `--profile NAME`, `--no-bump`. `npm run deploy -- --help` lists them.

Each install raises the patch version (1.0.1 → 1.0.2) in `src/config.xml` and `package.json`.
The TV caches an app's icon and files by version number, so reinstalling the same version can
leave the old icon on screen. Commit the two bumped files along with your change.

What the script runs, if you ever need the steps by hand:

```sh
npm run build
rm -rf dist/pkg && mkdir dist/pkg && (cd dist/pkg && unzip -q ../aivo-launcher.wgt)
tizen package -t wgt -s aivo -- dist/pkg
mv "dist/pkg/Aivo Launcher.wgt" dist/aivo-signed.wgt
tizen install -n aivo-signed.wgt -s 192.168.1.20:26101 -- dist
```

Use your device name from `sdb devices` after `-s`. The `mv` matters: `tizen package` names the
signed file after the app, with a space, and the TV's installer fails on a path containing a
space with nothing more than *Failed to install Tizen application*.

## 8. Open it

From here on, everyday use (deploying changes, customising, troubleshooting) is in
[deploy-and-run.md](deploy-and-run.md).


On the TV: **Home → Apps → Aivo Launcher**. Add it to the Home bar from the app's options to
reach it in one press.

Then work through **First checks on the TV** in
[compatibility-2016.md](compatibility-2016.md#first-checks-on-the-tv): the Lab probes, your app
row, a console tile, the screen saver and the sound.

## Updating

After any change: `npm run deploy`. It signs with the same `aivo` profile every time, which is
what the TV requires. Installing over the existing app keeps its settings; uninstalling first
erases them. If the TV's address changes (a new router, say), pass the new one once:
`npm run deploy -- <new-ip>`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm` cannot find `package.json` | `cd ~/Projects/aivo-tv` first |
| `zsh: command not found: sdb` | `source ~/.zshrc`, or open a new terminal window |
| `no such file or directory: TV-IP` | replace the placeholder with the real IP, without `< >` |
| *Cannot connect the repository server* | step 3.3 |
| *Tizen Studio programs are running under installed location* | close the Package Manager window, then retry |
| `sdb devices` is empty | step 4 |
| *Failed to install Tizen application* with no reason | the file name has a space: step 7's `mv` |
| The TV still shows the old icon after an install | the version did not change: deploy without `--no-bump`, or raise it in `src/config.xml` |
| Install refused / certificate error | DUID missing from the `aivo` profile (step 5) or step 6 not done |
| The preview page will not load after Ctrl+Z | `fg` to resume it, or `kill %1`; stop it with Ctrl+C |
| A blank or broken screen on the TV | set `devLogUrl: 'http://<Mac-IP>:8099/log'` in `config.local.js`, run `npm run devlog`, rebuild, reinstall and run the Lab; the log lands in `logs/tv.jsonl` |

To remove the launcher: on the TV, open the app's options in **Apps** and choose **Delete**, or
`tizen uninstall -p AivoLnchr0 -s <device>`.
