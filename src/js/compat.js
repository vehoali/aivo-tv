/*
 * Compatibility layer for older Samsung TVs. Loaded before everything else.
 *
 * The launcher was written on a 2022 Q70B (Tizen 6.5, Chromium 85). A 2016 TV such as the
 * KU7020 runs Tizen 2.4, whose web engine is WebKit r152340 — mid-2013, roughly Safari 7. That
 * engine parses ES5 fine (the whole codebase is ES5 on purpose) but is missing a set of
 * library features the modules use, and wants -webkit- names for transforms.
 *
 * Two kinds of fix live here:
 *   - Polyfills, installed only when the feature is missing, so a newer TV runs native code
 *     exactly as before. Compat.installed lists which ones went in (shown in the Lab).
 *   - Small helpers (Compat.setStyle, Compat.hidden, Compat.formatDate, …) for the differences
 *     a polyfill cannot paper over, such as a prefixed style property or event name.
 */
(function () {
    'use strict';

    var installed = [];

    function define(target, name, value, label) {
        if (typeof target[name] === 'function') return;
        Object.defineProperty(target, name, {
            value: value, writable: true, configurable: true, enumerable: false
        });
        installed.push(label);
    }

    // ---------- Array, String, Object

    define(Array.prototype, 'find', function (fn, thisArg) {
        for (var i = 0; i < this.length; i++) {
            if (fn.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
    }, 'Array.prototype.find');

    define(Array.prototype, 'findIndex', function (fn, thisArg) {
        for (var i = 0; i < this.length; i++) {
            if (fn.call(thisArg, this[i], i, this)) return i;
        }
        return -1;
    }, 'Array.prototype.findIndex');

    define(String.prototype, 'repeat', function (count) {
        var n = Math.floor(count) || 0;
        if (n < 0) throw new RangeError('Invalid count value');
        var out = '';
        for (var i = 0; i < n; i++) out += this;
        return out;
    }, 'String.prototype.repeat');

    define(String.prototype, 'padStart', function (length, fill) {
        var s = String(this);
        fill = fill === undefined ? ' ' : String(fill);
        if (s.length >= length || !fill) return s;
        var pad = '';
        while (pad.length < length - s.length) pad += fill;
        return pad.slice(0, length - s.length) + s;
    }, 'String.prototype.padStart');

    define(Object, 'assign', function (target) {
        if (target === null || target === undefined) throw new TypeError('Cannot convert to object');
        var to = Object(target);
        for (var i = 1; i < arguments.length; i++) {
            var from = arguments[i];
            if (from === null || from === undefined) continue;
            for (var key in from) {
                if (Object.prototype.hasOwnProperty.call(from, key)) to[key] = from[key];
            }
        }
        return to;
    }, 'Object.assign');

    // ---------- Promise

    /*
     * Enough of Promises/A+ for this codebase: then, catch, resolve, reject, all and race, with
     * thenable adoption and asynchronous callbacks. The engine on 2016 TVs predates Promise.
     */
    function PromiseShim(executor) {
        if (!(this instanceof PromiseShim)) throw new TypeError('Promise must be called with new');
        var self = this;
        self._state = 0;            // 0 pending, 1 fulfilled, 2 rejected
        self._value = undefined;
        self._queue = [];

        var done = false;
        function resolve(v) { if (!done) { done = true; settle(self, v); } }
        function reject(e) { if (!done) { done = true; finish(self, 2, e); } }
        try {
            executor(resolve, reject);
        } catch (e) {
            reject(e);
        }
    }

    function finish(p, state, value) {
        if (p._state) return;
        p._state = state;
        p._value = value;
        var queue = p._queue;
        p._queue = null;
        for (var i = 0; i < queue.length; i++) schedule(p, queue[i]);
    }

    function settle(p, v) {
        if (v === p) {
            finish(p, 2, new TypeError('A promise cannot resolve to itself'));
            return;
        }
        if (v && (typeof v === 'object' || typeof v === 'function')) {
            var then;
            try {
                then = v.then;
            } catch (e) {
                finish(p, 2, e);
                return;
            }
            if (typeof then === 'function') {
                var called = false;
                try {
                    then.call(v, function (x) {
                        if (called) return;
                        called = true;
                        settle(p, x);
                    }, function (e) {
                        if (called) return;
                        called = true;
                        finish(p, 2, e);
                    });
                } catch (e) {
                    if (!called) {
                        called = true;
                        finish(p, 2, e);
                    }
                }
                return;
            }
        }
        finish(p, 1, v);
    }

    function schedule(p, handler) {
        setTimeout(function () {
            var fn = p._state === 1 ? handler.onFulfilled : handler.onRejected;
            if (typeof fn !== 'function') {
                if (p._state === 1) handler.resolve(p._value);
                else handler.reject(p._value);
                return;
            }
            var result;
            try {
                result = fn(p._value);
            } catch (e) {
                handler.reject(e);
                return;
            }
            handler.resolve(result);
        }, 0);
    }

    PromiseShim.prototype.then = function (onFulfilled, onRejected) {
        var self = this;
        return new PromiseShim(function (resolve, reject) {
            var handler = { onFulfilled: onFulfilled, onRejected: onRejected, resolve: resolve, reject: reject };
            if (self._state) schedule(self, handler);
            else self._queue.push(handler);
        });
    };

    PromiseShim.prototype['catch'] = function (onRejected) {
        return this.then(null, onRejected);
    };

    PromiseShim.resolve = function (v) {
        if (v instanceof PromiseShim) return v;
        return new PromiseShim(function (resolve) { resolve(v); });
    };

    PromiseShim.reject = function (e) {
        return new PromiseShim(function (resolve, reject) { reject(e); });
    };

    PromiseShim.all = function (list) {
        return new PromiseShim(function (resolve, reject) {
            var items = Array.prototype.slice.call(list);
            var results = new Array(items.length);
            var left = items.length;
            if (!left) {
                resolve(results);
                return;
            }
            items.forEach(function (item, i) {
                PromiseShim.resolve(item).then(function (v) {
                    results[i] = v;
                    if (--left === 0) resolve(results);
                }, reject);
            });
        });
    };

    PromiseShim.race = function (list) {
        return new PromiseShim(function (resolve, reject) {
            Array.prototype.slice.call(list).forEach(function (item) {
                PromiseShim.resolve(item).then(resolve, reject);
            });
        });
    };

    if (typeof window.Promise !== 'function') {
        window.Promise = PromiseShim;
        installed.push('Promise');
    }

    // ---------- Timing

    if (!window.performance) window.performance = {};
    if (typeof window.performance.now !== 'function') {
        var origin = Date.now();
        window.performance.now = function () { return Date.now() - origin; };
        installed.push('performance.now');
    }

    if (typeof window.requestAnimationFrame !== 'function') {
        var raf = window.webkitRequestAnimationFrame;
        var caf = window.webkitCancelAnimationFrame || window.webkitCancelRequestAnimationFrame;
        if (typeof raf === 'function' && typeof caf === 'function') {
            window.requestAnimationFrame = function (fn) { return raf.call(window, fn); };
            window.cancelAnimationFrame = function (id) { caf.call(window, id); };
            installed.push('requestAnimationFrame (webkit)');
        } else {
            var last = 0;
            window.requestAnimationFrame = function (fn) {
                var now = Date.now();
                var wait = Math.max(0, 16 - (now - last));
                last = now + wait;
                return setTimeout(function () { fn(window.performance.now()); }, wait);
            };
            window.cancelAnimationFrame = function (id) { clearTimeout(id); };
            installed.push('requestAnimationFrame (timer)');
        }
    } else if (typeof window.cancelAnimationFrame !== 'function') {
        window.cancelAnimationFrame = window.webkitCancelAnimationFrame || function () {};
    }

    // ---------- DOM

    // Old engines ignore classList.toggle's second argument and flip the class regardless.
    (function () {
        var probe = document.createElement('div');
        probe.classList.toggle('x', false);
        if (!probe.classList.contains('x')) return;
        var proto = Object.getPrototypeOf(probe.classList);
        var native = proto.toggle;
        proto.toggle = function (name, force) {
            if (force === undefined) return native.call(this, name);
            if (force) this.add(name);
            else this.remove(name);
            return !!force;
        };
        installed.push('classList.toggle(name, force)');
    })();

    // ---------- Style helpers

    var probeStyle = document.createElement('div').style;
    var styleNames = {};

    // The property name this engine understands: 'transform' or 'webkitTransform', and so on.
    function styleName(name) {
        if (styleNames[name]) return styleNames[name];
        var found = name;
        if (!(name in probeStyle)) {
            var prefixed = 'webkit' + name.charAt(0).toUpperCase() + name.slice(1);
            if (prefixed in probeStyle) found = prefixed;
        }
        styleNames[name] = found;
        return found;
    }

    /*
     * el.style.transform = … silently does nothing on WebKit r152340, which only knows
     * webkitTransform. A transition list that names `transform` has the same problem from the
     * other side, so it is rewritten to `-webkit-transform` when the engine needs that.
     */
    function setStyle(el, name, value) {
        if (name === 'transition' && styleName('transform') !== 'transform') {
            value = String(value).replace(/(^|[\s,])transform\b/g, '$1-webkit-transform');
        }
        el.style[styleName(name)] = value;
    }

    // Brand tiles use `linear-gradient(135deg, …)`. If the engine rejects the standard syntax,
    // fall back to -webkit-linear-gradient, whose angle runs the other way (0deg = left, CCW).
    function setBackground(el, value) {
        el.style.background = value;
        if (el.style.background || value.indexOf('gradient(') < 0) return;
        var prefixed = value.replace(/(^|[\s,])linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg/g,
            function (all, lead, deg) {
                return lead + '-webkit-linear-gradient(' + (90 - parseFloat(deg)) + 'deg';
            });
        el.style.background = prefixed;
    }

    // ---------- Page visibility

    var hiddenProp = 'hidden' in document ? 'hidden'
        : 'webkitHidden' in document ? 'webkitHidden' : null;
    var visibilityEvent = hiddenProp === 'webkitHidden' ? 'webkitvisibilitychange' : 'visibilitychange';

    function hidden() {
        return hiddenProp ? !!document[hiddenProp] : false;
    }

    function onVisibilityChange(fn) {
        document.addEventListener(visibilityEvent, fn);
    }

    // ---------- Dates

    /*
     * Without Intl, toLocaleDateString ignores both the locale and the options and returns the
     * engine's own English format, so the three languages Settings offers are spelled out here.
     * Names and patterns match what Intl produces on newer engines (js/compat.test checks that).
     */
    var DATE_NAMES = {
        'en-GB': {
            days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'],
            monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],
            long: '{weekday} {day} {month}',
            short: '{weekday} {day} {month}'
        },
        'es-ES': {
            days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
            daysShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
            months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                'septiembre', 'octubre', 'noviembre', 'diciembre'],
            monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
            long: '{weekday}, {day} de {month}',
            short: '{weekday}, {day} {month}'
        },
        'fr-FR': {
            days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
            daysShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
            months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
                'septembre', 'octobre', 'novembre', 'décembre'],
            monthsShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
                'sept.', 'oct.', 'nov.', 'déc.'],
            long: '{weekday} {day} {month}',
            short: '{weekday} {day} {month}'
        }
    };

    var intlDates = (function () {
        try {
            return new Date(2020, 0, 15).toLocaleDateString('fr-FR', { month: 'long' }) === 'janvier';
        } catch (e) {
            return false;
        }
    })();
    if (!intlDates) installed.push('date names (no Intl)');

    function manualDate(d, locale, style) {
        var names = DATE_NAMES[locale] || DATE_NAMES['en-GB'];
        var short = style === 'short';
        return names[short ? 'short' : 'long']
            .replace('{weekday}', (short ? names.daysShort : names.days)[d.getDay()])
            .replace('{day}', String(d.getDate()))
            .replace('{month}', (short ? names.monthsShort : names.months)[d.getMonth()]);
    }

    // style: 'long' (Sunday 25 October) or 'short' (Sun 25 Oct). Capitalised like a heading.
    function formatDate(d, locale, style) {
        var text;
        if (intlDates) {
            var opts = style === 'short'
                ? { weekday: 'short', day: 'numeric', month: 'short' }
                : { weekday: 'long', day: 'numeric', month: 'long' };
            try {
                text = d.toLocaleDateString(locale, opts);
            } catch (e) {
                text = manualDate(d, locale, style);
            }
        } else {
            text = manualDate(d, locale, style);
        }
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    window.Compat = {
        installed: installed,
        styleName: styleName,
        setStyle: setStyle,
        setBackground: setBackground,
        hidden: hidden,
        onVisibilityChange: onVisibilityChange,
        formatDate: formatDate,
        intlDates: intlDates,
        // Exposed for tests.
        manualDate: manualDate,
        PromiseShim: PromiseShim
    };
})();
