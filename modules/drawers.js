// 顶栏抽屉与左右侧栏
// 酒馆通过切换 openDrawer / closedDrawer 两个 class 打开和关闭抽屉，原版动画是过渡 height。
// 这里观察 class 变化，按所选的打开 / 关闭方式（core/forms.js）播放。
//
// 性能要点：酒馆切换 class 之后，这一帧本来就要重新计算样式和排版（大面板要上百毫秒）。
// 如果插件此时读取尺寸，浏览器会被迫提前排版；接着插件再改样式，同一帧就得排两遍。所以：
//   打开：先只写不读（面板设为透明并分好图层），等这一帧画完、排版已经算好，再读尺寸、开始动画；
//   关闭：用打开时记下的尺寸，全程不读。
import { active, play, stop, state, isRunning, ampOf, afterPaint, finishGroup } from '../core/engine.js';
import { resolveForm, panelTracks } from '../core/forms.js';
import { hasFixedBackground } from '../core/guard.js';
import { unfixBackground } from '../core/fixedbg.js';

export const DRAWER_SELECTOR = '#top-settings-holder > .drawer > .drawer-content';
const wasOpen = new WeakMap();
/** 打开时记下的几何信息，关闭时直接用 */
let geom = new WeakMap(); // el → { rect, iconRect, fixedBg }
// 窗口尺寸变化（旋转屏幕等）后面板大小会变，下次打开重新量
addEventListener('resize', () => { geom = new WeakMap(); }, { passive: true });

function iconOf(el) {
    return el.parentElement?.querySelector(':scope > .drawer-toggle .drawer-icon') || null;
}

function measure(el, iconEl) {
    const r = iconEl?.getBoundingClientRect();
    const g = { rect: el.getBoundingClientRect(), iconRect: r && r.width ? r : null, fixedBg: hasFixedBackground(el) };
    geom.set(el, g);
    return g;
}

/** 固定背景换算后的还原函数：动画被打断时保留，由后续动画播放完毕后还原 */
const unfixed = new WeakMap();

function restoreBackground(el) {
    unfixed.get(el)?.();
    unfixed.delete(el);
}

function start(el, dir, g, t) {
    const go = () => {
        const s = state.settings;
        // 固定背景：先换成等效的普通背景；能换算时正常播放，不能换算时只做淡入淡出
        if (g.fixedBg && !unfixed.has(el) && !s.lite && !state.reduced) {
            const restore = unfixBackground(el);
            if (restore) unfixed.set(el, restore);
        }
        quiet(el);
        const { form, k } = resolveForm(el, dir, s);
        const { tracks, origin } = panelTracks(el, dir, { form, k, rect: g.rect, iconRect: g.iconRect, fixedBg: g.fixedBg && !unfixed.has(el), amp: ampOf('drawers'), lite: s.lite });
        return begin(el, dir, tracks, origin);
    };
    return go();
}

/** 关闭的总时长上限：退出比进入快，关闭不拖沓 */
const OUT_MAX = 220;

/** 把一组轨道按比例压缩到不超过 max 毫秒（时长和延迟一起缩） */
function capTracks(tracks, max) {
    const end = Math.max(...tracks.map(([, o]) => (o.duration || 0) + (o.delay || 0)));
    if (!(end > max)) return tracks;
    const k = max / end;
    return tracks.map(([kf, o]) => [kf, { ...o, duration: (o.duration || 0) * k, ...(o.delay ? { delay: o.delay * k } : {}) }]);
}

function begin(el, dir, tracks, origin) {
    if (dir === 'out' && el.matches(DRAWER_SELECTOR)) tracks = capTracks(tracks, OUT_MAX);
    // 只有缩放才需要变换原点。改内联样式会让整块面板重算一次样式，用不到就不写
    const scaled = tracks.some(([kf]) => 'scale' in kf[0] || 'rotate' in kf[0]);
    if (scaled) el.style.transformOrigin = origin;
    return play(el, 'drawer', tracks).then(ok => {
        if (!ok) return false;
        wake(el);
        if (scaled) el.style.transformOrigin = '';
        restoreBackground(el);
        // 打开期间保留图层：关闭时不用把整个面板重画到新图层上（那一帧会多出几十到上百毫秒）
        if (dir === 'out') { el.classList.remove('me-leaving'); el.style.willChange = ''; }
        return true;
    });
}

const token = new WeakMap();

// 美化里一直循环的动画（例如改 background-position 的流光）不能在合成线程执行，面板在屏幕上时每帧都要重画。
// 开合、切换期间新旧两个面板同时在屏，重画翻倍。这段时间暂停面板里的循环动画，结束后从原处继续。
const paused = new WeakMap(); // 面板 → 暂停的 CSS 动画

function quiet(el) {
    if (!state.settings?.pauseLoops || paused.has(el)) return;
    const list = el.getAnimations({ subtree: true }).filter(a => a instanceof CSSAnimation && a.playState === 'running' && a.effect?.getTiming().iterations === Infinity);
    list.forEach(a => a.pause());
    paused.set(el, list);
}

function wake(el) {
    const list = paused.get(el);
    if (!list) return;
    paused.delete(el);
    list.forEach(a => { try { if (a.playState === 'paused') a.play(); } catch { /* 元素已移除 */ } });
}

function run(el, dir, iconEl = null) {
    const t = {};
    token.set(el, t);
    if (dir === 'in') {
        el.classList.remove('me-leaving');
        // 只写：透明 + 分好图层。下一帧再量尺寸、开始动画
        el.style.willChange = 'opacity, translate, scale';
        // 打开过的面板：用上次量好的尺寸立即开始，不再等两帧、不再强制排版（面板大小和图标位置几乎不变）
        const known = geom.get(el);
        if (known && !iconEl) return start(el, 'in', known);
        // 关闭动画尚未结束时再次打开：不加占位，下一帧从当前画面继续
        // 占位动画的时长须长于最慢的第一帧：手机上首次打开大面板可能超过 1 秒，占位先结束会使面板短暂完整显示
        if (!isRunning(el, 'drawer')) el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 10000, id: 'me-hold' });
        // 等打开的那一帧画完再量（和面板里的列表等一起读，见 engine.afterPaint）
        // 先量再撤掉占位动画：撤动画会让样式变脏，反过来做的话量尺寸时要先重算一遍样式
        return new Promise(resolve => afterPaint(
            () => (token.get(el) === t ? measure(el, iconEl || iconOf(el)) : null),
            (g) => {
                el.getAnimations().forEach(a => a.id === 'me-hold' && a.cancel());
                if (!g) return resolve(false);
                resolve(start(el, 'in', g));
            }));
    }
    // 关闭方式为「无动画」：不保留显示、不等待，和原版一样立即关闭
    if (resolveForm(el, 'out', state.settings).form === 'none') {
        stop(el);
        wake(el);
        restoreBackground(el);
        el.classList.remove('me-leaving');
        el.style.willChange = '';
        return Promise.resolve(true);
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
        wake(el);
        restoreBackground(el);
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
        // 可打断：打开动画还在播时手指碰到面板（要滑动、要点选），动画直接到位，让位给手指
        el.addEventListener('pointerdown', () => { if (el.classList.contains('openDrawer')) finishGroup(el, 'drawer'); }, { capture: true, passive: true });
    }
}
