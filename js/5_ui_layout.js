/* =========================================
   5. UI: Layout, Tabs, Settings & Shared Utils
   ========================================= */

// --- Pane Management ---

window.renderPanes = function() {
    const grid = document.getElementById('workspace-grid');
    if (!grid) return;

    if (state.isDashboard) {
        grid.className = 'grid-1';
        grid.innerHTML = `<div id="dashboard-container" class="pane" style="overflow:auto; width:100%; height:100%;"></div>`;
        const container = document.getElementById('dashboard-container');
        // Hack: renderTaskDashboard expects #preview to exist in older logic, 
        // but now we render directly into dashboard container or overwrite preview's innerHTML logic.
        // We will adapt renderTaskDashboard logic in 7_ui_nav.js to accept target or use active pane.
        // For now, let's just use a special pane structure.
        return window.renderTaskDashboard(container);
    }

    // Set Grid Class (grid-1 to grid-6)
    grid.className = `grid-${state.panes.length}`;
    grid.innerHTML = '';

    state.panes.forEach((pane, index) => {
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
            modeBtn.className = 'pane-btn';
            modeBtn.innerHTML = pane.type === 'editor' ? '👁' : '✎';
            modeBtn.title = '表示モード切替';
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
            content.appendChild(previewDiv);
        } else if (pane.type === 'canvas') {
            // Setup canvas container
            const canvasArea = document.createElement('div');
            canvasArea.id = 'canvas-area'; // ID must be active for canvas logic (limitation of current 3_canvas.js)
            // Note: If multiple canvases are open, only the ACTIVE one gets the ID 'canvas-area' ideally.
            // But for CSS styling we use class.
            canvasArea.className = 'pane-canvas';
            if (index === state.activePaneIndex) {
                // This pane owns the global canvas controller
                // We recreate the structure required by 3_canvas.js
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
                // Defer canvas render slightly
                setTimeout(() => {
                    // Update global state references to point to this pane's elements
                    window.renderCanvas(); 
                }, 0);
            } else {
                // Inactive canvas: just a placeholder or static render
                canvasArea.innerHTML = `<div style="padding:20px; color:#666;">(Canvas: Click to activate)</div>`;
            }
            content.appendChild(canvasArea);
        }

        paneEl.appendChild(content);
        grid.appendChild(paneEl);
    });
};

window.setActivePane = function(index) {
    if (index === state.activePaneIndex) return;
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

window.splitPane = function() {
    if (state.panes.length >= 6) {
        alert("最大6画面までです");
        return;
    }
    // Clone current pane info
    const current = state.panes[state.activePaneIndex];
    const newPane = { 
        id: state.panes.length, 
        title: current.title, 
        type: current.type === 'editor' ? 'preview' : 'editor' // Alternate default
    };
    if (current.type === 'canvas') newPane.type = 'canvas';
    
    state.panes.push(newPane);
    window.setActivePane(state.panes.length - 1);
};

window.closePane = function(index) {
    if (state.panes.length <= 1) return;
    state.panes.splice(index, 1);
    // Reassign IDs/Index
    state.panes.forEach((p, i) => p.id = i);
    state.activePaneIndex = Math.min(state.activePaneIndex, state.panes.length - 1);
    window.setActivePane(state.activePaneIndex);
};

window.loadNoteIntoPane = function(index, title) {
    window.setActivePane(index);
    window.loadNote(title);
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
        insertSpacingAroundTemplate: document.getElementById('template-spacing').checked
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