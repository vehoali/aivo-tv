// Unit tests for js/compat.js, run in a jsdom window with the 2016 engine's gaps (legacy-env.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { SRC } from './helpers/load-app.mjs';

let win;

before(async () => {
    const legacy = await readFile(resolve(import.meta.dirname, 'helpers/legacy-env.js'), 'utf8');
    const compat = await readFile(resolve(SRC, 'js/compat.js'), 'utf8');
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://tv.test/', runScripts: 'outside-only' });
    win = dom.window;
    win.eval(legacy);
    win.eval(compat);
});

after(() => win.close());

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('installs every polyfill the 2016 engine needs', () => {
    const installed = Array.from(win.Compat.installed);
    for (const name of ['Promise', 'Array.prototype.find', 'Array.prototype.findIndex',
        'String.prototype.padStart', 'String.prototype.repeat', 'Object.assign', 'performance.now',
        'classList.toggle(name, force)', 'date names (no Intl)']) {
        assert.ok(installed.includes(name), name + ' was not installed');
    }
    assert.ok(installed.some((n) => n.startsWith('requestAnimationFrame')));
});

// ---------- Promise

test('Promise: resolves asynchronously and chains', async () => {
    const order = [];
    const p = new win.Promise((ok) => ok(1));
    p.then((v) => { order.push('then ' + v); return v + 1; })
        .then((v) => order.push('then ' + v));
    order.push('sync');
    await tick(20);
    assert.deepEqual(order, ['sync', 'then 1', 'then 2']);
});

test('Promise: adopts thenables and nested promises', async () => {
    const thenable = { then: (ok) => ok('thenable') };
    const values = [];
    win.Promise.resolve(thenable).then((v) => values.push(v));
    new win.Promise((ok) => ok(new win.Promise((ok2) => setTimeout(() => ok2('nested'), 5))))
        .then((v) => values.push(v));
    await tick(30);
    assert.deepEqual(values.sort(), ['nested', 'thenable']);
});

test('Promise: rejections propagate to catch, and catch recovers', async () => {
    let caught;
    let after;
    win.Promise.reject(new Error('boom'))
        .then(() => { throw new Error('skipped'); })
        .catch((e) => { caught = e.message; return 'recovered'; })
        .then((v) => { after = v; });
    await tick(20);
    assert.equal(caught, 'boom');
    assert.equal(after, 'recovered');
});

test('Promise: a throwing executor or handler rejects', async () => {
    const seen = [];
    new win.Promise(() => { throw new Error('executor'); }).catch((e) => seen.push(e.message));
    win.Promise.resolve().then(() => { throw new Error('handler'); }).catch((e) => seen.push(e.message));
    await tick(20);
    assert.deepEqual(seen.sort(), ['executor', 'handler']);
});

test('Promise: settles once; later resolve/reject calls are ignored', async () => {
    const seen = [];
    new win.Promise((ok, fail) => { ok('first'); ok('second'); fail(new Error('late')); })
        .then((v) => seen.push(v), () => seen.push('rejected'));
    await tick(20);
    assert.deepEqual(seen, ['first']);
});

test('Promise: rejects self-resolution', async () => {
    let err;
    let resolveSelf;
    const p = new win.Promise((ok) => { resolveSelf = ok; });
    resolveSelf(p);
    p.catch((e) => { err = e; });
    await tick(20);
    assert.ok(err instanceof win.TypeError);
});

test('Promise.all and Promise.race', async () => {
    const P = win.Promise;
    let all;
    let race;
    let allEmpty;
    let allFail;
    P.all([1, P.resolve(2), new P((ok) => setTimeout(() => ok(3), 5))]).then((v) => { all = v; });
    P.all([]).then((v) => { allEmpty = v; });
    P.all([P.resolve(1), P.reject(new Error('no'))]).catch((e) => { allFail = e.message; });
    P.race([new P((ok) => setTimeout(() => ok('slow'), 20)), new P((ok) => setTimeout(() => ok('fast'), 2))])
        .then((v) => { race = v; });
    await tick(40);
    assert.deepEqual(Array.from(all), [1, 2, 3]);
    assert.deepEqual(Array.from(allEmpty), []);
    assert.equal(allFail, 'no');
    assert.equal(race, 'fast');
});

test('Promise: Apps.withTimeout pattern rejects when the TV does not answer', async () => {
    const P = win.Promise;
    const withTimeout = (promise, ms) => new P((ok, fail) => {
        const t = setTimeout(() => fail(new Error('timeout')), ms);
        promise.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); fail(e); });
    });
    let err;
    withTimeout(new P(() => {}), 10).catch((e) => { err = e.message; });
    await tick(30);
    assert.equal(err, 'timeout');
});

// ---------- Built-ins

test('Array find/findIndex', () => {
    // Built in the page's own realm, so it has the page's (polyfilled) Array.prototype.
    const list = win.eval('[{ k: "a" }, { k: "b" }]');
    assert.equal(list.find((x) => x.k === 'b').k, 'b');
    assert.equal(list.find((x) => x.k === 'z'), undefined);
    assert.equal(list.findIndex((x) => x.k === 'b'), 1);
    assert.equal(list.findIndex((x) => x.k === 'z'), -1);
    // A for-in over an array (or a prototype dump in the Lab) must not see the polyfill.
    assert.equal(win.eval('(function () { for (var k in []) return k; return null; })()'), null);
});

test('String padStart/repeat', () => {
    assert.equal(win.eval('"5".padStart(2, "0")'), '05');
    assert.equal(win.eval('"12".padStart(2, "0")'), '12');
    assert.equal(win.eval('"7".padStart(5, "ab")'), 'abab7');
    assert.equal(win.eval('"ab".repeat(3)'), 'ababab');
    assert.equal(win.eval('"ab".repeat(0)'), '');
});

test('Object.assign copies own enumerable properties', () => {
    const out = win.eval('Object.assign({ a: 1 }, { b: 2 }, null, { a: 3 })');
    assert.deepEqual({ ...out }, { a: 3, b: 2 });
});

test('performance.now and requestAnimationFrame fallbacks run', async () => {
    const t0 = win.performance.now();
    let frame = null;
    win.requestAnimationFrame((t) => { frame = t; });
    await tick(40);
    assert.equal(typeof frame, 'number');
    assert.ok(win.performance.now() >= t0);
    const id = win.requestAnimationFrame(() => { frame = 'should not run'; });
    win.cancelAnimationFrame(id);
    await tick(40);
    assert.notEqual(frame, 'should not run');
});

test('classList.toggle honours force', () => {
    const el = win.document.createElement('div');
    el.classList.toggle('hidden', false);
    assert.equal(el.classList.contains('hidden'), false);
    el.classList.toggle('hidden', true);
    el.classList.toggle('hidden', true);
    assert.equal(el.classList.contains('hidden'), true);
    el.classList.toggle('hidden');
    assert.equal(el.classList.contains('hidden'), false);
});

// ---------- Style helpers

test('setStyle uses -webkit- names and rewrites transition lists', () => {
    const el = win.document.createElement('div');
    assert.equal(win.Compat.styleName('transform'), 'webkitTransform');
    win.Compat.setStyle(el, 'transform', 'translateX(-336px)');
    assert.match(el.style.cssText, /-webkit-transform: translateX\(-336px\)/);
    win.Compat.setStyle(el, 'transition', 'opacity 2000ms linear, transform 75000ms linear');
    assert.equal(el.style[win.Compat.styleName('transition')], 'opacity 2000ms linear, -webkit-transform 75000ms linear');
    win.Compat.setStyle(el, 'transform', '');
    assert.doesNotMatch(el.style.cssText, /translateX/);
});

test('setBackground falls back to -webkit-linear-gradient when the standard form is rejected', () => {
    // A style object that, like the oldest engines, refuses unprefixed gradients.
    let stored = '';
    const el = {
        style: {
            set background(v) { stored = /(^|[\s,])linear-gradient/.test(v) ? '' : v; },
            get background() { return stored; }
        }
    };
    win.Compat.setBackground(el, 'linear-gradient(135deg,#091550,#1f5bd8)');
    assert.equal(stored, '-webkit-linear-gradient(-45deg,#091550,#1f5bd8)');
    win.Compat.setBackground(el, '#e62117');
    assert.equal(stored, '#e62117');
});

test('visibility helpers use the prefixed API', async () => {
    let calls = 0;
    win.Compat.onVisibilityChange(() => { calls++; });
    win.document.webkitHidden = true;
    win.document.dispatchEvent(new win.Event('webkitvisibilitychange'));
    assert.equal(calls, 1);
    assert.equal(win.Compat.hidden(), true);
    win.document.webkitHidden = false;
    assert.equal(win.Compat.hidden(), false);
});

// ---------- Dates

test('built-in date names match Intl for every day of the year, in all three languages', () => {
    assert.equal(win.Compat.intlDates, false);
    const mismatches = [];
    for (const locale of ['en-GB', 'es-ES', 'fr-FR']) {
        for (let day = 0; day < 366; day++) {
            const d = new Date(2024, 0, 1 + day);
            const wd = new win.Date(d.getTime());
            for (const style of ['long', 'short']) {
                const opts = style === 'short'
                    ? { weekday: 'short', day: 'numeric', month: 'short' }
                    : { weekday: 'long', day: 'numeric', month: 'long' };
                const want = d.toLocaleDateString(locale, opts);
                const got = win.Compat.manualDate(wd, locale, style);
                if (want !== got) mismatches.push(`${locale} ${style}: ${got} != ${want}`);
            }
        }
    }
    assert.deepEqual(mismatches.slice(0, 5), []);
});

test('formatDate capitalises and falls back to English for unknown locales', () => {
    const d = new win.Date(2026, 9, 25);
    assert.equal(win.Compat.formatDate(d, 'fr-FR', 'long'), 'Dimanche 25 octobre');
    assert.equal(win.Compat.formatDate(d, 'es-ES', 'short'), 'Dom, 25 oct');
    assert.equal(win.Compat.formatDate(d, 'en-GB', 'short'), 'Sun 25 Oct');
    assert.equal(win.Compat.formatDate(d, 'de-DE', 'long'), 'Sunday 25 October');
});
