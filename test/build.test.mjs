// npm run build produces a .wgt that holds everything the page loads, and nothing the 2016 TV cannot use.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WGT = resolve(ROOT, 'dist/aivo-launcher.wgt');
let entries;

before(() => {
    execFileSync('sh', ['scripts/build.sh'], { cwd: ROOT, stdio: 'pipe' });
    entries = execFileSync('unzip', ['-Z1', WGT], { encoding: 'utf8' }).trim().split('\n');
});

test('the package has the manifest, page and compatibility layer', () => {
    for (const f of ['config.xml', 'index.html', 'icon.png', 'css/style.css', 'js/compat.js']) {
        assert.ok(entries.includes(f), f + ' missing from the .wgt');
    }
});

test('every script, font and image the page references is packaged', async () => {
    const html = await readFile(resolve(ROOT, 'src/index.html'), 'utf8');
    const css = await readFile(resolve(ROOT, 'src/css/style.css'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1])
        .concat([...css.matchAll(/url\("?\.\.\/([^")]+)"?\)/g)].map((m) => m[1]));
    for (const r of refs) assert.ok(entries.includes(r), r + ' is referenced but not packaged');
    const brands = execFileSync('node', ['-e',
        'global.window={};require("./src/js/brands.js");' +
        'console.log(window.BRANDS.filter(b=>b.mark).map(b=>b.key).join(" "))'], { cwd: ROOT, encoding: 'utf8' });
    for (const key of brands.trim().split(' ')) {
        assert.ok(entries.includes('img/tiles/' + key + '.svg'), 'tile mark ' + key + ' missing');
    }
});

test('no WOFF2, tests or tooling in the package', () => {
    const unwanted = entries.filter((e) => /\.woff2$|^test\/|node_modules|\.mjs$|\.py$|legacy-env/.test(e));
    assert.deepEqual(unwanted, []);
});

test('the packaged manifest targets Tizen 2.3+', () => {
    const xml = execFileSync('unzip', ['-p', WGT, 'config.xml'], { encoding: 'utf8' });
    assert.match(xml, /required_version="2\.3"/);
});

test('the package stays small enough for a 2016 TV', () => {
    const out = execFileSync('unzip', ['-l', WGT], { encoding: 'utf8' });
    const total = Number(/(\d+)\s+\d+ files\s*$/.exec(out.trim())[1]);
    assert.ok(total < 12 * 1024 * 1024, 'uncompressed size ' + total);
});
