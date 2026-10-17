// 顶栏抽屉与左右侧栏
// 酒馆通过切换 openDrawer / closedDrawer 两个 class 打开和关闭抽屉，原版动画是过渡 height。
// 这里观察 class 变化，按所选的打开 / 关闭方式（core/forms.js）播放。
//
// 性能要点：酒馆切换 class 之后，这一帧本来就要重新计算样式和排版（大面板要上百毫秒）。
// 如果插件此时读取尺寸，浏览器会被迫提前排版；接着插件再改样式，同一帧就得排两遍。所以：
//   打开：先只写不读（面板设为透明并分好图层），等这一帧画完、排版已经算好，再读尺寸、开始动画；
//   关闭：用打开时记下的尺寸，全程不读。
import { active, play, stop, state, isRunning } from '../core/engine.js';
import { resolveForm, panelTracks } from '../core/forms.js';
import { hasFixedBackground } from '../core/guard.js';

export const DRAWER_SELECTOR = '#top-settings-holder > .drawer > .drawer-content';
const wasOpen = new WeakMap();
/** 打开时记下的几何信息，关闭时直接用 */
const geom = new WeakMap(); // el → { rect, iconRect, fixedBg }

function iconOf(el) {
    return el.parentElement?.querySelector(':scope > .drawer-toggle .drawer-icon') || null;
}

function measure(el, iconEl) {
    const r = iconEl?.getBoundingClientRect();
    const g = { rect: el.getBoundingClientRect(), iconRect: r && r.width ? r : null, fixedBg: hasFixedBackground(el) };
    geom.set(el, g);
    return g;
}

function start(el, dir, g, t) {
    const s = state.settings;
    const { form, k } = resolveForm(el, dir, s);
    const { tracks, origin } = panelTracks(el, dir, { form, k, rect: g.rect, iconRect: g.iconRect, fixedBg: g.fixedBg, amp: s.amp, lite: s.lite });
    // 关闭时酒馆切换 class 的那一帧要重算整块面板的样式（手机上几十到几百毫秒）。动画如果同时开始，
    // 这段时间会被算进动画里，画出来时已经播完大半，面板像是一下子消失。所以先保持原样，等这一帧过去再开始。
    if (dir === 'out' && t) {
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve(token.get(el) === t ? begin(el, dir, tracks, origin) : false);
        })));
    }
    return begin(el, dir, tracks, origin);
}

function begin(el, dir, tracks, origin) {
    // 只有缩放才需要变换原点。改内联样式会让整块面板重算一次样式，用不到就不写
    const scaled = tracks.some(([kf]) => 'scale' in kf[0]);
    if (scaled) el.style.transformOrigin = origin;
    return play(el, 'drawer', tracks).then(ok => {
        if (!ok) return false;
        if (scaled) el.style.transformOrigin = '';
        // 打开期间保留图层：关闭时不用把整个面板重画到新图层上（那一帧会多出几十到上百毫秒）
        if (dir === 'out') { el.classList.remove('me-leaving'); el.style.willChange = ''; }
        return true;
    });
}

const token = new WeakMap();

function run(el, dir, iconEl = null) {
    const t = {};
    token.set(el, t);
    if (dir === 'in') {
        el.classList.remove('me-leaving');
        // 只写：透明 + 分好图层。下一帧再量尺寸、开始动画
        el.style.willChange = 'opacity, translate, scale';
        // 关闭动画还没播完就又打开：不遮住，下一帧从当前画面接着播
        if (!isRunning(el, 'drawer')) el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1000, id: 'me-hold' });
        // rAF 回调在本帧排版之前执行，所以要等两次：第二次时打开那一帧已经画完，尺寸是现成的
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
            // 先量再撤掉占位动画：撤动画会让样式变脏，反过来做的话量尺寸时要先重算一遍样式
            const g = token.get(el) === t ? measure(el, iconEl || iconOf(el)) : null;
            el.getAnimations().forEach(a => a.id === 'me-hold' && a.cancel());
            if (!g) return resolve(false);
            if (g.fixedBg) el.style.willChange = 'opacity';
            resolve(start(el, 'in', g));
        })));
    }
    // 关闭：先写 class（保持显示），用缓存的尺寸，不读
    el.classList.add('me-leaving');
    const g = geom.get(el) || { rect: null, iconRect: null, fixedBg: false };
    return start(el, 'out', g, t);
}

function onClass(el) {
    const open = el.classList.contains('openDrawer');
    if (wasOpen.get(el) === open) return;
    wasOpen.set(el, open);
    if (!active('drawers') || el.classList.contains('pinnedOpen')) {
        token.set(el, {});
        stop(el);
        el.classList.remove('me-leaving');
        el.style.willChange = '';
        return;
    }
    run(el, open ? 'in' : 'out');
}

/** 设置面板里的预览：在任意元素上按当前设置播一次面板开合 */
export function previewPanel(el, dir, iconEl) {
    return run(el, dir, iconEl);
}

export function installDrawers() {
    const els = document.querySelectorAll(DRAWER_SELECTOR);
    const mo = new MutationObserver(records => {
        for (const r of records) onClass(/** @type {HTMLElement} */(r.target));
    });
    for (const el of els) {
        wasOpen.set(el, el.classList.contains('openDrawer'));
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
}
