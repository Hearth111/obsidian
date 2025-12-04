/* =========================================
   6. UI: Editor, Formatting & Templates
   ========================================= */

// --- Paste Handler (Images) ---
window.handlePaste = async function (e) {
    const cd = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
    if (!cd) return;

    let blob = null;
    if (cd.items && cd.items.length > 0) {
        for (const item of cd.items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                blob = item.getAsFile();
                break;
            }
        }
    }
    if (!blob && cd.files && cd.files.length > 0) {
        for (const file of cd.files) {
            if (file.type.startsWith("image/")) {
                blob = file;
                break;
            }
        }
    }

    if (!blob) return;
    e.preventDefault();

    const dataUrl = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
    });

    const id = "img-" + Date.now();
    state.images[id] = dataUrl;
    window.writeJson(window.CONFIG.IMAGES_KEY, state.images);

    const insertText = `![image](${id})`;
    const target = e.target;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        if (typeof target.setRangeText === "function") {
            const start = target.selectionStart;
            const end = target.selectionEnd;
            target.setRangeText(insertText, start, end, "end");
            target.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
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

// --- Templates ---
window.normalizeTemplateFolder = function(folderName) {
    if (!folderName) return '';
    return folderName.replace(/^\/+|\/+$/g, '');
};

window.invalidateTemplateCache = function() {
    state.templateCacheKey = '';
};

window.computeTemplateCacheKey = function() {
    const settings = state.settings || window.DEFAULT_SETTINGS;
    const normalizedFolder = window.normalizeTemplateFolder(settings.templateFolder || '');
    const keys = Object.keys(state.notes).sort().join('|');
    return [
        normalizedFolder,
        settings.includeSubfoldersForTemplates,
        settings.templateMenuGrouping,
        settings.insertSpacingAroundTemplate,
        keys
    ].join('::');
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
    const cacheKey = window.computeTemplateCacheKey();
    if (state.templateCacheKey === cacheKey && state.templateCatalog.length) return;
    state.templateCacheKey = cacheKey;
    state.templateCatalog = window.buildTemplateCatalog();
    window.renderTemplateMenu();
    window.updateTemplateCommands();
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

// --- Floating Format Menu ---
let selectionMeasure = null;

function getSelectionMeasure() {
    if (selectionMeasure) return selectionMeasure;
    selectionMeasure = document.createElement('div');
    selectionMeasure.style.position = 'absolute';
    selectionMeasure.style.visibility = 'hidden';
    selectionMeasure.style.whiteSpace = 'pre-wrap';
    selectionMeasure.style.wordBreak = 'break-word';
    selectionMeasure.style.overflowWrap = 'break-word';
    selectionMeasure.style.pointerEvents = 'none';
    document.body.appendChild(selectionMeasure);
    return selectionMeasure;
}

window.hideFormatMenu = function() {
    if (!els.formatMenu) return;
    els.formatMenu.style.display = 'none';
};

window.computeSelectionRect = function(textarea, start, end) {
    if (!textarea) return null;
    const taRect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const div = getSelectionMeasure();
    ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth', 'letterSpacing', 'wordSpacing', 'boxSizing'].forEach(key => {
        div.style[key] = style[key];
    });
    div.style.width = textarea.clientWidth + 'px';
    div.style.minHeight = textarea.clientHeight + 'px';
    div.style.top = taRect.top + 'px';
    div.style.left = taRect.left + 'px';

    div.textContent = textarea.value.substring(0, start);
    const span = document.createElement('span');
    const selectionText = textarea.value.substring(start, end) || ' ';
    span.textContent = selectionText;
    div.appendChild(span);

    const spanRect = span.getBoundingClientRect();
    div.textContent = '';

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
        case 'bold': wrapSelection('**', '**'); break;
        case 'italic': wrapSelection('*', '*'); break;
        case 'code': wrapSelection('`', '`'); break;
        case 'quote': applyPrefixEachLine('> '); break;
        case 'list': applyPrefixEachLine('- '); break;
        case 'heading': applyHeading(); break;
        default: break;
    }

    ta.focus();
    window.updateFormatMenu();
}