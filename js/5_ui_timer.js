/* =========================================
   5d. UI: Timer Menus & Pane Controls
   ========================================= */

// --- Timer Quick Menu ---
window.showTimerQuickMenu = function(anchor = document.getElementById('timer-display')) {
    const menu = document.getElementById('timer-menu');
    if (!menu || !anchor) return;

    const modes = [
        { id: 'pomodoro', label: '🍅 ポモドーロ', meta: `${Math.round(state.pomodoroSeconds / 60)}分` },
        { id: 'stopwatch', label: '⏱️ ストップウォッチ', meta: '経過時間を測定' },
        { id: 'countdown', label: '⏳ カウントダウン', meta: `${Math.round(state.countdownSeconds / 60)}分` },
        { id: 'clock', label: '🕒 時計', meta: '現在時刻を表示' }
    ];

    menu.innerHTML = '';
    modes.forEach((m) => {
        const item = document.createElement('div');
        item.className = 'timer-menu-item';
        item.innerHTML = `<span>${m.label}</span><span class="timer-menu-meta">${m.meta}</span>`;
        item.onclick = (e) => {
            e.stopPropagation();
            window.openTimerPane(m.id);
            window.hideTimerMenu();
        };
        menu.appendChild(item);
    });

    menu.style.display = 'block';
    const rect = anchor.getBoundingClientRect();
    const preferredLeft = rect.right - menu.offsetWidth;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.max(12, preferredLeft)}px`;
};

window.hideTimerMenu = function() {
    const menu = document.getElementById('timer-menu');
    if (menu) menu.style.display = 'none';
};

// --- Timer Pane & Controls ---
window.formatTimerTime = function(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds || 0));
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

window.updateTimerUI = function() {
    const icons = { pomodoro: '🍅', stopwatch: '⏱️', countdown: '⏳', clock: '🕒' };
    const labels = { pomodoro: 'ポモドーロ', stopwatch: 'ストップウォッチ', countdown: 'カウントダウン', clock: '時計' };

    const now = new Date();
    const clockText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const timerValue = state.timerMode === 'clock' ? clockText : window.formatTimerTime(state.timerTime);
    const statusIcon = icons[state.timerMode] || '⏲️';

    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.textContent = `${statusIcon} ${timerValue}`;

    const paneDisplay = document.getElementById('timer-pane-display');
    if (paneDisplay) paneDisplay.textContent = timerValue;

    const subline = document.getElementById('timer-pane-subline');
    if (subline) {
        const runningText = state.timerMode === 'clock' ? '現在時刻' : (state.isTimerRunning ? '計測中' : '待機中');
        subline.textContent = `${labels[state.timerMode] || 'タイマー'} / ${runningText}`;
    }

    const hint = document.getElementById('timer-pane-hint');
    if (hint) hint.textContent = 'クイックメニューまたは上部ボタンでモードを切替できます';

    const startBtn = document.getElementById('timer-btn-start');
    if (startBtn) {
        startBtn.disabled = state.isTimerRunning || state.timerMode === 'clock';
        startBtn.textContent = state.timerMode === 'clock' ? '▶️ 自動更新' : (state.isTimerRunning ? '▶️ 計測中' : '▶️ スタート');
    }

    const pauseBtn = document.getElementById('timer-btn-pause');
    if (pauseBtn) {
        pauseBtn.disabled = state.timerMode === 'clock' || !state.isTimerRunning;
    }

    const resetBtn = document.getElementById('timer-btn-reset');
    if (resetBtn) {
        resetBtn.disabled = state.timerMode === 'clock';
    }

    const pomoInput = document.getElementById('timer-input-pomodoro');
    if (pomoInput) pomoInput.value = Math.max(1, Math.round(state.pomodoroSeconds / 60));

    const cdInput = document.getElementById('timer-input-countdown');
    if (cdInput) cdInput.value = Math.max(1, Math.round(state.countdownSeconds / 60));

    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.timerMode);
    });
};

window.restartTimerInterval = function() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    const needsTick = state.isTimerRunning || state.timerMode === 'clock';
    if (needsTick) state.timerInterval = setInterval(window.tickTimer, 1000);
};

window.tickTimer = function() {
    const now = Date.now();
    const delta = state.timerLastTick ? Math.max(1, Math.floor((now - state.timerLastTick) / 1000)) : 1;
    state.timerLastTick = now;

    if (state.timerMode === 'clock') {
        window.updateTimerUI();
        return;
    }
    if (!state.isTimerRunning) return;

    if (state.timerMode === 'pomodoro' || state.timerMode === 'countdown') {
        state.timerTime = Math.max(0, (state.timerTime || 0) - delta);
        if (state.timerTime === 0) {
            state.isTimerRunning = false;
            state.timerLastTick = null;
            window.restartTimerInterval();
        }
    } else if (state.timerMode === 'stopwatch') {
        state.timerTime = (state.timerTime || 0) + delta;
        state.stopwatchSeconds = state.timerTime;
    }

    window.updateTimerUI();
};

window.startTimer = function() {
    state.isTimerRunning = true;
    state.timerLastTick = Date.now();
    window.restartTimerInterval();
    window.updateTimerUI();
};

window.pauseTimer = function() {
    if (state.timerMode === 'clock') return;
    state.isTimerRunning = false;
    state.timerLastTick = null;
    window.restartTimerInterval();
    window.updateTimerUI();
};

window.resetTimer = function() {
    if (state.timerMode === 'pomodoro') {
        state.timerTime = state.pomodoroSeconds || 25 * 60;
    } else if (state.timerMode === 'countdown') {
        state.timerTime = state.countdownSeconds || 10 * 60;
    } else if (state.timerMode === 'stopwatch') {
        state.timerTime = 0;
        state.stopwatchSeconds = 0;
    }
    state.isTimerRunning = state.timerMode === 'clock';
    state.timerLastTick = null;
    window.restartTimerInterval();
    window.updateTimerUI();
};

window.updateTimerDuration = function(mode, value) {
    const minutes = Math.max(1, parseInt(value, 10) || 0);
    const seconds = minutes * 60;
    if (mode === 'pomodoro') {
        state.pomodoroSeconds = seconds;
        if (state.timerMode === 'pomodoro' && !state.isTimerRunning) state.timerTime = seconds;
    } else if (mode === 'countdown') {
        state.countdownSeconds = seconds;
        if (state.timerMode === 'countdown' && !state.isTimerRunning) state.timerTime = seconds;
    }
    window.updateTimerUI();
};

window.setTimerMode = function(mode) {
    if (!['pomodoro', 'stopwatch', 'countdown', 'clock'].includes(mode)) return;

    if (state.timerMode === 'stopwatch') state.stopwatchSeconds = state.timerTime;

    state.timerMode = mode;
    state.timerLastTick = null;
    state.isTimerRunning = mode === 'clock' ? true : false;

    if (mode === 'pomodoro') state.timerTime = state.pomodoroSeconds || 25 * 60;
    if (mode === 'countdown') state.timerTime = state.countdownSeconds || 10 * 60;
    if (mode === 'stopwatch') state.timerTime = state.stopwatchSeconds || 0;
    if (mode === 'clock') state.timerTime = 0;

    window.restartTimerInterval();
    window.updateTimerUI();
};

window.findTimerPaneIndex = function() {
    return state.panes.findIndex(p => p.type === 'timer');
};

window.openTimerPane = function(mode = null) {
    if (mode) window.setTimerMode(mode);
    const existing = window.findTimerPaneIndex();
    if (existing !== -1) {
        window.setActivePane(existing);
        window.bringPaneToFront(existing);
        window.renderPanes();
        return;
    }
    if (state.panes.length >= MAX_PANES) {
        alert(`最大${MAX_PANES}画面までです`);
        return;
    }
    const newPane = { id: state.panes.length, title: 'タイマー', type: 'timer', isPrivacy: false };
    state.panes.push(newPane);
    state.paneSizes.push(1);
    state.paneLayouts.push(window.createPaneLayout(state.panes.length - 1));
    state.activePaneIndex = state.panes.length - 1;
    window.persistPaneSizes();
    window.persistPaneLayouts();
    window.renderPanes();
};

window.toggleTimer = function(mode = null) {
    window.openTimerPane(mode);
};
