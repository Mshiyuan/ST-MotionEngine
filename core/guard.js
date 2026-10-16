// 兼容层：和美化、系统设置、浏览器能力打交道的地方都在这里

// ---------- 美化贴图预解码 ----------
// Chrome 对「刚显示出来、又正在做合成层动画」的元素，会把大图放到后台解码，解码完之前先画成空白。
// 美化贴图多的时候，面板打开的动画过程中贴图全部消失，动画结束才跳出来。
// 解决：主题加载或切换后，空闲时把样式表里引用的图片先解码一遍。
const decoded = new Map(); // url → HTMLImageElement（保留引用，避免被回收）
const MAX_IMAGES = 200;
let scanTimer = 0;

function collectUrls() {
    const urls = new Set();
    for (const style of document.querySelectorAll('style, custom-style')) {
        const text = style.textContent;
        if (!text || !text.includes('url(')) continue;
        for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
            const u = m[2].trim();
            if (!u || u.startsWith('#') || /\.(woff2?|ttf|otf|eot|svg#)/i.test(u)) continue;
            urls.add(u);
            if (urls.size >= MAX_IMAGES) return urls;
        }
    }
    return urls;
}

function decodeAll() {
    const urls = collectUrls();
    for (const u of decoded.keys()) if (!urls.has(u)) decoded.delete(u);
    const todo = [...urls].filter(u => !decoded.has(u));
    // 一次只解码几张，分批放在空闲时间里，不和用户操作抢主线程
    const step = () => {
        const batch = todo.splice(0, 4);
        for (const u of batch) {
            const img = new Image();
            img.decoding = 'async';
            img.src = u;
            decoded.set(u, img);
            img.decode().catch(() => { });
        }
        if (todo.length) idle(step);
    };
    if (todo.length) idle(step);
}

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));

export function installPredecode() {
    const schedule = () => { bumpThemeGen(); clearTimeout(scanTimer); scanTimer = setTimeout(decodeAll, 800); };
    // 主题的 custom_css、美化脚本注入的 <style> 都在 head 里；#custom-style 换主题时内容会整体替换
    // 插件自己的变量表 #me-vars 每次调设置都会改，不算换主题
    const own = (n) => n && (n.id === 'me-vars' || n.parentNode?.id === 'me-vars');
    new MutationObserver((records) => {
        if (records.every(r => own(r.target) || [...r.addedNodes].every(own) && r.removedNodes.length === 0)) return;
        schedule();
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
    schedule();
}

// ---------- 固定背景 ----------
// 美化常给面板写 background-attachment: fixed。面板一旦有位移或缩放，固定背景会跟着动，结束时再跳回原位。
// 这类面板改用不移动背景的动法（裁剪展开、淡入淡出）。
const fixedCache = new WeakMap();
let themeGen = 0;
export function bumpThemeGen() { themeGen++; }
export const themeGeneration = () => themeGen;

export function hasFixedBackground(el) {
    const hit = fixedCache.get(el);
    if (hit && hit.gen === themeGen) return hit.v;
    const v = getComputedStyle(el).backgroundAttachment.includes('fixed');
    fixedCache.set(el, { gen: themeGen, v });
    return v;
}

// ---------- 透明度被 !important 锁住 ----------
// 美化里的 opacity: x !important 会压过动画（层叠顺序里重要声明高于动画）。
// 播放淡入后检查第一帧，没生效就改用 filter: opacity() 做同样的事。
export function opacityLocked(el, expected) {
    const now = parseFloat(getComputedStyle(el).opacity);
    return Math.abs(now - expected) > 0.05;
}

// ---------- 减少动效 ----------
// 酒馆在系统要求减少动画时会强制打开自己的「减少动态效果」，而且会把这个值存进设置，
// 之后在其他设备上打开也显示为已开启，分不清是用户自己选的还是被系统强制的。
// 所以插件只看自己的开关：默认照常播放；开启「跟随系统和酒馆」后，两者任一要求减少动效就只做短暂淡入淡出。
export function systemReduced() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shouldReduce(settings, powerUser) {
    if (!settings?.followSystemReduced) return false;
    return systemReduced() || !!powerUser?.reduced_motion;
}

// ---------- 能力检测 ----------
export const supports = {
    linear: CSS.supports('transition-timing-function', 'linear(0, 1)'),
    individualTransform: CSS.supports('translate', '1px 1px'),
    contentVisibility: CSS.supports('content-visibility', 'hidden'),
};
