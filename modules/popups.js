// 新式弹窗 dialog.popup
// 打开：酒馆给 dialog 加 [opening] 后立刻 showModal()。插件用 CSS 把 [opening] 的关键帧去掉（酒馆随即移除该属性），
//       再用 WAAPI 从点击位置展开，时长不受酒馆 500ms 兜底计时的限制。
// 关闭：酒馆加 [closing]，等 animationend 后才真正关闭，所以关闭用 CSS 关键帧（见 css/popups.css）。
import { active, dur, v, play } from '../core/engine.js';
import { offsetFromPointer } from '../core/origin.js';

function open(dlg) {
    if (!active('popups') || window.jQuery?.fx?.off || dlg.classList.contains('popup--animation-none')) return;
    const rect = dlg.getBoundingClientRect();
    const follow = !!(window.MotionEngine?.settings?.followPointer);
    const { dx, dy, has } = follow ? offsetFromPointer(rect, 0.35) : { dx: 0, dy: 0, has: false };
    const inDur = dur('--me-in-dur');
    const blur = v('--me-blur');
    const fromT = has ? `${dx}px ${dy}px` : `0 ${v('--me-y')}`;
    play(dlg, 'popup', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: inDur * 0.6, easing: v('--me-fade') }],
        [[{ translate: fromT, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: inDur, easing: v('--me-in') }],
        ...(blur !== '0px' ? [[[{ filter: `blur(${blur})` }, { filter: 'blur(0px)' }], { duration: inDur, easing: v('--me-in') }]] : []),
    ]);
    try {
        dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inDur * 0.6, easing: 'ease-out', pseudoElement: '::backdrop' });
    } catch { /* 不支持给 ::backdrop 做 WAAPI 的浏览器直接显示 */ }
}

export function installPopups() {
    const mo = new MutationObserver((records) => {
        for (const r of records) {
            const el = /** @type {Element} */ (r.target);
            if (r.attributeName === 'opening' && r.oldValue === null && el.matches('dialog.popup')) open(el);
        }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['opening'], attributeOldValue: true });
}
