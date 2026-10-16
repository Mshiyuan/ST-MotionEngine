// 顶栏抽屉与左右侧栏
// 酒馆通过切换 openDrawer / closedDrawer 两个 class 打开和关闭抽屉，原版动画是过渡 height。
// 这里观察 class 变化：
//   打开：高度一步到位，用 WAAPI 做 opacity + translate/scale，并且等打开那一帧画完再开始（见 engine.play 的 defer）；
//   关闭：先加 .me-leaving 让抽屉暂时保持显示，播完退场再移除，所有浏览器都有关闭动画。
import { active, dur, v, play, stop } from '../core/engine.js';

const SELECTOR = '#top-settings-holder > .drawer > .drawer-content';
const wasOpen = new WeakMap();
const isDesktop = () => matchMedia('(min-width: 1001px)').matches;

/** 起点：普通抽屉从顶栏往下落；电脑上的左右侧栏从各自那一侧滑入 */
function fromPose(el) {
    if (isDesktop() && el.classList.contains('fillLeft')) return { translate: `calc(${v('--me-side-x')} * -1) 0`, origin: '0 50%' };
    if (isDesktop() && el.classList.contains('fillRight')) return { translate: `${v('--me-side-x')} 0`, origin: '100% 50%' };
    return { translate: `0 calc(${v('--me-p-y')} * -1)`, origin: '50% 0' };
}

function enter(el) {
    el.classList.remove('me-leaving');
    const d = dur('--me-p-in-dur');
    const pose = fromPose(el);
    const blur = v('--me-p-blur');
    el.style.transformOrigin = pose.origin;
    // 和打开同一帧就分好图层，动画开始时不用再重画一遍整个抽屉
    el.style.willChange = 'opacity, translate, scale';
    play(el, 'drawer', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.6, easing: v('--me-fade') }],
        [[{ translate: pose.translate, scale: v('--me-p-s') }, { translate: '0 0', scale: '1' }], { duration: d, easing: v('--me-p-in') }],
        ...(blur !== '0px' ? [[[{ filter: `blur(${blur})` }, { filter: 'blur(0px)' }], { duration: d, easing: v('--me-p-in') }]] : []),
    ], { defer: true }).then(ok => { if (ok) { el.style.transformOrigin = ''; el.style.willChange = ''; } });
}

function leave(el) {
    const d = dur('--me-p-out-dur');
    const pose = fromPose(el);
    el.style.transformOrigin = pose.origin;
    el.classList.add('me-leaving');
    play(el, 'drawer', [
        [[{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: v('--me-out') }],
        [[{ translate: '0 0', scale: '1' }, { translate: pose.translate, scale: v('--me-p-s') }], { duration: d, easing: v('--me-out') }],
    ]).then(ok => {
        if (!ok) return;
        el.classList.remove('me-leaving');
        el.style.transformOrigin = '';
        el.style.willChange = '';
    });
}

function onClass(el) {
    const open = el.classList.contains('openDrawer');
    if (wasOpen.get(el) === open) return;
    wasOpen.set(el, open);
    if (!active('drawers') || window.jQuery?.fx?.off || el.classList.contains('pinnedOpen')) {
        stop(el);
        el.classList.remove('me-leaving');
        return;
    }
    open ? enter(el) : leave(el);
}

export function installDrawers() {
    const els = document.querySelectorAll(SELECTOR);
    const mo = new MutationObserver(records => {
        for (const r of records) onClass(/** @type {Element} */(r.target));
    });
    for (const el of els) {
        wasOpen.set(el, el.classList.contains('openDrawer'));
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
}
