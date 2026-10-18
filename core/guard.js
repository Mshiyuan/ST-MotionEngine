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

/** 已加载图片的原始尺寸（按绝对地址查询）。尚未加载的图片在此开始加载，下次查询时可用 */
export function imageSize(absUrl) {
    for (const img of decoded.values()) {
        if (img.src === absUrl) return img.complete && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    const img = new Image();
    img.src = absUrl;
    decoded.set(absUrl, img);
    return img.complete && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null;
}

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

// ---------- 底色与文字对比度 ----------
// 插件的浮层（页内选择列表、设置面板的选中块）用主题的模糊底色 SmartThemeBlurTintColor 作底。
// 有的美化把这个颜色设成与文字同色（例如白字配不透明白底，面板背景由美化自己画成黑色），浮层上的字就看不见了。
// 这里比较两者的对比度，不足 3:1 时在 <html> 上写与文字反差足够的 --me-surface，以及与底色反差足够的文字颜色 --me-on-tint；
// 对比度足够时不写，沿用主题颜色。
function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
}
const lum = ({ r, g, b }) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };

/** 把任意 CSS 颜色值换算成 rgb() 形式 */
function resolveColor(value) {
    const probe = document.createElement('i');
    probe.style.color = value;
    probe.style.display = 'none';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return parseColor(c);
}

let surfaceKey = '';
export function updateSurface() {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const tintRaw = cs.getPropertyValue('--SmartThemeBlurTintColor').trim();
    const textRaw = cs.getPropertyValue('--SmartThemeBodyColor').trim();
    const key = tintRaw + '|' + textRaw;
    if (key === surfaceKey) return;
    surfaceKey = key;
    const tint = tintRaw && resolveColor(tintRaw);
    const text = textRaw && resolveColor(textRaw);
    if (!tint || !text) return;
    // 页内列表叠三层底色，按叠加后的不透明度判断
    const ok = 1 - (1 - tint.a) ** 3 >= 0.5 && contrast(tint, text) >= 3;
    if (ok) {
        root.style.removeProperty('--me-surface');
        root.style.removeProperty('--me-on-tint');
    } else {
        root.style.setProperty('--me-surface', lum(text) > 0.4 ? 'rgba(30, 30, 32, 0.97)' : 'rgba(248, 248, 250, 0.97)');
        // 直接画在主题底色上的文字（例如酒馆弹窗里的快捷面板）改用与底色反差足够的颜色
        root.style.setProperty('--me-on-tint', lum(tint) > 0.4 ? '#1e1e20' : '#f4f4f6');
    }
}

export function installSurface() {
    updateSurface();
    // 酒馆调整主题颜色时写在 <html> 的 style 上；换主题时 head 里的样式会变
    let pending = 0;
    const later = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; updateSurface(); }); };
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(later).observe(document.head, { childList: true, subtree: true, characterData: true });
}

// ---------- 固定背景 ----------
// 美化常给面板设置 background-attachment: fixed。面板位移或缩放时固定背景随之移动，结束时回到原位。
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

// ---------- 图标上的附属装饰 ----------
// 美化常用图标的 ::after 画下划线、角标，并以外层（顶栏）为参照绝对定位。插件一旦给图标本身加缩放，
// 图标就成了这些装饰的定位参照，下划线会跳到图标中间，动画结束才回去。
// 这种情况只动图标的图形（字体图标的 ::before）；图形本身也动不了就不动。
const isOff = (v) => !v || v === 'none' || v === 'normal';
const floating = (pos) => pos === 'absolute' || pos === 'fixed';

/**
 * 给元素加缩放、位移时该动谁
 * @returns {{ pseudo?: string } | null} {} 动元素本身；{ pseudo: '::before' } 只动图形；null 不动
 */
export function transformTarget(el) {
    const cs = getComputedStyle(el);
    // 元素本来就是定位参照（有定位或 transform），加缩放不改变装饰的参照
    if (cs.position !== 'static' || cs.transform !== 'none') return {};
    let anchored = false;
    for (const p of ['::after', '::before']) {
        const ps = getComputedStyle(el, p);
        if (!isOff(ps.content) && floating(ps.position)) anchored = true;
    }
    if (!anchored) for (const c of el.children) if (floating(getComputedStyle(c).position)) { anchored = true; break; }
    if (!anchored) return {};
    const before = getComputedStyle(el, '::before');
    if (!isOff(before.content) && !floating(before.position)) return { pseudo: '::before' };
    return null;
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
