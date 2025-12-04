/* =========================================
   1. Logic: Config, Global State, Parser
   ========================================= */

window.CONFIG = {
    STORAGE_KEY: 'obsidian_v35_data',
    LAST_OPEN_KEY: 'obsidian_v35_last',
    EXPANDED_KEY: 'obsidian_v35_expanded',
    BOOKMARKS_KEY: 'obsidian_v35_bookmarks',
    IMAGES_KEY: 'obsidian_v35_images',
    KEYMAP_KEY: 'obsidian_v35_keymap',
    SETTINGS_KEY: 'obsidian_v35_settings',
    TABS_KEY: 'obsidian_v35_tabs',
    SIDEBAR_KEY: 'obsidian_v35_sidebar_collapsed',
    CLIPBOARD_KEY: 'obsidian_v35_clipboard',
    PANES_KEY: 'obsidian_v35_panes',
    PANE_LAYOUTS_KEY: 'obsidian_v35_pane_layouts',
    LAYOUT_TEMPLATES_KEY: 'obsidian_v35_layout_templates'
};

window.readJson = function(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`Failed to parse ${key} from localStorage`, err);
        return fallback;
    }
};

window.writeJson = function(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
        console.error(`Failed to persist ${key} to localStorage`, err);
    }
};

window.showBackupStatus = function(message, duration = 3000) {
    const statusEl = document.getElementById('backup-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    if (duration) {
        setTimeout(() => {
            if (statusEl.textContent === message) statusEl.textContent = '';
        }, duration);
    }
};

window.CANVAS_MARKER = '---type: canvas---';
window.FOLDER_MARKER = '.keep';

window.DEFAULT_KEYMAP = {
    'new-note': 'Alt+N',
    'toggle-preview': 'Ctrl+Enter',
    'toggle-privacy': 'Alt+B',
    'open-switcher': 'Ctrl+K',
    'open-command': 'Ctrl+P',
    'save-data': 'Ctrl+S'
};

window.DEFAULT_SETTINGS = {
    templateFolder: 'Templates',
    includeSubfoldersForTemplates: true,
    templateMenuGrouping: 'path',
    insertSpacingAroundTemplate: true,
    dailyNoteFormat: '{YYYY}/{MM}/{DD}/Daily'
};

window.DEFAULT_LAYOUT_SETTINGS = {
    activeIndex: 0,
    templates: [
        { name: '左右 50/50', columns: [50, 50] },
        { name: '三分割 33/34/33', columns: [33, 34, 33] },
        { name: '黄金比 62/38', columns: [62, 38] }
    ]
};

window.CANVAS_COLORS = [
    'rgba(127, 109, 242, 0.1)', 'rgba(229, 57, 53, 0.1)', 'rgba(255, 179, 0, 0.1)',
    'rgba(67, 160, 71, 0.1)', 'rgba(3, 169, 244, 0.1)', 'rgba(117, 117, 117, 0.1)'
];

// --- Global State Initialization ---
window.state = {
    notes: {},
    images: {},
    expandedFolders: {},
    bookmarks: [],
    keymap: window.DEFAULT_KEYMAP,
    settings: window.DEFAULT_SETTINGS,
    openTabs: [],
    templateCatalog: [],
    templateCacheKey: '',
    currentTitle: "Home",
    historyStack: [],
    historyIndex: -1,
    clipboardHistory: [],
    searchCacheReady: false,
    searchDb: null,
    pendingSearchUpdates: new Set(),

    // Layout Template
    layoutTemplates: window.DEFAULT_LAYOUT_SETTINGS.templates.map(t => ({ name: t.name, columns: [...t.columns] })),
    activeLayoutTemplate: window.DEFAULT_LAYOUT_SETTINGS.activeIndex,

    // View Modes & Layout
    isPrivacy: false,
    showCompletedTasks: false,
    isCanvasMode: false,
    isModified: false,
    isSidebarCollapsed: false,

    // Multi-Pane System
    panes: [], // { id, title, type: 'editor'|'preview'|'canvas' }
    paneSizes: [],
    paneLayouts: [], // { x, y, width, height, z, minimized, maximized, restore? }
    activePaneIndex: -1,
    zCounter: 10,
    headingCollapse: {},

    // Canvas State (Shared or active)
    canvasData: { nodes: [], edges: [], x: 0, y: 0, zoom: 1 },
    canvasMode: 'edit',
    
    // Interaction Flags
    switcherCallback: null,

    // Runtime
    draggedItem: null,
    draggingPaneIndex: null,
    contextTarget: null,
    timerInterval: null,
    timerTime: 25 * 60,
    isTimerRunning: false,
    switcherResults: [],
    switcherIndex: 0,
    commandResults: [],
    commandIndex: 0,
    activeSelectionTarget: null
};

window.CORE_COMMANDS = [
    { id: 'new-note', name: '新規ノート作成', handler: () => window.createNewNote() },
    { id: 'new-folder', name: '新規フォルダ作成', handler: () => window.createNewFolder() },
    { id: 'new-canvas', name: '新規キャンバス作成', handler: () => window.createNewCanvas() },
    { id: 'split-pane', name: '2画面表示 (編集+プレビュー)', handler: () => window.toggleDualView() },
    { id: 'toggle-preview', name: 'プレビュー切替 (アクティブな画面)', handler: () => window.togglePreviewMode() },
    { id: 'open-dashboard', name: '全タスクを表示', handler: () => window.toggleDashboard() },
    { id: 'insert-table', name: '表を挿入', handler: () => window.insertTable() },
    { id: 'toggle-privacy', name: 'プライバシー保護モード切替', handler: () => window.togglePrivacy() },
    { id: 'open-today', name: '今日のノートを開く', handler: () => window.openToday() },
    { id: 'export-data', name: '全データをダウンロード (JSON)', handler: () => window.exportData() },
    { id: 'save-data', name: 'JSONを保存 (Ctrl+S)', handler: () => window.exportData() },
    { id: 'download-md', name: '現在のノートをダウンロード (MD)', handler: () => window.downloadNote() },
    { id: 'toggle-timer', name: 'ポモドーロタイマー切替', handler: () => window.toggleTimer() },
    { id: 'go-back', name: '前に戻る', handler: () => window.goBack() },
    { id: 'go-forward', name: '次に進む', handler: () => window.goForward() },
    { id: 'open-switcher', name: 'ファイルを開く...', handler: () => window.openSwitcher() },
    { id: 'open-command', name: 'コマンドパレットを開く...', handler: () => window.openCommandPalette() },
    { id: 'open-settings', name: '設定を開く', handler: () => window.openSettings() },
    { id: 'clipboard-history', name: '📋 クリップボード履歴から貼り付け', handler: () => window.insertFromClipboardHistory() },
];

window.COMMANDS = [...window.CORE_COMMANDS];

window.escapeHTML = function(text) {
    if (!text) return "";
    return text.replace(/[&<>"']/g, function(m) {
        switch(m) {
            case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#039;'; default: return m;
        }
    });
};

window.escapeAttribute = function(text) {
    return window.escapeHTML(text || "").replace(/"/g, '&quot;');
};

window.unescapeHTML = function(text) {
    const d = document.createElement('div');
    d.innerHTML = text || "";
    return d.textContent || d.innerText || "";
};

window.escapeRegExp = function(text) {
    return (text || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

window.copyCode = function(btn) {
    const code = btn.nextElementSibling.innerText;
    navigator.clipboard.writeText(code).then(() => {
        const o = btn.textContent; btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = o, 1500);
    });
};

window.parseMarkdown = function(text, isInline = false) {
    let t = window.escapeHTML(text);
    const codeBlocks = [];
    
    t = t.replace(/```([\s\S]*?)```/g, (match, code) => {
        const lang = code.split('\n')[0].trim();
        const content = code.replace(lang, '').trim();
        codeBlocks.push({ lang, content });
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    if (isInline) return window.parseInline(t);

    const lines = t.split('\n');
    let h = "";
    let inBlock = false;
    let blockLines = [];
    let inTable = false;
    let tableRows = [];

    const flushBlock = () => {
        if (!blockLines.length) return;
        const f = blockLines[0];
        const contentLines = blockLines.map(l => l.replace(/^&gt;\s?/, '')); 
        const calloutMatch = f.match(/^&gt;\s?\[!(\w+)\]\s?(.*)/);
        if (calloutMatch) {
            const type = calloutMatch[1];
            const title = calloutMatch[2] || type;
            const body = contentLines.slice(1).join('<br>');
            h += `<div class="line-block callout co-${type.toUpperCase()}"><span class="callout-title">${title}</span>${body}</div>`;
        } else {
            h += `<div class="line-block block-quote">${contentLines.join('<br>')}</div>`;
        }
        blockLines = [];
        inBlock = false;
    };

    const flushTable = () => {
        if (!tableRows.length) return;
        h += `<table class="md-table">${tableRows.join('')}</table>`;
        tableRows = [];
        inTable = false;
    };

    for (let l of lines) {
        if (l.includes('__CODE_BLOCK_')) {
            if (inBlock) flushBlock();
            if (inTable) flushTable();
            h += `<div class="line-block">${l}</div>`;
            continue;
        }

        if (l.startsWith('&gt;')) {
            if (inTable) flushTable();
            inBlock = true;
            blockLines.push(l);
        } else {
            if (inBlock) flushBlock();

            if (l.trim().startsWith('|') && l.trim().endsWith('|')) {
                inTable = true;
                const rowContent = l.trim();
                if (!rowContent.includes('---')) {
                    const cells = rowContent.split('|').filter((_, i, arr) => i !== 0 && i !== arr.length - 1);
                    const rowHtml = `<tr>${cells.map(c => `<td>${window.parseInline(c.trim())}</td>`).join('')}</tr>`;
                    tableRows.push(rowHtml);
                }
                continue;
            } else {
                if (inTable) flushTable();
            }

            let content = window.parseInline(l); 
            if (content.match(/^<h[1-6]>/) || content.startsWith('<div')) {
                h += content;
            } else {
                h += `<div class="line-block">${content}<br></div>`;
            }
        }
    }
    if (inBlock) flushBlock();
    if (inTable) flushTable();

    codeBlocks.forEach((cb, i) => {
        const html = `<div class="code-block-container"><button class="copy-btn" onclick="copyCode(this)">Copy</button><pre><code class="${cb.lang}">${cb.content}</code></pre></div>`;
        h = h.replace(`__CODE_BLOCK_${i}__`, html);
    });

    return h.replace(/<\/ul><div class="line-block"><br><\/div><ul>/g, '');
};

window.parseInline = function(text) {
    let t = text; 
    const placeholders = [];
    const createPlaceholder = (content) => {
        placeholders.push(content);
        return `__PH_${placeholders.length - 1}__`;
    };

    t = t.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
        const imgTag = (state.images[src]) 
            ? `<img src="${state.images[src]}" alt="${alt}">` 
            : (src.startsWith('http') ? `<img src="${src}" alt="${alt}">` : `[Broken:${src}]`);
        return createPlaceholder(imgTag);
    });

    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, txt, url) => {
        const linkTag = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="external-link">${txt}</a>`;
        return createPlaceholder(linkTag);
    });

    t = t.replace(/\[\[(.*?)\]\]/g, (match, page) => {
        const wikiTag = `<span class="${state.notes[page] ? 'wiki-link' : 'wiki-link new'}" onclick="loadNote('${page}')">${page}</span>`;
        return createPlaceholder(wikiTag);
    });

    t = t.replace(/『([^』]+)』/g, (match, phrase) => {
        const clean = window.unescapeHTML(phrase.trim());
        if (!clean) return match;
        const display = window.escapeHTML(clean);
        const attr = window.escapeAttribute(clean);
        const linkTag = `<span class="phrase-link" data-phrase="${attr}" onclick="window.openPhraseLinks(this.dataset.phrase)">『${display}』</span>`;
        return createPlaceholder(linkTag);
    });

    t = t.replace(/^# (.*$)/, '<h1>$1</h1>').replace(/^## (.*$)/, '<h2>$1</h2>').replace(/^### (.*$)/, '<h3>$1</h3>');
    t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/#([^\s#.,;:[\]]+)/g, '<span class="tag-link">#$1</span>');
    t = t.replace(/^\- (.*$)/, '<ul><li>$1</li></ul>');
    t = t.replace(/- \[ \] (.*)/, '<div style="margin-left:20px;">⬜ $1</div>')
         .replace(/- \[x\] (.*)/, '<div style="margin-left:20px; text-decoration:line-through; color:#777;">✅ $1</div>');

    placeholders.forEach((ph, i) => {
        t = t.replace(`__PH_${i}__`, ph);
    });

    return t;
};

window.formatDailyNotePath = function(date = new Date()) {
    const settings = state.settings || window.DEFAULT_SETTINGS;
    const format = settings.dailyNoteFormat || window.DEFAULT_SETTINGS.dailyNoteFormat;
    const yyyy = date.getFullYear().toString();
    const mm = ('0' + (date.getMonth() + 1)).slice(-2);
    const dd = ('0' + date.getDate()).slice(-2);
    return format
        .replaceAll('{YYYY}', yyyy)
        .replaceAll('{MM}', mm)
        .replaceAll('{DD}', dd);
};

window.decoratePreview = function(container, noteTitle) {
    if (!container) return;
    const savedState = noteTitle ? (state.headingCollapse[noteTitle] || {}) : {};

    const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    headings.forEach((heading) => {
        if (!heading.isConnected) return;
        const level = parseInt(heading.tagName.substring(1), 10);
        const wrapper = document.createElement('details');
        wrapper.className = `collapsible-heading level-${level}`;

        const summary = document.createElement('summary');
        summary.innerHTML = heading.innerHTML;
        const key = `${level}:${summary.textContent.trim()}`;
        const isOpen = savedState.hasOwnProperty(key) ? savedState[key] : true;
        wrapper.open = isOpen;

        if (noteTitle) {
            if (!state.headingCollapse[noteTitle]) state.headingCollapse[noteTitle] = {};
            state.headingCollapse[noteTitle][key] = wrapper.open;
            wrapper.addEventListener('toggle', () => {
                state.headingCollapse[noteTitle][key] = wrapper.open;
            });
        }

        wrapper.appendChild(summary);

        let cursor = heading.nextSibling;
        while (cursor) {
            if (cursor.nodeType === 1 && /^H[1-6]$/.test(cursor.tagName)) {
                const nextLevel = parseInt(cursor.tagName.substring(1), 10);
                if (nextLevel <= level) break;
            }
            const next = cursor.nextSibling;
            wrapper.appendChild(cursor);
            cursor = next;
        }

        heading.replaceWith(wrapper);
    });
};