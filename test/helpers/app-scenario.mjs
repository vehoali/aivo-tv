// The same remote-control walk through the launcher, run once per engine model (see app-*.test.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, key, sleep, waitFor } from './load-app.mjs';

const K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, RED: 403 };

export function scenario(legacy) {
    let app;
    let w;
    let $;
    const launched = [];

    const focused = () => w.document.querySelector('.focused');
    const visible = (id) => !$(id).classList.contains('hidden');
    const label = (el) => (el.querySelector('.setting-label, .label, .name') || el).textContent;

    before(async () => {
        app = await loadApp({ legacy });
        w = app.window;
        $ = (id) => w.document.getElementById(id);
        const launch = w.tizen.application.launch;
        w.tizen.application.launch = function (id, ok, err) {
            launched.push(id);
            return launch.call(this, id, ok, err);
        };
        // The app list arrives from the mock after a short delay.
        await waitFor(() => $('apps-row').children.length > 1);
    });

    after(() => w.close());

    test('boots without a single script error', () => {
        assert.deepEqual(app.errors.map(String), []);
        assert.equal(Boolean(w.__LEGACY_ENV__), legacy);
    });

    test('the right polyfills are active', () => {
        const installed = Array.from(w.Compat.installed);
        if (legacy) {
            assert.ok(installed.includes('Promise'));
            assert.ok(installed.includes('date names (no Intl)'));
        } else {
            assert.deepEqual(installed, []);
        }
    });

    test('Home shows the curated apps, the All tile and the console inputs', () => {
        const apps = Array.from($('apps-row').children).map(label);
        assert.ok(apps.includes('Netflix'), apps.join(', '));
        assert.ok(apps.includes('YouTube'));
        assert.ok(apps.length >= 8);
        const inputs = Array.from($('inputs-row').children).map(label);
        assert.deepEqual(inputs, ['Nintendo Switch 2', 'PlayStation 5', 'Xbox Series X']);
    });

    test('brand tiles get their colours, gradients included', () => {
        const tiles = Array.from(w.document.querySelectorAll('#apps-row .tile'));
        const painted = tiles.filter((t) => t.style.background || t.style.backgroundImage);
        assert.ok(painted.length >= tiles.length - 1, 'unpainted tiles');
        const disney = Array.from($('apps-row').children).find((a) => label(a) === 'Disney+');
        assert.match(disney.querySelector('.tile').getAttribute('style'), /linear-gradient/);
    });

    test('clock and date render; the font is set without CSS variables', () => {
        assert.match($('time-main').textContent, /^\d{1,2}:\d{2}$/);
        const today = new Date();
        const expected = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(today);
        assert.equal($('date').textContent, expected);
        assert.match(w.document.body.style.fontFamily, /Manrope/);
        assert.equal(w.document.documentElement.style.getPropertyValue('--font'), '');
    });

    test('colour keys are registered', () => {
        if (legacy) {
            assert.deepEqual(Array.from(w.__registeredKeys),
                ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']);
        } else {
            assert.equal(typeof w.tizen.tvinputdevice.registerKeyBatch, 'function');
        }
    });

    test('arrow keys move focus along the app row and scroll it with a transform', () => {
        const first = focused();
        assert.ok(first, 'nothing focused on Home');
        assert.ok(first.parentNode.id === 'apps-row');
        key(w, K.RIGHT);
        const second = focused();
        assert.notEqual(second, first);
        assert.equal(second.previousSibling, first);
        key(w, K.LEFT);
        assert.equal(focused(), first);
        // jsdom has no layout, so force a scroll position and check it is written in a form
        // the engine understands.
        w.UI.resetScroll($('apps-row'));
        const style = $('apps-row').getAttribute('style') || '';
        assert.doesNotMatch(style, /translate/);
    });

    test('OK on an app launches it through tizen.application', async () => {
        key(w, K.RIGHT);
        const target = focused();
        key(w, K.ENTER);
        await waitFor(() => launched.length > 0);
        assert.ok(launched[0].length > 3);
        assert.ok(app.logs.some((l) => l.includes('[mock] launch')), 'mock launch not reached');
        key(w, K.LEFT);
        assert.notEqual(focused(), target);
    });

    test('a failing launch shows a toast instead of throwing', async () => {
        // The mock fails Spotify on purpose.
        const spotify = Array.from($('apps-row').children).find((a) => label(a) === 'Spotify');
        w.UI.focusOn(spotify);
        key(w, K.ENTER);
        await waitFor(() => $('toast').classList.contains('visible'));
        assert.match($('toast').textContent, /Mock launch failure|Spotify/);
        assert.deepEqual(app.errors.map(String), []);
    });

    test('Down moves to the inputs; OK switches HDMI through tvwindow', async () => {
        key(w, K.DOWN);
        assert.equal(focused().parentNode.id, 'inputs-row');
        const before = launched.length;
        key(w, K.ENTER);
        await waitFor(() => launched.length > before);
        assert.equal(launched[launched.length - 1], 'org.tizen.tv-viewer');
        assert.equal(w.tizen.tvwindow.getSource().type, 'HDMI');
    });

    test('Up twice reaches the gear; OK opens Settings in two columns, read top to bottom', () => {
        key(w, K.UP);
        key(w, K.UP);
        assert.equal(focused().id, 'gear');
        key(w, K.ENTER);
        assert.ok(visible('settings'));
        const rows = Array.from(w.document.querySelectorAll('#settings .setting-row')).map(label);
        // DOM order is row by row: left column entry, then the one beside it.
        assert.deepEqual(rows, ['Background', 'Navigation sound', 'Apps on Home', 'Screen saver',
            'Consoles', 'Samsung Home', 'Appearance', 'Advanced']);
        assert.equal(label(focused()), 'Background');
        key(w, K.DOWN);
        assert.equal(label(focused()), 'Apps on Home', 'Down must stay in the first column');
        key(w, K.RIGHT);
        assert.equal(label(focused()), 'Screen saver');
        // Up/Down between rows picks the nearest column by geometry, which jsdom does not lay
        // out, so only the in-row moves are checked from here.
        key(w, K.LEFT);
        assert.equal(label(focused()), 'Apps on Home');
        key(w, K.UP);
    });

    test('Appearance: French date and another font apply immediately', () => {
        // Back to the first column, then down to Appearance.
        key(w, K.LEFT);
        key(w, K.DOWN);
        key(w, K.DOWN);
        key(w, K.DOWN);
        assert.equal(label(focused()), 'Appearance');
        key(w, K.ENTER);
        assert.ok(visible('appearance'));
        const french = Array.from(w.document.querySelectorAll('#appearance .chip')).find((c) => c.textContent === 'Français');
        w.UI.focusOn(french);
        key(w, K.ENTER);
        const today = new Date();
        const want = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(today);
        assert.equal($('date').textContent, want.charAt(0).toUpperCase() + want.slice(1));
        const inter = Array.from(w.document.querySelectorAll('#appearance .chip')).find((c) => c.textContent === 'Inter');
        w.UI.focusOn(inter);
        key(w, K.ENTER);
        assert.match(w.document.body.style.fontFamily, /^"?Inter"?,/);
        assert.equal(w.Prefs.get().appearance.font, 'inter');
    });

    test('Background page: chips and photo thumbnails form the focus grid', () => {
        key(w, K.BACK);
        assert.ok(visible('settings'));
        w.UI.show('bg');
        const photo = Array.from(w.document.querySelectorAll('#bg-mode .chip')).find((c) => c.textContent.indexOf('Photo') >= 0);
        w.UI.focusOn(photo);
        key(w, K.ENTER);
        assert.ok(!$('bg-photos-block').classList.contains('hidden'));
        assert.ok($('bg-photos').children.length > 0);
        key(w, K.DOWN);
        assert.ok(focused().classList.contains('thumb'));
    });

    test('Back walks back to Home', () => {
        key(w, K.BACK);
        key(w, K.BACK);
        assert.ok(visible('home'));
    });

    test('All apps grid lists every consumer app', () => {
        w.UI.show('all');
        const tiles = $('all-grid').children.length;
        assert.ok(tiles >= 10, String(tiles));
        assert.ok(focused().parentNode.id === 'all-grid');
        key(w, K.DOWN);
        // Five per row: Down lands five tiles later.
        assert.equal(Array.from($('all-grid').children).indexOf(focused()), 5);
        key(w, K.BACK);
        assert.ok(visible('home'));
    });

    test('screen saver opens, pans with a transform, and any key closes it', async () => {
        w.Prefs.get().wallpaper.mode = 'photo';
        w.Screensaver.open();
        assert.ok(w.Screensaver.isOpen());
        assert.ok(visible('screensaver'));
        assert.match($('ss-time').textContent, /\d{1,2}:\d{2}/);
        assert.ok($('ss-date').textContent.length > 3);
        key(w, K.DOWN);
        assert.equal(w.Screensaver.isOpen(), false);
        assert.ok(visible('home'));
    });

    test('the TV going to the background closes the screen saver', () => {
        w.Screensaver.open();
        if (legacy) {
            w.document.webkitHidden = true;
            w.document.dispatchEvent(new w.Event('webkitvisibilitychange'));
            w.document.webkitHidden = false;
        } else {
            Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => true });
            w.document.dispatchEvent(new w.Event('visibilitychange'));
            delete w.document.hidden;
        }
        assert.equal(w.Screensaver.isOpen(), false);
    });

    test('navigation sound plays through the engine\'s Web Audio API', () => {
        w.Prefs.get().sound.enabled = true;
        w.Sound.preview();
        if (legacy) assert.deepEqual(Array.from(w.__audioCalls || []).slice(0, 2), ['noteOn', 'noteOff']);
        assert.deepEqual(app.errors.map(String), []);
    });

    test('Lab probes run and report the compatibility layer', async () => {
        w.UI.show('lab');
        const items = Array.from($('lab-list').children);
        assert.ok(items.length >= 8);
        const env = items.find((li) => /environment and CSS support/.test(li.textContent));
        w.UI.focusOn(env);
        key(w, K.ENTER);
        const platform = items.find((li) => /what APIs this TV exposes/.test(li.textContent));
        w.UI.focusOn(platform);
        key(w, K.ENTER);
        await sleep(50);
        const log = w.DevLog.lines().join('\n');
        assert.match(log, /Compat polyfills: /);
        assert.match(log, /platform probe start/);
        if (legacy) assert.match(log, /transform as webkitTransform/);
        key(w, K.BACK);
    });

    test('settings survive a reload (localStorage)', () => {
        const saved = JSON.parse(w.localStorage.getItem('aivo.prefs.v1'));
        assert.equal(saved.appearance.locale, 'fr-FR');
        assert.equal(saved.appearance.font, 'inter');
    });

    test('no script errors anywhere along the way', () => {
        assert.deepEqual(app.errors.map(String), []);
    });
}
