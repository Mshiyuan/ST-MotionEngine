// 苹果设备（Safari / iOS 上的所有浏览器，都是 WebKit 内核）的曲线换写法。
// WebKit 不把用 linear() 或 steps() 的动画交给显卡（见 WebKit KeyframeEffect::canBeAccelerated），
// 页面一忙，这些动画就跟着卡。能交给显卡的写法：
//   - 多个关键帧，每段用不冲过头的 cubic-bezier，回弹写在关键帧的数值里；
//   - 只有两个关键帧时，整条动画可以用一条冲过头的 cubic-bezier（GraphicsLayerCA 的例外）。
// 所以：两个关键帧、数值能逐个插值的轨道，按弹簧曲线的波峰波谷拆成多个关键帧（果冻、摆动的来回晃也保留）；
// 拆不了的退一步换成一条最接近的 cubic-bezier。steps() 怎么写都交不给显卡，保持原样。

/** 是否苹果设备（WebKit） */
export const isApple = /Apple/.test(navigator.vendor || '');

/** 当前是否换写法。默认苹果设备上换；性能记录里可以临时切换，用来对比 */
export const bake = { on: isApple };

// ---------- 解析 linear() ----------
const curves = new Map(); // linear() 字符串 → { t: number[], y: number[] }
function parseLinear(str) {
    if (curves.has(str)) return curves.get(str);
    const body = str.trim().slice(7, -1);
    const pts = body.split(',').map(s => {
        const p = s.trim().split(/\s+/);
        return { y: parseFloat(p[0]), at: p.slice(1).map(x => parseFloat(x) / 100) };
    });
    // 展开「一个值两个位置」，再给没写位置的点平均分配
    const y = [], t = [];
    for (const p of pts) {
        if (!p.at.length) { y.push(p.y); t.push(NaN); } else for (const a of p.at) { y.push(p.y); t.push(a); }
    }
    if (isNaN(t[0])) t[0] = 0;
    if (isNaN(t[t.length - 1])) t[t.length - 1] = 1;
    for (let i = 1; i < t.length; i++) {
        if (!isNaN(t[i])) { t[i] = Math.max(t[i], t[i - 1]); continue; }
        let j = i; while (isNaN(t[j])) j++;
        for (let k = i; k < j; k++) t[k] = t[i - 1] + (t[j] - t[i - 1]) * (k - i + 1) / (j - i + 1);
        i = j - 1;
    }
    const c = { t, y };
    curves.set(str, c);
    return c;
}

function at(c, x) {
    const { t, y } = c;
    if (x <= t[0]) return y[0];
    for (let i = 1; i < t.length; i++) if (x <= t[i]) return t[i] === t[i - 1] ? y[i] : y[i - 1] + (y[i] - y[i - 1]) * (x - t[i - 1]) / (t[i] - t[i - 1]);
    return y[y.length - 1];
}

// ---------- 拟合 cubic-bezier ----------
// 按参数 s 取贝塞尔曲线上的点 (x(s), y(s))，和目标曲线在 x(s) 处的值比较，不用解方程
const bz = (p1, p2, s) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
const S = Array.from({ length: 25 }, (_, i) => i / 24);
function err(f, x1, y1, x2, y2) {
    let e = 0;
    for (const s of S) { const d = bz(y1, y2, s) - f(bz(x1, x2, s)); e += d * d; }
    return e;
}
/** 在给定范围内找最接近 f 的 cubic-bezier（先粗后细三轮网格，一条曲线约几毫秒，结果缓存） */
function fit(f, yMax) {
    const range = (lo, hi, n) => Array.from({ length: n + 1 }, (_, i) => lo + (hi - lo) * i / n);
    let best = [0.2, 0, 0.2, 1], be = Infinity;
    const search = (X1, Y1, X2, Y2) => {
        for (const x1 of X1) for (const y1 of Y1) for (const x2 of X2) for (const y2 of Y2) {
            const e = err(f, x1, y1, x2, y2);
            if (e < be) { be = e; best = [x1, y1, x2, y2]; }
        }
    };
    search(range(0, 1, 5), range(0, 1, 5), range(0, 1, 5), range(yMax > 1 ? 1 : 0, yMax, 5));
    for (const w of [0.1, 0.025]) {
        const near = (v, lo, hi) => range(Math.max(lo, v - w), Math.min(hi, v + w), 4);
        const [x1, y1, x2, y2] = best;
        search(near(x1, 0, 1), near(y1, 0, 1), near(x2, 0, 1), near(y2, 0, yMax));
    }
    return `cubic-bezier(${best.map(v => +v.toFixed(3)).join(', ')})`;
}

const single = new Map(); // linear() → 一条 cubic-bezier（overshoot 可选）
/** 整条 linear() 换成一条 cubic-bezier。overshoot=true 时允许冲过头（只在两个关键帧时用） */
export function bezierOf(str, overshoot) {
    const key = `${overshoot ? 1 : 0}${str}`;
    if (!single.has(key)) {
        const c = parseLinear(str);
        const peak = Math.max(...c.y);
        single.set(key, fit(x => at(c, x), overshoot ? Math.min(2, Math.max(1, peak * 1.6 - 0.6)) : 1));
    }
    return single.get(key);
}

// ---------- 按波峰波谷拆段 ----------
const plans = new Map(); // linear() → [{ t, y, ease }]，第一项 t=0
function planOf(str) {
    if (plans.has(str)) return plans.get(str);
    const c = parseLinear(str);
    const { t, y } = c;
    // 波峰波谷；离终点不到 0.4% 的晃动看不出来，从那里起直接停在终点
    const ext = [];
    for (let i = 1; i < y.length - 1; i++) {
        if ((y[i] - y[i - 1]) * (y[i + 1] - y[i]) < 0 || (y[i] === y[i + 1] && y[i] !== y[i - 1])) ext.push(i);
    }
    const keep = [];
    for (const i of ext) { if (Math.abs(y[i] - 1) < 0.004) break; keep.push(i); }
    const marks = [{ t: 0, y: y[0] }, ...keep.map(i => ({ t: t[i], y: y[i] }))];
    // 最后一段：停在下一个（看不出来的）波峰波谷处，那里速度为零，停下来不突兀；不回弹的曲线停在离终点不到 0.4% 的地方
    const last = keep.length ? keep[keep.length - 1] : 0;
    const next = ext.find(i => i > last);
    let settle = 1;
    if (next !== undefined) settle = t[next];
    else for (let i = last + 1; i < y.length; i++) if (Math.abs(y[i] - 1) < 0.004) { settle = t[i]; break; }
    marks.push({ t: settle, y: 1 });
    if (settle < 1) marks.push({ t: 1, y: 1 });
    // 每段的形状用不冲过头的 cubic-bezier
    for (let i = 0; i < marks.length - 1; i++) {
        const a = marks[i], b = marks[i + 1];
        if (b.t - a.t < 1e-6 || Math.abs(b.y - a.y) < 1e-6) { a.ease = 'linear'; continue; }
        a.ease = fit(u => (at(c, a.t + (b.t - a.t) * u) - a.y) / (b.y - a.y), 1);
    }
    plans.set(str, marks);
    return marks;
}

// ---------- 数值插值 ----------
const NUM = /(-?\d*\.?\d+(?:e[-+]?\d+)?)([a-z%]*)/gi;
// calc(24px * 0.5)、calc(24px * -0.6 - 8px) 这类只有 px、数字、加减乘的式子先算出来
function calc(e) {
    const t = e.replace(/px/g, '').match(/\d*\.?\d+|[*+-]/g) || [];
    if (t.join('') !== e.replace(/px|\s/g, '')) return NaN;
    let i = 0;
    const num = () => { let sg = 1; while (t[i] === '-' || t[i] === '+') { if (t[i++] === '-') sg = -sg; } const n = parseFloat(t[i++]); return sg * n; };
    const term = () => { let v = num(); while (t[i] === '*') { i++; v *= num(); } return v; };
    let v = term();
    while (i < t.length) { const op = t[i++]; const r = term(); v = op === '-' ? v - r : op === '+' ? v + r : NaN; }
    return v;
}
function flat(val) {
    return String(val).replace(/calc\(([^()]*)\)/g, (m, e) => {
        const r = calc(e);
        return Number.isFinite(r) ? `${+r.toFixed(3)}px` : m;
    });
}
const toks = (s) => [...s.matchAll(NUM)].map(m => ({ n: parseFloat(m[1]), u: m[2] }));
const skel = (s) => s.replace(NUM, '#');

/** 返回 (p) => 值 的插值函数；不能逐个数字插值时返回 null */
function lerper(prop, A, B) {
    if (A === undefined || B === undefined) return null;
    let a = flat(A), b = flat(B);
    if (a === b) return () => A;
    if (prop === 'transformOrigin') return null;
    // scale 一个值和两个值混用
    if (prop === 'scale') {
        const na = a.trim().split(/\s+/), nb = b.trim().split(/\s+/);
        if (na.length === 1 && nb.length === 2) a = `${na[0]} ${na[0]}`;
        if (nb.length === 1 && na.length === 2) b = `${nb[0]} ${nb[0]}`;
    }
    if (skel(a) !== skel(b)) return null;
    const ta = toks(a), tb = toks(b);
    if (ta.length !== tb.length) return null;
    const units = [];
    for (let i = 0; i < ta.length; i++) {
        const ua = ta[i].u, ub = tb[i].u;
        if (ua === ub) units.push(ua);
        else if (!ua && ta[i].n === 0) units.push(ub);
        else if (!ub && tb[i].n === 0) units.push(ua);
        else return null;
    }
    const sk = skel(a).split('#');
    return (p) => sk.reduce((out, part, i) => out + part + (i < ta.length ? `${+(ta[i].n + (tb[i].n - ta[i].n) * p).toFixed(4)}${units[i]}` : ''), '');
}

const isLin = (e) => typeof e === 'string' && e.startsWith('linear(') && e.includes(',');

/** 把一段 a→b（时间 oa→ob）按曲线拆成多个关键帧；返回不含 b 的关键帧列表，拆不了返回 null */
function split(a, b, oa, ob, str) {
    const props = new Set([...Object.keys(a), ...Object.keys(b)].filter(k => k !== 'offset' && k !== 'easing' && k !== 'composite'));
    const fns = {};
    for (const p of props) { const f = lerper(p, a[p], b[p]); if (!f) return null; fns[p] = f; }
    return planOf(str).slice(0, -1).map(m => {
        const k = { offset: oa + (ob - oa) * m.t, easing: m.ease };
        for (const p of props) k[p] = fns[p](m.y);
        return k;
    });
}

/**
 * 把一条轨道换成苹果设备能交给显卡的写法。不需要换时原样返回。
 * @param {Keyframe[]} kf
 * @param {KeyframeAnimationOptions} opt
 * @returns {[Keyframe[], KeyframeAnimationOptions]}
 */
export function bakeTrack(kf, opt = {}) {
    if (!bake.on) return [kf, opt];
    const whole = isLin(opt.easing);
    const perKf = kf.some(k => isLin(k.easing));
    if (!whole && !perKf) return [kf, opt];
    // 两个关键帧 + 整条动画一条 linear()：按波峰波谷拆开，拆不了就换成一条可以冲过头的 cubic-bezier
    if (whole && kf.length === 2 && !kf.some(k => k.easing || k.offset !== undefined)) {
        const parts = split(kf[0], kf[1], 0, 1, opt.easing);
        if (parts) return [[...parts, { ...kf[1], offset: 1 }], { ...opt, easing: 'linear' }];
        return [kf, { ...opt, easing: bezierOf(opt.easing, true) }];
    }
    // 多个关键帧：整条动画的曲线只能不冲过头；每段自己的 linear() 能拆就拆
    const n = kf.length;
    const off = kf.map((k, i) => k.offset ?? (n === 1 ? 1 : i / (n - 1)));
    // 没写 offset 的中间关键帧按前后两个写了的平均分（与浏览器一致）
    for (let i = 1; i < n - 1; i++) {
        if (kf[i].offset !== undefined) continue;
        let j = i; while (j < n - 1 && kf[j].offset === undefined) j++;
        const lo = kf[i - 1].offset ?? off[i - 1], hi = kf[j].offset ?? 1;
        for (let m = i; m < j; m++) off[m] = lo + (hi - lo) * (m - i + 1) / (j - i + 1);
        i = j - 1;
    }
    const out = [];
    for (let i = 0; i < n; i++) {
        const k = kf[i];
        if (i < n - 1 && isLin(k.easing)) {
            const parts = split(k, kf[i + 1], off[i], off[i + 1], k.easing);
            if (parts) { out.push(...parts); continue; }
            out.push({ ...k, offset: off[i], easing: bezierOf(k.easing, false) });
        } else out.push({ ...k, offset: off[i] });
    }
    return [out, whole ? { ...opt, easing: bezierOf(opt.easing, false) } : opt];
}

/** CSS 变量里的 linear()（用于 CSS 过渡，都是起点到终点两个关键帧）换成一条可以冲过头的 cubic-bezier */
export function bakeVars(vars) {
    if (!bake.on) return vars;
    const out = {};
    const lins = [];
    for (const [k, val] of Object.entries(vars)) if (isLin(val)) { out[k] = bezierOf(val, true); lins.push(val); } else out[k] = val;
    // 播放时要用的拆段先在空闲时算好，第一次打开面板时不用现算
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    for (const val of new Set(lins)) if (!plans.has(val)) idle(() => planOf(val));
    return out;
}
