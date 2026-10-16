// 统一的 WAAPI 播放器。只动 opacity / translate / scale / filter，全部在合成线程执行。

export const state = {
    on: false,
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
