/* =========================================
   5a. UI: Pane Management
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
    window.persistDesktopSize();
    window.writeJson(window.CONFIG.PANE_LAYOUTS_KEY, state.paneLayouts);
};

window.getDesktopBounds = function() {
    const desktop = document.getElementById('workspace-grid');
    if (!desktop) return { width: window.innerWidth, height: window.innerHeight, x: 0, y: 0 };
    const rect = desktop.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), x: rect.left, y: rect.top };
};

window.persistDesktopSize = function(bounds = null) {
    const current = bounds || window.getDesktopBounds();
    state.desktopSize = { width: current.width, height: current.height };
    window.writeJson(window.CONFIG.DESKTOP_SIZE_KEY, state.desktopSize);
};

window.scalePaneLayoutsToDesktop = function(previousBounds, nextBounds) {
    if (!previousBounds || !nextBounds || !previousBounds.width || !previousBounds.height || !nextBounds.width || !nextBounds.height) return;
    const scaleX = nextBounds.width / previousBounds.width;
    const scaleY = nextBounds.height / previousBounds.height;
    if (Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return;

    const clampLayout = (layout) => {
        if (!layout) return;
        layout.width = Math.max(MIN_WINDOW_WIDTH, Math.round((layout.width || MIN_WINDOW_WIDTH) * scaleX));
        layout.height = Math.max(MIN_WINDOW_HEIGHT, Math.round((layout.height || MIN_WINDOW_HEIGHT) * scaleY));
        layout.x = Math.max(0, Math.round((layout.x || DESKTOP_PADDING) * scaleX));
        layout.y = Math.max(0, Math.round((layout.y || DESKTOP_PADDING) * scaleY));

        const maxLeft = Math.max(0, nextBounds.width - layout.width - DESKTOP_PADDING);
        const maxTop = Math.max(0, nextBounds.height - layout.height - DESKTOP_PADDING);
        layout.x = Math.min(layout.x, maxLeft);
        layout.y = Math.min(layout.y, maxTop);
    };

    state.paneLayouts.forEach((layout) => {
        if (!layout) return;
        clampLayout(layout);
        if (layout.restore) clampLayout(layout.restore);
    });

    window.persistPaneLayouts();
};

window.hideLayoutOverlay = function() {
    const overlay = document.getElementById('layout-template-overlay');
    if (overlay) overlay.style.display = 'none';
};

window.renderLayoutOverlay = function(template, hoverIndex = -1) {
    if (!template) return;
    let overlay = document.getElementById('layout-template-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'layout-template-overlay';
        document.getElementById('workspace-grid').appendChild(overlay);
    }

    const bounds = window.getDesktopBounds();
    overlay.style.display = 'block';
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;

    overlay.innerHTML = '';
    const zones = window.computeTemplateZones(template, bounds.width, bounds.height);
    zones.forEach((zone, idx) => {
        const div = document.createElement('div');
        div.className = 'layout-zone' + (idx === hoverIndex ? ' active' : '');
        div.style.left = `${zone.x}px`;
        div.style.width = `${zone.width}px`;
        div.style.top = `${zone.y}px`;
        div.style.height = `${zone.height}px`;
        div.textContent = `${template.name || 'テンプレート'} (${Math.round(zone.ratio * 100)}%)`;
        overlay.appendChild(div);
    });
};

window.cloneLayoutNode = function(node) {
    if (!node) return null;
    if (node.type === 'split') {
        return {
            type: 'split',
            direction: node.direction === 'horizontal' ? 'horizontal' : 'vertical',
            sizes: Array.isArray(node.sizes) ? [...node.sizes] : [],
            children: Array.isArray(node.children) ? node.children.map(window.cloneLayoutNode) : []
        };
    }
    return { type: 'leaf', size: Math.max(1, node.size || 100) };
};

window.columnsToLayout = function(columns = []) {
    const safe = Array.isArray(columns) && columns.length ? columns : [100];
    if (safe.length === 1) return { type: 'leaf', size: Math.max(1, safe[0]) };
    return {
        type: 'split',
        direction: 'vertical',
        sizes: safe.map(v => Math.max(1, v)),
        children: safe.map(v => ({ type: 'leaf', size: Math.max(1, v) }))
    };
};

window.normalizeTemplateLayout = function(template) {
    if (!template) return { layout: { type: 'leaf', size: 100 } };
    const baseLayout = template.layout ? window.cloneLayoutNode(template.layout) : window.columnsToLayout(template.columns);
    return { ...template, layout: baseLayout };
};

window.computeTemplateZones = function(template, boundsWidth, boundsHeight) {
    const normalized = window.normalizeTemplateLayout(template);
    const root = normalized.layout || { type: 'leaf', size: 100 };
    const availableHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(boundsHeight - DESKTOP_PADDING * 2, boundsHeight));
    const availableWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(boundsWidth - DESKTOP_PADDING * 2, boundsWidth));
    const origin = { x: DESKTOP_PADDING, y: DESKTOP_PADDING, width: availableWidth, height: availableHeight };
    const totalArea = origin.width * origin.height || 1;
    const zones = [];

    const walk = (node, rect) => {
        if (!node) return;
        if (node.type === 'split' && Array.isArray(node.children) && node.children.length) {
            const sizes = node.sizes && node.sizes.length === node.children.length
                ? node.sizes
                : Array(node.children.length).fill(1);
            const sum = sizes.reduce((a, b) => a + Math.max(1, b), 0) || 1;
            let offset = 0;
            node.children.forEach((child, idx) => {
                const portion = Math.max(1, sizes[idx]) / sum;
                if (node.direction === 'horizontal') {
                    const w = rect.width * portion;
                    walk(child, { x: rect.x + offset, y: rect.y, width: w, height: rect.height });
                    offset += w;
                } else {
                    const h = rect.height * portion;
                    walk(child, { x: rect.x, y: rect.y + offset, width: rect.width, height: h });
                    offset += h;
                }
            });
            return;
        }
        zones.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            ratio: (rect.width * rect.height) / totalArea
        });
    };

    walk(root, origin);
    return zones;
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
        maximized: false,
        pinned: false
    };
};

window.ensurePaneLayout = function(index) {
    if (!state.paneLayouts[index]) state.paneLayouts[index] = window.createPaneLayout(index);
    const layout = state.paneLayouts[index];
    if (typeof layout.pinned === 'undefined') layout.pinned = false;
    return layout;
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

    const bounds = window.getDesktopBounds();
    const previousBounds = (state.desktopSize && state.desktopSize.width && state.desktopSize.height) ? state.desktopSize : null;
    if (previousBounds && (previousBounds.width !== bounds.width || previousBounds.height !== bounds.height)) {
        window.scalePaneLayoutsToDesktop(previousBounds, bounds);
    }
    if (!previousBounds || previousBounds.width !== bounds.width || previousBounds.height !== bounds.height) {
        window.persistDesktopSize(bounds);
    }

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
        if (typeof pane.isPrivacy === 'undefined') pane.isPrivacy = false;
        const paneEl = document.createElement('div');
        paneEl.className = 'pane window-pane' + (index === state.activePaneIndex ? ' active-pane' : '') + (layout.minimized ? ' pane-minimized' : '') + (pane.isPrivacy ? ' pane-privacy' : '') + (layout.pinned ? ' pane-pinned' : '');
        paneEl.id = `pane-${index}`;
        paneEl.dataset.id = index;
        paneEl.style.zIndex = layout.z || index + 1;

        const applyLayout = () => {
            const desktopBounds = bounds;
            let width = layout.width || MIN_WINDOW_WIDTH;
            let height = layout.height || MIN_WINDOW_HEIGHT;
            let x = layout.x || DESKTOP_PADDING;
            let y = layout.y || DESKTOP_PADDING;

            if (layout.maximized) {
                width = Math.max(desktopBounds.width - DESKTOP_PADDING * 2, MIN_WINDOW_WIDTH);
                height = Math.max(desktopBounds.height - DESKTOP_PADDING * 2, MIN_WINDOW_HEIGHT);
                x = DESKTOP_PADDING;
                y = DESKTOP_PADDING;
            }

            width = Math.max(MIN_WINDOW_WIDTH, Math.min(width, desktopBounds.width - DESKTOP_PADDING));
            height = Math.max(layout.minimized ? 36 : MIN_WINDOW_HEIGHT, Math.min(height, desktopBounds.height - DESKTOP_PADDING));
            x = Math.max(0, Math.min(x, Math.max(0, desktopBounds.width - width - DESKTOP_PADDING)));
            y = Math.max(0, Math.min(y, Math.max(0, desktopBounds.height - (layout.minimized ? 36 : height) - DESKTOP_PADDING)));

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
            if (layout.pinned) return;
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

        const pinBtn = document.createElement('button');
        pinBtn.className = 'pane-btn' + (layout.pinned ? ' btn-active' : '');
        pinBtn.title = layout.pinned ? '位置固定を解除' : '位置を固定';
        pinBtn.textContent = layout.pinned ? '📌' : '📍';
        pinBtn.onclick = (e) => { e.stopPropagation(); window.togglePinPane(index); };
        controls.appendChild(pinBtn);

        // Mode toggle button
        if (!['canvas', 'dashboard', 'timer'].includes(pane.type)) {
            const modeBtn = document.createElement('button');
            modeBtn.className = 'pane-btn' + (pane.type === 'preview' ? ' btn-active' : '');
            modeBtn.innerHTML = pane.type === 'editor' ? '👁' : '✎';
            modeBtn.title = pane.type === 'editor' ? 'プレビューに切替' : '編集に切替';
            modeBtn.onclick = (e) => { e.stopPropagation(); window.togglePaneMode(index); };
            controls.appendChild(modeBtn);
        }

        const privacyBtn = document.createElement('button');
        privacyBtn.className = 'pane-btn' + (pane.isPrivacy ? ' btn-active' : '');
        privacyBtn.innerHTML = '🛡️';
        privacyBtn.title = pane.isPrivacy ? 'プライバシーシールド解除' : 'プライバシーシールド適用';
        privacyBtn.onclick = (e) => { e.stopPropagation(); window.togglePanePrivacy(index); };
        controls.appendChild(privacyBtn);

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
            // Setup canvas container (scoped per pane to avoid ID collisions)
            const canvasArea = document.createElement('div');
            canvasArea.className = 'pane-canvas canvas-area';
            canvasArea.dataset.paneIndex = index;
            canvasArea.dataset.title = pane.title;
            if (index === state.activePaneIndex) canvasArea.dataset.activeCanvas = 'true';

            if (index === state.activePaneIndex) {
                canvasArea.innerHTML = `
                    <div class="canvas-layer">
                        <svg class="canvas-svg"></svg>
                        <div class="canvas-nodes"></div>
                    </div>
                    <div class="pane-canvas-controls">
                        <button class="btn btn-active cv-mode-pointer" onclick="window.toggleCanvasMode('edit')">❖</button>
                        <button class="btn cv-mode-pan" onclick="window.toggleCanvasMode('pan')">✋</button>
                        <span style="border-right:1px solid #666; margin:0 5px;"></span>
                        <button class="btn" onclick="window.addCanvasGroup()">🔲</button>
                        <button class="btn" onclick="window.zoomCanvas(0.1)">＋</button>
                        <button class="btn" onclick="window.zoomCanvas(-0.1)">－</button>
                        <button class="btn" onclick="window.resetCanvas()">⟲</button>
                        <span class="canvas-info" style="color:#666; font-size:0.8em; align-self:center; margin-left:5px;"></span>
                    </div>
                `;
                setTimeout(() => {
                    window.bindCanvasArea(canvasArea);
                    window.renderCanvas();
                }, 0);
            } else {
                canvasArea.innerHTML = `<div style="padding:20px; color:#666;">(Canvas: Click to activate)</div>`;
            }
            content.appendChild(canvasArea);
        } else if (pane.type === 'timer') {
            const timerWrap = document.createElement('div');
            timerWrap.className = 'timer-pane';

            const modeBar = document.createElement('div');
            modeBar.className = 'timer-mode-bar';
            const modes = [
                { id: 'pomodoro', label: '🍅 ポモドーロ' },
                { id: 'stopwatch', label: '⏱️ ストップウォッチ' },
                { id: 'countdown', label: '⏳ カウントダウン' },
                { id: 'clock', label: '🕒 時計' }
            ];
            modes.forEach((m) => {
                const btn = document.createElement('button');
                btn.className = 'timer-mode-btn';
                btn.dataset.mode = m.id;
                btn.textContent = m.label;
                btn.onclick = (e) => { e.stopPropagation(); window.setTimerMode(m.id); };
                modeBar.appendChild(btn);
            });
            timerWrap.appendChild(modeBar);

            const face = document.createElement('div');
            face.className = 'timer-face';
            face.id = 'timer-pane-display';
            timerWrap.appendChild(face);

            const subline = document.createElement('div');
            subline.className = 'timer-subline';
            subline.id = 'timer-pane-subline';
            timerWrap.appendChild(subline);

            const controls = document.createElement('div');
            controls.className = 'timer-controls';
            const startBtn = document.createElement('button');
            startBtn.className = 'btn btn-primary';
            startBtn.id = 'timer-btn-start';
            startBtn.textContent = '▶️ スタート';
            startBtn.onclick = (e) => { e.stopPropagation(); window.startTimer(); };
            controls.appendChild(startBtn);

            const pauseBtn = document.createElement('button');
            pauseBtn.className = 'btn';
            pauseBtn.id = 'timer-btn-pause';
            pauseBtn.textContent = '⏸ 一時停止';
            pauseBtn.onclick = (e) => { e.stopPropagation(); window.pauseTimer(); };
            controls.appendChild(pauseBtn);

            const resetBtn = document.createElement('button');
            resetBtn.className = 'btn';
            resetBtn.id = 'timer-btn-reset';
            resetBtn.textContent = '🔄 リセット';
            resetBtn.onclick = (e) => { e.stopPropagation(); window.resetTimer(); };
            controls.appendChild(resetBtn);
            timerWrap.appendChild(controls);

            const inputs = document.createElement('div');
            inputs.className = 'timer-inputs';

            const pomoInput = document.createElement('div');
            pomoInput.className = 'timer-input';
            const pomoLabel = document.createElement('label');
            pomoLabel.textContent = 'ポモドーロ (分)';
            const pomoField = document.createElement('input');
            pomoField.type = 'number';
            pomoField.min = '1';
            pomoField.step = '1';
            pomoField.id = 'timer-input-pomodoro';
            pomoField.onchange = (e) => { e.stopPropagation(); window.updateTimerDuration('pomodoro', e.target.value); };
            pomoInput.appendChild(pomoLabel);
            pomoInput.appendChild(pomoField);
            inputs.appendChild(pomoInput);

            const cdInput = document.createElement('div');
            cdInput.className = 'timer-input';
            const cdLabel = document.createElement('label');
            cdLabel.textContent = 'カウントダウン (分)';
            const cdField = document.createElement('input');
            cdField.type = 'number';
            cdField.min = '1';
            cdField.step = '1';
            cdField.id = 'timer-input-countdown';
            cdField.onchange = (e) => { e.stopPropagation(); window.updateTimerDuration('countdown', e.target.value); };
            cdInput.appendChild(cdLabel);
            cdInput.appendChild(cdField);
            inputs.appendChild(cdInput);

            timerWrap.appendChild(inputs);

            const hint = document.createElement('div');
            hint.className = 'timer-hint';
            hint.id = 'timer-pane-hint';
            timerWrap.appendChild(hint);

            content.appendChild(timerWrap);
            window.updateTimerUI();
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
    if (!layout || layout.maximized || layout.pinned) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = layout.x || 0;
    const startTop = layout.y || 0;
    const bounds = window.getDesktopBounds();
    const template = state.layoutTemplates[state.activeLayoutTemplate];

    const onMove = (ev) => {
        const useTemplate = ev.shiftKey && template;
        if (useTemplate) {
            const zones = window.computeTemplateZones(template, bounds.width, bounds.height);
            const localY = Math.max(0, Math.min(ev.clientY - bounds.y, bounds.height));
            const localX = Math.max(0, Math.min(ev.clientX - bounds.x, bounds.width));
            const hovered = zones.findIndex(z => localX >= z.x && localX <= z.x + z.width && localY >= z.y && localY <= z.y + z.height);
            const targetIndex = hovered !== -1 ? hovered : 0;
            const zone = zones[targetIndex];
            layout.width = Math.max(MIN_WINDOW_WIDTH, zone.width);
            layout.x = Math.max(0, Math.min(zone.x, bounds.width - layout.width - DESKTOP_PADDING));
            layout.height = Math.max(MIN_WINDOW_HEIGHT, zone.height);
            layout.y = Math.max(0, Math.min(zone.y, bounds.height - layout.height - DESKTOP_PADDING));
            window.renderLayoutOverlay(template, targetIndex);
        } else {
            window.hideLayoutOverlay();
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            layout.x = Math.max(0, Math.min(startLeft + dx, bounds.width - (layout.width || MIN_WINDOW_WIDTH)));
            layout.y = Math.max(0, Math.min(startTop + dy, bounds.height - (layout.height || MIN_WINDOW_HEIGHT)));
        }
        window.persistPaneLayouts();
        window.renderPanes();
    };

    const onUp = () => {
        window.hideLayoutOverlay();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
};

window.startWindowResize = function(e, index) {
    const layout = state.paneLayouts[index];
    if (!layout || layout.maximized || layout.pinned) return;
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
        window.bringPaneToFront(index);
    }
    window.persistPaneLayouts();
    window.renderPanes();
};

window.togglePinPane = function(index) {
    const layout = state.paneLayouts[index];
    if (!layout) return;
    layout.pinned = !layout.pinned;
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

    const previewPane = { id: state.panes.length, title: active.title, type: 'preview', isPrivacy: !!active.isPrivacy };
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

window.closePane = function(index, options = {}) {
    const skipTabSync = !!options.skipTabSync;
    if (index < 0 || index >= state.panes.length) return;
    const closedTitle = state.panes[index]?.title;
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

    if (state.activeSelectionTarget && !document.body.contains(state.activeSelectionTarget)) {
        state.activeSelectionTarget = null;
        window.hideFormatMenu();
        window.updateSelectedCount();
    }

    if (!skipTabSync && closedTitle && !state.panes.some(p => p.title === closedTitle)) {
        window.removeTabEntry(closedTitle);
        if (state.currentTitle === closedTitle) {
            const fallback = state.openTabs[state.openTabs.length - 1];
            if (fallback) window.loadNote(fallback);
        }
    }
};

window.closePanesByTitle = function(title, options = {}) {
    let removed = false;
    let idx = state.panes.findIndex(p => p.title === title);
    while (idx !== -1) {
        removed = true;
        window.closePane(idx, { skipTabSync: true });
        idx = state.panes.findIndex(p => p.title === title);
    }
    if (removed && !options.skipTabUpdate) {
        window.removeTabEntry(title);
    }
    return removed;
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
    const newPane = { id: state.panes.length, title: path, type, isPrivacy: false };
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
    if (pane.type === 'canvas' || pane.type === 'dashboard' || pane.type === 'timer') return; // Non-note panes have no toggle
    pane.type = pane.type === 'editor' ? 'preview' : 'editor';
    window.renderPanes();
};

window.togglePreviewMode = function() {
    window.togglePaneMode(state.activePaneIndex);
};

window.togglePanePrivacy = function(index) {
    const pane = state.panes[index];
    if (!pane) return;
    pane.isPrivacy = !pane.isPrivacy;
    window.renderPanes();
};

window.updateModeToggleButton = function() {
    const btn = document.getElementById('btn-mode');
    const pane = state.panes[state.activePaneIndex];
    if (!btn) return;

    if (!pane || pane.type === 'canvas' || pane.type === 'dashboard' || pane.type === 'timer') {
        btn.textContent = '👁 プレビュー';
        btn.classList.remove('btn-active');
        btn.disabled = !pane || pane.type === 'canvas' || pane.type === 'dashboard' || pane.type === 'timer';
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

    btn.disabled = !active || (active.type === 'canvas' || active.type === 'dashboard' || active.type === 'timer');
    if (btn.disabled) {
        btn.classList.remove('btn-active');
        return;
    }

    const hasPreview = !!(active && state.panes.some((p, idx) => idx !== state.activePaneIndex && p.title === active.title && p.type === 'preview'));
    btn.classList.toggle('btn-active', hasPreview);
};
