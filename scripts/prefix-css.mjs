// Adds the -webkit- declarations the 2016 TVs (WebKit r152340, about Safari 7) need to
// src/css/style.css, in place. Idempotent: run it after editing the stylesheet.
//   npm run prefix          rewrite the file
//   npm run prefix -- --check   exit 1 if the file is missing prefixes (used by npm test)
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';

// r152340 is a mid-2013 trunk build, between Safari 6.1 and 7, so both are targeted: that adds
// -webkit-transition and -webkit-linear-gradient as well as -webkit-flex. Chrome 85 is the
// reference Q70B, listed so Autoprefixer never strips what newer TVs use.
export const TARGETS = ['safari 6', 'safari 7', 'chrome 85'];

export async function prefix(css, from) {
    const result = await postcss([autoprefixer({ overrideBrowserslist: TARGETS, flexbox: 'no-2009' })])
        .process(css, { from, map: false });
    return result.css;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const file = resolve(import.meta.dirname, '..', 'src', 'css', 'style.css');
    const css = await readFile(file, 'utf8');
    const out = await prefix(css, file);
    if (process.argv.includes('--check')) {
        if (out !== css) {
            console.error('src/css/style.css is missing -webkit- prefixes: run npm run prefix');
            process.exit(1);
        }
        console.log('src/css/style.css prefixes are up to date');
    } else {
        await writeFile(file, out);
        console.log(out === css ? 'Already prefixed' : 'Prefixed src/css/style.css');
    }
}
