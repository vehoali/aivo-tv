/* Clock, date and font settings (Prefs.appearance). */
(function () {
    'use strict';

    var FONTS = [
        { key: 'manrope', label: 'Manrope', family: '"Manrope"' },
        { key: 'inter', label: 'Inter', family: '"Inter"' },
        { key: 'outfit', label: 'Outfit', family: '"Outfit"' },
        { key: 'dm-sans', label: 'DM Sans', family: '"DM Sans"' }
    ];

    var LOCALES = [
        { key: 'en-GB', label: 'English' },
        { key: 'es-ES', label: 'Español' },
        { key: 'fr-FR', label: 'Français' }
    ];

    var FALLBACK = ', "SamsungOne", "Helvetica Neue", Arial, sans-serif';

    function prefs() { return Prefs.get().appearance; }

    function font(key) {
        return FONTS.find(function (f) { return f.key === key; }) || FONTS[0];
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    // Returns { time: '16:05', suffix: '' } or { time: '4:05', suffix: 'PM' }.
    function time(d) {
        if (prefs().clock === '12h') {
            var h = d.getHours() % 12 || 12;
            return { time: h + ':' + pad(d.getMinutes()), suffix: d.getHours() < 12 ? 'AM' : 'PM' };
        }
        return { time: pad(d.getHours()) + ':' + pad(d.getMinutes()), suffix: '' };
    }

    function date(d) {
        return Compat.formatDate(d, prefs().locale, 'long');
    }

    // Set on <body> rather than as a CSS variable: the 2016 engine has no custom properties.
    // Everything inherits it, including the rename field (font-family: inherit in style.css).
    function apply() {
        var p = prefs();
        document.body.style.fontFamily = font(p.font).family + FALLBACK;
        var home = document.getElementById('home');
        home.classList.toggle('names-focused', p.names === 'focused');
        home.classList.toggle('names-never', p.names === 'never');
        home.classList.toggle('no-date', !p.showDate);
    }

    window.Appearance = {
        FONTS: FONTS,
        LOCALES: LOCALES,
        font: font,
        time: time,
        date: date,
        apply: apply
    };
})();
