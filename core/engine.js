// 统一的 WAAPI 播放器。只动 opacity / translate / scale / filter，全部在合成线程执行。
import { themeGeneration } from './guard.js';

export const state = {
    on: false,
    /** 是否按「减少动效」处理（见 guard.shouldReduce） */
    reduced: false,
    feel: null,
    vars: {},
    settings: null,
    /** @type {Set<string>} */
    modules: new Set(),
};

/** 模块是否生效：总开关、模块开关都开着，且 jQuery 动画没有被酒馆的「减少动效」关掉 */
export function active(mod) {
    return state.on && state.modules.has(mod);
}

/** 读取当前变量里的时长（毫秒） */
export function dur(name) {
    return parseFloat(state.vars[name]) || 0;
}

export function v(name) {
    return state.vars[name];
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
        for (const [kf] of tracks) {
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
