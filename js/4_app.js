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
        layoutTemplateLines: id('layout-template-lines'), layoutTemplateActive: id('layout-template-active'),
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
    const savedLayout = window.readJson(window.CONFIG.LAYOUT_TEMPLATES_KEY, window.DEFAULT_LAYOUT_SETTINGS);
    const loadedTemplates = Array.isArray(savedLayout.templates) && savedLayout.templates.length ? savedLayout.templates : window.DEFAULT_LAYOUT_SETTINGS.templates;
    state.layoutTemplates = window.cloneLayoutTemplates(loadedTemplates);
    state.activeLayoutTemplate = Number.isInteger(savedLayout.activeIndex) ? savedLayout.activeIndex : window.DEFAULT_LAYOUT_SETTINGS.activeIndex;
    state.isSidebarCollapsed = localStorage.getItem(window.CONFIG.SIDEBAR_KEY) === '1';
    state.viewMode = localStorage.getItem(window.CONFIG.VIEW_MODE_KEY) === 'classic' ? 'classic' : 'desktop';
    state.currentTitle = localStorage.getItem(window.CONFIG.LAST_OPEN_KEY) || "Home";
    state.clipboardHistory = window.readJson(window.CONFIG.CLIPBOARD_KEY, []);

    // タブの復元
    const savedTabs = window.readJson(window.CONFIG.TABS_KEY, null);
    if (Array.isArray(savedTabs) && savedTabs.length) {
        state.openTabs = Array.from(new Set(savedTabs.filter(t => state.notes[t])));
    }

    // 3. ペイン(画面)の初期化
    state.panes = [];
    state.paneSizes = window.readJson(window.CONFIG.PANES_KEY, [1]);
    state.paneLayouts = window.readJson(window.CONFIG.PANE_LAYOUTS_KEY, []);
    state.desktopSize = window.readJson(window.CONFIG.DESKTOP_SIZE_KEY, null);
    state.zCounter = state.paneLayouts.reduce((max, l) => Math.max(max, (l && l.z) || 0), 10);
    state.activePaneIndex = -1;

    // 4. UIの描画
    window.renderSidebar(); // ★ここでサイドバーを描画 (elsの準備後に実行)
    window.renderPanes();
    window.renderTabBar();
    window.applySidebarState();
    window.updateLayoutButtonLabel();
    window.updateTimerUI();

    // 5. 履歴・イベント設定・その他
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
    setupEditorEventDelegation();
    setupSidebarAndToolbarHandlers();
    setupWorkspaceDropHandlers();
    setupNavigationHandlers();
    setupFormattingMenuHandlers();
    setupModeAndLayoutHandlers();
    setupTimerAndOverlayHandlers();
    setupSettingsHandlers();
}

function setupEditorEventDelegation() {
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
            state.activeSelectionTarget = e.target;
            window.updateSelectedCount(e.target);
            window.updateFormatMenu(e.target);
        }
    };
    document.addEventListener('mouseup', selectionWatcher);
    document.addEventListener('keyup', selectionWatcher);
    document.addEventListener('select', selectionWatcher);
    document.addEventListener('scroll', window.hideFormatMenu, true);
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('pane-editor')) {
            window.handleEditorKeydown(e);
        }
    });
}

function setupSidebarAndToolbarHandlers() {
    els.searchBox.addEventListener('input', window.handleSearch);
    document.getElementById('btn-new-note').onclick = () => window.createNewNote();
    document.getElementById('btn-today').onclick = window.openToday;
    document.getElementById('btn-export').onclick = () => window.exportData();
    document.getElementById('btn-import').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = window.importData;
    document.getElementById('sidebar').oncontextmenu = (e) => window.showContextMenu(e, {isRoot:true});
    if (els.sidebarToggle) els.sidebarToggle.onclick = window.toggleSidebar;
}

function setupWorkspaceDropHandlers() {
    els.sidebarContent.ondragover = (e) => e.preventDefault();
    els.sidebarContent.ondrop = window.handleDropRoot;

    els.workspaceGrid.ondragover = (e) => {
        if (state.draggedItem) {
            e.preventDefault();
            els.workspaceGrid.classList.add('workspace-drop-target');
        }
    };
    els.workspaceGrid.ondragleave = () => els.workspaceGrid.classList.remove('workspace-drop-target');
    els.workspaceGrid.ondrop = (e) => {
        if (state.draggedItem) {
            e.preventDefault();
            els.workspaceGrid.classList.remove('workspace-drop-target');
            window.openNoteInNewPane(state.draggedItem);
            state.draggedItem = null;
        }
    };
}

function setupNavigationHandlers() {
    els.title.onchange = () => window.performRename(state.currentTitle, els.title.value.trim());
    document.getElementById('btn-back').onclick = window.goBack;
    document.getElementById('btn-fwd').onclick = window.goForward;
    document.getElementById('btn-settings').onclick = window.openSettings;
}

function setupFormattingMenuHandlers() {
    document.getElementById('btn-table').onclick = window.insertTable;
    document.getElementById('btn-template').onclick = (e) => {
        e.stopPropagation();
        const m = document.getElementById('template-menu');
        const r = e.target.getBoundingClientRect();
        m.style.top = (r.bottom+5)+'px'; m.style.left = r.left+'px'; m.style.display = 'block';
    };
    document.getElementById('btn-layout-menu').onclick = (e) => {
        e.stopPropagation();
        window.showLayoutQuickMenu(e.target);
    };
    document.querySelectorAll('#format-menu button').forEach(btn => {
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.applyFormatting(btn.dataset.action); };
    });
    document.getElementById('btn-download').onclick = window.downloadNote;
    document.getElementById('btn-privacy').onclick = window.togglePrivacy;
    document.getElementById('btn-dashboard').onclick = window.toggleDashboard;
}

function setupModeAndLayoutHandlers() {
    document.getElementById('btn-split-add').onclick = window.toggleDualView;
    document.getElementById('btn-mode').onclick = window.togglePreviewMode;

    const layoutSelect = document.getElementById('layout-template-active');
    if (layoutSelect) layoutSelect.onchange = (e) => window.setActiveLayoutTemplate(parseInt(e.target.value, 10) || 0, { persist: true });
}

function setupTimerAndOverlayHandlers() {
    els.timer.onclick = () => window.showTimerQuickMenu(els.timer);

    document.onclick = (e) => {
        if(e.target === els.switcherOverlay) window.closeSwitcher();
        if(e.target === els.commandOverlay) window.closeCommandPalette();
        if(e.target === els.settingsOverlay) window.closeSettings();
        if(e.target === els.phraseOverlay) window.closePhraseOverlay();
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('template-menu').style.display = 'none';
        window.hideLayoutMenu();
        window.hideTimerMenu();
        if (!e.target.closest('#format-menu')) window.hideFormatMenu();
    };
    document.onkeydown = window.handleGlobalKeys;
    els.switcherInput.oninput = window.updateSwitcher;
    els.commandInput.oninput = window.updateCommandPalette;
}

function setupSettingsHandlers() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.onclick = () => window.switchSettingsPanel(tab.dataset.panel);
    });

    document.getElementById('btn-save-settings').onclick = window.saveSettings;
    document.getElementById('btn-reset-settings').onclick = window.resetSettings;

    const builderOverlay = document.getElementById('layout-builder-overlay');
    if (builderOverlay) {
        document.getElementById('btn-open-layout-builder').onclick = window.openLayoutBuilder;
        document.getElementById('btn-close-layout-builder').onclick = window.closeLayoutBuilder;
        document.getElementById('btn-cancel-layout-builder').onclick = window.closeLayoutBuilder;
        document.getElementById('btn-add-vertical').onclick = () => window.addLayoutBuilderSplit('vertical');
        document.getElementById('btn-add-horizontal').onclick = () => window.addLayoutBuilderSplit('horizontal');
        document.getElementById('btn-even-horizontal').onclick = () => window.equalizeLayoutBuilder('horizontal');
        document.getElementById('btn-even-vertical').onclick = () => window.equalizeLayoutBuilder('vertical');
        document.getElementById('btn-reset-columns').onclick = window.resetLayoutBuilderColumns;
        document.getElementById('btn-save-layout-template').onclick = window.saveLayoutFromBuilder;
        builderOverlay.onclick = (e) => { if (e.target === builderOverlay) window.closeLayoutBuilder(); };
    }
}

window.persistTabs = function() {
    window.writeJson(window.CONFIG.TABS_KEY, state.openTabs);
};

window.loadNote = function(title, isHistoryNav = false) {
    if (state.activePaneIndex === -1) {
        state.activePaneIndex = 0;
    }
    if (!state.panes[state.activePaneIndex]) {
        state.panes[state.activePaneIndex] = { id: state.activePaneIndex, title: title, type: 'editor', isPrivacy: false };
        window.ensurePaneLayout(state.activePaneIndex);
    }

    const activePane = state.panes[state.activePaneIndex];
    const isActiveSameTitle = !!(activePane && activePane.title === title);
    const existingPaneIndex = window.findExistingPaneIndex(title, state.activePaneIndex);
    if (!isActiveSameTitle && existingPaneIndex !== -1) {
        if (!state.openTabs.includes(title)) state.openTabs.push(title);
        if (!isHistoryNav && title !== state.currentTitle) window.pushHistory(title);
        state.currentTitle = title;
        localStorage.setItem(window.CONFIG.LAST_OPEN_KEY, title);
        window.persistTabs();
        window.setActivePane(existingPaneIndex);
        return;
    }

    if (!state.panes[state.activePaneIndex]) state.panes[state.activePaneIndex] = { id: state.activePaneIndex, title: title, type: 'editor', isPrivacy: false };
    if (typeof state.panes[state.activePaneIndex].isPrivacy === 'undefined') state.panes[state.activePaneIndex].isPrivacy = false;
    state.panes[state.activePaneIndex].title = title;

    const content = state.notes[title] || "";
    if (content.startsWith(window.CANVAS_MARKER)) {
        state.panes[state.activePaneIndex].type = 'canvas';
        window.loadCanvasData(content);
    } else {
        if (state.panes[state.activePaneIndex].type === 'canvas' || state.panes[state.activePaneIndex].type === 'dashboard') {
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

window.updateSelectedCount = function(target) {
    const counter = document.getElementById('selected-count');
    if (!counter) return;
    const ta = target && target.classList && target.classList.contains('pane-editor') ? target : els.editor;
    if (!ta) { counter.style.display = 'none'; return; }
    const count = Math.abs((ta.selectionEnd || 0) - (ta.selectionStart || 0));
    if (count > 0) {
        counter.textContent = `${count} chars selected`;
        counter.style.display = 'inline-block';
    } else {
        counter.style.display = 'none';
    }
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

window.toggleDashboard = function() {
    const existingIndex = state.panes.findIndex(p => p.type === 'dashboard');
    if (existingIndex !== -1) {
        window.setActivePane(existingIndex);
        return;
    }

    if (state.panes.length >= MAX_PANES) {
        alert(`最大${MAX_PANES}画面までです`);
        return;
    }

    const newPane = { id: state.panes.length, title: 'Dashboard', type: 'dashboard', isPrivacy: false };
    state.panes.push(newPane);
    state.paneSizes.push(1);
    state.paneLayouts.push(window.createPaneLayout(state.panes.length - 1));
    state.activePaneIndex = state.panes.length - 1;
    window.persistPaneSizes();
    window.persistPaneLayouts();
    window.renderPanes();
    window.renderTabBar();
};
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
    const t = window.formatDailyNotePath(new Date());
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