/* =========================================
   5c. UI: Settings & Layout Templates
   ========================================= */

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
    window.renderLayoutTemplateSettings();
};

window.renderLayoutTemplateSettings = function() {
    const textarea = document.getElementById('layout-template-lines');
    const select = document.getElementById('layout-template-active');
    if (!textarea || !select) return;

    textarea.value = window.composeLayoutTemplateText(state.layoutTemplates);
    window.populateLayoutTemplateSelect(select);
    select.value = Math.min(state.activeLayoutTemplate, state.layoutTemplates.length - 1);
    window.renderLayoutTemplateCards();
    window.updateLayoutButtonLabel();
};

window.composeLayoutTemplateText = function(list) {
    return list.map((t) => {
        const label = t.name || 'テンプレート';
        const ratios = window.describeLayoutRatios(t).join(',');
        return `${label}: ${ratios}`;
    }).join('\n');
};

window.describeLayoutRatios = function(template) {
    const zones = window.computeTemplateZones(template, 100, 100);
    return zones.map(z => `${Math.round(z.ratio * 100)}%`);
};

window.cloneLayoutTemplates = function(list) {
    if (!Array.isArray(list)) return [];
    return list.map(t => {
        const normalized = window.normalizeTemplateLayout(t);
        return {
            name: normalized.name,
            columns: Array.isArray(normalized.columns) ? [...normalized.columns] : (Array.isArray(t.columns) ? [...t.columns] : []),
            layout: window.cloneLayoutNode(normalized.layout)
        };
    });
};

window.populateLayoutTemplateSelect = function(select) {
    if (!select) return;
    select.innerHTML = '';
    state.layoutTemplates.forEach((t, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = t.name || `テンプレート ${idx + 1}`;
        select.appendChild(opt);
    });
};

window.renderLayoutTemplateCards = function() {
    const list = document.getElementById('layout-template-list');
    if (!list) return;
    list.innerHTML = '';

    if (!state.layoutTemplates.length) {
        const empty = document.createElement('div');
        empty.className = 'layout-card-empty';
        empty.textContent = 'まだテンプレートがありません。「＋ レイアウト作成」から追加してください';
        list.appendChild(empty);
        return;
    }

    state.layoutTemplates.forEach((t, idx) => {
        const card = document.createElement('div');
        card.className = 'layout-card' + (idx === state.activeLayoutTemplate ? ' active' : '');

        const title = document.createElement('div');
        title.className = 'layout-card-title';
        title.textContent = t.name || `テンプレート ${idx + 1}`;
        card.appendChild(title);

        const badges = document.createElement('div');
        badges.className = 'layout-card-badges';
        window.describeLayoutRatios(t).forEach((ratio, cIdx) => {
            const chip = document.createElement('span');
            chip.className = 'layout-chip';
            chip.textContent = `領域${cIdx + 1}: ${ratio}`;
            badges.appendChild(chip);
        });
        card.appendChild(badges);

        const actions = document.createElement('div');
        actions.className = 'layout-card-actions';

        const activateBtn = document.createElement('button');
        activateBtn.className = 'btn';
        activateBtn.textContent = idx === state.activeLayoutTemplate ? '使用中' : 'これを使う';
        activateBtn.onclick = () => window.setActiveLayoutTemplate(idx, { persist: true });
        actions.appendChild(activateBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn';
        editBtn.textContent = '編集';
        editBtn.onclick = () => window.openLayoutBuilder(idx);
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn';
        deleteBtn.style.color = '#e57373';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = () => window.deleteLayoutTemplate(idx);
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        list.appendChild(card);
    });
};

window.setActiveLayoutTemplate = function(index, options = {}) {
    if (!state.layoutTemplates.length) return;
    const target = Math.min(Math.max(index, 0), state.layoutTemplates.length - 1);
    state.activeLayoutTemplate = target;
    const select = document.getElementById('layout-template-active');
    if (select) select.value = target;
    if (options.persist) window.persistLayoutTemplates();
    window.renderLayoutTemplateCards();
    window.updateLayoutButtonLabel();
};

window.deleteLayoutTemplate = function(index) {
    if (index < 0 || index >= state.layoutTemplates.length) return;
    if (!confirm('このレイアウトテンプレートを削除しますか？')) return;
    state.layoutTemplates.splice(index, 1);
    if (!state.layoutTemplates.length) {
        state.layoutTemplates = window.cloneLayoutTemplates(window.DEFAULT_LAYOUT_SETTINGS.templates);
    }
    state.activeLayoutTemplate = Math.min(state.activeLayoutTemplate, state.layoutTemplates.length - 1);
    window.persistLayoutTemplates();
    window.renderLayoutTemplateSettings();
};

window.updateLayoutButtonLabel = function() {
    const btn = document.getElementById('btn-layout-menu');
    const tmpl = state.layoutTemplates[state.activeLayoutTemplate];
    if (!btn) return;
    btn.textContent = tmpl ? `🧩 ${tmpl.name || 'レイアウト'}` : '🧩 レイアウト';
};

window.showLayoutQuickMenu = function(anchor) {
    const menu = document.getElementById('layout-menu');
    if (!menu || !anchor) return;
    menu.innerHTML = '';

    state.layoutTemplates.forEach((tmpl, idx) => {
        const item = document.createElement('div');
        item.className = 'layout-menu-item';
        const meta = window.describeLayoutRatios(tmpl).join(' / ');
        item.innerHTML = `<span>${tmpl.name || `テンプレート ${idx + 1}`}</span><span class="layout-menu-meta">${meta}</span>`;
        item.onclick = (e) => {
            e.stopPropagation();
            window.setActiveLayoutTemplate(idx, { persist: true });
            menu.style.display = 'none';
        };
        menu.appendChild(item);
    });

    const createItem = document.createElement('div');
    createItem.className = 'layout-menu-item';
    createItem.innerHTML = '<span>＋ レイアウトを作成</span><span class="layout-menu-meta">エディターを開く</span>';
    createItem.onclick = (e) => { e.stopPropagation(); menu.style.display = 'none'; window.openLayoutBuilder(); };
    menu.appendChild(createItem);

    menu.style.display = 'block';
    const rect = anchor.getBoundingClientRect();
    const preferredLeft = rect.right - menu.offsetWidth;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(12, preferredLeft)}px`;
};

window.hideLayoutMenu = function() {
    const menu = document.getElementById('layout-menu');
    if (menu) menu.style.display = 'none';
};

// --- Layout Builder ---
const BUILDER_MIN_COLUMN = 8;
window.layoutBuilderState = { layout: { type: 'leaf', size: 100 }, name: '', editIndex: -1 };

window.createDefaultLayout = function() { return { type: 'leaf', size: 100 }; };

window.openLayoutBuilder = function(index = -1) {
    const target = window.normalizeTemplateLayout(state.layoutTemplates[index] || { name: '新規レイアウト', columns: [100] });
    window.layoutBuilderState = {
        layout: window.cloneLayoutNode(target.layout || window.createDefaultLayout()),
        name: target.name || '',
        editIndex: index
    };
    document.getElementById('layout-builder-name').value = window.layoutBuilderState.name;
    document.getElementById('layout-builder-overlay').style.display = 'flex';
    window.renderLayoutBuilderPreview();
};

window.closeLayoutBuilder = function() {
    document.getElementById('layout-builder-overlay').style.display = 'none';
};

window.resetLayoutBuilderColumns = function() {
    window.layoutBuilderState.layout = window.createDefaultLayout();
    window.renderLayoutBuilderPreview();
};

window.ensureSplitNode = function(node, direction) {
    if (node.type === 'split') return node;
    node.type = 'split';
    node.direction = direction;
    node.children = [window.createDefaultLayout(), window.createDefaultLayout()];
    node.sizes = [50, 50];
    return node;
};

window.splitLayoutBuilderBlock = function(path, direction) {
    const segments = Array.isArray(path) ? [...path] : [];
    const target = window.getLayoutNodeByPath(window.layoutBuilderState.layout, segments);
    if (!target || target.type !== 'leaf') return;
    target.type = 'split';
    target.direction = direction === 'horizontal' ? 'horizontal' : 'vertical';
    target.children = [window.createDefaultLayout(), window.createDefaultLayout()];
    target.sizes = [50, 50];
    window.renderLayoutBuilderPreview();
};

window.addLayoutBuilderSplit = function(direction = 'vertical') {
    const root = window.layoutBuilderState.layout;
    if (!root) return;
    if (root.type === 'leaf') {
        window.splitLayoutBuilderBlock([], direction);
        return;
    }
    if (root.type === 'split' && root.direction === direction) {
        root.children.push(window.createDefaultLayout());
        const base = Math.max(BUILDER_MIN_COLUMN, Math.round(100 / root.children.length));
        root.sizes = Array(root.children.length).fill(base);
    } else {
        window.layoutBuilderState.layout = {
            type: 'split',
            direction,
            children: [window.cloneLayoutNode(root), window.createDefaultLayout()],
            sizes: [50, 50]
        };
    }
    window.renderLayoutBuilderPreview();
};

window.getLayoutNodeByPath = function(node, path = []) {
    return path.reduce((acc, idx) => (acc && acc.children ? acc.children[idx] : null), node);
};

window.mergeLayoutBuilderSplit = function(path, direction) {
    const targetDirection = direction === 'horizontal' ? 'horizontal' : 'vertical';
    const segments = Array.isArray(path) ? [...path] : [];

    let cursor = segments;
    while (cursor.length > 0) {
        const parentPath = cursor.slice(0, -1);
        const parentNode = window.getLayoutNodeByPath(window.layoutBuilderState.layout, parentPath);
        if (parentNode && parentNode.type === 'split' && parentNode.direction === targetDirection) {
            const mergedSize = Array.isArray(parentNode.sizes)
                ? parentNode.sizes.reduce((a, b) => a + Math.max(1, b), 0)
                : Math.max(1, parentNode.size || 100);
            const replacement = { type: 'leaf', size: mergedSize };

            if (parentPath.length === 0) {
                window.layoutBuilderState.layout = replacement;
            } else {
                const grandParentPath = parentPath.slice(0, -1);
                const grandParent = window.getLayoutNodeByPath(window.layoutBuilderState.layout, grandParentPath);
                const parentIndex = parentPath[parentPath.length - 1];
                if (grandParent && Array.isArray(grandParent.children) && parentIndex < grandParent.children.length) {
                    grandParent.children[parentIndex] = replacement;
                } else {
                    window.layoutBuilderState.layout = replacement;
                }
            }

            window.renderLayoutBuilderPreview();
            return;
        }
        cursor = parentPath;
    }
};

window.equalizeLayoutBuilder = function(direction = 'vertical', node = window.layoutBuilderState.layout) {
    if (!node) return;
    if (node.type === 'split') {
        if (node.direction === direction && node.children.length) {
            const per = Math.max(BUILDER_MIN_COLUMN, Math.round(100 / node.children.length));
            node.sizes = Array(node.children.length).fill(per);
        }
        node.children.forEach(child => window.equalizeLayoutBuilder(direction, child));
    }
    if (direction === 'all') window.equalizeLayoutBuilder('horizontal', node);
};

window.renderLayoutBuilderPreview = function() {
    const container = document.getElementById('layout-builder-preview');
    const summary = document.getElementById('layout-builder-summary');
    if (!container) return;
    container.innerHTML = '';

    const zones = window.computeTemplateZones({ layout: window.layoutBuilderState.layout }, container.clientWidth || 100, container.clientHeight || 100);
    if (summary) {
        const text = window.describeLayoutRatios({ layout: window.layoutBuilderState.layout }).join(' / ');
        summary.textContent = `現在の比率: ${text}`;
    }

    let blockCounter = 0;
    const renderNode = (node, path = []) => {
        if (node.type === 'split' && node.children?.length) {
            const wrapper = document.createElement('div');
            wrapper.className = 'layout-split ' + (node.direction === 'horizontal' ? 'horizontal' : 'vertical');
            const sizes = node.sizes && node.sizes.length === node.children.length ? node.sizes : Array(node.children.length).fill(1);
            const sum = sizes.reduce((a, b) => a + Math.max(1, b), 0) || 1;
            node.children.forEach((child, idx) => {
                const portion = Math.max(1, sizes[idx]) / sum;
                const childEl = renderNode(child, [...path, idx]);
                childEl.style.flexBasis = `${portion * 100}%`;
                wrapper.appendChild(childEl);
                if (idx < node.children.length - 1) {
                    const handle = document.createElement('div');
                    handle.className = 'layout-handle ' + (node.direction === 'horizontal' ? 'vertical-handle' : 'horizontal-handle');
                    handle.onpointerdown = (e) => window.startLayoutHandleDrag(e, path, idx, node.direction);
                    wrapper.appendChild(handle);
                }
            });
            return wrapper;
        }

        const block = document.createElement('div');
        block.className = 'layout-block';
        const label = document.createElement('div');
        label.className = 'block-label';
        label.textContent = `ブロック ${++blockCounter}`;
        const ratio = document.createElement('div');
        ratio.className = 'block-ratio';
        const zone = zones[blockCounter - 1];
        ratio.textContent = zone ? `${Math.round(zone.ratio * 100)}%` : '';
        block.appendChild(label);
        block.appendChild(ratio);
        block.onclick = (e) => {
            e.preventDefault();
            if (e.ctrlKey) { window.mergeLayoutBuilderSplit(path, 'horizontal'); return; }
            window.splitLayoutBuilderBlock(path, 'vertical');
        };
        block.oncontextmenu = (e) => {
            e.preventDefault();
            if (e.ctrlKey) { window.mergeLayoutBuilderSplit(path, 'vertical'); return; }
            window.splitLayoutBuilderBlock(path, 'horizontal');
        };
        return block;
    };

    const tree = renderNode(window.layoutBuilderState.layout, []);
    tree.style.flexGrow = '1';
    container.appendChild(tree);
};

window.startLayoutHandleDrag = function(e, path, index, direction) {
    const parent = window.getLayoutNodeByPath(window.layoutBuilderState.layout, path);
    if (!parent || parent.type !== 'split' || index < 0 || index >= parent.children.length - 1) return;
    const container = document.getElementById('layout-builder-preview');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const sizes = parent.sizes && parent.sizes.length === parent.children.length ? parent.sizes : Array(parent.children.length).fill(1);
    const totalPair = sizes[index] + sizes[index + 1];
    const startPrimary = sizes[index];
    const sumAll = sizes.reduce((a, b) => a + b, 0) || 1;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev) => {
        const deltaPx = direction === 'horizontal' ? (ev.clientX - startX) : (ev.clientY - startY);
        const totalPx = direction === 'horizontal' ? rect.width : rect.height;
        const deltaValue = (deltaPx / Math.max(1, totalPx)) * sumAll;
        let first = Math.max(BUILDER_MIN_COLUMN, Math.min(totalPair - BUILDER_MIN_COLUMN, startPrimary + deltaValue));
        let second = totalPair - first;
        if (second < BUILDER_MIN_COLUMN) { second = BUILDER_MIN_COLUMN; first = totalPair - second; }
        sizes[index] = first;
        sizes[index + 1] = second;
        parent.sizes = [...sizes];
        window.renderLayoutBuilderPreview();
    };

    const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
};

window.saveLayoutFromBuilder = function() {
    const nameInput = document.getElementById('layout-builder-name');
    const name = (nameInput?.value || '').trim() || '新規レイアウト';
    const layout = window.cloneLayoutNode(window.layoutBuilderState.layout);
    const template = { name, layout, columns: window.describeLayoutRatios({ layout }).map(v => parseInt(v, 10) || 0) };
    if (Number.isInteger(window.layoutBuilderState.editIndex) && window.layoutBuilderState.editIndex >= 0) {
        state.layoutTemplates[window.layoutBuilderState.editIndex] = template;
        state.activeLayoutTemplate = window.layoutBuilderState.editIndex;
    } else {
        state.layoutTemplates.push(template);
        state.activeLayoutTemplate = state.layoutTemplates.length - 1;
    }
    window.persistLayoutTemplates();
    window.closeLayoutBuilder();
    window.renderLayoutTemplateSettings();
};

window.parseLayoutTemplatesFromInput = function(raw) {
    if (!raw) return window.cloneLayoutTemplates(window.DEFAULT_LAYOUT_SETTINGS.templates);
    const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const templates = [];
    lines.forEach(line => {
        const [namePart, columnsPart] = line.includes(':') ? line.split(/:(.+)/).slice(0, 2) : [line, line];
        const name = (namePart || 'テンプレート').trim();
        const cols = (columnsPart || '').split(',').map(v => parseFloat(v.trim())).filter(v => !Number.isNaN(v) && v > 0);
        if (cols.length) templates.push({ name, columns: cols, layout: window.columnsToLayout(cols) });
    });
    return templates.length ? templates : window.cloneLayoutTemplates(window.DEFAULT_LAYOUT_SETTINGS.templates);
};

window.persistLayoutTemplates = function() {
    const payload = { templates: state.layoutTemplates, activeIndex: state.activeLayoutTemplate };
    window.writeJson(window.CONFIG.LAYOUT_TEMPLATES_KEY, payload);
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
    state.layoutTemplates = window.parseLayoutTemplatesFromInput(document.getElementById('layout-template-lines').value);
    state.activeLayoutTemplate = Math.min(parseInt(document.getElementById('layout-template-active').value || '0', 10) || 0, state.layoutTemplates.length - 1);
    window.persistLayoutTemplates();
    window.renderLayoutTemplateSettings();
    window.refreshTemplateSources();
    window.closeSettings();
};

window.resetSettings = function() {
    if(confirm("初期化しますか？")) {
        state.keymap = JSON.parse(JSON.stringify(window.DEFAULT_KEYMAP));
        state.settings = { ...window.DEFAULT_SETTINGS };
        state.layoutTemplates = window.cloneLayoutTemplates(window.DEFAULT_LAYOUT_SETTINGS.templates);
        state.activeLayoutTemplate = window.DEFAULT_LAYOUT_SETTINGS.activeIndex;
        window.renderTemplateSettingsForm();
        window.renderKeybindList();
        window.refreshTemplateSources();
        window.writeJson(window.CONFIG.KEYMAP_KEY, state.keymap);
        window.writeJson(window.CONFIG.SETTINGS_KEY, state.settings);
        window.persistLayoutTemplates();
    }
};
