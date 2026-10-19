// 按压反馈：按下缩小，松开按风格曲线回弹。
// 用 WAAPI 只动独立的 scale 属性，不改元素的 transition，主题自己的过渡和 transform 照常生效。
import { active, playTransform, state, scoped } from '../core/engine.js';

// 动效参数按模块读取（开了「分模块设置」时各模块用自己的幅度和速度）
const { dur, v } = scoped('press');

export const PRESS_SELECTOR = [
    '.menu_button', '.menu_button_icon', '.mes_button', '.right_menu_button', '.drawer-icon',
    '.swipe_left', '.swipe_right', '#send_but', '#mes_continue', '#mes_stop', '#mes_impersonate',
    '#options_button', '#extensionsMenuButton', '.extraMesButtonsHint', '.interactable',
    '#options .options-content a', '#extensionsMenu .list-group-item', '.list-group-item',
    '.character_select', '.group_select', '.bogus_folder_select', '.tag', '.bg_example',
    '.select2-selection', '.inline-drawer-toggle', '.popup-button-ok', '.popup-button-cancel', '.popup-button-custom',
    '.qr--button', '.mes_edit_buttons > div', '.avatar-container', '.me-pressable', '.me-feel', '.me-chip',
].join(',');

const pressed = new Set();

// 触屏按下后先等一会儿再缩小（安卓判断点按也是 100ms）：这段时间里开始滑动就不缩小，
// 否则每次滑动列表，手指下的那一行都会先缩小再回弹，滚动看起来一颗一颗的
const TAP_DELAY = 100;
const SLOP = 10;
/** @type {{ el: Element, x: number, y: number, timer: number, touch: boolean } | null} */
let pending = null;

function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
}

function vibrate(touch) {
    if (state.settings?.haptics && touch && navigator.vibrate) {
        try { navigator.vibrate(8); } catch { /* 部分浏览器在没有用户手势时会拒绝 */ }
    }
}

function startPress(el, touch) {
    pressed.add(el);
    const d = dur('--me-press-dur');
    playTransform(el, 'press', [[[{ scale: '1' }, { scale: pressScale(el) }], { duration: Math.max(d, 1), easing: 'ease-out' }]], { keep: true });
    vibrate(touch);
}

/** 没等到缩小就松手的轻点：按下和回弹连在一条动画里播完 */
function quickTap(el, touch) {
    const d = Math.max(dur('--me-press-dur'), 1);
    const r = Math.max(dur('--me-rel-dur'), 1);
    playTransform(el, 'press', [[[
        { scale: '1', easing: 'ease-out' },
        { scale: pressScale(el), offset: d / (d + r), easing: v('--me-rel') },
        { scale: '1' },
    ], { duration: d + r }]]);
    vibrate(touch);
}

/** 宽度较大的元素减小按压幅度，避免整行列表明显缩小 */
function pressScale(el) {
    const base = String(v('--me-press') || '1').split(/\s+/).map(Number);
    const w = el.offsetWidth;
    const k = w > 320 ? 0.25 : w > 160 ? 0.5 : 1;
    return base.map(s => +(1 - (1 - s) * k).toFixed(3)).join(' ');
}

function down(e) {
    if (!active('press') || state.reduced || e.button > 0) return;
    const el = /** @type {Element} */ (e.target)?.closest?.(PRESS_SELECTOR);
    if (!el || el.matches('[disabled], .disabled, .ui-draggable-dragging')) return;
    cancelPending();
    if (e.pointerType !== 'touch') { startPress(el, false); return; }
    const p = { el, x: e.clientX, y: e.clientY, touch: true, timer: 0 };
    p.timer = setTimeout(() => { if (pending === p) { pending = null; startPress(el, true); } }, TAP_DELAY);
    pending = p;
}

function move(e) {
    if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > SLOP) cancelPending();
}

/** @param {Event} [e] pointercancel（开始滚动）时平稳恢复，不按风格回弹 */
function up(e) {
    if (pending) {
        const { el, touch } = pending;
        cancelPending();
        if (e?.type === 'pointerup') quickTap(el, touch);
    }
    if (!pressed.size) return;
    const scrolled = e?.type === 'pointercancel';
    for (const el of pressed) {
        const d = dur('--me-rel-dur');
        playTransform(el, 'press', [[[{ scale: pressScale(el) }, { scale: '1' }], scrolled
            ? { duration: Math.max(d * 0.6, 1), easing: 'ease-out' }
            : { duration: Math.max(d, 1), easing: v('--me-rel') }]]);
    }
    pressed.clear();
}

export function installPress() {
    document.addEventListener('pointerdown', down, { capture: true, passive: true });
    document.addEventListener('pointermove', move, { capture: true, passive: true });
    document.addEventListener('pointerup', up, { capture: true, passive: true });
    document.addEventListener('pointercancel', up, { capture: true, passive: true });
    window.addEventListener('blur', up);
    // iOS Safari 需要页面上有 touchstart 监听，:active 和快速响应才正常
    document.addEventListener('touchstart', () => { }, { passive: true });
}
