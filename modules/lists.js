// 列表刷新：翻页、更改每页条数、标签筛选、搜索之后，列表项依次出现；聊天记录列表、背景图列表打开时同样处理。
//
// 性能做法：
//   - 只在用户操作之后才处理（翻页按钮、每页条数、标签、搜索框）；其余时间观察回调直接返回，不读不写；
//   - 列表换完一批（短时间内没有新的增删）才开始，一次批量读取位置，只给可见区域里的项做动画；
//     按行依次出现（同一行几乎同时），总时长只随行数增加，缩略图再小也不会拖得很长；
//   - 只动透明度和位移，在合成线程执行；
//   - 搜索时等输入和列表都停下来 260ms 后才播放，打字过程中不播放。
import { active, play, state, scoped, sized, afterPaint, stopGroup } from '../core/engine.js';

/** 安全上限：可见区域里最多这么多项做动画 */
const MAX_ITEMS = 120;

/** 分页列表：翻页控件 → 列表 */
const PAGED = [
    { pager: '#rm_print_characters_pagination', list: '#rm_print_characters_block' },
    { pager: '#persona_pagination_container', list: '#user_avatar_block' },
    { pager: '#world_info_pagination', list: '#world_popup_entries_list' },
    { pager: '#rm_group_add_members_pagination', list: '#rm_group_add_members' },
    { pager: '#rm_group_members_pagination', list: '#rm_group_members' },
];

/** 搜索框、标签筛选 → 列表 */
const FILTERS = [
    { input: '#character_search_bar', tags: '#rm_characters_block .rm_tag_filter', list: '#rm_print_characters_block' },
    { input: '#persona_search_bar', list: '#user_avatar_block' },
    { input: '#world_info_search', list: '#world_popup_entries_list' },
];

/** 列表 → { dir, until, settle, timer } */
const armed = new Map();

function arm(list, dir, settle = 60) {
    if (!list || !active('lists') || state.reduced) return;
    const prev = armed.get(list);
    clearTimeout(prev?.timer);
    armed.set(list, { dir, settle, until: performance.now() + 2500, timer: 0 });
}

/** 列表内容变化：等这一批换完（settle 毫秒内没有新变化）再播放 */
function onMutate(list) {
    const a = armed.get(list);
    if (!a) return;
    if (performance.now() > a.until) { armed.delete(list); return; }
    clearTimeout(a.timer);
    a.timer = setTimeout(() => {
        armed.delete(list);
        reveal(list, a.dir);
    }, a.settle);
}

/** 可见区域里的项按行依次出现 */
function reveal(list, dir = 0) {
    animateItems(visibleItems(list), dir);
}

/** 背景缩略图：正在播放的一批。开始滑动时立即结束（几十个正在动的图层一起滚动，手机上第一次滑动会卡） */
let bgBatch = null;

/** 只读：可见区域里的项和位置 */
function visibleItems(list, mod = 'lists') {
    if (!active(mod) || !list.isConnected) return [];
    const kids = [...list.children].slice(0, 240);
    // 一次读取全部位置，不穿插写入，只排版一次
    const rects = kids.map(el => el.getBoundingClientRect());
    const items = [];
    for (let i = 0; i < kids.length && items.length < MAX_ITEMS; i++) {
        const r = rects[i];
        if (r.width && r.height && r.bottom > 0 && r.top < innerHeight) items.push([kids[i], r]);
    }
    return items;
}

function animateItems(items, dir = 0, mod = 'lists') {
    if (!items.length) return null;
    const { dur, v } = scoped(mod);
    const step = Math.min(35, Math.max(dur('--me-stagger') * 0.6, 12));
    // 行号：顶边相差不到半个项高的算同一行；同一行里从左到右稍微错开
    let row = -1, col = 0, rowTop = -Infinity;
    // 各项错开开始、错开结束。每项结束时各自清理的话，每次清理都要重算一次样式（酒馆的 :has() 规则使之波及整页），
    // 分散在很多帧里。这里全部播完后一起清理，只重算一次
    const gen = {};
    const done = [];
    items.forEach(([el, r]) => {
        const z = sized(mod, r.width, r.height);
        if (r.top - rowTop > r.height / 2) { row++; col = 0; rowTop = r.top; } else col++;
        const delay = row * step + col * step * 0.3;
        const from = dir ? `${dir * 28 * z.af}px 0` : `0 calc(${z.y} + ${8 * z.af}px)`;
        revealGen.set(el, gen);
        // 透明度不跟着逐排延迟：延迟期间整片是空的，面板已经出来了却看不到内容（先白一下）。
        // 内容一开始就半透明可见，很快到位；位移和缩放按排错开
        done.push(play(el, 'list', [
            [[{ opacity: 0.35 }, { opacity: 1 }], { duration: Math.min(dur('--me-in-dur') * 0.5, 240), easing: v('--me-fade') }],
            [[{ translate: from, scale: z.s }, { translate: '0 0', scale: '1' }], { duration: z.D, delay, easing: z.ease }],
        ], { keep: true }));
    });
    const finish = () => {
        for (const [el] of items) if (revealGen.get(el) === gen) { revealGen.delete(el); stopGroup(el, 'list'); }
    };
    Promise.allSettled(done).then(finish);
    return finish;
}

/** 列表项 → 最近一次播放它的那一批（新的一批开始后，旧批次的清理不再碰它） */
const revealGen = new WeakMap();

function observe(list) {
    new MutationObserver((records) => {
        if (!armed.has(list)) return;
        if (records.some(r => r.addedNodes.length)) onMutate(list);
    }).observe(list, { childList: true });
}

export function installLists() {
    const q = (s) => document.querySelector(s);

    for (const { list } of [...PAGED, ...FILTERS]) { const el = q(list); if (el && !el.dataset.meList) { el.dataset.meList = '1'; observe(el); } }

    // 翻页、每页条数
    document.addEventListener('click', (e) => {
        const li = /** @type {Element} */ (e.target).closest?.('.paginationjs-prev, .paginationjs-next, .paginationjs-page');
        if (!li || li.classList.contains('disabled') || li.classList.contains('active')) return;
        const p = PAGED.find(x => li.closest(x.pager));
        if (!p) return;
        let dir = 1;
        if (li.classList.contains('paginationjs-prev')) dir = -1;
        else if (li.classList.contains('paginationjs-page')) {
            const cur = Number(li.parentElement?.querySelector('.active')?.getAttribute('data-num'));
            const to = Number(li.getAttribute('data-num'));
            if (cur && to) dir = to < cur ? -1 : 1;
        }
        arm(q(p.list), dir);
    }, true);
    document.addEventListener('change', (e) => {
        const sel = /** @type {Element} */ (e.target);
        if (sel.tagName !== 'SELECT') return;
        const p = PAGED.find(x => sel.closest(x.pager));
        if (p) arm(q(p.list), 0);
    }, true);

    // 标签筛选、搜索
    document.addEventListener('click', (e) => {
        const tag = /** @type {Element} */ (e.target).closest?.('.tag');
        if (!tag) return;
        const f = FILTERS.find(x => x.tags && tag.closest(x.tags));
        if (f) arm(q(f.list), 0);
    }, true);
    document.addEventListener('input', (e) => {
        const el = /** @type {Element} */ (e.target);
        const f = FILTERS.find(x => el.matches?.(x.input));
        if (f) arm(q(f.list), 0, 260);
    }, true);

    // 聊天记录列表：点「管理聊天文件」后，酒馆先清空列表、逐条加入，再显示弹窗；聊天记录里的搜索同样处理
    const chats = q('#select_chat_div');
    if (chats) {
        observe(chats);
        document.addEventListener('click', (e) => {
            if (/** @type {Element} */ (e.target).closest?.('#option_select_chat')) arm(chats, 0, 80);
        }, true);
        document.addEventListener('input', (e) => {
            if (/** @type {Element} */ (e.target).id === 'select_chat_search') arm(chats, 0, 260);
        }, true);
    }

    // 背景图列表：背景面板打开时
    const bg = q('#Backgrounds');
    const bgList = q('#bg_menu_content');
    if (bg && bgList) {
        let open = bg.classList.contains('openDrawer');
        new MutationObserver(() => {
            const now = bg.classList.contains('openDrawer');
            if (now === open) return;
            open = now;
            if (!now) { bgBatch?.(); bgBatch = null; return; }
            if (!active('bgthumbs') || state.reduced) return;
            // 等面板打开那一帧画完再读位置
            afterPaint(() => visibleItems(bgList, 'bgthumbs'), items => { bgBatch = animateItems(items, 0, 'bgthumbs'); });
        }).observe(bg, { attributes: true, attributeFilter: ['class'] });
        // 开始滑动：缩略图立即到位
        bg.addEventListener('scroll', () => { if (bgBatch) { bgBatch(); bgBatch = null; } }, { capture: true, passive: true });
    }
}
