// Turns large photos into TV-ready wallpapers: 1920x1080 cover crop with the readability scrim
// baked in. The scrim is part of the image so the TV never composites a gradient over a photo at
// runtime.
//
//   node scripts/prepare-wallpapers.mjs ~/Pictures/tv-wallpapers
//       Your own photos. Written to src/img/wallpapers/local/ with the catalog
//       src/js/wallpapers.local.js — both gitignored, so personal photos reach your TV builds but
//       never the repository. They are added after the bundled wallpapers. Each run replaces the
//       previous local set with the photos now in the folder.
//
//   node scripts/prepare-wallpapers.mjs --bundled ~/Downloads/backgrounds
//       The wallpapers that ship with the project (src/img/wallpapers/ and src/js/wallpapers.js,
//       both committed). Only for photos whose licence allows publishing them.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const bundled = args.includes('--bundled');
const sourceDir = resolve(args.filter((a) => a !== '--bundled')[0] || '');
const root = resolve(import.meta.dirname, '..');
const sub = bundled ? 'img/wallpapers' : 'img/wallpapers/local';
const outDir = join(root, 'src', sub);
const catalogFile = join(root, 'src/js', bundled ? 'wallpapers.js' : 'wallpapers.local.js');

// Friendly names for known files (Unsplash file names: <photographer>-<id>-unsplash.jpg).
// `position` is the CSS background-position used for the crop.
const KNOWN = {
    'anders-jilden-cYrMQA7a3Wc-unsplash.jpg': { key: 'coast', title: 'Coast village', position: 'center 60%' },
    'jms-kFHz9Xh3PPU-unsplash.jpg': { key: 'valley-snow', title: 'Snowy valley' },
    'johannes-plenio-hvrpOmuMrAI-unsplash.jpg': { key: 'forest', title: 'Forest path' },
    'jonatan-pie-3l3RwQdHRHg-unsplash.jpg': { key: 'aurora', title: 'Aurora' },
    'jonatan-pie-h8nxGssjQXs-unsplash.jpg': { key: 'night-sky', title: 'Night sky' },
    'nasa-Q1p7bh3SHj8-unsplash.jpg': { key: 'earth', title: 'Earth at night' },
    'stefan-stefancik-TPv9dh822VA-unsplash.jpg': { key: 'milky-way', title: 'Milky Way' },
    'su-san-lee-E_eWwM29wfU-unsplash.jpg': { key: 'kyoto', title: 'Kyoto' },
    'urban-vintage-78A265wPiO4-unsplash.jpg': { key: 'hills', title: 'Golden hills' },
    'wil-stewart-pHANr-CpbYM-unsplash.jpg': { key: 'waterfall', title: 'Waterfall' }
};

// Darker at the top-left (clock) and towards the bottom (tiles and labels).
const SCRIM = [
    'radial-gradient(1300px 700px at 0% 0%, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)',
    'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.30) 30%, rgba(0,0,0,0.62) 62%, rgba(0,0,0,0.82) 100%)'
].join(',');

function credit(file) {
    const m = basename(file).match(/^(.*)-[A-Za-z0-9_-]{11}-unsplash\.jpe?g$/);
    if (!m) return '';
    return m[1].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') + ' on Unsplash';
}

// "lake-house.jpg" -> "Lake house". Camera and Photos-export names (IMG_1234, UUIDs) say nothing,
// so those become "Photo 1", "Photo 2", ...
let unnamed = 0;
function titleFor(file) {
    const name = basename(file, extname(file));
    if (/^(img|dsc|pxl)[_-]?\d+|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(name)) return 'Photo ' + (++unnamed);
    const words = name.replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

if (!statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('Usage: node scripts/prepare-wallpapers.mjs [--bundled] <folder with photos>');
    process.exit(1);
}
// The local set is regenerated from scratch, so photos removed from the folder disappear.
if (!bundled) rmSync(outDir, { recursive: true, force: true });
const thumbDir = join(outDir, 'thumbs');
mkdirSync(thumbDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'wallpapers-'));

// 320x180 thumbnails for the Settings picker
function thumb(jpg, key) {
    execFileSync('sips', ['-Z', '320', '-s', 'formatOptions', '78', jpg, '--out', join(thumbDir, key + '.jpg')], { stdio: 'ignore' });
    return sub + '/thumbs/' + key + '.jpg';
}

// The plain "Midnight" gradient (img/bg.jpg) is what "Off" shows, so it is not in the catalog.
const catalog = [];

for (const file of readdirSync(sourceDir).sort()) {
    if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;
    const known = bundled && KNOWN[file];
    const title = known ? known.title : titleFor(file);
    // Local keys get a prefix so they can never collide with a bundled wallpaper.
    const slug = (known ? known.key : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 40);
    const key = bundled ? slug : 'my-' + slug;
    const html = join(tmp, key + '.html');
    const png = join(tmp, key + '.png');
    const src = 'file://' + join(sourceDir, file).split('/').map(encodeURIComponent).join('/');
    writeFileSync(html, `<!DOCTYPE html><body style="margin:0;width:1920px;height:1080px;background:${SCRIM},` +
        `url('${src}') ${(known && known.position) || 'center'} / cover no-repeat #000"></body>`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1920,1080',
        '--allow-file-access-from-files', '--virtual-time-budget=5000', `--user-data-dir=${join(tmp, 'profile')}`,
        `--screenshot=${png}`, 'file://' + html], { stdio: 'ignore' });
    const out = join(outDir, key + '.jpg');
    // Re-encoded from a screenshot, so no camera, date or location metadata survives.
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', out], { stdio: 'ignore' });
    catalog.push({ key, title, file: sub + '/' + key + '.jpg', thumb: thumb(out, key), credit: credit(file) });
    console.log(`${key}.jpg  ${(statSync(out).size / 1024).toFixed(0)} KB  ${title}`);
}
rmSync(tmp, { recursive: true, force: true });

writeFileSync(catalogFile, bundled
    ? '/* Generated by scripts/prepare-wallpapers.mjs --bundled. Photos: Unsplash License. */\n' +
      'window.WALLPAPERS = ' + JSON.stringify(catalog, null, 4) + ';\n'
    : '/* Generated by scripts/prepare-wallpapers.mjs. Your own photos: gitignored, never committed. */\n' +
      'window.WALLPAPERS = (window.WALLPAPERS || []).concat(' + JSON.stringify(catalog, null, 4) + ');\n');
console.log(`Wrote ${catalog.length} entries to ${catalogFile.slice(root.length + 1)}`);
