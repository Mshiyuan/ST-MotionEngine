// 提示条（toastr）
// toastr 用 options.showMethod / hideMethod 指定的 jQuery 方法显示和隐藏提示条。
// 这里注册两个方法替换默认的 fadeIn / fadeOut：从屏幕边缘滑入，退场更快；
// 一条提示消失后，其余提示从原位置滑到新位置，不再跳动。
import { active, dur, v, play } from '../core/engine.js';

/** 提示条在屏幕上方还是下方 */
const fromTop = (el) => !el.closest('[class*="toast-bottom"]');

export function installToasts() {
    const $ = window.jQuery;
    const toastr = window.toastr;
    if (!toastr) return;

    $.fn.meToastIn = function (opt = {}) {
        if (!active('toasts')) return this.fadeIn(opt);
        return this.each(function () {
            this.style.display = '';
            const dy = (fromTop(this) ? -1 : 1) * (16 + parseFloat(v('--me-y')));
            const D = dur('--me-in-dur');
            play(this, 'toast', [
                [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
                [[{ translate: `0 ${dy}px`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }],
            ]).then(ok => ok && opt.complete?.call(this));
        });
    };

    $.fn.meToastOut = function (opt = {}) {
        if (!active('toasts')) return this.fadeOut(opt);
        return this.each(function () {
            const el = this;
            const dy = (fromTop(el) ? -1 : 1) * 10;
            const D = dur('--me-out-dur');
            play(el, 'toast', [
                [[{ opacity: 1 }, { opacity: 0 }], { duration: D, easing: v('--me-fade-out') }],
                [[{ translate: '0 0', scale: '1' }, { translate: `0 ${dy}px`, scale: '0.96' }], { duration: D, easing: v('--me-out') }],
            ]).then(ok => {
                if (!ok) return;
                // 其余提示条：记下位置 → 移除这一条 → 从旧位置滑到新位置
                const others = [...(el.parentElement?.children || [])].filter(n => n !== el);
                const before = new Map(others.map(n => [n, n.getBoundingClientRect().top]));
                el.style.display = 'none';
                opt.complete?.call(el);
                for (const [n, top] of before) {
                    if (!n.isConnected) continue;
                    const d = top - n.getBoundingClientRect().top;
                    if (Math.abs(d) > 0.5) n.animate([{ translate: `0 ${d}px` }, { translate: '0 0' }], { duration: dur('--me-in-dur'), easing: v('--me-in') });
                }
            });
        });
    };

    toastr.options.showMethod = 'meToastIn';
    toastr.options.hideMethod = 'meToastOut';
}
