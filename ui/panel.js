// 设置面板
// 完整设置（扩展面板里）和快捷面板（魔棒菜单打开的弹窗）共用 createUI：
//   完整：总开关 → 手感（分组与标签、风格卡片、标签设置、自定义风格编辑）→ 预览 → 面板开合 → 调节（含分模块配置）
//         → 作用范围（折叠，分 4 组；开启分模块设置时每项下面有幅度和速度）→ 兼容与性能（折叠）→ 恢复默认
//   快捷：总开关 → 手感（分组与卡片）→ 速度、幅度 → 完整设置
// 颜色只取酒馆主题变量：带文字的底色用正文色按比例混入透明，选中态用强调色，任何主题下文字都与底色分得清。
// 面板自身的动画（折叠、切换分组、出现与消失、拖动让位）使用当前所选风格的曲线和时长；开启分模块设置时用「折叠块」一项的值。
import { FEELS, GROUPS } from '../core/tokens.js';
import { PANEL_FORMS } from '../core/forms.js';
import { state, play, scoped, poseExtras } from '../core/engine.js';
import { t, name, desc } from '../core/i18n.js';
import { MODULES, SCOPE_GROUPS, apply, save, resetSettings, onApply, currentFeel, tuneOf } from '../core/settings.js';
import { CURVES, ORIGINS, RANGES, FORMS_IN, FORMS_OUT, MAX_CUSTOM, buildFeel, customFrom, sanitizeCustom, newId, exportStyle, importStyles, exportTune, importTune } from '../core/custom.js';
import { systemReduced } from '../core/guard.js';
import { previewPanel } from '../modules/drawers.js';
import { iconFx } from '../modules/icons.js';
import { toggleBlock } from '../modules/inline.js';

const VERSION = '0.5.0';
const COMPAT = ['prerender', 'lite', 'override', 'followSystemReduced', 'followPointer', 'haptics'];
const TABS = ['panel', 'button', 'switch', 'checkbox', 'icon', 'menu', 'toast', 'list'];
const BASE_GROUPS = [...GROUPS.map(g => g.id), 'custom'];
const LONG_PRESS_MS = 400;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ctx = () => SillyTavern.getContext();
/** 面板自身动画用的变量：跟随当前风格，分模块设置时用「折叠块」的值 */
const ui = () => scoped('inline');

// ---------- 酒馆弹窗、剪贴板 ----------
async function confirmBox(text) {
    const c = ctx();
    if (!c.callGenericPopup) return window.confirm(text);
    return (await c.callGenericPopup(esc(text), c.POPUP_TYPE.CONFIRM)) === (c.POPUP_RESULT?.AFFIRMATIVE ?? 1);
}

async function promptBox(text, value = '') {
    const c = ctx();
    if (!c.callGenericPopup) return window.prompt(text, value);
    const r = await c.callGenericPopup(esc(text), c.POPUP_TYPE.INPUT, value);
    return typeof r === 'string' ? r : null;
}

const toast = (msg, kind = 'success') => window.toastr?.[kind]?.(esc(msg));

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast(t('copied', { text }));
        return;
    } catch { /* 非安全上下文（局域网 http）没有 clipboard，改用下面的办法 */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (ok) { toast(t('copied', { text })); return; }
    const c = ctx();
    c.callGenericPopup?.(`<p>${esc(t('copyManual'))}</p><textarea class="text_pole" rows="2" readonly style="width:100%">${esc(text)}</textarea>`, c.POPUP_TYPE.TEXT);
}

// ---------- 风格卡片 ----------
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

/**
 * 自动标签：速度看「进度到 90% 所需的时间」（弹簧曲线的总时长包含很长的收尾，不代表看上去的快慢），
 * 回弹看曲线最高点超过终点多少
 */
const metaCache = new Map();
function feelMeta(f) {
    const key = `${f.in}|${f.inDur}`;
    if (metaCache.has(key)) return metaCache.get(key);
    const pts = sample(f.in, 96);
    const i90 = pts.findIndex(p => p >= 0.9);
    const t90 = (i90 < 0 ? 1 : i90 / 96) * f.inDur;
    const over = Math.max(...pts) - 1;
    const meta = {
        speed: t90 <= 100 ? 'fast' : t90 <= 330 ? 'mid' : 'slow',
        bounce: String(f.in).startsWith('steps') || over <= 0.01 ? 'none' : over < 0.08 ? 'light' : 'strong',
    };
    metaCache.set(key, meta);
    return meta;
}

/** 某个分组 / 标签下的风格：[{ id, title, sub, f, custom }] */
function feelsOf(group) {
    const s = state.settings;
    const builtin = FEELS.map(f => ({ id: f.id, title: name(f), sub: desc(f), f, custom: false }));
    const customs = s.customFeels.map(c => {
        const f = buildFeel(c);
        const curve = CURVES.find(x => x.id === c.curve);
        return { id: c.id, title: c.name, sub: curve ? name(curve) : '', f, custom: true };
    });
    if (group === 'custom') return customs;
    if (group.startsWith('tag:')) {
        const tag = group.slice(4);
        return [...builtin, ...customs].filter(x => (s.tagMap[x.id] || []).includes(tag));
    }
    return builtin.filter(x => x.f.group === group);
}

// ---------- 小部件 ----------
const sw = (key, label, note, attr = 'data-key') => `
  <div class="me-row">
    <div class="me-lbl"><span>${label}</span>${note ? `<small>${note}</small>` : ''}</div>
    <button type="button" class="me-switch" role="switch" ${attr}="${key}" aria-label="${esc(label)}"></button>
  </div>`;

// 「淡入淡出」不作为面板开合的选项（风格内部和自定义风格仍可用）
const chips = (key, forms = PANEL_FORMS.filter(f => f.id !== 'fade')) => `<div class="me-chips" data-form="${key}">${forms.map(f => `<button type="button" class="me-chip" data-v="${f.id}">${name(f)}</button>`).join('')}</div>`;

const range = (key, label, min, max, step, attr = 'data-range') => `
  <div class="me-row me-range"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" ${attr}="${key}"><output></output></div>`;

const fold = (id, title, body) => `
  <section class="me-sec me-fold" data-sec="${id}">
    <button type="button" class="me-fold-head" aria-expanded="false">
      <span class="me-fold-title">${title}</span>
      <span class="me-fold-count"></span>
      <span class="me-fold-icon"><i class="fa-solid fa-chevron-down"></i></span>
    </button>
    <div class="me-fold-body" style="display: none"><div class="me-card">${body}</div></div>
  </section>`;

const modRow = (m) => `
  <div class="me-mod" data-modrow="${m}">
    ${sw(m, t('m_' + m), t('m_' + m + '_d'), 'data-mod')}
    <div class="me-mod-tune">
      ${range(m, t('amp'), 0, 5, 0.1, 'data-tune-amp')}
      ${range(m, t('speed'), 0.5, 2, 0.1, 'data-tune-speed')}
    </div>
  </div>`;

const feelSection = (compact) => `
  <section class="me-sec" data-sec="feel">
    <div class="me-label">${t('secFeel')}</div>
    <div class="me-seg-wrap"><div class="me-seg" role="tablist"></div></div>
    <div class="me-tagbar" hidden>
      <button type="button" class="me-mini" data-tagact="rename">${t('tagRename')}</button>
      <button type="button" class="me-mini" data-tagact="delete">${t('tagDelete')}</button>
    </div>
    <div class="me-feels"></div>
    <p class="me-foot me-empty" hidden>${t('tagEmpty')}</p>
    ${compact ? '' : '<div class="me-sheet" hidden></div><div class="me-editor" hidden></div>'}
  </section>`;

function htmlFull() {
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
        ${sw('wandEntry', t('wandEntry'), t('wandEntry_d'))}
      </div>

      <div class="me-dim">
        ${feelSection(false)}

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
            </div>
            <div class="me-row">
              <div class="me-lbl"><span>${t('panelBounce')}</span></div>
              <div class="me-seg-sm" role="radiogroup" data-choice="panelBounce" style="--n:2">
                <span class="me-ind"></span>
                <button type="button" role="radio" data-v="area">${t('bounce_area')}</button>
                <button type="button" role="radio" data-v="uniform">${t('bounce_uniform')}</button>
              </div>
            </div>
            ${sw('perModule', t('perModule'), t('perModule_d'))}
            <div class="me-profiles">
              <div class="me-chips" data-prof></div>
              <div class="me-prof-acts">
                <button type="button" class="me-mini" data-profact="rename">${t('prof_rename')}</button>
                <button type="button" class="me-mini" data-profact="export">${t('prof_export')}</button>
                <button type="button" class="me-mini" data-profact="delete">${t('prof_delete')}</button>
              </div>
              <small class="me-prof-note">${t('prof_unsaved')}</small>
            </div>
          </div>
          <p class="me-foot">${t('tuneNote')}</p>
        </section>

        ${fold('scope', t('secScope'), SCOPE_GROUPS.map(g => `
          <div class="me-sg" data-sg="${g.id}">
            <div class="me-sg-head">
              <button type="button" class="me-sg-fold" data-sgfold="${g.id}" aria-expanded="true">
                <span class="me-sg-title">${t('sg_' + g.id)}</span>
                <i class="fa-solid fa-chevron-down me-sg-icon"></i>
              </button>
              <span class="me-sg-count"></span>
              <button type="button" class="me-switch me-switch-sm" role="switch" data-sg-all="${g.id}" aria-label="${t('sg_' + g.id)}"></button>
            </div>
            <div class="me-sg-tune">
              ${range(g.id, t('amp'), 0, 5, 0.1, 'data-sg-amp')}
              ${range(g.id, t('speed'), 0.5, 2, 0.1, 'data-sg-speed')}
            </div>
            <div class="me-sg-body">${g.mods.map(modRow).join('')}</div>
          </div>`).join(''))}
        ${fold('compat', t('secCompat'), COMPAT.map(k => sw(k, t(k), t(k + '_d'))).join(''))}
        <div class="me-card"><div class="me-row me-action"><button type="button" class="me-reset">${t('reset')}</button></div></div>
        <p class="me-ver">Motion Engine v${VERSION} · 时鸢</p>
      </div>
    </div>
  </div>
</div>`;
}

function htmlCompact() {
    return `
<div class="me-body">
  <div class="me-card">
    <div class="me-row me-master">
      <div class="me-lbl"><span>${t('enabled')}</span><small class="me-status"></small></div>
      <button type="button" class="me-switch" role="switch" data-key="enabled" aria-label="${t('enabled')}"></button>
    </div>
  </div>
  <div class="me-dim">
    ${feelSection(true)}
    <div class="me-card">
      ${range('speed', t('speed'), 0.5, 2, 0.1)}
      ${range('amp', t('amp'), 0, 3, 0.1)}
    </div>
    <button type="button" class="me-mini me-full" data-full="1"><i class="fa-solid fa-sliders"></i> ${t('wandFull')}</button>
  </div>
</div>`;
}

/**
 * 生成一份设置界面
 * @param {{ compact?: boolean }} [opt]
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function createUI({ compact = false } = {}) {
    const wrap = document.createElement('div');
    wrap.id = compact ? 'me-quick' : 'me-settings';
    wrap.className = 'me-ui';
    wrap.innerHTML = compact ? htmlCompact() : htmlFull();
    const $ = (sel) => wrap.querySelector(sel);
    const $$ = (sel) => [...wrap.querySelectorAll(sel)];

    let shownGroup = null;
    let tab = 'panel';
    let sheetFor = null;
    let structSig = '';
    let justDragged = false;

    // ---------- FLIP：内容变化时，后面的分区从旧位置滑到新位置 ----------
    function flip(mutate, scope = '.me-dim > .me-sec, .me-dim > .me-card, .me-ver, .me-editor, .me-sheet, .me-sec[data-sec="feel"] > .me-foot') {
        const items = $$(scope);
        const before = new Map(items.map(n => [n, n.getBoundingClientRect().top]));
        mutate();
        const { dur, v } = ui();
        const D = Math.min(800, dur('--me-in-dur') * 1.2) || 1;
        for (const [n, top] of before) {
            const dy = top - n.getBoundingClientRect().top;
            if (Math.abs(dy) > 0.5) n.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: D, easing: v('--me-in') });
        }
    }

    /** 一组元素按当前风格依次出现 */
    function staggerIn(els, base = 0) {
        const { dur, v } = ui();
        const D = dur('--me-in-dur');
        const step = Math.min(60, dur('--me-stagger'));
        const x = poseExtras('inline', 0.6);
        els.forEach((c, i) => c.animate(
            [{ opacity: 0, translate: `0 calc(${v('--me-y')} * 0.4 + 4px)`, scale: v('--me-s'), ...x.a }, { opacity: 1, translate: '0 0', scale: '1', ...x.b }],
            { duration: D || 1, delay: base + Math.min(i, 10) * step, easing: v('--me-in'), fill: 'backwards' }));
    }

    /**
     * 显示与否由 class 决定的若干块，从旧状态用折叠动画过渡到新状态。
     * list: [[元素, 改动后是否显示]]。先量好全部高度、再改、再统一量一次，
     * 扩展面板很长，每多读一次排版就多一次整页重排。
     */
    function morph(list, mutate) {
        const box = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { h: r.height, top: r.top, pt: cs.paddingTop, pb: cs.paddingBottom }; };
        // 读 innerHeight 也会强制排版，只在页面未改动时读一次
        const vh = innerHeight;
        const before = list.map(([el]) => box(el));
        mutate();
        const opening = [], closing = [];
        list.forEach(([el, open], i) => {
            if ((before[i].h > 0) !== open) (open ? opening : closing).push([el, before[i]]);
        });
        for (const [el] of [...closing, ...opening]) el.style.display = 'block';
        const after = opening.map(([el]) => box(el));
        // 整块在屏幕下方的看不见，直接切换，不占每帧的计算
        const below = (m) => m.top > vh;
        closing.forEach(([el, m]) => {
            if (below(m)) { el.style.display = ''; return; }
            toggleBlock(el, false, { light: true, h: m.h, pt: m.pt, pb: m.pb }).then(() => { el.style.display = ''; });
        });
        opening.forEach(([el], i) => {
            const m = after[i];
            if (below(m)) { el.style.display = ''; return; }
            toggleBlock(el, true, { light: true, h: m.h, pt: m.pt, pb: m.pb }).then(() => { el.style.display = ''; });
        });
    }

    /** 分类收起时显示整类的幅度、速度（仅分模块设置开启、且这一类有开着的项） */
    const sgTuned = (g, s = state.settings) => !!s.perModule && s.scopeFold.includes(g.id) && g.mods.some(m => s.modules[m]);

    /** 收起 / 展开作用范围里的一个分类 */
    function foldGroup(id, open) {
        const s = state.settings;
        const g = SCOPE_GROUPS.find(x => x.id === id);
        const box = $(`[data-sg="${id}"]`);
        const folded = s.scopeFold.includes(id);
        if (folded === !open) return;
        const next = { ...s, scopeFold: open ? s.scopeFold.filter(x => x !== id) : [...s.scopeFold, id] };
        spinChevron(box.querySelector('.me-sg-icon'));
        morph([[box.querySelector('.me-sg-body'), open], [box.querySelector('.me-sg-tune'), sgTuned(g, next)]], () => {
            s.scopeFold = next.scopeFold;
            syncGroups();
            save();
        });
    }

    function spinChevron(icon) {
        if (!icon) return;
        const { dur, v } = ui();
        // 调用时尚未改 class：收起着的转回 0°，展开着的转到 -90°
        const folded = !!icon.closest('.me-sg-folded');
        icon.animate([{ rotate: folded ? '-90deg' : '0deg' }, { rotate: folded ? '0deg' : '-90deg' }], { duration: dur('--me-in-dur') || 1, easing: v('--me-p-in') });
    }

    /** 分类的 class、计数、开关、整类滑块的值 */
    function syncGroups() {
        const s = state.settings;
        for (const g of SCOPE_GROUPS) {
            const box = $(`[data-sg="${g.id}"]`);
            if (!box) continue;
            const on = g.mods.filter(m => s.modules[m]).length;
            const folded = s.scopeFold.includes(g.id);
            box.classList.toggle('me-sg-folded', folded);
            box.classList.toggle('me-sg-tuned', sgTuned(g));
            box.querySelector('.me-sg-fold').setAttribute('aria-expanded', String(!folded));
            box.querySelector('.me-sg-count').textContent = `${on}/${g.mods.length}`;
            $(`[data-sg-all="${g.id}"]`).setAttribute('aria-checked', String(on === g.mods.length));
            // 整类的值：各项相同时显示该值，不同时显示平均值；拖动后整类改成同一个值
            for (const k of ['amp', 'speed']) {
                const el = box.querySelector(`[data-sg-${k}]`);
                const vals = g.mods.map(m => tuneOf(s, m)[k]);
                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                el.value = avg;
                setOutput(el, vals.every(x => x === vals[0]) ? `${avg.toFixed(1)}×` : `≈${avg.toFixed(1)}×`);
            }
        }
    }

    // ---------- 分组条（内置分组 + 自定义 + 用户标签 + 新建标签） ----------
    const groupIds = () => [...BASE_GROUPS, ...state.settings.tags.map(x => 'tag:' + x.id)];

    function renderSeg() {
        const seg = $('.me-seg[role="tablist"]');
        const s = state.settings;
        seg.innerHTML = `<span class="me-ind"></span>`
            + BASE_GROUPS.map(g => `<button type="button" role="tab" data-group="${g}">${t('group_' + g)}</button>`).join('')
            + s.tags.map(x => `<button type="button" role="tab" data-group="tag:${x.id}" class="me-tagtab"><i class="fa-solid fa-tag"></i>${esc(x.name)}</button>`).join('')
            + (compact ? '' : `<button type="button" class="me-seg-add" data-newtag="1" aria-label="${t('tagAddTitle')}"><i class="fa-solid fa-plus"></i> ${t('tagAdd')}</button>`);
        placeInd(false);
    }

    /** 指示块移到选中的分组下面；分组条横向滚动时把选中项滚进可见范围 */
    function placeInd(animate = true) {
        const seg = $('.me-seg[role="tablist"]');
        const btn = seg.querySelector(`[data-group="${CSS.escape(shownGroup || '')}"]`);
        seg.querySelectorAll('[data-group]').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
        const ind = seg.querySelector('.me-ind');
        if (!btn) { ind.style.opacity = '0'; return; }
        ind.style.opacity = '';
        if (!animate) ind.style.transition = 'none';
        ind.style.width = `${btn.offsetWidth}px`;
        ind.style.translate = `${btn.offsetLeft}px 0`;
        if (!animate) { ind.getBoundingClientRect(); ind.style.transition = ''; }
        const wrapEl = seg.parentElement;
        const l = btn.offsetLeft, r = l + btn.offsetWidth;
        if (l < wrapEl.scrollLeft || r > wrapEl.scrollLeft + wrapEl.clientWidth) wrapEl.scrollTo({ left: l - 24, behavior: animate ? 'smooth' : 'auto' });
    }

    // ---------- 风格卡片 ----------
    function card(x) {
        const m = feelMeta(x.f);
        const s = state.settings;
        const ntag = (s.tagMap[x.id] || []).filter(id => s.tags.some(tg => tg.id === id)).length;
        return `
          <button type="button" class="me-feel" data-feel="${x.id}"${x.custom ? ' data-custom="1"' : ''}>
            <span class="me-feel-name">${esc(x.title)}</span>
            <span class="me-feel-desc">${esc(x.sub)}</span>
            ${curveSvg(x.f.in)}
            <span class="me-feel-meta"><i>${t('sp_' + m.speed)}</i><i>${t('bo_' + m.bounce)}</i></span>
            ${compact ? '' : `<span class="me-feel-tagbtn${ntag ? ' me-has' : ''}" data-tagbtn="${x.id}" role="button" tabindex="0" aria-label="${t('tagBtn')}"><i class="fa-solid fa-tag"></i>${ntag ? `<b>${ntag}</b>` : ''}</span>`}
            <i class="me-check fa-solid fa-check"></i>
          </button>`;
    }

    function renderFeels(group, animate) {
        const box = $('.me-feels');
        const s = state.settings;
        const build = () => {
            const list = feelsOf(group);
            let html = list.map(card).join('');
            if (group === 'custom' && !compact) {
                if (s.customFeels.length < MAX_CUSTOM) html += `<button type="button" class="me-feel me-feel-new" data-new="1"><span class="me-feel-name"><i class="fa-solid fa-plus"></i> ${t('newCustom')}</span><span class="me-feel-desc">${t('newCustom_d')}</span></button>`;
                html += `<button type="button" class="me-feel me-feel-new" data-import="1"><span class="me-feel-name"><i class="fa-solid fa-file-import"></i> ${t('importCustom')}</span><span class="me-feel-desc">${t('importCustom_d')}</span></button>`;
            }
            box.innerHTML = html;
            const empty = $('.me-empty');
            empty.hidden = !(group.startsWith('tag:') && !list.length);
            $('.me-tagbar').hidden = compact || !group.startsWith('tag:');
            syncFeels();
            if (!compact) { renderEditor(); renderSheet(); }
        };
        shownGroup = group;
        placeInd(animate);
        if (!animate) { build(); return; }
        flip(build);
        staggerIn([...box.children]);
    }

    function syncFeels() {
        $$('.me-feel[data-feel]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.feel === state.settings.feel)));
    }

    // ---------- 标签 ----------
    function renderSheet() {
        const box = $('.me-sheet');
        if (!box) return;
        const s = state.settings;
        const x = sheetFor && feelsOf('custom').concat(FEELS.map(f => ({ id: f.id, title: name(f) }))).find(y => y.id === sheetFor);
        if (!x) { box.hidden = true; box.innerHTML = ''; sheetFor = null; return; }
        const mine = s.tagMap[x.id] || [];
        box.hidden = false;
        box.innerHTML = `
          <div class="me-card me-pad">
            <div class="me-sheet-head"><span class="me-sub">${esc(t('tagSheet', { name: x.title }))}</span>
              <button type="button" class="me-icon-btn" data-sheetclose="1" aria-label="${t('close')}"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="me-chips">
              ${s.tags.map(tg => `<button type="button" class="me-chip" data-tagtoggle="${tg.id}" aria-pressed="${mine.includes(tg.id)}">${esc(tg.name)}</button>`).join('')}
              <button type="button" class="me-chip me-chip-add" data-newtag="sheet"><i class="fa-solid fa-plus"></i> ${t('tagNew')}</button>
            </div>
          </div>`;
    }

    async function newTag(assignTo) {
        const n = (await promptBox(t('tagAddTitle')))?.replace(/[<>&"]/g, '').trim().slice(0, 12);
        if (!n) return;
        const s = state.settings;
        const id = 't-' + Date.now().toString(36);
        s.tags.push({ id, name: n });
        if (assignTo) s.tagMap[assignTo] = [...(s.tagMap[assignTo] || []), id];
        save();
        renderSeg();
        if (assignTo) { renderFeels(shownGroup, false); } else renderFeels('tag:' + id, true);
    }

    async function tagAction(kind) {
        const s = state.settings;
        const id = shownGroup?.slice(4);
        const tag = s.tags.find(x => x.id === id);
        if (!tag) return;
        if (kind === 'rename') {
            const n = (await promptBox(t('tagRename'), tag.name))?.replace(/[<>&"]/g, '').trim().slice(0, 12);
            if (!n) return;
            tag.name = n;
            save(); renderSeg(); placeInd(false);
            return;
        }
        if (!(await confirmBox(t('tagDeleteAsk', { name: tag.name })))) return;
        s.tags = s.tags.filter(x => x.id !== id);
        for (const k of Object.keys(s.tagMap)) {
            s.tagMap[k] = s.tagMap[k].filter(x => x !== id);
            if (!s.tagMap[k].length) delete s.tagMap[k];
        }
        save();
        renderSeg();
        renderFeels(currentGroup(), true);
    }

    // ---------- 自定义风格编辑 ----------
    const editing = () => (shownGroup === 'custom' ? state.settings.customFeels.find(c => c.id === state.settings.feel) : null);
    const UNITS = { inDur: 'ms', outDur: 'ms', y: 'px', sx: '×', sy: '×', blur: 'px', press: '×', stagger: 'ms', stiffness: '', damping: '' };

    function renderEditor() {
        const box = $('.me-editor');
        if (!box) return;
        const c = editing();
        box.hidden = !c;
        if (!c) { box.innerHTML = ''; return; }
        const formName = (id) => name(PANEL_FORMS.find(f => f.id === id) || { zh: id, en: id });
        const num = (k) => `
          <div class="me-row me-range"><span>${t('c_' + k)}</span><input type="range" min="${RANGES[k][0]}" max="${RANGES[k][1]}" step="${RANGES[k][3]}" data-c="${k}" value="${c[k]}"><output>${c[k]}${UNITS[k]}</output></div>`;
        const pick = (key, list) => `<div class="me-chips" data-c-chips="${key}">${list.map(x => `<button type="button" class="me-chip" data-v="${x.id}" aria-pressed="${x.id === c[key]}">${x.label}</button>`).join('')}</div>`;
        box.innerHTML = `
          <div class="me-card">
            <div class="me-tools">
              <button type="button" class="me-mini" data-cact="copy"><i class="fa-regular fa-copy"></i> ${t('c_copy')}</button>
              <button type="button" class="me-mini" data-cact="export"><i class="fa-solid fa-share-nodes"></i> ${t('c_export')}</button>
              <button type="button" class="me-mini me-danger" data-cact="delete"><i class="fa-regular fa-trash-can"></i> ${t('c_delete')}</button>
            </div>
            <div class="me-row"><span>${t('c_name')}</span><input type="text" class="text_pole me-c-name" maxlength="16" value="${esc(c.name)}"></div>
            <div class="me-pad">
              <div class="me-sub">${t('c_curve')}</div>
              ${pick('curve', CURVES.map(x => ({ id: x.id, label: name(x) })))}
            </div>
            ${c.curve === 'spring' ? num('stiffness') + num('damping') : num('inDur')}
            ${['outDur', 'y', 'sx', 'sy'].map(num).join('')}
            <div class="me-pad">
              <div class="me-sub">${t('c_origin')}</div>
              ${pick('origin', ORIGINS.map(x => ({ id: x.id, label: name(x) })))}
            </div>
            ${['blur', 'press', 'stagger'].map(num).join('')}
            <div class="me-pad">
              <div class="me-sub">${t('c_formIn')}</div>
              ${pick('formIn', FORMS_IN.map(id => ({ id, label: formName(id) })))}
              <div class="me-sub">${t('c_formOut')}</div>
              ${pick('formOut', FORMS_OUT.map(id => ({ id, label: formName(id) })))}
            </div>
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
        // 卡片上的曲线和标签随之更新
        const el = $(`.me-feel[data-feel="${s.feel}"]`);
        if (!el) return;
        const f = buildFeel(s.customFeels[i]);
        if (['curve', 'stiffness', 'damping', 'inDur'].includes(key)) {
            el.querySelector('.me-curve').outerHTML = curveSvg(f.in);
            const m = feelMeta(f);
            el.querySelector('.me-feel-meta').innerHTML = `<i>${t('sp_' + m.speed)}</i><i>${t('bo_' + m.bounce)}</i>`;
            const curve = CURVES.find(x => x.id === s.customFeels[i].curve);
            el.querySelector('.me-feel-desc').textContent = curve ? name(curve) : '';
        }
        if (key === 'name') el.querySelector('.me-feel-name').textContent = s.customFeels[i].name;
    }

    async function customAction(kind) {
        const s = state.settings;
        const c = s.customFeels.find(x => x.id === s.feel);
        if (!c) return;
        if (kind === 'export') { copyText(exportStyle(c)); return; }
        if (kind === 'copy') {
            if (s.customFeels.length >= MAX_CUSTOM) { toast(t('importFull', { n: MAX_CUSTOM }), 'warning'); return; }
            const dup = sanitizeCustom({ ...c, id: newId(), name: `${c.name} 2`.slice(0, 16) });
            s.customFeels.splice(s.customFeels.indexOf(c) + 1, 0, dup);
            s.feel = dup.id;
            apply(); save();
            renderFeels('custom', false);
            return;
        }
        if (!(await confirmBox(t('c_deleteAsk', { name: c.name })))) return;
        s.customFeels = s.customFeels.filter(x => x.id !== c.id);
        delete s.tagMap[c.id];
        s.feel = 'smooth';
        apply(); save();
        flip(() => renderFeels('custom', false));
    }

    async function importCustom() {
        const s = state.settings;
        const text = await promptBox(t('importStylePrompt'));
        if (!text) return;
        let list;
        try { list = importStyles(text); } catch { toast(t('importBad'), 'error'); return; }
        const room = MAX_CUSTOM - s.customFeels.length;
        if (room <= 0) { toast(t('importFull', { n: MAX_CUSTOM }), 'warning'); return; }
        list = list.slice(0, room).map(c => ({ ...c, id: newId() }));
        s.customFeels.push(...list);
        s.feel = list[0].id;
        apply(); save();
        renderFeels('custom', false);
        toast(t('imported', { name: list.map(c => c.name).join('、') }));
    }

    // ---------- 拖动排序（自定义风格） ----------
    // 按住约 0.4 秒后卡片浮起，可以拖到其他位置；没到时间就移动，视为滚动页面。
    // 浮起后在 touchmove 中阻止默认行为，页面不再滚动。
    const drag = { timer: 0, el: null, id: null, x0: 0, y0: 0, base: null, pointerId: 0, active: false };

    function dragCancel() {
        clearTimeout(drag.timer);
        drag.timer = 0;
        if (!drag.active) drag.el = null;
    }

    /** 卡片在排版中的位置（视口坐标）。用 offsetLeft/Top 计算，不受正在播放的让位动画和浮起缩放影响 */
    function slot(c) {
        const box = $('.me-feels');
        const r = box.getBoundingClientRect();
        const left = r.left + c.offsetLeft - box.offsetLeft, top = r.top + c.offsetTop - box.offsetTop;
        return { left, top, right: left + c.offsetWidth, bottom: top + c.offsetHeight };
    }

    function dragStart() {
        const el = drag.el;
        if (!el) return;
        drag.active = true;
        drag.base = slot(el);
        el.classList.add('me-lift');
        wrap.classList.add('me-dragging');
        try { el.setPointerCapture(drag.pointerId); } catch { /* 指针已经抬起 */ }
        if (state.settings.haptics) try { navigator.vibrate?.(10); } catch { /* 忽略 */ }
    }

    function dragMove(e) {
        const el = drag.el;
        const cards = $$('.me-feel[data-custom]');
        // 找到手指下面的卡片，把被拖动的卡片插到它的位置；其余卡片按当前风格滑到新位置
        // 判断用排版位置：其他卡片正在让位时，屏幕上的位置还在旧处，按屏幕位置判断会立刻换回去
        const over = cards.find(c => {
            if (c === el) return false;
            const r = slot(c);
            return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        });
        if (over) {
            const before = new Map(cards.filter(c => c !== el).map(c => [c, c.getBoundingClientRect()]));
            const after = cards.indexOf(over) > cards.indexOf(el);
            over.parentElement.insertBefore(el, after ? over.nextSibling : over);
            const { dur, v } = ui();
            for (const [c, r] of before) {
                const n = c.getBoundingClientRect();
                const dx = r.left - n.left, dy = r.top - n.top;
                if (Math.abs(dx) + Math.abs(dy) > 0.5) c.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: dur('--me-in-dur') || 1, easing: v('--me-in') });
            }
        }
        // 被拖动的卡片随手指移动：位移 = 手指移动量 +（起始位置 − 当前排版位置）
        const now = slot(el);
        el.style.translate = `${e.clientX - drag.x0 + drag.base.left - now.left}px ${e.clientY - drag.y0 + drag.base.top - now.top}px`;
    }

    function dragEnd() {
        const el = drag.el;
        const s = state.settings;
        const order = $$('.me-feel[data-custom]').map(c => c.dataset.feel);
        s.customFeels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        save();
        const cur = el.style.translate;
        el.style.translate = '';
        el.classList.remove('me-lift');
        wrap.classList.remove('me-dragging');
        const { dur, v } = ui();
        el.animate([{ translate: cur || '0 0' }, { translate: '0 0' }], { duration: dur('--me-in-dur') || 1, easing: v('--me-in') });
        drag.active = false;
        drag.el = null;
        justDragged = true;
        setTimeout(() => { justDragged = false; }, 0);
    }

    function bindDrag() {
        wrap.addEventListener('pointerdown', (e) => {
            const el = /** @type {HTMLElement} */ (e.target).closest('.me-feel[data-custom]');
            if (!el || e.button > 0 || /** @type {HTMLElement} */ (e.target).closest('[data-tagbtn]')) return;
            dragCancel();
            Object.assign(drag, { el, id: el.dataset.feel, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, active: false });
            drag.timer = setTimeout(dragStart, LONG_PRESS_MS);
        });
        wrap.addEventListener('pointermove', (e) => {
            if (!drag.el) return;
            if (drag.active) { dragMove(e); return; }
            if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) dragCancel();
        });
        const up = () => { if (drag.active) dragEnd(); else dragCancel(); };
        wrap.addEventListener('pointerup', up);
        wrap.addEventListener('pointercancel', up);
        // 浮起之后阻止页面滚动（必须是非被动监听）
        wrap.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
        wrap.addEventListener('contextmenu', (e) => { if (drag.el) e.preventDefault(); });
    }

    // ---------- 分模块配置 ----------
    function renderProfiles() {
        const box = $('[data-prof]');
        if (!box) return;
        const s = state.settings;
        const cur = s.tuneProfile;
        box.innerHTML = `<button type="button" class="me-chip" data-profile="default" aria-pressed="${cur === 'default'}">${t('prof_default')}</button>`
            + s.tuneProfiles.map(p => `<button type="button" class="me-chip" data-profile="${p.id}" aria-pressed="${cur === p.id}">${esc(p.name)}</button>`).join('')
            + `<button type="button" class="me-chip me-chip-add" data-profnew="save"><i class="fa-solid fa-plus"></i> ${t('prof_save')}</button>`
            + `<button type="button" class="me-chip me-chip-add" data-profnew="import"><i class="fa-solid fa-file-import"></i> ${t('prof_import')}</button>`;
        $('.me-prof-acts').hidden = !s.tuneProfiles.some(p => p.id === cur);
        $('.me-prof-note').hidden = cur !== '';
    }

    async function profileNew(kind) {
        const s = state.settings;
        let prof;
        if (kind === 'save') {
            const n = (await promptBox(t('prof_savePrompt'), `${t('prof_default')} ${s.tuneProfiles.length + 1}`))?.replace(/[<>&"#@]/g, '').trim().slice(0, 16);
            if (!n) return;
            prof = { id: 'p-' + Date.now().toString(36), name: n, tune: structuredClone(s.tune) };
        } else {
            const text = await promptBox(t('importTunePrompt'));
            if (!text) return;
            let r;
            try { r = importTune(text); } catch { toast(t('importBad'), 'error'); return; }
            prof = { id: 'p-' + Date.now().toString(36), name: r.name, tune: r.tune };
            toast(t('imported', { name: r.name }));
        }
        s.tuneProfiles.push(prof);
        s.tuneProfile = prof.id;
        s.tune = structuredClone(prof.tune);
        apply(); save();
    }

    async function profileAction(kind) {
        const s = state.settings;
        const p = s.tuneProfiles.find(x => x.id === s.tuneProfile);
        if (!p) return;
        if (kind === 'export') { copyText(exportTune(p.name, p.tune)); return; }
        if (kind === 'rename') {
            const n = (await promptBox(t('prof_rename'), p.name))?.replace(/[<>&"#@]/g, '').trim().slice(0, 16);
            if (!n) return;
            p.name = n;
            save(); renderProfiles();
            return;
        }
        if (!(await confirmBox(t('prof_deleteAsk', { name: p.name })))) return;
        s.tuneProfiles = s.tuneProfiles.filter(x => x !== p);
        s.tuneProfile = '';
        save(); renderProfiles();
    }

    function pickProfile(id) {
        const s = state.settings;
        s.tuneProfile = id;
        s.tune = id === 'default' ? {} : structuredClone(s.tuneProfiles.find(p => p.id === id)?.tune || {});
        apply(); save();
    }

    // ---------- 同步 ----------
    function syncSeg(seg, index) {
        seg.style.setProperty('--i', String(Math.max(0, index)));
        seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
    }

    function syncTabs() {
        $$('.me-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        const st = $('.me-stage');
        if (st) st.dataset.show = tab;
    }

    function setOutput(input, text) {
        input.parentElement.querySelector('output').textContent = text;
    }

    /** 自定义风格或标签有增删改时重新生成卡片（另一份界面修改后，这一份同步更新） */
    const signature = () => {
        const s = state.settings;
        return JSON.stringify([s.customFeels.map(c => [c.id, c.name, c.curve]), s.tags, s.tagMap]);
    };

    function sync() {
        const s = state.settings;
        $$('[data-key]').forEach(el => el.setAttribute('aria-checked', String(!!s[el.dataset.key])));
        $$('[data-mod]').forEach(el => el.setAttribute('aria-checked', String(!!s.modules[el.dataset.mod])));
        $$('[data-range]').forEach(el => { el.value = s[el.dataset.range]; setOutput(el, `${Number(s[el.dataset.range]).toFixed(1)}×`); });
        $$('[data-tune-amp]').forEach(el => { const v = tuneOf(s, el.dataset.tuneAmp).amp; el.value = v; setOutput(el, `${Number(v).toFixed(1)}×`); });
        $$('[data-tune-speed]').forEach(el => { const v = tuneOf(s, el.dataset.tuneSpeed).speed; el.value = v; setOutput(el, `${Number(v).toFixed(1)}×`); });
        $$('.me-chips[data-form]').forEach(box => box.querySelectorAll('.me-chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.v === s[box.dataset.form]))));
        $$('[data-choice]').forEach(seg => syncSeg(seg, [...seg.querySelectorAll('button')].findIndex(b => b.dataset.v === s[seg.dataset.choice])));
        $('.me-dim').classList.toggle('me-disabled', !s.enabled);

        const sig = signature();
        if (sig !== structSig) {
            structSig = sig;
            renderSeg();
            const g = groupIds().includes(shownGroup) ? shownGroup : currentGroup();
            renderFeels(g, false);
        } else syncFeels();

        if (!compact) {
            $('[data-sec="panel"]').classList.toggle('me-split', !!s.panelSplit);
            $('.me-sub-in').textContent = s.panelSplit ? t('panelIn') : t('panelForm');
            wrap.classList.toggle('me-permod-on', !!s.perModule);
            renderProfiles();
            const count = (sec, on, all) => { $(`[data-sec="${sec}"] .me-fold-count`).textContent = t('countOn', { n: on, m: all }); };
            count('scope', MODULES.filter(m => s.modules[m]).length, MODULES.length);
            count('compat', COMPAT.filter(k => s[k]).length, COMPAT.length);
            syncGroups();
            const selectNote = $('[data-mod="select"]')?.closest('.me-row')?.querySelector('small');
            if (selectNote && !CSS.supports('appearance', 'base-select')) selectNote.textContent = t('m_selectNA');
        }

        const status = $('.me-status');
        let msg = '';
        if (!s.enabled) msg = t('enabledOff');
        else if (systemReduced()) msg = s.followSystemReduced ? t('sysReducedFollow') : t('sysReducedPlay');
        else if (ctx().powerUserSettings?.reduced_motion) msg = s.followSystemReduced ? t('stReduced') : t('stReducedPlay');
        status.textContent = msg;
        status.hidden = !msg;
    }

    // ---------- 预览 ----------
    const pv = { panelOpen: true, panelToken: 0, switchOn: false, checkOn: false, menuOpen: false, toastTimer: 0 };

    async function panelDemo(kind) {
        const panel = $('.me-pv-panel');
        const icon = $('.me-pv-icon');
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
        const knob = $('.me-pv-knob');
        $('.me-pv-switch').classList.toggle('me-on-state', pv.switchOn);
        const cur = getComputedStyle(knob).translate;
        play(knob, 'pv', [[[{ translate: cur === 'none' ? '0px 0px' : cur }, { translate: `${pv.switchOn ? 18 : 0}px 0px` }], { duration: dur('--me-rel-dur') || 300, easing: v('--me-rel') || 'ease-out' }]], { keep: true });
    }

    function checkboxDemo() {
        const { dur, v } = scoped('checkbox');
        pv.checkOn = !pv.checkOn;
        const box = $('.me-pv-check');
        box.classList.toggle('me-on-state', pv.checkOn);
        const press = Number(String(v('--me-press')).split(' ').pop()) || 0.95;
        play(box, 'pv', [[[{ scale: '1', easing: 'ease-out' }, { scale: String(Math.max(0.6, 1 - (1 - press) * 2.5)), offset: 0.25, easing: v('--me-rel') }, { scale: '1' }], { duration: Math.max(240, dur('--me-rel-dur')) }]]);
        if (pv.checkOn) play(box.querySelector('i'), 'pv', [[[{ scale: '0.3' }, { scale: '1' }], { duration: Math.max(200, dur('--me-in-dur') * 0.8), easing: v('--me-rel') }]]);
    }

    function menuDemo() {
        const { dur, v } = scoped('menus');
        const menu = $('.me-pv-menu');
        const D = dur('--me-in-dur');
        const x = poseExtras('menus');
        pv.menuOpen = !pv.menuOpen;
        if (pv.menuOpen) {
            menu.hidden = false;
            play(menu, 'pv', [
                [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
                [[{ translate: `0 calc(${v('--me-y')} * 0.5)`, scale: v('--me-s'), ...x.a }, { translate: '0 0', scale: '1', ...x.b }], { duration: D, easing: v('--me-in') }],
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
        const el = $('.me-pv-toast');
        clearTimeout(pv.toastTimer);
        el.hidden = false;
        const D = dur('--me-in-dur');
        const x = poseExtras('toasts');
        play(el, 'pv', [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
            [[{ translate: `0 ${-(16 + parseFloat(v('--me-y')))}px`, scale: v('--me-s'), ...x.a }, { translate: '0 0', scale: '1', ...x.b }], { duration: D, easing: v('--me-in') }],
        ]);
        pv.toastTimer = setTimeout(() => {
            const O = dur('--me-out-dur');
            play(el, 'pv', [
                [[{ opacity: 1 }, { opacity: 0 }], { duration: O, easing: v('--me-fade-out') }],
                [[{ translate: '0 0', scale: '1' }, { translate: '0 -10px', scale: '0.96' }], { duration: O, easing: v('--me-out') }],
            ]).then(ok => { if (ok) el.hidden = true; });
        }, 1200 + D);
    }

    function listDemo() {
        const { dur, v } = scoped('messages');
        const D = dur('--me-in-dur');
        const step = Math.max(dur('--me-stagger'), 20);
        const x = poseExtras('messages');
        $$('.me-pv-list i').forEach((r, i) => play(r, 'pv', [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, delay: i * step, easing: v('--me-fade') }],
            [[{ translate: `0 calc(${v('--me-y')} * 1.2 + 6px)`, scale: v('--me-s'), ...x.a }, { translate: '0 0', scale: '1', ...x.b }], { duration: D, delay: i * step, easing: v('--me-in') }],
        ]));
    }

    /** 演示当前标签页的样本 */
    function demo(auto = false) {
        if (compact) return;
        switch (tab) {
            case 'panel': panelDemo(auto ? 'replay' : 'toggle'); break;
            case 'button': {
                // 自动演示时模拟一次按下、松开
                if (!auto) break;
                const btn = $('.me-pv-btn');
                btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
                setTimeout(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), 220);
                break;
            }
            case 'switch': switchDemo(); break;
            case 'checkbox': checkboxDemo(); break;
            case 'icon': iconFx($('.me-pv-glyph')); break;
            case 'menu': if (auto && pv.menuOpen) { menuDemo(); setTimeout(menuDemo, 260); } else menuDemo(); break;
            case 'toast': toastDemo(); break;
            case 'list': listDemo(); break;
        }
    }

    // ---------- 折叠分组 ----------
    function toggleFold(sec, force) {
        const head = sec.querySelector('.me-fold-head');
        const open = force ?? head.getAttribute('aria-expanded') !== 'true';
        if ((head.getAttribute('aria-expanded') === 'true') === open) return;
        head.setAttribute('aria-expanded', String(open));
        sec.classList.toggle('me-open', open);
        // 与酒馆折叠块同一套动画（高度过渡），后面的分区随高度变化移动
        toggleBlock(sec.querySelector('.me-fold-body'), open, { light: true });
        if (open) staggerIn(sec.querySelectorAll('.me-sg-head, .me-row, .me-pad'), 40);
    }

    /** 分模块设置开关：整体的值收起、配置展开（或反过来）；各项下面的滑块随「作用范围」显示 */
    function togglePerModule() {
        const s = state.settings;
        s.perModule = !s.perModule;
        if (s.perModule && s.tuneProfile === 'default' && Object.keys(s.tune).length) s.tuneProfile = '';
        const on = s.perModule;
        const scope = $('[data-sec="scope"]');
        const scopeOpen = scope.classList.contains('me-open');
        // 整体的值、配置、各分类的整类滑块、（作用范围展开时）展开着的分类里各项的滑块，一起过渡
        const list = [[$('.me-global'), !on], [$('.me-profiles'), on]];
        for (const g of SCOPE_GROUPS) {
            const box = $(`[data-sg="${g.id}"]`);
            list.push([box.querySelector('.me-sg-tune'), sgTuned(g)]);
            if (scopeOpen && !s.scopeFold.includes(g.id)) box.querySelectorAll('.me-mod-tune').forEach(el => list.push([el, on]));
        }
        morph(list, () => { apply(); save(); });
        if (on && !scopeOpen) toggleFold(scope, true);
    }

    // ---------- 事件 ----------
    function bind() {
        wrap.addEventListener('click', (e) => {
            const s = state.settings;
            const target = /** @type {HTMLElement} */ (e.target);
            if (justDragged) return;
            if (target.closest('.me-stage') && !target.closest('.me-pv-btn')) { demo(); return; }
            const tagBtn = target.closest('[data-tagbtn]');
            if (tagBtn) {
                const id = tagBtn.dataset.tagbtn;
                flip(() => { sheetFor = sheetFor === id ? null : id; renderSheet(); });
                const sheet = $('.me-sheet');
                if (!sheet.hidden) staggerIn([sheet]);
                return;
            }
            const el = target.closest('button');
            if (!el || !wrap.contains(el)) return;

            if (el.classList.contains('me-switch')) {
                el.classList.remove('me-pressing');
                if (el.dataset.sgAll) {
                    const g = SCOPE_GROUPS.find(x => x.id === el.dataset.sgAll);
                    const allOn = g.mods.every(m => s.modules[m]);
                    // 整类关闭时收起，打开时展开
                    const box = $(`[data-sg="${g.id}"]`);
                    const fold = allOn ? [...new Set([...s.scopeFold, g.id])] : s.scopeFold.filter(x => x !== g.id);
                    if (fold.includes(g.id) !== s.scopeFold.includes(g.id)) spinChevron(box.querySelector('.me-sg-icon'));
                    const next = { ...s, scopeFold: fold, modules: Object.fromEntries(g.mods.map(m => [m, !allOn])) };
                    morph([[box.querySelector('.me-sg-body'), !fold.includes(g.id)], [box.querySelector('.me-sg-tune'), sgTuned(g, next)]], () => {
                        for (const m of g.mods) s.modules[m] = !allOn;
                        s.scopeFold = fold;
                        apply(); save();
                    });
                    return;
                }
                if (el.dataset.key === 'panelSplit') {
                    // 合并时关闭方式跟随打开方式
                    flip(() => {
                        s.panelSplit = !s.panelSplit;
                        if (!s.panelSplit) s.panelOut = s.panelIn;
                        apply();
                    });
                    save();
                    return;
                }
                if (el.dataset.key === 'perModule') { togglePerModule(); return; }
                if (el.dataset.key) s[el.dataset.key] = !s[el.dataset.key];
                if (el.dataset.mod) s.modules[el.dataset.mod] = !s.modules[el.dataset.mod];
                apply(); save();
                return;
            }
            if (el.classList.contains('me-fold-head')) { toggleFold(el.closest('.me-fold')); return; }
            if (el.dataset.sgfold) { foldGroup(el.dataset.sgfold, s.scopeFold.includes(el.dataset.sgfold)); return; }
            if (el.dataset.group) {
                if (el.dataset.group !== shownGroup) { sheetFor = null; renderFeels(el.dataset.group, true); }
                return;
            }
            if (el.dataset.newtag) { newTag(el.dataset.newtag === 'sheet' ? sheetFor : null); return; }
            if (el.dataset.tagact) { tagAction(el.dataset.tagact); return; }
            if (el.dataset.tagtoggle) {
                const id = el.dataset.tagtoggle;
                const cur = s.tagMap[sheetFor] || [];
                s.tagMap[sheetFor] = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
                if (!s.tagMap[sheetFor].length) delete s.tagMap[sheetFor];
                el.setAttribute('aria-pressed', String(!cur.includes(id)));
                save();
                structSig = signature();
                // 当前正在看这个标签时，卡片增减要反映出来
                if (shownGroup === 'tag:' + id) renderFeels(shownGroup, true);
                else {
                    const btn = $(`[data-tagbtn="${CSS.escape(sheetFor)}"]`);
                    const n = (s.tagMap[sheetFor] || []).length;
                    if (btn) { btn.classList.toggle('me-has', !!n); btn.innerHTML = `<i class="fa-solid fa-tag"></i>${n ? `<b>${n}</b>` : ''}`; }
                }
                return;
            }
            if (el.dataset.sheetclose) { flip(() => { sheetFor = null; renderSheet(); }); return; }
            if (el.dataset.full) { openFullSettings(wrap); return; }
            if (el.dataset.tab) {
                tab = el.dataset.tab;
                syncTabs();
                $('.me-stage').animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
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
                structSig = signature();
                flip(() => renderFeels('custom', false));
                return;
            }
            if (el.dataset.import) { importCustom(); return; }
            if (el.dataset.feel) {
                s.feel = el.dataset.feel;
                apply(); save();
                const { v } = ui();
                el.querySelector('.me-check')?.animate([{ scale: '0.3', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 480, easing: v('--me-rel') || 'ease-out' });
                if (shownGroup === 'custom' && !compact) flip(renderEditor);
                demo(true);
                return;
            }
            if (el.dataset.cact) { customAction(el.dataset.cact); return; }
            const cChips = el.closest('[data-c-chips]');
            if (cChips) {
                const key = cChips.dataset.cChips;
                setCustom(key, el.dataset.v);
                if (key === 'curve') flip(renderEditor);
                else cChips.querySelectorAll('.me-chip').forEach(c => c.setAttribute('aria-pressed', String(c === el)));
                demo(true);
                return;
            }
            if (el.dataset.profile) { pickProfile(el.dataset.profile); return; }
            if (el.dataset.profnew) { profileNew(el.dataset.profnew); return; }
            if (el.dataset.profact) { profileAction(el.dataset.profact); return; }
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
            if (el.classList.contains('me-reset')) {
                confirmBox(t('resetAsk')).then(ok => {
                    if (!ok) return;
                    resetSettings();
                    apply(); save();
                    renderFeels(currentGroup(), true);
                });
            }
        });
        $('.me-stage')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); demo(); } });
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
            if (el.dataset.tuneAmp || el.dataset.tuneSpeed || el.dataset.sgAmp || el.dataset.sgSpeed) {
                const k = el.dataset.tuneAmp || el.dataset.sgAmp ? 'amp' : 'speed';
                // 整类滑块：这一类的每一项改成同一个值
                const sg = el.dataset.sgAmp || el.dataset.sgSpeed;
                const mods = sg ? SCOPE_GROUPS.find(x => x.id === sg).mods : [el.dataset.tuneAmp || el.dataset.tuneSpeed];
                for (const m of mods) s.tune[m] = { ...tuneOf(s, m), [k]: Number(el.value) };
                // 选中的是已保存的配置时，改动直接存进这个配置；否则标为未保存
                const p = s.tuneProfiles.find(x => x.id === s.tuneProfile);
                if (p) p.tune = structuredClone(s.tune); else s.tuneProfile = '';
                apply(); save();
                return;
            }
            if (el.dataset.c) { setCustom(el.dataset.c, Number(el.value)); setOutput(el, `${el.value}${UNITS[el.dataset.c]}`); return; }
            if (el.classList.contains('me-c-name')) setCustom('name', el.value);
        });
        wrap.addEventListener('change', (e) => {
            const el = /** @type {HTMLElement} */ (e.target);
            if (el.dataset.range || el.dataset.c || el.dataset.tuneAmp || el.dataset.tuneSpeed || el.dataset.sgAmp || el.dataset.sgSpeed) demo(true);
        });
        if (!compact) bindDrag();
        // 分组条宽度变化（面板展开、旋转屏幕）时重新放指示块
        if (window.ResizeObserver) new ResizeObserver(() => placeInd(false)).observe($('.me-seg-wrap'));
    }

    const currentGroup = () => {
        const s = state.settings;
        if (s.customFeels.some(c => c.id === s.feel)) return 'custom';
        return FEELS.find(f => f.id === s.feel)?.group || 'calm';
    };

    shownGroup = currentGroup();
    syncTabs();
    bind();
    sync();
    const off = onApply(sync);
    return { el: wrap, destroy: off };
}

/** 打开扩展面板，滚动到本插件的设置并展开 */
export function openFullSettings(from) {
    from?.closest('dialog')?.querySelector('.popup-button-ok, .popup-button-close')?.click();
    const drawer = document.getElementById('rm_extensions_block');
    const toggle = document.querySelector('#extensions-settings-button .drawer-toggle');
    if (drawer && !drawer.classList.contains('openDrawer')) toggle?.click();
    setTimeout(() => {
        const box = document.getElementById('me-settings');
        if (!box) return;
        const content = box.querySelector(':scope > .inline-drawer > .inline-drawer-content');
        if (content && getComputedStyle(content).display === 'none') box.querySelector('.inline-drawer-toggle')?.click();
        setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }, 260);
}

export function buildPanel() {
    return createUI().el;
}
