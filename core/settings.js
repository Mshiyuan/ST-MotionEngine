// 设置：默认值、读写、落到页面上
import { getFeel, feelVars } from './tokens.js';
import { state } from './engine.js';
import { shouldReduce } from './guard.js';

export const KEY = 'motionEngine';
export const MODULES = ['press', 'drawers', 'menus', 'popups', 'toasts', 'inline', 'messages', 'swipes', 'details'];

export const DEFAULTS = Object.freeze({
    enabled: true,
    feel: 'smooth',
    speed: 1,
    amp: 1,
    panelIn: 'feel',
    panelOut: 'feel',
    modules: Object.freeze(Object.fromEntries(MODULES.map(m => [m, true]))),
    prerender: true,
    lite: false,
    override: false,
    followSystemReduced: false,
    customSelect: false,
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
    };
    // 0.1.0 的幅度范围是 0–1.5，现在是 0–2，数值含义不变
    state.settings = s;
    return s;
}

export function save() {
    ctx().saveSettingsDebounced();
}

export function resetSettings() {
    const s = state.settings;
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, structuredClone(DEFAULTS), { modules: { ...DEFAULTS.modules } });
}

export function onApply(fn) {
    listeners.add(fn);
}

/** 把设置落到页面上：根 class、风格变量 */
export function apply() {
    const s = state.settings;
    state.on = !!s.enabled;
    state.reduced = shouldReduce(s, ctx().powerUserSettings);
    state.feel = getFeel(s.feel);
    state.vars = feelVars(state.feel, { speed: s.speed, amp: s.amp, reduced: state.reduced });
    state.modules = new Set(MODULES.filter(m => s.modules[m]));

    root.classList.toggle('me-on', state.on);
    for (const m of MODULES) root.classList.toggle(`me-m-${m}`, state.modules.has(m));
    root.classList.toggle('me-prerender', state.on && !!s.prerender);
    root.classList.toggle('me-lite', state.on && !!s.lite);
    root.classList.toggle('me-override', state.on && !!s.override);
    root.classList.toggle('me-reduced', state.on && state.reduced);
    root.dataset.meFeel = state.feel.id;

    let style = document.getElementById('me-vars');
    if (!style) {
        style = document.createElement('style');
        style.id = 'me-vars';
        document.head.append(style);
    }
    style.textContent = `:root.me-on{${Object.entries(state.vars).map(([k, val]) => `${k}:${val}`).join(';')}}`;
    for (const fn of listeners) fn();
}
