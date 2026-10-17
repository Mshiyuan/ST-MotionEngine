// 折叠块（带箭头的分组）与 select2 下拉框
// 折叠块：酒馆用 jQuery slideToggle（默认 400ms，逐帧改高度和内边距）。这里只接管 .inline-drawer-content：
//   高度用 WAAPI 一次性过渡，内容同时淡入并轻微位移；箭头图标转半圈换成新方向。
//   低配或减少动效时高度直接到位，只做淡入。
//   高度动画每一帧都要重新排版后面的内容。展开时第一次排版本来就要做（显示新内容），顺便计时：
//   排版慢（页面内容多，例如扩展设置里一长串插件）或内容很高时，高度也直接到位，只做合成线程上的淡入和位移。
// select2：打开时下拉列表从选择框方向展开。关闭时 select2 会立刻移除列表，无法做退场。
import { active, dur, v, play, state } from '../core/engine.js';

const SELECTOR = '.inline-drawer-content';
const intent = new WeakMap(); // 'open' | 'closed'，动画进行中以它为准

const shown = (el) => (intent.has(el) ? intent.get(el) === 'open' : getComputedStyle(el).display !== 'none');
const simple = () => state.reduced || state.settings?.lite;
/** 排版超过这个毫秒数，就不做逐帧的高度动画 */
const HEAVY_LAYOUT_MS = 12;
const TALL_PX = 360;
const heavy = new WeakMap(); // el → 上次展开时是否判定为重

function spinIcon(el) {
    const icon = el.parentElement?.querySelector(':scope > .inline-drawer-header .inline-drawer-icon, :scope > .inline-drawer-toggle .inline-drawer-icon');
    if (!icon) return;
    play(icon, 'spin', [[[{ rotate: '-180deg' }, { rotate: '0deg' }], { duration: dur('--me-in-dur'), easing: v('--me-p-in') }]]);
}

function expand(el, opt) {
    intent.set(el, 'open');
    el.style.display = '';
    if (getComputedStyle(el).display === 'none') el.style.display = 'block';
    const t0 = performance.now();
    const h = el.getBoundingClientRect().height;
    const cs = getComputedStyle(el);
    const isHeavy = performance.now() - t0 > HEAVY_LAYOUT_MS || h > TALL_PX;
    heavy.set(el, isHeavy);
    const pt = cs.paddingTop, pb = cs.paddingBottom;
    const D = dur('--me-p-in-dur');
    const tracks = [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
        [[{ translate: `0 ${isHeavy ? -10 : -6}px` }, { translate: '0 0' }], { duration: D, easing: v('--me-p-in') }],
    ];
    if (!simple() && !isHeavy) {
        el.style.overflow = 'hidden';
        tracks.push([[{ height: '0px', paddingTop: '0px', paddingBottom: '0px' }, { height: `${h}px`, paddingTop: pt, paddingBottom: pb }], { duration: D, easing: 'cubic-bezier(0.2, 0, 0, 1)' }]);
    }
    spinIcon(el);
    play(el, 'slide', tracks).then(ok => {
        if (!ok) return;
        el.style.overflow = '';
        opt.complete?.call(el);
    });
}

function collapse(el, opt) {
    intent.set(el, 'closed');
    const D = dur('--me-p-out-dur');
    // 没经插件展开过的（页面加载时就是展开的），按高度判断
    const isHeavy = heavy.has(el) ? heavy.get(el) : el.getBoundingClientRect().height > TALL_PX;
    const tracks = [[[{ opacity: 1 }, { opacity: 0 }], { duration: isHeavy ? D * 0.7 : D, easing: v('--me-fade-out') }]];
    if (isHeavy) tracks.push([[{ translate: '0 0' }, { translate: '0 -8px' }], { duration: D * 0.7, easing: v('--me-p-out') }]);
    if (!simple() && !isHeavy) {
        const cs = getComputedStyle(el);
        const h = el.getBoundingClientRect().height;
        el.style.overflow = 'hidden';
        tracks.push([[{ height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom }, { height: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: D, easing: 'cubic-bezier(0.4, 0, 1, 1)' }]);
    }
    spinIcon(el);
    play(el, 'slide', tracks).then(ok => {
        if (!ok) return;
        el.style.display = 'none';
        el.style.overflow = '';
        intent.delete(el);
        opt.complete?.call(el);
    });
}

export function installInline() {
    const $ = window.jQuery;
    const orig = { slideToggle: $.fn.slideToggle, slideDown: $.fn.slideDown, slideUp: $.fn.slideUp };
    const take = (set) => active('inline') && set.length > 0 && set.toArray().every(el => el.matches(SELECTOR));

    $.fn.slideToggle = function (...args) {
        if (!take(this)) return orig.slideToggle.apply(this, args);
        const opt = $.speed(...args);
        return this.each(function () { shown(this) ? collapse(this, opt) : expand(this, opt); });
    };
    $.fn.slideDown = function (...args) {
        if (!take(this)) return orig.slideDown.apply(this, args);
        const opt = $.speed(...args);
        return this.each(function () { shown(this) ? opt.complete?.call(this) : expand(this, opt); });
    };
    $.fn.slideUp = function (...args) {
        if (!take(this)) return orig.slideUp.apply(this, args);
        const opt = $.speed(...args);
        return this.each(function () { shown(this) ? collapse(this, opt) : opt.complete?.call(this); });
    };

    // select2 下拉列表
    $(document).on('select2:open', () => {
        if (!active('inline')) return;
        requestAnimationFrame(() => {
            const dd = document.querySelector('.select2-container--open .select2-dropdown');
            if (!dd) return;
            const above = dd.classList.contains('select2-dropdown--above');
            dd.style.transformOrigin = above ? '50% 100%' : '50% 0';
            const D = dur('--me-in-dur');
            play(dd, 'dd', [
                [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.5, easing: v('--me-fade') }],
                [[{ translate: `0 ${above ? 6 : -6}px`, scale: '1 0.94' }, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }],
            ]);
        });
    });
}
