// 面板（顶栏抽屉、侧栏）的打开 / 关闭方式
// 每种方式给出一组 WAAPI 轨道。打开方式描述「从哪里来」，关闭方式描述「到哪里去」。
import { dur, v, state } from './engine.js';

/** 设置里可选的方式（feel = 跟随手感风格） */
export const PANEL_FORMS = [
    { id: 'feel', zh: '跟随风格', en: 'Match style' },
    { id: 'drop', zh: '垂直滑动', en: 'Slide vertical' },
    { id: 'icon', zh: '缩放到图标', en: 'Zoom to icon' },
    { id: 'rise', zh: '浮起 / 下沉', en: 'Rise / sink' },
    { id: 'side', zh: '侧滑', en: 'Slide sideways' },
    { id: 'curtain', zh: '卷帘', en: 'Curtain' },
    { id: 'fade', zh: '淡入淡出', en: 'Fade' },
    { id: 'none', zh: '无动画', en: 'None' },
];

/** 各风格自己的打开 / 关闭性格 */
const FEEL_FORMS = {
    smooth: { in: 'drop', out: 'drop', k: 1 },
    spring: { in: 'drop', out: 'drop-back', k: 1.3 },
    soft: { in: 'fade', out: 'fade', k: 0.5 },
    snappy: { in: 'drop', out: 'drop', k: 0.6 },
    ios: { in: 'icon', out: 'icon', k: 1 },
    m3: { in: 'icon', out: 'icon', k: 1 },
    bouncy: { in: 'pop', out: 'pop', k: 1 },
    juicy: { in: 'pop', out: 'squash', k: 1 },
    blur: { in: 'focus', out: 'dissolve', k: 1 },
    float: { in: 'rise', out: 'float', k: 1.4 },
    ink: { in: 'curtain', out: 'curtain', k: 1 },
    jelly: { in: 'jelly', out: 'squash', k: 1.2 },
    cinema: { in: 'rise', out: 'sink', k: 1.6 },
    steps: { in: 'drop', out: 'drop', k: 1 },
};

const isMobile = () => matchMedia('(max-width: 1000px)').matches;

/** 侧栏从哪一边来：左右侧栏各在其侧；其他面板看触发图标在屏幕左半还是右半 */
function sideOf(el, iconRect) {
    if (el.classList.contains('fillLeft')) return -1;
    if (el.classList.contains('fillRight')) return 1;
    if (iconRect) return iconRect.left + iconRect.width / 2 < innerWidth / 2 ? -1 : 1;
    return -1;
}

/**
 * 决定实际使用的方式
 * @param {'in'|'out'} dir
 */
export function resolveForm(el, dir, settings) {
    const chosen = settings?.[dir === 'in' ? 'panelIn' : 'panelOut'] || 'feel';
    const feelForm = FEEL_FORMS[state.feel?.id] || FEEL_FORMS.smooth;
    let form = chosen === 'feel' ? feelForm[dir] : chosen;
    // 手机上的左右侧栏：跟随风格时默认侧滑，比从顶栏落下更有方向感
    if (chosen === 'feel' && isMobile() && (el.id === 'left-nav-panel' || el.id === 'right-nav-panel') && ['drop', 'drop-back', 'rise', 'sink', 'fade'].includes(form)) form = 'side';
    return { form, k: feelForm.k };
}

/**
 * 生成面板动画轨道
 * @param {HTMLElement} el 面板
 * @param {'in'|'out'} dir
 * @param {{ form: string, k: number, rect?: DOMRect, iconRect?: DOMRect, fixedBg?: boolean, amp: number, lite?: boolean }} o
 * @returns {{ tracks: Array<[Keyframe[], KeyframeAnimationOptions]>, origin: string }}
 */
export function panelTracks(el, dir, o) {
    // 尺寸由调用方传入（打开时在排版干净的时候量，关闭时用缓存），这里不读，避免强制排版
    const rect = o.rect || { left: 0, top: 0, width: innerWidth, height: innerHeight * 0.7 };
    const h = rect.height || innerHeight * 0.6;
    const w = rect.width || innerWidth;
    const amp = o.amp ?? 1;
    // 位移按面板高度算，手机上全屏面板也看得出来；幅度 0–2
    const d = Math.max(8, Math.min(220, h * 0.07 * o.k * amp));
    const inDur = dur('--me-p-in-dur'), outDur = dur('--me-p-out-dur');
    const D = dir === 'in' ? inDur : outDur;
    const ease = dir === 'in' ? v('--me-p-in') : v('--me-out');
    const fadeEase = dir === 'in' ? v('--me-fade') : v('--me-out');
    const fadeDur = dir === 'in' ? D * 0.6 : D;
    const side = sideOf(el, o.iconRect);
    const icon = o.iconRect;
    let origin = '50% 0';
    if (icon) origin = `${icon.left + icon.width / 2 - rect.left}px ${icon.top + icon.height / 2 - rect.top}px`;

    // 起点（in）或终点（out）的姿态
    const T = []; // [keyframes, options]
    const fade = (from = 0) => T.push([dir === 'in' ? [{ opacity: from }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: from }], { duration: fadeDur, easing: fadeEase }]);
    const move = (pose, opt = {}) => {
        // 只写用到的属性：固定背景的面板哪怕带一个 translate: 0 0，背景也会改成跟着元素走
        const rest = { translate: '0 0', scale: '1', clipPath: 'inset(0 0 0 0)', filter: 'blur(0px)' };
        const b = { ...pose }, a = {};
        for (const key of Object.keys(b)) a[key] = rest[key];
        T.push([dir === 'in' ? [b, a] : [a, b], { duration: D, easing: ease, ...opt }]);
    };

    let form = o.form;
    // 简化模式：只淡入淡出
    if (o.lite || state.reduced) form = 'fade-lite';
    // 固定背景：不移动、不缩放元素本身，改用裁剪
    if (o.fixedBg && !['fade', 'fade-lite', 'dissolve', 'focus', 'curtain'].includes(form)) {
        form = { drop: 'clip-top', 'drop-back': 'clip-top', rise: 'clip-bottom', sink: 'clip-bottom', float: 'clip-top', side: side < 0 ? 'clip-left' : 'clip-right' }[form] || 'clip-icon';
    }

    if (o.form === 'none') return { tracks: [], origin, form: 'none' };
    switch (form) {
        case 'fade-lite':
            fade();
            break;
        case 'drop':
            fade(); move({ translate: `0 ${-d}px` });
            break;
        case 'drop-back': // 收回时先轻轻往下沉一点再快速收走（蓄力）
            if (dir === 'in') { fade(); move({ translate: `0 ${-d}px` }); break; }
            fade();
            T.push([[{ translate: '0 0' }, { translate: `0 ${d * 0.15}px`, offset: 0.3 }, { translate: `0 ${-d * 1.2}px` }], { duration: D * 1.2, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' }]);
            break;
        case 'rise':
        case 'sink':
            fade(); move({ translate: `0 ${d}px` });
            break;
        case 'float': // 慢慢往上飘走
            T.push([[{ opacity: 1 }, { opacity: 0 }], { duration: D * 1.6, easing: 'cubic-bezier(0.33, 0, 0.67, 1)' }]);
            T.push([[{ translate: '0 0' }, { translate: `0 ${-d * 1.6}px` }], { duration: D * 1.6, easing: 'cubic-bezier(0.33, 0, 0.67, 1)' }]);
            break;
        case 'side': {
            const full = isMobile() && (el.id === 'left-nav-panel' || el.id === 'right-nav-panel');
            const dx = full ? w * side : Math.max(24, w * 0.12 * o.k * amp) * side;
            fade(full ? 0.4 : 0); move({ translate: `${dx}px 0` });
            break;
        }
        case 'icon': {
            const s0 = icon ? Math.max(0.12, 0.35 - 0.1 * amp) : 0.85;
            fade(); move({ scale: `${s0}` });
            break;
        }
        case 'pop':
            fade();
            if (dir === 'in') move({ scale: String(1 - 0.08 * amp) });
            else T.push([[{ scale: '1' }, { scale: String(1 + 0.025 * amp), offset: 0.35 }, { scale: String(1 - 0.12 * amp) }], { duration: D * 1.2, easing: 'ease-in' }]);
            break;
        case 'squash': // 压扁再消失
            if (dir === 'in') { fade(); move({ scale: `${1 + 0.05 * amp} ${1 - 0.1 * amp}` }); break; }
            T.push([[{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: D * 1.3, easing: 'linear' }]);
            T.push([[{ scale: '1 1' }, { scale: `${1 + 0.04 * amp} ${1 - 0.08 * amp}`, offset: 0.4 }, { scale: `${1 - 0.1 * amp} ${1 + 0.02 * amp}` }], { duration: D * 1.3, easing: 'ease-in' }]);
            break;
        case 'jelly':
            fade(); move({ scale: `${1 + 0.06 * amp} ${1 - 0.12 * amp}` });
            break;
        case 'focus':
        case 'dissolve':
            fade(); move({ scale: dir === 'in' ? String(1 + 0.03 * amp) : String(1 - 0.02 * amp), filter: `blur(${Math.round(6 * amp)}px)` });
            break;
        case 'fade':
            fade(); move({ scale: String(1 - 0.02 * amp) });
            break;
        case 'curtain':
        case 'clip-top':
            fade(0.6); move({ clipPath: 'inset(0 0 100% 0)' });
            break;
        case 'clip-bottom':
            fade(0.6); move({ clipPath: 'inset(100% 0 0 0)' });
            break;
        case 'clip-left':
            fade(0.6); move({ clipPath: 'inset(0 100% 0 0)' });
            break;
        case 'clip-right':
            fade(0.6); move({ clipPath: 'inset(0 0 0 100%)' });
            break;
        case 'clip-icon': {
            const at = icon ? origin : '50% 0';
            fade(0.4); move({ clipPath: `circle(0px at ${at})` });
            // 终点半径要盖住整个面板
            const r = Math.hypot(w, h);
            for (const [kf] of T) for (const f of kf) if (f.clipPath === 'inset(0 0 0 0)') f.clipPath = `circle(${r}px at ${at})`;
            break;
        }
        default:
            fade(); move({ translate: `0 ${-d}px` });
    }
    return { tracks: T, origin, form };
}
