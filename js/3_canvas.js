/* =========================================
   3. Canvas: Advanced Logic (Cleaned & Optimized)
   ========================================= */

// --- Constants & Helpers ---
const generateId = () => 'node-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
const CANVAS_ANCHORS = ['top', 'right', 'bottom', 'left'];
const CANVAS_NODE_HIT_PADDING = 24;

// 状態管理用変数の初期化（ロード時にリセット）
function resetCanvasState() {
    state.canvasMode = 'edit';      // 'edit' | 'pan'
    state.connectSource = null;     // 接続待機中のソース情報 { nodeId, anchor }
    
    // ドラッグ・操作系の一時変数
    state.actionState = null;       // 'drag_node', 'resize_node', 'drag_canvas', null
    state.activeSubjectId = null;   // 操作中のNodeID
    state.dragStart = { x: 0, y: 0 };
    state.resizeStart = { w: 0, h: 0 };
}

// 座標計算系
function getAnchorPosition(node, anchor) {
    if (!node) return { x: 0, y: 0 };
    switch(anchor) {
        case 'top': return { x: node.x + node.w / 2, y: node.y };
        case 'right': return { x: node.x + node.w, y: node.y + node.h / 2 };
        case 'bottom': return { x: node.x + node.w / 2, y: node.y + node.h };
        case 'left': return { x: node.x, y: node.y + node.h / 2 };
        default: return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    }
}

function getNearestAnchor(node, x, y, threshold = 32) {
    let best = null;
    CANVAS_ANCHORS.forEach(a => {
        const p = getAnchorPosition(node, a);
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist <= threshold && (!best || dist < best.dist)) best = { anchor: a, dist };
    });
    return best ? best.anchor : null;
}

// ★修正: グリッド吸着を実質なし(1px)に変更
function snapToGrid(value, grid = 1, tolerance = 4) {
    const mod = value % grid;
    if (mod <= tolerance) return value - mod;
    if (grid - mod <= tolerance) return value + (grid - mod);
    return value;
}

// 現在アクティブなキャンバス要素と関連DOMを取得
function getActiveCanvasArea() {
    const activeIndex = state.activePaneIndex;
    if (typeof activeIndex !== 'number') return document.querySelector('.canvas-area[data-active-canvas="true"]');
    return document.querySelector(`.canvas-area[data-pane-index="${activeIndex}"][data-active-canvas="true"]`) ||
        document.querySelector('.canvas-area[data-active-canvas="true"]');
}

function getCanvasDomRefs() {
    const area = getActiveCanvasArea();
    if (!area) return {};
    return {
        area,
        layer: area.querySelector('.canvas-layer'),
        nodesEl: area.querySelector('.canvas-nodes'),
        svgEl: area.querySelector('.canvas-svg'),
        info: area.querySelector('.canvas-info'),
        pointerBtn: area.querySelector('.cv-mode-pointer'),
        panBtn: area.querySelector('.cv-mode-pan'),
    };
}

// キャンバス領域へのイベントバインド（アクティブ時のみ）
window.bindCanvasArea = function(area) {
    if (!area || area.__canvasBound) return;

    // ドラッグ終了用のグローバルリスナーを一度だけセット
    if (!window.__canvasGlobalBound) {
        document.addEventListener('mousemove', window.handleCanvasMouseMove);
        document.addEventListener('mouseup', window.handleCanvasMouseUp);
        window.__canvasGlobalBound = true;
    }

    area.addEventListener('mousedown', window.handleCanvasMouseDown);
    area.addEventListener('wheel', window.handleCanvasWheel, { passive: false });
    area.addEventListener('dblclick', window.handleCanvasDblClick);
    area.__canvasBound = true;
};

// --- Main Functions ---

window.createNewCanvas = function() {
    const n = prompt("新規キャンバス名:");
    if (n) {
        if (!state.notes[n]) {
            const initialData = { nodes: [], edges: [], x: 0, y: 0, zoom: 1 };
            state.notes[n] = CANVAS_MARKER + '\n' + JSON.stringify(initialData);
        }
        window.loadNote(n);
        window.saveData();
    }
};

window.loadCanvasData = function(content) {
    try {
        const jsonStr = content.replace(CANVAS_MARKER, '').trim();
        const data = jsonStr ? JSON.parse(jsonStr) : {};
        state.canvasData = {
            nodes: data.nodes || [],
            edges: data.edges || [],
            x: data.x || 0,
            y: data.y || 0,
            zoom: data.zoom || 1
        };
        // ID補完
        state.canvasData.nodes.forEach(n => { if(!n.id) n.id = generateId(); });
    } catch(e) {
        console.error(e);
        state.canvasData = { nodes: [], edges: [], x: 0, y: 0, zoom: 1 };
    }
    
    resetCanvasState();
    window.updateCanvasModeUI();
    window.renderCanvas();
};

window.saveCanvasData = function() {
    state.notes[state.currentTitle] = CANVAS_MARKER + '\n' + JSON.stringify(state.canvasData);
    window.saveData();
};

// --- Rendering ---

window.renderCanvas = function() {
    const { layer, nodesEl, svgEl, area, info } = getCanvasDomRefs();

    if(!layer || !area || !nodesEl || !svgEl) return;

    const { x, y, zoom } = state.canvasData;
    
    // 1. ビューポート更新
    layer.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    area.style.backgroundPosition = `${x}px ${y}px`;
    area.style.backgroundSize = `${20 * zoom}px ${20 * zoom}px`;

    // 2. 表示範囲の計算（カリング用）
    const rect = area.getBoundingClientRect();
    const buffer = 240;
    const view = {
        left: (-x - buffer) / zoom,
        top: (-y - buffer) / zoom,
        right: (rect.width - x + buffer) / zoom,
        bottom: (rect.height - y + buffer) / zoom
    };
    const visibleNodes = state.canvasData.nodes.filter(n =>
        n.x + n.w >= view.left && n.x <= view.right && n.y + n.h >= view.top && n.y <= view.bottom
    );
    const visibleIds = new Set(visibleNodes.map(n => n.id));

    // 3. モード状態に応じたUIクラスの適用
    const isConnecting = !!state.connectSource;
    if (isConnecting) {
        area.classList.add('connecting-mode');
        info.textContent = "接続先をクリック（ノードまたはアンカー） / 背景クリックでキャンセル";
    } else {
        area.classList.remove('connecting-mode');
        info.textContent = "アンカーをクリックして接続 / ダブルクリックでメニュー";
    }

    // 4. ノード描画
    nodesEl.innerHTML = '';
    visibleNodes.forEach(node => {
        const el = document.createElement('div');
        el.id = node.id;
        el.className = `canvas-node type-${node.type || 'text'}`;
        if (node.locked) el.classList.add('locked');
        if (isConnecting) el.classList.add('show-anchors'); // 接続待機中は全アンカー表示

        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.style.width = node.w + 'px';
        el.style.height = node.h + 'px';

        if (node.color) el.style.backgroundColor = node.color;

        // ノード本体の操作イベント
        el.onmousedown = (e) => window.onNodeMouseDown(e, node.id);
        el.onclick = (e) => window.onNodeClick(e, node.id); // 接続確定用

        // --- ヘッダー ---
        const header = document.createElement('div');
        header.className = 'canvas-node-header';
        header.onmousedown = (e) => window.onNodeMouseDown(e, node.id);
        el.appendChild(header);

        // --- コンテンツ ---
        if (node.type === 'group') {
            const label = document.createElement('div');
            label.innerText = node.text || 'Group';
            label.style.position = 'absolute';
            label.style.top = '-22px';
            label.style.left = '0px';
            label.style.color = '#ccc';
            label.style.fontSize = '12px';
            label.style.fontWeight = 'bold';
            label.style.whiteSpace = 'nowrap';
            label.style.pointerEvents = 'none'; // クリック透過
            label.style.textShadow = '1px 1px 2px #000'; // 視認性向上
            el.appendChild(label);
        } else if (node.type === 'note') {
            const body = document.createElement('div');
            body.className = 'note-node-body';
            
            // ノートタイトルとリンクボタン
            const titleRow = document.createElement('div');
            titleRow.className = 'note-node-title-row';
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'note-node-title';
            titleSpan.textContent = `📄 ${node.title || 'Untitled'}`;
            
            const openBtn = document.createElement('button');
            openBtn.className = 'note-open-btn';
            openBtn.innerHTML = '🔗';
            openBtn.title = 'ノートを開く';
            openBtn.onclick = (e) => {
                e.stopPropagation(); // ドラッグ等を防ぐ
                window.loadNote(node.title || '');
            };

            titleRow.appendChild(titleSpan);
            titleRow.appendChild(openBtn);
            
            // プレビュー部分
            const preview = document.createElement('div');
            preview.className = 'note-node-preview';
            preview.textContent = (state.notes[node.title] || '').slice(0, 300); // 少し多めに取得してCSSで切る

            body.appendChild(titleRow);
            body.appendChild(preview);
            
            // ダブルクリックでも開けるように維持
            body.ondblclick = (e) => {
                e.stopPropagation();
                window.loadNote(node.title || '');
            };
            
            el.appendChild(body);
        } else if (node.type === 'media') {
            const body = document.createElement('div');
            body.className = 'media-node-body';
            const img = document.createElement('img');
            img.src = node.src || '';
            el.appendChild(body);
        } else {
            const text = document.createElement('textarea');
            text.value = node.text || '';
            text.oninput = (e) => { node.text = e.target.value; window.saveCanvasData(); };
            text.onmousedown = (e) => { 
                e.stopPropagation(); 
                if (state.connectSource) {
                     window.onNodeClick(e, node.id);
                }
            };
            text.addEventListener('paste', window.handlePaste);
            el.appendChild(text);
        }

        // --- リサイズハンドル ---
        if (!node.locked) {
            const resize = document.createElement('div');
            resize.className = 'resize-handle';
            resize.onmousedown = (e) => window.onResizeMouseDown(e, node.id);
            el.appendChild(resize);
        }

        // --- アンカー ---
        CANVAS_ANCHORS.forEach(anchor => {
            const a = document.createElement('div');
            a.className = `anchor-point anchor-${anchor}`;
            a.onclick = (e) => window.onAnchorClick(e, node.id, anchor);
            a.onmousedown = (e) => e.stopPropagation();
            el.appendChild(a);
        });

        el.oncontextmenu = (e) => window.showCanvasContextMenu(e, 'node', node.id);
        nodesEl.appendChild(el);
    });

    // 5. エッジ描画
    const defs = svgEl.querySelector('defs').outerHTML;
    svgEl.innerHTML = defs; 

    state.canvasData.edges.forEach(edge => {
        if (!visibleIds.has(edge.fromNode) && !visibleIds.has(edge.toNode)) return;
        const fromNode = state.canvasData.nodes.find(n => n.id === edge.fromNode);
        const toNode = state.canvasData.nodes.find(n => n.id === edge.toNode);
        if (fromNode && toNode) {
            window.drawEdge(svgEl, fromNode, toNode, edge);
        }
    });
};

window.drawEdge = function(svg, n1, n2, edge) {
    const start = getAnchorPosition(n1, edge.fromAnchor || 'center');
    const end = getAnchorPosition(n2, edge.toAnchor || 'center');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    const cx1 = start.x + (end.x - start.x) * 0.25;
    const cy1 = start.y + (end.y - start.y) * 0.1;
    const cx2 = start.x + (end.x - start.x) * 0.75;
    const cy2 = start.y + (end.y - start.y) * 0.9;
    
    path.setAttribute('d', `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`);
    path.setAttribute('class', 'canvas-edge');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        window.showCanvasContextMenu(e, 'edge', edge.id);
    };
    svg.appendChild(path);
};

// --- Interaction Handlers ---

window.onAnchorClick = function(e, nodeId, anchor) {
    e.stopPropagation();

    if (!state.connectSource) {
        state.connectSource = { nodeId, anchor };
        window.renderCanvas();
        return;
    }

    if (state.connectSource.nodeId === nodeId && state.connectSource.anchor === anchor) {
        state.connectSource = null; // キャンセル
        window.renderCanvas();
        return;
    }

    window.executeConnection(state.connectSource.nodeId, nodeId, state.connectSource.anchor, anchor);
};

window.onNodeClick = function(e, nodeId) {
    if (!state.connectSource) return;
    e.stopPropagation();

    if (state.connectSource.nodeId === nodeId) {
        state.connectSource = null;
        window.renderCanvas();
        return;
    }

    const targetNode = state.canvasData.nodes.find(n => n.id === nodeId);
    const sourceNode = state.canvasData.nodes.find(n => n.id === state.connectSource.nodeId);
    
    const srcPos = getAnchorPosition(sourceNode, state.connectSource.anchor);
    const bestAnchor = getNearestAnchor(targetNode, srcPos.x, srcPos.y, 9999) || 'center';

    window.executeConnection(state.connectSource.nodeId, nodeId, state.connectSource.anchor, bestAnchor);
};

window.onNodeMouseDown = function(e, nodeId) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (state.connectSource) return;

    if (state.canvasMode === 'pan') {
        state.actionState = 'drag_canvas';
        state.dragStart = { x: e.clientX, y: e.clientY };
        const { area } = getCanvasDomRefs();
        if (area) area.style.cursor = 'grabbing';
        return;
    }

    const node = state.canvasData.nodes.find(n => n.id === nodeId);
    if (node && node.locked) return;

    state.actionState = 'drag_node';
    state.activeSubjectId = nodeId;
    state.dragStart = { x: e.clientX, y: e.clientY };
};

window.onResizeMouseDown = function(e, nodeId) {
    e.stopPropagation();
    if (e.button !== 0) return;
    
    const node = state.canvasData.nodes.find(n => n.id === nodeId);
    if (node && node.locked) return;

    state.actionState = 'resize_node';
    state.activeSubjectId = nodeId;
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.resizeStart = { w: node.w, h: node.h };
};

window.handleCanvasMouseDown = function(e) {
    if (state.connectSource) {
        state.connectSource = null;
        window.renderCanvas();
        return;
    }

    state.actionState = 'drag_canvas';
    state.dragStart = { x: e.clientX, y: e.clientY };
    const { area } = getCanvasDomRefs();
    if (area) area.style.cursor = 'grabbing';
};

window.handleCanvasMouseMove = function(e) {
    if (!state.actionState) return;

    const { zoom } = state.canvasData;
    const dx = e.clientX - state.dragStart.x;
    const dy = e.clientY - state.dragStart.y;

    if (state.actionState === 'drag_node') {
        const node = state.canvasData.nodes.find(n => n.id === state.activeSubjectId);
        if (node) {
            node.x = snapToGrid(node.x + dx / zoom);
            node.y = snapToGrid(node.y + dy / zoom);
            state.dragStart = { x: e.clientX, y: e.clientY };
            window.renderCanvas();
        }
    } else if (state.actionState === 'resize_node') {
        const node = state.canvasData.nodes.find(n => n.id === state.activeSubjectId);
        if (node) {
            node.w = snapToGrid(Math.max(50, state.resizeStart.w + dx / zoom));
            node.h = snapToGrid(Math.max(30, state.resizeStart.h + dy / zoom));
            window.renderCanvas();
        }
    } else if (state.actionState === 'drag_canvas') {
        state.canvasData.x += dx;
        state.canvasData.y += dy;
        state.dragStart = { x: e.clientX, y: e.clientY };
        window.renderCanvas();
    }
};

window.handleCanvasMouseUp = function(e) {
    if (state.actionState) {
        window.saveCanvasData();
    }

    state.actionState = null;
    state.activeSubjectId = null;

    const { area } = getCanvasDomRefs();
    if (area) {
        if (state.canvasMode === 'pan') area.style.cursor = 'grab';
        else area.style.cursor = 'default';
    }
};

window.executeConnection = function(sourceId, targetId, fromAnchor, toAnchor) {
    const source = state.canvasData.nodes.find(n => n.id === sourceId);
    const target = state.canvasData.nodes.find(n => n.id === targetId);

    if (!source || !target) return;
    if (source.type !== target.type) {
        alert("異なる種類のノード（グループと付箋など）は接続できません。");
    } else {
        state.canvasData.edges.push({
            id: generateId(),
            fromNode: sourceId,
            toNode: targetId,
            fromAnchor,
            toAnchor
        });
        window.saveCanvasData();
    }

    state.connectSource = null;
    window.renderCanvas();
};

// --- Utilities & Menu ---

window.handleCanvasWheel = function(e) {
    e.preventDefault();
    const zoomSpeed = 0.05;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    window.zoomCanvas(delta);
};

window.zoomCanvas = function(delta) {
    let newZoom = state.canvasData.zoom + delta;
    newZoom = Math.min(Math.max(0.1, newZoom), 3);
    state.canvasData.zoom = newZoom;
    window.renderCanvas();
    window.saveCanvasData();
};

window.resetCanvas = function() {
    state.canvasData.x = 0;
    state.canvasData.y = 0;
    state.canvasData.zoom = 1;
    window.renderCanvas();
    window.saveCanvasData();
};

// ダブルクリックで作成メニューを開く
window.handleCanvasDblClick = function(e) {
    if (e.target.closest('.canvas-node')) return;

    // 座標計算
    const { area } = getCanvasDomRefs();
    if (!area) return;

    const rect = area.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - state.canvasData.x) / state.canvasData.zoom;
    const canvasY = (e.clientY - rect.top - state.canvasData.y) / state.canvasData.zoom;

    window.showCanvasCreationMenu(e.clientX, e.clientY, canvasX, canvasY);
};

// キャンバス作成メニュー表示
window.showCanvasCreationMenu = function(sx, sy, cx, cy) {
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    
    // 新規付箋
    window.addMenu(m, "🗒 新規付箋", () => {
        state.canvasData.nodes.push({ id: generateId(), type: 'text', x: cx, y: cy, w: 150, h: 80, text: "" });
        window.renderCanvas(); window.saveCanvasData();
    });

    // 既存ノート（window.openSwitcher呼び出し）
    window.addMenu(m, "📑 既存ノート", () => {
        window.openSwitcher((title) => {
             if(state.notes[title]) {
                 state.canvasData.nodes.push({ id: generateId(), type: 'note', title: title, x: cx, y: cy, w: 200, h: 120 });
                 window.renderCanvas(); 
                 window.saveCanvasData();
             } else {
                 alert("ノートが見つかりませんでした");
             }
        });
    });
    
    // 画像
    window.addMenu(m, "🖼 画像", () => {
        const src = prompt("画像のURLを入力してください:");
        if(src) {
             state.canvasData.nodes.push({ id: generateId(), type: 'media', src, x: cx, y: cy, w: 200, h: 150 });
             window.renderCanvas(); window.saveCanvasData();
        }
    });

    m.appendChild(document.createElement('hr'));
    window.addMenu(m, "❌ キャンセル", () => {}); // 閉じるだけ

    m.style.top = sy + 'px';
    m.style.left = sx + 'px';
    m.style.display = 'block';
};

window.addCanvasGroup = function() {
    const cx = (-state.canvasData.x + 100) / state.canvasData.zoom;
    const cy = (-state.canvasData.y + 100) / state.canvasData.zoom;
    state.canvasData.nodes.push({
        id: generateId(), type: 'group', x: cx, y: cy, w: 300, h: 200, text: "Group Name", color: window.CANVAS_COLORS[0]
    });
    window.renderCanvas();
    window.saveCanvasData();
};

window.toggleCanvasMode = function(mode) {
    state.canvasMode = mode === 'connect' ? 'edit' : mode;
    state.connectSource = null;
    window.updateCanvasModeUI();
    window.renderCanvas();
};

window.updateCanvasModeUI = function() {
    const { pointerBtn, panBtn, area } = getCanvasDomRefs();
    if (!area) return;

    [pointerBtn, panBtn].forEach(b => b && b.classList.remove('btn-active'));
    area.classList.remove('mode-pan');

    if (state.canvasMode === 'pan') {
        if(panBtn) panBtn.classList.add('btn-active');
        area.classList.add('mode-pan');
    } else {
        if(pointerBtn) pointerBtn.classList.add('btn-active');
    }
};

function appendCanvasPalette(menuEl, node, labelText) {
    const wrapper = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = labelText;
    const palette = document.createElement('div');
    palette.className = 'color-palette';

    window.CANVAS_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.onclick = (e) => {
            e.stopPropagation();
            if(node.locked) return alert("固定されています");
            node.color = color;
            window.renderCanvas();
            window.saveCanvasData();
            menuEl.style.display = 'none';
        };
        palette.appendChild(swatch);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(palette);
    menuEl.appendChild(wrapper);
}

window.showCanvasContextMenu = function(e, type, id) {
    e.preventDefault(); e.stopPropagation();
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    if (type === 'node') {
        const node = state.canvasData.nodes.find(n => n.id === id);
        
        const lockText = node.locked ? "🔓 固定解除" : "🔒 固定する";
        window.addMenu(m, lockText, () => {
            node.locked = !node.locked;
            window.renderCanvas();
            window.saveCanvasData();
        });

        m.appendChild(document.createElement('hr'));

        if(node.type === 'group') {
             window.addMenu(m, "✏️ グループ名変更", () => {
                 if(node.locked) return alert("固定されています");
                 const n = prompt("グループ名:", node.text);
                 if(n) { node.text = n; window.renderCanvas(); window.saveCanvasData(); }
             });
            appendCanvasPalette(m, node, "🎨 色変更:");
        } else if (node.type === 'text') {
            appendCanvasPalette(m, node, "🎨 背景色:");
        }
        
        m.appendChild(document.createElement('hr'));
        window.addMenu(m, "🗑 削除", () => {
            if(node.locked) return alert("固定されています");
            if(confirm("削除しますか？")) {
                state.canvasData.nodes = state.canvasData.nodes.filter(n => n.id !== id);
                state.canvasData.edges = state.canvasData.edges.filter(ed => ed.fromNode !== id && ed.toNode !== id);
                window.renderCanvas();
                window.saveCanvasData();
            }
        }, true);

    } else if (type === 'edge') {
        window.addMenu(m, "🗑 線を削除", () => {
            state.canvasData.edges = state.canvasData.edges.filter(ed => ed.id !== id);
            window.renderCanvas();
            window.saveCanvasData();
        }, true);
    }
    m.style.top = e.pageY + 'px';
    m.style.left = e.pageX + 'px';
    m.style.display = 'block';
}
