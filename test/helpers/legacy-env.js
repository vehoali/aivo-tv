/*
 * Runs in the page before js/compat.js and takes away what WebKit r152340 (2016 TVs, Tizen 2.4)
 * does not have, so jsdom behaves like that engine for the features the launcher touches.
 * It is a model, not the engine: it cannot reproduce layout or rendering differences.
 */
(function () {
    'use strict';
    var w = window;

    delete w.Promise;
    delete Array.prototype.find;
    delete Array.prototype.findIndex;
    delete String.prototype.padStart;
    delete String.prototype.repeat;
    delete Object.assign;
    delete w.Intl;
    delete w.requestAnimationFrame;
    delete w.cancelAnimationFrame;
    if (w.performance) delete w.performance.now;
    try { w.performance.now = undefined; } catch (e) { /* read-only in some builds */ }

    // No Intl: the engine ignores the locale and options and prints its own English form.
    var toLocale = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function () { return toLocale.call(this, 'en-US'); };

    // classList.toggle ignores `force`.
    var toggle = w.DOMTokenList.prototype.toggle;
    w.DOMTokenList.prototype.toggle = function (name) { return toggle.call(this, name); };

    // Only the -webkit- names for transforms and transitions.
    ['transform', 'transformOrigin', 'transition'].forEach(function (p) {
        delete w.CSSStyleDeclaration.prototype[p];
    });

    // Prefixed Page Visibility.
    delete w.Document.prototype.hidden;
    delete w.Document.prototype.visibilityState;
    w.document.webkitHidden = false;

    // The pre-2014 Web Audio names.
    delete w.AudioContext;
    w.webkitAudioContext = function () {
        this.currentTime = 0;
        this.destination = {};
        this.sampleRate = 48000;
    };
    w.webkitAudioContext.prototype.createOscillator = function () {
        var calls = w.__audioCalls = w.__audioCalls || [];
        return {
            type: '', frequency: { value: 0 },
            connect: function () {}, disconnect: function () {},
            noteOn: function (t) { calls.push('noteOn'); },
            noteOff: function (t) { calls.push('noteOff'); }
        };
    };
    w.webkitAudioContext.prototype.createGainNode = function () {
        return {
            gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} },
            connect: function () {}, disconnect: function () {}
        };
    };

    // Older firmware without tvinputdevice.registerKeyBatch: remove it from the mock as it lands.
    var tizen;
    w.__registeredKeys = [];
    Object.defineProperty(w, 'tizen', {
        configurable: true,
        get: function () { return tizen; },
        set: function (v) {
            if (v && v.tvinputdevice) {
                delete v.tvinputdevice.registerKeyBatch;
                v.tvinputdevice.registerKey = function (k) { w.__registeredKeys.push(k); };
            }
            tizen = v;
        }
    });

    w.__LEGACY_ENV__ = true;
})();
