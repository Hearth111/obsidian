/* =========================================
   4. App: Core Controller & Event Listeners
   ========================================= */

const els = {};

// Helper to get active element based on pane
window.getActiveEditor = () => {
    const pane = document.getElementById(`pane-${state.activePaneIndex}`);
    return pane ? pane.querySelector('.pane-editor') : null;
};

// アプリケーション初期化のメイン関数
window.initAppData = function () {
    // 1. DOM要素の参照を取得 (elsを初期化)
    const id = (i) => document.getElementById(i);
    Object.assign(els, {
        workspaceGrid: id('workspace-grid'),
        title: id('title-input'), searchBox: id('search-box'),
        sidebarContent: id('sidebar-container'), fileTree: id('file-tree'),
        tabBar: id('tab-bar'),
        switcherOverlay: id('switcher-overlay'), switcherInput: id('switcher-input'), switcherList: id('switcher-list'),
        commandOverlay: id('command-overlay'), commandInput: id('command-input'), commandList: id('command-list'),
        settingsOverlay: id('settings-overlay'), keybindList: id('keybind-list'),
        templateFolderInput: id('template-folder-input'), templateIncludeSub: id('template-include-sub'), templateGrouping: id('template-grouping'), templateSpacing: id('template-spacing'),
        phraseOverlay: id('phrase-overlay'), phraseList: id('phrase-list'), phraseTitle: id('phrase-title'),
        timer: id('timer-display'), wordCount: id('word-count'), taskStats: id('task-stats'), progressFill: id('progress-fill'),
        backupStatus: id('backup-status'),
        selectedCount: id('selected-count'),
        sidebarToggle: id('sidebar-toggle'),
        formatMenu: id('format-menu')
    });
    
    // Dynamic getter for editor (compatibility)
    Object.defineProperty(els, 'editor', {
        get: window.getActiveEditor
    });
    // Dynamic getter for preview
    Object.defineProperty(els, 'preview', {
        get: () => {
            const pane = document.getElementById(`pane-${state.activePaneIndex}`);
            return pane ? pane.querySelector('.pane-preview') : null;
        }
    });

    // 2. データのロード
    const defaultNotes = { "Home": "# Welcome v35.1\n\nMulti-pane supported.\n\n[[Daily/Sample]]" };
    state.notes = window.readJson(window.CONFIG.STORAGE_KEY, defaultNotes);
    state.images = window.readJson(window.CONFIG.IMAGES_KEY, {});
    state.expandedFolders = window.readJson(window.CONFIG.EXPANDED_KEY, {});
    state.bookmarks = window.readJson(window.CONFIG.BOOKMARKS_KEY, []);
    state.keymap = window.readJson(window.CONFIG.KEYMAP_KEY, window.DEFAULT_KEYMAP);
    const savedSettings = window.readJson(window.CONFIG.SETTINGS_KEY, window.DEFAULT_SETTINGS);
    state.settings = { ...window.DEFAULT_SETTINGS, ...savedSettings };
    state.isSidebarCollapsed = localStorage.getItem(window.CONFIG.SIDEBAR_KEY) === '1';
    state.currentTitle = localStorage.getItem(window.CONFIG.LAST_OPEN_KEY) || "Home";
    state.clipboardHistory = window.readJson(window.CONFIG.CLIPBOARD_KEY, []);

    // タブの復元
    const savedTabs = window.readJson(window.CONFIG.TABS_KEY, null);
    if (Array.isArray(savedTabs) && savedTabs.length) {
        state.openTabs = Array.from(new Set(savedTabs.filter(t => state.notes[t])));
    }
    if (!state.openTabs.length) state.openTabs = [state.currentTitle];
    if (!state.openTabs.includes(state.currentTitle)) state.openTabs.push(state.currentTitle);

    // 現在のノートが存在しない場合の安全策
    if (!state.notes[state.currentTitle]) state.notes[state.currentTitle] = "# " + state.currentTitle;

    // 3. ペイン(画面)の初期化
    state.panes = [{ id: 0, title: state.currentTitle, type: 'editor' }];
    state.activePaneIndex = 0;

    // 4. UIの描画
    window.renderSidebar(); // ★ここでサイドバーを描画 (elsの準備後に実行)
    window.renderPanes();
    window.renderTabBar();
    window.applySidebarState();

    // 5. 履歴・イベント設定・その他
    window.pushHistory(state.currentTitle);
    window.persistTabs();
    setupEventListeners(); // イベントリスナー設定
    window.refreshTemplateSources();
    window.lazyInitHeavyFeatures();

    // 終了時の警告
    window.onbeforeunload = function(e) {
        if (state.isModified) {
            e.returnValue = '編集中の内容があります';
            return '編集中の内容があります';
        }
    };
};

// アプリ起動時に呼び出す
document.addEventListener("DOMContentLoaded", () => {
    window.initAppData();
});

function setupEventListeners() {
    // Global delegation for editor events since editors are dynamic
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('pane-editor')) {
            const paneId = parseInt(e.target.closest('.pane').dataset.id, 10);
            const pane = state.panes[paneId];
            if (pane) {
                state.notes[pane.title] = e.target.value;
                window.saveData();
                window.updateStatusBar();
            }
        }
    });

    const selectionWatcher = (e) => { 
        if(e.target.classList.contains('pane-editor')) {
            window.updateSelectedCount(); 
            window.updateFormatMenu(e); 
        }
    };
    document.addEventListener('mouseup', selectionWatcher);
    document.addEventListener('keyup', selectionWatcher);
    document.addEventListener('select', selectionWatcher);
    document.addEventListener('scroll', window.hideFormatMenu, true);
    
    els.searchBox.addEventListener('input', window.handleSearch);
    document.getElementById('btn-new-note').onclick = () => window.createNewNote();
    document.getElementById('btn-today').onclick = window.openToday;
    document.getElementById('btn-export').onclick = () => window.exportData();
    document.getElementById('btn-import').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = window.importData;
    document.getElementById('sidebar').oncontextmenu = (e) => window.showContextMenu(e, {isRoot:true});
    if (els.sidebarToggle) els.sidebarToggle.onclick = window.toggleSidebar;
    
    els.sidebarContent.ondragover = (e) => e.preventDefault();
    els.sidebarContent.ondrop = window.handleDropRoot;

    els.title.onchange = () => window.performRename(state.currentTitle, els.title.value.trim());
    document.getElementById('btn-back').onclick = window.goBack;
    document.getElementById('btn-fwd').onclick = window.goForward;
    document.getElementById('btn-settings').onclick = window.openSettings;
    
    document.getElementById('btn-table').onclick = window.insertTable;
    document.getElementById('btn-template').onclick = (e) => {
        e.stopPropagation();
        const m = document.getElementById('template-menu');
        const r = e.target.getBoundingClientRect();
        m.style.top = (r.bottom+5)+'px'; m.style.left = r.left+'px'; m.style.display = 'block';
    };
    document.querySelectorAll('#format-menu button').forEach(btn => {
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.applyFormatting(btn.dataset.action); };
    });
    document.getElementById('btn-download').onclick = window.downloadNote;
    document.getElementById('btn-privacy').onclick = window.togglePrivacy;
    document.getElementById('btn-dashboard').onclick = window.toggleDashboard;
    
    document.getElementById('btn-split-add').onclick = window.splitPane;
    document.getElementById('btn-mode').onclick = window.togglePreviewMode;

    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.onclick = () => window.switchSettingsPanel(tab.dataset.panel);
    });

    els.timer.onclick = window.toggleTimer;

    document.onclick = (e) => {
        if(e.target === els.switcherOverlay) window.closeSwitcher();
        if(e.target === els.commandOverlay) window.closeCommandPalette();
        if(e.target === els.settingsOverlay) window.closeSettings();
        if(e.target === els.phraseOverlay) window.closePhraseOverlay();
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('template-menu').style.display = 'none';
        if (!e.target.closest('#format-menu')) window.hideFormatMenu();
    };
    document.onkeydown = window.handleGlobalKeys;
    els.switcherInput.oninput = window.updateSwitcher;
    els.commandInput.oninput = window.updateCommandPalette;

    document.getElementById('btn-save-settings').onclick = window.saveSettings;
    document.getElementById('btn-reset-settings').onclick = window.resetSettings;
}

window.persistTabs = function() {
    window.writeJson(window.CONFIG.TABS_KEY, state.openTabs);
};

window.loadNote = function(title, isHistoryNav = false) {
    if (state.isDashboard) window.toggleDashboard();
    
    if (!state.panes[state.activePaneIndex]) state.panes[state.activePaneIndex] = { id: state.activePaneIndex, title: title, type: 'editor' };
    state.panes[state.activePaneIndex].title = title;
    
    const content = state.notes[title] || "";
    if (content.startsWith(window.CANVAS_MARKER)) {
        state.panes[state.activePaneIndex].type = 'canvas';
        window.loadCanvasData(content);
    } else {
        if (state.panes[state.activePaneIndex].type === 'canvas') {
            state.panes[state.activePaneIndex].type = 'editor';
        }
    }

    if (!isHistoryNav && title !== state.currentTitle) {
        window.pushHistory(title);
    }
    
    if (!state.openTabs.includes(title)) state.openTabs.push(title);
    state.currentTitle = title;
    localStorage.setItem(window.CONFIG.LAST_OPEN_KEY, title);
    
    window.persistTabs();
    window.renderTabBar();
    window.renderPanes();
    state.isModified = false; 
    window.updateSelectedCount();
    
    els.title.value = title;
};

window.pushHistory = function(title) {
    state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
    state.historyStack.push(title);
    state.historyIndex++;
    window.updateNavButtons();
};

window.goBack = function() { if (state.historyIndex > 0) window.loadNote(state.historyStack[--state.historyIndex], true); };
window.goForward = function() { if (state.historyIndex < state.historyStack.length - 1) window.loadNote(state.historyStack[++state.historyIndex], true); };
window.updateNavButtons = function() { 
    document.getElementById('btn-back').disabled = state.historyIndex <= 0; 
    document.getElementById('btn-fwd').disabled = state.historyIndex >= state.historyStack.length - 1; 
};

window.toggleDashboard = function() { state.isDashboard = !state.isDashboard; window.renderPanes(); };
window.togglePrivacy = function() { state.isPrivacy = !state.isPrivacy; document.body.classList.toggle('privacy-active', state.isPrivacy); document.getElementById('btn-privacy').classList.toggle('btn-active', state.isPrivacy); };

window.createNewNote = function(prefix = "") {
    const n = prompt("新規ノート名:", prefix);
    if (!n) return;

    if (!state.notes[n]) {
        state.notes[n] = "# " + n.split('/').pop() + "\n";
    }

    window.invalidateTemplateCache();
    window.loadNote(n);
    window.saveData();
};

window.createNewFolder = function(prefix = "") {
    const n = prompt("新規フォルダ名:", prefix);
    if (n) {
        const p = n + "/" + window.FOLDER_MARKER;
        state.notes[p] = "";
        window.invalidateTemplateCache();
        window.loadNote(p);
        window.saveData();
    }
};

window.openToday = function() { 
    const d = new Date(); 
    const t = `${d.getFullYear()}/${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)}/Daily`;
    if (!state.notes[t]) {
        state.notes[t] = `# ${t.split('/').pop()}\n\n## タスク\n- [ ] \n`;
        window.invalidateTemplateCache();
        window.loadNote(t);
        window.saveData();
    } else {
        window.loadNote(t);
    }
};

window.handleGlobalKeys = function(e) {
    let keyStr = '';
    const isSaveAttempt = (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey);
    const saveDataBinding = state.keymap['save-data'];

    if (isSaveAttempt) {
        e.preventDefault(); 
        if (e.ctrlKey || e.metaKey) keyStr += (e.metaKey ? 'Cmd+' : 'Ctrl+');
        keyStr += 'S';
        if (saveDataBinding && (saveDataBinding === keyStr || (saveDataBinding === 'Ctrl+S' && e.metaKey))) {
            const cmd = window.COMMANDS.find(c => c.id === 'save-data');
            if (cmd) cmd.handler();
            return;
        }
    }
    
    if (!keyStr) {
        if (e.ctrlKey || e.metaKey) keyStr += (e.metaKey ? 'Cmd+' : 'Ctrl+'); 
        if (e.altKey) keyStr += 'Alt+'; 
        if (e.shiftKey) keyStr += 'Shift+';
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        keyStr += (e.key === ' ' ? 'Space' : e.key.toUpperCase());
    }

    if (state.pendingConnectNodeId && e.key === 'Escape') {
        state.pendingConnectNodeId = null;
        window.renderCanvas();
        return;
    }

    if ((document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && (!e.ctrlKey && !e.altKey && !e.metaKey)) return;

    for (const [cmdId, binding] of Object.entries(state.keymap)) {
        if (binding && binding === keyStr) {
            e.preventDefault();
            const cmd = window.COMMANDS.find(c => c.id === cmdId);
            if (cmd) cmd.handler();
            return;
        }
    }
    
    if (els.switcherOverlay.style.display === 'flex' && e.key === 'Escape') window.closeSwitcher();
    if (els.commandOverlay.style.display === 'flex' && e.key === 'Escape') window.closeCommandPalette();
    if (els.settingsOverlay.style.display === 'flex' && e.key === 'Escape') window.closeSettings();
}