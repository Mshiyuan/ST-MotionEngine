// 设置：默认值、读写、落到页面上
import { getFeel, feelVars } from './tokens.js';
import { buildFeel, sanitizeCustom, sanitizeTune, CODE_MODULES } from './custom.js';
import { state } from './engine.js';
import { shouldReduce } from './guard.js';

export const KEY = 'motionEngine';
export const MODULES = CODE_MODULES;
/** 设置面板「作用范围」里的分组 */
export const SCOPE_GROUPS = [
    { id: 'tap', mods: ['press', 'icons', 'checkbox'] },
    { id: 'panels', mods: ['drawers', 'menus', 'popups', 'toasts', 'inline', 'select', 'zoom'] },
    { id: 'chat', mods: ['messages', 'entry', 'swipes', 'reasoning', 'editing', 'mesmenu'] },
    { id: 'pages', mods: ['welcome', 'tabs', 'lists', 'bgthumbs'] },
];
/** 0.4.0 的「细节交互」拆成的各项 */
const FROM_DETAILS = ['entry', 'editing', 'tabs', 'mesmenu', 'zoom', 'lists'];
/** 默认关闭的模块：选择框会把系统列表换成页面内列表，改变了操作方式，由用户决定；
 *  背景缩略图：多数风格在缩略图上不明显，且打开后马上滑动时会卡，由用户决定 */
const OFF_BY_DEFAULT = ['select', 'bgthumbs'];

export const DEFAULTS = Object.freeze({
    enabled: true,
    feel: 'smooth',
    speed: 1,
    amp: 1,
    panelIn: 'feel',
    panelOut: 'feel',
    /** 打开和关闭分开设置；关闭时两者始终相同 */
    panelSplit: false,
    /** 强度随面积：area = 越大越弱，uniform = 统一按最小部件 */
    panelBounce: 'area',
    /** 分模块设置幅度和速度（高级） */
    perModule: false,
    /** 分模块的值：{ [模块]: { amp, speed } } */
    tune: Object.freeze({}),
    /** 自定义风格 */
    customFeels: Object.freeze([]),
    /** 分模块配置：[{ id, name, tune }]；tuneProfile 为当前选中的配置（'default' = 默认，'' = 未保存的改动） */
    tuneProfiles: Object.freeze([]),
    tuneProfile: 'default',
    /** 用户自建的风格标签：[{ id, name }]；tagMap: { 风格 id: [标签 id] } */
    tags: Object.freeze([]),
    tagMap: Object.freeze({}),
    /** 作用范围里收起的分类 id */
    scopeFold: Object.freeze([]),
    /** 在扩展菜单显示快捷设置入口 */
    wandEntry: false,
    /** 面板开合期间暂停面板里美化的循环动画 */
    pauseLoops: true,
    modules: Object.freeze(Object.fromEntries(MODULES.map(m => [m, !OFF_BY_DEFAULT.includes(m)]))),
    prerender: true,
    lite: false,
    override: false,
    followSystemReduced: false,
    followPointer: true,
    haptics: false,
});

const ctx = () => SillyTavern.getContext();
const root = document.documentElement;
/** @type {Set<() => void>} */
const listeners = new Set();

export function loadSettings() {
    const all = ctx().extensionSettings;
    const saved = all[KEY] || {};
    const s = all[KEY] = {
        ...structuredClone(DEFAULTS),
        ...saved,
        modules: { ...DEFAULTS.modules, ...(saved.modules || {}) },
        tune: { ...(saved.tune || {}) },
        customFeels: Array.isArray(saved.customFeels) ? saved.customFeels.map(sanitizeCustom) : [],
        tuneProfiles: Array.isArray(saved.tuneProfiles) ? saved.tuneProfiles.filter(p => p && p.id).map(p => ({ id: String(p.id), name: String(p.name || '配置').slice(0, 16), tune: cleanTune(p.tune) })) : [],
        tags: Array.isArray(saved.tags) ? saved.tags.filter(t => t && t.id).map(t => ({ id: String(t.id), name: String(t.name || '').slice(0, 12) })) : [],
        tagMap: saved.tagMap && typeof saved.tagMap === 'object' ? { ...saved.tagMap } : {},
        scopeFold: Array.isArray(saved.scopeFold) ? saved.scopeFold.filter(id => SCOPE_GROUPS.some(g => g.id === id)) : [],
    };
    s.tune = cleanTune(s.tune);
    // 旧版本设置迁移（幅度范围历次放宽 0–1.5 → 0–2 → 0–3，数值含义不变）
    if (!s.panelSplit && s.panelOut !== s.panelIn) s.panelSplit = true;
    // 面板开合去掉了「淡入淡出」，已选的改回「跟随风格」
    if (s.panelIn === 'fade') s.panelIn = 'feel';
    if (s.panelOut === 'fade') s.panelOut = 'feel';
    if (s.panelBounce === 'soft') s.panelBounce = 'area';
    if (s.panelBounce === 'full') s.panelBounce = 'uniform';
    if ('customSelect' in s) {
        if (saved.modules?.select === undefined) s.modules.select = !!s.customSelect;
        delete s.customSelect;
    }
    // 0.5.0：「细节交互」拆成多项，原来关掉的拆出来也保持关闭；分模块的值同样分给各项
    if (saved.modules && 'details' in saved.modules) {
        for (const m of FROM_DETAILS) if (saved.modules[m] === undefined) s.modules[m] = !!saved.modules.details;
    }
    delete s.modules.details;
    if (saved.tune?.details) for (const m of FROM_DETAILS) if (!s.tune[m]) s.tune[m] = sanitizeTune(saved.tune.details);
    // 0.5.0 删除了「故障闪现」
    if (s.feel === 'glitch') s.feel = 'smooth';
    // 0.5.5：背景缩略图改为默认关闭；0.5.4 里按默认存下的「开」统一关一次
    if (!saved.bgthumbsOff) { s.modules.bgthumbs = false; s.bgthumbsOff = true; }
    state.settings = s;
    return s;
}

/** 当前风格：内置的，或自定义的（找不到时退回丝滑减速） */
export function currentFeel(s) {
    const c = s.customFeels?.find(x => x.id === s.feel);
    return c ? buildFeel(c) : getFeel(s.feel);
}

/** 模块的幅度和速度（分模块设置时没设过的模块沿用整体的值） */
export function tuneOf(s, m) {
    const t = s.tune?.[m];
    return { amp: t?.amp ?? s.amp, speed: t?.speed ?? s.speed };
}

export function save() {
    ctx().saveSettingsDebounced();
}

/** 分模块的值整理：只保留已知模块 */
function cleanTune(t) {
    const out = {};
    if (t && typeof t === 'object') for (const m of MODULES) if (t[m]) out[m] = sanitizeTune(t[m]);
    return out;
}

/** 恢复默认设置。用户建的自定义风格、标签和分模块配置保留 */
export function resetSettings() {
    const s = state.settings;
    const keep = { customFeels: s.customFeels, tags: s.tags, tagMap: s.tagMap, tuneProfiles: s.tuneProfiles };
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, structuredClone(DEFAULTS), { modules: { ...DEFAULTS.modules }, tune: {} }, keep);
}

/** 设置变化时回调；返回取消函数 */
export function onApply(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** 把设置落到页面上：根 class、风格变量 */
export function apply() {
    const s = state.settings;
    state.on = !!s.enabled;
    state.reduced = shouldReduce(s, ctx().powerUserSettings);
    state.feel = currentFeel(s);
    // 「统一」时，大面板和小部件用同样的曲线和形变（分模块设置时「越大越弱」同样生效）
    const bigBounce = s.panelBounce === 'uniform';
    state.vars = feelVars(state.feel, { speed: s.speed, amp: s.amp, reduced: state.reduced, bigBounce });
    state.varsBy = {};
    if (s.perModule) {
        for (const m of MODULES) {
            const t = tuneOf(s, m);
            state.varsBy[m] = feelVars(state.feel, { speed: t.speed, amp: t.amp, reduced: state.reduced, bigBounce });
        }
    }
    state.modules = new Set(MODULES.filter(m => s.modules[m]));

    root.classList.toggle('me-on', state.on);
    for (const m of MODULES) root.classList.toggle(`me-m-${m}`, state.modules.has(m));
    root.classList.toggle('me-prerender', state.on && !!s.prerender);
    root.classList.toggle('me-lite', state.on && !!s.lite);
    root.classList.toggle('me-override', state.on && !!s.override);
    root.classList.toggle('me-reduced', state.on && state.reduced);
    root.classList.toggle('me-select', state.on && state.modules.has('select') && CSS.supports('appearance', 'base-select'));
    root.dataset.meFeel = state.feel.id;

    let style = document.getElementById('me-vars');
    if (!style) {
        style = document.createElement('style');
        style.id = 'me-vars';
        document.head.append(style);
    }
    const decl = (vars) => Object.entries(vars).map(([k, val]) => `${k}:${val}`).join(';');
    let css = `:root.me-on{${decl(state.vars)}}`;
    // 用 CSS 变量驱动的部分（弹窗关闭、选择框列表）也要用各自模块的值
    if (s.perModule) css += `:root.me-on dialog.popup{${decl(state.varsBy.popups)}}:root.me-on select{${decl(state.varsBy.select)}}`;
    style.textContent = css;
    for (const fn of listeners) fn();
}
