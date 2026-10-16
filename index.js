// 动效引擎 Motion Engine —— 入口
import { state } from './core/engine.js';
import { installOrigin } from './core/origin.js';
import { installPredecode } from './core/guard.js';
import { setLocale } from './core/i18n.js';
import { loadSettings, apply } from './core/settings.js';
import { installPress } from './modules/press.js';
import { installMenus } from './modules/menus.js';
import { installPopups } from './modules/popups.js';
import { installDrawers } from './modules/drawers.js';
import { installPrerender } from './modules/prerender.js';
import { installTransit } from './modules/transit.js';
import { installToasts } from './modules/toasts.js';
import { installInline } from './modules/inline.js';
import { installMessages } from './modules/messages.js';
import { installDetails } from './modules/details.js';
import { installSelect } from './modules/select.js';
import { buildPanel } from './ui/panel.js';

const ctx = () => SillyTavern.getContext();

async function init() {
    window.MotionEngine = { state, get settings() { return state.settings; }, version: '0.2.0' };
    setLocale(ctx().getCurrentLocale?.());
    loadSettings();
    apply();

    // 每个模块各自 try：一个模块出错不影响其他模块
    const steps = [installOrigin, installPredecode, installPress, installMenus, installTransit, installPopups,
        installDrawers, installPrerender, installToasts, installInline, installMessages, installDetails, installSelect];
    for (const step of steps) {
        try { step(); } catch (e) { console.error(`[MotionEngine] ${step.name} failed`, e); }
    }

    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    host?.append(buildPanel());

    // 酒馆的「减少动态效果」、系统的减少动画设置变化后重新计算
    document.getElementById('reduced_motion')?.addEventListener('input', () => setTimeout(apply));
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => apply());
    const { eventSource, eventTypes } = ctx();
    eventSource.on(eventTypes.SETTINGS_UPDATED, () => apply());
}

init().catch(e => console.error('[MotionEngine] init failed', e));
