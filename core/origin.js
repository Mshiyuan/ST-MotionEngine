// 记下最近一次按下的位置，弹窗和菜单可以从那里长出来。
// 只存在 JS 里，不写 CSS 变量，避免每次点击都让整页重新计算样式。

const last = { x: 0, y: 0, t: 0, target: null };

export function installOrigin() {
    document.addEventListener('pointerdown', (e) => {
        last.x = e.clientX; last.y = e.clientY; last.t = performance.now(); last.target = e.target;
    }, { capture: true, passive: true });
}

/** 最近 maxAge 毫秒内的按下位置；超过时限（例如由键盘触发）返回 null */
export function recentPointer(maxAge = 800) {
    return performance.now() - last.t < maxAge ? last : null;
}

/**
 * 计算从某一点「长出来」所需的起始位移
 * @param {DOMRect} rect 目标元素最终的位置
 * @param {number} k 位移比例，0 表示原地缩放
 */
export function offsetFromPointer(rect, k = 0.35) {
    const p = recentPointer();
    if (!p) return { dx: 0, dy: 0, has: false };
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    return { dx: (p.x - cx) * k, dy: (p.y - cy) * k, has: true };
}
