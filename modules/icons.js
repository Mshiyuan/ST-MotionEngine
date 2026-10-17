// 图标点击反馈：顶栏和底栏的图标点击后按当前风格做一个小动作。
// 只动独立的 scale / rotate / translate 属性（WAAPI），美化写死的 transform、换成图片的图标照样生效。
// 美化已经给图标写了自己的动画（animation），且没开「覆盖美化动效」时，不动它。
import { active, playTransform, isRunning, state, ampOf } from '../core/engine.js';
import { spring } from '../core/tokens.js';

const BAR_SELECTOR = [
    '#leftSendForm > .fa-solid', '#leftSendForm > .interactable', '#rightSendForm > .fa-solid', '#rightSendForm > .interactable',
    '#options_button', '#extensionsMenuButton', '#send_but', '#mes_continue', '#mes_impersonate', '#mes_stop',
].join(',');

const sSoft = spring(260, 14);
const sIOS = spring(320, 30);
const sM3 = spring(500, 22);
const sJelly = spring(400, 9);
const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * 各风格的图标动作。a = 幅度系数，open = 是否是打开面板（关闭时动作减半）
 * 返回 WAAPI 轨道
 */
const FX = {
    smooth: (a) => [[[{ scale: s(1 - 0.12 * a) }, { scale: '1' }], { duration: 420, easing: EXPO }]],
    spring: (a) => [[[{ scale: s(1 - 0.18 * a) }, { scale: '1' }], { duration: sSoft.duration, easing: sSoft.easing }]],
    soft: (a) => [[[{ opacity: 0.5, scale: s(1 - 0.05 * a) }, { opacity: 1, scale: '1' }], { duration: 320, easing: 'cubic-bezier(0.2, 0, 0, 1)' }]],
    snappy: (a) => [[[{ scale: s(1 - 0.1 * a) }, { scale: '1' }], { duration: 140, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }]],
    ios: (a) => [[[{ scale: s(1 - 0.14 * a) }, { scale: '1' }], { duration: sIOS.duration, easing: sIOS.easing }]],
    m3: (a) => [[[{ scale: s(1 - 0.2 * a), rotate: `${-8 * a}deg` }, { scale: '1', rotate: '0deg' }], { duration: sM3.duration, easing: sM3.easing }]],
    bouncy: (a) => [[[{ scale: '1' }, { scale: s(1 - 0.2 * a), offset: 0.2 }, { scale: s(1 + 0.18 * a), offset: 0.55 }, { scale: s(1 - 0.05 * a), offset: 0.8 }, { scale: '1' }], { duration: 520, easing: 'ease-out' }]],
    juicy: (a) => [[[{ scale: '1 1' }, { scale: `${s(1 + 0.2 * a)} ${s(1 - 0.2 * a)}`, offset: 0.25 }, { scale: `${s(1 - 0.1 * a)} ${s(1 + 0.12 * a)}`, offset: 0.55 }, { scale: `${s(1 + 0.04 * a)} ${s(1 - 0.04 * a)}`, offset: 0.8 }, { scale: '1 1' }], { duration: 560, easing: 'ease-out' }]],
    blur: (a) => [[[{ scale: s(1 + 0.12 * a), filter: `blur(${(2 * Math.min(a, 1.5)).toFixed(1)}px)` }, { scale: '1', filter: 'blur(0px)' }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }]],
    float: (a) => [[[{ translate: '0 0' }, { translate: `0 ${-5 * a}px`, offset: 0.4 }, { translate: '0 0' }], { duration: 700, easing: 'cubic-bezier(0.37, 0, 0.63, 1)' }]],
    ink: (a) => [[[{ opacity: 0.4, scale: s(1 + 0.15 * a) }, { opacity: 1, scale: '1' }], { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }]],
    jelly: (a) => [[[{ scale: `${s(1 + 0.25 * a)} ${s(1 - 0.25 * a)}` }, { scale: '1 1' }], { duration: sJelly.duration, easing: sJelly.easing }]],
    cinema: (a) => [[[{ opacity: 0.6, scale: s(1 + 0.1 * a) }, { opacity: 1, scale: '1' }], { duration: 800, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }]],
    steps: (a) => [[[{ scale: s(1 - 0.2 * a) }, { scale: '1' }], { duration: 240, easing: 'steps(3, end)' }]],
};

/** 缩放值限制在 0.3–1.8 */
function s(x) {
    return String(+Math.min(1.8, Math.max(0.3, x)).toFixed(3));
}

/** 按当前风格给图标播一次点击动作；preview 用于设置面板里的样本 */
export function iconFx(el, { weak = false } = {}) {
    const fx = FX[state.feel?.id] || FX.smooth;
    const amp = Math.max(0, ampOf('icons')) * (weak ? 0.5 : 1);
    if (!amp) return Promise.resolve(true);
    const s = state.settings;
    const speed = (s?.perModule && s.tune?.icons?.speed) || s?.speed || 1;
    const tracks = fx(amp).map(([kf, opt]) => [kf, { ...opt, duration: opt.duration / speed }]);
    return playTransform(el, 'icon', tracks);
}

/**
 * 酒馆在点击之后才切换图标的 openIcon（美化常在这时加上下划线）。下一帧再检查一次：
 * 如果现在加缩放会挤歪下划线，而元素本身还在动，就改为只动图形或停下。
 */
function recheck(el, weak) {
    requestAnimationFrame(() => {
        if (!el.isConnected || el.classList.contains('me-glyph')) return;
        if (!isRunning(el, 'icon') && !isRunning(el, 'press')) return;
        const amp = Math.max(0, ampOf('icons'));
        if (active('icons') && amp && !themeAnimates(el)) iconFx(el, { weak }); else playTransform(el, 'press', [[[{ scale: '1' }, { scale: '1' }], { duration: 1 }]]);
    });
}

/** 美化给图标写了自己的动画时让开（开了「覆盖美化动效」除外） */
function themeAnimates(el) {
    if (state.settings?.override) return false;
    const name = getComputedStyle(el).animationName;
    return !!name && name !== 'none';
}

function target(t) {
    const toggle = t.closest?.('#top-settings-holder .drawer-toggle');
    if (toggle) return { el: toggle.querySelector('.drawer-icon'), top: true };
    const bar = t.closest?.(BAR_SELECTOR);
    if (bar) return { el: bar, top: false };
    return null;
}

export function installIcons() {
    document.addEventListener('click', (e) => {
        if (state.reduced || !state.on) return;
        const hit = target(/** @type {Element} */ (e.target));
        if (!hit?.el) return;
        // 顶栏图标：关闭面板时动作减半，打开时完整
        const weak = hit.top && hit.el.classList.contains('openIcon');
        // 按压反馈也会缩放图标，所以不管图标反馈开没开都要复查
        if (hit.top) recheck(hit.el, weak);
        if (!active('icons') || themeAnimates(hit.el)) return;
        iconFx(hit.el, { weak });
    }, { capture: true, passive: true });
}
