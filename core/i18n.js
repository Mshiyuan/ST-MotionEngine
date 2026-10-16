// 界面文字：中文和英文，跟随酒馆的界面语言
const DICT = {
    title: ['动效引擎', 'Motion Engine'],
    enabled: ['启用', 'Enable'],
    feel: ['手感风格', 'Motion style'],
    preview: ['预览', 'Preview'],
    previewCard: ['点一种风格，这里会按它的手感重播', 'Pick a style to replay it here'],
    previewBtn: ['按住试试', 'Press me'],
    speed: ['速度', 'Speed'],
    amp: ['幅度', 'Amplitude'],
    modules: ['作用范围', 'Applies to'],
    m_press: ['按钮按压', 'Button press'],
    m_drawers: ['顶栏抽屉与侧栏', 'Top drawers & side panels'],
    m_menus: ['菜单', 'Menus'],
    m_popups: ['弹窗', 'Popups'],
    m_toasts: ['提示条', 'Toasts'],
    m_inline: ['折叠块', 'Collapsible sections'],
    m_messages: ['新消息进场', 'New messages'],
    m_swipes: ['切换回复', 'Swipes'],
    m_misc: ['其他（头像放大、右栏切页等）', 'Other (avatar zoom, panel tabs, …)'],
    options: ['选项', 'Options'],
    followPointer: ['弹窗从点击位置展开', 'Popups grow from the tap point'],
    haptics: ['按压时轻微震动（仅安卓）', 'Light vibration on press (Android only)'],
    reset: ['恢复默认', 'Reset to defaults'],
    reducedNote: ['酒馆的「减少动态效果」已开启：只保留短暂的淡入淡出。', 'SillyTavern "Reduced motion" is on: only short fades are used.'],
};

let zh = true;

export function setLocale(locale) {
    zh = !locale || String(locale).toLowerCase().startsWith('zh');
}

export function t(key) {
    const e = DICT[key];
    return e ? e[zh ? 0 : 1] : key;
}

/** 风格、分组这类自带中英文名的对象 */
export function name(obj) {
    return zh ? obj.zh : obj.en;
}
