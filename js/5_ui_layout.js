/* =========================================
   5. UI: Layout, Tabs, Settings & Shared Utils
   ========================================= */

// --- Pane Management ---

const MAX_PANES = 12;
const MULTIROW_THRESHOLD = 7;
const MULTIROW_COLUMNS = 6;
const DESKTOP_PADDING = 16;
const MIN_WINDOW_WIDTH = 320;
const MIN_WINDOW_HEIGHT = 220;

window.findExistingPaneIndex = function(title, excludeIndex = -1) {
    let editorIndex = -1;
    let previewIndex = -1;
    let fallbackIndex = -1;

    state.panes.forEach((p, idx) => {
        if (idx === excludeIndex) return;
        if (p.title !== title) return;
        if (p.type === 'editor' && editorIndex === -1) editorIndex = idx;
        else if (p.type === 'preview' && previewIndex === -1) previewIndex = idx;
        else if (fallbackIndex === -1) fallbackIndex = idx;
    });

    if (editorIndex !== -1) return editorIndex;
    if (previewIndex !== -1) return previewIndex;
    return fallbackIndex;
};

window.shouldUseMultiRowLayout = function() {
    return state.panes.length >= MULTIROW_THRESHOLD;
};

window.ensurePaneSizes = function() {
    if (!Array.isArray(state.paneSizes)) state.paneSizes = [];
    const needsReset = state.paneSizes.length !== state.panes.length || state.paneSizes.some(v => !v || v <= 0);
    if (needsReset) {
        state.paneSizes = Array(state.panes.length).fill(1);
        window.persistPaneSizes();
    }
};

window.persistPaneLayouts = function() {
    window.writeJson(window.CONFIG.PANE_LAYOUTS_KEY, state.paneLayouts);
};

window.getDesktopBounds = function() {
    const desktop = document.getElementById('workspace-grid');
    if (!desktop) return { width: window.innerWidth, height: window.innerHeight, x: 0, y: 0 };
    const rect = desktop.getBoundingClientRect();
    return { width: rect.width, height: rect.height, x: rect.left, y: rect.top };
};

window.createPaneLayout = function(index) {
    const { width, height } = window.getDesktopBounds();
    const baseWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(width * 0.6, 560));
    const baseHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(height * 0.6, 420));
    const offset = (index % 5) * 26;
    return {
        x: DESKTOP_PADDING + offset,
        y: DESKTOP_PADDING + offset,
        width: baseWidth,
        height: baseHeight,
        z: ++state.zCounter,
        minimized: false,
        maximized: false
    };
};

window.ensurePaneLayout = function(index) {
    if (!state.paneLayouts[index]) state.paneLayouts[index] = window.createPaneLayout(index);
    return state.paneLayouts[index];
};

window.bringPaneToFront = function(index) {
    const layout = state.paneLayouts[index];
    if (!layout) return;
    state.zCounter += 1;
    layout.z = state.zCounter;
    window.persistPaneLayouts();
};

window.rebalancePaneSizes = function() {
    if (!state.panes.length) return;
    state.paneSizes = Array(state.panes.length).fill(1);
    window.persistPaneSizes();
};

window.persistPaneSizes = function() {
    window.writeJson(window.CONFIG.PANES_KEY, state.paneSizes);
};

window.applyPaneSizes = function() {
    if (window.shouldUseMultiRowLayout()) return; // Multi-row layout uses equal sizing
    document.querySelectorAll('#workspace-grid .pane-wrapper').forEach((wrap, idx) => {
        wrap.style.flexGrow = state.paneSizes[idx] || 1;
        wrap.style.flexBasis = '0';
    });
};

window.startResizePane = function() { /* legacy no-op after desktop redesign */ };

window.renderPanes = function() {
    const grid = document.getElementById('workspace-grid');
    if (!grid) return;

    grid.className = 'workspace-desktop';
    grid.innerHTML = '';

    if (!state.panes.length) {
        const empty = document.createElement('div');
        empty.className = 'desktop-placeholder';
        empty.textContent = 'ノートを開いてデスクトップに追加します';
        grid.appendChild(empty);
        window.updateModeToggleButton();
        window.updateDualViewButton();
        return;
    }

    state.panes.forEach((pane, index) => {
        const layout = window.ensurePaneLayout(index);
        const paneEl = document.createElement('div');
        paneEl.className = 'pane window-pane' + (index === state.activePaneIndex ? ' active-pane' : '') + (layout.minimized ? ' pane-minimized' : '');
        paneEl.id = `pane-${index}`;
        paneEl.dataset.id = index;
        paneEl.style.zIndex = layout.z || index + 1;

        const applyLayout = () => {
            const bounds = window.getDesktopBounds();
            let width = layout.width || MIN_WINDOW_WIDTH;
            let height = layout.height || MIN_WINDOW_HEIGHT;
            let x = layout.x || DESKTOP_PADDING;
            let y = layout.y || DESKTOP_PADDING;

            if (layout.maximized) {
                width = Math.max(bounds.width - DESKTOP_PADDING * 2, MIN_WINDOW_WIDTH);
                height = Math.max(bounds.height - DESKTOP_PADDING * 2, MIN_WINDOW_HEIGHT);
                x = DESKTOP_PADDING;
                y = DESKTOP_PADDING;
            }

            width = Math.max(MIN_WINDOW_WIDTH, Math.min(width, bounds.width - DESKTOP_PADDING));
            height = Math.max(layout.minimized ? 36 : MIN_WINDOW_HEIGHT, Math.min(height, bounds.height - DESKTOP_PADDING));
            x = Math.max(0, Math.min(x, Math.max(0, bounds.width - width - DESKTOP_PADDING)));
            y = Math.max(0, Math.min(y, Math.max(0, bounds.height - (layout.minimized ? 36 : height) - DESKTOP_PADDING)));

            paneEl.style.width = `${width}px`;
            paneEl.style.height = layout.minimized ? '36px' : `${height}px`;
            paneEl.style.left = `${x}px`;
            paneEl.style.top = `${y}px`;
        };

        applyLayout();

        paneEl.onclick = () => {
            window.bringPaneToFront(index);
            if (state.activePaneIndex !== index) window.setActivePane(index);
        };

        // Header
        const header = document.createElement('div');
        header.className = 'pane-header';
        header.onpointerdown = (e) => {
            if (e.target.closest('.pane-controls')) return;
            window.startWindowDrag(e, index);
        };
        header.ondblclick = () => window.toggleMaximizePane(index);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'pane-title';
        titleSpan.textContent = pane.title;
        // Click title to open switcher for this pane
        titleSpan.onclick = (e) => { e.stopPropagation(); window.setActivePane(index); window.openSwitcher((t) => window.loadNoteIntoPane(index, t)); };

        const controls = document.createElement('div');
        controls.className = 'pane-controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'pane-btn';
        minimizeBtn.textContent = '—';
        minimizeBtn.title = '縮小';
        minimizeBtn.onclick = (e) => { e.stopPropagation(); window.toggleMinimizePane(index); };
        controls.appendChild(minimizeBtn);

        const maximizeBtn = document.createElement('button');
        maximizeBtn.className = 'pane-btn';
        maximizeBtn.textContent = layout.maximized ? '🗗' : '🗖';
        maximizeBtn.title = layout.maximized ? '元に戻す' : '全画面';
        maximizeBtn.onclick = (e) => { e.stopPropagation(); window.toggleMaximizePane(index); };
        controls.appendChild(maximizeBtn);

        // Mode toggle button
        if (pane.type !== 'canvas' && pane.type !== 'dashboard') {
            const modeBtn = document.createElement('button');
            modeBtn.className = 'pane-btn' + (pane.type === 'preview' ? ' btn-active' : '');
            modeBtn.innerHTML = pane.type === 'editor' ? '👁' : '✎';
            modeBtn.title = pane.type === 'editor' ? 'プレビューに切替' : '編集に切替';
            modeBtn.onclick = (e) => { e.stopPropagation(); window.togglePaneMode(index); };
            controls.appendChild(modeBtn);
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'pane-btn';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = (e) => { e.stopPropagation(); window.closePane(index); };
        controls.appendChild(closeBtn);

        header.appendChild(titleSpan);
        header.appendChild(controls);
        paneEl.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'pane-content';
        if (layout.minimized) content.style.display = 'none';

        if (pane.type === 'dashboard') {
            const dashboardContainer = document.createElement('div');
            dashboardContainer.className = 'pane-dashboard';
            dashboardContainer.id = 'dashboard-container';
            window.renderTaskDashboard(dashboardContainer);
            content.appendChild(dashboardContainer);
        } else if (pane.type === 'editor') {
            const noteContent = state.notes[pane.title] || "";
            const textarea = document.createElement('textarea');
            textarea.className = 'pane-editor';
            textarea.value = noteContent;
            // Event listener is attached globally in 4_app.js via delegation
            content.appendChild(textarea);
        } else if (pane.type === 'preview') {
            const noteContent = state.notes[pane.title] || "";
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
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'pane-resize-handle';
        resizeHandle.onpointerdown = (e) => window.startWindowResize(e, index);
        paneEl.appendChild(resizeHandle);

        grid.appendChild(paneEl);

        if (!window.__desktopResizeBound) {
            window.__desktopResizeBound = true;
            window.addEventListener('resize', () => window.renderPanes());
        }
    });

    window.updateModeToggleButton();
    window.updateDualViewButton();
};

window.startWindowDrag = function(e, index) {
    const layout = state.paneLayouts[index];
    if (!layout || layout.maximized) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = layout.x || 0;
    const startTop = layout.y || 0;
    const bounds = window.getDesktopBounds();

    const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        layout.x = Math.max(0, Math.min(startLeft + dx, bounds.width - (layout.width || MIN_WINDOW_WIDTH)));
        layout.y = Math.max(0, Math.min(startTop + dy, bounds.height - (layout.height || MIN_WINDOW_HEIGHT)));
        window.persistPaneLayouts();
        window.renderPanes();
    };

    const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
};

window.startWindowResize = function(e, index) {
    const layout = state.paneLayouts[index];
    if (!layout || layout.maximized) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = layout.width || MIN_WINDOW_WIDTH;
    const startH = layout.height || MIN_WINDOW_HEIGHT;

    const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        layout.width = Math.max(MIN_WINDOW_WIDTH, startW + dx);
        layout.height = Math.max(MIN_WINDOW_HEIGHT, startH + dy);
        window.persistPaneLayouts();
        window.renderPanes();
    };

    const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
};

window.toggleMinimizePane = function(index) {
    const layout = state.paneLayouts[index];
    if (!layout) return;
    layout.minimized = !layout.minimized;
    window.persistPaneLayouts();
    window.renderPanes();
};

window.toggleMaximizePane = function(index) {
    const layout = state.paneLayouts[index];
    if (!layout) return;
    if (layout.maximized) {
        if (layout.restore) {
            Object.assign(layout, layout.restore);
            delete layout.restore;
        }
        layout.maximized = false;
    } else {
        layout.restore = { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
        layout.maximized = true;
        layout.minimized = false;
    }
    window.persistPaneLayouts();
    window.renderPanes();
};

window.setActivePane = function(index) {
    if (index < 0 || index >= state.panes.length) {
        state.activePaneIndex = -1;
        return;
    }
    if (state.activePaneIndex === index && state.currentTitle === state.panes[index].title) return;
    state.activePaneIndex = index;
    const pane = state.panes[index];
    if (pane.type !== 'dashboard') state.currentTitle = pane.title;
    
    // Canvas Handling: If activating a canvas pane, verify global canvas state matches
    if (pane.type === 'canvas') {
        const content = state.notes[pane.title];
        window.loadCanvasData(content);
    } else {
        state.isCanvasMode = false;
    }
    
    // Update Header
    const titleInput = document.getElementById('title-input');
    if(titleInput && pane.type !== 'dashboard') titleInput.value = pane.title;

    window.renderPanes();
    window.renderTabBar();
};

window.toggleDualView = function() {
    const active = state.panes[state.activePaneIndex];
    if (!active || active.type === 'canvas' || active.type === 'dashboard') return;

    let editorIndex = state.panes.findIndex(p => p.title === active.title && p.type === 'editor');
    if (editorIndex === -1) {
        active.type = 'editor';
        editorIndex = state.activePaneIndex;
    }

    const existingPreviewIndex = state.panes.findIndex((p, idx) => idx !== editorIndex && p.title === active.title && p.type === 'preview');
    if (existingPreviewIndex !== -1) {
        state.panes.splice(existingPreviewIndex, 1);
        state.paneSizes.splice(existingPreviewIndex, 1);
        state.paneLayouts.splice(existingPreviewIndex, 1);
        state.panes.forEach((p, i) => p.id = i);
        state.activePaneIndex = Math.min(editorIndex, state.panes.length - 1);
        state.currentTitle = state.panes[state.activePaneIndex].title;
        window.persistPaneSizes();
        window.persistPaneLayouts();
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
    state.paneLayouts.splice(insertIndex, 0, window.createPaneLayout(insertIndex));
    state.panes.forEach((p, i) => p.id = i);
    state.activePaneIndex = editorIndex;
    state.currentTitle = active.title;
    window.persistPaneSizes();
    window.persistPaneLayouts();
    window.renderPanes();
};

window.splitPane = function() { window.toggleDualView(); };

window.closePane = function(index) {
    if (index < 0 || index >= state.panes.length) return;
    state.panes.splice(index, 1);
    state.paneSizes.splice(index, 1);
    state.paneLayouts.splice(index, 1);
    if (!state.paneSizes.length) state.paneSizes = [1];
    state.panes.forEach((p, i) => p.id = i);

    if (!state.panes.length) {
        state.activePaneIndex = -1;
        state.currentTitle = '';
    } else {
        state.activePaneIndex = Math.min(state.activePaneIndex, state.panes.length - 1);
        const newActive = state.panes[state.activePaneIndex];
        if (newActive.type === 'canvas') {
            const content = state.notes[newActive.title];
            window.loadCanvasData(content);
        } else {
            state.isCanvasMode = false;
        }
        if (newActive.type !== 'dashboard') {
            state.currentTitle = newActive.title;
            const titleInput = document.getElementById('title-input');
            if (titleInput) titleInput.value = newActive.title;
        }
    }

    window.rebalancePaneSizes();
    window.persistPaneLayouts();
    window.renderPanes();
    window.renderTabBar();
};

window.reorderPanes = function(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= state.panes.length) return;
    if (toIndex < 0 || toIndex >= state.panes.length) return;

    const [pane] = state.panes.splice(fromIndex, 1);
    const [size] = state.paneSizes.splice(fromIndex, 1);
    const [layout] = state.paneLayouts.splice(fromIndex, 1);
    state.panes.splice(toIndex, 0, pane);
    state.paneSizes.splice(toIndex, 0, size || 1);
    state.paneLayouts.splice(toIndex, 0, layout || window.createPaneLayout(toIndex));
    state.panes.forEach((p, i) => p.id = i);
    state.activePaneIndex = state.panes.indexOf(pane);
    window.persistPaneSizes();
    window.persistPaneLayouts();
    window.renderPanes();
};

window.loadNoteIntoPane = function(index, title) {
    window.setActivePane(index);
    window.loadNote(title);
};

window.openNoteInNewPane = function(path) {
    if (!state.notes[path]) return;
    const existingIndex = window.findExistingPaneIndex(path);
    if (existingIndex !== -1) {
        window.setActivePane(existingIndex);
        return;
    }
    if (state.panes.length >= MAX_PANES) {
        alert(`最大${MAX_PANES}画面までです`);
        return;
    }
    const content = state.notes[path];
    const type = content.startsWith(window.CANVAS_MARKER) ? 'canvas' : 'editor';
    const newPane = { id: state.panes.length, title: path, type };
    state.panes.push(newPane);
    state.paneSizes.push(1);
    state.paneLayouts.push(window.createPaneLayout(state.panes.length - 1));
    state.activePaneIndex = state.panes.length - 1;
    window.persistPaneSizes();
    window.persistPaneLayouts();
    window.loadNote(path);
};

window.togglePaneMode = function(index) {
    const pane = state.panes[index];
    if (!pane) return;
    if (pane.type === 'canvas' || pane.type === 'dashboard') return; // Non-note panes have no toggle
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

    if (!pane || pane.type === 'canvas' || pane.type === 'dashboard') {
        btn.textContent = '👁 プレビュー';
        btn.classList.remove('btn-active');
        btn.disabled = !pane || pane.type === 'canvas' || pane.type === 'dashboard';
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

    btn.disabled = !active || (active.type === 'canvas' || active.type === 'dashboard');
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
    const nextIndex = Math.min(idx, state.openTabs.length - 1);
    const nextTitle = title === state.currentTitle ? state.openTabs[nextIndex] : state.currentTitle;
    window.persistTabs();
    window.renderTabBar();
    if (title === state.currentTitle) {
        if (nextTitle) {
            window.loadNote(nextTitle);
        } else {
            state.currentTitle = '';
            state.activePaneIndex = -1;
            window.renderPanes();
        }
    }
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