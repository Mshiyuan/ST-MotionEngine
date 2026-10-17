// 手感风格表 → CSS 变量
// 每种风格只描述「怎么动」，组件只读变量，所以换风格不需要改任何组件代码。

/**
 * 按弹簧公式采样，生成 CSS linear() 曲线。
 * @param {number} stiffness 刚度
 * @param {number} damping 阻尼
 * @param {number} [mass=1] 质量
 * @returns {{ easing: string, duration: number }} duration 为弹簧基本停稳所需的毫秒数
 */
export function spring(stiffness, damping, mass = 1) {
    const dt = 1 / 600;
    let x = 0, v = 0, t = 0, settled = 0;
    const pts = [];
    while (t < 3) {
        const a = (-stiffness * (x - 1) - damping * v) / mass;
        v += a * dt; x += v * dt; t += dt;
        pts.push(x);
        if (Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) { if (++settled > 30) break; } else settled = 0;
    }
    const n = 40;
    const out = [];
    for (let i = 0; i <= n; i++) out.push(+pts[Math.min(pts.length - 1, Math.round(i / n * (pts.length - 1)))].toFixed(3));
    out[0] = 0; out[n] = 1;
    return { easing: `linear(${out.join(', ')})`, duration: Math.round(t * 1000) };
}

const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)';
const STD_OUT = 'cubic-bezier(0.4, 0, 1, 1)';

const sSoft = spring(170, 18);      // 弹簧阻尼：轻微过冲一次
const sJelly = spring(300, 10);     // 果冻：来回晃几次
const sJellyRel = spring(260, 14);
const sIOS = spring(230, 30);       // 接近 iOS 默认弹簧（damping ratio ≈ 1）
const sM3Spatial = spring(380, 30); // M3 Expressive 空间弹簧（略回弹）
const sJuicy = spring(420, 16);

/**
 * 字段说明（时长单位 ms，位移单位 px）
 * in/out：进场、退场曲线与时长；fade：透明度曲线（默认同 in）
 * y/s/blur：小元素（菜单、弹窗、提示）的进场起点：向下位移、缩放、模糊
 * panel：大面板（抽屉、侧栏）用的参数，省略时按小元素参数自动收敛
 * press/pressDur/rel/relDur：按压缩放、按下时长、松手曲线与时长
 * stagger：多个元素依次进入的间隔
 */
export const FEELS = [
    { id: 'smooth', group: 'core', zh: '丝滑减速', en: 'Smooth', dzh: '出手快，后半段慢慢滑停，不回弹', den: 'Fast start, long gentle settle',
        in: EXPO, inDur: 480, out: 'cubic-bezier(0.3, 0, 0.8, 0.15)', outDur: 200, y: 14, s: 0.98, blur: 0,
        press: 0.97, pressDur: 90, rel: EXPO, relDur: 400, stagger: 40 },
    { id: 'spring', group: 'core', zh: '弹簧阻尼', en: 'Spring', dzh: '轻微过冲一次再稳住', den: 'One light overshoot, then settles',
        in: sSoft.easing, inDur: sSoft.duration, out: STD_OUT, outDur: 200, fade: 'cubic-bezier(0.2, 0, 0, 1)', y: 24, s: 0.95, blur: 0,
        press: 0.95, pressDur: 90, rel: sSoft.easing, relDur: 600, stagger: 45 },
    { id: 'soft', group: 'core', zh: '柔和淡入', en: 'Soft fade', dzh: '位移很小，主要靠淡入', den: 'Mostly fades, barely moves',
        in: 'cubic-bezier(0.05, 0.7, 0.1, 1)', inDur: 400, out: 'cubic-bezier(0.3, 0, 0.8, 0.15)', outDur: 180, y: 8, s: 1, blur: 0,
        press: 0.98, pressDur: 100, rel: 'cubic-bezier(0.2, 0, 0, 1)', relDur: 250, stagger: 30 },
    { id: 'snappy', group: 'core', zh: '利落干脆', en: 'Snappy', dzh: '又快又准，几乎没有过程', den: 'Quick and precise',
        in: 'cubic-bezier(0.25, 1, 0.5, 1)', inDur: 170, out: 'cubic-bezier(0.5, 0, 0.75, 0)', outDur: 110, y: 4, s: 0.97, blur: 0,
        press: 0.97, pressDur: 60, rel: 'ease-out', relDur: 120, stagger: 20 },
    { id: 'ios', group: 'core', zh: 'iOS 原生', en: 'iOS native', dzh: '临界阻尼弹簧，从图标展开', den: 'Critically damped, grows from the icon',
        in: sIOS.easing, inDur: sIOS.duration, out: 'cubic-bezier(0.32, 0, 0.67, 0)', outDur: 220, fade: 'cubic-bezier(0.2, 0, 0, 1)', y: 0, s: 0.9, blur: 0,
        panel: { y: 40, s: 1 }, press: 0.96, pressDur: 70, rel: sIOS.easing, relDur: 450, stagger: 35 },
    { id: 'm3', group: 'core', zh: 'Material 3 Expressive', en: 'Material 3 Expressive', dzh: '位移带回弹，透明度平稳', den: 'Springy motion, calm fades',
        in: sM3Spatial.easing, inDur: sM3Spatial.duration, out: 'cubic-bezier(0.3, 0, 0.8, 0.15)', outDur: 200, fade: 'cubic-bezier(0.2, 0, 0, 1)', y: 20, s: 0.92, blur: 0,
        press: 0.95, pressDur: 80, rel: sM3Spatial.easing, relDur: 500, stagger: 40 },
    { id: 'bouncy', group: 'lively', zh: 'Q弹回弹', en: 'Bouncy', dzh: '先蓄力再弹出，冲过头再落定', den: 'Anticipates, overshoots, lands',
        in: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)', inDur: 420, out: 'cubic-bezier(0.4, 0, 0.2, 1)', outDur: 200, fade: 'ease-out', y: 0, s: 0.6, blur: 0,
        panel: { in: 'cubic-bezier(0.34, 1.3, 0.64, 1)', y: 12, s: 0.96 },
        press: 0.92, pressDur: 80, rel: 'cubic-bezier(0.34, 1.56, 0.64, 1)', relDur: 400, stagger: 50 },
    { id: 'juicy', group: 'lively', zh: '轻触果汁', en: 'Juicy', dzh: '按下压扁，松手回弹', den: 'Squashes on press, springs back',
        in: sJuicy.easing, inDur: sJuicy.duration, out: STD_OUT, outDur: 180, fade: 'ease-out', y: 10, s: 0.85, blur: 0,
        panel: { in: sSoft.easing, inDur: sSoft.duration, y: 16, s: 0.97 },
        press: '1.03 0.93', pressDur: 70, rel: sJuicy.easing, relDur: 600, stagger: 45 },
    { id: 'blur', group: 'mood', zh: '模糊聚焦', en: 'Blur focus', dzh: '从朦胧中对焦清晰', den: 'Comes into focus from a blur',
        in: 'cubic-bezier(0.22, 1, 0.36, 1)', inDur: 480, out: STD_OUT, outDur: 200, y: 0, s: 1.06, blur: 10,
        panel: { y: 10, s: 1.01, blur: 0 }, press: 0.96, pressDur: 80, rel: 'cubic-bezier(0.22, 1, 0.36, 1)', relDur: 350, stagger: 50 },
    { id: 'float', group: 'mood', zh: '漂浮轻盈', en: 'Float', dzh: '像羽毛一样慢慢飘来飘走', den: 'Drifts in and out like a feather',
        in: 'cubic-bezier(0.33, 1, 0.68, 1)', inDur: 700, out: 'cubic-bezier(0.32, 0, 0.67, 0)', outDur: 280, y: 30, s: 0.98, blur: 3,
        panel: { y: 24, blur: 0 }, press: 0.97, pressDur: 120, rel: 'cubic-bezier(0.33, 1, 0.68, 1)', relDur: 500, stagger: 80 },
    { id: 'ink', group: 'mood', zh: '墨水晕开', en: 'Ink spread', dzh: '像墨水一样晕开、收起', den: 'Spreads and retracts like ink',
        in: 'cubic-bezier(0.22, 1, 0.36, 1)', inDur: 520, out: 'cubic-bezier(0.4, 0, 1, 1)', outDur: 220, y: 6, s: 1, blur: 0, clip: true,
        press: 0.97, pressDur: 90, rel: 'cubic-bezier(0.22, 1, 0.36, 1)', relDur: 350, stagger: 40 },
    { id: 'jelly', group: 'quirky', zh: '果冻弹性', en: 'Jelly', dzh: '压扁后来回晃几下', den: 'Wobbles after squashing',
        in: sJelly.easing, inDur: sJelly.duration, out: 'cubic-bezier(0.4, 0, 0.2, 1)', outDur: 200, fade: 'ease-out', y: 0, s: '1.3 0.6', blur: 0,
        panel: { in: sSoft.easing, inDur: sSoft.duration, y: 0, s: '1.03 0.94' },
        press: 0.88, pressDur: 70, rel: sJellyRel.easing, relDur: 800, stagger: 60 },
    { id: 'cinema', group: 'quirky', zh: '优雅慢放', en: 'Cinematic', dzh: '慢起慢落，元素依次登场', den: 'Slow in, slow out',
        in: 'cubic-bezier(0.65, 0, 0.35, 1)', inDur: 850, out: 'cubic-bezier(0.65, 0, 0.35, 1)', outDur: 400, y: 44, s: 1, blur: 0,
        panel: { inDur: 600, y: 30 }, press: 0.98, pressDur: 150, rel: 'cubic-bezier(0.65, 0, 0.35, 1)', relDur: 500, stagger: 110 },
    { id: 'steps', group: 'quirky', zh: '复古阶梯', en: 'Retro steps', dzh: '一格一格跳，像素游戏感', den: 'Moves in steps, like pixel games',
        in: 'steps(5, end)', inDur: 400, out: 'steps(3, end)', outDur: 210, y: 20, s: 1, blur: 0,
        press: 0.9, pressDur: 0, rel: 'steps(2, end)', relDur: 120, stagger: 80 },
];

export const GROUPS = [
    { id: 'core', zh: '日常', en: 'Everyday' },
    { id: 'lively', zh: '活泼', en: 'Lively' },
    { id: 'mood', zh: '氛围', en: 'Mood' },
    { id: 'quirky', zh: '个性', en: 'Quirky' },
];

export const getFeel = (id) => FEELS.find(f => f.id === id) || FEELS[0];

// 缩放值按幅度系数向 1 收敛；支持 "sx sy" 两个值。幅度最大 3 倍，结果限制在 0.05–3，避免翻转
const scaleBy = (s, k) => String(s).split(/\s+/).map(v => +Math.min(3, Math.max(0.05, 1 - (1 - Number(v)) * k)).toFixed(3)).join(' ');
const ms = (v) => `${Math.round(v)}ms`;

/**
 * 把风格换算成 CSS 变量
 * @param {object} f 风格
 * @param {{ speed: number, amp: number, reduced: boolean, bigBounce?: boolean }} o speed 越大越快；amp 是位移和缩放的幅度系数（0–3）；
 *   bigBounce=true 时大面板和小部件用同样的曲线与幅度（默认减弱）
 */
export function feelVars(f, { speed = 1, amp = 1, reduced = false, bigBounce = false } = {}) {
    const d = (v) => ms(v / speed);
    if (reduced) {
        // 减少动效：只保留很短的淡入淡出
        const fade = 'cubic-bezier(0.2, 0, 0, 1)';
        return {
            '--me-in': fade, '--me-in-dur': ms(140), '--me-out': fade, '--me-out-dur': ms(100), '--me-pop-out-dur': ms(100), '--me-s-out': '1', '--me-fade': fade, '--me-fade-out': 'linear',
            '--me-y': '0px', '--me-s': '1', '--me-blur': '0px',
            '--me-p-in': fade, '--me-p-out': fade, '--me-p-in-dur': ms(140), '--me-p-out-dur': ms(100), '--me-p-y': '0px', '--me-p-s': '1', '--me-p-blur': '0px', '--me-side-x': '0px',
            '--me-press': '1', '--me-press-dur': '0ms', '--me-rel': fade, '--me-rel-dur': '0ms', '--me-stagger': '0ms',
            '--me-big': '1',
        };
    }
    const p = bigBounce ? { in: f.in, inDur: f.inDur, y: f.y, s: f.s, blur: 0 } : (f.panel || {});
    const pIn = p.in || f.in;
    // 大面板：位移减半、缩放向 1 收敛一半、默认不模糊，时长封顶 600ms（与小部件一致时封顶 900ms）
    const pY = (p.y ?? f.y * 0.6) * amp;
    const pS = scaleBy(p.s ?? scaleBy(f.s, 0.5), amp);
    const pInDur = Math.min(p.inDur || f.inDur, bigBounce ? 900 : 600);
    const stepped = String(f.out).startsWith('steps');
    return {
        '--me-in': f.in, '--me-in-dur': d(f.inDur),
        '--me-out': f.out, '--me-out-dur': d(f.outDur),
        // 退场的透明度匀速变化。曲线前慢后快时，前大半段几乎不动、最后几帧才消失，手机上一掉帧就像闪了一下
        '--me-fade-out': stepped ? f.out : 'linear',
        // 酒馆等弹窗关闭动画最多 500ms，超过会被截断
        '--me-pop-out-dur': ms(Math.min(f.outDur / speed, 450)),
        '--me-s-out': scaleBy(f.s, amp * 0.5),
        '--me-fade': f.fade || f.in,
        '--me-y': `${f.y * amp}px`, '--me-s': scaleBy(f.s, amp), '--me-blur': `${f.blur * Math.min(amp, 1)}px`,
        '--me-p-in': pIn, '--me-p-in-dur': d(pInDur),
        // 面板退场的位移用标准加速曲线，起步不拖沓；时长 200–280ms，保证手机上至少有十来帧
        '--me-p-out': stepped ? f.out : 'cubic-bezier(0.3, 0, 0.8, 0.15)',
        '--me-p-out-dur': d(Math.min(Math.max(f.outDur, 200), 280)),
        '--me-p-y': `${pY}px`, '--me-p-s': pS, '--me-p-blur': `${(p.blur ?? 0) * Math.min(amp, 1)}px`,
        '--me-side-x': `${Math.max(pY, 16) * 1.5}px`,
        // 大面板形变倍数：与小部件一致时，压扁、回弹等形变放大到小部件的程度
        '--me-big': bigBounce ? '2.2' : '1',
        '--me-press': scaleBy(f.press, amp), '--me-press-dur': d(f.pressDur),
        '--me-rel': f.rel, '--me-rel-dur': d(f.relDur), '--me-stagger': d(f.stagger),
    };
}
