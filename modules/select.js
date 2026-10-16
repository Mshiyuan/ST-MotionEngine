// 自绘下拉列表（实验，默认关闭）
// 原生 <select> 的选项列表由系统绘制，网页无法给它加动画。开启后，点下拉框时阻止系统列表，改为插件绘制的列表：
// 从下拉框处展开，选中后写回原 <select> 并触发 input / change 事件，酒馆和其他插件照常收到。
// 不接管：多选、列表型（size > 1）、禁用的、已被 select2 接管的、键盘打开的。
import { active, dur, v, play, state } from '../core/engine.js';

let open = null; // { select, list }

const eligible = (s) => s instanceof HTMLSelectElement && !s.multiple && !(s.size > 1) && !s.disabled
    && !s.classList.contains('select2-hidden-accessible') && !s.closest('.me-ui');

function build(select) {
    const list = document.createElement('div');
    list.className = 'me-select-list';
    list.setAttribute('role', 'listbox');
    const add = (opt, parent) => {
        const item = document.createElement('div');
        item.className = 'me-select-opt';
        item.setAttribute('role', 'option');
        item.textContent = opt.textContent;
        item.dataset.index = String(opt.index);
        if (opt.disabled) item.setAttribute('aria-disabled', 'true');
        if (opt.selected) item.setAttribute('aria-selected', 'true');
        parent.append(item);
    };
    for (const child of select.children) {
        if (child.tagName === 'OPTGROUP') {
            const g = document.createElement('div');
            g.className = 'me-select-group';
            g.textContent = /** @type {HTMLOptGroupElement} */ (child).label;
            list.append(g);
            for (const o of child.children) if (o.tagName === 'OPTION' && !o.hidden) add(o, list);
        } else if (child.tagName === 'OPTION' && !/** @type {HTMLOptionElement} */ (child).hidden) add(child, list);
    }
    return list;
}

function place(select, list) {
    const r = select.getBoundingClientRect();
    const vh = innerHeight, vw = innerWidth;
    const below = vh - r.bottom, above = r.top;
    const up = below < 220 && above > below;
    const maxH = Math.max(140, Math.min((up ? above : below) - 12, vh * 0.6));
    const width = Math.min(Math.max(r.width, 180), vw - 16);
    list.style.maxHeight = `${maxH}px`;
    list.style.width = `${width}px`;
    list.style.left = `${Math.min(Math.max(8, r.left), vw - width - 8)}px`;
    if (up) { list.style.bottom = `${vh - r.top + 4}px`; list.style.top = ''; } else { list.style.top = `${r.bottom + 4}px`; list.style.bottom = ''; }
    list.style.transformOrigin = up ? '50% 100%' : '50% 0';
    return up;
}

function show(select) {
    close(true);
    const list = build(select);
    document.body.append(list);
    const up = place(select, list);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
    open = { select, list };
    const D = dur('--me-in-dur');
    play(list, 'sel', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.5, easing: v('--me-fade') }],
        [[{ translate: `0 ${up ? 8 : -8}px`, scale: '1 0.92' }, { translate: '0 0', scale: '1' }], { duration: D, easing: v('--me-in') }],
    ]);
    const items = [...list.querySelectorAll('.me-select-opt')].slice(0, 12);
    if (!state.reduced) items.forEach((it, i) => play(it, 'sel-item', [[[{ opacity: 0, translate: `0 ${up ? 4 : -4}px` }, { opacity: 1, translate: '0 0' }], { duration: D * 0.8, delay: 40 + i * 18, easing: v('--me-in') }]]));

    list.addEventListener('click', (e) => {
        const it = /** @type {Element} */ (e.target).closest('.me-select-opt');
        if (!it || it.getAttribute('aria-disabled') === 'true') return;
        const idx = Number(it.dataset.index);
        if (select.selectedIndex !== idx) {
            select.selectedIndex = idx;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        close();
    });
}

function close(instant = false) {
    if (!open) return;
    const { list } = open;
    open = null;
    if (instant) { list.remove(); return; }
    const D = dur('--me-out-dur');
    play(list, 'sel', [[[{ opacity: 1, scale: '1' }, { opacity: 0, scale: '1 0.96' }], { duration: D, easing: v('--me-out') }]]).then(() => list.remove());
}

export function installSelect() {
    const on = () => active('inline') && state.settings?.customSelect;
    document.addEventListener('mousedown', (e) => {
        const s = /** @type {Element} */ (e.target);
        if (open && !open.list.contains(s)) { if (s !== open.select) close(); else { e.preventDefault(); close(); return; } }
        if (!on() || !eligible(s)) return;
        e.preventDefault();
        s.focus({ preventScroll: true });
        show(/** @type {HTMLSelectElement} */ (s));
    }, true);
    document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
    addEventListener('resize', () => close(true));
    document.addEventListener('scroll', (e) => { if (open && !open.list.contains(/** @type {Node} */ (e.target))) close(); }, true);
}
