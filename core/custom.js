// 自定义风格与导入导出码
// 自定义风格只保存参数（曲线类型、时长、位移、缩放……），使用时生成和内置风格同样格式的对象。
// 导入导出码 = 前缀 + base64(JSON)。导入时逐项校验：只接受已知字段、数字限定范围、曲线必须是浏览器认得的缓动函数，
// 不接受任何代码或 CSS 片段，所以别人发来的码最多改动效参数。
import { spring, FEELS } from './tokens.js';
import { PANEL_FORMS } from './forms.js';

/** 进场曲线预设。spring 类用刚度、阻尼生成 */
export const CURVES = [
    { id: 'expo', zh: '快出慢停', en: 'Fast out, slow settle', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    { id: 'standard', zh: '标准减速', en: 'Standard', easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    { id: 'back', zh: '冲过头再回', en: 'Overshoot', easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    { id: 'anticipate', zh: '蓄力弹出', en: 'Anticipate', easing: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)' },
    { id: 'smooth', zh: '慢起慢落', en: 'Ease in-out', easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
    { id: 'linear', zh: '匀速', en: 'Linear', easing: 'linear' },
    { id: 'steps', zh: '阶梯', en: 'Steps', easing: 'steps(5, end)' },
    { id: 'spring', zh: '弹簧（可调）', en: 'Spring (tunable)', easing: null },
];

/** 参数的取值范围：[最小, 最大, 默认] */
export const RANGES = {
    stiffness: [60, 800, 220],
    damping: [4, 60, 24],
    inDur: [80, 1500, 450],
    outDur: [60, 800, 200],
    y: [0, 80, 14],
    s: [0.3, 1.3, 0.97],
    blur: [0, 20, 0],
    press: [0.8, 1, 0.96],
    stagger: [0, 200, 40],
};

const FORM_IDS = PANEL_FORMS.map(f => f.id);
const clamp = (n, [lo, hi, def]) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : def);

/** 把任意输入整理成合法的自定义风格参数 */
export function sanitizeCustom(c, i = 0) {
    const out = {
        id: /^c-[a-z0-9]{1,12}$/.test(c?.id) ? c.id : `c-${Date.now().toString(36).slice(-6)}${i}`,
        name: String(c?.name ?? '').replace(/[<>&"]/g, '').trim().slice(0, 16) || '自定义',
        curve: CURVES.some(x => x.id === c?.curve) ? c.curve : 'expo',
        formIn: FORM_IDS.includes(c?.formIn) && c.formIn !== 'none' ? c.formIn : 'drop',
        formOut: FORM_IDS.includes(c?.formOut) ? c.formOut : 'drop',
    };
    for (const [k, r] of Object.entries(RANGES)) out[k] = clamp(c?.[k], r);
    return out;
}

/** 由参数生成风格对象（字段同 tokens.FEELS） */
export function buildFeel(c) {
    let easing, dur = c.inDur;
    if (c.curve === 'spring') {
        const sp = spring(c.stiffness, c.damping);
        easing = sp.easing;
        dur = Math.min(sp.duration, 1500);
    } else easing = CURVES.find(x => x.id === c.curve)?.easing || CURVES[0].easing;
    const stepped = easing.startsWith('steps');
    return {
        id: c.id, group: 'custom', zh: c.name, en: c.name, dzh: '', den: '', custom: true,
        in: easing, inDur: dur,
        out: stepped ? 'steps(3, end)' : 'cubic-bezier(0.3, 0, 0.8, 0.15)', outDur: c.outDur,
        fade: stepped ? easing : 'cubic-bezier(0.2, 0, 0, 1)',
        y: c.y, s: c.s, blur: c.blur,
        press: c.press, pressDur: 80, rel: easing, relDur: Math.max(200, dur * 0.8), stagger: c.stagger,
        forms: { in: c.formIn, out: c.formOut, k: 1 },
    };
}

/** 新建自定义风格：从某个内置风格的参数起步 */
export function customFrom(feelId) {
    const f = FEELS.find(x => x.id === feelId) || FEELS[0];
    const curve = CURVES.find(x => x.easing === f.in)?.id || (f.in.startsWith('linear(') ? 'spring' : 'expo');
    const s = typeof f.s === 'string' ? Number(f.s.split(' ')[0]) : f.s;
    return sanitizeCustom({ name: '', curve, inDur: f.inDur, outDur: f.outDur, y: f.y, s, blur: f.blur, press: typeof f.press === 'string' ? Number(f.press.split(' ')[1]) : f.press, stagger: f.stagger });
}

// ---------- 导入导出码 ----------
const PREFIX = 'ME1:';
/** 会被导出的设置项 */
const SHARE_KEYS = ['feel', 'speed', 'amp', 'panelIn', 'panelOut', 'panelSplit', 'panelBounce', 'perModule', 'tune', 'customFeels'];

export function exportCode(settings) {
    const data = Object.fromEntries(SHARE_KEYS.map(k => [k, settings[k]]));
    const json = JSON.stringify(data);
    return PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

/**
 * 解析导入码，返回整理好的设置片段；码无效时抛错
 * @param {string} code
 * @param {string[]} modules 模块列表
 */
export function importCode(code, modules) {
    const text = String(code || '').trim();
    if (!text.startsWith(PREFIX)) throw new Error('format');
    let data;
    try {
        const bin = atob(text.slice(PREFIX.length));
        data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    } catch { throw new Error('format'); }
    if (!data || typeof data !== 'object') throw new Error('format');

    const out = {};
    const customFeels = Array.isArray(data.customFeels) ? data.customFeels.slice(0, 12).map(sanitizeCustom) : [];
    out.customFeels = customFeels;
    const ids = new Set([...FEELS.map(f => f.id), ...customFeels.map(c => c.id)]);
    if (ids.has(data.feel)) out.feel = data.feel;
    out.speed = clamp(data.speed, [0.5, 2, 1]);
    out.amp = clamp(data.amp, [0, 3, 1]);
    if (FORM_IDS.includes(data.panelIn)) out.panelIn = data.panelIn;
    if (FORM_IDS.includes(data.panelOut)) out.panelOut = data.panelOut;
    out.panelSplit = !!data.panelSplit;
    out.panelBounce = data.panelBounce === 'uniform' ? 'uniform' : 'area';
    out.perModule = !!data.perModule;
    out.tune = {};
    if (data.tune && typeof data.tune === 'object') {
        for (const m of modules) {
            const t = data.tune[m];
            if (t && typeof t === 'object') out.tune[m] = { amp: clamp(t.amp, [0, 5, 1]), speed: clamp(t.speed, [0.5, 2, 1]) };
        }
    }
    return out;
}
