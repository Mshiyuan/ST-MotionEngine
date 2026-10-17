// 细节交互：思维链展开收起、编辑消息、右栏切页、消息「…」按钮、放大头像、旧式弹窗
import { active, dur, v, play } from '../core/engine.js';
import { registerTransit, kinds } from './transit.js';
import { registerFade } from './menus.js';

// ---------- 思维链（<details class="mes_reasoning_details">） ----------
// 展开：浏览器先显示内容，再由 toggle 事件触发动画。
// 收起：拦下 summary 的点击，先播收起动画，再真正关闭（否则内容会立刻消失）。
function reasoningBody(details) {
    return [...details.children].filter(c => c.tagName !== 'SUMMARY');
}

function animateDetails(details, open) {
    const body = reasoningBody(details);
    const summary = details.querySelector(':scope > summary');
    const h0 = summary?.getBoundingClientRect().height || 0;
    const h1 = details.getBoundingClientRect().height;
    const D = open ? dur('--me-p-in-dur') : dur('--me-p-out-dur');
    const ease = open ? 'cubic-bezier(0.2, 0, 0, 1)' : 'cubic-bezier(0.4, 0, 1, 1)';
    details.style.overflow = 'hidden';
    const done = play(details, 'details', [[[{ height: `${open ? h0 : h1}px` }, { height: `${open ? h1 : h0}px` }], { duration: D, easing: ease }]]);
    body.forEach(b => play(b, 'details-body', [[open ? [{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }] : [{ opacity: 1 }, { opacity: 0 }], { duration: open ? D : D * 0.7, easing: open ? v('--me-in') : v('--me-fade-out') }]]));
    return done.then(ok => { details.style.overflow = ''; return ok; });
}

function installReasoning() {
    document.addEventListener('toggle', (e) => {
        const d = /** @type {HTMLDetailsElement} */ (e.target);
        if (!active('details') || !d.classList?.contains('mes_reasoning_details') || !d.open || d.dataset.meClosing) return;
        animateDetails(d, true);
    }, true);
    document.addEventListener('click', (e) => {
        const summary = /** @type {Element} */ (e.target).closest?.('.mes_reasoning_details > summary');
        if (!summary || !active('details')) return;
        const d = /** @type {HTMLDetailsElement} */ (summary.parentElement);
        if (!d.open || /** @type {Element} */ (e.target).closest('button, a, .mes_reasoning_header_buttons')) return;
        e.preventDefault();
        d.dataset.meClosing = '1';
        animateDetails(d, false).then(ok => {
            delete d.dataset.meClosing;
            if (ok) d.open = false;
        });
    }, true);
}

// ---------- 编辑消息 ----------
// 点小铅笔后，酒馆把正文换成输入框、显示编辑按钮；点完成或取消后再换回来。
// 都在酒馆自己的点击处理里同步完成，这里等下一帧再给新出现的东西做进场。
function installEditing() {
    document.addEventListener('click', (e) => {
        if (!active('details')) return;
        const t = /** @type {Element} */ (e.target);
        const btn = t.closest?.('.mes_edit, .mes_edit_done, .mes_edit_cancel');
        if (!btn) return;
        const mes = btn.closest('.mes');
        const entering = btn.classList.contains('mes_edit');
        requestAnimationFrame(() => {
            if (!mes?.isConnected) return;
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
    registerTransit('#right-nav-panel .right_menu', 'details', kinds.tab(['rm_characters_block', 'rm_group_chats_block', 'rm_ch_create_block', 'rm_api_block']));
    // 消息「…」：按钮依次弹出
    registerTransit('.extraMesButtons', 'details', kinds.row);
    registerTransit('.extraMesButtonsHint', 'details', kinds.fade);
    // 旧式弹窗
    registerTransit('#shadow_popup, #character_popup, #shadow_select_chat_popup, #dialogue_popup', 'popups', kinds.pop);
    // 放大头像、群聊成员弹出
    registerFade('.zoomed_avatar', { mod: 'details', dy: 0.3 });
    registerFade('#groupMemberListPopout', { mod: 'details', dy: 0.3 });
}
