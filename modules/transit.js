// 接管 jquery.transit 的 .transition()：酒馆用它做透明度渐变（右栏切页、消息「…」按钮、旧式弹窗）。
// 只处理注册过的元素，其余照走原版。原版在主线程逐帧改 opacity；这里换成 WAAPI，并加上位移或缩放。
import { active, play, state, scoped } from '../core/engine.js';

// 动效参数按模块读取（开了「分模块设置」时各模块用自己的幅度和速度）
const { dur, v } = scoped('details');

/** @type {Array<{ selector: string, mod: string, kind: (el: HTMLElement, show: boolean) => Array<[Keyframe[], KeyframeAnimationOptions]> }>} */
const REGISTRY = [];

export function registerTransit(selector, mod, kind) {
    REGISTRY.push({ selector, mod, kind });
}

const lookup = (el) => REGISTRY.find(r => el.matches?.(r.selector) && active(r.mod));

export function installTransit() {
    const $ = window.jQuery;
    if (!$.fn.transition) return;
    const orig = $.fn.transition;
    $.fn.transition = function (props, ...rest) {
        if (!props || typeof props !== 'object' || !('opacity' in props) || this.length === 0) return orig.call(this, props, ...rest);
        const entries = this.toArray().map(el => [el, lookup(el)]);
        if (entries.some(([, r]) => !r)) return orig.call(this, props, ...rest);
        const complete = props.complete || rest.find(a => typeof a === 'function');
        const target = Number(props.opacity);
        entries.forEach(([el, r], i) => {
            const show = target > 0;
            const tracks = r.kind(el, show);
            const from = parseFloat(getComputedStyle(el).opacity);
            // 透明度轨道：从当前值到目标值（目标可能不是 1，例如「…」按钮是 0.3）
            const D = show ? dur('--me-in-dur') : dur('--me-out-dur');
            tracks.unshift([[{ opacity: from }, { opacity: target }], { duration: show ? D * 0.6 : D, easing: show ? v('--me-fade') : v('--me-fade-out') }]);
            el.style.opacity = String(target);
            play(el, 'transit', tracks).then(ok => {
                if (ok && i === 0) complete?.call(this);
            });
        });
        // 原版会给每个元素各调一次回调；酒馆的用法都是单个元素，这里与之一致
        return this;
    };
}

// ---------- 常用的动法 ----------
export const kinds = {
    /** 方向感知的切页：往后切从右边来，往前切从左边来 */
    tab(order) {
        let last = -1;
        return (el, show) => {
            if (!show) return [];
            const i = order.indexOf(el.id);
            const dir = last < 0 || i === last ? 0 : (i > last ? 1 : -1);
            last = i;
            const D = dur('--me-in-dur');
            return [[[{ translate: `${dir * 24}px 0` }, { translate: '0 0' }], { duration: D, easing: v('--me-in') }]];
        };
    },
    /** 一排按钮从右往左依次弹出 */
    row(el, show) {
        const D = show ? dur('--me-in-dur') : dur('--me-out-dur');
        if (show) {
            [...el.children].forEach((c, i) => play(c, 'row', [[[{ opacity: 0, translate: '10px 0', scale: v('--me-s') }, { opacity: 1, translate: '0 0', scale: '1' }], { duration: D, delay: i * Math.min(30, dur('--me-stagger')), easing: v('--me-in') }]]));
            return [];
        }
        return [[[{ translate: '0 0' }, { translate: '8px 0' }], { duration: D, easing: v('--me-out') }]];
    },
    /** 弹窗：缩放 + 位移 */
    pop(el, show) {
        const D = show ? dur('--me-in-dur') : dur('--me-out-dur');
        const pose = { translate: `0 ${v('--me-y')}`, scale: v('--me-s') };
        return show
            ? [[[pose, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }]]
            : [[[{ translate: '0 0', scale: '1' }, { translate: `0 calc(${v('--me-y')} * 0.5)`, scale: v('--me-s-out') }], { duration: D, easing: v('--me-out') }]];
    },
    fade() {
        return [];
    },
};

export { state };
