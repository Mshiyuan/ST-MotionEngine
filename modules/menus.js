// 汉堡菜单（#options）和扩展菜单（#extensionsMenu）
// 原版用 jQuery fadeIn/fadeOut 在主线程逐帧改 opacity。这里只针对注册过的元素换成 WAAPI，其余元素照走原版。
import { active, play, stop, scoped, poseExtras } from '../core/engine.js';
import { recentPointer } from '../core/origin.js';

/** 选择器 → { mod: 所属模块, kind: 动画类型, anchor: 触发按钮 } */
const REGISTRY = [];

export function registerFade(selector, opt) {
    REGISTRY.push({ selector, ...opt });
}

function lookup(el) {
    for (const r of REGISTRY) if (el.matches(r.selector) && active(r.mod)) return r;
    return null;
}

const hidden = (el) => getComputedStyle(el).display === 'none';

/** 让元素从触发按钮（或手指按下的位置）的方向长出来 */
function setOrigin(el, r) {
    const rect = el.getBoundingClientRect();
    let x = null, y = null;
    const anchor = r.anchor && document.querySelector(r.anchor);
    if (anchor) {
        const a = anchor.getBoundingClientRect();
        x = a.left + a.width / 2; y = a.top + a.height / 2;
    } else {
        const p = recentPointer();
        if (p) { x = p.x; y = p.y; }
    }
    if (x === null) { el.style.transformOrigin = ''; return; }
    const ox = Math.min(Math.max(x - rect.left, 0), rect.width);
    const oy = Math.min(Math.max(y - rect.top, 0), rect.height);
    el.style.transformOrigin = `${ox}px ${oy}px`;
}

function enter(el, r, complete) {
    const { dur, v } = scoped(r.mod);
    el.style.display = '';
    if (hidden(el)) el.style.display = r.display || 'block';
    el.style.opacity = '';
    setOrigin(el, r);
    const inDur = dur('--me-in-dur');
    const blur = v('--me-blur');
    const x = poseExtras(r.mod);
    const from = { translate: `0 calc(${v('--me-y')} * ${r.dy ?? 0.5})`, scale: v('--me-s'), ...x.a };
    play(el, 'fade', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: inDur * 0.6, easing: v('--me-fade') }],
        [[{ ...from }, { translate: '0 0', scale: '1', ...x.b }], { duration: inDur, easing: v('--me-in') }],
        ...(blur !== '0px' ? [[[{ filter: `blur(${blur})` }, { filter: 'blur(0px)' }], { duration: inDur, easing: v('--me-in') }]] : []),
    ]).then(ok => { if (ok) complete?.call(el); });
}

function exit(el, r, complete) {
    const { dur, v } = scoped(r.mod);
    const outDur = dur('--me-out-dur');
    play(el, 'fade', [
        [[{ opacity: 1 }, { opacity: 0 }], { duration: outDur, easing: v('--me-fade-out') }],
        [[{ translate: '0 0', scale: '1' }, { translate: `0 calc(${v('--me-y')} * ${(r.dy ?? 0.5) * 0.5})`, scale: String(v('--me-s')).split(' ').map(s => 1 - (1 - s) * 0.5).join(' ') }], { duration: outDur, easing: v('--me-out') }],
    ]).then(ok => {
        if (!ok) return;
        el.style.display = 'none';
        el.style.transformOrigin = '';
        complete?.call(el);
    });
}

export function installMenus() {
    const $ = window.jQuery;
    const orig = { fadeIn: $.fn.fadeIn, fadeOut: $.fn.fadeOut, fadeToggle: $.fn.fadeToggle };

    // 只在「所有元素都已注册」时接管。酒馆在系统减少动画时会关掉 jQuery 动画（$.fx.off），
    // 插件仍按自己的设置播放（减少动效时变量本身就是短淡入淡出）
    const take = (set) => set.length > 0 && set.toArray().every(el => lookup(el));

    $.fn.fadeIn = function (...args) {
        if (!take(this)) return orig.fadeIn.apply(this, args);
        const opt = $.speed(...args);
        return this.each(function () {
            $(this).stop(true, true);
            if (!hidden(this) && !this.getAnimations().length) { opt.complete?.call(this); return; }
            enter(this, lookup(this), opt.complete);
        });
    };
    $.fn.fadeOut = function (...args) {
        if (!take(this)) return orig.fadeOut.apply(this, args);
        const opt = $.speed(...args);
        return this.each(function () {
            $(this).stop(true, true);
            if (hidden(this)) { stop(this); opt.complete?.call(this); return; }
            exit(this, lookup(this), opt.complete);
        });
    };
    $.fn.fadeToggle = function (...args) {
        if (!take(this)) return orig.fadeToggle.apply(this, args);
        return this.each(function () {
            const $el = $(this);
            hidden(this) ? $el.fadeIn(...args) : $el.fadeOut(...args);
        });
    };

    registerFade('#options', { mod: 'menus', anchor: '#options_button', dy: 0.5 });
    registerFade('#extensionsMenu', { mod: 'menus', anchor: '#extensionsMenuButton', dy: 0.5 });
}
