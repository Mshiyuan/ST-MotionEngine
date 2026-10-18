// 细节交互：思维链（reasoning）、编辑消息（editing）、右栏切页（tabs）、消息「…」按钮（mesmenu）、
// 放大头像与群聊成员列表（zoom）、旧式弹窗（popups）。每项有自己的开关和分模块设置
import { active, play, scoped } from '../core/engine.js';
import { registerTransit, kinds } from './transit.js';
import { registerFade } from './menus.js';

// ---------- 思维链（<details class="mes_reasoning_details">） ----------
// 展开：浏览器先显示内容，再由 toggle 事件触发动画。
// 收起：拦下 summary 的点击，先播收起动画，再真正关闭（否则内容会立刻消失）。
// 不做高度动画：思维链常常很长，又在聊天里，逐帧改高度要每帧重新排版整个聊天，长对话里明显卡顿。
// 只动内容的透明度和位移（合成线程），高度一步到位；也不读尺寸，不额外触发排版。
function reasoningBody(details) {
    return [...details.children].filter(c => c.tagName !== 'SUMMARY');
}

function animateDetails(details, open) {
    const { dur, v } = scoped('reasoning');
    const body = reasoningBody(details);
    if (!body.length) return Promise.resolve(true);
    const D = open ? dur('--me-p-in-dur') : dur('--me-p-out-dur') * 0.8;
    const y = `calc(${v('--me-y')} * -0.5 - 4px)`;
    const runs = body.map(b => play(b, 'reasoning', open
        ? [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
            [[{ translate: `0 ${y}` }, { translate: '0 0' }], { duration: D, easing: v('--me-in') }],
        ]
        : [
            [[{ opacity: 1 }, { opacity: 0 }], { duration: D, easing: v('--me-fade-out') }],
            [[{ translate: '0 0' }, { translate: `0 ${y}` }], { duration: D, easing: v('--me-out') }],
        ]));
    return Promise.all(runs).then(r => r.every(Boolean));
}

function installReasoning() {
    document.addEventListener('toggle', (e) => {
        const d = /** @type {HTMLDetailsElement} */ (e.target);
        if (!active('reasoning') || !d.classList?.contains('mes_reasoning_details') || !d.open || d.dataset.meClosing) return;
        animateDetails(d, true);
    }, true);
    document.addEventListener('click', (e) => {
        // 酒馆只在点标题行、且思维链有内容时才切换展开（1.15 看内容是否为空，1.19 起看 data-has-content）
        const target = /** @type {Element} */ (e.target);
        const header = target.closest?.('.mes_reasoning_details .mes_reasoning_header');
        if (!header || !active('reasoning')) return;
        const d = /** @type {HTMLDetailsElement} */ (header.closest('.mes_reasoning_details'));
        if (!d.open || target.closest('button, a, .mes_reasoning_actions, .mes_reasoning_header_buttons')) return;
        if (d.getAttribute('data-has-content') === 'false' || !d.querySelector('.mes_reasoning')?.textContent.trim()) return;
        e.preventDefault();
        if (d.dataset.meClosing) return;
        d.dataset.meClosing = '1';
        animateDetails(d, false).then(ok => {
            delete d.dataset.meClosing;
            if (ok) {
                d.open = false;
                reasoningBody(d).forEach(b => b.getAnimations().forEach(a => a.cancel()));
            }
        });
    }, true);
}

// ---------- 编辑消息 ----------
// 点小铅笔后，酒馆把正文换成输入框、显示编辑按钮；点完成或取消后再换回来。
// 都在酒馆自己的点击处理里同步完成，这里等下一帧再给新出现的东西做进场。
function installEditing() {
    document.addEventListener('click', (e) => {
        if (!active('editing')) return;
        const t = /** @type {Element} */ (e.target);
        const btn = t.closest?.('.mes_edit, .mes_edit_done, .mes_edit_cancel');
        if (!btn) return;
        const mes = btn.closest('.mes');
        const entering = btn.classList.contains('mes_edit');
        requestAnimationFrame(() => {
            if (!mes?.isConnected) return;
            const { dur, v } = scoped('editing');
            const D = dur('--me-in-dur');
            const text = mes.querySelector('.mes_text');
            if (text) play(text, 'edit', [[[{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }], { duration: D, easing: v('--me-in') }]]);
            const group = mes.querySelector(entering ? '.mes_edit_buttons' : '.mes_buttons');
            if (group) [...group.children].filter(c => c.offsetParent).forEach((c, i) => play(c, 'edit-btn',
                [[[{ opacity: 0, scale: v('--me-s'), translate: '6px 0' }, { opacity: 1, scale: '1', translate: '0 0' }], { duration: D, delay: i * 30, easing: v('--me-in') }]]));
        });
    }, true);
}

export function installDetails() {
    installReasoning();
    installEditing();

    // 右栏切页（角色列表、角色编辑、群聊、API）：往后切从右边来，往前切从左边来
    registerTransit('#right-nav-panel .right_menu', 'tabs', kinds.tab(['rm_characters_block', 'rm_group_chats_block', 'rm_ch_create_block', 'rm_api_block']));
    // 消息「…」：按钮依次弹出
    registerTransit('.extraMesButtons', 'mesmenu', kinds.row);
    registerTransit('.extraMesButtonsHint', 'mesmenu', kinds.fade);
    // 旧式弹窗
    registerTransit('#shadow_popup, #character_popup, #shadow_select_chat_popup, #dialogue_popup', 'popups', kinds.pop);
    // 放大头像、群聊成员弹出
    registerFade('.zoomed_avatar', { mod: 'zoom', dy: 0.3 });
    registerFade('#groupMemberListPopout', { mod: 'zoom', dy: 0.3 });
}
