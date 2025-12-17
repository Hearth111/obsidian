/* =========================================
   7. UI: Navigation, Sidebar, Search & Dashboard
   ========================================= */

let searchDebounce = null;

// --- Sidebar Tree ---
window.renderSidebar = function() {
    window.refreshTemplateSources();
    els.fileTree.innerHTML = "";
    const tree = {};
    
    // Build Tree Structure
    Object.keys(state.notes).sort().forEach(k => {
        k.split('/').reduce((acc, part, i, arr) => {
            if (!acc[part]) acc[part] = { __path: arr.slice(0, i + 1).join('/') };
            if (i === arr.length - 1) acc[part].__isFile = true;
            return acc[part];
        }, tree);
    });

    els.fileTree.appendChild(window.createTreeDom(tree));
    
    // Bookmarks
    const bl = document.getElementById('bookmark-list');
    bl.innerHTML = "";
    state.bookmarks.forEach(p => {
        if(state.notes[p]) {
            const d = document.createElement('div');
            d.className = 'tree-item';
            d.innerHTML = `<span style="color:var(--bookmark-color)">★</span> ${p.split('/').pop()}`;
            if(p === state.currentTitle) d.classList.add('active');
            d.onclick = () => window.openNoteInNewPane(p);
            d.oncontextmenu = (e) => window.showContextMenu(e, {type:'file', path:p});
            bl.appendChild(d);
        }
    });
    document.getElementById('bookmark-area').style.display = state.bookmarks.length ? 'block' : 'none';
};

window.createTreeDom = function(node) {
    const ul = document.createElement('ul');
    ul.className = 'tree';
    
    // メタデータ以外のキー（子要素）を取得してソート
    const keys = Object.keys(node).filter(k => k !== '__path' && k !== '__isFile').sort();

    keys.forEach(k => {
        if (k === window.FOLDER_MARKER) return; 

        const item = node[k];
        const li = document.createElement('li');
        
        // 子要素（フォルダやファイル）を持っているか判定
        const childrenKeys = Object.keys(item).filter(key => key !== '__path' && key !== '__isFile');
        const hasChildren = childrenKeys.length > 0;
        const isFile = !!item.__isFile;

        // 【修正】子要素を持たない純粋なファイルの場合
        if (isFile && !hasChildren) { 
            const d = document.createElement('div');
            d.className = 'tree-item';
            d.textContent = k;
            if (item.__path === state.currentTitle) d.classList.add('active');
            
            d.onclick = () => window.openNoteInNewPane(item.__path);
            d.oncontextmenu = (e) => window.showContextMenu(e, {type:'file', path:item.__path});
            
            d.draggable = true;
            d.ondragstart = (e) => { e.stopPropagation(); state.draggedItem = item.__path; };
            li.appendChild(d);

        } else { 
            // 【修正】フォルダ、または「子要素を持つファイル（フォルダノート）」の場合
            const det = document.createElement('details');
            if (state.expandedFolders[item.__path]) det.open = true;
            det.ontoggle = () => {
                state.expandedFolders[item.__path] = det.open;
                window.writeJson(window.CONFIG.EXPANDED_KEY, state.expandedFolders);
            };
            
            const sum = document.createElement('summary');
            sum.className = 'folder-label';
            
            // アイコン（クリックで開閉）
            const icon = document.createElement('span');
            icon.className = 'folder-icon';
            icon.textContent = '▶';
            sum.appendChild(icon);
            
            // ラベル（名前）
            const label = document.createElement('span');
            label.textContent = " " + k;
            
            if (isFile) {
                // ファイルでもある場合（フォルダノート）
                // ラベルをクリックしたらノートを開くようにする
                label.style.cursor = "pointer";
                label.title = "ノートを開く";
                label.onclick = (e) => {
                    e.preventDefault(); // detailsのトグル動作を防ぐ
                    // e.stopPropagation(); // 必要に応じてバブリングを止める
                    window.openNoteInNewPane(item.__path);
                };

                // アクティブ時の強調表示（簡易的）
                if (item.__path === state.currentTitle) {
                    label.style.color = "var(--accent-color)";
                    label.style.fontWeight = "bold";
                }
                
                // ファイルとしてのコンテキストメニュー
                sum.oncontextmenu = (e) => window.showContextMenu(e, {type:'file', path:item.__path});
            } else {
                // 純粋なフォルダの場合
                // フォルダとしてのコンテキストメニュー
                sum.oncontextmenu = (e) => window.showContextMenu(e, {type:'folder', path:item.__path});
            }

            // ドラッグ＆ドロップ（フォルダへの移動用）
            sum.draggable = true;
            sum.ondragstart = (e) => { e.stopPropagation(); state.draggedItem = item.__path; };
            sum.ondragover = (e) => { e.preventDefault(); sum.classList.add('drag-over'); };
            sum.ondragleave = (e) => { sum.classList.remove('drag-over'); };
            sum.ondrop = (e) => {
                e.preventDefault();
                sum.classList.remove('drag-over');
                if (state.draggedItem && !item.__path.startsWith(state.draggedItem + '/')) {
                    const oldPath = state.draggedItem;
                    const name = oldPath.split('/').pop();
                    const newPath = item.__path + '/' + name;
                    window.performRename(oldPath, newPath);
                    state.draggedItem = null;
                }
            };
            
            sum.appendChild(label);
            det.appendChild(sum);
            det.appendChild(window.createTreeDom(item)); // 再帰呼び出し
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
            // ファイルの場合でも削除を追加（フォルダノートの場合も削除できるように）
            m.appendChild(document.createElement('hr'));
            window.addMenu(m, "🗑 削除", () => window.deleteItem(path), true);
        } else {
            // 純粋なフォルダ
            window.addMenu(m, "＋ 新規ノート", () => window.createNewNote(path + "/"));
            window.addMenu(m, "＋ 新規フォルダ", () => window.createNewFolder(path + "/"));
            m.appendChild(document.createElement('hr'));

            window.addMenu(m, "✏️ フォルダ名変更", () => { const n = prompt("名前:", path); if (n) window.performRename(path, n); });
            m.appendChild(document.createElement('hr'));
            window.addMenu(m, "🗑 削除", () => window.deleteItem(path), true);
        }
    }
    m.style.top = Math.min(e.pageY, window.innerHeight - 150) + 'px';
    m.style.left = Math.min(e.pageX, window.innerWidth - 160) + 'px';
    m.style.display = 'block';
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
    window.invalidateTemplateCache();
    window.saveData();
    window.persistTabs();
    if (state.currentTitle.startsWith(oldPath)) window.loadNote(state.currentTitle.replace(oldPath, newPath));
    else { window.renderSidebar(); window.renderTabBar(); }
};

window.deleteItem = function(path) {
    if (!confirm("削除しますか？")) return;
    Object.keys(state.notes).filter(k => k === path || k.startsWith(path + '/')).forEach(k => delete state.notes[k]);
    state.bookmarks = state.bookmarks.filter(b => b !== path);
    window.invalidateTemplateCache();
    window.saveData();
    state.openTabs = state.openTabs.filter(t => !(t === path || t.startsWith(path + '/')));
    window.persistTabs();
    if (state.currentTitle === path || state.currentTitle.startsWith(path + '/')) window.loadNote("Home");
    else { window.renderSidebar(); window.renderTabBar(); }
};

// --- Task Dashboard ---
window.renderTaskDashboard = function(container) {
    // 互換性のため、引数がない場合はプレビューエリアを使用（古い呼び出しへの対応）
    const targetEl = container || els.preview; 
    if (!targetEl) return; // ターゲットがない場合は何もしない

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

    if (groups.length === 0) { html += `<div class="task-empty-state">タスクなし</div></div>`; targetEl.innerHTML = html; return; }

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
    targetEl.innerHTML = html;
};

window.toggleGlobalTask = function(title, index) {
    const lines = state.notes[title].split('\n');
    const line = lines[index];
    if (line.includes('[ ]')) lines[index] = line.replace('[ ]', '[x]');
    else if (line.includes('[x]')) lines[index] = line.replace('[x]', '[ ]');
    state.notes[title] = lines.join('\n');
    window.saveData();
    // もし現在エディタでそのノートを開いているなら反映
    if (state.currentTitle === title && els.editor) els.editor.value = state.notes[title];
    
    // ダッシュボード更新（コンテナを探して再描画）
    const dashboardContainer = document.getElementById('dashboard-container');
    const target = dashboardContainer || els.preview;
    if (target) window.renderTaskDashboard(target);
};

window.toggleShowCompleted = function(cb) {
    state.showCompletedTasks = cb.checked;
    const dashboardContainer = document.getElementById('dashboard-container');
    const target = dashboardContainer || els.preview;
    if (target) window.renderTaskDashboard(target);
};

// --- Search & Switcher ---
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
            d.onclick = () => window.openNoteInNewPane(p);
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

window.openSwitcher = function(callback = null) { 
    state.switcherCallback = callback;
    window.closeCommandPalette(); 
    els.switcherOverlay.style.display = 'flex'; 
    els.switcherInput.value = ""; 
    els.switcherInput.focus(); 
    window.updateSwitcher(); 
};

window.closeSwitcher = function() { 
    state.switcherCallback = null;
    els.switcherOverlay.style.display = 'none'; 
    // アクティブなエディタがあればフォーカスを戻す
    const editor = window.getActiveEditor && window.getActiveEditor();
    if(editor) editor.focus();
};

window.updateSwitcher = function() {
    const q = els.switcherInput.value.toLowerCase().trim();
    const keys = Object.keys(state.notes).filter(k =>
        !k.endsWith(window.FOLDER_MARKER)
    ).sort();
    
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
        d.onclick = () => { 
            if (state.switcherCallback) {
                state.switcherCallback(k);
            } else {
                window.loadNote(k); 
            }
            window.closeSwitcher(); 
        };
        els.switcherList.appendChild(d);
    });
};

window.openCommandPalette = function() { window.closeSwitcher(); els.commandOverlay.style.display = 'flex'; els.commandInput.value = ""; els.commandInput.focus(); window.updateCommandPalette(); };
window.closeCommandPalette = function() { 
    els.commandOverlay.style.display = 'none'; 
    const editor = window.getActiveEditor && window.getActiveEditor();
    if(editor) editor.focus();
};
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
}