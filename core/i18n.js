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
    previewHint: ['卡片上的曲线是这种风格的运动轨迹，冲过虚线就是回弹。选一个样本，轻点下方区域试效果；面板点一下打开或关闭，按钮可以按住。', 'The curve on each card is the motion path of the style; crossing the dashed line means overshoot. Pick a sample and tap the area below; the panel toggles, the button can be held.'],
    secPreview: ['预览', 'Preview'],
    pv_icon: ['图标', 'Icon'],
    pv_checkbox: ['复选框', 'Checkbox'],
    pv_panel: ['面板', 'Panel'],
    pv_button: ['按钮', 'Button'],
    pv_switch: ['开关', 'Switch'],
    pv_menu: ['菜单', 'Menu'],
    pv_toast: ['提示', 'Toast'],
    pv_list: ['列表', 'List'],
    pv_tap: ['轻点', 'Tap'],
    pv_hold: ['按住', 'Hold'],
    pv_toastText: ['已保存', 'Saved'],

    secPanel: ['面板开合', 'Panel open & close'],
    panelForm: ['开合方式', 'Open & close'],
    panelIn: ['打开方式', 'Opening'],
    panelOut: ['关闭方式', 'Closing'],
    panelSplit: ['打开和关闭分开设置', 'Set opening and closing separately'],
    panelNote: ['作用于顶栏各个面板和左右侧栏。「跟随风格」按所选手感自动搭配；手机上的左右侧栏默认侧滑。美化给面板设了固定背景时，只做淡入淡出。低端设备上觉得关闭慢，可以把关闭方式设为「无动画」。', 'Applies to top-bar panels and side panels. "Match style" pairs with the chosen feel; on phones the side panels slide sideways. Panels with a fixed theme background only fade. On slow devices, set closing to "None" if it feels slow.'],

    secTune: ['调节', 'Tuning'],
    speed: ['速度', 'Speed'],
    amp: ['幅度', 'Amplitude'],
    panelBounce: ['强度随面积', 'Strength by size'],
    bounce_area: ['越大越弱', 'Larger is softer'],
    bounce_uniform: ['统一', 'Uniform'],
    tuneNote: ['速度越大越快。幅度影响位移和缩放的大小，范围 0–3。「越大越弱」：按钮这类小东西效果最明显，面板、长消息这类大块按面积减弱，整屏不会晃得太厉害；「统一」：全部按最小部件的强度。', 'Higher speed is faster. Amplitude scales movement and zoom (0–3). "Larger is softer": small things like buttons get the full effect, large blocks such as panels and long messages are softened by area; "Uniform": everything gets the full effect.'],
    perModule: ['分模块设置', 'Per-module tuning'],
    perModule_d: ['每个模块单独设置幅度（0–5）和速度，开启后上面的整体幅度、速度和「强度随面积」不再生效', 'Set amplitude (0–5) and speed for each module; the overall values and "Strength by size" no longer apply'],
    countOn: ['已开 {n}/{m}', '{n} of {m} on'],

    secScope: ['作用范围', 'Applies to'],
    m_press: ['按钮按压', 'Button press'],
    m_press_d: ['按下缩小，松开回弹', 'Shrinks on press, springs back'],
    m_icons: ['图标点击反馈', 'Icon tap feedback'],
    m_icons_d: ['顶栏和底栏的图标点击时按风格做一个小动作。美化自带图标动画时不改动', 'Top and bottom bar icons react in the chosen style. Icons animated by the theme are left alone'],
    m_drawers: ['顶栏面板与侧栏', 'Top panels & side panels'],
    m_drawers_d: ['顶部图标打开的各个面板', 'Panels opened from the top bar'],
    m_menus: ['左下角菜单', 'Bottom-left menus'],
    m_menus_d: ['☰ 选项菜单与魔棒扩展菜单', 'The ☰ options menu and the wand menu'],
    m_popups: ['弹窗', 'Popups'],
    m_popups_d: ['确认框、输入框等对话框', 'Confirm, input and other dialogs'],
    m_toasts: ['提示条', 'Toasts'],
    m_toasts_d: ['顶部弹出的通知', 'Notifications at the top'],
    m_inline: ['折叠块', 'Collapsibles'],
    m_inline_d: ['带箭头的分组、可搜索的下拉框', 'Sections with a chevron, searchable dropdowns'],
    m_messages: ['新消息', 'New messages'],
    m_messages_d: ['发送和收到的消息浮现', 'Sent and received messages appear smoothly'],
    m_swipes: ['切换回复', 'Swipes'],
    m_swipes_d: ['左右切换同一楼的不同回复', 'Switching between alternative replies'],
    m_details: ['细节交互', 'Small interactions'],
    m_details_d: ['进入聊天、编辑消息、右栏切页、角色列表翻页、头像放大', 'Opening chats, message editing, panel tabs, character list pages, avatar zoom'],
    m_checkbox: ['复选框', 'Checkboxes'],
    m_checkbox_d: ['勾选时勾弹出、框轻轻回弹', 'The tick pops in and the box springs on toggle'],
    m_select: ['选择框改为页内列表', 'In-page dropdown lists'],
    m_select_d: ['选择美化、头像样式这类选择框的选项列表改在页面内展开，带动画（系统弹出的列表做不了动画）。需要 Chrome / Edge 135 以上', 'Option lists of dropdowns open inside the page with animation (system pickers cannot animate). Requires Chrome / Edge 135+'],
    m_selectNA: ['当前浏览器不支持，保持系统列表', 'Not supported in this browser; the system list is kept'],
    m_welcome: ['欢迎页', 'Welcome screen'],
    m_welcome_d: ['最近的聊天逐条浮现，「显示更多」也逐条展开', 'Recent chats appear one by one, also when showing more'],
    m_reasoning: ['思维链', 'Reasoning'],
    m_reasoning_d: ['展开、收起思维链', 'Expanding and collapsing reasoning blocks'],

    secCompat: ['兼容与性能', 'Compatibility & performance'],
    prerender: ['面板预渲染', 'Prerender panels'],
    prerender_d: ['关闭的面板保留排版结果，再次打开更快', 'Closed panels keep their layout and reopen faster'],
    lite: ['低配模式', 'Lite mode'],
    lite_d: ['只用淡入淡出，不做模糊和裁剪', 'Fades only; no blur or clipping'],
    override: ['覆盖美化动效', 'Override theme motion'],
    override_d: ['美化自带的过渡和动画让位给插件', 'Theme transitions and animations yield to this extension'],
    followSystemReduced: ['跟随系统和酒馆的减少动效', 'Follow system & SillyTavern reduced motion'],
    followSystemReduced_d: ['开启后，系统要求减少动画或酒馆开了「减少动态效果」时，只做短暂淡入淡出', 'When on, only short fades are used if the system or SillyTavern asks for reduced motion'],

    followPointer: ['弹窗从点击位置展开', 'Popups grow from the tap point'],
    followPointer_d: ['关闭时弹窗从屏幕中央出现', 'When off, popups appear from the center'],
    haptics: ['按压震动', 'Haptic feedback'],
    haptics_d: ['按下时轻微震动，仅安卓', 'Light vibration on press, Android only'],
    reset: ['恢复默认设置', 'Reset to defaults'],

    group_core: ['日常', 'Everyday'],
    group_lively: ['活泼', 'Lively'],
    group_mood: ['氛围', 'Mood'],
    group_quirky: ['个性', 'Quirky'],
    group_custom: ['自定义', 'Custom'],
    newCustom: ['新建', 'New'],
    newCustom_d: ['以当前风格为起点', 'Starts from the current style'],
    customNote: ['调整下面的参数，改动立即生效。曲线选「弹簧」时，时长由刚度和阻尼决定。', 'Changes apply immediately. With the spring curve, duration follows stiffness and damping.'],
    c_name: ['名称', 'Name'],
    c_curve: ['进场曲线', 'Entry curve'],
    c_stiffness: ['刚度', 'Stiffness'],
    c_damping: ['阻尼', 'Damping'],
    c_inDur: ['进场时长', 'Entry duration'],
    c_outDur: ['退场时长', 'Exit duration'],
    c_y: ['位移', 'Distance'],
    c_s: ['起始缩放', 'Start scale'],
    c_blur: ['模糊', 'Blur'],
    c_press: ['按压缩放', 'Press scale'],
    c_stagger: ['依次间隔', 'Stagger'],
    c_formIn: ['面板打开', 'Panel opening'],
    c_formOut: ['面板关闭', 'Panel closing'],
    c_delete: ['删除这个风格', 'Delete this style'],
    secShare: ['分享设置', 'Share settings'],
    shareNote: ['导出码包含风格、速度、幅度、开合方式、分模块的值和自定义风格，不含作用范围等开关。导入时只读取这些数值，不会运行任何代码。', 'The code holds the style, speed, amplitude, panel motion, per-module values and custom styles, not the on/off switches. Importing only reads these values and never runs code.'],
    exportBtn: ['导出并复制', 'Export & copy'],
    importBtn: ['导入', 'Import'],
    importPlaceholder: ['粘贴导出码', 'Paste a code'],
    exported: ['已复制到剪贴板', 'Copied to clipboard'],
    exportedManual: ['复制失败，请手动复制上面的文字', 'Copy failed; select the text above manually'],
    imported: ['已导入', 'Imported'],
    importBad: ['导入码无效', 'Invalid code'],
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
