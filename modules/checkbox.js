// 复选框：勾选时勾按当前风格的曲线弹出，框本身轻轻回弹
// 酒馆的勾是复选框的 ::before，用 transform: scale(0 → 1) 加 125ms 过渡显示。这里只叠加独立的 scale 属性，
// 不覆盖酒馆和美化自己的 transform、过渡，所以改成开关样式的美化复选框照样生效。
// 只响应用户操作触发的 change 事件；脚本改勾选状态不触发 change，不会乱动。
import { active, play, state, scoped } from '../core/engine.js';

const { dur, v } = scoped('checkbox');

function onChange(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox' || !active('checkbox') || state.reduced) return;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return; // 看不见的不动
    const press = Number(String(v('--me-press')).split(' ').pop()) || 0.95;
    const dip = String(Math.max(0.6, 1 - (1 - press) * 2.5));
    // 框：先往里收一下，再按松手曲线弹回。酒馆给复选框写了 position: relative，加缩放不会挤歪装饰
    const tracks = [[[
        { scale: '1', easing: 'ease-out' },
        { scale: dip, offset: 0.25, easing: v('--me-rel') },
        { scale: '1' },
    ], { duration: Math.max(240, dur('--me-rel-dur')) }]];
    // 勾：从小到大弹出（伪元素上的独立 scale 和酒馆的 transform 相乘）
    // 美化把复选框改成开关样式时，::before 往往不存在（勾由 ::after 或背景画），这时只做框的回弹
    const before = getComputedStyle(el, '::before');
    const tick = before.content;
    if (el.checked && before.display !== 'none' && tick && tick !== 'none' && tick !== 'normal') tracks.push([[{ scale: '0.3' }, { scale: '1' }], { duration: Math.max(200, dur('--me-in-dur') * 0.8), easing: v('--me-rel'), pseudoElement: '::before' }]);
    // 同一元素的动画要一次播完：play 会取消这个元素上之前的动画
    play(el, 'checkbox', tracks);
}

export function installCheckbox() {
    document.addEventListener('change', onChange, true);
}
