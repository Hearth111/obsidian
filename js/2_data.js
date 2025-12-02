/* =========================================
   2. Data: Storage & Persistence
   ========================================= */

// Ensure state is accessed via 'window.state' or just 'state' (since it's on window)

window.saveData = function() {
    window.writeJson(CONFIG.STORAGE_KEY, state.notes);
    state.isModified = true; // NEW: Mark state as modified after any edit to localStorage
    if (state.currentTitle) {
        window.enqueueSearchSync(state.currentTitle, state.notes[state.currentTitle]);
    }
};

// MODIFIED: startAutoBackup function removed as requested.

window.exportData = function(filename) {
    const data = {
        notes: state.notes,
        images: state.images,
        bookmarks: state.bookmarks,
        expandedFolders: state.expandedFolders,
        keymap: state.keymap
    };
    const d = document.createElement('a');
    d.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    d.download = filename || `backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(d);
    d.click();
    d.remove();

    // NEW: Update status and reset modified flag on manual save (export)
    state.isModified = false;
    const date = new Date();
    const msg = "Saved: " + ('0'+date.getHours()).slice(-2) + ":" + ('0'+date.getMinutes()).slice(-2);
    window.showBackupStatus(msg);
};

window.importData = async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("現在のデータを上書きして復元しますか？")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (v) => {
        try {
            const loaded = JSON.parse(v.target.result);

            // Restore Data
            if (loaded.notes) {
                state.notes = loaded.notes;
                state.images = loaded.images || {};
                state.bookmarks = loaded.bookmarks || [];
                state.expandedFolders = loaded.expandedFolders || {};
                state.keymap = loaded.keymap || DEFAULT_KEYMAP;
            } else {
                // Legacy
                state.notes = loaded;
            }

            // Write to LocalStorage
            window.saveData();
            window.writeJson(CONFIG.IMAGES_KEY, state.images);
            window.writeJson(CONFIG.BOOKMARKS_KEY, state.bookmarks);
            window.writeJson(CONFIG.EXPANDED_KEY, state.expandedFolders);
            window.writeJson(CONFIG.KEYMAP_KEY, state.keymap);

            // NEW: Reset modified flag on import
            state.isModified = false;

            alert("復元が完了しました。ページをリロードします。");
            location.reload();
        } catch (x) {
            alert("復元に失敗しました: " + x);
            console.error(x);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
};

window.downloadNote = function() {
    const d = document.createElement('a');
    d.href = URL.createObjectURL(new Blob([state.notes[state.currentTitle]], { type: "text/markdown" }));
    d.download = state.currentTitle.split('/').pop() + ".md";
    document.body.appendChild(d); d.click(); d.remove();
};

// --- IndexedDB Search Cache & Offline Bridge ---
const SEARCH_DB_NAME = 'obsidian_v35_search';
const SEARCH_STORE = 'fulltext';

function openSearchDb() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB unsupported'));
        const req = indexedDB.open(SEARCH_DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SEARCH_STORE)) {
                db.createObjectStore(SEARCH_STORE, { keyPath: 'title' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function toSearchRecord(title, content) {
    return { title, content: (content || '').toLowerCase(), version: `${(content || '').length}-${title.length}` };
}

window.enqueueSearchSync = function(title) {
    if (!title) return;
    state.pendingSearchUpdates.add(title);
    if (state.searchSyncTimer) clearTimeout(state.searchSyncTimer);
    state.searchSyncTimer = setTimeout(() => {
        const targets = Array.from(state.pendingSearchUpdates);
        state.pendingSearchUpdates.clear();
        targets.forEach(t => window.updateSearchIndexEntry(t, state.notes[t] || ''));
    }, 250);
};

window.updateSearchIndexEntry = async function(title, content) {
    try {
        const db = state.searchDb || await window.initSearchIndex();
        if (!db) return;
        const tx = db.transaction(SEARCH_STORE, 'readwrite');
        tx.objectStore(SEARCH_STORE).put(toSearchRecord(title, content));
    } catch (err) {
        console.warn('Failed to update search cache', err);
    }
};

window.initSearchIndex = async function() {
    if (state.searchDb) return state.searchDb;
    try {
        state.searchDb = await openSearchDb();
        return state.searchDb;
    } catch (err) {
        console.warn('Search cache unavailable', err);
        return null;
    }
};

window.primeSearchIndex = async function() {
    const db = await window.initSearchIndex();
    if (!db) return;
    const tx = db.transaction(SEARCH_STORE, 'readwrite');
    const store = tx.objectStore(SEARCH_STORE);
    Object.entries(state.notes).forEach(([title, body]) => {
        store.put(toSearchRecord(title, body));
    });
    state.searchCacheReady = true;
};

window.searchNotes = async function(query) {
    const q = query.toLowerCase();
    const db = await window.initSearchIndex();
    if (!db) {
        return Object.keys(state.notes).filter(k => k.toLowerCase().includes(q) || state.notes[k].toLowerCase().includes(q));
    }

    return new Promise((resolve) => {
        const results = [];
        const tx = db.transaction(SEARCH_STORE, 'readonly');
        const store = tx.objectStore(SEARCH_STORE);
        const cursor = store.openCursor();
        cursor.onsuccess = (e) => {
            const cur = e.target.result;
            if (cur) {
                const { title, content } = cur.value;
                if (title.toLowerCase().includes(q) || content.includes(q)) results.push(title);
                cur.continue();
            } else {
                resolve(results);
            }
        };
        cursor.onerror = () => resolve([]);
    });
};

window.lazyInitHeavyFeatures = function() {
    const runner = (cb) => (window.requestIdleCallback ? requestIdleCallback(cb, { timeout: 1000 }) : setTimeout(cb, 200));
    runner(() => window.primeSearchIndex());
    runner(() => window.attachLocalBridge());
    runner(() => window.restoreClipboardHistory());
};

window.attachLocalBridge = function() {
    window.addEventListener('storage', (e) => {
        if (e.key === window.CONFIG.STORAGE_KEY && e.newValue) {
            try {
                const latest = JSON.parse(e.newValue);
                state.notes = latest;
                window.renderSidebar();
                if (state.currentTitle && state.notes[state.currentTitle]) {
                    window.loadNote(state.currentTitle, true);
                }
                window.showBackupStatus('ローカル変更を同期しました', 2000);
            } catch (err) {
                console.warn('Failed to sync updated notes from bridge', err);
            }
        }
    });
};

window.restoreClipboardHistory = function() {
    const history = window.readJson(window.CONFIG.CLIPBOARD_KEY, []);
    state.clipboardHistory = Array.isArray(history) ? history : [];
};

window.captureClipboard = function(text) {
    if (!text) return;
    state.clipboardHistory = [text, ...state.clipboardHistory.filter(t => t !== text)].slice(0, 20);
    window.writeJson(window.CONFIG.CLIPBOARD_KEY, state.clipboardHistory);
};
