// 设置面板
// 结构（从上到下）：总开关 → 手感 → 面板开合 → 调节 → 作用范围 → 兼容与性能。
// 颜色全部取酒馆主题变量；面板自身的变化（切换分组、选中、开关）也用弹簧和 FLIP，不过渡 height。
import { FEELS, GROUPS, spring } from '../core/tokens.js';
import { PANEL_FORMS } from '../core/forms.js';
import { state, play } from '../core/engine.js';
import { t, name, desc } from '../core/i18n.js';
import { MODULES, apply, save, resetSettings, onApply } from '../core/settings.js';
import { systemReduced } from '../core/guard.js';
import { previewPanel } from '../modules/drawers.js';

const VERSION = '0.2.0';
const SPRING = spring(170, 18);
const COMPAT = ['prerender', 'lite', 'override', 'followSystemReduced', 'customSelect', 'followPointer', 'haptics'];

let wrap = null;
let shownGroup = null;

const sw = (key, label, note, attr = 'data-key') => `
  <div class="me-row">
    <div class="me-lbl"><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>
    <button type="button" class="me-switch" role="switch" ${attr}="${key}" aria-label="${label}"></button>
  </div>`;

function html() {
    return `
<div class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header">
    <b>${t('title')}</b>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>
  <div class="inline-drawer-content">
    <div class="me-body">
      <div class="me-card">
        <div class="me-row me-master">
          <div class="me-lbl"><span>${t('enabled')}</span><small class="me-status"></small></div>
          <button type="button" class="me-switch" role="switch" data-key="enabled" aria-label="${t('enabled')}"></button>
        </div>
      </div>

      <div class="me-dim">
        <section class="me-sec" data-sec="feel">
          <div class="me-label">${t('secFeel')}</div>
          <div class="me-seg" role="tablist">
            <span class="me-ind"></span>
            ${GROUPS.map(g => `<button type="button" role="tab" data-group="${g.id}">${t('group_' + g.id)}</button>`).join('')}
          </div>
          <div class="me-feels"></div>
          <div class="me-stage">
            <div class="me-stage-icon fa-solid fa-sliders"></div>
            <div class="me-stage-panel"><i></i><i></i><i></i></div>
            <div class="me-stage-actions">
              <button type="button" class="me-mini me-pressable" data-act="open">${t('previewOpen')}</button>
              <button type="button" class="me-mini me-pressable" data-act="close">${t('previewClose')}</button>
              <button type="button" class="me-mini me-pressable me-hold">${t('previewPress')}</button>
            </div>
          </div>
          <p class="me-foot">${t('previewHint')}</p>
        </section>

        <section class="me-sec" data-sec="panel">
          <div class="me-label">${t('secPanel')}</div>
          <div class="me-card me-pad">
            <div class="me-sub">${t('panelIn')}</div>
            <div class="me-chips" data-form="panelIn">${PANEL_FORMS.map(f => `<button type="button" class="me-chip" data-v="${f.id}">${name(f)}</button>`).join('')}</div>
            <div class="me-sub">${t('panelOut')}</div>
            <div class="me-chips" data-form="panelOut">${PANEL_FORMS.map(f => `<button type="button" class="me-chip" data-v="${f.id}">${name(f)}</button>`).join('')}</div>
          </div>
          <p class="me-foot">${t('panelNote')}</p>
        </section>

        <section class="me-sec" data-sec="tune">
          <div class="me-label">${t('secTune')}</div>
          <div class="me-card">
            <div class="me-row me-range"><span>${t('speed')}</span><input type="range" min="0.5" max="2" step="0.1" data-range="speed"><output></output></div>
            <div class="me-row me-range"><span>${t('amp')}</span><input type="range" min="0" max="2" step="0.1" data-range="amp"><output></output></div>
          </div>
          <p class="me-foot">${t('tuneNote')}</p>
        </section>

        <section class="me-sec" data-sec="scope">
          <div class="me-label">${t('secScope')}</div>
          <div class="me-card">${MODULES.map(m => sw(m, t('m_' + m), t('m_' + m + '_d'), 'data-mod')).join('')}</div>
        </section>

        <section class="me-sec" data-sec="compat">
          <div class="me-label">${t('secCompat')}</div>
          <div class="me-card">
            ${COMPAT.map(k => sw(k, t(k), t(k + '_d'))).join('')}
            <div class="me-row me-action"><button type="button" class="me-reset">${t('reset')}</button></div>
          </div>
        </section>
        <p class="me-ver">Motion Engine v${VERSION} · 时鸢</p>
      </div>
    </div>
  </div>
</div>`;
}

// ---------- FLIP：内容变化时，后面的分区从旧位置弹簧滑到新位置 ----------
function flip(mutate) {
    const items = [...wrap.querySelectorAll('.me-dim > .me-sec, .me-ver, .me-stage, .me-sec[data-sec="feel"] > .me-foot')];
    const before = new Map(items.map(n => [n, n.getBoundingClientRect().top]));
    mutate();
    for (const [n, top] of before) {
        const dy = top - n.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) n.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 640, easing: SPRING.easing });
    }
}

function renderFeels(group, animate) {
    const box = wrap.querySelector('.me-feels');
    const build = () => {
        box.innerHTML = FEELS.filter(f => f.group === group).map(f => `
          <button type="button" class="me-feel" data-feel="${f.id}">
            <span class="me-feel-name">${name(f)}</span>
            <span class="me-feel-desc">${desc(f)}</span>
            <i class="me-check fa-solid fa-check"></i>
          </button>`).join('');
        syncFeels();
    };
    if (!animate) { build(); shownGroup = group; return; }
    flip(build);
    shownGroup = group;
    [...box.children].forEach((c, i) => c.animate(
        [{ opacity: 0, translate: '0 8px', scale: '0.96' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 560, delay: i * 40, easing: SPRING.easing, fill: 'backwards' }));
}

function syncSeg(group) {
    const seg = wrap.querySelector('.me-seg');
    const i = GROUPS.findIndex(g => g.id === group);
    seg.style.setProperty('--i', String(i));
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.group === group)));
}

function syncFeels() {
    wrap.querySelectorAll('.me-feel').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.feel === state.settings.feel)));
}

function sync() {
    if (!wrap) return;
    const s = state.settings;
    wrap.querySelectorAll('[data-key]').forEach(el => el.setAttribute('aria-checked', String(!!s[el.dataset.key])));
    wrap.querySelectorAll('[data-mod]').forEach(el => el.setAttribute('aria-checked', String(!!s.modules[el.dataset.mod])));
    wrap.querySelectorAll('[data-range]').forEach(el => {
        el.value = s[el.dataset.range];
        el.parentElement.querySelector('output').textContent = `${Number(s[el.dataset.range]).toFixed(1)}×`;
    });
    wrap.querySelectorAll('.me-chips').forEach(box => box.querySelectorAll('.me-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.v === s[box.dataset.form]))));
    syncFeels();
    wrap.querySelector('.me-dim').classList.toggle('me-disabled', !s.enabled);

    const status = wrap.querySelector('.me-status');
    let msg = '';
    if (!s.enabled) msg = t('enabledOff');
    else if (systemReduced()) msg = s.followSystemReduced ? t('sysReducedFollow') : t('sysReducedPlay');
    else if (SillyTavern.getContext().powerUserSettings?.reduced_motion) msg = s.followSystemReduced ? t('stReduced') : t('stReducedPlay');
    status.textContent = msg;
    status.hidden = !msg;
}

// ---------- 预览 ----------
let previewBusy = 0;
async function replay(kind = 'both') {
    const panel = wrap.querySelector('.me-stage-panel');
    const icon = wrap.querySelector('.me-stage-icon');
    const run = (dir) => previewPanel(panel, dir, icon);
    const token = ++previewBusy;
    if (kind === 'open' || kind === 'both') {
        if (kind === 'both') {
            await run('out');
            if (token !== previewBusy) return;
            panel.style.visibility = 'hidden';
            await new Promise(r => setTimeout(r, 160));
            if (token !== previewBusy) return;
        }
        panel.style.visibility = '';
        await run('in');
    } else {
        await run('out');
        if (token === previewBusy) panel.style.visibility = 'hidden';
    }
}

function bind() {
    wrap.addEventListener('click', (e) => {
        const s = state.settings;
        const el = /** @type {HTMLElement} */ (e.target).closest('button');
        if (!el || !wrap.contains(el)) return;

        if (el.classList.contains('me-switch')) {
            el.classList.remove('me-pressing');
            if (el.dataset.key) s[el.dataset.key] = !s[el.dataset.key];
            if (el.dataset.mod) s.modules[el.dataset.mod] = !s.modules[el.dataset.mod];
            apply(); save();
            return;
        }
        if (el.dataset.group) {
            if (el.dataset.group !== shownGroup) { syncSeg(el.dataset.group); renderFeels(el.dataset.group, true); }
            return;
        }
        if (el.dataset.feel) {
            s.feel = el.dataset.feel;
            apply(); save();
            const check = el.querySelector('.me-check');
            check?.animate([{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 480, easing: SPRING.easing });
            replay('both');
            return;
        }
        const chips = el.closest('.me-chips');
        if (chips) {
            s[chips.dataset.form] = el.dataset.v;
            apply(); save();
            replay(chips.dataset.form === 'panelIn' ? 'open' : 'both');
            return;
        }
        if (el.dataset.act === 'open') { replay('open'); return; }
        if (el.dataset.act === 'close') { replay('close'); return; }
        if (el.classList.contains('me-reset')) {
            resetSettings();
            apply(); save();
            syncSeg(currentGroup()); renderFeels(currentGroup(), true);
        }
    });
    // 开关：按下就给反馈（滑块朝要去的方向拉长），不用等 click
    wrap.addEventListener('pointerdown', (e) => {
        const el = /** @type {HTMLElement} */ (e.target).closest('.me-switch');
        if (el) el.classList.add('me-pressing');
    });
    const release = () => wrap.querySelectorAll('.me-pressing').forEach(el => el.classList.remove('me-pressing'));
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
    wrap.addEventListener('pointerleave', release);

    wrap.addEventListener('input', (e) => {
        const el = /** @type {HTMLInputElement} */ (e.target);
        if (!el.dataset.range) return;
        state.settings[el.dataset.range] = Number(el.value);
        apply(); save();
    });
    wrap.addEventListener('change', (e) => { if (/** @type {HTMLElement} */ (e.target).dataset.range) replay('both'); });
}

const currentGroup = () => FEELS.find(f => f.id === state.settings.feel)?.group || 'core';

export function buildPanel() {
    wrap = document.createElement('div');
    wrap.id = 'me-settings';
    wrap.className = 'me-ui';
    wrap.innerHTML = html();
    syncSeg(currentGroup());
    renderFeels(currentGroup(), false);
    bind();
    sync();
    onApply(sync);
    return wrap;
}
