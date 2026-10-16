// 按压反馈：按下缩小，松开按风格曲线回弹。
// 用 WAAPI 只动独立的 scale 属性，不改元素的 transition，主题自己的过渡和 transform 照常生效。
import { active, dur, v, play, state } from '../core/engine.js';

export const PRESS_SELECTOR = [
    '.menu_button', '.menu_button_icon', '.mes_button', '.right_menu_button', '.drawer-icon',
    '.swipe_left', '.swipe_right', '#send_but', '#mes_continue', '#mes_stop', '#mes_impersonate',
    '#options_button', '#extensionsMenuButton', '.extraMesButtonsHint', '.interactable',
    '#options .options-content a', '#extensionsMenu .list-group-item', '.list-group-item',
    '.character_select', '.group_select', '.bogus_folder_select', '.tag', '.bg_example',
    '.select2-selection', '.inline-drawer-toggle', '.popup-button-ok', '.popup-button-cancel', '.popup-button-custom',
    '.qr--button', '.mes_edit_buttons > div', '.avatar-container',
].join(',');

const pressed = new Set();

/** 大元素压得少一点，避免整行列表缩得很明显 */
function pressScale(el) {
    const base = String(v('--me-press') || '1').split(/\s+/).map(Number);
    const w = el.offsetWidth;
    const k = w > 320 ? 0.25 : w > 160 ? 0.5 : 1;
    return base.map(s => +(1 - (1 - s) * k).toFixed(3)).join(' ');
}

function down(e) {
    if (!active('press') || e.button > 0) return;
    const el = /** @type {Element} */ (e.target)?.closest?.(PRESS_SELECTOR);
    if (!el || el.matches('[disabled], .disabled, .ui-draggable-dragging')) return;
    pressed.add(el);
    const d = dur('--me-press-dur');
    play(el, 'press', [[[{ scale: '1' }, { scale: pressScale(el) }], { duration: Math.max(d, 1), easing: 'ease-out' }]], { keep: true });
    if (state.settings?.haptics && e.pointerType === 'touch' && navigator.vibrate) {
        try { navigator.vibrate(8); } catch { /* 部分浏览器在没有用户手势时会拒绝 */ }
    }
}

function up() {
    if (!pressed.size) return;
    for (const el of pressed) {
        const d = dur('--me-rel-dur');
        play(el, 'press', [[[{ scale: pressScale(el) }, { scale: '1' }], { duration: Math.max(d, 1), easing: v('--me-rel') }]]);
    }
    pressed.clear();
}

export function installPress() {
    document.addEventListener('pointerdown', down, { capture: true, passive: true });
    document.addEventListener('pointerup', up, { capture: true, passive: true });
    document.addEventListener('pointercancel', up, { capture: true, passive: true });
    window.addEventListener('blur', up);
    // iOS Safari 需要页面上有 touchstart 监听，:active 和快速响应才正常
    document.addEventListener('touchstart', () => { }, { passive: true });
}
