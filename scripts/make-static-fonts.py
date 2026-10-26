"""
Writes static WOFF 1.0 instances of the variable fonts in src/fonts/ to src/fonts/static/.

The 2016 TVs (Tizen 2.4, WebKit r152340) read neither WOFF2 nor variable fonts, and a
`font-weight: 200 800` range in @font-face is a syntax error there, so the whole rule is dropped
and every label falls back to the system font. Fixed weights in plain WOFF work on every engine,
old and new, so css/style.css uses only these.

Only the weights css/style.css and js/runner-game.js actually ask for are generated (WEIGHTS).
The outputs are committed, so this only needs to run again when a font or that list changes:

    python3 -m pip install fonttools brotli
    python3 scripts/make-static-fonts.py
"""
import os

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'fonts')
FAMILIES = ['manrope', 'inter', 'outfit', 'dm-sans']
WEIGHTS = [300, 400, 500, 600, 700, 800]


def main():
    out_dir = os.path.join(ROOT, 'static')
    os.makedirs(out_dir, exist_ok=True)
    for family in FAMILIES:
        for weight in WEIGHTS:
            font = TTFont(os.path.join(ROOT, family + '.woff2'))
            axis = next(a for a in font['fvar'].axes if a.axisTag == 'wght')
            value = min(max(weight, axis.minValue), axis.maxValue)
            static = instancer.instantiateVariableFont(font, {'wght': value}, updateFontNames=False)
            static.flavor = 'woff'
            path = os.path.join(out_dir, '%s-%d.woff' % (family, weight))
            static.save(path)
            print('%s  %d bytes' % (os.path.relpath(path, ROOT), os.path.getsize(path)))


if __name__ == '__main__':
    main()
