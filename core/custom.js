// 自定义风格与导入码
// 自定义风格只保存参数（曲线类型、时长、位移、缩放……），使用时生成和内置风格同样格式的对象。
//
// 导入码：
//   自定义风格  「名称：#」+ 11 位；分模块配置 「名称：@」+ 不定长（只记录改动过的模块）。
//   每个参数按取值范围编号（例如时长 80–1500ms、步长 10ms → 0–142），所有编号按混合进制拼成一个整数，
//   再用 58 个不易混淆的字符（去掉 0 O I l）写出。码里只有这些编号，名称写在码前面，不占码长。
//   导入时逐项校验范围，码里不包含也无法包含代码或 CSS 片段。
//   各字段的顺序和取值个数一旦发布就不能改，否则旧码会解成别的值；需要改时换一个前缀字符。
import { spring, FEELS } from './tokens.js';
import { PANEL_FORMS } from './forms.js';
import { name as nameOf } from './i18n.js';

/** 进场曲线预设。spring 由刚度、阻尼生成 */
export const CURVES = [
    { id: 'expo', zh: '快出慢停', en: 'Fast out, slow settle', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    { id: 'standard', zh: '标准减速', en: 'Standard', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    { id: 'back', zh: '越过终点再回', en: 'Overshoot', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    { id: 'anticipate', zh: '反向蓄力', en: 'Anticipate', easing: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)' },
    { id: 'smooth', zh: '慢起慢落', en: 'Ease in-out', easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
    { id: 'linear', zh: '匀速', en: 'Linear', easing: 'linear' },
    { id: 'steps', zh: '阶梯', en: 'Steps', easing: 'steps(5, end)' },
    // 前段缓慢靠近，末段快速贴合并轻微回弹
    { id: 'snap', zh: '吸附', en: 'Snap', easing: 'linear(0, 0.06 25%, 0.16 50%, 0.3 66%, 0.62 78%, 1.03 88%, 0.99 94%, 1)' },
    { id: 'spring', zh: '弹簧（可调）', en: 'Spring (tunable)', easing: null },
];

/** 变形基点 */
export const ORIGINS = [
    { id: 'center', zh: '中', en: 'Center' },
    { id: 'top', zh: '上', en: 'Top' },
    { id: 'bottom', zh: '下', en: 'Bottom' },
];

/** 数值参数：[最小, 最大, 默认, 步长] */
export const RANGES = {
    stiffness: [60, 800, 220, 10],
    damping: [4, 60, 24, 1],
    inDur: [80, 1500, 450, 10],
    outDur: [60, 800, 200, 10],
    y: [0, 80, 14, 1],
    sx: [0.3, 1.3, 0.97, 0.01],
    sy: [0.3, 1.3, 0.97, 0.01],
    blur: [0, 20, 0, 1],
    press: [0.8, 1, 0.96, 0.01],
    stagger: [0, 200, 40, 5],
};

const FORM_IDS = PANEL_FORMS.map(f => f.id);
/** 自定义风格可选的打开 / 关闭方式（码里按这个顺序编号，只能在末尾追加时换前缀） */
export const FORMS_IN = ['drop', 'icon', 'rise', 'side', 'curtain', 'unfold', 'fade'];
export const FORMS_OUT = ['drop', 'icon', 'rise', 'side', 'curtain', 'unfold', 'fade', 'none'];
export const MAX_CUSTOM = 24;

const snap = (n, [lo, hi, , step]) => {
    const v = Math.min(hi, Math.max(lo, n));
    return +(lo + Math.round((v - lo) / step) * step).toFixed(2);
};
const clamp = (n, r) => (Number.isFinite(Number(n)) && n !== null && n !== '' ? snap(Number(n), r) : r[2]);
const cleanName = (s) => String(s ?? '').replace(/[<>&"]/g, '').replace(/[#@]/g, '').trim().slice(0, 16);
// 说明：分享码里写在名称后的全角括号里，所以不能含全角括号
const cleanDesc = (s) => String(s ?? '').replace(/[<>&"]/g, '').replace(/[#@（）]/g, '').trim().slice(0, 24);
/** 曲线的名称，用作说明的默认值 */
export const curveName = (id) => { const c = CURVES.find(x => x.id === id); return c ? nameOf(c) : ''; };

/** 把任意输入整理成合法的自定义风格参数 */
export function sanitizeCustom(c, i = 0) {
    // 旧版只有一个起始缩放 s，同时用作横向和纵向
    const legacyS = c?.s;
    const out = {
        id: /^c-[a-z0-9]{1,12}$/.test(c?.id) ? c.id : newId(i),
        // 名称可以为空（卡片上显示「未命名」）
        name: cleanName(c?.name),
        curve: CURVES.some(x => x.id === c?.curve) ? c.curve : 'expo',
        origin: ORIGINS.some(x => x.id === c?.origin) ? c.origin : 'center',
        formIn: FORMS_IN.includes(c?.formIn) ? c.formIn : 'drop',
        formOut: FORMS_OUT.includes(c?.formOut) ? c.formOut : (FORM_IDS.includes(c?.formOut) ? 'fade' : 'drop'),
    };
    // 说明可以为空；旧版没有这一项，用曲线的名称（和以前卡片上显示的一样）
    out.desc = c?.desc === undefined ? curveName(out.curve) : cleanDesc(c.desc);
    for (const [k, r] of Object.entries(RANGES)) {
        const raw = (k === 'sx' || k === 'sy') && c?.[k] === undefined ? legacyS : c?.[k];
        out[k] = clamp(raw, r);
    }
    return out;
}

export function newId(i = 0) {
    return `c-${Date.now().toString(36).slice(-6)}${(Math.random() * 36 | 0).toString(36)}${i}`.slice(0, 14);
}

/** 由参数生成风格对象（字段同 tokens.FEELS） */
export function buildFeel(c) {
    let easing, dur = c.inDur, springParams = null;
    if (c.curve === 'spring') {
        const sp = spring(c.stiffness, c.damping);
        easing = sp.easing;
        dur = Math.min(sp.duration, 1500);
        springParams = [c.stiffness, c.damping];
    } else easing = CURVES.find(x => x.id === c.curve)?.easing || CURVES[0].easing;
    const stepped = easing.startsWith('steps');
    const s = c.sx === c.sy ? c.sx : `${c.sx} ${c.sy}`;
    return {
        id: c.id, group: 'custom', zh: c.name || '未命名', en: c.name || 'Untitled', dzh: '', den: '', custom: true,
        in: easing, inDur: dur, spring: springParams,
        out: stepped ? 'steps(3, end)' : 'cubic-bezier(0.3, 0, 0.8, 0.15)', outDur: c.outDur,
        fade: stepped ? easing : 'cubic-bezier(0.2, 0, 0, 1)',
        y: c.y, s, blur: c.blur, origin: c.origin === 'center' ? null : c.origin,
        press: c.press, pressDur: 80, rel: easing, relDur: Math.max(200, dur * 0.8), stagger: c.stagger,
        forms: { in: c.formIn, out: c.formOut, k: 1 },
    };
}

/** 新建自定义风格：从某个内置风格的参数起步 */
export function customFrom(feelId) {
    const f = FEELS.find(x => x.id === feelId) || FEELS[0];
    let curve = CURVES.find(x => x.easing === f.in)?.id || 'expo';
    let stiffness, damping;
    if (f.spring) { curve = 'spring'; [stiffness, damping] = f.spring; }
    const [sx, sy = sx] = String(f.s).split(' ').map(Number);
    const press = typeof f.press === 'string' ? Number(f.press.split(' ')[1]) : f.press;
    return sanitizeCustom({ name: '', curve, stiffness, damping, inDur: f.inDur, outDur: f.outDur, y: Math.abs(f.y), sx, sy, blur: f.blur, press, stagger: f.stagger });
}

// ---------- 58 进制 ----------
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B = 58n;

function toB58(n, width = 0) {
    let s = '';
    while (n > 0n) { s = ALPHA[Number(n % B)] + s; n /= B; }
    return s.padStart(width, ALPHA[0]) || ALPHA[0];
}

function fromB58(str) {
    let n = 0n;
    for (const ch of str) {
        const i = ALPHA.indexOf(ch);
        if (i < 0) throw new Error('format');
        n = n * B + BigInt(i);
    }
    return n;
}

/** 混合进制写入 / 读出 */
class Packer {
    constructor() { this.parts = []; }
    put(value, radix) { this.parts.push([BigInt(value), BigInt(radix)]); return this; }
    /** 先放进去的在最低位 */
    value() { let n = 0n; for (let i = this.parts.length - 1; i >= 0; i--) { const [v, r] = this.parts[i]; n = n * r + v; } return n; }
}

class Reader {
    constructor(n) { this.n = n; }
    get(radix) { const r = BigInt(radix); const v = this.n % r; this.n /= r; return Number(v); }
}

const steps = (k) => { const [lo, hi, , st] = RANGES[k]; return Math.round((hi - lo) / st) + 1; };
const idx = (k, v) => Math.round((v - RANGES[k][0]) / RANGES[k][3]);
const val = (k, i) => +(RANGES[k][0] + i * RANGES[k][3]).toFixed(2);

/** 自定义风格码的字段，按顺序编码 */
const COMMON = ['outDur', 'y', 'sx', 'sy', 'blur', 'press', 'stagger'];

function packStyle(c) {
    const p = new Packer();
    p.put(CURVES.findIndex(x => x.id === c.curve), CURVES.length);
    if (c.curve === 'spring') p.put(idx('stiffness', c.stiffness), steps('stiffness')).put(idx('damping', c.damping), steps('damping'));
    else p.put(idx('inDur', c.inDur), steps('inDur'));
    for (const k of COMMON) p.put(idx(k, c[k]), steps(k));
    p.put(ORIGINS.findIndex(x => x.id === c.origin), ORIGINS.length);
    p.put(FORMS_IN.indexOf(c.formIn), FORMS_IN.length);
    p.put(FORMS_OUT.indexOf(c.formOut), FORMS_OUT.length);
    return p.value();
}

/** 自定义风格码的固定位数（按所有字段取最大值时的长度算） */
export const STYLE_CODE_LEN = (() => {
    const max = {
        curve: 'spring', stiffness: RANGES.stiffness[1], damping: RANGES.damping[1], origin: ORIGINS[ORIGINS.length - 1].id,
        formIn: FORMS_IN[FORMS_IN.length - 1], formOut: FORMS_OUT[FORMS_OUT.length - 1],
    };
    for (const k of COMMON) max[k] = RANGES[k][1];
    const spr = packStyle(max);
    const dur = packStyle({ ...max, curve: CURVES[CURVES.length - 2].id, inDur: RANGES.inDur[1] });
    return toB58(spr > dur ? spr : dur).length;
})();

// 打散：乘一个与 58^n 互素的常数再取模，相近的参数也会得到看起来完全不同的码（可逆，导入时乘逆元还原）
const MOD = B ** BigInt(STYLE_CODE_LEN);
// 取约 0.618 × 58^n 附近的奇数（且不是 29 的倍数，与 58^n 互素），高位也能被打散
const MUL = (() => { let m = MOD * 618033988749n / 1000000000000n; if (m % 2n === 0n) m += 1n; while (m % 29n === 0n) m += 2n; return m; })();
function inverse(a, m) {
    let [r0, r1, s0, s1] = [a % m, m, 1n, 0n];
    while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
    return ((s0 % m) + m) % m;
}
const INV = inverse(MUL, MOD);
const ADD = 0x2B3C4D5E6F7n;

/** 导出一个自定义风格：「名称（说明）：#xxxxxxxxxxx」，没有说明时为「名称：#xxxxxxxxxxx」 */
export function exportStyle(c) {
    const code = `#${toB58((packStyle(c) * MUL + ADD) % MOD, STYLE_CODE_LEN)}`;
    // 名称以全角右括号结尾而没有说明时，补一对空括号，导入时不会把名称里的括号当成说明
    const note = c.desc ? `（${c.desc}）` : /）$/.test(c.name) ? '（）' : '';
    const head = `${c.name}${note}`;
    return head ? `${head}：${code}` : code;
}

function unpackStyle(code) {
    const r = new Reader((((fromB58(code) - ADD) % MOD + MOD) * INV) % MOD);
    const curve = CURVES[r.get(CURVES.length)]?.id;
    if (!curve) throw new Error('format');
    const c = { curve };
    if (curve === 'spring') { c.stiffness = val('stiffness', r.get(steps('stiffness'))); c.damping = val('damping', r.get(steps('damping'))); } else c.inDur = val('inDur', r.get(steps('inDur')));
    for (const k of COMMON) c[k] = val(k, r.get(steps(k)));
    c.origin = ORIGINS[r.get(ORIGINS.length)]?.id;
    c.formIn = FORMS_IN[r.get(FORMS_IN.length)];
    c.formOut = FORMS_OUT[r.get(FORMS_OUT.length)];
    if (!c.origin || !c.formIn || !c.formOut || r.n !== 0n) throw new Error('format');
    return c;
}

/** 把「名称：#码」拆成名称和码；名称可以省略 */
function splitCode(text, mark) {
    const t = String(text || '').trim();
    const m = t.match(new RegExp(`^(.*?)[\\s：:]*\\${mark}([1-9A-HJ-NP-Za-km-z]{1,64})\\s*$`, 's'));
    if (!m) return null;
    return { name: cleanName(m[1]), raw: m[1].trim(), code: m[2] };
}

// 0.4.0 的导出码（ME1: + base64 JSON），只为兼容旧码保留
function legacy(text) {
    const t = String(text || '').trim();
    if (!t.startsWith('ME1:')) return null;
    try {
        const bin = atob(t.slice(4));
        const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
        return data && typeof data === 'object' ? data : null;
    } catch { return null; }
}

/**
 * 导入自定义风格码，返回新风格（数组：旧版码可能含多个）。码无效时抛错。
 * @returns {object[]}
 */
export function importStyles(text) {
    const old = legacy(text);
    if (old) {
        const list = Array.isArray(old.customFeels) ? old.customFeels.slice(0, MAX_CUSTOM).map((c, i) => sanitizeCustom({ ...c, id: null }, i)) : [];
        if (!list.length) throw new Error('empty');
        return list;
    }
    const parts = splitCode(text, '#');
    if (!parts || parts.code.length !== STYLE_CODE_LEN) throw new Error('format');
    // 码里没有名称时，用曲线的名称（如「吸附」）；名称后的全角括号是说明，没有括号时说明用曲线的名称
    const c = unpackStyle(parts.code);
    const note = parts.raw.match(/^(.*)（([^（）]*)）$/s);
    const nm = note ? cleanName(note[1]) : parts.name;
    return [sanitizeCustom({ ...c, name: nm || CURVES.find(x => x.id === c.curve)?.zh || '', desc: note ? note[2] : undefined })];
}

// ---------- 分模块配置 ----------
/** 码里的模块顺序（只能在末尾追加；追加后旧码仍能解开，因为未设置的位为 0）。bgthumbs 已删除，位置保留，旧码照常能解开 */
export const CODE_MODULES = ['press', 'icons', 'checkbox', 'drawers', 'menus', 'popups', 'toasts', 'inline', 'select', 'messages',
    'entry', 'swipes', 'reasoning', 'editing', 'mesmenu', 'welcome', 'tabs', 'lists', 'zoom', 'bgthumbs'];
const AMP = [0, 5, 1, 0.1];
const SPEED = [0.5, 2, 1, 0.1];
const nAmp = Math.round((AMP[1] - AMP[0]) / AMP[3]) + 1;
const nSpeed = Math.round((SPEED[1] - SPEED[0]) / SPEED[3]) + 1;

export const sanitizeTune = (t) => ({ amp: clamp(t?.amp, AMP), speed: clamp(t?.speed, SPEED) });

/** 导出分模块配置：「名称：@xxxx」。只记录设置过的模块 */
export function exportTune(name, tune) {
    let mask = 0n;
    const p = new Packer();
    CODE_MODULES.forEach((m, i) => {
        const t = tune?.[m];
        if (!t) return;
        mask |= 1n << BigInt(i);
        const { amp, speed } = sanitizeTune(t);
        p.put(Math.round((amp - AMP[0]) / AMP[3]) * nSpeed + Math.round((speed - SPEED[0]) / SPEED[3]), nAmp * nSpeed);
    });
    const n = p.value() * (1n << BigInt(CODE_MODULES.length)) + mask;
    return `${cleanName(name) || '配置'}：@${toB58(n)}`;
}

/**
 * 导入分模块配置码，返回 { name, tune }。码无效时抛错。
 */
export function importTune(text) {
    const old = legacy(text);
    if (old) {
        const tune = {};
        if (old.tune && typeof old.tune === 'object') for (const m of CODE_MODULES) if (old.tune[m]) tune[m] = sanitizeTune(old.tune[m]);
        return { name: '导入', tune };
    }
    const parts = splitCode(text, '@');
    if (!parts) throw new Error('format');
    let n = fromB58(parts.code);
    const bits = BigInt(CODE_MODULES.length);
    const mask = n % (1n << bits);
    n /= 1n << bits;
    const r = new Reader(n);
    const tune = {};
    CODE_MODULES.forEach((m, i) => {
        if (!(mask & (1n << BigInt(i)))) return;
        const v = r.get(nAmp * nSpeed);
        tune[m] = { amp: +(AMP[0] + Math.floor(v / nSpeed) * AMP[3]).toFixed(1), speed: +(SPEED[0] + (v % nSpeed) * SPEED[3]).toFixed(1) };
    });
    if (r.n !== 0n) throw new Error('format');
    return { name: parts.name || '导入', tune };
}
