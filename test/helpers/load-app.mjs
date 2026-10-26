// Boots src/index.html in jsdom with the Tizen mock, optionally as the 2016 engine (legacy-env.js).
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const SRC = resolve(ROOT, 'src');
const ORIGIN = 'http://tv.test/';

class SrcLoader extends ResourceLoader {
    fetch(url, options) {
        const path = decodeURIComponent(new URL(url).pathname);
        // Only scripts are needed; images and fonts would need the canvas package.
        if (extname(path) !== '.js') return null;
        // The tests assert on the repository defaults, not on whatever this TV's owner put in
        // the gitignored config.local.js or wallpapers.local.js.
        if (/\/(config|wallpapers)\.local\.js$/.test(path)) return Promise.resolve(Buffer.from(''));
        const file = path === '/__legacy-env.js'
            ? resolve(import.meta.dirname, 'legacy-env.js')
            : resolve(SRC, '.' + path);
        return readFile(file);
    }
}

export async function loadApp({ legacy = false, hash = '' } = {}) {
    let html = await readFile(resolve(SRC, 'index.html'), 'utf8');
    if (legacy) {
        html = html.replace('<script src="js/compat.js"></script>',
            '<script src="__legacy-env.js"></script>\n    <script src="js/compat.js"></script>');
    }
    const errors = [];
    const logs = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('log', (...a) => logs.push(a.join(' ')));
    virtualConsole.on('jsdomError', (e) => {
        // jsdom has no canvas or media backend; the TV does. Not launcher errors.
        if (/Not implemented: (HTMLCanvasElement.prototype.getContext|HTMLMediaElement)/.test(e.message)) return;
        errors.push(e.detail || e);
    });
    virtualConsole.on('error', (...a) => errors.push(a.join(' ')));

    const dom = new JSDOM(html, {
        url: ORIGIN + hash,
        runScripts: 'dangerously',
        resources: new SrcLoader(),
        virtualConsole,
        pretendToBeVisual: !legacy
    });
    const window = dom.window;
    window.addEventListener('error', (e) => errors.push(e.error || e.message));

    await new Promise((ok, fail) => {
        window.addEventListener('load', ok);
        setTimeout(() => fail(new Error('page did not load')), 10000);
    });
    return { dom, window, document: window.document, errors, logs };
}

export function key(window, keyCode) {
    const e = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    window.document.dispatchEvent(e);
    return e;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, ms = 4000) {
    const start = Date.now();
    for (;;) {
        const v = fn();
        if (v) return v;
        if (Date.now() - start > ms) throw new Error('timed out waiting for ' + fn);
        await sleep(20);
    }
}
