// 面板预渲染：关闭的顶栏面板不再 display: none，而是 content-visibility: hidden + visibility: hidden。
// 浏览器保留它的渲染结果，再次打开时不用从头排版（实测再次打开快 30–45%，关闭快约 40%）。
// 空闲时把每个面板预先渲染一次，第一次打开也受益。
//
// 副作用：关闭的面板在 jQuery 看来仍然「可见」（有尺寸）。酒馆的 Esc 键、打开世界书等处用 .is(':visible')
// 判断面板是否打开，所以这里修正 jQuery 的 :visible，让预渲染中的面板照旧算作不可见。
import { state } from '../core/engine.js';
import { DRAWER_SELECTOR } from './drawers.js';

const root = document.documentElement;
const enabled = () => state.on && state.settings?.prerender && root.classList.contains('me-prerender');

/** 是否处于「预渲染但关闭」状态 */
function dormant(el) {
    const d = el.closest('.closedDrawer');
    return !!d && !d.classList.contains('me-leaving') && d.matches(DRAWER_SELECTOR);
}

function patchVisible() {
    const $ = window.jQuery;
    const orig = $.expr.pseudos.visible;
    $.expr.pseudos.visible = function (elem) {
        if (!orig(elem)) return false;
        return !(enabled() && dormant(elem));
    };
    // jQuery 的选择器引擎会缓存编译结果，已经编译过的 :visible 还拿着旧函数。
    // 缓存是最近 50 条，编译一批一次性选择器把旧条目挤出去。
    const n = ($.expr.cacheLength || 50) + 10;
    for (let i = 0; i < n; i++) {
        try { $.find.compile(`.me-evict-${i}:visible`); } catch { /* 忽略 */ }
    }
}

/** 空闲时逐个预渲染面板：短暂解除 content-visibility，让浏览器排版一次 */
function warmUp() {
    const els = [...document.querySelectorAll(DRAWER_SELECTOR)].filter(el => el.classList.contains('closedDrawer'));
    const next = () => {
        if (!enabled()) return;
        const el = els.shift();
        if (!el) return;
        if (el.classList.contains('closedDrawer')) {
            el.classList.add('me-warm');
            requestAnimationFrame(() => requestAnimationFrame(() => {
                el.classList.remove('me-warm');
                idle(next);
            }));
        } else idle(next);
    };
    idle(next);
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 300));

export function installPrerender() {
    patchVisible();
    // 等酒馆和其他插件启动完再预热，避免拖慢启动
    setTimeout(warmUp, 4000);
}

export function rewarm() {
    if (enabled()) warmUp();
}
