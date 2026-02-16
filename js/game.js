/*  ===========================================================
    Whack-a-Mole — Game Engine (Plastic Toy + Mjölnir Edition)
    Browser-based  ·  Zero Dependencies
    =========================================================== */

(() => {
  'use strict';

  // ---- Configuration -------------------------------------------
  const HOLE_COUNT    = 9;       // 3×3 grid
  const ROUND_TIME    = 30;      // seconds per round
  const MOLE_BASE_MS  = 1200;    // base time a mole stays visible (ms)
  const MOLE_MIN_MS   = 400;     // minimum mole visible time
  const SPAWN_BASE_MS = 900;     // base delay between spawns (ms)
  const SPAWN_MIN_MS  = 350;     // minimum spawn delay
  const HIT_SCORE     = 10;
  const MISS_PENALTY  = 5;
  const GOLD_SCORE    = 25;
  const GOLD_CHANCE   = 0.12;    // 12% chance of golden mole
  const COMBO_WINDOW  = 1500;    // ms to keep combo alive

  // ---- DOM References ------------------------------------------
  const boardEl   = document.getElementById('board');
  const overlayEl = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMsg   = document.getElementById('overlayMsg');
  const scoreEl   = document.getElementById('score');
  const highEl    = document.getElementById('highScore');
  const timerEl   = document.getElementById('timer');
  const comboEl   = document.getElementById('combo');
  const statusEl  = document.getElementById('statusMsg');

  const btnStart  = document.getElementById('btnStart');
  const btnPause  = document.getElementById('btnPause');
  const btnReset  = document.getElementById('btnReset');

  // ---- Game State ----------------------------------------------
  let score, highScore, combo, lastHitTime;
  let timeLeft, timerInterval;
  let spawnTimeout, activeMoles;
  let running, paused;
  let holes = [];  // { el, moleEl, active, gold, timeout }

  // ---- Hammer cursor active class ------------------------------
  function flashHammer() {
    document.body.classList.add('hammer-active');
    setTimeout(() => document.body.classList.remove('hammer-active'), 120);
  }

  // ---- Initialisation ------------------------------------------
  function init() {
    highScore = parseInt(localStorage.getItem('wam_high') || '0', 10);
    highEl.textContent = highScore;
    buildBoard();
    resetGame();
    showOverlay('🔨 WHACK-A-MOLE', 'Press <b>START</b> to play!');
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    holes = [];
    for (let i = 0; i < HOLE_COUNT; i++) {
      const holeEl = document.createElement('div');
      holeEl.className = 'hole';
      holeEl.dataset.index = i;

      const moleEl = document.createElement('div');
      moleEl.className = 'mole';
      moleEl.innerHTML = `
        <div class="mole-body">
          <div class="mole-head">
            <div class="mole-eyes">
              <div class="mole-eye"></div>
              <div class="mole-eye"></div>
            </div>
            <div class="mole-nose"></div>
            <div class="mole-mouth"></div>
          </div>
        </div>`;

      holeEl.appendChild(moleEl);
      boardEl.appendChild(holeEl);

      const hole = { el: holeEl, moleEl, active: false, gold: false, timeout: null };
      holes.push(hole);

      // Click handler
      holeEl.addEventListener('click', () => onHoleClick(hole));
    }
  }

  function resetGame() {
    score    = 0;
    combo    = 0;
    lastHitTime = 0;
    timeLeft = ROUND_TIME;
    running  = false;
    paused   = false;
    activeMoles = 0;
    clearAllMoles();
    clearInterval(timerInterval);
    clearTimeout(spawnTimeout);
    updateUI();
    btnPause.disabled = true;
    btnPause.textContent = '⏸ PAUSE';
    statusEl.textContent = 'Ready';
  }

  // ---- Game Flow ------------------------------------------------
  function startGame() {
    resetGame();
    running = true;
    hideOverlay();
    btnPause.disabled = false;
    statusEl.textContent = 'Game running...';
    timerInterval = setInterval(tick, 1000);
    scheduleSpawn();
  }

  function tick() {
    if (paused) return;
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 0) endGame();
  }

  function endGame() {
    running = false;
    clearInterval(timerInterval);
    clearTimeout(spawnTimeout);
    clearAllMoles();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('wam_high', highScore);
      highEl.textContent = highScore;
    }
    btnPause.disabled = true;
    statusEl.textContent = 'Game over';
    showOverlay('⏱ TIME\'S UP!', `Final score: <b>${score}</b><br>Press <b>START</b> to play again`);
  }

  function togglePause() {
    if (!running) return;
    paused = !paused;
    if (paused) {
      clearTimeout(spawnTimeout);
      statusEl.textContent = 'Paused';
      btnPause.textContent = '▶ RESUME';
      showOverlay('⏸ PAUSED', 'Click <b>RESUME</b> to continue');
    } else {
      hideOverlay();
      statusEl.textContent = 'Game running...';
      btnPause.textContent = '⏸ PAUSE';
      scheduleSpawn();
    }
  }

  // ---- Mole Logic -----------------------------------------------
  function scheduleSpawn() {
    if (!running || paused) return;
    const progress = 1 - timeLeft / ROUND_TIME;  // 0→1
    const delay = Math.max(SPAWN_MIN_MS, SPAWN_BASE_MS - progress * 500);
    spawnTimeout = setTimeout(() => {
      spawnMole();
      scheduleSpawn();
    }, delay + Math.random() * 300);
  }

  function spawnMole() {
    // pick a random inactive hole
    const inactive = holes.filter(h => !h.active);
    if (inactive.length === 0) return;
    const hole = inactive[Math.floor(Math.random() * inactive.length)];

    hole.gold   = Math.random() < GOLD_CHANCE;
    hole.active = true;
    activeMoles++;

    hole.moleEl.classList.add('show');
    hole.moleEl.classList.remove('whacked');
    hole.moleEl.classList.toggle('gold', hole.gold);

    const progress  = 1 - timeLeft / ROUND_TIME;
    const showTime  = Math.max(MOLE_MIN_MS, MOLE_BASE_MS - progress * 600);
    hole.timeout = setTimeout(() => hideMole(hole), showTime + Math.random() * 300);
  }

  function hideMole(hole) {
    if (!hole.active) return;
    hole.active = false;
    activeMoles--;
    hole.moleEl.classList.remove('show', 'gold');
    clearTimeout(hole.timeout);
  }

  function clearAllMoles() {
    holes.forEach(h => {
      h.active = false;
      h.moleEl.classList.remove('show', 'whacked', 'gold');
      clearTimeout(h.timeout);
    });
    activeMoles = 0;
  }

  // ---- Click Handling -------------------------------------------
  function onHoleClick(hole) {
    if (!running || paused) return;
    flashHammer();

    if (hole.active) {
      // HIT!
      const now = performance.now();
      if (now - lastHitTime < COMBO_WINDOW) {
        combo = Math.min(combo + 1, 5);
      } else {
        combo = 1;
      }
      lastHitTime = now;

      const pts = hole.gold ? GOLD_SCORE : HIT_SCORE;
      const earned = pts * combo;
      score += earned;

      // Whack animation
      hole.moleEl.classList.add('whacked');
      hole.moleEl.classList.remove('show');
      clearTimeout(hole.timeout);

      showScorePopup(hole.el, `+${earned}`, hole.gold ? 'gold' : 'hit');
      setTimeout(() => {
        hole.moleEl.classList.remove('whacked', 'gold');
        hole.active = false;
        activeMoles--;
      }, 350);
    } else {
      // MISS
      score = Math.max(0, score - MISS_PENALTY);
      combo = 0;
      showScorePopup(hole.el, `−${MISS_PENALTY}`, 'miss');
    }
    updateUI();
  }

  // ---- Score Popup ----------------------------------------------
  function showScorePopup(parentEl, text, cls) {
    const pop = document.createElement('div');
    pop.className = `score-popup ${cls}`;
    pop.textContent = text;
    parentEl.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove());
  }

  // ---- UI Sync --------------------------------------------------
  function updateUI() {
    scoreEl.textContent = score;
    timerEl.textContent = timeLeft;
    comboEl.textContent = combo > 1 ? `x${combo}` : 'x1';
  }

  // ---- Overlay --------------------------------------------------
  function showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayMsg.innerHTML = msg;
    overlayEl.classList.remove('hidden');
  }
  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  // ---- Button Wiring --------------------------------------------
  btnStart.addEventListener('click', startGame);
  btnPause.addEventListener('click', togglePause);
  btnReset.addEventListener('click', () => {
    resetGame();
    showOverlay('🔨 WHACK-A-MOLE', 'Press <b>START</b> to play!');
  });

  // ---- Keyboard shortcuts ---------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!running) startGame();
    }
    if (e.code === 'KeyP' && running) togglePause();
  });

  // ---- Boot -----------------------------------------------------
  init();
})();
