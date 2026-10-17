// 固定背景的临时换算
// 美化常给面板写 background-attachment: fixed：背景以整个屏幕为参照，而不是以面板为参照。
// 面板一移动或缩放，浏览器会改为以面板为参照画背景，画面跳一下；动画结束再跳回来。
// 做法：动画开始前，把固定背景换成「以面板为参照、但位置和大小算得和原来完全一样」的普通背景，
// 静止时看起来没有任何区别，动画期间背景跟着面板一起动；动画结束再换回固定背景。
// 算不出来的情况（图片尺寸未知、面板本身有 transform 等）返回 null，调用方改为只淡入淡出。
import { imageSize } from './guard.js';

/** 按顶层逗号拆分（渐变里的逗号不拆） */
function layers(value) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of value) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** 取第 i 层，列表比层数短时循环使用（与浏览器规则一致） */
const at = (list, i) => list[i % list.length];

/** 解析 "50%"、"10px"、"calc(50% - 10px)" 这类长度：返回 { p: 百分比, q: 像素 } */
function lengthParts(v) {
    let p = 0, q = 0;
    const s = v.replace(/^calc\(/, '').replace(/\)$/, '');
    for (const m of s.matchAll(/([+-])?\s*(\d*\.?\d+)(%|px)/g)) {
        const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
        if (m[3] === '%') p += n; else q += n;
    }
    return { p, q };
}

/** 计算一层背景在给定区域里的绘制尺寸 */
function layerSize(size, natural, W, H) {
    const iw = natural?.w ?? W, ih = natural?.h ?? H;
    if (size === 'cover' || size === 'contain') {
        if (!natural) return { w: W, h: H };
        const k = size === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
        return { w: iw * k, h: ih * k };
    }
    const [sx = 'auto', sy = 'auto'] = size.split(/\s+(?![^(]*\))/);
    const len = (v, ref) => { const { p, q } = lengthParts(v); return ref * p / 100 + q; };
    let w = sx === 'auto' ? null : len(sx, W);
    let h = sy === 'auto' ? null : len(sy, H);
    if (w === null && h === null) return natural ? { w: iw, h: ih } : { w: W, h: H };
    if (w === null) w = natural ? h * iw / ih : W;
    if (h === null) h = natural ? w * ih / iw : H;
    return { w, h };
}

/** 祖先里有没有会让固定背景失去「固定」的属性（transform、perspective） */
function ancestorTransformed(el) {
    for (let e = el.parentElement; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (c.transform !== 'none' || c.perspective !== 'none') return true;
    }
    return false;
}

/**
 * 把元素的固定背景换成等效的普通背景。
 * @param {HTMLElement} el
 * @returns {(() => void) | null} 还原函数；无法换算时返回 null
 */
export function unfixBackground(el) {
    const cs = getComputedStyle(el);
    const att = layers(cs.backgroundAttachment);
    if (!att.includes('fixed')) return null;

    // 酒馆给 <html> 写了 transform: translateZ(0)（修 Chrome 毛玻璃闪烁）。祖先有 transform 时，
    // 浏览器已经把固定背景当普通背景画了（实测像素完全一致），直接改成 scroll 就是等效的
    if (cs.transform !== 'none' || ancestorTransformed(el)) {
        const prev = [el.style.getPropertyValue('background-attachment'), el.style.getPropertyPriority('background-attachment')];
        el.style.setProperty('background-attachment', att.map(a => (a === 'fixed' ? 'scroll' : a)).join(', '), 'important');
        return () => { if (prev[0]) el.style.setProperty('background-attachment', prev[0], prev[1]); else el.style.removeProperty('background-attachment'); };
    }

    const imgs = layers(cs.backgroundImage);
    const sizes = layers(cs.backgroundSize);
    const px = layers(cs.backgroundPositionX), py = layers(cs.backgroundPositionY);
    const origins = layers(cs.backgroundOrigin);
    const r = el.getBoundingClientRect();
    // 固定背景的参照区域是视口
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
    const bl = parseFloat(cs.borderLeftWidth) || 0, bt = parseFloat(cs.borderTopWidth) || 0;
    const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;

    const newSize = [], newPos = [], newAtt = [];
    for (let i = 0; i < imgs.length; i++) {
        const a = at(att, i);
        if (a !== 'fixed' || imgs[i] === 'none') {
            newSize.push(at(sizes, i)); newPos.push(`${at(px, i)} ${at(py, i)}`); newAtt.push(a);
            continue;
        }
        let natural = null;
        const url = imgs[i].match(/^url\(\s*["']?(.*?)["']?\s*\)$/);
        if (url) {
            natural = imageSize(new URL(url[1], document.baseURI).href);
            if (!natural) return null; // 图片还没加载，量不出尺寸
        } else if (!/gradient\(/.test(imgs[i])) return null;
        const { w, h } = layerSize(at(sizes, i), natural, W, H);
        const X = lengthParts(at(px, i)), Y = lengthParts(at(py, i));
        // 原来相对视口的位置
        const vx = (W - w) * X.p / 100 + X.q, vy = (H - h) * Y.p / 100 + Y.q;
        // 换成相对元素背景区域左上角
        const o = at(origins, i);
        const ox = r.left + (o === 'border-box' ? 0 : bl + (o === 'content-box' ? pl : 0));
        const oy = r.top + (o === 'border-box' ? 0 : bt + (o === 'content-box' ? pt : 0));
        newSize.push(`${w.toFixed(2)}px ${h.toFixed(2)}px`);
        newPos.push(`${(vx - ox).toFixed(2)}px ${(vy - oy).toFixed(2)}px`);
        newAtt.push('scroll');
    }

    const saved = ['background-attachment', 'background-size', 'background-position'].map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
    // 用 !important 的行内样式，才能盖过美化里带 !important 的写法
    el.style.setProperty('background-attachment', newAtt.join(', '), 'important');
    el.style.setProperty('background-size', newSize.join(', '), 'important');
    el.style.setProperty('background-position', newPos.join(', '), 'important');
    return () => {
        for (const [p, v, pr] of saved) {
            if (v) el.style.setProperty(p, v, pr); else el.style.removeProperty(p);
        }
    };
}
