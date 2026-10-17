// 设置面板
// 结构（从上到下）：总开关 → 手感（分组、风格卡片）→ 预览台 → 面板开合 → 调节 → 作用范围（折叠）→ 兼容与性能（折叠）。
// 颜色全部取酒馆主题变量；面板自身的变化（切换分组、选中、开关、折叠）也用弹簧和 FLIP。
import { FEELS, GROUPS, spring } from '../core/tokens.js';
import { PANEL_FORMS } from '../core/forms.js';
import { state, play, dur, v } from '../core/engine.js';
import { t, name, desc } from '../core/i18n.js';
import { MODULES, apply, save, resetSettings, onApply } from '../core/settings.js';
import { systemReduced } from '../core/guard.js';
import { previewPanel } from '../modules/drawers.js';
import { iconFx } from '../modules/icons.js';

const VERSION = '0.3.0';
const SPRING = spring(170, 18);
const COMPAT = ['prerender', 'lite', 'override', 'followSystemReduced', 'customSelect', 'followPointer', 'haptics'];

let wrap = null;
let shownGroup = null;

const sw = (key, label, note, attr = 'data-key') => `
  <div class="me-row">
    <div class="me-lbl"><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>
    <button type="button" class="me-switch" role="switch" ${attr}="${key}" aria-label="${label}"></button>
  </div>`;

const chips = (key) => `<div class="me-chips" data-form="${key}">${PANEL_FORMS.map(f => `<button type="button" class="me-chip" data-v="${f.id}">${name(f)}</button>`).join('')}</div>`;

/** 可折叠的分组：标题行显示「已开 n/m」 */
const fold = (id, title, body) => `
  <section class="me-sec me-fold" data-sec="${id}">
    <button type="button" class="me-fold-head" aria-expanded="false">
      <span class="me-fold-title">${title}</span>
      <span class="me-fold-count"></span>
      <i class="me-fold-icon fa-solid fa-chevron-down"></i>
    </button>
    <div class="me-fold-body"><div class="me-fold-inner"><div class="me-card">${body}</div></div></div>
  </section>`;

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
          <div class="me-seg" role="tablist" style="--n:${GROUPS.length}">
            <span class="me-ind"></span>
            ${GROUPS.map(g => `<button type="button" role="tab" data-group="${g.id}">${t('group_' + g.id)}</button>`).join('')}
          </div>
          <div class="me-feels"></div>
          <div class="me-stage">
            <button type="button" class="me-tile me-tile-panel" data-pv="panel">
              <span class="me-tile-demo">
                <i class="me-pv-icon fa-solid fa-sliders"></i>
                <span class="me-pv-panel"><i></i><i></i><i></i></span>
              </span>
              <span class="me-tile-lbl">${t('pv_panel')} · ${t('pv_tap')}</span>
            </button>
            <div class="me-tile" data-pv="button">
              <span class="me-tile-demo"><button type="button" class="me-pv-btn me-pressable">${t('pv_hold')}</button></span>
              <span class="me-tile-lbl">${t('pv_button')}</span>
            </div>
            <button type="button" class="me-tile" data-pv="switch">
              <span class="me-tile-demo"><span class="me-pv-switch"><span class="me-pv-knob"></span></span></span>
              <span class="me-tile-lbl">${t('pv_switch')}</span>
            </button>
            <button type="button" class="me-tile" data-pv="icon">
              <span class="me-tile-demo"><i class="me-pv-glyph fa-solid fa-gear"></i></span>
              <span class="me-tile-lbl">${t('m_icons')}</span>
            </button>
            <button type="button" class="me-tile" data-pv="menu">
              <span class="me-tile-demo"><i class="fa-solid fa-bars me-pv-dim"></i><span class="me-pv-menu" hidden><i></i><i></i><i></i></span></span>
              <span class="me-tile-lbl">${t('pv_menu')}</span>
            </button>
            <button type="button" class="me-tile" data-pv="toast">
              <span class="me-tile-demo"><span class="me-pv-toast" hidden><i class="fa-solid fa-check"></i>${t('pv_toastText')}</span></span>
              <span class="me-tile-lbl">${t('pv_toast')}</span>
            </button>
            <button type="button" class="me-tile" data-pv="list">
              <span class="me-tile-demo"><span class="me-pv-list"><i></i><i></i><i></i><i></i></span></span>
              <span class="me-tile-lbl">${t('pv_list')}</span>
            </button>
          </div>
          <p class="me-foot">${t('previewHint')}</p>
        </section>

        <section class="me-sec" data-sec="panel">
          <div class="me-label">${t('secPanel')}</div>
          <div class="me-card">
            <div class="me-pad">
              <div class="me-sub me-sub-in"></div>
              ${chips('panelIn')}
              <div class="me-split-out">
                <div class="me-sub">${t('panelOut')}</div>
                ${chips('panelOut')}
              </div>
            </div>
            ${sw('panelSplit', t('panelSplit'), '')}
          </div>
          <p class="me-foot">${t('panelNote')}</p>
        </section>

        <section class="me-sec" data-sec="tune">
          <div class="me-label">${t('secTune')}</div>
          <div class="me-card">
            <div class="me-row me-range"><span>${t('speed')}</span><input type="range" min="0.5" max="2" step="0.1" data-range="speed"><output></output></div>
            <div class="me-row me-range"><span>${t('amp')}</span><input type="range" min="0" max="3" step="0.1" data-range="amp"><output></output></div>
            <div class="me-row">
              <div class="me-lbl"><span>${t('panelBounce')}</span></div>
              <div class="me-seg me-seg-sm" role="radiogroup" data-choice="panelBounce" style="--n:2">
                <span class="me-ind"></span>
                <button type="button" role="radio" data-v="soft">${t('bounce_soft')}</button>
                <button type="button" role="radio" data-v="full">${t('bounce_full')}</button>
              </div>
            </div>
          </div>
          <p class="me-foot">${t('tuneNote')}</p>
        </section>

        ${fold('scope', t('secScope'), MODULES.map(m => sw(m, t('m_' + m), t('m_' + m + '_d'), 'data-mod')).join(''))}
        ${fold('compat', t('secCompat'), COMPAT.map(k => sw(k, t(k), t(k + '_d'))).join('') + `<div class="me-row me-action"><button type="button" class="me-reset">${t('reset')}</button></div>`)}
        <p class="me-ver">Motion Engine v${VERSION} · 时鸢</p>
      </div>
    </div>
  </div>
</div>`;
}

// ---------- FLIP：内容变化时，后面的分区从旧位置弹簧滑到新位置 ----------
function flip(mutate, scope = '.me-dim > .me-sec, .me-ver, .me-stage, .me-sec[data-sec="feel"] > .me-foot') {
    const items = [...wrap.querySelectorAll(scope)];
    const before = new Map(items.map(n => [n, n.getBoundingClientRect().top]));
    mutate();
    for (const [n, top] of before) {
        const dy = top - n.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) n.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 640, easing: SPRING.easing });
    }
}

// ---------- 风格卡片上的曲线 ----------
/** 用浏览器自己的缓动计算取样，cubic-bezier、linear()、steps() 都准确 */
function sample(easing, n = 48) {
    const pts = [];
    try {
        const anim = new Animation(new KeyframeEffect(null, [], { duration: 1000, easing, fill: 'both' }));
        for (let i = 0; i <= n; i++) {
            anim.currentTime = (i / n) * 1000;
            pts.push(anim.effect.getComputedTiming().progress ?? i / n);
        }
    } catch {
        for (let i = 0; i <= n; i++) pts.push(i / n);
    }
    return pts;
}

function curveSvg(f) {
    const pts = sample(f.in);
    const lo = Math.min(0, ...pts), hi = Math.max(1, ...pts);
    const y = (p) => 26 - ((p - lo) / (hi - lo)) * 22;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 100).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
    const base = y(1).toFixed(1);
    return `<svg class="me-curve" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1="${base}" y2="${base}" class="me-curve-goal"/>
      <path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderFeels(group, animate) {
    const box = wrap.querySelector('.me-feels');
    const build = () => {
        box.innerHTML = FEELS.filter(f => f.group === group).map(f => `
          <button type="button" class="me-feel" data-feel="${f.id}">
            <span class="me-feel-name">${name(f)}</span>
            <span class="me-feel-desc">${desc(f)}</span>
            ${curveSvg(f)}
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

function syncSeg(seg, index) {
    seg.style.setProperty('--i', String(index));
    seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
}

function syncGroup(group) {
    syncSeg(wrap.querySelector('.me-seg[role="tablist"]'), GROUPS.findIndex(g => g.id === group));
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
    wrap.querySelectorAll('[data-choice]').forEach(seg => syncSeg(seg, [...seg.querySelectorAll('button')].findIndex(b => b.dataset.v === s[seg.dataset.choice])));
    syncFeels();
    wrap.querySelector('.me-dim').classList.toggle('me-disabled', !s.enabled);

    // 面板开合：不分开设置时只显示一排，标题叫「开合方式」
    wrap.querySelector('[data-sec="panel"]').classList.toggle('me-split', !!s.panelSplit);
    wrap.querySelector('.me-sub-in').textContent = s.panelSplit ? t('panelIn') : t('panelForm');

    // 折叠分组的计数
    const count = (sec, on, all) => { wrap.querySelector(`[data-sec="${sec}"] .me-fold-count`).textContent = t('countOn').replace('{n}', on).replace('{m}', all); };
    count('scope', MODULES.filter(m => s.modules[m]).length, MODULES.length);
    count('compat', COMPAT.filter(k => s[k]).length, COMPAT.length);

    const selectRow = wrap.querySelector('[data-key="customSelect"]')?.closest('.me-row')?.querySelector('small');
    if (selectRow && !CSS.supports('appearance', 'base-select')) selectRow.textContent = t('customSelectNA');

    const status = wrap.querySelector('.me-status');
    let msg = '';
    if (!s.enabled) msg = t('enabledOff');
    else if (systemReduced()) msg = s.followSystemReduced ? t('sysReducedFollow') : t('sysReducedPlay');
    else if (SillyTavern.getContext().powerUserSettings?.reduced_motion) msg = s.followSystemReduced ? t('stReduced') : t('stReducedPlay');
    status.textContent = msg;
    status.hidden = !msg;
}

// ---------- 预览台 ----------
const pv = { panelOpen: true, panelToken: 0, switchOn: false, menuOpen: false, toastTimer: 0 };

async function panelDemo(kind) {
    const panel = wrap.querySelector('.me-pv-panel');
    const icon = wrap.querySelector('.me-pv-icon');
    const run = (dir) => previewPanel(panel, dir, icon);
    const token = ++pv.panelToken;
    if (kind === 'toggle') kind = pv.panelOpen ? 'close' : 'open';
    if (kind === 'replay') {
        // 已打开：先关再开；已关闭：直接打开
        if (pv.panelOpen) {
            pv.panelOpen = false;
            await run('out');
            if (token !== pv.panelToken) return;
            panel.style.visibility = 'hidden';
            await new Promise(r => setTimeout(r, 140));
            if (token !== pv.panelToken) return;
        }
        kind = 'open';
    }
    if (kind === 'open') {
        pv.panelOpen = true;
        panel.style.visibility = '';
        await run('in');
    } else {
        pv.panelOpen = false;
        const ok = await run('out');
        if (ok && token === pv.panelToken) panel.style.visibility = 'hidden';
    }
}

function switchDemo() {
    pv.switchOn = !pv.switchOn;
    const tile = wrap.querySelector('[data-pv="switch"]');
    const knob = wrap.querySelector('.me-pv-knob');
    tile.classList.toggle('me-on-state', pv.switchOn);
    const x = pv.switchOn ? '18px' : '0px';
    play(knob, 'pv', [[[{ translate: getComputedStyle(knob).translate === 'none' ? '0px 0px' : getComputedStyle(knob).translate }, { translate: `${x} 0px` }], { duration: dur('--me-rel-dur') || 300, easing: v('--me-rel') || 'ease-out' }]], { keep: true });
}

function menuDemo() {
    const menu = wrap.querySelector('.me-pv-menu');
    const D = dur('--me-in-dur');
    pv.menuOpen = !pv.menuOpen;
    if (pv.menuOpen) {
        menu.hidden = false;
        play(menu, 'pv', [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
            [[{ translate: `0 calc(${v('--me-y')} * 0.5)`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }],
        ]);
        menu.querySelectorAll('i').forEach((r, i) => play(r, 'pv', [[[{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }], { duration: D * 0.8, delay: 40 + i * dur('--me-stagger') * 0.6, easing: v('--me-in') }]]));
    } else {
        const O = dur('--me-out-dur');
        play(menu, 'pv', [
            [[{ opacity: 1 }, { opacity: 0 }], { duration: O, easing: v('--me-fade-out') }],
            [[{ translate: '0 0', scale: '1' }, { translate: `0 calc(${v('--me-y')} * 0.25)`, scale: v('--me-s-out') }], { duration: O, easing: v('--me-out') }],
        ]).then(ok => { if (ok && !pv.menuOpen) menu.hidden = true; });
    }
}

function toastDemo() {
    const toast = wrap.querySelector('.me-pv-toast');
    clearTimeout(pv.toastTimer);
    toast.hidden = false;
    const D = dur('--me-in-dur');
    play(toast, 'pv', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
        [[{ translate: `0 ${-(16 + parseFloat(v('--me-y')))}px`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }],
    ]);
    pv.toastTimer = setTimeout(() => {
        const O = dur('--me-out-dur');
        play(toast, 'pv', [
            [[{ opacity: 1 }, { opacity: 0 }], { duration: O, easing: v('--me-fade-out') }],
            [[{ translate: '0 0', scale: '1' }, { translate: '0 -10px', scale: '0.96' }], { duration: O, easing: v('--me-out') }],
        ]).then(ok => { if (ok) toast.hidden = true; });
    }, 1200 + D);
}

function listDemo() {
    const D = dur('--me-in-dur');
    const step = Math.max(dur('--me-stagger'), 20);
    wrap.querySelectorAll('.me-pv-list i').forEach((r, i) => play(r, 'pv', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, delay: i * step, easing: v('--me-fade') }],
        [[{ translate: `0 calc(${v('--me-y')} * 1.2 + 6px)`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, delay: i * step, easing: v('--me-in') }],
    ]));
}

/** 换风格、改参数后：面板、列表、图标一起演示一遍 */
function replayAll() {
    panelDemo('replay');
    listDemo();
    iconFx(wrap.querySelector('.me-pv-glyph'));
}

// ---------- 折叠分组 ----------
function toggleFold(sec) {
    const head = sec.querySelector('.me-fold-head');
    const open = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(open));
    sec.classList.toggle('me-open', open);
    // 后面的分区（另一个折叠组、版本号）跟着滑动由 CSS 的 grid 过渡带动，这里只给内容一个淡入
    if (open) sec.querySelectorAll('.me-row').forEach((r, i) => r.animate(
        [{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }],
        { duration: 420, delay: Math.min(i, 8) * 25, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' }));
}

function bind() {
    wrap.addEventListener('click', (e) => {
        const s = state.settings;
        const el = /** @type {HTMLElement} */ (e.target).closest('button');
        if (!el || !wrap.contains(el)) return;

        if (el.classList.contains('me-switch')) {
            el.classList.remove('me-pressing');
            if (el.dataset.key === 'panelSplit') {
                // 合并时关闭方式跟随打开方式
                flip(() => {
                    s.panelSplit = !s.panelSplit;
                    if (!s.panelSplit) s.panelOut = s.panelIn;
                    apply();
                }, '.me-dim > .me-sec:not([data-sec="feel"]), .me-ver');
                save();
                return;
            }
            if (el.dataset.key) s[el.dataset.key] = !s[el.dataset.key];
            if (el.dataset.mod) s.modules[el.dataset.mod] = !s.modules[el.dataset.mod];
            apply(); save();
            return;
        }
        if (el.classList.contains('me-fold-head')) { toggleFold(el.closest('.me-fold')); return; }
        if (el.dataset.group) {
            if (el.dataset.group !== shownGroup) { syncGroup(el.dataset.group); renderFeels(el.dataset.group, true); }
            return;
        }
        if (el.dataset.feel) {
            s.feel = el.dataset.feel;
            apply(); save();
            el.querySelector('.me-check')?.animate([{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 480, easing: SPRING.easing });
            replayAll();
            return;
        }
        const seg = el.closest('[data-choice]');
        if (seg) {
            s[seg.dataset.choice] = el.dataset.v;
            apply(); save();
            panelDemo('replay');
            return;
        }
        const chipBox = el.closest('.me-chips');
        if (chipBox) {
            s[chipBox.dataset.form] = el.dataset.v;
            if (!s.panelSplit) { s.panelIn = el.dataset.v; s.panelOut = el.dataset.v; }
            apply(); save();
            panelDemo(chipBox.dataset.form === 'panelOut' && s.panelSplit ? 'close' : 'replay');
            return;
        }
        switch (el.dataset.pv) {
            case 'panel': panelDemo('toggle'); return;
            case 'switch': switchDemo(); return;
            case 'icon': iconFx(el.querySelector('.me-pv-glyph')); return;
            case 'menu': menuDemo(); return;
            case 'toast': toastDemo(); return;
            case 'list': listDemo(); return;
        }
        if (el.classList.contains('me-reset')) {
            resetSettings();
            apply(); save();
            const g = FEELS.find(f => f.id === state.settings.feel)?.group || 'core';
            syncGroup(g); renderFeels(g, true);
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
    wrap.addEventListener('change', (e) => { if (/** @type {HTMLElement} */ (e.target).dataset.range) replayAll(); });
}

const currentGroup = () => FEELS.find(f => f.id === state.settings.feel)?.group || 'core';

export function buildPanel() {
    wrap = document.createElement('div');
    wrap.id = 'me-settings';
    wrap.className = 'me-ui';
    wrap.innerHTML = html();
    syncGroup(currentGroup());
    renderFeels(currentGroup(), false);
    bind();
    sync();
    onApply(sync);
    return wrap;
}
