// 聊天消息：新消息浮现、进入聊天时最后几条依次登场、切换回复（swipe）
// 只观察 #chat 的直接子节点增减（childList），不观察子树，流式输出改文字时不会触发。
import { active, play, state, scoped, sized, poseExtras } from '../core/engine.js';
import { recentPointer } from '../core/origin.js';

// 动效参数按模块读取（开了「分模块设置」时各模块用自己的幅度和速度）
const { dur, v } = scoped('messages');

const STAGGER_LAST = 4;

/**
 * 消息进场。位移、缩放、曲线都按消息面积换算（engine.sized），与同样大小的面板强度一致
 * @param {string} mod 'messages'（新消息）或 'entry'（进入聊天时依次出现）
 */
function enter(el, delay = 0, k = 1, mod = 'messages') {
    const r = el.getBoundingClientRect();
    const z = sized(mod, r.width, Math.min(r.height, innerHeight));
    const x = poseExtras(mod, z.af * z.af);
    const { dur, v } = scoped(mod);
    play(el, 'mes', [
        [[{ opacity: 0 }, { opacity: 1 }], { duration: dur('--me-in-dur') * 0.6, delay, easing: v('--me-fade') }],
        [[{ translate: `0 calc(${z.y} * ${1.2 * k} + ${6 * k}px)`, scale: z.s, ...x.a }, { translate: '0 0', scale: '1', ...x.b }], { duration: z.D, delay, easing: z.ease }],
    ]);
}

export function installMessages() {
    const chat = document.getElementById('chat');
    if (!chat) return;

    // 一次插入多条（打开聊天、加载更早的消息）时只给可见区域里最后几条做依次登场
    new MutationObserver((records) => {
        const added = [];
        for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && /** @type {Element} */ (n).classList.contains('mes')) added.push(n);
        if (!added.length) return;
        if (added.length === 1) {
            if (active('messages')) enter(added[0]);
            return;
        }
        if (!active('entry')) return;
        // 加载更早的消息是插在前面，不做动画
        if (added[added.length - 1] !== chat.lastElementChild) return;
        const tail = added.slice(-STAGGER_LAST);
        const step = Math.min(70, scoped('entry').dur('--me-stagger') + 20);
        tail.forEach((el, i) => enter(el, i * step, 0.8, 'entry'));
    }).observe(chat, { childList: true });

    // 切换回复：酒馆 1.19 用 CSS 关键帧 slide 做左右滑动。动画开始时把曲线换成当前风格的：
    // 滑出用退场曲线，滑入用进场曲线。时长保持酒馆的，因为酒馆会按它的时长等动画结束。
    document.addEventListener('animationstart', (e) => {
        if (e.animationName !== 'slide' || !active('swipes')) return;
        const el = /** @type {Element} */ (e.target);
        const entering = getComputedStyle(document.documentElement).getPropertyValue('--slide-mes-x-end').trim() === '0px';
        for (const a of el.getAnimations()) {
            if (a.animationName === 'slide') a.effect.updateTiming({ easing: entering ? v('--me-in') : v('--me-out') });
        }
    }, true);

    // 酒馆在「减少动态效果」下（包括系统要求时被强制打开）会跳过滑动。插件照常播放时补一个滑入。
    const { eventSource, eventTypes } = SillyTavern.getContext();
    eventSource.on(eventTypes.MESSAGE_SWIPED, (mesId) => {
        if (!active('swipes') || state.reduced) return;
        // 酒馆的动画时长不超过 50ms 时会跳过滑动（见 animateSwipeTransition）
        const stDur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--animation-duration'));
        if (!(stDur <= 50)) return;
        const mes = chat.querySelector(`.mes[mesid="${mesId}"] .mes_block`);
        if (!mes) return;
        const p = recentPointer(1500);
        const dir = p?.target?.closest?.('.swipe_left') ? -1 : 1;
        const D = dur('--me-in-dur');
        play(mes, 'swipe', [
            [[{ opacity: 0 }, { opacity: 1 }], { duration: D * 0.6, easing: v('--me-fade') }],
            [[{ translate: `${dir * 40}px 0` }, { translate: '0 0' }], { duration: D, easing: v('--me-in') }],
        ]);
    });
}
