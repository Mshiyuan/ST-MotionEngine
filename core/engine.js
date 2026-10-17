// 统一的 WAAPI 播放器。只动 opacity / translate / scale / filter，全部在合成线程执行。
import { themeGeneration, transformTarget } from './guard.js';

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

/** 模块是否生效：总开关、模块开关都开着，且 jQuery 动画没有被酒馆的「减少动效」关掉 */
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

/**
 * 强度随面积变化：越小的东西效果越强，越大越弱。
 * 面积不到屏幕 2%（按钮这类）为 1，超过 60%（整屏面板）为 0.45，中间按对数过渡。
 * 设置为「统一」或开了分模块设置时一律为 1。
 */
export function areaFactor(w, h) {
    const s = state.settings;
    if (!s || s.panelBounce === 'uniform' || s.perModule) return 1;
    const a = Math.min(1, (w * h) / Math.max(1, innerWidth * innerHeight));
    if (a <= 0.02) return 1;
    if (a >= 0.6) return 0.45;
    return +(1 - 0.55 * (Math.log(a / 0.02) / Math.log(30))).toFixed(3);
}

const running = new WeakMap();

/**
 * 在元素上播放一组动画，并取消该元素上一次由本插件播放的同组动画。
 * @param {Element} el
 * @param {string} group 同组的动画会互相打断，例如 'enter' 打断 'exit'
 * @param {Array<[Keyframe[], KeyframeAnimationOptions]>} tracks 每条轨道可以有不同的曲线和时长
 * @param {{ keep?: boolean, defer?: boolean }} [opt]
 *   keep=true：播完停在最后一帧（按住不放时用），直到下一次 play 或 stop
 *   defer=true：先停在第一帧，等下一帧画出来再开始。用于打开大面板：打开那一帧往往要排版几百毫秒，
 *               如果动画同时开始，画出来时已经播完一大半，看起来就是「啪」地跳出来
 * @returns {Promise<boolean>} 正常播完为 true，被打断为 false
 */
export function play(el, group, tracks, { keep = false, defer = false } = {}) {
    let map = running.get(el);
    if (!map) { map = new Map(); running.set(el, map); }
    if (map.size) {
        // 打断时从当前画面接着走，不跳回起点
        const cs = getComputedStyle(el);
        for (const [kf, opt] of tracks) {
            if (opt?.pseudoElement) continue;
            const first = kf[0];
            for (const p of Object.keys(first)) {
                if (p === 'offset' || p === 'easing') continue;
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
    fixLockedOpacity(el, tracks, anims);
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
 * 美化用 opacity: x !important 锁住透明度时，动画里的 opacity 不生效（重要声明高于动画）。
 * 这时把透明度轨道换成 filter: opacity()，效果相同。
 */
const lockCache = new WeakMap(); // el → { gen, locked }：每个元素每套主题只检查一次，避免每次播放都强制计算样式
function fixLockedOpacity(el, tracks, anims) {
    const i = tracks.findIndex(([kf]) => 'opacity' in kf[0] && !tracks.some(([k]) => 'filter' in k[0]));
    if (i < 0 || !anims[i]) return;
    const gen = themeGeneration();
    let hit = lockCache.get(el);
    if (!hit || hit.gen !== gen) {
        const want = Number(tracks[i][0][0].opacity);
        hit = { gen, locked: Math.abs(parseFloat(getComputedStyle(el).opacity) - want) > 0.05 };
        lockCache.set(el, hit);
    }
    if (!hit.locked) return;
    anims[i].cancel();
    const kf = tracks[i][0].map(f => ({ ...(f.offset !== undefined && { offset: f.offset }), filter: `opacity(${f.opacity})` }));
    try { anims[i] = el.animate(kf, { fill: 'both', ...tracks[i][1] }); } catch { anims.splice(i, 1); }
}

/**
 * 和 play 一样，但先检查加缩放会不会把图标的下划线等装饰挤到图标中间（见 guard.transformTarget）。
 * 会的话改为只动图标的图形；图形也动不了就跳过。
 */
export function playTransform(el, group, tracks, opt = {}) {
    const tgt = transformTarget(el);
    if (!tgt) { stop(el); return Promise.resolve(false); }
    if (!tgt.pseudo) return play(el, group, tracks, opt);
    // 行内的伪元素不能变形，动画期间改成 inline-block（见 css/components.css）
    el.classList.add('me-glyph');
    stop(el); // 元素本身可能还带着之前的缩放
    const t = tracks.map(([kf, o]) => [kf, { ...o, pseudoElement: tgt.pseudo }]);
    return play(el, group, t, opt).then(ok => {
        if (ok && !opt.keep) el.classList.remove('me-glyph');
        return ok;
    });
}

/** 取消元素上本插件的所有动画 */
export function stop(el) {
    const map = running.get(el);
    if (!map) return;
    for (const anims of map.values()) anims.forEach(a => a.cancel());
    map.clear();
}

export function isRunning(el, group) {
    return !!running.get(el)?.has(group);
}

/** 一帧之后执行（等浏览器先算完样式） */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
