// @ts-nocheck
export function mountTetris(container, options = {}) {
  if (!container) throw new Error("mountTetris: container is required");

  const storageKey = options.storageKey || "tetris_best_score_v1";
  const autoStart = Boolean(options.autoStart);

  container.classList.add("tetris-widget");
  container.innerHTML = `
    <div class="layout">
      <div class="game-column">
        <canvas class="game-canvas" width="300" height="600" aria-label="Игровое поле"></canvas>
        <div class="overlay" role="status">
          <div>
            <h2 class="overlay-title">Пауза</h2>
            <p class="overlay-hint">Нажмите «Старт / Пауза» или Enter, чтобы продолжить</p>
          </div>
        </div>
      </div>
      <div class="side">
        <div class="panel">
          <h3>Следующая</h3>
          <canvas class="preview-canvas" width="120" height="120" aria-label="Предпросмотр фигуры"></canvas>
        </div>
        <div class="panel stats">
          <div class="stat"><span>Очки</span><strong data-role="score">0</strong></div>
          <div class="stat"><span>Уровень</span><strong data-role="level">1</strong></div>
          <div class="stat" style="grid-column: span 2;"><span>Линий</span><strong data-role="lines">0</strong></div>
        </div>
        <div class="panel">
          <div class="status-line" data-role="status">Нажмите «Старт» для начала</div>
          <p class="best" data-role="best">Рекорд: —</p>
        </div>
        <div class="panel">
          <div class="buttons-row">
            <button type="button" class="main-btn btn-start" data-action="toggle" title="Старт / Пауза" aria-label="Старт / Пауза">⏯</button>
            <button type="button" class="main-btn btn-reset" data-action="reset" title="Сброс" aria-label="Сброс">↺</button>
          </div>
          <div class="buttons-row" style="margin-top: 8px;">
            <button type="button" class="main-btn btn-reset" data-action="sound" title="Звук" aria-label="Звук">🔊</button>
          </div>
        </div>
      </div>
      <div class="panel panel-controls">
        <h3>Управление (тач)</h3>
        <div class="mobile-controls" data-role="touch">
          <button type="button" data-action="rotate">↻</button>
          <button type="button" data-action="hard">⤓</button>
          <button type="button" class="placeholder" tabindex="-1"></button>
          <button type="button" data-action="left">←</button>
          <button type="button" data-action="down">↓</button>
          <button type="button" data-action="right">→</button>
        </div>
      </div>
    </div>
  `;

  const COLS = 10;
  const ROWS = 20;
  const LINES_PER_LEVEL = 10;
  const COLORS = { I: "#00f0f0", O: "#f0f000", T: "#a000f0", L: "#f0a000", J: "#0000f0", S: "#00f000", Z: "#f00000" };

  const SHAPES = {
    I: [[[1, 0], [1, 1], [1, 2], [1, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[2, 0], [2, 1], [2, 2], [2, 3]], [[0, 1], [1, 1], [2, 1], [3, 1]]],
    O: [[[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0], [1, 1]]],
    T: [[[0, 1], [1, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [1, 2], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 1]]],
    L: [[[0, 2], [1, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [1, 2], [2, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]]],
    J: [[[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 1], [0, 2], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 1], [2, 0], [2, 1]]],
    S: [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 2], [1, 1], [1, 2], [2, 1]], [[1, 1], [1, 2], [2, 0], [2, 1]], [[0, 1], [1, 0], [1, 1], [2, 0]]],
    Z: [[[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]], [[1, 1], [1, 2], [2, 0], [2, 1]], [[0, 2], [1, 1], [1, 2], [2, 1]]],
  };
  const TYPES = Object.keys(SHAPES);
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-2, 0], [2, 0]];

  const canvas = container.querySelector(".game-canvas");
  const ctx = canvas.getContext("2d");
  const previewCanvas = container.querySelector(".preview-canvas");
  const pctx = previewCanvas.getContext("2d");
  const overlay = container.querySelector(".overlay");
  const overlayTitle = container.querySelector(".overlay-title");
  const overlayHint = container.querySelector(".overlay-hint");
  const scoreEl = container.querySelector('[data-role="score"]');
  const levelEl = container.querySelector('[data-role="level"]');
  const linesEl = container.querySelector('[data-role="lines"]');
  const bestEl = container.querySelector('[data-role="best"]');
  const statusEl = container.querySelector('[data-role="status"]');
  const btnToggle = container.querySelector('[data-action="toggle"]');
  const btnReset = container.querySelector('[data-action="reset"]');
  const btnSound = container.querySelector('[data-action="sound"]');
  const touchControls = container.querySelector('[data-role="touch"]');

  const CELL = canvas.width / COLS;
  const PCELL = 24;

  let board = [];
  let bag = [];
  let current = null;
  let nextType = null;
  let score = 0;
  let level = 1;
  let linesTotal = 0;
  let gameState = "idle";
  let dropAccumulator = 0;
  let lastTs = 0;
  let animatingClear = false;
  let clearRows = [];
  let clearFlashPhase = 0;
  let clearFlashUntil = 0;
  let rafId = 0;
  let destroyed = false;
  let soundEnabled = true;
  let audioCtx = null;

  const onScoreChange = typeof options.onScoreChange === "function" ? options.onScoreChange : null;
  const onGameOver = typeof options.onGameOver === "function" ? options.onGameOver : null;
  const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : null;

  function emitState() {
    if (onStateChange) onStateChange(gameState);
  }

  function ensureAudio() {
    if (!soundEnabled) return false;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return true;
  }

  function playTone(freq, duration, type, volume, attack) {
    if (!ensureAudio()) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume || 0.05), now + (attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const sfx = {
    move: () => playTone(280, 0.05, "square", 0.03, 0.005),
    rotate: () => playTone(420, 0.06, "triangle", 0.04, 0.004),
    softDrop: () => playTone(180, 0.04, "square", 0.025, 0.002),
    lock: () => playTone(130, 0.09, "sawtooth", 0.035, 0.003),
    hardDrop: () => { playTone(560, 0.04, "square", 0.05, 0.002); playTone(180, 0.1, "triangle", 0.03, 0.005); },
    clear: (rows) => {
      const notes = rows >= 4 ? [440, 554, 659, 880] : [392, 523, 659];
      for (let i = 0; i < notes.length; i++) setTimeout(() => playTone(notes[i], 0.08, "triangle", 0.045, 0.003), i * 45);
    },
    gameOver: () => {
      const notes = [392, 311, 247, 196];
      for (let i = 0; i < notes.length; i++) setTimeout(() => playTone(notes[i], 0.12, "sawtooth", 0.05, 0.005), i * 90);
    },
  };

  function loadBest() {
    const v = parseInt(localStorage.getItem(storageKey) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  }

  function saveBest(s) {
    const cur = loadBest();
    if (s > cur) {
      localStorage.setItem(storageKey, String(s));
      bestEl.textContent = "Рекорд: " + s;
    }
  }

  function refreshBestLabel() {
    bestEl.textContent = "Рекорд: " + loadBest();
  }

  function refillBag() {
    bag = TYPES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
  }

  function randomType() {
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  function emptyBoard() {
    board = [];
    for (let r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(null);
  }

  function getCells(piece) {
    return SHAPES[piece.type][piece.rot].map(([dr, dc]) => [piece.y + dr, piece.x + dc]);
  }

  function validPosition(piece) {
    const cells = getCells(piece);
    for (let i = 0; i < cells.length; i++) {
      const [r, c] = cells[i];
      if (c < 0 || c >= COLS || r >= ROWS) return false;
      if (r >= 0 && board[r][c]) return false;
    }
    return true;
  }

  function trySpawn(type) {
    const piece = { type, x: 3, y: 0, rot: 0 };
    return validPosition(piece) ? piece : null;
  }

  function mergePiece(piece) {
    const cells = getCells(piece);
    for (let i = 0; i < cells.length; i++) {
      const [r, c] = cells[i];
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = piece.type;
    }
  }

  function findFullRows() {
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      let full = true;
      for (let c = 0; c < COLS; c++) if (!board[r][c]) full = false;
      if (full) rows.push(r);
    }
    return rows;
  }

  function scoreForLines(n, lvl) {
    const table = { 1: 100, 2: 300, 3: 600, 4: 1000 };
    return (table[n] || 0) * lvl;
  }

  function removeRows(rows) {
    rows.sort((a, b) => a - b);
    for (let i = 0; i < rows.length; i++) board.splice(rows[i], 1);
    for (let i = 0; i < rows.length; i++) board.unshift(new Array(COLS).fill(null));
  }

  function ghostY(piece) {
    let g = { ...piece };
    while (true) {
      const next = { ...g, y: g.y + 1 };
      if (!validPosition(next)) break;
      g = next;
    }
    return g.y;
  }

  function drawBlock(context, x, y, w, h, color, alpha, ghost) {
    context.save();
    context.globalAlpha = alpha;
    const pad = 0.5;
    context.fillStyle = color;
    context.fillRect(x + pad, y + pad, w - 1, h - 1);
    if (ghost) {
      context.strokeStyle = "rgba(255,255,255,0.35)";
      context.lineWidth = 1;
      context.strokeRect(x + pad, y + pad, w - 1, h - 1);
    } else {
      context.strokeStyle = "rgba(0,0,0,0.5)";
      context.lineWidth = 1;
      context.strokeRect(x + pad, y + pad, w - 1, h - 1);
      const g = context.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(0.45, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.25)");
      context.fillStyle = g;
      context.fillRect(x + pad, y + pad, w - 1, h - 1);
    }
    context.restore();
  }

  function drawBoard(flashRows) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#010409";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const flashOn = flashRows && flashRows.length && clearFlashPhase % 2 === 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL;
        const y = r * CELL;
        ctx.strokeStyle = "rgba(48, 54, 61, 0.6)";
        ctx.strokeRect(x, y, CELL, CELL);
        const t = board[r][c];
        if (t) {
          let col = COLORS[t];
          if (flashRows && flashRows.includes(r)) col = flashOn ? "#ffffff" : COLORS[t];
          drawBlock(ctx, x, y, CELL, CELL, col, 1, false);
        }
      }
    }
    if (current && gameState === "playing" && !animatingClear) {
      const gy = ghostY(current);
      const ghostCells = getCells({ ...current, y: gy });
      for (let i = 0; i < ghostCells.length; i++) {
        const [r, c] = ghostCells[i];
        if (r < 0) continue;
        drawBlock(ctx, c * CELL, r * CELL, CELL, CELL, COLORS[current.type], 0.22, true);
      }
      const cells = getCells(current);
      for (let i = 0; i < cells.length; i++) {
        const [r, c] = cells[i];
        if (r < 0) continue;
        drawBlock(ctx, c * CELL, r * CELL, CELL, CELL, COLORS[current.type], 1, false);
      }
    }
  }

  function drawPreview() {
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    pctx.fillStyle = "#010409";
    pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!nextType) return;
    const cells = SHAPES[nextType][0];
    let minR = 99, maxR = -99, minC = 99, maxC = -99;
    for (let i = 0; i < cells.length; i++) {
      const [dr, dc] = cells[i];
      minR = Math.min(minR, dr); maxR = Math.max(maxR, dr); minC = Math.min(minC, dc); maxC = Math.max(maxC, dc);
    }
    const bw = maxC - minC + 1;
    const bh = maxR - minR + 1;
    const ox = (previewCanvas.width - bw * PCELL) / 2 - minC * PCELL;
    const oy = (previewCanvas.height - bh * PCELL) / 2 - minR * PCELL;
    for (let i = 0; i < cells.length; i++) {
      const [dr, dc] = cells[i];
      drawBlock(pctx, ox + dc * PCELL, oy + dr * PCELL, PCELL, PCELL, COLORS[nextType], 1, false);
    }
  }

  function updateHUD() {
    scoreEl.textContent = String(score);
    levelEl.textContent = String(level);
    linesEl.textContent = String(linesTotal);
    if (onScoreChange) onScoreChange(score, { level, lines: linesTotal });
  }

  function setStatus() {
    if (gameState === "idle") {
      statusEl.textContent = "Нажмите «Старт» для начала";
      statusEl.className = "status-line";
    } else if (gameState === "playing") {
      statusEl.textContent = "Игра активна";
      statusEl.className = "status-line";
    } else if (gameState === "pause") {
      statusEl.textContent = "Пауза";
      statusEl.className = "status-line pause";
    } else {
      statusEl.textContent = "Конец игры";
      statusEl.className = "status-line over";
    }
    emitState();
  }

  function syncOverlay() {
    if (gameState === "pause") {
      overlay.classList.add("visible");
      overlayTitle.textContent = "Пауза";
      overlayHint.textContent = "Продолжить: «Старт / Пауза» или Enter";
    } else if (gameState === "gameover") {
      overlay.classList.add("visible");
      overlayTitle.textContent = "Игра окончена";
      overlayHint.textContent = "«Сброс» для новой партии";
    } else {
      overlay.classList.remove("visible");
    }
  }

  function dropIntervalMs() {
    return Math.max(80, 800 - (Math.max(1, level) - 1) * 55);
  }

  function finishLockAfterClear() {
    const t = nextType;
    nextType = randomType();
    current = trySpawn(t);
    drawPreview();
    if (!current) {
      gameState = "gameover";
      sfx.gameOver();
      saveBest(score);
      refreshBestLabel();
      setStatus();
      syncOverlay();
      if (onGameOver) onGameOver(score, { level, lines: linesTotal });
    }
  }

  function lockAndSpawn() {
    mergePiece(current);
    sfx.lock();
    const full = findFullRows();
    if (full.length > 0) {
      animatingClear = true;
      clearRows = full;
      clearFlashPhase = 0;
      clearFlashUntil = performance.now() + 450;
      return;
    }
    finishLockAfterClear();
  }

  function applyLineClear() {
    const n = clearRows.length;
    sfx.clear(n);
    score += scoreForLines(n, level);
    linesTotal += n;
    level = Math.floor(linesTotal / LINES_PER_LEVEL) + 1;
    removeRows(clearRows);
    clearRows = [];
    animatingClear = false;
    updateHUD();
    finishLockAfterClear();
  }

  function move(dx, dy, fromUser) {
    if (gameState !== "playing" || !current || animatingClear) return;
    const np = { ...current, x: current.x + dx, y: current.y + dy };
    if (validPosition(np)) {
      current = np;
      if (dy > 0) score += 1;
      if (fromUser) dy > 0 ? sfx.softDrop() : sfx.move();
      updateHUD();
    }
  }

  function rotate() {
    if (gameState !== "playing" || !current || animatingClear) return;
    const newRot = (current.rot + 1) % 4;
    for (let i = 0; i < KICKS.length; i++) {
      const [kx, ky] = KICKS[i];
      const np = { ...current, x: current.x + kx, y: current.y + ky, rot: newRot };
      if (validPosition(np)) {
        current = np;
        sfx.rotate();
        return;
      }
    }
  }

  function hardDrop() {
    if (gameState !== "playing" || !current || animatingClear) return;
    let drops = 0;
    while (true) {
      const np = { ...current, y: current.y + 1 };
      if (!validPosition(np)) break;
      current = np;
      drops++;
    }
    sfx.hardDrop();
    score += drops * 2;
    updateHUD();
    lockAndSpawn();
  }

  function softDropFrame() {
    if (gameState !== "playing" || !current || animatingClear) return;
    move(0, 1, false);
    const np = { ...current, y: current.y + 1 };
    if (!validPosition(np)) lockAndSpawn();
  }

  function startGame() {
    emptyBoard();
    score = 0; level = 1; linesTotal = 0;
    dropAccumulator = 0;
    animatingClear = false;
    clearRows = [];
    refillBag();
    nextType = randomType();
    current = trySpawn(nextType);
    nextType = randomType();
    if (!current) {
      gameState = "gameover";
      setStatus();
      syncOverlay();
      drawBoard(null);
      drawPreview();
      return;
    }
    gameState = "playing";
    updateHUD();
    setStatus();
    syncOverlay();
    drawPreview();
  }

  function togglePause() {
    if (gameState === "playing") {
      gameState = "pause";
      playTone(240, 0.07, "triangle", 0.03, 0.005);
    } else if (gameState === "pause") {
      gameState = "playing";
      playTone(360, 0.07, "triangle", 0.03, 0.005);
      lastTs = performance.now();
    } else {
      startGame();
      playTone(440, 0.08, "triangle", 0.04, 0.005);
    }
    setStatus();
    syncOverlay();
  }

  function resetGame() {
    gameState = "idle";
    current = null;
    nextType = null;
    animatingClear = false;
    clearRows = [];
    score = 0; level = 1; linesTotal = 0;
    emptyBoard();
    updateHUD();
    setStatus();
    syncOverlay();
    drawBoard(null);
    drawPreview();
  }

  function setSound(enabled) {
    soundEnabled = Boolean(enabled);
    btnSound.textContent = soundEnabled ? "🔊" : "🔈";
    btnSound.setAttribute("aria-label", soundEnabled ? "Звук включен" : "Звук выключен");
    btnSound.setAttribute("title", soundEnabled ? "Звук включен" : "Звук выключен");
    if (soundEnabled) {
      ensureAudio();
      playTone(520, 0.06, "triangle", 0.04, 0.004);
    }
  }

  function keyHandler(e) {
    if (destroyed) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const k = e.key;
    if (k === "Enter" && gameState === "pause") {
      e.preventDefault();
      togglePause();
      return;
    }
    if (gameState !== "playing" || !current || animatingClear) {
      if (k === " " || k === "Spacebar") e.preventDefault();
      return;
    }
    if (k === "ArrowLeft") { e.preventDefault(); move(-1, 0, true); }
    else if (k === "ArrowRight") { e.preventDefault(); move(1, 0, true); }
    else if (k === "ArrowDown") { e.preventDefault(); move(0, 1, true); if (!validPosition({ ...current, y: current.y + 1 })) lockAndSpawn(); }
    else if (k === "ArrowUp") { e.preventDefault(); rotate(); }
    else if (k === " " || k === "Spacebar") { e.preventDefault(); hardDrop(); }
    drawBoard(animatingClear ? clearRows : null);
  }

  function loop(ts) {
    if (destroyed) return;
    rafId = requestAnimationFrame(loop);
    const dt = lastTs ? ts - lastTs : 0;
    lastTs = ts;
    if (animatingClear) {
      clearFlashPhase++;
      drawBoard(clearRows);
      if (ts >= clearFlashUntil) applyLineClear();
      return;
    }
    if (gameState === "playing" && current) {
      dropAccumulator += dt;
      const interval = dropIntervalMs();
      while (dropAccumulator >= interval) {
        dropAccumulator -= interval;
        softDropFrame();
        if (animatingClear || gameState !== "playing") break;
      }
    }
    drawBoard(null);
  }

  btnToggle.addEventListener("click", togglePause);
  btnReset.addEventListener("click", resetGame);
  btnSound.addEventListener("click", () => setSound(!soundEnabled));

  touchControls.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (gameState === "playing" && current && !animatingClear) {
      if (action === "left") move(-1, 0, true);
      else if (action === "right") move(1, 0, true);
      else if (action === "down") { move(0, 1, true); if (!validPosition({ ...current, y: current.y + 1 })) lockAndSpawn(); }
      else if (action === "rotate") rotate();
      else if (action === "hard") hardDrop();
      drawBoard(animatingClear ? clearRows : null);
    }
  });

  window.addEventListener("keydown", keyHandler);
  emptyBoard();
  refreshBestLabel();
  updateHUD();
  setStatus();
  drawBoard(null);
  drawPreview();
  rafId = requestAnimationFrame(loop);
  if (autoStart) togglePause();

  return {
    start: () => { if (gameState === "idle" || gameState === "gameover") togglePause(); },
    pause: () => { if (gameState === "playing") togglePause(); },
    resume: () => { if (gameState === "pause") togglePause(); },
    reset: resetGame,
    setSound,
    getState: () => ({ score, level, lines: linesTotal, gameState, soundEnabled }),
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", keyHandler);
      if (audioCtx && audioCtx.state !== "closed") audioCtx.close();
      container.innerHTML = "";
      container.classList.remove("tetris-widget");
    },
  };
}
