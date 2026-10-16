// 界面文字：中文和英文，跟随酒馆的界面语言
const DICT = {
    title: ['动效引擎', 'Motion Engine'],
    enabled: ['启用动效引擎', 'Enable Motion Engine'],
    enabledOff: ['已关闭，界面与原版一致', 'Off: the interface behaves as stock'],
    sysReducedPlay: ['系统要求减少动画，插件仍按设置播放', 'System asks for reduced motion; playing anyway per settings'],
    sysReducedFollow: ['系统要求减少动画：只保留短暂淡入淡出', 'System asks for reduced motion: short fades only'],
    stReduced: ['酒馆的「减少动态效果」已开启：只做短暂淡入淡出', 'SillyTavern "Reduced motion" is on: short fades only'],
    stReducedPlay: ['酒馆的「减少动态效果」已开启，插件仍按设置播放', 'SillyTavern "Reduced motion" is on; playing anyway per settings'],

    secFeel: ['手感', 'Feel'],
    previewHint: ['点卡片切换风格，下面会按它播放一次', 'Pick a style to replay it below'],
    previewPanel: ['面板', 'Panel'],
    previewPress: ['按住', 'Hold'],
    previewOpen: ['打开', 'Open'],
    previewClose: ['关闭', 'Close'],

    secPanel: ['面板开合', 'Panel open & close'],
    panelIn: ['打开方式', 'Opening'],
    panelOut: ['关闭方式', 'Closing'],
    panelNote: ['作用于顶栏各个面板和左右侧栏。「跟随风格」按所选手感自动搭配；手机上的左右侧栏默认侧滑。关闭动画播放期间面板仍需渲染，低端设备上觉得关闭慢可以选「无动画」。', 'Applies to top-bar panels and side panels. "Match style" pairs with the chosen feel; on phones the side panels slide sideways. The panel keeps rendering while it closes; on slow devices choose "None" for closing.'],

    secTune: ['调节', 'Tuning'],
    speed: ['速度', 'Speed'],
    amp: ['幅度', 'Amplitude'],
    tuneNote: ['速度越大越快。幅度影响位移和缩放的大小，0 为只淡入淡出。', 'Higher speed is faster. Amplitude scales movement and zoom; 0 means fade only.'],

    secScope: ['作用范围', 'Applies to'],
    m_press: ['按钮按压', 'Button press'],
    m_press_d: ['按下缩小，松开回弹', 'Shrinks on press, springs back'],
    m_drawers: ['顶栏面板与侧栏', 'Top panels & side panels'],
    m_drawers_d: ['顶部图标打开的各个面板', 'Panels opened from the top bar'],
    m_menus: ['左下角菜单', 'Bottom-left menus'],
    m_menus_d: ['☰ 选项菜单与魔棒扩展菜单', 'The ☰ options menu and the wand menu'],
    m_popups: ['弹窗', 'Popups'],
    m_popups_d: ['确认框、输入框等对话框', 'Confirm, input and other dialogs'],
    m_toasts: ['提示条', 'Toasts'],
    m_toasts_d: ['顶部弹出的通知', 'Notifications at the top'],
    m_inline: ['折叠块与下拉框', 'Collapsibles & dropdowns'],
    m_inline_d: ['带箭头的分组、可搜索的下拉框', 'Sections with a chevron, searchable dropdowns'],
    m_messages: ['新消息', 'New messages'],
    m_messages_d: ['发送和收到的消息浮现', 'Sent and received messages appear smoothly'],
    m_swipes: ['切换回复', 'Swipes'],
    m_swipes_d: ['左右切换同一楼的不同回复', 'Switching between alternative replies'],
    m_details: ['细节交互', 'Small interactions'],
    m_details_d: ['进入聊天、思维链展开、编辑消息、右栏切页、头像放大', 'Opening chats, reasoning blocks, message editing, panel tabs, avatar zoom'],

    secCompat: ['兼容与性能', 'Compatibility & performance'],
    prerender: ['面板预渲染', 'Prerender panels'],
    prerender_d: ['关闭的面板保留排版结果，再次打开更快', 'Closed panels keep their layout and reopen faster'],
    lite: ['低配模式', 'Lite mode'],
    lite_d: ['只用淡入淡出，不做模糊和裁剪', 'Fades only; no blur or clipping'],
    override: ['覆盖美化动效', 'Override theme motion'],
    override_d: ['美化自带的过渡和动画让位给插件', 'Theme transitions and animations yield to this extension'],
    followSystemReduced: ['跟随系统和酒馆的减少动效', 'Follow system & SillyTavern reduced motion'],
    followSystemReduced_d: ['开启后，系统要求减少动画或酒馆开了「减少动态效果」时，只做短暂淡入淡出', 'When on, only short fades are used if the system or SillyTavern asks for reduced motion'],
    customSelect: ['自绘下拉列表（实验）', 'Custom dropdown lists (experimental)'],
    customSelect_d: ['原生下拉框的选项列表改由插件绘制，可以有展开动画', 'Native dropdown lists are drawn by the extension so they can animate'],
    followPointer: ['弹窗从点击位置展开', 'Popups grow from the tap point'],
    followPointer_d: ['关闭时弹窗从屏幕中央出现', 'When off, popups appear from the center'],
    haptics: ['按压震动', 'Haptic feedback'],
    haptics_d: ['按下时轻微震动，仅安卓', 'Light vibration on press, Android only'],
    reset: ['恢复默认设置', 'Reset to defaults'],

    group_core: ['日常', 'Everyday'],
    group_lively: ['活泼', 'Lively'],
    group_mood: ['氛围', 'Mood'],
    group_quirky: ['个性', 'Quirky'],
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

export function desc(obj) {
    return zh ? obj.dzh : obj.den;
}
