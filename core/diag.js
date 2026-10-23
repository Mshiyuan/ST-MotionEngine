// 性能记录（默认关闭）：记录点按后的帧耗时，用于排查卡顿。
//   - 设备信息：浏览器、屏幕、酒馆和插件版本、美化、已加载的第三方扩展、本插件用到的写法是否支持；
//   - 每次点按后 1.5 秒内：点按到下一帧的时间、最长帧、长帧数；
//   - 支持 Long Animation Frames 的浏览器（Chrome 123+、基于 Chromium 的 WebView）另外记录其中超过 100ms 的帧：
//     样式和排版耗时、耗时最多的脚本及其所属扩展、本插件脚本的合计耗时。
// 只在开关打开时工作；关闭时不挂任何监听。
import { state } from './engine.js';
import { bake, isApple } from './apple.js';

const log = [];       // 点按记录
let listening = false;

// ---------- 长帧（Long Animation Frames） ----------
const LOAF = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame');
const frames = [];    // 最近的长帧
let loafObs = null;

/** 脚本地址 → 来源：第三方扩展取扩展目录名，酒馆自带的取「酒馆/文件名」 */
function origin(url) {
    if (!url) return '未知来源';
    const ext = url.split('/third-party/')[1];
    if (ext) return ext.split('/')[0] + '/' + ext.split('/').pop().split('?')[0];
    const file = url.split('/').pop().split('?')[0];
    return url.includes('/scripts/extensions/') ? `内置扩展/${file}` : `酒馆/${file || '页面'}`;
}

/** 一个长帧 → 一行说明 */
function describe(f, t0) {
    const end = f.startTime + f.duration;
    const layout = f.styleAndLayoutStart ? Math.round(end - f.styleAndLayoutStart) : 0;
    const scripts = (f.scripts || []).map(x => ({ who: origin(x.sourceURL), fn: x.sourceFunctionName || x.invoker || '', d: x.duration, forced: x.forcedStyleAndLayoutDuration || 0 }));
    const total = scripts.reduce((a, x) => a + x.d, 0);
    const mine = scripts.filter(x => x.who.startsWith('ST-MotionEngine/')).reduce((a, x) => a + x.d, 0);
    // 同一来源同一函数合并
    const by = new Map();
    for (const x of scripts) { const k = `${x.who}:${x.fn}`; const o = by.get(k) || { d: 0, forced: 0 }; o.d += x.d; o.forced += x.forced; by.set(k, o); }
    const top = [...by].sort((a, b) => b[1].d - a[1].d).slice(0, 3).map(([k, o]) => `${k} ${Math.round(o.d)}${o.forced >= 5 ? `(强制排版${Math.round(o.forced)})` : ''}`);
    return `  +${Math.round(f.startTime - t0)}ms 长帧 ${Math.round(f.duration)} · 样式排版 ${layout} · 脚本 ${Math.round(total)}（本插件 ${Math.round(mine)}）${top.length ? ' · ' + top.join('；') : ''}`;
}

/** 记录 ms 毫秒内的帧间隔，返回 { max, long, n, p50 } */
function sample(ms) {
    return new Promise(resolve => {
        const g = [];
        let last = 0;
        const t0 = performance.now();
        const tick = (t) => {
            if (last) g.push(t - last);
            last = t;
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
                const s = [...g].sort((a, b) => a - b);
                resolve({ max: Math.round(s[s.length - 1] || 0), long: g.filter(x => x > 34).length, n: g.length, p50: Math.round(s[Math.floor(s.length / 2)] || 0) });
            }
        };
        requestAnimationFrame(tick);
    });
}

/** 点下去到下一帧画出来用了多久 */
const firstFrame = (t0) => new Promise(r => requestAnimationFrame(() => r(Math.round(performance.now() - t0))));

const label = (el) => {
    const x = el?.closest?.('[id]');
    if (!x) return el?.tagName?.toLowerCase() || '?';
    return '#' + x.id;
};

async function onPointer(e) {
    if (!state.settings?.diag || e.target.closest?.('#me-settings')) return;
    const t0 = performance.now();
    const what = label(e.target);
    const t = new Date().toLocaleTimeString();
    const [ff, f] = await Promise.all([firstFrame(t0), sample(1500)]);
    // 长帧的记录比帧本身晚一点到达
    await wait(200);
    const slow = frames.filter(x => x.startTime + x.duration > t0 - 50 && x.startTime < t0 + 1500 && x.duration >= 100).map(x => describe(x, t0));
    log.push({ t, what, on: state.on, ff, ...f, slow });
    if (log.length > 40) log.shift();
}

export function syncDiag() {
    const on = !!state.settings?.diag;
    if (on === listening) return;
    listening = on;
    if (on) document.addEventListener('pointerup', onPointer, { capture: true, passive: true });
    else document.removeEventListener('pointerup', onPointer, { capture: true });
    if (on && LOAF) {
        loafObs = new PerformanceObserver(list => {
            frames.push(...list.getEntries());
            if (frames.length > 200) frames.splice(0, frames.length - 200);
        });
        loafObs.observe({ type: 'long-animation-frame' });
    } else if (!on) { loafObs?.disconnect(); loafObs = null; frames.length = 0; }
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function clearDiag() { log.length = 0; frames.length = 0; }

const SUPPORTS = [
    ['linear()', () => CSS.supports('transition-timing-function', 'linear(0, 1)')],
    ['单独位移/缩放', () => CSS.supports('translate', '1px') && CSS.supports('scale', '1')],
    ['@starting-style', () => typeof CSSStartingStyleRule !== 'undefined'],
    ['allow-discrete', () => CSS.supports('transition-behavior', 'allow-discrete')],
    ['calc-size', () => CSS.supports('height', 'calc-size(auto, size)')],
    [':has()', () => CSS.supports('selector(:has(a))')],
    ['content-visibility', () => CSS.supports('content-visibility', 'auto')],
    ['backdrop-filter', () => CSS.supports('backdrop-filter', 'blur(1px)')],
    ['-webkit-backdrop-filter', () => CSS.supports('-webkit-backdrop-filter', 'blur(1px)')],
    ['WAAPI composite', () => { try { document.body.animate([{}], { composite: 'add', duration: 0 }).cancel(); return true; } catch { return false; } }],
];

export async function report(version) {
    const ctx = SillyTavern.getContext();
    let st = '?';
    try { st = (await (await fetch('/version')).json()).pkgVersion; } catch { /* 无 */ }
    const ext = [...new Set([...document.querySelectorAll('script[src*="/third-party/"], link[href*="/third-party/"]')].map(e => (e.src || e.href).split('/third-party/')[1]?.split('/')[0]).filter(Boolean))];
    const s = state.settings;
    const blurCount = [...document.querySelectorAll('body *')].slice(0, 6000).filter(el => { const cs = getComputedStyle(el); return (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none'); }).length;
    const lines = [
        `【动效引擎 性能记录】v${version} · 酒馆 ${st}`,
        `设备: ${navigator.userAgent}`,
        `屏幕: ${innerWidth}×${innerHeight} DPR ${devicePixelRatio} 触点 ${navigator.maxTouchPoints}`,
        `美化: ${ctx.powerUserSettings?.theme || '?'} · 风格 ${s.feel} · 速度 ${s.speed} 幅度 ${s.amp} · 低配 ${s.lite ? '开' : '关'} · 暂停循环 ${s.pauseLoops ? '开' : '关'}`,
        `页面: 元素 ${document.getElementsByTagName('*').length} · 用了毛玻璃的元素 ${blurCount} · 角色 ${document.querySelectorAll('#rm_print_characters_block > *').length} · 人设 ${document.querySelectorAll('#user_avatar_block > *').length}`,
        `苹果写法: ${isApple ? '苹果设备' : '非苹果设备'} · ${bake.on ? '已换' : '未换'}`,
        `第三方扩展: ${ext.join(', ') || '无'}`,
        `支持: ${SUPPORTS.map(([n, f]) => { let ok = false; try { ok = f(); } catch { /* 不支持 */ } return `${n}${ok ? '✓' : '✗'}`; }).join(' ')}`,
        `长帧来源: ${LOAF ? '支持' : '浏览器不支持，只记录帧耗时'}`,
        '',
        '点按记录（时间 · 点按位置 · 插件开关 · 点按到下一帧ms · 最长帧ms · 长帧数/帧数；下方缩进行为超过 100ms 的帧，+ms 为相对点按的时间）',
        ...log.flatMap(l => [`${l.t} ${l.what} ${l.on ? '开' : '关'} ${l.ff} ${l.max} ${l.long}/${l.n}`, ...(l.slow || [])]),
    ];
    return lines.join('\n');
}
