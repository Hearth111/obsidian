/* =========================================
   5. UI: Sidebar, Commands, Settings, Dashboard
   ========================================= */

// NOTE: This file assumes els and state are defined on the window object
// by 4_app.js (or globally available).

let searchDebounce = null;

// --- Editor & Content Helpers ---

window.handlePaste = async function (e) {
    const cd = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!cd) return; // 安全対策

    // ---- 1) image/* を items から正確に抽出（全ブラウザ対応） ----
    let blob = null;

    // A: Chrome / Edge / 一部のFirefox → items が使える
    if (cd.items && cd.items.length > 0) {
        for (const item of cd.items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                blob = item.getAsFile();
                break;
            }
        }
    }

    // B: Safari / Firefox → files にしか画像が入らないことがある
    if (!blob && cd.files && cd.files.length > 0) {
        for (const file of cd.files) {
            if (file.type.startsWith("image/")) {
                blob = file;
                break;
            }
        }
    }

    // ---- 画像がなければ通常の貼り付けに任せる ----
    if (!blob) return;

    // OSやブラウザによっては image が取れた時点でファイルパスや不要文字が貼られるので阻止
    e.preventDefault();

    // ---- 2) FileReader で Base64 へ ----
    const dataUrl = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
    });

    // ---- 3) 画像IDを発行し localStorage に保存 ----
    const id = "img-" + Date.now();
    state.images[id] = dataUrl;
    window.writeJson(window.CONFIG.IMAGES_KEY, state.images);

    // ---- 4) Markdown 挿入文字列 ----
    const insertText = `![image](${id})`;

    // ---- 5) 貼り付け先のテキストボックスへ確実に挿入 ----
    const target = e.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        if (typeof target.setRangeText === "function") {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            target.setRangeText(insertText, start, end, "end");

            // 自動保存 & プレビュー更新を確実に発火
            target.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            // まず来ないがフォールバック
            target.value += insertText;
            target.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
};


window.insertTable = function() {
    const i = prompt("行数,列数", "3,3");
    if (!i) return;
    const [r, c] = i.split(/[,\sx]+/).map(Number);
    if (!r || !c) return;
    let m = "\n| " + Array(c).fill("Header").join(" | ") + " |\n| " + Array(c).fill("---").join(" | ") + " |\n";
    for (let j = 0; j < r; j++) m += "| " + Array(c).fill("Cell").join(" | ") + " |\n";
    document.execCommand('insertText', false, m + "\n");
};

window.normalizeTemplateFolder = function(folderName) {
    if (!folderName) return '';
    return folderName.replace(/^\/+|\/+$/g, '');
};

window.buildTemplateCatalog = function() {
    const catalog = [];
    const settings = state.settings || window.DEFAULT_SETTINGS;
    const folderRaw = (settings.templateFolder || '').trim();
    const folder = window.normalizeTemplateFolder(folderRaw);
    const seenCommandIds = new Set();

    const buildCommandId = (label) => {
        const safe = (label || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
        let cmd = `insert-tmpl-${safe}`;
        let i = 2;
        while (seenCommandIds.has(cmd)) { cmd = `insert-tmpl-${safe}-${i++}`; }
        seenCommandIds.add(cmd);
        return cmd;
    };

    if (folder) {
        const prefix = folder + '/';
        Object.keys(state.notes).sort().forEach(path => {
            if (path.endsWith('/' + window.FOLDER_MARKER)) return;
            if (path !== folder && !path.startsWith(prefix)) return;
            if (!settings.includeSubfoldersForTemplates && path.includes('/', prefix.length)) return;

            const relative = path === folder ? folder.split('/').pop() : path.replace(prefix, '');
            const label = settings.templateMenuGrouping === 'flat' ? path.split('/').pop() : relative;
            catalog.push({
                id: `note:${path}`,
                label: label,
                source: 'note',
                path,
                commandId: buildCommandId(label)
            });
        });
    }

    return catalog;
};

window.renderTemplateMenu = function() {
    const menu = document.getElementById('template-menu');
    if (!menu) return;
    menu.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'template-menu-header';
    const folderLabel = window.normalizeTemplateFolder(state.settings.templateFolder || '');
    header.textContent = folderLabel ? `📁 ${folderLabel}` : 'テンプレートフォルダ未設定';
    menu.appendChild(header);

    if (!state.templateCatalog.length) {
        const empty = document.createElement('div');
        empty.className = 'template-menu-empty';
        empty.textContent = 'テンプレートが見つかりません。設定からフォルダを指定してください。';
        menu.appendChild(empty);
        return;
    }

    state.templateCatalog.forEach((tmpl, index) => {
        const item = document.createElement('div');
        item.className = 'template-item';
        item.dataset.tmpl = tmpl.id;
        item.innerHTML = `${window.escapeHTML(tmpl.label)}`;
        item.onclick = (e) => { e.stopPropagation(); window.insertTemplateById(tmpl.id); };
        menu.appendChild(item);
        if (index === state.templateCatalog.length - 1) {
            const footer = document.createElement('div');
            footer.className = 'template-menu-footer';
            footer.textContent = 'テンプレートは設定で管理できます';
            menu.appendChild(footer);
        }
    });
};

window.updateTemplateCommands = function() {
    const nextCommands = [...window.CORE_COMMANDS];
    state.templateCatalog.forEach(tmpl => {
        nextCommands.push({
            id: tmpl.commandId,
            name: `テンプレートから新規作成: ${tmpl.label}`,
            handler: () => window.insertTemplateById(tmpl.id),
            isTemplateCommand: true
        });
    });
    window.COMMANDS = nextCommands;
    if (els.commandOverlay && els.commandOverlay.style.display === 'flex') window.updateCommandPalette();
    if (els.settingsOverlay && els.settingsOverlay.style.display === 'flex') window.renderKeybindList();
};

window.refreshTemplateSources = function() {
    state.templateCatalog = window.buildTemplateCatalog();
    window.renderTemplateMenu();
    window.updateTemplateCommands();
};

window.renderTabBar = function() {
    if (!els.tabBar) return;
    els.tabBar.innerHTML = '';
    state.openTabs.forEach(title => {
        const item = document.createElement('div');
        item.className = 'tab-item' + (title === state.currentTitle ? ' active' : '');
        const label = document.createElement('span');
        label.textContent = title;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';
        closeBtn.onclick = (e) => { e.stopPropagation(); window.closeTab(title); };
        item.onclick = () => { if (title !== state.currentTitle) window.loadNote(title); };
        item.appendChild(label);
        item.appendChild(closeBtn);
        els.tabBar.appendChild(item);
    });
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

window.insertTemplateById = function(id) {
    const tmpl = state.templateCatalog.find(t => t.id === id);
    if (!tmpl) { document.getElementById('template-menu').style.display = 'none'; return; }

    const body = state.notes[tmpl.path] || '';
    if (!body) {
        alert('テンプレート内容が空のようです');
        document.getElementById('template-menu').style.display = 'none';
        return;
    }

    const suggested = tmpl.path.split('/').pop() || tmpl.label || '';
    const newTitle = prompt(`テンプレートから作成するノート名を入力 (元: ${tmpl.label})`, suggested);
    if (!newTitle) { document.getElementById('template-menu').style.display = 'none'; return; }

    if (state.notes[newTitle]) {
        const overwrite = confirm('同名のノートが既にあります。上書きしますか？');
        if (!overwrite) { document.getElementById('template-menu').style.display = 'none'; return; }
    }

    state.notes[newTitle] = body;
    window.loadNote(newTitle);
    window.saveData();
    if(state.isPreview && !state.isSplit) window.togglePreviewMode();
    document.getElementById('template-menu').style.display = 'none';
};

window.handleEditorKeydown = function(e) {
    if (e.key === 'Enter') {
        const sel = els.editor.selectionStart;
        const text = els.editor.value;
        const lineStart = text.lastIndexOf('\n', sel - 1) + 1;
        const line = text.substring(lineStart, sel);
        const match = line.match(/^(\s*-\s\[[ x]\]\s)/);
        if (match) {
            e.preventDefault();
            document.execCommand('insertText', false, "\n" + match[1].replace('[x]', '[ ]'));
        }
    }
};

// --- Sidebar & File Management ---

window.renderSidebar = function() {
    window.refreshTemplateSources();
    els.fileTree.innerHTML = "";
    const tree = {};
    Object.keys(state.notes).sort().forEach(k => {
        k.split('/').reduce((acc, part, i, arr) => {
            if (!acc[part]) acc[part] = { __path: arr.slice(0, i + 1).join('/') };
            if (i === arr.length - 1) acc[part].__isFile = true;
            return acc[part];
        }, tree);
    });
    els.fileTree.appendChild(window.createTreeDom(tree));
    
    const bl = document.getElementById('bookmark-list');
    bl.innerHTML = "";
    state.bookmarks.forEach(p => {
        if(state.notes[p]) {
            const d = document.createElement('div');
            d.className = 'tree-item';
            d.innerHTML = `<span style="color:var(--bookmark-color)">★</span> ${p.split('/').pop()}`;
            if(p === state.currentTitle) d.classList.add('active');
            d.onclick = () => window.loadNote(p);
            d.oncontextmenu = (e) => window.showContextMenu(e, {type:'file', path:p});
            bl.appendChild(d);
        }
    });
    document.getElementById('bookmark-area').style.display = state.bookmarks.length ? 'block' : 'none';
};

window.createTreeDom = function(node) {
    const ul = document.createElement('ul');
    ul.className = 'tree';
    Object.keys(node).sort().forEach(k => {
        if (k === window.FOLDER_MARKER || k.startsWith('__')) return; 

        const item = node[k];
        const li = document.createElement('li');
        if (item.__isFile && Object.keys(item).length === 2) { 
            const d = document.createElement('div');
            d.className = 'tree-item';
            d.textContent = k;
            if (item.__path === state.currentTitle) d.classList.add('active');
            d.onclick = () => window.loadNote(item.__path);
            d.oncontextmenu = (e) => window.showContextMenu(e, {type:'file', path:item.__path});
            d.draggable = true;
            d.ondragstart = () => state.draggedItem = item.__path;
            li.appendChild(d);
        } else { 
            const det = document.createElement('details');
            if (state.expandedFolders[item.__path]) det.open = true;
            det.ontoggle = () => {
                state.expandedFolders[item.__path] = det.open;
                window.writeJson(window.CONFIG.EXPANDED_KEY, state.expandedFolders);
            };
            const sum = document.createElement('summary');
            sum.className = 'folder-label';
            sum.innerHTML = `<span class="folder-icon">▶</span> ${k}`;
            sum.oncontextmenu = (e) => window.showContextMenu(e, {type:'folder', path:item.__path});
            sum.draggable = true;
            sum.ondragstart = () => state.draggedItem = item.__path;
            sum.ondragover = (e) => { e.preventDefault(); sum.classList.add('drag-over'); };
            sum.ondragleave = (e) => { sum.classList.remove('drag-over'); };
            sum.ondrop = (e) => {
                e.preventDefault();
                sum.classList.remove('drag-over');
                if (state.draggedItem && !item.__path.startsWith(state.draggedItem + '/')) {
                    window.performRename(state.draggedItem, item.__path + '/' + state.draggedItem.split('/').pop());
                    state.draggedItem = null;
                }
            };
            det.appendChild(sum);
            det.appendChild(window.createTreeDom(item));
            li.appendChild(det);
        }
        ul.appendChild(li);
    });
    return ul;
};

window.handleDropRoot = function(e) {
    e.preventDefault();
    if(e.target !== els.sidebarContent) return;
    if (state.draggedItem) {
        const newPath = state.draggedItem.split('/').pop();
        if(newPath !== state.draggedItem) window.performRename(state.draggedItem, newPath);
        state.draggedItem = null;
    }
};

window.showContextMenu = function(e, target) {
    e.preventDefault(); e.stopPropagation();
    state.contextTarget = target;
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    if (target.isRoot) {
        window.addMenu(m, "＋ 新規ノート", () => window.createNewNote());
        window.addMenu(m, "＋ 新規フォルダ", () => window.createNewFolder());
    } else {
        const { type, path } = target;
        if (type === 'file') {
            const isBm = state.bookmarks.includes(path);
            window.addMenu(m, isBm ? "★ 解除" : "★ ブックマーク", () => {
                if(isBm) state.bookmarks = state.bookmarks.filter(b => b !== path);
                else state.bookmarks.push(path);
                window.writeJson(window.CONFIG.BOOKMARKS_KEY, state.bookmarks);
                window.renderSidebar();
            });
            window.addMenu(m, "✏️ 名前変更", () => { const n = prompt("名前:", path); if (n) window.performRename(path, n); });
        } else {
            window.addMenu(m, "＋ 新規ノート", () => window.createNewNote(path + "/"));
            window.addMenu(m, "＋ 新規フォルダ", () => window.createNewFolder(path + "/"));
            m.appendChild(document.createElement('hr'));

            window.addMenu(m, "✏️ フォルダ名変更", () => { const n = prompt("名前:", path); if (n) window.performRename(path, n); });
        }
        m.appendChild(document.createElement('hr'));
        window.addMenu(m, "🗑 削除", () => window.deleteItem(path), true);
    }
    m.style.top = Math.min(e.pageY, window.innerHeight - 150) + 'px';
    m.style.left = Math.min(e.pageX, window.innerWidth - 160) + 'px';
    m.style.display = 'block';
};

window.addMenu = function(p, text, act, isDel) {
    const d = document.createElement('div');
    d.textContent = text;
    if (isDel) d.className = 'delete-option';
    d.onclick = (e) => { e.stopPropagation(); act(); document.getElementById('context-menu').style.display = 'none'; };
    p.appendChild(d);
};

window.performRename = function(oldPath, newPath) {
    if (!newPath || oldPath === newPath || state.notes[newPath]) return;
    const updates = {};
    const dels = [];
    Object.keys(state.notes).forEach(k => {
        if (k === oldPath) { updates[newPath] = state.notes[k]; dels.push(k); }
        else if (k.startsWith(oldPath + '/')) { updates[k.replace(oldPath, newPath)] = state.notes[k]; dels.push(k); }
    });
    Object.assign(state.notes, updates);
    dels.forEach(k => delete state.notes[k]);
    const bi = state.bookmarks.indexOf(oldPath);
    if(bi !== -1) state.bookmarks[bi] = newPath;
    state.openTabs = state.openTabs.map(t => t === oldPath ? newPath : (t.startsWith(oldPath + '/') ? t.replace(oldPath, newPath) : t));
    window.saveData();
    window.persistTabs();
    if (state.currentTitle.startsWith(oldPath)) window.loadNote(state.currentTitle.replace(oldPath, newPath));
    else { window.renderSidebar(); window.renderTabBar(); }
};

window.deleteItem = function(path) {
    if (!confirm("削除しますか？")) return;
    Object.keys(state.notes).filter(k => k === path || k.startsWith(path + '/')).forEach(k => delete state.notes[k]);
    state.bookmarks = state.bookmarks.filter(b => b !== path);
    window.saveData();
    state.openTabs = state.openTabs.filter(t => !(t === path || t.startsWith(path + '/')));
    window.persistTabs();
    if (state.currentTitle === path || state.currentTitle.startsWith(path + '/')) window.loadNote("Home");
    else { window.renderSidebar(); window.renderTabBar(); }
};

// --- Status Bar & Timer ---

window.updateStatusBar = function() {
    const t = els.editor.value;
    els.wordCount.textContent = t.length + " chars";
    const m = t.match(/- \[[ x]\]/g) || [];
    const d = m.filter(x => x.includes('[x]')).length;
    els.taskStats.textContent = `${d}/${m.length}`;
    els.progressFill.style.width = (m.length ? (d / m.length * 100) : 0) + "%";
    
    // 選択文字数が表示されている場合は更新せず、メインの文字数表示だけ更新
    if(els.selectedCount && els.selectedCount.style.display === 'block') {
         // do nothing, rely on updateSelectedCount for selection status
    } else {
        els.selectedCount.textContent = '';
        els.selectedCount.style.display = 'none';
    }
};

// 追加: 選択文字数の表示を更新する関数
window.updateSelectedCount = function() {
    if (!els.editor || !els.selectedCount) return;

    const start = els.editor.selectionStart;
    const end = els.editor.selectionEnd;
    const count = end - start;

    if (count > 0) {
        els.selectedCount.textContent = `Selected: ${count} chars`;
        els.selectedCount.style.display = 'block';
    } else {
        els.selectedCount.textContent = '';
        els.selectedCount.style.display = 'none';
    }
};

window.hideFormatMenu = function() {
    if (!els.formatMenu) return;
    els.formatMenu.style.display = 'none';
};

window.computeSelectionRect = function(textarea, start, end) {
    if (!textarea) return null;
    const taRect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const div = document.createElement('div');
    ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth', 'letterSpacing', 'wordSpacing', 'boxSizing'].forEach(key => {
        div.style[key] = style[key];
    });
    div.style.position = 'absolute';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-word';
    div.style.overflowWrap = 'break-word';
    div.style.visibility = 'hidden';
    div.style.width = textarea.clientWidth + 'px';
    div.style.minHeight = textarea.clientHeight + 'px';
    div.style.top = taRect.top + 'px';
    div.style.left = taRect.left + 'px';

    div.textContent = textarea.value.substring(0, start);
    const span = document.createElement('span');
    const selectionText = textarea.value.substring(start, end) || ' ';
    span.textContent = selectionText;
    div.appendChild(span);

    document.body.appendChild(div);
    const spanRect = span.getBoundingClientRect();
    document.body.removeChild(div);

    return {
        left: spanRect.left - textarea.scrollLeft,
        top: spanRect.top - textarea.scrollTop,
        width: Math.max(spanRect.width, 1),
        height: Math.max(spanRect.height, parseFloat(style.lineHeight) || 16)
    };
};

window.updateFormatMenu = function(e) {
    if (!els.editor || !els.formatMenu) return;
    const start = els.editor.selectionStart;
    const end = els.editor.selectionEnd;
    if (start === end) { window.hideFormatMenu(); return; }

    els.formatMenu.style.display = 'flex';
    els.formatMenu.style.visibility = 'hidden';
    const rect = window.computeSelectionRect(els.editor, start, end);
    if (!rect) { window.hideFormatMenu(); return; }

    const menuRect = els.formatMenu.getBoundingClientRect();
    const anchorLeft = rect.left + (rect.width / 2) + window.scrollX;
    const anchorTop = rect.top + window.scrollY;

    let left = anchorLeft - (menuRect.width / 2);
    let top = anchorTop - menuRect.height - 10;
    left = Math.min(Math.max(10, left), window.innerWidth - menuRect.width - 10);
    top = Math.max(10, top);

    els.formatMenu.style.left = `${left}px`;
    els.formatMenu.style.top = `${top}px`;
    els.formatMenu.style.visibility = 'visible';
    els.formatMenu.style.display = 'flex';
};

window.applyFormatting = function(action) {
    const ta = els.editor;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const value = ta.value;

    const dispatchChange = () => ta.dispatchEvent(new Event('input', { bubbles: true }));
    const wrapSelection = (before, after) => {
        const selected = value.slice(start, end);
        if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
            const inner = selected.slice(before.length, selected.length - after.length);
            ta.setRangeText(inner, start, end, 'select');
            ta.selectionStart = start;
            ta.selectionEnd = start + inner.length;
        } else {
            const insert = before + selected + after;
            ta.setRangeText(insert || before + after, start, end, 'select');
            const base = start + before.length;
            ta.selectionStart = base;
            ta.selectionEnd = base + selected.length;
        }
        dispatchChange();
    };

    const applyPrefixEachLine = (prefix) => {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIndex = value.indexOf('\n', end);
        const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const hasPrefix = lines.every(line => line.startsWith(prefix));
        const next = lines.map(line => hasPrefix ? line.slice(prefix.length) : prefix + line).join('\n');
        ta.setRangeText(next, lineStart, lineEnd, 'select');
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + next.length;
        dispatchChange();
    };

    const applyHeading = () => {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIndex = value.indexOf('\n', lineStart);
        const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
        const line = value.slice(lineStart, lineEnd);
        const trimmed = line.replace(/^#\s+/, '');
        const hasHeading = line.startsWith('# ');
        const next = hasHeading ? trimmed : `# ${line}`;
        ta.setRangeText(next, lineStart, lineEnd, 'select');
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + next.length;
        dispatchChange();
    };

    switch(action) {
        case 'bold':
            wrapSelection('**', '**');
            break;
        case 'italic':
            wrapSelection('*', '*');
            break;
        case 'code':
            wrapSelection('`', '`');
            break;
        case 'quote':
            applyPrefixEachLine('> ');
            break;
        case 'list':
            applyPrefixEachLine('- ');
            break;
        case 'heading':
            applyHeading();
            break;
        default:
            break;
    }

    ta.focus();
    window.updateFormatMenu();
};

window.toggleTimer = function() {
    if (state.isTimerRunning) { clearInterval(state.timerInterval); state.isTimerRunning = false; state.timerTime = 25 * 60; }
    else {
        state.isTimerRunning = true;
        state.timerInterval = setInterval(() => {
            state.timerTime--;
            if (state.timerTime <= 0) { clearInterval(state.timerInterval); state.isTimerRunning = false; alert("Time Up!"); state.timerTime = 25 * 60; }
            window.updateTimerUI();
        }, 1000);
    }
    window.updateTimerUI();
};
window.updateTimerUI = function() {
    const m = Math.floor(state.timerTime / 60);
    const s = state.timerTime % 60;
    els.timer.textContent = state.isTimerRunning ? `⏸ ${('0'+m).slice(-2)}:${('0'+s).slice(-2)}` : `🍅 25:00`;
    els.timer.style.color = state.isTimerRunning ? '#81c784' : 'var(--timer-color)';
};

// --- Task Dashboard ---

window.renderTaskDashboard = function() {
    let html = `<div class="task-dashboard"><h2>⚡ Global Task Dashboard</h2><div class="dashboard-controls"><button class="btn" onclick="window.renderTaskDashboard()">🔄 更新</button><label><input type="checkbox" onchange="window.toggleShowCompleted(this)" ${state.showCompletedTasks ? 'checked' : ''}>完了済みを表示</label></div>`;
    const seenTasks = new Set();
    const groups = Object.keys(state.notes).sort().reverse().map(title => {
        const lines = state.notes[title].split('\n');
        const tasks = [];
        lines.forEach((line, index) => {
            const match = line.match(/^(\s*-\s\[([ x])\]\s)(.*)/);
            if (match) {
                const isDone = match[2] === 'x';
                const textRaw = match[3].trim();
                if (!textRaw) return;
                if (!state.showCompletedTasks && isDone) return;
                if (!isDone) { if (seenTasks.has(textRaw)) return; seenTasks.add(textRaw); }
                tasks.push({ lineIndex: index, isDone, text: match[3], raw: line });
            }
        });
        return { title, tasks };
    }).filter(g => g.tasks.length > 0);

    if (groups.length === 0) { html += `<div class="task-empty-state">タスクなし</div></div>`; els.preview.innerHTML = html; return; }

    groups.forEach(group => {
        const done = group.tasks.filter(t => t.isDone).length;
        const total = group.tasks.length;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const color = pct === 100 ? '#81c784' : (pct > 50 ? '#ffb74d' : '#e57373');
        html += `<div class="task-file-group"><div class="task-file-header" onclick="window.loadNote('${group.title}')"><span class="task-file-title">📄 ${group.title}</span><span class="task-file-progress" style="color:${color}">${done}/${total} (${pct}%)</span></div><div class="task-list-container">${group.tasks.map(t => {
            let safeText = window.escapeHTML(t.text);
            let rendered = window.parseInline(safeText);
            return `<div class="task-item" onclick="window.toggleGlobalTask('${group.title}', ${t.lineIndex})"><span class="task-checkbox">${t.isDone ? '✅' : '⬜'}</span><span class="task-content ${t.isDone ? 'done' : ''}">${rendered}</span></div>`;
        }).join('')}</div></div>`;
    });
    html += `</div>`;
    els.preview.innerHTML = html;
};

window.toggleGlobalTask = function(title, index) {
    const lines = state.notes[title].split('\n');
    const line = lines[index];
    if (line.includes('[ ]')) lines[index] = line.replace('[ ]', '[x]');
    else if (line.includes('[x]')) lines[index] = line.replace('[x]', '[ ]');
    state.notes[title] = lines.join('\n');
    window.saveData();
    // Editor is not always available if in Dashboard view
    if (state.currentTitle === title && els.editor) els.editor.value = state.notes[title];
    window.renderTaskDashboard();
};

window.toggleShowCompleted = function(cb) {
    state.showCompletedTasks = cb.checked;
    window.renderTaskDashboard();
};


// --- Search & Command Palettes ---

window.handleSearch = function() {
    const q = els.searchBox.value.toLowerCase().trim();
    const area = document.getElementById('search-result-area');
    const list = document.getElementById('search-list');
    if (!q) { area.style.display = 'none'; return; }
    area.style.display = 'block';
    list.innerHTML = "検索中...";
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
        const matches = await window.searchNotes(q);
        list.innerHTML = "";
        matches.slice(0, 120).forEach(p => {
            const d = document.createElement('div');
            d.className = 'tree-item';
            d.textContent = p;
            d.onclick = () => window.loadNote(p);
            list.appendChild(d);
        });
        if (list.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tree-item';
            empty.textContent = '該当なし';
            list.appendChild(empty);
        }
    }, 150);
};

window.insertFromClipboardHistory = function() {
    const items = state.clipboardHistory || [];
    if (!items.length) {
        alert('クリップボード履歴がありません');
        return;
    }
    const menu = items.map((t, i) => `${i + 1}. ${t.slice(0, 80)}`).join('\n');
    const pick = prompt(`貼り付けたい履歴の番号を入力:\n${menu}`);
    const idx = parseInt(pick, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= items.length) return;
    const text = items[idx];
    const target = els.editor;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    target.value = `${before}${text}${after}`;
    target.selectionStart = target.selectionEnd = start + text.length;
    target.focus();
    state.notes[state.currentTitle] = target.value;
    window.captureClipboard(text);
    window.saveData();
    if (state.isSplit || state.isPreview) window.renderPreview();
};

window.openPhraseLinks = function(rawPhrase) {
    const overlay = document.getElementById('phrase-overlay');
    const list = document.getElementById('phrase-list');
    const heading = document.getElementById('phrase-title');
    const phraseText = window.unescapeHTML(rawPhrase || "");

    if (!overlay || !list || !heading || !phraseText) return;

    heading.textContent = `『${phraseText}』の出現箇所`;
    list.innerHTML = "";

    const results = Object.entries(state.notes)
        .filter(([title]) => !title.endsWith('/' + window.FOLDER_MARKER))
        .filter(([_, content]) => !content.startsWith(window.CANVAS_MARKER))
        .map(([title, content]) => {
            const matches = [];
            let idx = content.indexOf(phraseText);
            while (idx !== -1) {
                const start = Math.max(0, idx - 20);
                const end = Math.min(content.length, idx + phraseText.length + 20);
                const snippet = content.slice(start, end).replace(/\n/g, ' ');
                matches.push(snippet);
                idx = content.indexOf(phraseText, idx + phraseText.length);
            }
            return { title, matches };
        })
        .filter(r => r.matches.length > 0);

    if (results.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'phrase-empty';
        empty.textContent = '該当箇所は見つかりませんでした。';
        list.appendChild(empty);
    } else {
        const regex = new RegExp(window.escapeRegExp(phraseText), 'g');
        results.forEach(result => {
            const container = document.createElement('div');
            container.className = 'phrase-result';

            const title = document.createElement('div');
            title.className = 'phrase-result-title';
            title.textContent = result.title;
            title.onclick = () => window.loadNote(result.title);
            container.appendChild(title);

            result.matches.forEach(snippetText => {
                const snippet = document.createElement('div');
                snippet.className = 'phrase-snippet';
                const safe = window.escapeHTML(snippetText);
                snippet.innerHTML = safe.replace(regex, `<mark>『${window.escapeHTML(phraseText)}』</mark>`);
                container.appendChild(snippet);
            });

            list.appendChild(container);
        });
    }

    overlay.style.display = 'flex';
};

window.closePhraseOverlay = function() {
    const overlay = document.getElementById('phrase-overlay');
    if (overlay) overlay.style.display = 'none';
};

window.openSwitcher = function() { window.closeCommandPalette(); els.switcherOverlay.style.display = 'flex'; els.switcherInput.value = ""; els.switcherInput.focus(); window.updateSwitcher(); };
window.closeSwitcher = function() { els.switcherOverlay.style.display = 'none'; els.editor.focus(); };
window.updateSwitcher = function() {
    const q = els.switcherInput.value.toLowerCase().trim();
    const keys = Object.keys(state.notes).sort();
    state.switcherResults = q ? keys.filter(k => k.toLowerCase().includes(q)) : keys.slice(0, 20);
    state.switcherIndex = 0;
    window.renderSwitcherList();
};
window.renderSwitcherList = function() {
    els.switcherList.innerHTML = "";
    state.switcherResults.forEach((k, i) => {
        const d = document.createElement('div');
        d.className = 'switcher-item' + (i === state.switcherIndex ? ' selected' : '');
        d.textContent = k;
        d.onclick = () => { window.loadNote(k); window.closeSwitcher(); };
        els.switcherList.appendChild(d);
    });
};

window.openCommandPalette = function() { window.closeSwitcher(); els.commandOverlay.style.display = 'flex'; els.commandInput.value = ""; els.commandInput.focus(); window.updateCommandPalette(); };
window.closeCommandPalette = function() { els.commandOverlay.style.display = 'none'; els.editor.focus(); };
window.updateCommandPalette = function() {
    const q = els.commandInput.value.toLowerCase().trim();
    state.commandResults = q ? window.COMMANDS.filter(c => c.name.toLowerCase().includes(q)) : window.COMMANDS;
    state.commandIndex = 0;
    window.renderCommandList();
};
window.renderCommandList = function() {
    els.commandList.innerHTML = "";
    state.commandResults.forEach((c, i) => {
        const binding = state.keymap[c.id];
        const d = document.createElement('div');
        d.className = 'command-item' + (i === state.commandIndex ? ' selected' : '');
        d.innerHTML = `<span>${c.name}</span>` + (binding ? `<span class="command-shortcut">${binding}</span>` : '');
        d.onclick = () => { c.handler(); window.closeCommandPalette(); };
        els.commandList.appendChild(d);
    });
};

// --- Settings ---

window.renderTemplateSettingsForm = function() {
    if (!els.templateFolderInput) return;
    els.templateFolderInput.value = state.settings.templateFolder || '';
    els.templateIncludeSub.checked = !!state.settings.includeSubfoldersForTemplates;
    els.templateGrouping.value = state.settings.templateMenuGrouping || 'path';
    els.templateSpacing.checked = !!state.settings.insertSpacingAroundTemplate;
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
    els.settingsOverlay.style.display = 'flex';
    window.switchSettingsPanel('template');
    window.renderTemplateSettingsForm();
    window.renderKeybindList();
};
window.closeSettings = function() { els.settingsOverlay.style.display = 'none'; };
window.renderKeybindList = function() {
    const list = els.keybindList;
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
        templateFolder: window.normalizeTemplateFolder(els.templateFolderInput.value.trim()),
        includeSubfoldersForTemplates: els.templateIncludeSub.checked,
        templateMenuGrouping: els.templateGrouping.value,
        insertSpacingAroundTemplate: els.templateSpacing.checked
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
};

window.applySidebarState = function() {
    document.body.classList.toggle('sidebar-collapsed', state.isSidebarCollapsed);
    const btn = document.getElementById('sidebar-toggle');
    if (btn) {
        btn.textContent = state.isSidebarCollapsed ? '⮞' : '⮜';
        btn.title = state.isSidebarCollapsed ? 'サイドバーを開く' : 'サイドバーを閉じる';
    }
};

window.toggleSidebar = function() {
    state.isSidebarCollapsed = !state.isSidebarCollapsed;
    localStorage.setItem(window.CONFIG.SIDEBAR_KEY, state.isSidebarCollapsed ? '1' : '0');
    window.applySidebarState();
};