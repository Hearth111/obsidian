/* =========================================
   3. Canvas: Advanced Logic (Resize, Group, Connect, Delete, Modes)
   ========================================= */

const generateId = () => 'node-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

const CANVAS_ANCHORS = ['top', 'right', 'bottom', 'left'];
const CANVAS_NODE_HIT_PADDING = 24;

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

function findNodeAtPosition(x, y, padding = 0, excludeId = null) {
    return state.canvasData.nodes.find(n =>
        n.id !== excludeId &&
        x >= n.x - padding &&
        x <= n.x + n.w + padding &&
        y >= n.y - padding &&
        y <= n.y + n.h + padding
    );
}

function snapToGrid(value, grid = 20, tolerance = 4) {
    const mod = value % grid;
    if (mod <= tolerance) return value - mod;
    if (grid - mod <= tolerance) return value + (grid - mod);
    return value;
}

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
        state.canvasData.nodes.forEach(n => { if(!n.id) n.id = generateId(); });
    } catch(e) {
        console.error(e);
        state.canvasData = { nodes: [], edges: [], x: 0, y: 0, zoom: 1 };
    }
    state.canvasMode = 'edit';
    state.pendingConnectNodeId = null;
    window.updateCanvasModeUI();
    window.renderCanvas();
};

window.saveCanvasData = function() {
    state.notes[state.currentTitle] = CANVAS_MARKER + '\n' + JSON.stringify(state.canvasData);
    window.saveData();
};

window.renderCanvas = function() {
    const layer = document.getElementById('canvas-layer');
    const nodesEl = document.getElementById('canvas-nodes');
    const svgEl = document.getElementById('canvas-svg');
    const area = document.getElementById('canvas-area');

    if(!layer || !area) return;

    const { x, y, zoom } = state.canvasData;
    layer.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    area.style.backgroundPosition = `${x}px ${y}px`;
    area.style.backgroundSize = `${20 * zoom}px ${20 * zoom}px`;

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

    // モードに応じたUIカーソルの変更
    if (state.canvasMode === 'connect' || state.pendingConnectNodeId) {
        area.classList.add('connecting-mode');
        document.getElementById('canvas-info').textContent = state.pendingConnectNodeId
            ? "Click target node to connect"
            : "Click source node to start connection";
    } else {
        area.classList.remove('connecting-mode');
        document.getElementById('canvas-info').textContent = "アンカーをドラッグして接続 / ダブルクリックで付箋";
    }

    // 1. Render Nodes (virtualized)
    nodesEl.innerHTML = '';
    visibleNodes.forEach(node => {
        const el = document.createElement('div');
        el.id = node.id;
        el.className = `canvas-node type-${node.type || 'text'}`;
        if (node.locked) el.classList.add('locked'); // 固定スタイル用クラス

        el.style.left = node.x + 'px';
        el.style.top = node.y + 'px';
        el.style.width = node.w + 'px';
        el.style.height = node.h + 'px';

        if (node.type === 'text' && node.color) {
            el.style.backgroundColor = node.color;
        }
        
        if (node.type === 'group' && node.color) {
            el.style.backgroundColor = node.color;
        }

        // ドラッグ開始
        el.onmousedown = (e) => window.startDragNode(e, node.id);

        // --- ヘッダー（移動用ハンドル）を先に生成して上部に配置 ---
        const header = document.createElement('div');
        header.className = 'canvas-node-header';
        if (node.locked) {
            header.style.cursor = 'default';
            header.style.background = '#333'; // ロック時は色を少し暗くする等の視覚効果
            header.title = "固定されています";
        }
        header.onmousedown = (e) => window.startDragNode(e, node.id);
        el.appendChild(header);

        // --- コンテンツ（テキストエリア等） ---
        if (node.type === 'group') {
            const label = document.createElement('div');
            label.style.padding = '5px';
            label.style.fontWeight = 'bold';
            label.innerText = node.text || 'Group';
            el.appendChild(label);
        } else if (node.type === 'note') {
            const body = document.createElement('div');
            body.className = 'note-node-body';
            body.innerHTML = `<div class="note-node-title">📄 ${window.escapeHTML(node.title || 'Untitled')}</div><div class="note-node-preview">${window.escapeHTML((state.notes[node.title] || '').slice(0,80))}</div>`;
            body.ondblclick = () => window.loadNote(node.title || '');
            el.appendChild(body);
        } else if (node.type === 'media') {
            const body = document.createElement('div');
            body.className = 'media-node-body';
            const img = document.createElement('img');
            img.src = node.src || '';
            img.alt = node.title || 'media';
            body.appendChild(img);
            el.appendChild(body);
        } else {
            const text = document.createElement('textarea');
            text.value = node.text || '';
            text.oninput = (e) => { node.text = e.target.value; window.saveCanvasData(); };
            
            // テキストエリアのクリック処理
            text.onmousedown = (e) => { 
                e.stopPropagation(); 
                text.focus();
                // 接続モードまたは待機中なら、テキストエリアクリックでも接続処理を開始させる
                if(state.canvasMode === 'connect' || state.pendingConnectNodeId) {
                    window.startDragNode(e, node.id); 
                }
            };
            text.onmouseup = (e) => e.stopPropagation(); // リレンダリング防止
            
            // ★追加: キャンバスのテキストエリアでも画像を貼り付け可能にする
            text.addEventListener('paste', window.handlePaste);

            el.appendChild(text);
        }

        // --- リサイズハンドル（固定時は追加しない） ---
        if (!node.locked) {
            const resize = document.createElement('div');
            resize.className = 'resize-handle';
            resize.onmousedown = (e) => window.startResizeNode(e, node.id);
            el.appendChild(resize);
        }

        // 接続アンカー
        CANVAS_ANCHORS.forEach(anchor => {
            const a = document.createElement('div');
            a.className = `anchor-point anchor-${anchor}`;
            a.dataset.anchor = anchor;
            a.onmousedown = (e) => window.startAnchorDrag(e, node.id, anchor);
            el.appendChild(a);
        });

        el.oncontextmenu = (e) => window.showCanvasContextMenu(e, 'node', node.id);
        nodesEl.appendChild(el);
    });

    // 2. Render Edges (SVG)
    const defs = svgEl.querySelector('defs').outerHTML;
    svgEl.innerHTML = defs; 

    state.canvasData.edges.forEach(edge => {
        if (!visibleIds.has(edge.fromNode) && !visibleIds.has(edge.toNode)) return;
        const fromNode = state.canvasData.nodes.find(n => n.id === edge.fromNode);
        const toNode = state.canvasData.nodes.find(n => n.id === edge.toNode);
        if (fromNode && toNode) {
            window.drawEdge(svgEl, fromNode, toNode, edge.id);
        }
    });

    if (state.isConnecting && state.tempLine) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const { x1, y1, x2, y2 } = state.tempLine;
        const cx1 = x1 + (x2 - x1) * 0.25;
        const cy1 = y1 + (y2 - y1) * 0.1;
        const cx2 = x1 + (x2 - x1) * 0.75;
        const cy2 = y1 + (y2 - y1) * 0.9;
        path.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`);
        path.setAttribute('class', 'canvas-edge temp');
        path.setAttribute('marker-end', 'url(#arrowhead)');
        svgEl.appendChild(path);
    }
};

window.drawEdge = function(svg, n1, n2, edgeId) {
    const start = getAnchorPosition(n1, edge.fromAnchor);
    const end = getAnchorPosition(n2, edge.toAnchor);

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
        window.showCanvasContextMenu(e, 'edge', edgeId);
    };
    svg.appendChild(path);
};

window.startAnchorDrag = function(e, nodeId, anchor) {
    e.stopPropagation();
    state.isConnecting = true;
    state.dragNodeId = nodeId;
    state.connectStart = { nodeId, anchor };
    const node = state.canvasData.nodes.find(n => n.id === nodeId);
    const start = getAnchorPosition(node, anchor);
    state.tempLine = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
};

window.startDragNode = function(e, id) {
    e.stopPropagation();

    // --- ノード（接続）モードの処理 ---
    if (state.canvasMode === 'connect') {
        if (!state.pendingConnectNodeId) {
            // 1つ目のノード選択
            state.pendingConnectNodeId = id;
            window.renderCanvas();
        } else {
            // 2つ目のノード選択（接続実行）
            if (state.pendingConnectNodeId !== id) {
                 window.tryConnectNodes(state.pendingConnectNodeId, id, 'center', 'center');
                 // 連続接続のため、pendingをクリア（または次の始点にする場合は id をセットするが、今回はクリア）
                 state.pendingConnectNodeId = null; 
                 window.renderCanvas();
                 window.saveCanvasData();
            }
        }
        return; // ドラッグ移動はしない
    }

    // 既存の接続待機処理（Shift+Clickやメニューからの接続）
    if (state.pendingConnectNodeId) {
        if (state.pendingConnectNodeId !== id) {
             window.tryConnectNodes(state.pendingConnectNodeId, id, 'center', 'center');
             state.pendingConnectNodeId = null;
             window.renderCanvas();
             window.saveCanvasData();
        }
        return;
    }
    
    // Pan Mode
    if (state.canvasMode === 'pan') {
        state.isDraggingCanvas = true;
        state.dragStart = { x: e.clientX, y: e.clientY };
        document.getElementById('canvas-area').style.cursor = 'grabbing';
        return;
    }

    // Shift+Dragでの接続
    if (e.shiftKey) {
        state.isConnecting = true;
        state.dragNodeId = id;
        const n = state.canvasData.nodes.find(node => node.id === id);
        const startX = n.x + n.w / 2;
        const startY = n.y + n.h / 2;
        state.tempLine = { x1: startX, y1: startY, x2: startX, y2: startY };
        return;
    }

    // --- 通常の移動（固定確認） ---
    const node = state.canvasData.nodes.find(n => n.id === id);
    if (node && node.locked) return; // 固定時は移動不可

    state.isDraggingNode = true;
    state.dragNodeId = id;
    state.dragStart = { x: e.clientX, y: e.clientY };
};

// 接続のバリデーションと実行を行うヘルパー関数
window.tryConnectNodes = function(sourceId, targetId, fromAnchor = 'center', toAnchor = 'center') {
    const source = state.canvasData.nodes.find(n => n.id === sourceId);
    const target = state.canvasData.nodes.find(n => n.id === targetId);
    
    if (!source || !target) return;

    // 異なるタイプ同士の接続を禁止（グループ⇔付箋 はNG）
    if (source.type !== target.type) {
        alert("異なる種類のノード（グループと付箋など）は接続できません。");
        return;
    }

    state.canvasData.edges.push({
        id: generateId(),
        fromNode: sourceId,
        toNode: targetId,
        fromAnchor,
        toAnchor
    });
};

window.startResizeNode = function(e, id) {
    e.stopPropagation();
    const node = state.canvasData.nodes.find(n => n.id === id);
    if (node && node.locked) return; // 固定時はリサイズ不可

    state.isResizing = true;
    state.dragNodeId = id;
    state.dragStart = { x: e.clientX, y: e.clientY };
    state.resizeStart = { w: node.w, h: node.h };
};

window.handleCanvasMouseDown = function(e) {
    // 接続待機中に余白をクリック -> キャンセル
    if (state.pendingConnectNodeId) {
        state.pendingConnectNodeId = null;
        window.renderCanvas();
        return;
    }

    if (!state.isDraggingNode && !state.isResizing && !state.isConnecting) {
        state.isDraggingCanvas = true;
        state.dragStart = { x: e.clientX, y: e.clientY };
        document.getElementById('canvas-area').style.cursor = 'grabbing';
    }
};

window.handleCanvasMouseMove = function(e) {
    const { zoom } = state.canvasData;
    if (state.isDraggingNode) {
        const dx = (e.clientX - state.dragStart.x) / zoom;
        const dy = (e.clientY - state.dragStart.y) / zoom;
        const node = state.canvasData.nodes.find(n => n.id === state.dragNodeId);
        if (node && !node.locked) {
            node.x = snapToGrid(node.x + dx);
            node.y = snapToGrid(node.y + dy);
            state.dragStart = { x: e.clientX, y: e.clientY };
            window.renderCanvas();
        }
    } else if (state.isResizing) {
        const dx = (e.clientX - state.dragStart.x) / zoom;
        const dy = (e.clientY - state.dragStart.y) / zoom;
        const node = state.canvasData.nodes.find(n => n.id === state.dragNodeId);
        if (node && !node.locked) {
            node.w = snapToGrid(Math.max(50, state.resizeStart.w + dx));
            node.h = snapToGrid(Math.max(30, state.resizeStart.h + dy));
            window.renderCanvas();
        }
    } else if (state.isConnecting) {
        const rect = document.getElementById('canvas-area').getBoundingClientRect();
        const mx = (e.clientX - rect.left - state.canvasData.x) / zoom;
        const my = (e.clientY - rect.top - state.canvasData.y) / zoom;
        const target = findNodeAtPosition(mx, my, CANVAS_NODE_HIT_PADDING, state.dragNodeId);
        if (target) {
            const anchor = getNearestAnchor(target, mx, my, 32) || 'center';
            const pos = getAnchorPosition(target, anchor);
            state.tempLine.x2 = pos.x;
            state.tempLine.y2 = pos.y;
            state.tempLine.toAnchor = anchor;
        } else {
            state.tempLine.x2 = mx;
            state.tempLine.y2 = my;
            state.tempLine.toAnchor = null;
        }
        window.renderCanvas();
    } else if (state.isDraggingCanvas) {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        state.canvasData.x += dx;
        state.canvasData.y += dy;
        state.dragStart = { x: e.clientX, y: e.clientY };
        window.renderCanvas();
    }
};

window.handleCanvasMouseUp = function(e) {
    // 接続完了処理（Shiftドラッグ・アンカードラッグ共通）
    if (state.isConnecting) {
        const rect = document.getElementById('canvas-area').getBoundingClientRect();
        const mx = (e.clientX - rect.left - state.canvasData.x) / state.canvasData.zoom;
        const my = (e.clientY - rect.top - state.canvasData.y) / state.canvasData.zoom;
        const target = findNodeAtPosition(mx, my, CANVAS_NODE_HIT_PADDING + 6, state.dragNodeId);
        if (target) {
            const anchor = getNearestAnchor(target, mx, my, 32) || 'center';
            window.tryConnectNodes(
                state.connectStart?.nodeId || state.dragNodeId,
                target.id,
                state.connectStart?.anchor || 'center',
                anchor
            );
        } else if (state.connectStart) {
            window.showConnectionCreateMenu(e.clientX, e.clientY, mx, my, state.connectStart);
        }
    }

    if (state.isDraggingNode || state.isDraggingCanvas || state.isResizing || state.isConnecting) {
        window.saveCanvasData();
    }

    state.isDraggingCanvas = false;
    state.isDraggingNode = false;
    state.isResizing = false;
    state.isConnecting = false;
    state.dragNodeId = null;
    state.tempLine = null;
    state.connectStart = null;
    
    // カーソルリセット
    const area = document.getElementById('canvas-area');
    if (state.canvasMode === 'pan') area.style.cursor = 'grab';
    else if (state.canvasMode === 'connect') area.style.cursor = 'crosshair';
    else area.style.cursor = 'default';
    
    window.renderCanvas();
};

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

window.handleCanvasDblClick = function(e) {
    if (e.target.closest('.canvas-node')) return;
    const area = document.getElementById('canvas-area');
    const rect = area.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.canvasData.x) / state.canvasData.zoom;
    const y = (e.clientY - rect.top - state.canvasData.y) / state.canvasData.zoom;
    
    state.canvasData.nodes.push({
        id: generateId(), type: 'text', x: x - 75, y: y - 40, w: 150, h: 80, text: ""
    });
    window.renderCanvas();
    window.saveCanvasData();
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
    state.pendingConnectNodeId = null; // モード切替時は待機状態を解除
    window.updateCanvasModeUI();
    window.renderCanvas();
};

window.updateCanvasModeUI = function() {
    const ptr = document.getElementById('cv-mode-pointer');
    const pan = document.getElementById('cv-mode-pan');
    const area = document.getElementById('canvas-area');

    // 全ボタンの非アクティブ化
    [ptr, pan].forEach(b => b && b.classList.remove('btn-active'));
    area.classList.remove('mode-pan');

    if (state.canvasMode === 'pan') {
        if(pan) pan.classList.add('btn-active');
        area.classList.add('mode-pan');
    } else {
        if(ptr) ptr.classList.add('btn-active');
    }
};

window.showCanvasContextMenu = function(e, type, id) {
    e.preventDefault(); e.stopPropagation();
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    if (type === 'node') {
        const node = state.canvasData.nodes.find(n => n.id === id);
        
        // 固定トグル
        const lockText = node.locked ? "🔓 固定解除" : "🔒 固定する";
        window.addMenu(m, lockText, () => {
            node.locked = !node.locked;
            window.renderCanvas();
            window.saveCanvasData();
        });

        m.appendChild(document.createElement('hr'));

        // Group options
        if(node.type === 'group') {
             window.addMenu(m, "✏️ グループ名変更", () => {
                 if(node.locked) return alert("固定されています");
                 const n = prompt("グループ名:", node.text);
                 if(n) { node.text = n; window.renderCanvas(); window.saveCanvasData(); }
             });
             const p = document.createElement('div');
             p.className = 'color-palette';
             window.CANVAS_COLORS.forEach(c => {
                 const s = document.createElement('div');
                 s.className = 'color-swatch';
                 s.style.backgroundColor = c;
                 s.onclick = (e) => {
                     e.stopPropagation();
                     if(node.locked) return alert("固定されています");
                     node.color = c;
                     window.renderCanvas();
                     window.saveCanvasData();
                     m.style.display = 'none';
                 };
                 p.appendChild(s);
             });
            m.appendChild(document.createElement('div').appendChild(document.createTextNode("🎨 色変更:")));
            m.appendChild(p);
        } else if (node.type === 'text') {
             const p = document.createElement('div');
             p.className = 'color-palette';
             window.CANVAS_COLORS.forEach(c => {
                 const s = document.createElement('div');
                 s.className = 'color-swatch';
                 s.style.backgroundColor = c;
                 s.onclick = (e) => {
                     e.stopPropagation();
                     if(node.locked) return alert("固定されています");
                     node.color = c;
                     window.renderCanvas();
                     window.saveCanvasData();
                     m.style.display = 'none';
                 };
                 p.appendChild(s);
             });
             m.appendChild(document.createElement('div').appendChild(document.createTextNode("🎨 背景色:")));
             m.appendChild(p);
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

window.showConnectionCreateMenu = function(screenX, screenY, canvasX, canvasY, startInfo) {
    const m = document.getElementById('context-menu');
    m.innerHTML = "";
    const createAndConnect = (type) => {
        let node;
        if (type === 'note') {
            const title = prompt('ノート名を入力してください');
            if (!title) return;
            if (!state.notes[title]) state.notes[title] = '';
            node = { id: generateId(), type: 'note', title, x: canvasX - 75, y: canvasY - 40, w: 180, h: 100 };
        } else if (type === 'media') {
            const src = prompt('画像/メディアのURLを入力してください');
            if (!src) return;
            node = { id: generateId(), type: 'media', src, title: 'media', x: canvasX - 90, y: canvasY - 60, w: 180, h: 120 };
        } else {
            node = { id: generateId(), type: 'text', text: '', x: canvasX - 75, y: canvasY - 40, w: 150, h: 80 };
        }
        state.canvasData.nodes.push(node);
        const anchor = getNearestAnchor(node, canvasX, canvasY, 100) || 'center';
        window.tryConnectNodes(startInfo?.nodeId, node.id, startInfo?.anchor || 'center', anchor);
        window.renderCanvas();
        window.saveCanvasData();
        m.style.display = 'none';
    };

    window.addMenu(m, '🗒 新規付箋', () => createAndConnect('text'));
    window.addMenu(m, '📄 ノートを置く', () => createAndConnect('note'));
    window.addMenu(m, '🖼 メディアを置く', () => createAndConnect('media'));
    m.style.top = screenY + 'px';
    m.style.left = screenX + 'px';
    m.style.display = 'block';
};