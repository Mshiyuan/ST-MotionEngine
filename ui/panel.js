// 设置面板
// 结构（从上到下）：总开关 → 手感（分组、风格卡片、自定义风格编辑）→ 预览（分页标签 + 一块演示区）
// → 面板开合 → 调节（含分模块设置）→ 作用范围（折叠）→ 兼容与性能（折叠）→ 分享设置（折叠）。
// 颜色全部取酒馆主题变量；面板自身的变化（切换分组、选中、开关、折叠）也用弹簧和 FLIP。
import { FEELS, GROUPS, spring } from '../core/tokens.js';
import { PANEL_FORMS } from '../core/forms.js';
import { state, play, scoped } from '../core/engine.js';
import { t, name, desc } from '../core/i18n.js';
import { MODULES, apply, save, resetSettings, onApply, currentFeel, tuneOf } from '../core/settings.js';
import { CURVES, RANGES, buildFeel, customFrom, sanitizeCustom, exportCode, importCode } from '../core/custom.js';
import { systemReduced } from '../core/guard.js';
import { previewPanel } from '../modules/drawers.js';
import { iconFx } from '../modules/icons.js';

const VERSION = '0.4.0';
const SPRING = spring(170, 18);
const COMPAT = ['prerender', 'lite', 'override', 'followSystemReduced', 'followPointer', 'haptics'];
const TABS = ['panel', 'button', 'switch', 'checkbox', 'icon', 'menu', 'toast', 'list'];
const MAX_CUSTOM = 12;

let wrap = null;
let shownGroup = null;
let tab = 'panel';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const sw = (key, label, note, attr = 'data-key') => `
  <div class="me-row">
    <div class="me-lbl"><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>
    <button type="button" class="me-switch" role="switch" ${attr}="${key}" aria-label="${label}"></button>
  </div>`;

const chips = (key, forms = PANEL_FORMS) => `<div class="me-chips" data-form="${key}">${forms.map(f => `<button type="button" class="me-chip" data-v="${f.id}">${name(f)}</button>`).join('')}</div>`;

/** 可折叠的分组：标题行显示「已开 n/m」 */
const fold = (id, title, body, foot = '') => `
  <section class="me-sec me-fold" data-sec="${id}">
    <button type="button" class="me-fold-head" aria-expanded="false">
      <span class="me-fold-title">${title}</span>
      <span class="me-fold-count"></span>
      <span class="me-fold-icon"><i class="fa-solid fa-chevron-down"></i></span>
    </button>
    <div class="me-fold-body"><div class="me-fold-inner"><div class="me-card">${body}</div>${foot}</div></div>
  </section>`;

const range = (key, label, min, max, step, attr = 'data-range') => `
  <div class="me-row me-range"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" ${attr}="${key}"><output></output></div>`;

function html() {
    const groups = [...GROUPS.map(g => g.id), 'custom'];
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
          <div class="me-seg" role="tablist" style="--n:${groups.length}">
            <span class="me-ind"></span>
            ${groups.map(g => `<button type="button" role="tab" data-group="${g}">${t('group_' + g)}</button>`).join('')}
          </div>
          <div class="me-feels"></div>
          <div class="me-editor" hidden></div>
        </section>

        <section class="me-sec" data-sec="preview">
          <div class="me-label">${t('secPreview')}</div>
          <div class="me-tabs" role="tablist">${TABS.map(k => `<button type="button" role="tab" class="me-tab" data-tab="${k}">${t('pv_' + k)}</button>`).join('')}</div>
          <div class="me-stage" data-show="panel" role="button" tabindex="0">
            <div class="me-demo" data-demo="panel">
              <i class="me-pv-icon fa-solid fa-sliders"></i>
              <span class="me-pv-panel"><i></i><i></i><i></i></span>
            </div>
            <div class="me-demo" data-demo="button"><button type="button" class="me-pv-btn me-pressable">${t('pv_hold')}</button></div>
            <div class="me-demo" data-demo="switch"><span class="me-pv-switch"><span class="me-pv-knob"></span></span></div>
            <div class="me-demo" data-demo="checkbox"><span class="me-pv-check"><i class="fa-solid fa-check"></i></span></div>
            <div class="me-demo" data-demo="icon"><i class="me-pv-glyph fa-solid fa-gear"></i></div>
            <div class="me-demo" data-demo="menu"><i class="fa-solid fa-bars me-pv-dim"></i><span class="me-pv-menu" hidden><i></i><i></i><i></i></span></div>
            <div class="me-demo" data-demo="toast"><span class="me-pv-toast" hidden><i class="fa-solid fa-check"></i>${t('pv_toastText')}</span></div>
            <div class="me-demo" data-demo="list"><span class="me-pv-list"><i></i><i></i><i></i><i></i></span></div>
            <span class="me-stage-hint">${t('pv_tap')}</span>
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
            <div class="me-global">
              ${range('speed', t('speed'), 0.5, 2, 0.1)}
              ${range('amp', t('amp'), 0, 3, 0.1)}
              <div class="me-row">
                <div class="me-lbl"><span>${t('panelBounce')}</span></div>
                <div class="me-seg me-seg-sm" role="radiogroup" data-choice="panelBounce" style="--n:2">
                  <span class="me-ind"></span>
                  <button type="button" role="radio" data-v="area">${t('bounce_area')}</button>
                  <button type="button" role="radio" data-v="uniform">${t('bounce_uniform')}</button>
                </div>
              </div>
            </div>
            ${sw('perModule', t('perModule'), t('perModule_d'))}
            <div class="me-permod">
              ${MODULES.map(m => `
                <div class="me-mod-tune" data-mod-tune="${m}">
                  <div class="me-mod-name">${t('m_' + m)}</div>
                  ${range(m, t('amp'), 0, 5, 0.1, 'data-tune-amp')}
                  ${range(m, t('speed'), 0.5, 2, 0.1, 'data-tune-speed')}
                </div>`).join('')}
            </div>
          </div>
          <p class="me-foot">${t('tuneNote')}</p>
        </section>

        ${fold('scope', t('secScope'), MODULES.map(m => sw(m, t('m_' + m), t('m_' + m + '_d'), 'data-mod')).join(''))}
        ${fold('compat', t('secCompat'), COMPAT.map(k => sw(k, t(k), t(k + '_d'))).join('') + `<div class="me-row me-action"><button type="button" class="me-reset">${t('reset')}</button></div>`)}
        ${fold('share', t('secShare'), `
          <div class="me-pad me-share">
            <textarea class="me-code text_pole" rows="3" spellcheck="false" placeholder="${t('importPlaceholder')}"></textarea>
            <div class="me-share-btns">
              <button type="button" class="me-mini" data-share="export">${t('exportBtn')}</button>
              <button type="button" class="me-mini" data-share="import">${t('importBtn')}</button>
              <span class="me-share-msg"></span>
            </div>
          </div>`, `<p class="me-foot">${t('shareNote')}</p>`)}
        <p class="me-ver">Motion Engine v${VERSION} · 时鸢</p>
      </div>
    </div>
  </div>
</div>`;
}

// ---------- FLIP：内容变化时，后面的分区从旧位置弹簧滑到新位置 ----------
function flip(mutate, scope = '.me-dim > .me-sec, .me-ver, .me-editor, .me-sec[data-sec="feel"] > .me-foot') {
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

function curveSvg(easing) {
    const pts = sample(easing);
    const lo = Math.min(0, ...pts), hi = Math.max(1, ...pts);
    const y = (p) => 26 - ((p - lo) / (hi - lo)) * 22;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 100).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
    const base = y(1).toFixed(1);
    return `<svg class="me-curve" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1="${base}" y2="${base}" class="me-curve-goal"/>
      <path d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
}

const card = (id, title, sub, easing) => `
  <button type="button" class="me-feel" data-feel="${id}">
    <span class="me-feel-name">${esc(title)}</span>
    <span class="me-feel-desc">${esc(sub)}</span>
    ${curveSvg(easing)}
    <i class="me-check fa-solid fa-check"></i>
  </button>`;

function renderFeels(group, animate) {
    const box = wrap.querySelector('.me-feels');
    const build = () => {
        if (group === 'custom') {
            const list = state.settings.customFeels;
            box.innerHTML = list.map(c => card(c.id, c.name, CURVES.find(x => x.id === c.curve) ? name(CURVES.find(x => x.id === c.curve)) : '', buildFeel(c).in)).join('')
                + (list.length < MAX_CUSTOM ? `<button type="button" class="me-feel me-feel-new" data-new="1"><span class="me-feel-name"><i class="fa-solid fa-plus"></i> ${t('newCustom')}</span><span class="me-feel-desc">${t('newCustom_d')}</span></button>` : '');
        } else {
            box.innerHTML = FEELS.filter(f => f.group === group).map(f => card(f.id, name(f), desc(f), f.in)).join('');
        }
        syncFeels();
        renderEditor();
    };
    if (!animate) { build(); shownGroup = group; return; }
    flip(build);
    shownGroup = group;
    [...box.children].forEach((c, i) => c.animate(
        [{ opacity: 0, translate: '0 8px', scale: '0.96' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 560, delay: i * 40, easing: SPRING.easing, fill: 'backwards' }));
}

// ---------- 自定义风格编辑 ----------
const editing = () => (shownGroup === 'custom' ? state.settings.customFeels.find(c => c.id === state.settings.feel) : null);

const UNITS = { inDur: 'ms', outDur: 'ms', y: 'px', s: '×', blur: 'px', press: '×', stagger: 'ms', stiffness: '', damping: '' };
const STEPS = { inDur: 10, outDur: 10, y: 1, s: 0.01, blur: 1, press: 0.01, stagger: 5, stiffness: 10, damping: 1 };

function renderEditor() {
    const box = wrap.querySelector('.me-editor');
    const c = editing();
    box.hidden = !c;
    if (!c) { box.innerHTML = ''; return; }
    const formsIn = PANEL_FORMS.filter(f => f.id !== 'feel' && f.id !== 'none');
    const formsOut = PANEL_FORMS.filter(f => f.id !== 'feel');
    const num = (k) => `
      <div class="me-row me-range"><span>${t('c_' + k)}</span><input type="range" min="${RANGES[k][0]}" max="${RANGES[k][1]}" step="${STEPS[k]}" data-c="${k}" value="${c[k]}"><output>${c[k]}${UNITS[k]}</output></div>`;
    box.innerHTML = `
      <div class="me-card">
        <div class="me-row"><span>${t('c_name')}</span><input type="text" class="text_pole me-c-name" maxlength="16" value="${esc(c.name)}"></div>
        <div class="me-pad">
          <div class="me-sub">${t('c_curve')}</div>
          <div class="me-chips" data-c-chips="curve">${CURVES.map(x => `<button type="button" class="me-chip" data-v="${x.id}" aria-pressed="${x.id === c.curve}">${name(x)}</button>`).join('')}</div>
        </div>
        ${c.curve === 'spring' ? num('stiffness') + num('damping') : num('inDur')}
        ${['outDur', 'y', 's', 'blur', 'press', 'stagger'].map(num).join('')}
        <div class="me-pad">
          <div class="me-sub">${t('c_formIn')}</div>
          <div class="me-chips" data-c-chips="formIn">${formsIn.map(f => `<button type="button" class="me-chip" data-v="${f.id}" aria-pressed="${f.id === c.formIn}">${name(f)}</button>`).join('')}</div>
          <div class="me-sub">${t('c_formOut')}</div>
          <div class="me-chips" data-c-chips="formOut">${formsOut.map(f => `<button type="button" class="me-chip" data-v="${f.id}" aria-pressed="${f.id === c.formOut}">${name(f)}</button>`).join('')}</div>
        </div>
        <div class="me-row me-action"><button type="button" class="me-reset me-c-delete">${t('c_delete')}</button></div>
      </div>
      <p class="me-foot">${t('customNote')}</p>`;
}

/** 修改自定义风格的一项参数 */
function setCustom(key, value) {
    const s = state.settings;
    const i = s.customFeels.findIndex(c => c.id === s.feel);
    if (i < 0) return;
    s.customFeels[i] = sanitizeCustom({ ...s.customFeels[i], [key]: value });
    apply(); save();
    // 卡片上的曲线跟着变
    const cardEl = wrap.querySelector(`.me-feel[data-feel="${s.feel}"]`);
    if (cardEl && (key === 'curve' || key === 'stiffness' || key === 'damping')) cardEl.querySelector('.me-curve').outerHTML = curveSvg(buildFeel(s.customFeels[i]).in);
    if (key === 'name' && cardEl) cardEl.querySelector('.me-feel-name').textContent = s.customFeels[i].name;
}

// ---------- 同步 ----------
function syncSeg(seg, index) {
    seg.style.setProperty('--i', String(Math.max(0, index)));
    seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
}

function syncGroup(group) {
    const groups = [...GROUPS.map(g => g.id), 'custom'];
    syncSeg(wrap.querySelector('.me-seg[role="tablist"]'), groups.indexOf(group));
}

function syncFeels() {
    wrap.querySelectorAll('.me-feel[data-feel]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.feel === state.settings.feel)));
}

function syncTabs() {
    wrap.querySelectorAll('.me-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    wrap.querySelector('.me-stage').dataset.show = tab;
}

function setOutput(input, text) {
    input.parentElement.querySelector('output').textContent = text;
}

function sync() {
    if (!wrap) return;
    const s = state.settings;
    wrap.querySelectorAll('[data-key]').forEach(el => el.setAttribute('aria-checked', String(!!s[el.dataset.key])));
    wrap.querySelectorAll('[data-mod]').forEach(el => el.setAttribute('aria-checked', String(!!s.modules[el.dataset.mod])));
    wrap.querySelectorAll('[data-range]').forEach(el => { el.value = s[el.dataset.range]; setOutput(el, `${Number(s[el.dataset.range]).toFixed(1)}×`); });
    wrap.querySelectorAll('[data-tune-amp]').forEach(el => { const v = tuneOf(s, el.dataset.tuneAmp).amp; el.value = v; setOutput(el, `${Number(v).toFixed(1)}×`); });
    wrap.querySelectorAll('[data-tune-speed]').forEach(el => { const v = tuneOf(s, el.dataset.tuneSpeed).speed; el.value = v; setOutput(el, `${Number(v).toFixed(1)}×`); });
    wrap.querySelectorAll('.me-chips[data-form]').forEach(box => box.querySelectorAll('.me-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.v === s[box.dataset.form]))));
    wrap.querySelectorAll('[data-choice]').forEach(seg => syncSeg(seg, [...seg.querySelectorAll('button')].findIndex(b => b.dataset.v === s[seg.dataset.choice])));
    syncFeels();
    wrap.querySelector('.me-dim').classList.toggle('me-disabled', !s.enabled);

    // 面板开合：不分开设置时只显示一排，标题叫「开合方式」
    wrap.querySelector('[data-sec="panel"]').classList.toggle('me-split', !!s.panelSplit);
    wrap.querySelector('.me-sub-in').textContent = s.panelSplit ? t('panelIn') : t('panelForm');
    // 分模块设置：开启后隐藏整体的幅度、速度和「强度随面积」
    wrap.querySelector('[data-sec="tune"]').classList.toggle('me-permod-on', !!s.perModule);

    // 折叠分组的计数
    const count = (sec, on, all) => { wrap.querySelector(`[data-sec="${sec}"] .me-fold-count`).textContent = t('countOn').replace('{n}', on).replace('{m}', all); };
    count('scope', MODULES.filter(m => s.modules[m]).length, MODULES.length);
    count('compat', COMPAT.filter(k => s[k]).length, COMPAT.length);
    wrap.querySelector('[data-sec="share"] .me-fold-count').textContent = '';

    const selectNote = wrap.querySelector('[data-mod="select"]')?.closest('.me-row')?.querySelector('small');
    if (selectNote && !CSS.supports('appearance', 'base-select')) selectNote.textContent = t('m_selectNA');

    const status = wrap.querySelector('.me-status');
    let msg = '';
    if (!s.enabled) msg = t('enabledOff');
    else if (systemReduced()) msg = s.followSystemReduced ? t('sysReducedFollow') : t('sysReducedPlay');
    else if (SillyTavern.getContext().powerUserSettings?.reduced_motion) msg = s.followSystemReduced ? t('stReduced') : t('stReducedPlay');
    status.textContent = msg;
    status.hidden = !msg;
}

// ---------- 预览 ----------
const pv = { panelOpen: true, panelToken: 0, switchOn: false, checkOn: false, menuOpen: false, toastTimer: 0 };

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
    const { dur, v } = scoped('press');
    pv.switchOn = !pv.switchOn;
    const knob = wrap.querySelector('.me-pv-knob');
    wrap.querySelector('.me-pv-switch').classList.toggle('me-on-state', pv.switchOn);
    const cur = getComputedStyle(knob).translate;
    play(knob, 'pv', [[[{ translate: cur === 'none' ? '0px 0px' : cur }, { translate: `${pv.switchOn ? 18 : 0}px 0px` }], { duration: dur('--me-rel-dur') || 300, easing: v('--me-rel') || 'ease-out' }]], { keep: true });
}

function checkboxDemo() {
    const { dur, v } = scoped('checkbox');
    pv.checkOn = !pv.checkOn;
    const box = wrap.querySelector('.me-pv-check');
    box.classList.toggle('me-on-state', pv.checkOn);
    const press = Number(String(v('--me-press')).split(' ').pop()) || 0.95;
    play(box, 'pv', [[[{ scale: '1', easing: 'ease-out' }, { scale: String(Math.max(0.6, 1 - (1 - press) * 2.5)), offset: 0.25, easing: v('--me-rel') }, { scale: '1' }], { duration: Math.max(240, dur('--me-rel-dur')) }]]);
    if (pv.checkOn) play(box.querySelector('i'), 'pv', [[[{ scale: '0.3' }, { scale: '1' }], { duration: Math.max(200, dur('--me-in-dur') * 0.8), easing: v('--me-rel') }]]);
}

function menuDemo() {
    const { dur, v } = scoped('menus');
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
    const { dur, v } = scoped('toasts');
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
    const { dur, v } = scoped('messages');
    const D = dur('--me-in-dur');
    const step = Math.max(dur('--me-stagger'), 20);
    wrap.querySelectorAll('.me-pv-list i').forEach((r, i) => play(r, 'pv', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, delay: i * step, easing: v('--me-fade') }],
        [[{ translate: `0 calc(${v('--me-y')} * 1.2 + 6px)`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, delay: i * step, easing: v('--me-in') }],
    ]));
}

/** 演示当前标签页的样本 */
function demo(auto = false) {
    switch (tab) {
        case 'panel': panelDemo(auto ? 'replay' : 'toggle'); break;
        case 'button': {
            // 自动演示时模拟一次按下、松开
            if (!auto) break;
            const btn = wrap.querySelector('.me-pv-btn');
            btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
            setTimeout(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), 220);
            break;
        }
        case 'switch': switchDemo(); break;
        case 'checkbox': checkboxDemo(); break;
        case 'icon': iconFx(wrap.querySelector('.me-pv-glyph')); break;
        case 'menu': if (auto && pv.menuOpen) { menuDemo(); setTimeout(menuDemo, 260); } else menuDemo(); break;
        case 'toast': toastDemo(); break;
        case 'list': listDemo(); break;
    }
}

// ---------- 折叠分组 ----------
function toggleFold(sec) {
    const head = sec.querySelector('.me-fold-head');
    const open = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(open));
    sec.classList.toggle('me-open', open);
    // 后面的分区跟着滑动由 CSS 的 grid 过渡带动，这里只给内容一个淡入
    if (open) sec.querySelectorAll('.me-row, .me-pad').forEach((r, i) => r.animate(
        [{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }],
        { duration: 420, delay: Math.min(i, 8) * 25, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' }));
}

// ---------- 分享 ----------
async function share(kind) {
    const area = wrap.querySelector('.me-code');
    const msg = wrap.querySelector('.me-share-msg');
    const say = (text) => { msg.textContent = text; msg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); };
    if (kind === 'export') {
        area.value = exportCode(state.settings);
        area.select();
        try { await navigator.clipboard.writeText(area.value); say(t('exported')); } catch { say(t('exportedManual')); }
        return;
    }
    try {
        const data = importCode(area.value, MODULES);
        Object.assign(state.settings, data);
        apply(); save();
        const g = currentGroup();
        syncGroup(g); renderFeels(g, true);
        say(t('imported'));
    } catch { say(t('importBad')); }
}

function bind() {
    wrap.addEventListener('click', (e) => {
        const s = state.settings;
        const target = /** @type {HTMLElement} */ (e.target);
        if (target.closest('.me-stage') && !target.closest('.me-pv-btn')) { demo(); return; }
        const el = target.closest('button');
        if (!el || !wrap.contains(el)) return;

        if (el.classList.contains('me-switch')) {
            el.classList.remove('me-pressing');
            if (el.dataset.key === 'panelSplit') {
                // 合并时关闭方式跟随打开方式
                flip(() => {
                    s.panelSplit = !s.panelSplit;
                    if (!s.panelSplit) s.panelOut = s.panelIn;
                    apply();
                }, '.me-dim > .me-sec:not([data-sec="feel"]):not([data-sec="preview"]), .me-ver');
                save();
                return;
            }
            if (el.dataset.key === 'perModule') {
                flip(() => { s.perModule = !s.perModule; apply(); }, '.me-dim > .me-sec:not([data-sec="feel"]):not([data-sec="preview"]):not([data-sec="panel"]), .me-ver');
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
        if (el.dataset.tab) {
            tab = el.dataset.tab;
            syncTabs();
            const stage = wrap.querySelector('.me-stage');
            stage.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
            demo(true);
            return;
        }
        if (el.dataset.new) {
            const base = currentFeel(s);
            const c = customFrom(base.custom ? 'smooth' : base.id);
            c.name = `${t('group_custom')} ${s.customFeels.length + 1}`;
            s.customFeels.push(c);
            s.feel = c.id;
            apply(); save();
            flip(() => renderFeels('custom', false));
            return;
        }
        if (el.dataset.feel) {
            s.feel = el.dataset.feel;
            apply(); save();
            el.querySelector('.me-check')?.animate([{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 480, easing: SPRING.easing });
            if (shownGroup === 'custom') flip(renderEditor);
            demo(true);
            return;
        }
        const cChips = el.closest('[data-c-chips]');
        if (cChips) {
            const key = cChips.dataset.cChips;
            setCustom(key, el.dataset.v);
            if (key === 'curve') flip(renderEditor);
            else cChips.querySelectorAll('.me-chip').forEach(c => c.setAttribute('aria-pressed', String(c === el)));
            demo(true);
            return;
        }
        if (el.classList.contains('me-c-delete')) {
            s.customFeels = s.customFeels.filter(c => c.id !== s.feel);
            s.feel = 'smooth';
            apply(); save();
            flip(() => renderFeels('custom', false));
            return;
        }
        const seg = el.closest('[data-choice]');
        if (seg) {
            s[seg.dataset.choice] = el.dataset.v;
            apply(); save();
            demo(true);
            return;
        }
        const chipBox = el.closest('.me-chips[data-form]');
        if (chipBox) {
            s[chipBox.dataset.form] = el.dataset.v;
            if (!s.panelSplit) { s.panelIn = el.dataset.v; s.panelOut = el.dataset.v; }
            apply(); save();
            tab = 'panel'; syncTabs();
            panelDemo(chipBox.dataset.form === 'panelOut' && s.panelSplit ? 'close' : 'replay');
            return;
        }
        if (el.dataset.share) { share(el.dataset.share); return; }
        if (el.classList.contains('me-reset')) {
            resetSettings();
            apply(); save();
            const g = currentGroup();
            syncGroup(g); renderFeels(g, true);
        }
    });
    wrap.querySelector('.me-stage').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); demo(); } });
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
        const s = state.settings;
        if (el.dataset.range) { s[el.dataset.range] = Number(el.value); apply(); save(); return; }
        if (el.dataset.tuneAmp || el.dataset.tuneSpeed) {
            const m = el.dataset.tuneAmp || el.dataset.tuneSpeed;
            s.tune[m] = { ...tuneOf(s, m), [el.dataset.tuneAmp ? 'amp' : 'speed']: Number(el.value) };
            apply(); save();
            return;
        }
        if (el.dataset.c) { setCustom(el.dataset.c, Number(el.value)); setOutput(el, `${el.value}${UNITS[el.dataset.c]}`); return; }
        if (el.classList.contains('me-c-name')) setCustom('name', el.value);
    });
    wrap.addEventListener('change', (e) => {
        const el = /** @type {HTMLElement} */ (e.target);
        if (el.dataset.range || el.dataset.c || el.dataset.tuneAmp || el.dataset.tuneSpeed) demo(true);
    });
}

const currentGroup = () => {
    const s = state.settings;
    if (s.customFeels.some(c => c.id === s.feel)) return 'custom';
    return FEELS.find(f => f.id === s.feel)?.group || 'core';
};

export function buildPanel() {
    wrap = document.createElement('div');
    wrap.id = 'me-settings';
    wrap.className = 'me-ui';
    wrap.innerHTML = html();
    syncGroup(currentGroup());
    renderFeels(currentGroup(), false);
    syncTabs();
    bind();
    sync();
    onApply(sync);
    return wrap;
}
