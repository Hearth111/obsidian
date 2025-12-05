/* =========================================
   5b. UI: Sidebar, Tabs & Menu Utilities
   ========================================= */

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
window.removeTabEntry = function(title) {
    const idx = state.openTabs.indexOf(title);
    if (idx === -1) return -1;
    state.openTabs.splice(idx, 1);
    window.persistTabs();
    window.renderTabBar();
    return idx;
};

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
    const idx = window.removeTabEntry(title);
    if (idx === -1) return;

    const wasCurrent = state.currentTitle === title;
    window.closePanesByTitle(title, { skipTabUpdate: true });

    if (wasCurrent) {
        const fallbackIndex = Math.min(idx, state.openTabs.length - 1);
        const fallbackTitle = state.openTabs[fallbackIndex];
        if (fallbackTitle) {
            window.loadNote(fallbackTitle);
        } else {
            state.currentTitle = '';
            state.activePaneIndex = -1;
            window.renderPanes();
        }
    }
};
