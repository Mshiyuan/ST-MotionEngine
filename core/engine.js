// 统一的 WAAPI 播放器。只动 opacity / translate / scale / rotate / filter，全部在合成线程执行。
import { themeGeneration, transformTarget } from './guard.js';
import { spring } from './tokens.js';

export const state = {
    on: false,
    /** 是否按「减少动效」处理（见 guard.shouldReduce） */
    reduced: false,
    feel: null,
    vars: {},
    /** 开了「分模块设置」时，每个模块自己的变量（见 settings.apply） */
    varsBy: {},
    settings: null,
    /** @type {Set<string>} */
    modules: new Set(),
};

/** 模块是否生效：总开关和模块开关都开着 */
export function active(mod) {
    return state.on && state.modules.has(mod);
}

/** 读取当前变量里的时长（毫秒）。mod 给出时优先用该模块自己的变量 */
export function dur(name, mod) {
    return parseFloat(((mod && state.varsBy[mod]) || state.vars)[name]) || 0;
}

export function v(name, mod) {
    return ((mod && state.varsBy[mod]) || state.vars)[name];
}

/** 给模块用的变量读取函数：const { dur, v } = scoped('toasts') */
export function scoped(mod) {
    return { dur: (name) => dur(name, mod), v: (name) => v(name, mod) };
}

/** 模块的幅度系数（分模块设置时取模块自己的值） */
export function ampOf(mod) {
    const s = state.settings;
    if (!s) return 1;
    return s.perModule && s.tune?.[mod] ? s.tune[mod].amp : s.amp;
}

/** 模块的速度系数 */
export function speedOf(mod) {
    const s = state.settings;
    if (!s) return 1;
    return s.perModule && s.tune?.[mod] ? s.tune[mod].speed : s.speed;
}

/**
 * 强度随面积变化：面积越小效果越强，越大越弱。
 * 面积不到屏幕 2%（按钮一类）为 1，超过 60%（整屏面板）为 0.45，中间按对数过渡。
 * 设置为「统一」时一律为 1（分模块设置时同样生效，与各模块的幅度叠加）。
 */
// 窗口大小：读 innerWidth / innerHeight 会强制排版（播放动画时往往刚写过样式），这里缓存起来，尺寸变化时更新
let vw = innerWidth, vh = innerHeight;
addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; }, { passive: true });
/** 窗口宽度（缓存，不触发排版） */
export const viewW = () => vw;
/** 窗口高度（缓存，不触发排版） */
export const viewH = () => vh;

export function areaFactor(w, h) {
    const s = state.settings;
    if (!s || s.panelBounce === 'uniform') return 1;
    const a = Math.min(1, (w * h) / Math.max(1, vw * vh));
    if (a <= 0.02) return 1;
    if (a >= 0.6) return 0.45;
    return +(1 - 0.55 * (Math.log(a / 0.02) / Math.log(30))).toFixed(3);
}

/** 缩放值按系数 m 向 1 收敛，支持 "sx sy" 两个值 */
export function scaleToward(s, m) {
    return String(s).split(/\s+/).map(x => +(1 - (1 - Number(x)) * m).toFixed(3)).join(' ');
}

const springCache = new Map();
function cachedSpring(k, c) {
    const key = `${k}/${c.toFixed(1)}`;
    if (!springCache.has(key)) springCache.set(key, spring(k, c));
    return springCache.get(key);
}

/**
 * 大块元素（消息、列表项、欢迎页条目）的进场参数。面板（core/forms.js）用同一个面积系数，
 * 面积相近的消息和面板，形变和晃动程度一致：
 *   位移 × 面积系数 af；缩放的偏离量 × af²（整屏约为小部件的 1/5，与面板的压扁程度相当）；
 *   弹簧风格按面积加大阻尼（整屏约为 1.9 倍），晃动次数随面积减少；非弹簧风格在面积较大时改用面板曲线。
 * @returns {{ af: number, y: string, s: string, ease: string, D: number }}
 */
export function sized(mod, w, h) {
    const af = areaFactor(w, h);
    let ease = v('--me-in', mod);
    let D = dur('--me-in-dur', mod);
    const f = state.feel;
    if (af < 1 && f && !state.reduced) {
        if (f.spring) {
            const sp = cachedSpring(f.spring[0], f.spring[1] * (1 + (1 - af) * 1.6));
            ease = sp.easing;
            D = Math.min(sp.duration, 1500) / speedOf(mod);
        } else if (af < 0.75 && f.panel?.in) ease = v('--me-p-in', mod);
    }
    return { af, y: `calc(${v('--me-y', mod)} * ${af})`, s: scaleToward(v('--me-s', mod), af * af), ease, D };
}

/**
 * 风格附带的额外姿态：起始旋转（摆动悬挂）和变形基点（自定义风格的「变形基点」）。
 * 返回要并入位移 / 缩放轨道首尾关键帧的属性 { a: 起点, b: 终点 }；旋转角按模块幅度和系数 m 缩放。
 */
export function poseExtras(mod, m = 1) {
    const f = state.feel;
    const a = {}, b = {};
    if (!f || state.reduced) return { a, b };
    if (f.rot) { a.rotate = `${+(f.rot * m * Math.min(ampOf(mod), 5)).toFixed(2)}deg`; b.rotate = '0deg'; }
    const origin = f.origin === 'top' || f.rot ? '50% 0' : f.origin === 'bottom' ? '50% 100%' : null;
    if (origin) { a.transformOrigin = origin; b.transformOrigin = origin; }
    return { a, b };
}

const running = new WeakMap();

// ---------- 画完之后统一读、统一写 ----------
// 打开面板时，几个模块都要等那一帧画完再读尺寸（例如面板本身、里面的列表）。各自在两次 rAF 后读，
// 前一个读完接着写样式，后一个再读就要重新排版一遍（大面板几十到上百毫秒）。
// 这里共用一个 rAF 循环：到期的回调先全部读，再全部写，同一帧只排版一次。
let frameNo = 0;
let ticking = false;
const queue = [];
function tick() {
    frameNo++;
    const due = queue.filter(q => q.at <= frameNo);
    if (due.length) {
        for (const q of due) queue.splice(queue.indexOf(q), 1);
        const vals = due.map(q => { try { return q.read(); } catch (e) { console.debug('[MotionEngine] read failed', e); return undefined; } });
        due.forEach((q, i) => { try { q.write(vals[i]); } catch (e) { console.debug('[MotionEngine] write failed', e); } });
    }
    if (queue.length) requestAnimationFrame(tick); else ticking = false;
}
/** 等当前这一帧画完（两次 rAF）后执行：read 只读不写，write 拿到 read 的结果再写 */
export function afterPaint(read, write) {
    queue.push({ at: frameNo + 2, read, write });
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
}

/**
 * 在元素上播放一组动画，并取消该元素上之前由本插件播放的动画。
 * @param {Element} el
 * @param {string} group 组名。同一组的动画被打断时，新动画从当前画面继续，例如面板的打开打断关闭
 * @param {Array<[Keyframe[], KeyframeAnimationOptions]>} tracks 每条轨道可以有不同的曲线和时长
 * @param {{ keep?: boolean, defer?: boolean, own?: boolean }} [opt]
 *   keep=true：播完停在最后一帧（按住不放时用），直到下一次 play 或 stop
 *   defer=true：先停在第一帧，等下一帧画出来再开始。用于打开大面板：打开那一帧的排版常要几百毫秒，
 *               动画如果同时开始，这段时间会计入动画进度，画面第一次出现时动画已接近结束
 *   own=true：插件自己的界面（设置面板），主题不会锁它的透明度，跳过检查（检查要读计算样式，连续播放多个时很慢）
 * @returns {Promise<boolean>} 正常播完为 true，被打断为 false
 */
export function play(el, group, tracks, { keep = false, defer = false, own = false } = {}) {
    let map = running.get(el);
    if (!map) { map = new Map(); running.set(el, map); }
    if (map.has(group)) {
        // 同组打断：从当前画面继续，不回到起点。不同组的动画（例如按压之后的图标点击动作）从各自的起点开始
        const cs = getComputedStyle(el);
        for (const [kf, opt] of tracks) {
            if (opt?.pseudoElement) continue;
            const first = kf[0];
            for (const p of Object.keys(first)) {
                if (p === 'offset' || p === 'easing' || p === 'transformOrigin') continue;
                const val = cs[p];
                if (val !== undefined && val !== '') first[p] = val;
            }
        }
    }
    for (const [g, anims] of map) {
        anims.forEach(a => a.cancel());
        map.delete(g);
    }
    const anims = [];
    for (const [kf, opt] of tracks) {
        try {
            anims.push(el.animate(kf, { fill: 'both', ...opt }));
        } catch (e) {
            console.debug('[MotionEngine] animate failed', e);
        }
    }
    if (!own) fixLockedOpacity(el, tracks, anims);
    map.set(group, anims);
    if (!anims.length) return Promise.resolve(true);
    if (defer) {
        anims.forEach(a => a.pause());
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (map.get(group) === anims) anims.forEach(a => a.playState === 'paused' && a.play());
        }));
    }
    return Promise.all(anims.map(a => a.finished)).then(() => {
        if (!keep && map.get(group) === anims) {
            map.delete(group);
            anims.forEach(a => a.cancel());
        }
        return true;
    }, () => false);
}

/**
 * 美化用 opacity: x !important 锁住透明度时，动画里的 opacity 不生效（重要声明的优先级高于动画）。
 * 这时把透明度轨道换成 filter: opacity()，效果相同。
 */
const lockCache = new WeakMap(); // el → { gen, locked }：每个元素每套主题只检查一次，避免每次播放都强制计算样式
// 同一种元素（标签、id、class 相同）结果相同：一批列表项只在第一项计算一次样式，后面的直接用
const lockByKind = new Map(); // key → { gen, locked }
function fixLockedOpacity(el, tracks, anims) {
    const i = tracks.findIndex(([kf]) => 'opacity' in kf[0] && !tracks.some(([k]) => 'filter' in k[0]));
    if (i < 0 || !anims[i]) return;
    const gen = themeGeneration();
    let hit = lockCache.get(el);
    const kind = `${el.tagName}#${el.id}.${el.getAttribute('class') || ''}`;
    if (!hit || hit.gen !== gen) {
        const k = lockByKind.get(kind);
        if (k && k.gen === gen) hit = k;
        else {
            const want = Number(tracks[i][0][0].opacity);
            hit = { gen, locked: Math.abs(parseFloat(getComputedStyle(el).opacity) - want) > 0.05 };
            if (lockByKind.size > 500) lockByKind.clear();
            lockByKind.set(kind, hit);
        }
        lockCache.set(el, hit);
    }
    if (!hit.locked) return;
    anims[i].cancel();
    const kf = tracks[i][0].map(f => ({ ...(f.offset !== undefined && { offset: f.offset }), filter: `opacity(${f.opacity})` }));
    try { anims[i] = el.animate(kf, { fill: 'both', ...tracks[i][1] }); } catch { anims.splice(i, 1); }
}

/**
 * 和 play 一样，但会避免把图标的下划线等装饰挤到图标中间（见 guard.transformTarget）：
 * 有以外层为参照定位的装饰时只动图标的图形（::before），图形也动不了就不动。
 *
 * 装饰可能在动画开始之后才出现：酒馆在点击处理里才给图标加 openIcon（切换面板时还要再等 125ms），
 * 美化的下划线随 openIcon 出现。所以给图标本身做动画期间监视它的 class 和 style，
 * 出现这类装饰时，在下一次绘制之前把剩余的动画移到图形上（见 watchDecorations）。
 */
export function playTransform(el, group, tracks, opt = {}) {
    const tgt = transformTarget(el);
    if (!tgt) { stop(el); return Promise.resolve(false); }
    if (tgt.pseudo) return playOnGlyph(el, group, tracks, opt, tgt.pseudo);
    // 上一次只动图形的动画被打断时（例如关闭面板后很快又点开），me-glyph 标记会留下来；
    // 留着的话下面的监视会以为已经在动图形而不再处理，图标本身被缩放，下划线跑到图标中间。改动元素本身前先清掉
    el.classList.remove('me-glyph');
    const p = play(el, group, tracks, opt);
    const cs = getComputedStyle(el);
    // 元素本身已是定位参照时，加缩放不会改变装饰的参照，无需监视
    if (cs.position === 'static' && cs.transform === 'none') watchDecorations(el, group, tracks, opt);
    return p;
}

function playOnGlyph(el, group, tracks, opt, pseudo, at = 0) {
    // 行内的伪元素不能变形，动画期间改成 inline-block（见 css/components.css）
    el.classList.add('me-glyph');
    stop(el); // 元素本身可能仍保留之前的缩放
    const t = tracks.map(([kf, o]) => [kf, { ...o, pseudoElement: pseudo }]);
    const p = play(el, group, t, opt);
    if (at > 0) running.get(el)?.get(group)?.forEach(a => { a.currentTime = at; });
    return p.then(ok => {
        if (ok && !opt.keep) el.classList.remove('me-glyph');
        return ok;
    });
}

const watching = new WeakMap(); // el → MutationObserver

function watchDecorations(el, group, tracks, opt) {
    watching.get(el)?.disconnect();
    // 检查放在 rAF 回调里：rAF 在本帧计算样式和绘制之前执行，改动在第一次绘制时即生效，不会出现错误的画面；
    // 若在 MutationObserver 回调里直接读样式，会迫使浏览器提前算整页样式（打开大面板时上百毫秒），之后还要再算一遍
    let pending = 0;
    const mo = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; check(); }); });
    const check = () => {
        if (watching.get(el) !== mo) return;
        const anims = running.get(el)?.get(group);
        if (!anims || el.classList.contains('me-glyph')) { mo.disconnect(); watching.delete(el); return; }
        const tgt = transformTarget(el);
        if (tgt && !tgt.pseudo) return; // 仍可以动元素本身
        mo.disconnect();
        watching.delete(el);
        if (!tgt) { stop(el); return; }
        const at = Math.max(0, ...anims.map(a => Number(a.currentTime) || 0));
        playOnGlyph(el, group, tracks, opt, tgt.pseudo, at);
    };
    mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    watching.set(el, mo);
    // 动画结束后不再监视
    const anims = running.get(el)?.get(group) || [];
    Promise.all(anims.map(a => a.finished)).finally(() => {
        if (watching.get(el) === mo && !running.get(el)?.has(group)) { mo.disconnect(); watching.delete(el); }
    }).catch(() => { });
}

/** 取消元素上本插件的所有动画 */
export function stop(el) {
    const map = running.get(el);
    if (!map) return;
    for (const anims of map.values()) anims.forEach(a => a.cancel());
    map.clear();
}

/** 把某个元素上某一组的动画直接播到结尾（用户开始操作时，动画让位给手指） */
export function finishGroup(el, group) {
    running.get(el)?.get(group)?.forEach(a => { try { a.finish(); } catch { /* 无限循环的动画不能 finish */ } });
}

/** 结束某个元素上某一组的动画 */
export function stopGroup(el, group) {
    const map = running.get(el);
    const anims = map?.get(group);
    if (!anims) return;
    anims.forEach(a => a.cancel());
    map.delete(group);
}

export function isRunning(el, group) {
    return !!running.get(el)?.has(group);
}

/** 一帧之后执行（等浏览器先算完样式） */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
