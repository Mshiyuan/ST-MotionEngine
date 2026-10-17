// 设置：默认值、读写、落到页面上
import { getFeel, feelVars } from './tokens.js';
import { buildFeel, sanitizeCustom } from './custom.js';
import { state } from './engine.js';
import { shouldReduce } from './guard.js';

export const KEY = 'motionEngine';
export const MODULES = ['press', 'icons', 'checkbox', 'drawers', 'menus', 'popups', 'toasts', 'inline', 'select', 'messages', 'welcome', 'reasoning', 'swipes', 'details'];
/** 默认关闭的模块：选择框会把系统列表换成页面内列表，改变了操作方式，由用户决定 */
const OFF_BY_DEFAULT = ['select'];

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
    };
    // 旧版本设置迁移（幅度范围历次放宽 0–1.5 → 0–2 → 0–3，数值含义不变）
    if (!s.panelSplit && s.panelOut !== s.panelIn) s.panelSplit = true;
    if (s.panelBounce === 'soft') s.panelBounce = 'area';
    if (s.panelBounce === 'full') s.panelBounce = 'uniform';
    if ('customSelect' in s) {
        if (saved.modules?.select === undefined) s.modules.select = !!s.customSelect;
        delete s.customSelect;
    }
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

export function resetSettings() {
    const s = state.settings;
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, structuredClone(DEFAULTS), { modules: { ...DEFAULTS.modules }, tune: {}, customFeels: [] });
}

export function onApply(fn) {
    listeners.add(fn);
}

/** 把设置落到页面上：根 class、风格变量 */
export function apply() {
    const s = state.settings;
    state.on = !!s.enabled;
    state.reduced = shouldReduce(s, ctx().powerUserSettings);
    state.feel = currentFeel(s);
    // 「统一」或分模块设置时，大面板和小部件用同样的曲线和形变
    const bigBounce = s.panelBounce === 'uniform' || !!s.perModule;
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
