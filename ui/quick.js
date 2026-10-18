// 魔棒菜单里的快捷入口（设置「在魔棒菜单显示快捷入口」，默认关闭）
// 点开后用酒馆的弹窗显示精简设置：总开关、风格、速度、幅度，以及跳到完整设置的按钮。
import { state } from '../core/engine.js';
import { t } from '../core/i18n.js';
import { onApply } from '../core/settings.js';
import { createUI } from './panel.js';

const ID = 'me-wand-entry';

function ensureItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return null;
    let item = document.getElementById(ID);
    if (!item) {
        item = document.createElement('div');
        item.id = ID;
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = `<div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div><span>${t('title')}</span>`;
        item.addEventListener('click', openQuick);
        menu.append(item);
    }
    return item;
}

function sync() {
    const on = !!state.settings?.wandEntry;
    const item = on ? ensureItem() : document.getElementById(ID);
    if (item) item.style.display = on ? '' : 'none';
    // 魔棒按钮在菜单为空时会被酒馆隐藏；加了入口后要显示出来
    if (on) document.getElementById('extensionsMenuButton')?.style.removeProperty('display');
}

async function openQuick() {
    const c = SillyTavern.getContext();
    const ui = createUI({ compact: true });
    try {
        await c.callGenericPopup(ui.el, c.POPUP_TYPE.TEXT, '', { okButton: t('close'), allowVerticalScrolling: true });
    } finally {
        ui.destroy();
    }
}

export function installQuick() {
    onApply(sync);
    sync();
    // 魔棒菜单由酒馆在加载扩展时创建，可能晚于本插件
    if (!document.getElementById('extensionsMenu')) {
        const mo = new MutationObserver(() => {
            if (document.getElementById('extensionsMenu')) { mo.disconnect(); sync(); }
        });
        mo.observe(document.body, { childList: true });
    }
}
