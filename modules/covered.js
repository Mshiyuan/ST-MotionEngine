// 被面板挡住的循环动画暂停（兼容与性能 → pauseCovered）
// 美化里一直循环、又改的是阴影、颜色等不能交给显卡的属性的动画（例如发光、流光），每一帧都要让整页重新绘制和分层，页面越大越贵。
// 顶栏面板打开后，被它完全挡住或在屏幕外的元素看不见，它们的循环动画仍在每帧重画。
// 这里在面板打开、画面稳定后，暂停这些看不见的循环动画；面板全部关闭（或切换到另一个面板）时从原处继续。
// 面板里的、没被挡住的（例如手机上面板下方的输入栏）照常播放。
import { state } from '../core/engine.js';
import { DRAWER_SELECTOR } from './drawers.js';

/** 本模块暂停的动画 */
let paused = [];
let token = 0;

const enabled = () => state.on && !!state.settings?.pauseCovered;

function resume() {
    for (const a of paused) { try { if (a.playState === 'paused') a.play(); } catch { /* 元素已移除 */ } }
    paused = [];
}

/** r 是否完全落在面板 p 之内，或完全在屏幕外 */
function hidden(r, panels) {
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return true;
    return panels.some(p => r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1);
}

function pauseCovered() {
    resume();
    if (!enabled()) return;
    const open = [...document.querySelectorAll(DRAWER_SELECTOR)].filter(el => el.classList.contains('openDrawer'));
    if (!open.length) return;
    const panels = open.map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    for (const a of document.getAnimations()) {
        if (!(a instanceof CSSAnimation) || a.playState !== 'running' || a.effect?.getTiming().iterations !== Infinity) continue;
        const t = a.effect.target;
        if (!t || open.some(el => el.contains(t))) continue;
        if (hidden(t.getBoundingClientRect(), panels)) { a.pause(); paused.push(a); }
    }
}

/** 面板开合后等动画结束、画面稳定，再在空闲时处理（读位置会排版，不和打开那一帧抢时间） */
function schedule() {
    const my = ++token;
    resume();
    if (!enabled()) return;
    setTimeout(() => {
        if (my !== token) return;
        const run = () => { if (my === token) pauseCovered(); };
        window.requestIdleCallback ? requestIdleCallback(run, { timeout: 1000 }) : run();
    }, 900);
}

/** 设置变化时调用：关闭开关或插件后立即恢复 */
export function syncCovered() {
    if (!enabled()) { token++; resume(); }
}

export function installCovered() {
    const mo = new MutationObserver(records => {
        if (records.some(r => r.oldValue?.includes('openDrawer') !== /** @type {Element} */ (r.target).classList.contains('openDrawer'))) schedule();
    });
    for (const el of document.querySelectorAll(DRAWER_SELECTOR)) mo.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    // 窗口尺寸变化（旋转屏幕）后遮挡关系会变，重新判断
    addEventListener('resize', () => { if (paused.length) schedule(); }, { passive: true });
}
