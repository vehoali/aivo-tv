// Static checks: everything the 2016 engine (WebKit r152340) would reject, found without running it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import * as acorn from 'acorn';
import { prefix } from '../scripts/prefix-css.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'src');
const read = (p) => readFile(resolve(SRC, p), 'utf8');
const exists = (p) => access(p).then(() => true, () => false);

async function jsFiles() {
    return (await readdir(resolve(SRC, 'js'))).filter((f) => f.endsWith('.js') && f !== 'config.local.js' && f !== 'wallpapers.local.js');
}

// Strips comments so a rule does not fire on prose that mentions the feature.
function code(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

test('every script parses as ES5', async () => {
    for (const f of await jsFiles()) {
        const text = await read('js/' + f);
        assert.doesNotThrow(() => acorn.parse(text, { ecmaVersion: 5 }), 'js/' + f + ' is not ES5');
    }
});

/*
 * Each rule is a feature WebKit r152340 lacks. Polyfilled methods (find, padStart, Promise, …)
 * are allowed; these are the ones a polyfill cannot fix, which must go through js/compat.js.
 */
const JS_RULES = [
    [/\.style\.(transform|transition|transformOrigin)\b/, 'set transforms with Compat.setStyle'],
    [/\bdocument\.hidden\b/, 'use Compat.hidden()'],
    [/['"]visibilitychange['"]/, 'use Compat.onVisibilityChange'],
    [/\.toLocale(Date|Time)?String\(/, 'use Compat.formatDate (no Intl on 2016 TVs)'],
    [/setProperty\(\s*['"]--/, 'no CSS custom properties'],
    [/\.style\.grid\w*/, 'no CSS grid'],
    [/\bfetch\(/, 'no fetch(): use XMLHttpRequest'],
    [/\bnew (Map|Set|WeakMap|WeakSet|Proxy)\b|\bSymbol\(/, 'ES2015 collection'],
    [/\bObject\.(values|entries|fromEntries)\b|\bArray\.(from|of)\b/, 'ES2015+ built-in without a polyfill'],
    [/\.(includes|startsWith|endsWith|padEnd|closest|matches)\(/, 'method without a polyfill'],
    [/\bIntl\./, 'no Intl'],
    [/querySelectorAll\([^)]*\)\.forEach/, 'NodeList.forEach is missing'],
    [/\.dataset\b/, 'dataset: use properties'],
    [/\.(append|prepend|replaceWith|before|after)\(/, 'ChildNode/ParentNode methods are missing'],
    [/\.style\.background\s*=/, 'set backgrounds with Compat.setBackground (gradients)']
];

test('scripts use only what the 2016 engine has, or go through Compat', async () => {
    const problems = [];
    for (const f of await jsFiles()) {
        if (f === 'compat.js' || f === 'tizen-mock.js') continue;
        const lines = code(await read('js/' + f)).split('\n');
        lines.forEach((line, i) => {
            for (const [re, why] of JS_RULES) {
                if (re.test(line)) problems.push(`js/${f}:${i + 1}: ${why}\n    ${line.trim()}`);
            }
        });
    }
    assert.deepEqual(problems, []);
});

const CSS_RULES = [
    [/var\(--|^\s*--[\w-]+\s*:/, 'custom properties'],
    [/display:\s*(-webkit-)?(inline-)?grid|grid-template|grid-auto|grid-(row|column)/, 'CSS grid'],
    [/(^|[\s;{])(row-|column-)?gap\s*:/, 'gap'],
    [/\b(clamp|min|max)\(/, 'clamp()/min()/max()'],
    [/aspect-ratio|(^|[\s;{])inset\s*:|overflow:\s*clip/, 'unsupported property'],
    [/:(is|where|has)\(/, 'modern selector'],
    [/\.woff2|format\(["']woff2/, 'WOFF2 font'],
    [/font-weight:\s*\d+\s+\d+/, 'variable font weight range'],
    [/background:[^;]*\/\s*(cover|contain)/, 'background-size inside the shorthand'],
    [/color-mix\(|@container|@layer/, 'modern CSS']
];

test('stylesheet uses only what the 2016 engine has', async () => {
    const lines = (await read('css/style.css')).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
    const problems = [];
    lines.forEach((line, i) => {
        for (const [re, why] of CSS_RULES) {
            if (re.test(line)) problems.push(`css/style.css:${i + 1}: ${why}\n    ${line.trim()}`);
        }
    });
    assert.deepEqual(problems, []);
});

test('stylesheet carries every -webkit- prefix (npm run prefix)', async () => {
    const css = await read('css/style.css');
    assert.equal(await prefix(css, resolve(SRC, 'css/style.css')), css,
        'run npm run prefix: Autoprefixer would still add declarations');
    // Spot-check the ones the layout depends on.
    assert.match(css, /display: -webkit-flex;/);
    assert.match(css, /-webkit-transform: scale\(1\.07\)/);
    assert.match(css, /-webkit-transition: -webkit-transform/);
});

test('every font and image the stylesheet references exists', async () => {
    const css = await read('css/style.css');
    const urls = [...css.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]);
    assert.ok(urls.length > 20);
    for (const u of urls) {
        assert.ok(await exists(resolve(SRC, 'css', u)), 'missing ' + u);
    }
    // 4 families × 6 weights, all static WOFF.
    const faces = css.match(/@font-face \{/g) || [];
    assert.equal(faces.length, 24);
});

test('every font weight in use has a static face', async () => {
    const css = await read('css/style.css');
    const game = await read('js/runner-game.js');
    const used = new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1])));
    // The runner game draws canvas text with text(value, x, y, size, color, align, weight).
    for (const m of game.matchAll(/\btext\([^;]*, (\d{3})\);/g)) used.add(Number(m[1]));
    used.add(Number(/weight \|\| (\d+)/.exec(game)[1]));
    const faces = new Set([...css.matchAll(/@font-face \{[^}]*font-weight: (\d+)/g)].map((m) => Number(m[1])));
    for (const w of used) assert.ok(faces.has(w), 'no static face for weight ' + w);
});

test('index.html loads compat.js first and every script exists', async () => {
    const html = await read('index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(scripts[0], 'js/compat.js');
    for (const s of scripts) {
        if (/^js\/(config|wallpapers)\.local\.js$/.test(s)) continue;
        assert.ok(await exists(resolve(SRC, s)), 'missing ' + s);
    }
    assert.equal(new Set(scripts).size, scripts.length, 'a script is listed twice');
});

test('config.xml installs on Tizen 2.4', async () => {
    const xml = await read('config.xml');
    const required = /required_version="([\d.]+)"/.exec(xml);
    assert.ok(required, 'required_version is missing');
    assert.ok(parseFloat(required[1]) <= 2.4, 'required_version ' + required[1] + ' is above Tizen 2.4');
    assert.match(xml, /package="[A-Za-z0-9]{10}"/);
    assert.match(xml, /<tizen:profile name="tv-samsung"\/>/);
    for (const p of ['application.launch', 'application.info', 'tv.inputdevice', 'tv.window', 'internet']) {
        assert.ok(xml.includes('http://tizen.org/privilege/' + p), 'privilege ' + p);
    }
    const content = /<content src="([^"]+)"/.exec(xml)[1];
    assert.ok(await exists(resolve(SRC, content)));
});

test('the static fonts are real WOFF 1.0 files', async () => {
    const dir = resolve(SRC, 'fonts/static');
    const files = await readdir(dir);
    assert.equal(files.filter((f) => f.endsWith('.woff')).length, 24);
    for (const f of files) {
        const head = (await readFile(resolve(dir, f))).subarray(0, 4).toString('latin1');
        assert.equal(head, 'wOFF', f + ' is not WOFF 1.0');
    }
});

test('personal files are gitignored', async () => {
    const ignore = await readFile(resolve(ROOT, '.gitignore'), 'utf8');
    for (const p of ['src/js/config.local.js', 'src/js/wallpapers.local.js', 'src/img/wallpapers/local/',
        '.tv-address', '*.p12']) {
        assert.ok(ignore.split('\n').includes(p), p + ' is not in .gitignore');
    }
});

test('test helpers stay out of the package', async () => {
    assert.equal(dirname(resolve(ROOT, 'test/helpers/legacy-env.js')).startsWith(SRC), false);
});
