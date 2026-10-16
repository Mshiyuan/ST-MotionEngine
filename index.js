// 动效引擎 Motion Engine —— 入口
import { FEELS, GROUPS, getFeel, feelVars } from './core/tokens.js';
import { state, play, dur, v } from './core/engine.js';
import { installOrigin } from './core/origin.js';
import { setLocale, t, name } from './core/i18n.js';
import { installPress } from './modules/press.js';
import { installMenus } from './modules/menus.js';
import { installPopups } from './modules/popups.js';
import { installDrawers } from './modules/drawers.js';

const KEY = 'motionEngine';
const MODULES = ['press', 'drawers', 'menus', 'popups'];
const DEFAULTS = Object.freeze({
    enabled: true,
    feel: 'smooth',
    speed: 1,
    amp: 1,
    modules: Object.fromEntries(MODULES.map(m => [m, true])),
    followPointer: true,
    haptics: false,
});

const ctx = () => SillyTavern.getContext();
const root = document.documentElement;
let settings;

function loadSettings() {
    const all = ctx().extensionSettings;
    const saved = all[KEY] || {};
    settings = all[KEY] = {
        ...structuredClone(DEFAULTS),
        ...saved,
        modules: { ...DEFAULTS.modules, ...(saved.modules || {}) },
    };
    state.settings = settings;
}

const save = () => ctx().saveSettingsDebounced();

const isReduced = () => !!ctx().powerUserSettings?.reduced_motion || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 把设置落到页面上：根 class、风格变量 */
function apply() {
    state.on = !!settings.enabled;
    state.feel = getFeel(settings.feel);
    state.vars = feelVars(state.feel, { speed: settings.speed, amp: settings.amp, reduced: isReduced() });
    state.modules = new Set(MODULES.filter(m => settings.modules[m]));

    root.classList.toggle('me-on', state.on);
    for (const m of MODULES) root.classList.toggle(`me-m-${m}`, state.modules.has(m));
    root.dataset.meFeel = state.feel.id;

    let style = document.getElementById('me-vars');
    if (!style) {
        style = document.createElement('style');
        style.id = 'me-vars';
        document.head.append(style);
    }
    style.textContent = `:root.me-on{${Object.entries(state.vars).map(([k, val]) => `${k}:${val}`).join(';')}}`;
    window.MotionEngine.settings = settings;
}

// ---------- 设置面板 ----------
function buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'me-settings';
    wrap.innerHTML = `
<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>${t('title')}</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <label class="checkbox_label"><input type="checkbox" data-me="enabled"><span>${t('enabled')}</span></label>
    <div class="me-reduced-note">${t('reducedNote')}</div>
    <h4>${t('feel')}</h4>
    <div class="me-feels"></div>
    <div class="me-preview">
      <div class="me-preview-card">${t('previewCard')}</div>
      <div class="me-preview-btn menu_button">${t('previewBtn')}</div>
    </div>
    <div class="me-range"><span>${t('speed')}</span><input type="range" min="0.5" max="2" step="0.1" data-me="speed"><output></output></div>
    <div class="me-range"><span>${t('amp')}</span><input type="range" min="0" max="1.5" step="0.1" data-me="amp"><output></output></div>
    <h4>${t('modules')}</h4>
    <div class="me-modules">
      ${MODULES.map(m => `<label class="checkbox_label"><input type="checkbox" data-me-mod="${m}"><span>${t('m_' + m)}</span></label>`).join('')}
    </div>
    <h4>${t('options')}</h4>
    <label class="checkbox_label"><input type="checkbox" data-me="followPointer"><span>${t('followPointer')}</span></label>
    <label class="checkbox_label"><input type="checkbox" data-me="haptics"><span>${t('haptics')}</span></label>
    <div class="me-reset menu_button">${t('reset')}</div>
  </div>
</div>`;

    const feels = wrap.querySelector('.me-feels');
    for (const g of GROUPS) {
        const row = document.createElement('div');
        row.className = 'me-feel-group';
        row.innerHTML = `<span class="me-feel-group-name">${name(g)}</span>`;
        for (const f of FEELS.filter(x => x.group === g.id)) {
            const b = document.createElement('div');
            b.className = 'me-feel menu_button';
            b.dataset.feel = f.id;
            b.textContent = name(f);
            row.append(b);
        }
        feels.append(row);
    }

    wrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.me-feel');
        if (chip) {
            settings.feel = chip.dataset.feel;
            apply(); sync(wrap); save(); replay(wrap);
            return;
        }
        if (e.target.closest('.me-preview-card')) replay(wrap);
        if (e.target.closest('.me-reset')) {
            Object.assign(settings, structuredClone(DEFAULTS));
            apply(); sync(wrap); save(); replay(wrap);
        }
    });
    wrap.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset.me) {
            settings[el.dataset.me] = el.type === 'checkbox' ? el.checked : Number(el.value);
        } else if (el.dataset.meMod) {
            settings.modules[el.dataset.meMod] = el.checked;
        } else return;
        apply(); sync(wrap); save();
    });
    wrap.addEventListener('change', (e) => { if (e.target.type === 'range') replay(wrap); });
    sync(wrap);
    return wrap;
}

function sync(wrap) {
    wrap.querySelectorAll('[data-me]').forEach(el => {
        const val = settings[el.dataset.me];
        if (el.type === 'checkbox') el.checked = !!val; else el.value = val;
        const out = el.parentElement.querySelector('output');
        if (out) out.textContent = `${Number(val).toFixed(1)}×`;
    });
    wrap.querySelectorAll('[data-me-mod]').forEach(el => { el.checked = !!settings.modules[el.dataset.meMod]; });
    wrap.querySelectorAll('.me-feel').forEach(el => el.classList.toggle('me-selected', el.dataset.feel === settings.feel));
    wrap.querySelector('.me-reduced-note').hidden = !isReduced();
}

/** 在预览卡片上按当前风格播一次进场 */
function replay(wrap) {
    const card = wrap.querySelector('.me-preview-card');
    if (!state.on) return;
    const d = dur('--me-in-dur');
    const blur = v('--me-blur');
    play(card, 'preview', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.6, easing: v('--me-fade') }],
        [[{ translate: `0 ${v('--me-y')}`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: d, easing: v('--me-in') }],
        ...(blur !== '0px' ? [[[{ filter: `blur(${blur})` }, { filter: 'blur(0px)' }], { duration: d, easing: v('--me-in') }]] : []),
    ]);
}

// ---------- 启动 ----------
async function init() {
    window.MotionEngine = { state, settings: null, version: '0.1.0' };
    setLocale(ctx().getCurrentLocale?.());
    loadSettings();
    apply();
    installOrigin();
    installPress();
    installMenus();
    installPopups();
    installDrawers();

    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    host?.append(buildPanel());

    // 酒馆的「减少动态效果」切换后重新计算变量
    document.getElementById('reduced_motion')?.addEventListener('input', () => setTimeout(() => {
        apply();
        const w = document.getElementById('me-settings');
        if (w) sync(w);
    }));
    const { eventSource, eventTypes } = ctx();
    eventSource.on(eventTypes.SETTINGS_UPDATED, () => apply());
}

init().catch(e => console.error('[MotionEngine] init failed', e));
