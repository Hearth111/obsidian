/* =========================================
   1. Logic: Config, Global State, Parser
   ========================================= */

window.CONFIG = {
    STORAGE_KEY: 'obsidian_v35_data',
    LAST_OPEN_KEY: 'obsidian_v35_last',
    EXPANDED_KEY: 'obsidian_v35_expanded',
    BOOKMARKS_KEY: 'obsidian_v35_bookmarks',
    IMAGES_KEY: 'obsidian_v35_images',
    KEYMAP_KEY: 'obsidian_v35_keymap'
};

window.TEMPLATES = {
    'meeting': `## 議事録\n- 日時: \n- 参加者: \n\n### 議題\n1. \n\n### 決定事項\n- \n\n### Next Action\n- [ ] `,
    'bug': `## バグ報告\n- 発生環境: \n- 再現手順:\n  1. \n  2. \n- 期待値: \n- 実際の結果: \n`
};

window.CANVAS_MARKER = '---type: canvas---';
window.FOLDER_MARKER = '.keep';

window.DEFAULT_KEYMAP = {
    'new-note': 'Alt+N',
    'toggle-preview': 'Ctrl+Enter',
    'toggle-privacy': 'Alt+B',
    'open-switcher': 'Ctrl+K',
    'open-command': 'Ctrl+P',
    'save-data': 'Ctrl+S' // NEW: Ctrl+SでJSON保存
};

window.CANVAS_COLORS = [
    'rgba(127, 109, 242, 0.1)', // Default (Purple)
    'rgba(229, 57, 53, 0.1)',   // Red
    'rgba(255, 179, 0, 0.1)',   // Orange
    'rgba(67, 160, 71, 0.1)',   // Green
    'rgba(3, 169, 244, 0.1)',   // Blue
    'rgba(117, 117, 117, 0.1)'  // Gray
];

// --- Global State Initialization ---
window.state = {
    notes: {},
    images: {},
    expandedFolders: {},
    bookmarks: [],
    keymap: window.DEFAULT_KEYMAP,
    currentTitle: "Home",
    historyStack: [],
    historyIndex: -1,
    
    // View Modes
    isDashboard: false,
    isSplit: false,
    isPreview: false,
    isPrivacy: false,
    showCompletedTasks: false,
    isCanvasMode: false,
    isModified: false, // NEW: Track unsaved changes for prompt on close
    
    // Canvas State
    canvasData: { nodes: [], edges: [], x: 0, y: 0, zoom: 1 },
    canvasMode: 'edit', // 'edit' (pointer) or 'pan' (hand)
    
    // Canvas Interaction Flags
    isDraggingCanvas: false,
    isDraggingNode: false,
    isResizing: false,
    isConnecting: false,
    
    pendingConnectNodeId: null, // 追加: 接続待機中のソースノードID
    
    dragStart: { x: 0, y: 0 },
    dragNodeId: null,
    resizeStart: { w: 0, h: 0 },
    tempLine: null,
    
    // Runtime
    draggedItem: null,
    contextTarget: null,
    timerInterval: null,
    timerTime: 25 * 60,
    isTimerRunning: false,
    switcherResults: [],
    switcherIndex: 0,
    commandResults: [],
    commandIndex: 0
};

window.COMMANDS = [
    { id: 'new-note', name: '新規ノート作成', handler: () => window.createNewNote() },
    { id: 'new-folder', name: '新規フォルダ作成', handler: () => window.createNewFolder() },
    { id: 'new-canvas', name: '新規キャンバス作成', handler: () => window.createNewCanvas() },
    { id: 'toggle-split', name: '2画面モード切替', handler: () => window.toggleSplit() },
    { id: 'toggle-preview', name: 'プレビュー切替', handler: () => window.togglePreviewMode() },
    { id: 'open-dashboard', name: '全タスクを表示', handler: () => window.toggleDashboard() },
    { id: 'insert-table', name: '表を挿入', handler: () => window.insertTable() },
    { id: 'toggle-privacy', name: 'プライバシー保護モード切替', handler: () => window.togglePrivacy() },
    { id: 'open-today', name: '今日のノートを開く', handler: () => window.openToday() },
    { id: 'export-data', name: '全データをダウンロード (JSON)', handler: () => window.exportData() }, // MODIFIED: Name changed for clarity
    { id: 'save-data', name: 'JSONを保存 (Ctrl+S)', handler: () => window.exportData() }, // NEW: Ctrl+S command
    { id: 'download-md', name: '現在のノートをダウンロード (MD)', handler: () => window.downloadNote() },
    { id: 'insert-tmpl-meeting', name: 'テンプレート挿入: 議事録', handler: () => window.insertTemplate('meeting') },
    { id: 'insert-tmpl-bug', name: 'テンプレート挿入: バグ報告', handler: () => window.insertTemplate('bug') },
    { id: 'insert-tmpl-idea', name: 'テンプレート挿入: アイデア', handler: () => window.insertTemplate('idea') },
    { id: 'toggle-timer', name: 'ポモドーロタイマー切替', handler: () => window.toggleTimer() },
    { id: 'go-back', name: '前に戻る', handler: () => window.goBack() },
    { id: 'go-forward', name: '次に進む', handler: () => window.goForward() },
    { id: 'open-switcher', name: 'ファイルを開く...', handler: () => window.openSwitcher() },
    { id: 'open-command', name: 'コマンドパレットを開く...', handler: () => window.openCommandPalette() },
    { id: 'open-settings', name: '設定を開く', handler: () => window.openSettings() },
];

window.escapeHTML = function(text) {
    if (!text) return "";
    return text.replace(/[&<>"']/g, function(m) {
        switch(m) {
            case '&': return '&amp;'; case '<': return '&lt;'; case '>': return '&gt;'; case '"': return '&quot;'; case "'": return '&#039;'; default: return m;
        }
    });
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
            h += `<div class="line-block"><blockquote>${contentLines.join('<br>')}</blockquote></div>`;
        }
        blockLines = []; inBlock = false;
    };
    
    const flushTable = () => {
        if (tableRows.length > 0) {
            h += '<table border="1">' + tableRows.join('') + '</table>';
            tableRows = [];
        }
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
}
