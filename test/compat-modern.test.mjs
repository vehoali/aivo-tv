// js/compat.js on a modern engine must stay out of the way. A file of its own: legacy-env.js
// edits jsdom's CSSStyleDeclaration, which is shared by every window in a process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { SRC } from './helpers/load-app.mjs';

test('installs nothing and keeps native names on a modern engine', async () => {
    const compat = await readFile(resolve(SRC, 'js/compat.js'), 'utf8');
    const dom = new JSDOM('<!doctype html><body></body>', {
        url: 'http://tv.test/', runScripts: 'outside-only', pretendToBeVisual: true
    });
    const w = dom.window;
    const nativePromise = w.Promise;
    w.eval(compat);
    assert.deepEqual(Array.from(w.Compat.installed), []);
    assert.equal(w.Promise, nativePromise);
    assert.equal(w.Compat.styleName('transform'), 'transform');
    assert.equal(w.Compat.intlDates, true);
    const el = w.document.createElement('div');
    w.Compat.setStyle(el, 'transition', 'opacity 1s, transform 2s');
    assert.equal(el.style.transition, 'opacity 1s, transform 2s');
    assert.equal(w.Compat.formatDate(new w.Date(2026, 9, 25), 'fr-FR', 'long'), 'Dimanche 25 octobre');
    w.close();
});
