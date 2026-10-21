// 设置面板自己的展开 / 收起（作用范围、分类、分模块设置等）。
// 酒馆 toggle-dependent.css 里有「:has() 里按内联样式匹配」的规则，页面上任何内联样式变化都要大范围重算样式；
// 逐帧改高度时，每一帧都要重算样式、重新排版，扩展面板里明显卡顿。这里改为只排版一次：
//   1. 改动前量好位置；2. 改成最终状态，再量一次；
//   3. 后面的内容从旧位置滑到新位置（translate），新出现的块从上往下揭开（clip-path）并淡入，
//      消失的块留在原处（绝对定位，不占位置）收起并淡出；有背景的外框（卡片）用裁剪跟着伸缩，
//      外框变小时用 padding-bottom + 负 margin-bottom 暂时保持原来的大小，但不占位置。
// 之后每一帧只有位移、裁剪和透明度的变化，不再重排。
// 屏幕外的部分不做动画：很长的内容收起时，看得见的那一段按正常速度收起。
import { state } from '../core/engine.js';

/** 正在播放的一次过渡：再次触发时先结束它（新的过渡从当前画面开始） */
let current = null;

const simple = () => state.reduced || !!state.settings?.lite;

const shown = (el) => !el.dataset.meGhost && el.getClientRects().length > 0;

/** 有可见外框（背景或边框）的元素 */
function hasBox(cs) {
    const bg = cs.backgroundColor;
    const clear = !bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg);
    return !clear || parseFloat(cs.borderBottomWidth) > 0;
}

/**
 * @param {Array<[HTMLElement, boolean]>} list 显示与否由 class 决定的块，以及改动后是否显示
 * @param {() => void} mutate 改成最终状态（改 class 等）
 * @param {{ root: Element, scope: Element, inDur: number, outDur: number, inEase: string, outEase: string, fade: string }} opt
 *   root：滚动容器（后面的内容一直找到这里）；scope：只给这里面的卡片做外框裁剪。
 *   有新出现的块时按展开的时长和曲线，否则按收起的
 */
export function morph(list, mutate, { root, scope, inDur, outDur, inEase, outEase, fade }) {
    const changes = list.filter(([el, open]) => el && shown(el) !== open);
    const opening = changes.some(c => c[1]);
    const dur = opening ? inDur : outDur, ease = opening ? inEase : outEase;
    if (simple() || !changes.length || !dur) {
        current?.finish();
        mutate();
        return;
    }
    const vh = innerHeight; // 读 innerHeight 也会强制排版，只在改动之前读
    const els = changes.map(c => c[0]);
    const leaving = changes.filter(c => !c[1]).map(c => c[0]);
    const entering = changes.filter(c => c[1]).map(c => c[0]);

    // 后面的内容：每个变化的块，沿父级一直到 root，每一层排在它后面的兄弟元素
    const chain = new Set();
    const movers = new Set();
    for (const el of els) {
        for (let n = el; n && n !== root && n.parentElement; n = n.parentElement) {
            chain.add(n);
            for (let sib = n.nextElementSibling; sib; sib = sib.nextElementSibling) movers.add(sib);
        }
    }
    for (const el of els) movers.delete(el);
    const boxes = [...chain].filter(n => !els.includes(n) && scope.contains(n) && n !== scope && hasBox(getComputedStyle(n)));

    // 1. 改动前（含上一次过渡的当前画面）
    const B = new Map();
    for (const n of [...movers, ...boxes, ...leaving]) B.set(n, n.getBoundingClientRect());
    const boxCss = new Map(boxes.map(b => {
        const cs = getComputedStyle(b);
        return [b, { pb: parseFloat(cs.paddingBottom), mb: parseFloat(cs.marginBottom), r: `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}` }];
    }));
    const ghostAt = new Map(leaving.map(el => {
        const p = el.parentElement;
        const pr = p.getBoundingClientRect();
        const r = B.get(el);
        return [el, { top: r.top - pr.top - p.clientTop, left: r.left - pr.left - p.clientLeft, w: r.width, h: r.height, staticParent: getComputedStyle(p).position === 'static' }];
    }));

    current?.finish();
    mutate();

    // 2. 消失的块变成原处的「影子」：绝对定位、不占位置
    const restore = [];
    const saveStyle = (el) => { const css = el.style.cssText; restore.push(() => { el.style.cssText = css; }); };
    for (const el of leaving) {
        const g = ghostAt.get(el);
        const p = el.parentElement;
        if (g.staticParent) { saveStyle(p); p.style.position = 'relative'; }
        saveStyle(el);
        el.dataset.meGhost = '1';
        restore.push(() => { delete el.dataset.meGhost; });
        Object.assign(el.style, { display: 'block', position: 'absolute', top: `${g.top}px`, left: `${g.left}px`, width: `${g.w}px`, height: `${g.h}px`, margin: '0', boxSizing: 'border-box', pointerEvents: 'none', overflow: 'hidden' });
    }

    // 3. 改动后（一次排版）
    const A = new Map();
    for (const n of [...movers, ...boxes, ...entering]) A.set(n, n.getBoundingClientRect());

    const anims = [];
    const go = (el, kf, o = {}) => { try { anims.push(el.animate(kf, { duration: dur, easing: ease, ...o })); } catch { /* 不支持的属性 */ } };
    const px = (n) => `${Math.round(n * 10) / 10}px`;

    // 外框：变小时先保持原来的大小（不占位置），裁剪从旧底边收到新底边
    for (const b of boxes) {
        const hb = B.get(b).height, ha = A.get(b).height;
        if (Math.abs(hb - ha) < 0.5) continue;
        const c = boxCss.get(b);
        const H = Math.max(hb, ha);
        if (ha < hb) {
            saveStyle(b);
            b.style.paddingBottom = px(c.pb + hb - ha);
            b.style.marginBottom = px(c.mb - (hb - ha));
        }
        // 屏幕下方的部分不用动
        const limit = Math.max(0, vh - A.get(b).top);
        const e0 = Math.min(hb, Math.max(ha, limit)), e1 = Math.min(ha, Math.max(hb, limit));
        if (Math.abs(e0 - e1) < 0.5) continue;
        go(b, [{ clipPath: `inset(0 0 ${px(H - e0)} 0 round ${c.r})` }, { clipPath: `inset(0 0 ${px(H - e1)} 0 round ${c.r})` }]);
    }

    // 后面的内容：从旧位置滑到新位置。位移按最近一个也在移动的父级计算，避免叠加
    const parentMover = (m) => { for (let p = m.parentElement; p && p !== root; p = p.parentElement) if (movers.has(p)) return p; return null; };
    for (const m of movers) {
        const b = B.get(m), a = A.get(m);
        if (!b || !a || (!b.height && !a.height)) continue;
        const pm = parentMover(m);
        let dy;
        if (pm) dy = (b.top - B.get(pm).top) - (a.top - A.get(pm).top);
        else {
            if (b.top >= vh && a.top >= vh) continue;
            dy = b.top - a.top;
            // 从屏幕下方移上来的，从屏幕底边开始；移出屏幕的，到底边为止
            if (dy > 0 && b.top > vh) dy = vh - a.top;
            if (dy < 0 && a.top > vh) { go(m, [{ translate: `0 ${px(dy)}` }, { translate: `0 ${px(vh - a.top)}` }], { fill: 'forwards' }); continue; }
        }
        if (Math.abs(dy) < 0.5) continue;
        go(m, [{ translate: `0 ${px(dy)}` }, { translate: '0 0' }]);
    }

    // 新出现的：从上往下揭开（只揭开屏幕里的部分）。内容跟着裁剪边缘一起出现：
    // 外框的背景和裁剪同步伸开，内容若从全透明慢慢淡入，前几帧只看见一块空的底色（闪白），所以淡入很短、且不从 0 开始
    for (const el of entering) {
        const a = A.get(el);
        if (!a.height || a.top >= vh) continue;
        const end = Math.max(0, a.height - Math.max(0, vh - a.top));
        go(el, [{ clipPath: `inset(0 0 ${px(a.height)} 0)` }, { clipPath: `inset(0 0 ${px(end)} 0)` }], { fill: 'forwards' });
        go(el, [{ opacity: 0.7 }, { opacity: 1 }], { duration: dur * 0.25, easing: fade });
    }

    // 消失的：原处收起（只收屏幕里的部分）。内容保持可见，随裁剪一起卷起，最后一段才淡出；
    // 提前淡出的话，外框还在收，中间会露出一大块空的底色
    for (const el of leaving) {
        const g = ghostAt.get(el), b = B.get(el);
        if (b.top >= vh) continue;
        const start = Math.max(0, g.h - Math.max(0, vh - b.top));
        go(el, [{ clipPath: `inset(0 0 ${px(start)} 0)` }, { clipPath: `inset(0 0 ${px(g.h)} 0)` }], { fill: 'forwards' });
        go(el, [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { easing: 'linear', fill: 'forwards' });
    }

    let done = false;
    const me = {
        finish() {
            if (done) return;
            done = true;
            anims.forEach(x => x.cancel());
            for (let i = restore.length - 1; i >= 0; i--) restore[i]();
            if (current === me) current = null;
        },
    };
    current = me;
    if (!anims.length) { me.finish(); return; }
    Promise.all(anims.map(x => x.finished)).then(() => me.finish(), () => { /* 被取消 */ });
}
