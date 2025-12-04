/* =========================================
   5. UI: Layout, Tabs, Settings & Shared Utils
   ========================================= */

// --- Pane Management ---

const MAX_PANES = 12;

window.ensurePaneSizes = function() {
    if (!Array.isArray(state.paneSizes)) state.paneSizes = [];
    const needsReset = state.paneSizes.length !== state.panes.length || state.paneSizes.some(v => !v || v <= 0);
    if (needsReset) {
        state.paneSizes = Array(state.panes.length).fill(1);
        window.persistPaneSizes();
    }
};

window.persistPaneSizes = function() {
    window.writeJson(window.CONFIG.PANES_KEY, state.paneSizes);
};

window.applyPaneSizes = function() {
    document.querySelectorAll('#workspace-grid .pane-wrapper').forEach((wrap, idx) => {
        wrap.style.flexGrow = state.paneSizes[idx] || 1;
        wrap.style.flexBasis = '0';
    });
};

window.startResizePane = function(e, leftIndex, rightIndex) {
    e.preventDefault();
    const grid = document.getElementById('workspace-grid');
    if (!grid) return;

    const startX = e.clientX;
    const startSizes = [...state.paneSizes];
    const gridRect = grid.getBoundingClientRect();
    const totalFlex = startSizes.reduce((a, b) => a + b, 0) || 1;
    const pxPerFlex = gridRect.width / totalFlex;
    const minFlex = 0.5;

    const onMove = (ev) => {
        const deltaFlex = (ev.clientX - startX) / pxPerFlex;
        const pairTotal = startSizes[leftIndex] + startSizes[rightIndex];
        let newLeft = Math.max(minFlex, startSizes[leftIndex] + deltaFlex);
        newLeft = Math.min(pairTotal - minFlex, newLeft);
        const newRight = pairTotal - newLeft;

        state.paneSizes[leftIndex] = newLeft;
        state.paneSizes[rightIndex] = newRight;
        window.applyPaneSizes();
    };

    const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        window.persistPaneSizes();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
};

window.renderPanes = function() {
    const grid = document.getElementById('workspace-grid');
    if (!grid) return;

    if (state.isDashboard) {
        grid.className = 'grid-1';
        grid.innerHTML = `<div id="dashboard-container" class="pane" style="overflow:auto; width:100%; height:100%;"></div>`;
        const container = document.getElementById('dashboard-container');
        return window.renderTaskDashboard(container);
    }

    window.ensurePaneSizes();
    grid.className = `grid-${state.panes.length}`;
    grid.innerHTML = '';

    state.panes.forEach((pane, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'pane-wrapper';
        wrapper.style.flexGrow = state.paneSizes[index] || 1;

        const paneEl = document.createElement('div');
        paneEl.className = 'pane' + (index === state.activePaneIndex ? ' active-pane' : '');
        paneEl.id = `pane-${index}`;
        paneEl.dataset.id = index;
        paneEl.onclick = () => window.setActivePane(index);

        // Header
        const header = document.createElement('div');
        header.className = 'pane-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'pane-title';
        titleSpan.textContent = pane.title;
        // Click title to open switcher for this pane
        titleSpan.onclick = (e) => { e.stopPropagation(); window.setActivePane(index); window.openSwitcher((t) => window.loadNoteIntoPane(index, t)); };

        const controls = document.createElement('div');
        controls.className = 'pane-controls';

        // Mode toggle button
        if (pane.type !== 'canvas') {
            const modeBtn = document.createElement('button');
            modeBtn.className = 'pane-btn' + (pane.type === 'preview' ? ' btn-active' : '');
            modeBtn.innerHTML = pane.type === 'editor' ? '👁' : '✎';
            modeBtn.title = pane.type === 'editor' ? 'プレビューに切替' : '編集に切替';
            modeBtn.onclick = (e) => { e.stopPropagation(); window.togglePaneMode(index); };
            controls.appendChild(modeBtn);
        }

        // Close button (only if > 1 pane)
        if (state.panes.length > 1) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'pane-btn';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = (e) => { e.stopPropagation(); window.closePane(index); };
            controls.appendChild(closeBtn);
        }

        header.appendChild(titleSpan);
        header.appendChild(controls);
        paneEl.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'pane-content';

        const noteContent = state.notes[pane.title] || "";

        if (pane.type === 'editor') {
            const textarea = document.createElement('textarea');
            textarea.className = 'pane-editor';
            textarea.value = noteContent;
            // Event listener is attached globally in 4_app.js via delegation
            content.appendChild(textarea);
        } else if (pane.type === 'preview') {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'pane-preview';
            previewDiv.innerHTML = window.parseMarkdown(noteContent);
            window.decoratePreview(previewDiv, pane.title);
            content.appendChild(previewDiv);
        } else if (pane.type === 'canvas') {
            // Setup canvas container
            const canvasArea = document.createElement('div');
            canvasArea.id = 'canvas-area'; // ID must be active for canvas logic (limitation of current 3_canvas.js)
            canvasArea.className = 'pane-canvas';
            if (index === state.activePaneIndex) {
                canvasArea.innerHTML = `
                    <div id="canvas-layer">
                        <svg id="canvas-svg"></svg>
                        <div id="canvas-nodes"></div>
                    </div>
                    <div id="canvas-controls" class="pane-canvas-controls">
                        <button class="btn btn-active" id="cv-mode-pointer" onclick="window.toggleCanvasMode('edit')">❖</button>
                        <button class="btn" id="cv-mode-pan" onclick="window.toggleCanvasMode('pan')">✋</button>
                        <span style="border-right:1px solid #666; margin:0 5px;"></span>
                        <button class="btn" onclick="window.addCanvasGroup()">🔲</button>
                        <button class="btn" onclick="window.zoomCanvas(0.1)">＋</button>
                        <button class="btn" onclick="window.zoomCanvas(-0.1)">－</button>
                        <button class="btn" onclick="window.resetCanvas()">⟲</button>
                        <span id="canvas-info" style="color:#666; font-size:0.8em; align-self:center; margin-left:5px;"></span>
                    </div>
                `;
                setTimeout(() => {
                    window.renderCanvas();
                }, 0);
            } else {
                canvasArea.innerHTML = `<div style="padding:20px; color:#666;">(Canvas: Click to activate)</div>`;
            }
            content.appendChild(canvasArea);
        }

        paneEl.appendChild(content);
        wrapper.appendChild(paneEl);
        grid.appendChild(wrapper);

        if (index < state.panes.length - 1) {
            const resizer = document.createElement('div');
            resizer.className = 'pane-resizer';
            resizer.onpointerdown = (e) => window.startResizePane(e, index, index + 1);
            grid.appendChild(resizer);
        }
    });

    window.applyPaneSizes();
    window.updateModeToggleButton();
    window.updateDualViewButton();
};

window.setActivePane = function(index) {
    if (index < 0 || index >= state.panes.length) return;
    state.activePaneIndex = index;
    const pane = state.panes[index];
    state.currentTitle = pane.title;
    
    // Canvas Handling: If activating a canvas pane, verify global canvas state matches
    if (pane.type === 'canvas') {
        const content = state.notes[pane.title];
        window.loadCanvasData(content);
    } else {
        state.isCanvasMode = false;
    }
    
    // Update Header
    const titleInput = document.getElementById('title-input');
    if(titleInput) titleInput.value = pane.title;

    window.renderPanes();
    window.renderTabBar();
};

window.toggleDualView = function() {
    const active = state.panes[state.activePaneIndex];
    if (!active || active.type === 'canvas') return;

    let editorIndex = state.panes.findIndex(p => p.title === active.title && p.type === 'editor');
    if (editorIndex === -1) {
        active.type = 'editor';
        editorIndex = state.activePaneIndex;
    }

    const existingPreviewIndex = state.panes.findIndex((p, idx) => idx !== editorIndex && p.title === active.title && p.type === 'preview');
    if (existingPreviewIndex !== -1) {
        state.panes.splice(existingPreviewIndex, 1);
        state.paneSizes.splice(existingPreviewIndex, 1);
        state.panes.forEach((p, i) => p.id = i);
        state.activePaneIndex = Math.min(editorIndex, state.panes.length - 1);
        state.currentTitle = state.panes[state.activePaneIndex].title;
        window.persistPaneSizes();
        window.renderPanes();
        return;
    }

    if (state.panes.length >= MAX_PANES) {
        alert(`最大${MAX_PANES}画面までです`);
        return;
    }

    const previewPane = { id: state.panes.length, title: active.title, type: 'preview' };
    const insertIndex = editorIndex + 1;
    state.panes.splice(insertIndex, 0, previewPane);
    const baseSize = state.paneSizes[editorIndex] || 1;
    state.paneSizes.splice(insertIndex, 0, baseSize);
    state.panes.forEach((p, i) => p.id = i);
    state.activePaneIndex = editorIndex;
    state.currentTitle = active.title;
    window.persistPaneSizes();
    window.renderPanes();
};

window.splitPane = function() { window.toggleDualView(); };

window.closePane = function(index) {
    if (state.panes.length <= 1) return;
    state.panes.splice(index, 1);
    state.paneSizes.splice(index, 1);
    if (!state.paneSizes.length) state.paneSizes = [1];
    // Reassign IDs/Index
    state.panes.forEach((p, i) => p.id = i);
    state.activePaneIndex = Math.min(state.activePaneIndex, state.panes.length - 1);
    window.persistPaneSizes();
    window.setActivePane(state.activePaneIndex);
};

window.loadNoteIntoPane = function(index, title) {
    window.setActivePane(index);
    window.loadNote(title);
};

window.openNoteInNewPane = function(path) {
    if (!state.notes[path]) return;
    if (state.panes.length >= MAX_PANES) {
        alert(`最大${MAX_PANES}画面までです`);
        return;
    }
    const content = state.notes[path];
    const type = content.startsWith(window.CANVAS_MARKER) ? 'canvas' : 'editor';
    const newPane = { id: state.panes.length, title: path, type };
    state.panes.push(newPane);
    state.paneSizes.push(1);
    state.activePaneIndex = state.panes.length - 1;
    window.persistPaneSizes();
    window.loadNote(path);
};

window.togglePaneMode = function(index) {
    const pane = state.panes[index];
    if (pane.type === 'canvas') return; // Canvas has no toggle
    pane.type = pane.type === 'editor' ? 'preview' : 'editor';
    window.renderPanes();
};

window.togglePreviewMode = function() {
    window.togglePaneMode(state.activePaneIndex);
};

window.updateModeToggleButton = function() {
    const btn = document.getElementById('btn-mode');
    const pane = state.panes[state.activePaneIndex];
    if (!btn) return;

    if (!pane || pane.type === 'canvas') {
        btn.textContent = '👁 プレビュー';
        btn.classList.remove('btn-active');
        btn.disabled = !pane || pane.type === 'canvas';
        return;
    }

    btn.disabled = false;
    if (pane.type === 'editor') {
        btn.textContent = '👁 プレビュー';
        btn.classList.remove('btn-active');
    } else {
        btn.textContent = '✎ 編集';
        btn.classList.add('btn-active');
    }
};

window.updateDualViewButton = function() {
    const btn = document.getElementById('btn-split-add');
    const active = state.panes[state.activePaneIndex];
    if (!btn) return;

    btn.disabled = !!(active && active.type === 'canvas');
    if (btn.disabled) {
        btn.classList.remove('btn-active');
        return;
    }

    const hasPreview = !!(active && state.panes.some((p, idx) => idx !== state.activePaneIndex && p.title === active.title && p.type === 'preview'));
    btn.classList.toggle('btn-active', hasPreview);
};

// --- Shared Menu Helper ---
window.addMenu = function(p, text, act, isDel) {
    const d = document.createElement('div');
    d.textContent = text;
    if (isDel) d.className = 'delete-option';
    d.onclick = (e) => { e.stopPropagation(); act(); document.getElementById('context-menu').style.display = 'none'; };
    p.appendChild(d);
};

// --- Sidebar State ---
window.applySidebarState = function() {
    document.body.classList.toggle('sidebar-collapsed', state.isSidebarCollapsed);
    const btn = document.getElementById('sidebar-toggle');
    if (btn) {
        btn.textContent = state.isSidebarCollapsed ? '☰' : '☰'; // Icon stays same, logic handles view
        btn.title = state.isSidebarCollapsed ? 'サイドバーを開く' : 'サイドバーを閉じる';
    }
};

window.toggleSidebar = function() {
    state.isSidebarCollapsed = !state.isSidebarCollapsed;
    localStorage.setItem(window.CONFIG.SIDEBAR_KEY, state.isSidebarCollapsed ? '1' : '0');
    window.applySidebarState();
};

// --- Tab System ---
window.renderTabBar = function() {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;
    tabBar.innerHTML = '';
    state.openTabs.forEach((title, index) => {
        const item = document.createElement('div');
        item.className = 'tab-item' + (title === state.currentTitle ? ' active' : '');
        item.draggable = true;

        item.ondragstart = (e) => {
            e.dataTransfer.setData('text/tab-index', index);
            e.dataTransfer.effectAllowed = 'move';
            item.style.opacity = '0.5';
        };
        item.ondragend = () => {
            item.style.opacity = '1';
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('drag-over'));
        };
        item.ondragover = (e) => { e.preventDefault(); item.classList.add('drag-over'); };
        item.ondragleave = () => item.classList.remove('drag-over');
        item.ondrop = (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const oldIndex = parseInt(e.dataTransfer.getData('text/tab-index'), 10);
            if (!isNaN(oldIndex) && oldIndex !== index) {
                window.moveTab(oldIndex, index);
            }
        };

        item.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            window.showTabContextMenu(e, title, index);
        };

        item.onclick = () => { if (title !== state.currentTitle) window.loadNote(title); };

        const label = document.createElement('span');
        label.textContent = title;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = (e) => { e.stopPropagation(); window.closeTab(title); };
        
        item.appendChild(label);
        item.appendChild(closeBtn);
        tabBar.appendChild(item);
    });
};

window.moveTab = function(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= state.openTabs.length || toIndex < 0 || toIndex >= state.openTabs.length) return;
    const item = state.openTabs.splice(fromIndex, 1)[0];
    state.openTabs.splice(toIndex, 0, item);
    window.persistTabs();
    window.renderTabBar();
};

window.showTabContextMenu = function(e, title, index) {
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    window.addMenu(m, "❌ このタブを閉じる", () => window.closeTab(title));
    window.addMenu(m, "🚫 他のタブをすべて閉じる", () => {
        state.openTabs = [title];
        window.persistTabs();
        window.renderTabBar();
        if (state.currentTitle !== title) window.loadNote(title);
    });
    if (index > 0) {
        window.addMenu(m, "⬅️ 左側のタブを閉じる", () => {
            state.openTabs = state.openTabs.slice(index);
            window.persistTabs();
            window.renderTabBar();
            if (!state.openTabs.includes(state.currentTitle)) window.loadNote(title);
        });
    }
    if (index < state.openTabs.length - 1) {
        window.addMenu(m, "➡️ 右側のタブを閉じる", () => {
            state.openTabs = state.openTabs.slice(0, index + 1);
            window.persistTabs();
            window.renderTabBar();
            if (!state.openTabs.includes(state.currentTitle)) window.loadNote(title);
        });
    }
    m.style.top = e.pageY + 'px';
    m.style.left = e.pageX + 'px';
    m.style.display = 'block';
};

window.closeTab = function(title) {
    const idx = state.openTabs.indexOf(title);
    if (idx === -1) return;
    state.openTabs.splice(idx, 1);
    if (!state.openTabs.length) {
        if (!state.notes['Home']) state.notes['Home'] = '# Home\n';
        state.openTabs.push('Home');
    }
    const nextIndex = Math.min(idx, state.openTabs.length - 1);
    const nextTitle = title === state.currentTitle ? state.openTabs[nextIndex] : state.currentTitle;
    window.persistTabs();
    window.renderTabBar();
    if (title === state.currentTitle) window.loadNote(nextTitle);
};

// --- Settings Modal ---
window.renderTemplateSettingsForm = function() {
    const input = document.getElementById('template-folder-input');
    if (!input) return;
    input.value = state.settings.templateFolder || '';
    document.getElementById('template-include-sub').checked = !!state.settings.includeSubfoldersForTemplates;
    document.getElementById('template-grouping').value = state.settings.templateMenuGrouping || 'path';
    document.getElementById('template-spacing').checked = !!state.settings.insertSpacingAroundTemplate;
    const dailyInput = document.getElementById('daily-note-format');
    if (dailyInput) dailyInput.value = state.settings.dailyNoteFormat || window.DEFAULT_SETTINGS.dailyNoteFormat;
};

window.switchSettingsPanel = function(panelId) {
    const panelName = `settings-panel-${panelId}`;
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.toggle('btn-active', tab.dataset.panel === panelId);
    });
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === panelName);
    });
    if (panelId === 'hotkey') window.renderKeybindList();
};

window.openSettings = function() {
    document.getElementById('settings-overlay').style.display = 'flex';
    window.switchSettingsPanel('template');
    window.renderTemplateSettingsForm();
    window.renderKeybindList();
};

window.closeSettings = function() { document.getElementById('settings-overlay').style.display = 'none'; };

window.renderKeybindList = function() {
    const list = document.getElementById('keybind-list');
    list.innerHTML = "";
    window.COMMANDS.forEach(cmd => {
        const currentKey = state.keymap[cmd.id] !== undefined ? state.keymap[cmd.id] : '';
        const row = document.createElement('div');
        row.className = 'keybind-row';
        row.innerHTML = `<span>${cmd.name}</span>`;
        const input = document.createElement('input');
        input.className = 'keybind-input';
        input.value = currentKey;
        input.readOnly = true; 
        input.onkeydown = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape' || e.key === 'Backspace') { input.value = ""; return; }
            let key = '';
            if (e.ctrlKey) key += 'Ctrl+'; if (e.altKey) key += 'Alt+'; if (e.shiftKey) key += 'Shift+'; if (e.metaKey) key += 'Cmd+';
            if (!['Control','Alt','Shift','Meta'].includes(e.key)) { key += e.key.toUpperCase() === ' ' ? 'Space' : e.key.toUpperCase(); input.value = key; }
        };
        input.dataset.cmdId = cmd.id;
        row.appendChild(input);
        list.appendChild(row);
    });
};

window.saveSettings = function() {
    document.querySelectorAll('.keybind-input').forEach(input => { state.keymap[input.dataset.cmdId] = input.value; });
    window.writeJson(window.CONFIG.KEYMAP_KEY, state.keymap);
    const templateSettings = {
        templateFolder: window.normalizeTemplateFolder(document.getElementById('template-folder-input').value.trim()),
        includeSubfoldersForTemplates: document.getElementById('template-include-sub').checked,
        templateMenuGrouping: document.getElementById('template-grouping').value,
        insertSpacingAroundTemplate: document.getElementById('template-spacing').checked,
        dailyNoteFormat: document.getElementById('daily-note-format').value.trim() || window.DEFAULT_SETTINGS.dailyNoteFormat
    };
    state.settings = { ...state.settings, ...templateSettings };
    window.writeJson(window.CONFIG.SETTINGS_KEY, state.settings);
    window.refreshTemplateSources();
    window.closeSettings();
};

window.resetSettings = function() {
    if(confirm("初期化しますか？")) {
        state.keymap = JSON.parse(JSON.stringify(window.DEFAULT_KEYMAP));
        state.settings = { ...window.DEFAULT_SETTINGS };
        window.renderTemplateSettingsForm();
        window.renderKeybindList();
        window.refreshTemplateSources();
        window.writeJson(window.CONFIG.KEYMAP_KEY, state.keymap);
        window.writeJson(window.CONFIG.SETTINGS_KEY, state.settings);
    }
}