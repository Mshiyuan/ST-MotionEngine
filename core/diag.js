// 性能记录（调试用，默认关闭）：在用户自己的设备上找出卡在哪里。
//   - 设备信息：浏览器、屏幕、酒馆和插件版本、美化、已加载的第三方扩展、本插件用到的写法是否支持；
//   - 自动测一遍：在几种条件下各开关一次角色、用户（人设）面板，记录打开和关闭期间的帧；
//     条件：插件关 / 插件开 / 插件开但不暂停美化循环 / 插件开且去掉毛玻璃，用来分出卡在插件、美化循环还是毛玻璃；
//   - 手动操作：开着记录时，每次点按后 1.5 秒内的帧。
// 只在开关打开时工作；关着时不挂任何监听。
import { state } from './engine.js';
import { apply } from './settings.js';

const PANELS = [['角色', '#rightNavHolder'], ['用户', '#persona-management-button'], ['背景', '#backgrounds-button']];
const log = [];       // 手动操作
let auto = [];        // 自动测试结果
let listening = false;

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
    const [ff, f] = await Promise.all([firstFrame(t0), sample(1500)]);
    log.push({ t: new Date().toLocaleTimeString(), what, on: state.on, ff, ...f });
    if (log.length > 40) log.shift();
}

export function syncDiag() {
    const on = !!state.settings?.diag;
    if (on === listening) return;
    listening = on;
    if (on) document.addEventListener('pointerup', onPointer, { capture: true, passive: true });
    else document.removeEventListener('pointerup', onPointer, { capture: true });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** 自动测一遍；完成后返回结果行数 */
export async function runAuto(onStep) {
    const s = state.settings;
    const keep = { enabled: s.enabled, pauseLoops: s.pauseLoops };
    const noBlur = document.createElement('style');
    noBlur.textContent = '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
    const CONDS = [
        ['插件关', () => { s.enabled = false; }],
        ['插件开', () => { s.enabled = true; s.pauseLoops = keep.pauseLoops; }],
        ['插件开·不暂停循环', () => { s.enabled = true; s.pauseLoops = false; }],
        ['插件开·去掉毛玻璃', () => { s.enabled = true; s.pauseLoops = keep.pauseLoops; document.head.append(noBlur); }],
        ['插件关·去掉毛玻璃', () => { s.enabled = false; }],
    ];
    auto = [];
    // 先关掉当前打开的顶栏面板（扩展面板）
    document.querySelector('#top-settings-holder .drawer-content.openDrawer')?.closest('.drawer')?.querySelector('.drawer-toggle')?.click();
    await wait(900);
    try {
        for (const [name, set] of CONDS) {
            set(); apply();
            await wait(600);
            for (const [pn, sel] of PANELS) {
                const toggle = document.querySelector(`${sel} > .drawer-toggle`);
                if (!toggle) continue;
                const rows = [];
                for (let i = 0; i < 2; i++) {
                    onStep?.(`${name} · ${pn} ${i + 1}/2`);
                    let t0 = performance.now();
                    toggle.click();
                    const [ff, open] = await Promise.all([firstFrame(t0), sample(900)]);
                    await wait(300);
                    t0 = performance.now();
                    toggle.click();
                    const [ff2, close] = await Promise.all([firstFrame(t0), sample(800)]);
                    rows.push({ ff, open, ff2, close });
                    await wait(300);
                }
                auto.push({ cond: name, panel: pn, rows });
            }
        }
    } finally {
        noBlur.remove();
        Object.assign(s, keep);
        apply();
        // 回到扩展面板
        await wait(300);
        document.querySelector('#extensions-settings-button > .drawer-toggle')?.click();
    }
    return auto.length;
}

export function clearDiag() { log.length = 0; auto = []; }

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
        `美化: ${ctx.powerUserSettings?.theme || '?'} · 风格 ${s.feel} · 速度 ${s.speed} 幅度 ${s.amp} · 低配 ${s.lite ? '开' : '关'} · 暂停循环 ${s.pauseLoops ? '开' : '关'} · 预渲染 ${s.prerender ? '开' : '关'}`,
        `页面: 元素 ${document.getElementsByTagName('*').length} · 用了毛玻璃的元素 ${blurCount} · 角色 ${document.querySelectorAll('#rm_print_characters_block > *').length} · 人设 ${document.querySelectorAll('#user_avatar_block > *').length}`,
        `第三方扩展: ${ext.join(', ') || '无'}`,
        `支持: ${SUPPORTS.map(([n, f]) => { let ok = false; try { ok = f(); } catch { /* 不支持 */ } return `${n}${ok ? '✓' : '✗'}`; }).join(' ')}`,
        '',
        '自动测试（每格：打开 首帧ms/最长帧ms/长帧数/帧数 ; 关闭 同上，各两次）',
        ...auto.map(a => `${a.cond} · ${a.panel}: ${a.rows.map(r => `开 ${r.ff}/${r.open.max}/${r.open.long}/${r.open.n} 关 ${r.ff2}/${r.close.max}/${r.close.long}/${r.close.n}`).join(' | ')}`),
        '',
        '手动操作（点按位置 · 插件开关 · 首帧ms · 最长帧ms · 长帧数/帧数）',
        ...log.map(l => `${l.t} ${l.what} ${l.on ? '开' : '关'} ${l.ff} ${l.max} ${l.long}/${l.n}`),
    ];
    return lines.join('\n');
}
