/* =========================================
   4. App: Core Controller & Event Listeners
   ========================================= */

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    const id = (i) => document.getElementById(i);
    Object.assign(els, {
        editor: id('editor'), preview: id('preview'), workspace: id('workspace'),
        canvasArea: id('canvas-area'), canvasLayer: id('canvas-layer'),
        title: id('title-input'), searchBox: id('search-box'),
        sidebarContent: id('sidebar-container'), fileTree: id('file-tree'),
        switcherOverlay: id('switcher-overlay'), switcherInput: id('switcher-input'), switcherList: id('switcher-list'),
        commandOverlay: id('command-overlay'), commandInput: id('command-input'), commandList: id('command-list'),
        settingsOverlay: id('settings-overlay'), keybindList: id('keybind-list'),
        phraseOverlay: id('phrase-overlay'), phraseList: id('phrase-list'), phraseTitle: id('phrase-title'),
        timer: id('timer-display'), wordCount: id('word-count'), taskStats: id('task-stats'), progressFill: id('progress-fill'),
        backupStatus: id('backup-status'),
        selectedCount: id('selected-count') // 追加
    });

    try {
        state.notes = JSON.parse(localStorage.getItem(window.CONFIG.STORAGE_KEY)) || { "Home": "# Welcome v35.1\n\nFixed restore bug.\n\n[[Daily/Sample]]" };
        state.images = JSON.parse(localStorage.getItem(window.CONFIG.IMAGES_KEY)) || {};
        state.expandedFolders = JSON.parse(localStorage.getItem(window.CONFIG.EXPANDED_KEY)) || {};
        state.bookmarks = JSON.parse(localStorage.getItem(window.CONFIG.BOOKMARKS_KEY)) || [];
        state.keymap = JSON.parse(localStorage.getItem(window.CONFIG.KEYMAP_KEY)) || window.DEFAULT_KEYMAP;
        state.currentTitle = localStorage.getItem(window.CONFIG.LAST_OPEN_KEY) || "Home";
    } catch (e) {
        console.error("Failed to load data:", e);
        state.notes = { "Home": "# Error Recovery\n\nData load failed. Starting fresh." };
        state.currentTitle = "Home";
    }

    if (!state.notes[state.currentTitle]) state.notes[state.currentTitle] = "";
    
    window.pushHistory(state.currentTitle);
    window.loadNoteUI(state.currentTitle);
    setupEventListeners();

    // ウィンドウを閉じるときに確認ダイアログを表示
    window.onbeforeunload = function(e) {
        if (state.isModified) {
            const confirmationMessage = '編集中の内容がありますが、閉じますか？ (データはlocalStorageに自動保存されていますが、最後に手動保存(JSON)してから変更があります)';
            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    };
});

function setupEventListeners() {
    els.editor.addEventListener('input', () => {
        state.notes[state.currentTitle] = els.editor.value;
        window.saveData();
        window.updateStatusBar();
        if (state.isSplit && !state.isDashboard) window.renderPreview();
    });
    els.editor.addEventListener('paste', window.handlePaste);
    els.editor.addEventListener('keydown', window.handleEditorKeydown);
    
    // 追加: 文字が選択されたか、キーボードで選択範囲が動いたかを検出
    els.editor.addEventListener('mouseup', window.updateSelectedCount);
    els.editor.addEventListener('keyup', window.updateSelectedCount);

    els.searchBox.addEventListener('input', window.handleSearch);
    document.getElementById('btn-new-note').onclick = () => window.createNewNote();
    document.getElementById('btn-today').onclick = window.openToday;
    document.getElementById('btn-export').onclick = () => window.exportData();
    document.getElementById('btn-import').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = window.importData;
    document.getElementById('sidebar').oncontextmenu = (e) => window.showContextMenu(e, {isRoot:true});
    
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
    document.getElementById('btn-download').onclick = window.downloadNote;
    document.getElementById('btn-privacy').onclick = window.togglePrivacy;
    document.getElementById('btn-dashboard').onclick = window.toggleDashboard;
    document.getElementById('btn-split').onclick = window.toggleSplit;
    document.getElementById('btn-mode').onclick = window.togglePreviewMode;

    els.timer.onclick = window.toggleTimer;

    // Canvas Events
    document.getElementById('cv-zoom-in').onclick = () => window.zoomCanvas(0.1);
    document.getElementById('cv-zoom-out').onclick = () => window.zoomCanvas(-0.1);
    document.getElementById('cv-reset').onclick = window.resetCanvas;
    document.getElementById('cv-add-group').onclick = window.addCanvasGroup;
    
    // Canvas Mode Switch
    document.getElementById('cv-mode-pointer').onclick = () => window.toggleCanvasMode('edit');
    document.getElementById('cv-mode-pan').onclick = () => window.toggleCanvasMode('pan');
    // 追加: ノード接続モード
    document.getElementById('cv-mode-connect').onclick = () => window.toggleCanvasMode('connect');

    document.onclick = (e) => {
        if(e.target === els.switcherOverlay) window.closeSwitcher();
        if(e.target === els.commandOverlay) window.closeCommandPalette();
        if(e.target === els.settingsOverlay) window.closeSettings();
        if(e.target === els.phraseOverlay) window.closePhraseOverlay();
        document.getElementById('context-menu').style.display = 'none';
        document.getElementById('template-menu').style.display = 'none';
    };
    document.onkeydown = window.handleGlobalKeys;
    els.switcherInput.oninput = window.updateSwitcher;
    els.commandInput.oninput = window.updateCommandPalette;
    
    els.canvasArea.addEventListener('mousedown', window.handleCanvasMouseDown);
    els.canvasArea.addEventListener('mousemove', window.handleCanvasMouseMove);
    els.canvasArea.addEventListener('mouseup', window.handleCanvasMouseUp);
    els.canvasArea.addEventListener('wheel', window.handleCanvasWheel);
    els.canvasArea.addEventListener('dblclick', window.handleCanvasDblClick);

    document.getElementById('btn-save-settings').onclick = window.saveSettings;
    document.getElementById('btn-reset-settings').onclick = window.resetSettings;

    document.querySelectorAll('#template-menu div').forEach(d => {
        d.onclick = () => window.insertTemplate(d.dataset.tmpl);
    });
}

// --- Core Logic Implementation (Attached to window) ---

window.loadNote = function(title, isHistoryNav = false) {
    if (state.isDashboard) window.toggleDashboard(); 
    if (!isHistoryNav && title !== state.currentTitle) {
        window.pushHistory(title);
    }
    state.currentTitle = title;
    localStorage.setItem(window.CONFIG.LAST_OPEN_KEY, title);
    window.loadNoteUI(title);
    state.isModified = false; // Reset flag on note switch/load
    window.updateSelectedCount(); // 追加: ノート切り替え時に選択文字数表示をリセット
};

window.loadNoteUI = function(title) {
    els.title.value = title;
    const content = state.notes[title] || "";
    
    if (content.startsWith(window.CANVAS_MARKER)) {
        state.isCanvasMode = true;
        window.updateLayout();
        window.loadCanvasData(content);
    } else {
        state.isCanvasMode = false;
        els.editor.value = content;
        window.updateLayout();
        window.updateStatusBar(); // UI Logic
        if (state.isPreview || state.isSplit) window.renderPreview();
    }
    window.renderSidebar(); // UI Logic
    window.updateNavButtons();
};

window.updateLayout = function() {
    const { isDashboard, isSplit, isCanvasMode } = state;
    const editor = els.editor;
    const preview = els.preview;
    const canvas = els.canvasArea;
    const modeBtn = document.getElementById('btn-mode');
    const splitBtn = document.getElementById('btn-split');
    const dashBtn = document.getElementById('btn-dashboard');

    editor.className = 'hidden';
    preview.className = 'hidden';
    canvas.classList.remove('active');
    
    dashBtn.classList.remove('btn-active');
    dashBtn.textContent = "✅ 全タスク";
    splitBtn.classList.remove('btn-active');
    
    if (isCanvasMode) {
        canvas.classList.add('active');
        modeBtn.disabled = true;
        splitBtn.disabled = true;
        return;
    }
    modeBtn.disabled = false;
    splitBtn.disabled = false;

    if (isDashboard) {
        preview.className = 'w-100 no-border';
        preview.style.display = 'block';
        dashBtn.classList.add('btn-active');
        dashBtn.textContent = "📝 戻る";
        window.renderTaskDashboard(); // UI Logic
        return;
    }

    if (isSplit) {
        editor.className = 'w-50';
        preview.className = 'w-50';
        editor.style.display = 'block';
        preview.style.display = 'block';
        splitBtn.classList.add('btn-active');
        modeBtn.textContent = "👁 プレビュー"; 
        window.renderPreview();
        return;
    }

    if (state.isPreview) {
        preview.className = 'w-100 no-border';
        preview.style.display = 'block';
        modeBtn.textContent = "✎ 編集";
        modeBtn.classList.add('btn-active');
        window.renderPreview();
        return;
    }

    editor.className = 'w-100';
    editor.style.display = 'block';
    modeBtn.textContent = "👁 プレビュー";
    modeBtn.classList.remove('btn-active');
    editor.focus();
};

window.renderPreview = function() {
    if (!els.preview) return;
    const content = state.notes[state.currentTitle] || "";
    els.preview.innerHTML = window.parseMarkdown(content);
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

window.toggleDashboard = function() { state.isDashboard = !state.isDashboard; window.updateLayout(); };
window.toggleSplit = function() { state.isSplit = !state.isSplit; if(state.isSplit) state.isPreview = false; window.updateLayout(); };
window.togglePreviewMode = function() { if(state.isSplit) { window.toggleSplit(); return; } state.isPreview = !state.isPreview; window.updateLayout(); };
window.togglePrivacy = function() { state.isPrivacy = !state.isPrivacy; document.body.classList.toggle('privacy-active', state.isPrivacy); document.getElementById('btn-privacy').classList.toggle('btn-active', state.isPrivacy); };

window.createNewNote = function(prefix = "") { const n = prompt("新規ノート名:", prefix); if (n) { if (!state.notes[n]) state.notes[n] = "# " + n.split('/').pop() + "\n"; window.loadNote(n); window.saveData(); if(state.isPreview && !state.isSplit) window.togglePreviewMode(); } };

// ▼ Modified: Added prefix argument to handle folder creation in specific path
window.createNewFolder = function(prefix = "") { 
    const n = prompt("新規フォルダ名:", prefix); 
    if (n) { 
        const p = n + "/" + window.FOLDER_MARKER; 
        state.notes[p] = ""; 
        window.loadNote(p); 
        window.saveData(); 
    } 
};

window.openToday = function() { const d = new Date(); const t = `${d.getFullYear()}/${('0' + (d.getMonth() + 1)).slice(-2)}/${('0' + d.getDate()).slice(-2)}/Daily`; if (!state.notes[t]) { state.notes[t] = `# ${t.split('/').pop()}\n\n## タスク\n- [ ] \n`; window.loadNote(t); window.saveData(); } else { window.loadNote(t); } };

window.handleGlobalKeys = function(e) {
    let keyStr = '';
    
    // Ctrl/Cmd + S のブラウザデフォルト動作を抑制するロジックを最優先でチェックする
    const isSaveAttempt = (e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey);
    const saveDataBinding = state.keymap['save-data'];

    // まず、Ctrl/Cmd+Sが押されたかどうかをチェック
    if (isSaveAttempt) {
        // keyStrを生成して設定値と比較するための準備
        // この時点でe.preventDefault()を呼ぶことで、ブラウザの保存ダイアログを確実に防ぐ
        e.preventDefault(); 
        
        // keyStrを生成 (Ctrl+S or Cmd+S)
        if (e.ctrlKey || e.metaKey) keyStr += (e.metaKey ? 'Cmd+' : 'Ctrl+');
        keyStr += 'S';

        // 設定値が 'Ctrl+S' (デフォルト) または 'Cmd+S' (Macの場合) に一致するか確認
        if (saveDataBinding && (saveDataBinding === keyStr || (saveDataBinding === 'Ctrl+S' && e.metaKey))) {
            const cmd = window.COMMANDS.find(c => c.id === 'save-data');
            if (cmd) cmd.handler();
            return;
        }
        
        // 設定値が一致しないか、カスタム設定の場合、keyStrを再度生成して後続のカスタムキーバインドロジックに任せる
    }
    
    // Ctrl/Cmd+Sでなかった場合、またはカスタム設定が他のキーに割り当てられている場合
    
    // keyStrが既に生成されていたら再利用、そうでなければ生成を続行
    if (!keyStr) {
        if (e.ctrlKey || e.metaKey) keyStr += (e.metaKey ? 'Cmd+' : 'Ctrl+'); 
        if (e.altKey) keyStr += 'Alt+'; 
        if (e.shiftKey) keyStr += 'Shift+';
        
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        keyStr += (e.key === ' ' ? 'Space' : e.key.toUpperCase());
    }

    // キャンバスの接続モードキャンセル (Escape)
    if (state.pendingConnectNodeId && e.key === 'Escape') {
        state.pendingConnectNodeId = null;
        window.renderCanvas();
        return;
    }

    // 2. テキスト入力中は、装飾キーなしのホットキーは無視
    if ((document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && (!e.ctrlKey && !e.altKey && !e.metaKey)) return;

    // 3. その他のカスタムホットキーの処理
    for (const [cmdId, binding] of Object.entries(state.keymap)) {
        // Ctrl+Sは既に処理済みだが、他のカスタムキーバインドをチェック
        if (binding && binding === keyStr) {
            e.preventDefault();
            const cmd = window.COMMANDS.find(c => c.id === cmdId);
            if (cmd) cmd.handler();
            return;
        }
    }
    
    // 4. Close overlays on Escape
    if (els.switcherOverlay.style.display === 'flex' && e.key === 'Escape') window.closeSwitcher();
    if (els.commandOverlay.style.display === 'flex' && e.key === 'Escape') window.closeCommandPalette();
    if (els.settingsOverlay.style.display === 'flex' && e.key === 'Escape') window.closeSettings();
    
    // キー入力後に選択文字数も更新する（キーボードによる選択範囲変更に対応）
    if(document.activeElement === els.editor) window.updateSelectedCount();
}