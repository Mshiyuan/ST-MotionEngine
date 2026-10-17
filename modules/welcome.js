// 欢迎页：最近的聊天逐条浮现，「显示更多」展开的几条也逐条浮现
// 欢迎页（.welcomePanel）不是消息，酒馆把它直接插进 #chat，消息模块的进场动画管不到它。
import { active, play, state, areaFactor, scoped } from '../core/engine.js';

// 动效参数按模块读取（开了「分模块设置」时各模块用自己的幅度和速度）
const { dur, v } = scoped('welcome');

function stagger(items, first = 0) {
    const D = dur('--me-in-dur');
    const step = Math.max(dur('--me-stagger'), 25);
    items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const m = areaFactor(r.width, r.height);
        const delay = first + i * step;
        play(el, 'welcome', [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, delay, easing: v('--me-fade') }],
            [[{ translate: `0 calc((${v('--me-y')} * 1.2 + 6px) * ${m})`, scale: v('--me-s') }, { translate: '0 0', scale: '1' }], { duration: D, delay, easing: v('--me-in') }],
        ]);
    });
}

const visibleChats = (root) => [...root.querySelectorAll('.recentChat:not(.hidden)')];

function enterPanel(panel) {
    if (!active('welcome') || state.reduced) return;
    const D = dur('--me-in-dur');
    // 标题行先淡入，聊天条目随后逐条浮现
    for (const head of panel.querySelectorAll('.welcomeHeaderTitle, .welcomeHeader')) {
        play(head, 'welcome', [[[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }]]);
    }
    const items = visibleChats(panel);
    const more = panel.querySelector('.showMoreChats');
    stagger(more ? [...items, more] : items, 40);
}

export function installWelcome() {
    const chat = document.getElementById('chat');
    if (!chat) return;
    new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
            if (n.nodeType === 1 && /** @type {Element} */ (n).classList.contains('welcomePanel')) enterPanel(/** @type {HTMLElement} */ (n));
        }
    }).observe(chat, { childList: true });

    // 「显示更多」：酒馆在自己的点击处理里去掉 .hidden，下一帧给新出现的条目做进场
    document.addEventListener('click', (e) => {
        const btn = /** @type {Element} */ (e.target).closest?.('.welcomePanel button.showMoreChats');
        if (!btn || !active('welcome') || state.reduced) return;
        const panel = btn.closest('.welcomePanel');
        const before = new Set(visibleChats(panel));
        requestAnimationFrame(() => {
            const added = visibleChats(panel).filter(el => !before.has(el));
            if (added.length) stagger(added);
        });
    }, true);
}
