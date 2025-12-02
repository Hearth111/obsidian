/* =========================================
   2. Data: Storage & Persistence
   ========================================= */

// Ensure state is accessed via 'window.state' or just 'state' (since it's on window)

window.saveData = function() {
    window.writeJson(CONFIG.STORAGE_KEY, state.notes);
    state.isModified = true; // NEW: Mark state as modified after any edit to localStorage
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
}