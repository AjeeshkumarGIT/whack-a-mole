/*  ===========================================================
    Marvel Whack-a-Villain — Game Engine (Mjölnir Edition)
    Thor vs Loki / Thanos / Mangog
    + Microsoft Graph API Email Reports (Issue #4)
    Browser-based  ·  MSAL.js for Auth  ·  Zero other deps
    =========================================================== */

(() => {
  'use strict';

  // ---- Configuration -------------------------------------------
  const HOLE_COUNT    = 9;
  const ROUND_TIME    = 30;
  const MOLE_BASE_MS  = 1200;
  const MOLE_MIN_MS   = 400;
  const SPAWN_BASE_MS = 900;
  const SPAWN_MIN_MS  = 350;
  const MISS_PENALTY  = 5;
  const COMBO_WINDOW  = 1500;
  const REPORT_EMAIL  = 'ajeesh.radakrishnannair@flightcentre.com';

  // ---- Azure AD / MSAL Configuration ---------------------------
  // IMPORTANT: Replace these with your Azure AD app registration values
  const MSAL_CONFIG = {
    auth: {
      clientId: 'YOUR_CLIENT_ID_HERE',           // Azure AD App (client) ID
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
      storeAuthStateInCookie: false,
    }
  };
  const GRAPH_SCOPES = ['Mail.Send'];

  let msalInstance = null;
  let msalAccount  = null;

  // ---- Villain definitions -------------------------------------
  const VILLAINS = {
    loki:   { name: 'Loki',   points: 10, weight: 0.55 },
    mangog: { name: 'Mangog', points: 15, weight: 0.33 },
    thanos: { name: 'Thanos', points: 25, weight: 0.12 },
  };

  // ---- DOM References ------------------------------------------
  const boardEl        = document.getElementById('board');
  const overlayEl      = document.getElementById('overlay');
  const overlayTitle   = document.getElementById('overlayTitle');
  const overlayMsg     = document.getElementById('overlayMsg');
  const scoreEl        = document.getElementById('score');
  const highEl         = document.getElementById('highScore');
  const timerEl        = document.getElementById('timer');
  const comboEl        = document.getElementById('combo');
  const statusEl       = document.getElementById('statusMsg');
  const btnStart       = document.getElementById('btnStart');
  const btnPause       = document.getElementById('btnPause');
  const btnReset       = document.getElementById('btnReset');
  const thorFigure     = document.getElementById('thor');
  const thorArm        = document.getElementById('thorArm');
  const lightningFlash = document.getElementById('lightningFlash');
  const toyBoard       = document.querySelector('.toy-board');

  // Name modal
  const nameModal      = document.getElementById('nameModal');
  const playerNameInput= document.getElementById('playerNameInput');
  const btnNameSubmit  = document.getElementById('btnNameSubmit');
  const playerDisplay  = document.getElementById('playerDisplay');
  const btnSendDashboard = document.getElementById('btnSendDashboard');

  // ---- Game State ----------------------------------------------
  let score, highScore, combo, lastHitTime, bestCombo;
  let timeLeft, timerInterval;
  let spawnTimeout, activeMoles;
  let running, paused;
  let holes = [];
  let playerName = '';

  // Per-game stats
  let gameStats = {
    hits: 0,
    misses: 0,
    villainsWhacked: { loki: 0, mangog: 0, thanos: 0 },
    bestCombo: 0,
    startTime: null,
    endTime: null,
  };

  // Daily games history (persisted in localStorage)
  function getDailyGames() {
    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(localStorage.getItem('wam_daily_games') || '{}');
    if (stored.date !== today) {
      return { date: today, games: [] };
    }
    return stored;
  }
  function saveDailyGames(data) {
    localStorage.setItem('wam_daily_games', JSON.stringify(data));
  }
  function addGameToDaily(gameSummary) {
    const daily = getDailyGames();
    daily.games.push(gameSummary);
    saveDailyGames(daily);
  }

  // ---- MSAL Initialisation -------------------------------------
  function initMSAL() {
    try {
      msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalAccount = accounts[0];
      }
    } catch (e) {
      console.warn('MSAL init failed:', e.message);
    }
  }

  async function getAccessToken() {
    if (!msalInstance) return null;
    const request = { scopes: GRAPH_SCOPES, account: msalAccount };
    try {
      // Try silent token acquisition first
      if (msalAccount) {
        const resp = await msalInstance.acquireTokenSilent(request);
        return resp.accessToken;
      }
      throw new Error('No account');
    } catch {
      // Fall back to popup login
      try {
        const resp = await msalInstance.acquireTokenPopup({ scopes: GRAPH_SCOPES });
        msalAccount = resp.account;
        return resp.accessToken;
      } catch (e2) {
        console.error('Auth failed:', e2);
        return null;
      }
    }
  }

  // ---- Microsoft Graph: Send Email -----------------------------
  async function sendGraphEmail(subject, htmlBody) {
    const token = await getAccessToken();
    if (!token) {
      showToast('Sign in required — check popup blocker', 'error');
      return false;
    }

    const message = {
      message: {
        subject: subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: REPORT_EMAIL } }],
      },
      saveToSentItems: true,
    };

    try {
      showToast('📧 Sending email...', 'sending');
      const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      if (resp.status === 202 || resp.ok) {
        showToast('✅ Email sent successfully!', 'success');
        return true;
      }
      const err = await resp.json();
      showToast(`❌ Send failed: ${err.error?.message || resp.status}`, 'error');
      return false;
    } catch (e) {
      showToast(`❌ Network error: ${e.message}`, 'error');
      return false;
    }
  }

  // ---- Toast Notifications -------------------------------------
  function showToast(msg, type) {
    // Remove existing toasts
    document.querySelectorAll('.email-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `email-toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---- Email HTML Templates ------------------------------------
  function buildGameReportHTML(summary) {
    const villains = summary.villainsWhacked;
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:20px auto;background:linear-gradient(145deg,#1a237e,#0d1642);border:3px solid #F5C518;border-radius:16px;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(90deg,#E23636,#B71C1C);padding:20px;text-align:center;">
      <h1 style="margin:0;color:#F5C518;font-size:24px;letter-spacing:2px;">⚡ WHACK-A-VILLAIN</h1>
      <p style="margin:4px 0 0;color:#fff;font-size:12px;opacity:0.8;">Mjölnir Edition — Game Report</p>
    </div>
    <!-- Player Info -->
    <div style="padding:20px 24px 12px;text-align:center;">
      <p style="color:#90caf9;font-size:13px;margin:0;">Player</p>
      <h2 style="color:#fff;margin:4px 0 16px;font-size:22px;">${summary.playerName}</h2>
      <div style="display:inline-block;background:rgba(245,197,24,0.15);border:2px solid #F5C518;border-radius:12px;padding:12px 28px;">
        <p style="color:#F5C518;font-size:12px;margin:0;">FINAL SCORE</p>
        <p style="color:#fff;font-size:36px;font-weight:bold;margin:4px 0 0;">${summary.score}</p>
      </div>
    </div>
    <!-- Stats Grid -->
    <div style="padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 12px;color:#90caf9;font-size:12px;">High Score</td>
          <td style="padding:8px 12px;color:#fff;font-weight:bold;text-align:right;">${summary.highScore}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.03);">
          <td style="padding:8px 12px;color:#90caf9;font-size:12px;">Best Combo</td>
          <td style="padding:8px 12px;color:#fff;font-weight:bold;text-align:right;">x${summary.bestCombo}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#90caf9;font-size:12px;">Successful Hits</td>
          <td style="padding:8px 12px;color:#4caf50;font-weight:bold;text-align:right;">${summary.hits}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.03);">
          <td style="padding:8px 12px;color:#90caf9;font-size:12px;">Misses</td>
          <td style="padding:8px 12px;color:#ef5350;font-weight:bold;text-align:right;">${summary.misses}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#90caf9;font-size:12px;">Game Duration</td>
          <td style="padding:8px 12px;color:#fff;font-weight:bold;text-align:right;">${summary.duration}s</td>
        </tr>
      </table>
    </div>
    <!-- Villains Breakdown -->
    <div style="padding:0 24px 16px;">
      <h3 style="color:#F5C518;font-size:14px;margin:0 0 10px;letter-spacing:1px;">VILLAINS WHACKED</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:rgba(46,125,50,0.15);">
          <td style="padding:8px 12px;color:#66bb6a;font-weight:bold;">🟢 Loki (10pt)</td>
          <td style="padding:8px 12px;color:#fff;text-align:right;font-weight:bold;">${villains.loki}</td>
        </tr>
        <tr style="background:rgba(230,81,0,0.15);">
          <td style="padding:8px 12px;color:#ff8f00;font-weight:bold;">🟠 Mangog (15pt)</td>
          <td style="padding:8px 12px;color:#fff;text-align:right;font-weight:bold;">${villains.mangog}</td>
        </tr>
        <tr style="background:rgba(123,31,162,0.15);">
          <td style="padding:8px 12px;color:#ab47bc;font-weight:bold;">🟣 Thanos (25pt)</td>
          <td style="padding:8px 12px;color:#fff;text-align:right;font-weight:bold;">${villains.thanos}</td>
        </tr>
      </table>
    </div>
    <!-- Footer -->
    <div style="background:rgba(0,0,0,0.3);padding:12px;text-align:center;">
      <p style="color:#607d8b;font-size:11px;margin:0;">${summary.dateTime} · Marvel Whack-a-Villain · Mjölnir Edition</p>
    </div>
  </div>
</body>
</html>`;
  }

  function buildDailyDashboardHTML(daily, pName) {
    const games = daily.games;
    if (games.length === 0) return '<p>No games played today.</p>';

    const scores     = games.map(g => g.score);
    const bestScore  = Math.max(...scores);
    const avgScore   = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const totalTime  = games.reduce((a, g) => a + g.duration, 0);
    const totalHits  = games.reduce((a, g) => a + g.hits, 0);
    const totalMiss  = games.reduce((a, g) => a + g.misses, 0);

    // Performance trend
    let trend = '→ Steady';
    if (games.length >= 2) {
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (avg2 > avg1 * 1.1) trend = '📈 Improving';
      else if (avg2 < avg1 * 0.9) trend = '📉 Declining';
      else trend = '→ Steady';
    }

    let gameRows = '';
    games.forEach((g, i) => {
      const bg = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';
      gameRows += `
        <tr style="background:${bg};">
          <td style="padding:8px 10px;color:#fff;text-align:center;">#${i + 1}</td>
          <td style="padding:8px 10px;color:#F5C518;font-weight:bold;text-align:center;">${g.score}</td>
          <td style="padding:8px 10px;color:#4caf50;text-align:center;">${g.hits}</td>
          <td style="padding:8px 10px;color:#ef5350;text-align:center;">${g.misses}</td>
          <td style="padding:8px 10px;color:#90caf9;text-align:center;">x${g.bestCombo}</td>
          <td style="padding:8px 10px;color:#ccc;text-align:center;font-size:11px;">${g.time || ''}</td>
        </tr>`;
    });

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:650px;margin:20px auto;background:linear-gradient(145deg,#1a237e,#0d1642);border:3px solid #F5C518;border-radius:16px;overflow:hidden;">
    <!-- Header -->
    <div style="background:linear-gradient(90deg,#E23636,#B71C1C);padding:20px;text-align:center;">
      <h1 style="margin:0;color:#F5C518;font-size:22px;letter-spacing:2px;">⚡ DAILY DASHBOARD</h1>
      <p style="margin:4px 0 0;color:#fff;font-size:12px;opacity:0.8;">Whack-a-Villain · ${daily.date}</p>
    </div>
    <!-- Player Summary -->
    <div style="padding:20px 24px;text-align:center;">
      <p style="color:#90caf9;font-size:13px;margin:0;">Player: <strong style="color:#fff;">${pName}</strong></p>
    </div>
    <!-- Key Metrics -->
    <div style="display:flex;justify-content:center;gap:12px;padding:0 24px 16px;flex-wrap:wrap;">
      <div style="background:rgba(245,197,24,0.1);border:2px solid #F5C518;border-radius:12px;padding:10px 18px;text-align:center;min-width:80px;">
        <p style="color:#F5C518;font-size:10px;margin:0;">GAMES</p>
        <p style="color:#fff;font-size:24px;font-weight:bold;margin:2px 0 0;">${games.length}</p>
      </div>
      <div style="background:rgba(76,175,80,0.1);border:2px solid #4caf50;border-radius:12px;padding:10px 18px;text-align:center;min-width:80px;">
        <p style="color:#4caf50;font-size:10px;margin:0;">BEST</p>
        <p style="color:#fff;font-size:24px;font-weight:bold;margin:2px 0 0;">${bestScore}</p>
      </div>
      <div style="background:rgba(66,165,245,0.1);border:2px solid #42a5f5;border-radius:12px;padding:10px 18px;text-align:center;min-width:80px;">
        <p style="color:#42a5f5;font-size:10px;margin:0;">AVERAGE</p>
        <p style="color:#fff;font-size:24px;font-weight:bold;margin:2px 0 0;">${avgScore}</p>
      </div>
      <div style="background:rgba(171,71,188,0.1);border:2px solid #ab47bc;border-radius:12px;padding:10px 18px;text-align:center;min-width:80px;">
        <p style="color:#ab47bc;font-size:10px;margin:0;">PLAY TIME</p>
        <p style="color:#fff;font-size:24px;font-weight:bold;margin:2px 0 0;">${Math.round(totalTime / 60)}m</p>
      </div>
    </div>
    <!-- Performance Trend -->
    <div style="text-align:center;padding:0 24px 16px;">
      <span style="background:rgba(255,255,255,0.08);border-radius:20px;padding:6px 18px;color:#F5C518;font-size:13px;font-weight:bold;">${trend}</span>
    </div>
    <!-- Game History Table -->
    <div style="padding:0 24px 16px;">
      <h3 style="color:#F5C518;font-size:13px;margin:0 0 8px;letter-spacing:1px;">GAME HISTORY</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:2px solid rgba(245,197,24,0.3);">
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">GAME</th>
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">SCORE</th>
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">HITS</th>
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">MISS</th>
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">COMBO</th>
            <th style="padding:8px 10px;color:#90caf9;font-size:10px;text-align:center;">TIME</th>
          </tr>
        </thead>
        <tbody>${gameRows}</tbody>
      </table>
    </div>
    <!-- Totals -->
    <div style="padding:0 24px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="border-top:2px solid rgba(245,197,24,0.2);">
          <td style="padding:8px 12px;color:#90caf9;">Total Hits</td>
          <td style="padding:8px 12px;color:#4caf50;font-weight:bold;text-align:right;">${totalHits}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#90caf9;">Total Misses</td>
          <td style="padding:8px 12px;color:#ef5350;font-weight:bold;text-align:right;">${totalMiss}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:#90caf9;">Hit Rate</td>
          <td style="padding:8px 12px;color:#F5C518;font-weight:bold;text-align:right;">${totalHits + totalMiss > 0 ? Math.round((totalHits / (totalHits + totalMiss)) * 100) : 0}%</td>
        </tr>
      </table>
    </div>
    <!-- Footer -->
    <div style="background:rgba(0,0,0,0.3);padding:12px;text-align:center;">
      <p style="color:#607d8b;font-size:11px;margin:0;">Generated ${new Date().toLocaleString()} · Marvel Whack-a-Villain · Mjölnir Edition</p>
    </div>
  </div>
</body>
</html>`;
  }

  // ---- Villain HTML builders -----------------------------------
  function lokiHTML() {
    return `
      <div class="villain-body">
        <div class="villain-head">
          <div class="villain-shine"></div>
          <div class="villain-horn-l"></div>
          <div class="villain-horn-r"></div>
          <div class="villain-eyes">
            <div class="villain-eye"></div>
            <div class="villain-eye"></div>
          </div>
          <div class="villain-mouth"></div>
        </div>
      </div>`;
  }

  function thanosHTML() {
    return `
      <div class="villain-body">
        <div class="villain-head">
          <div class="villain-shine"></div>
          <div class="villain-chin"></div>
          <div class="villain-eyes">
            <div class="villain-eye"></div>
            <div class="villain-eye"></div>
          </div>
          <div class="villain-mouth"></div>
        </div>
      </div>`;
  }

  function mangogHTML() {
    return `
      <div class="villain-body">
        <div class="villain-head">
          <div class="villain-shine"></div>
          <div class="villain-horn-l"></div>
          <div class="villain-horn-r"></div>
          <div class="villain-eyes">
            <div class="villain-eye"></div>
            <div class="villain-eye"></div>
          </div>
          <div class="villain-mouth">
            <div class="villain-fang-l"></div>
            <div class="villain-fang-r"></div>
          </div>
        </div>
        <div class="villain-shoulders"></div>
      </div>`;
  }

  const VILLAIN_HTML = { loki: lokiHTML, thanos: thanosHTML, mangog: mangogHTML };

  // ---- Pick random villain type by weight ----------------------
  function pickVillainType() {
    const r = Math.random();
    let cumulative = 0;
    for (const [type, cfg] of Object.entries(VILLAINS)) {
      cumulative += cfg.weight;
      if (r <= cumulative) return type;
    }
    return 'loki'; // fallback
  }

  // ---- Thor animations -----------------------------------------
  function thorSwing() {
    thorFigure.classList.remove('swing', 'triumphant', 'frustrated');
    void thorFigure.offsetWidth;
    thorFigure.classList.add('swing');
    thorArm.classList.remove('swing');
    void thorArm.offsetWidth;
    thorArm.classList.add('swing');
    setTimeout(() => {
      thorFigure.classList.remove('swing');
      thorArm.classList.remove('swing');
    }, 300);
  }

  function thorTriumph() {
    thorFigure.classList.remove('swing', 'triumphant', 'frustrated');
    void thorFigure.offsetWidth;
    thorFigure.classList.add('triumphant');
    setTimeout(() => thorFigure.classList.remove('triumphant'), 500);
  }

  function thorFrustrated() {
    thorFigure.classList.remove('swing', 'triumphant', 'frustrated');
    void thorFigure.offsetWidth;
    thorFigure.classList.add('frustrated');
    setTimeout(() => thorFigure.classList.remove('frustrated'), 400);
  }

  // ---- Hammer cursor flash -------------------------------------
  function flashHammer() {
    document.body.classList.add('hammer-active');
    setTimeout(() => document.body.classList.remove('hammer-active'), 120);
  }

  // ---- VFX: Lightning bolt SVG ---------------------------------
  function showLightningBolt(parentEl) {
    const bolt = document.createElement('div');
    bolt.className = 'lightning-bolt';
    bolt.innerHTML = `<svg viewBox="0 0 30 50" xmlns="http://www.w3.org/2000/svg">
      <polygon points="15,0 8,20 13,20 5,50 25,18 18,18 25,0"
        fill="#64B5F6" stroke="#1E88E5" stroke-width="1"/>
      <polygon points="15,2 10,18 14,18 8,44 22,19 17,19 22,2"
        fill="#BBDEFB" opacity="0.7"/>
    </svg>`;
    parentEl.appendChild(bolt);
    bolt.addEventListener('animationend', () => bolt.remove());
  }

  // ---- VFX: Lightning flash ------------------------------------
  function triggerLightningFlash() {
    lightningFlash.classList.remove('active');
    void lightningFlash.offsetWidth;
    lightningFlash.classList.add('active');
    setTimeout(() => lightningFlash.classList.remove('active'), 150);
  }

  // ---- VFX: Loki green mist -----------------------------------
  function showLokiMist(parentEl) {
    const mist = document.createElement('div');
    mist.className = 'loki-mist';
    parentEl.appendChild(mist);
    mist.addEventListener('animationend', () => mist.remove());
  }

  // ---- VFX: Thanos snap particles -----------------------------
  function showSnapParticles(parentEl) {
    const colors = ['#AB47BC', '#CE93D8', '#FFD740', '#FF8F00', '#7B1FA2'];
    const rect = parentEl.getBoundingClientRect();
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'snap-particle';
      const angle = (Math.PI * 2 * i) / 12;
      const dist = 30 + Math.random() * 30;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.left = '50%';
      p.style.top = '40%';
      p.style.width = (3 + Math.random() * 4) + 'px';
      p.style.height = p.style.width;
      parentEl.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
  }

  // ---- VFX: Mangog ground shake --------------------------------
  function triggerBoardShake() {
    toyBoard.classList.remove('shake');
    void toyBoard.offsetWidth;
    toyBoard.classList.add('shake');
    setTimeout(() => toyBoard.classList.remove('shake'), 300);
  }

  // ---- VFX dispatcher by villain type --------------------------
  function playHitVFX(holeEl, villainType) {
    triggerLightningFlash();
    showLightningBolt(holeEl);
    switch (villainType) {
      case 'loki':   showLokiMist(holeEl); break;
      case 'thanos': showSnapParticles(holeEl); break;
      case 'mangog': triggerBoardShake(); break;
    }
  }

  // ---- Initialisation ------------------------------------------
  function init() {
    initMSAL();
    highScore = parseInt(localStorage.getItem('wam_high') || '0', 10);
    highEl.textContent = highScore;

    // Check if player name already stored in session
    const storedName = sessionStorage.getItem('wam_player');
    if (storedName) {
      playerName = storedName;
      nameModal.classList.add('hidden');
      playerDisplay.textContent = `⚡ ${playerName}`;
      buildBoard();
      resetGame();
      showOverlay('⚡ WHACK-A-VILLAIN', `Welcome back, <b>${playerName}</b>!<br>Press <b>START</b> to smite villains!`);
    } else {
      // Show name modal
      nameModal.classList.remove('hidden');
    }
  }

  // ---- Name Modal Handling -------------------------------------
  function submitPlayerName() {
    const name = playerNameInput.value.trim();
    if (!name) {
      playerNameInput.style.borderColor = '#ef5350';
      playerNameInput.focus();
      return;
    }
    playerName = name;
    sessionStorage.setItem('wam_player', playerName);
    nameModal.classList.add('hidden');
    playerDisplay.textContent = `⚡ ${playerName}`;
    buildBoard();
    resetGame();
    showOverlay('⚡ WHACK-A-VILLAIN', `Welcome, <b>${playerName}</b>!<br>Press <b>START</b> to smite villains!<br><small>Loki · Mangog · Thanos</small>`);
  }

  btnNameSubmit.addEventListener('click', submitPlayerName);
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPlayerName();
    playerNameInput.style.borderColor = 'rgba(245,197,24,0.3)';
  });

  function buildBoard() {
    boardEl.innerHTML = '';
    holes = [];
    for (let i = 0; i < HOLE_COUNT; i++) {
      const holeEl = document.createElement('div');
      holeEl.className = 'hole';
      holeEl.dataset.index = i;

      const villainEl = document.createElement('div');
      villainEl.className = 'villain';

      holeEl.appendChild(villainEl);
      boardEl.appendChild(holeEl);

      const hole = {
        el: holeEl,
        villainEl,
        active: false,
        villainType: null,
        timeout: null
      };
      holes.push(hole);

      holeEl.addEventListener('click', () => onHoleClick(hole));
    }
  }

  function resetGame() {
    score       = 0;
    combo       = 0;
    bestCombo   = 0;
    lastHitTime = 0;
    timeLeft    = ROUND_TIME;
    running     = false;
    paused      = false;
    activeMoles = 0;
    gameStats   = { hits: 0, misses: 0, villainsWhacked: { loki: 0, mangog: 0, thanos: 0 }, bestCombo: 0, startTime: null, endTime: null };
    clearAllVillains();
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
    gameStats.startTime = new Date();
    hideOverlay();
    btnPause.disabled = false;
    statusEl.textContent = 'Smite the villains!';
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
    gameStats.endTime = new Date();
    gameStats.bestCombo = bestCombo;
    clearInterval(timerInterval);
    clearTimeout(spawnTimeout);
    clearAllVillains();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('wam_high', highScore);
      highEl.textContent = highScore;
    }
    btnPause.disabled = true;
    statusEl.textContent = 'Game over';
    showOverlay('⏱ TIME\'S UP!', `Final score: <b>${score}</b><br>Press <b>START</b> to avenge again!`);

    // Build game summary, save, and email report
    const summary = {
      playerName,
      score,
      highScore,
      bestCombo,
      hits: gameStats.hits,
      misses: gameStats.misses,
      villainsWhacked: { ...gameStats.villainsWhacked },
      startTime: gameStats.startTime,
      endTime: gameStats.endTime,
      duration: ROUND_TIME,
      dateTime: new Date().toLocaleString(),
      time: new Date().toLocaleTimeString()
    };
    addGameToDaily(summary);
    const reportHTML = buildGameReportHTML(summary);
    sendGraphEmail(`⚡ Whack-a-Villain Report — ${playerName} scored ${score}`, reportHTML);
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
      statusEl.textContent = 'Smite the villains!';
      btnPause.textContent = '⏸ PAUSE';
      scheduleSpawn();
    }
  }

  // ---- Villain Spawn Logic -------------------------------------
  function scheduleSpawn() {
    if (!running || paused) return;
    const progress = 1 - timeLeft / ROUND_TIME;
    const delay = Math.max(SPAWN_MIN_MS, SPAWN_BASE_MS - progress * 500);
    spawnTimeout = setTimeout(() => {
      spawnVillain();
      scheduleSpawn();
    }, delay + Math.random() * 300);
  }

  function spawnVillain() {
    const inactive = holes.filter(h => !h.active);
    if (inactive.length === 0) return;
    const hole = inactive[Math.floor(Math.random() * inactive.length)];

    const villainType = pickVillainType();
    hole.villainType = villainType;
    hole.active = true;
    activeMoles++;

    // Set villain appearance
    hole.villainEl.className = `villain ${villainType}`;
    hole.villainEl.innerHTML = VILLAIN_HTML[villainType]();
    hole.villainEl.classList.add('show');

    const progress = 1 - timeLeft / ROUND_TIME;
    const showTime = Math.max(MOLE_MIN_MS, MOLE_BASE_MS - progress * 600);
    hole.timeout = setTimeout(() => hideVillain(hole), showTime + Math.random() * 300);
  }

  function hideVillain(hole) {
    if (!hole.active) return;
    hole.active = false;
    activeMoles--;
    hole.villainEl.classList.remove('show');
    clearTimeout(hole.timeout);
  }

  function clearAllVillains() {
    holes.forEach(h => {
      h.active = false;
      h.villainType = null;
      if (h.villainEl) {
        h.villainEl.classList.remove('show', 'whacked');
        h.villainEl.className = 'villain';
      }
      clearTimeout(h.timeout);
    });
    activeMoles = 0;
  }

  // ---- Click Handling -------------------------------------------
  function onHoleClick(hole) {
    if (!running || paused) return;
    flashHammer();
    thorSwing();

    if (hole.active) {
      // HIT!
      gameStats.hits++;
      const now = performance.now();
      if (now - lastHitTime < COMBO_WINDOW) {
        combo = Math.min(combo + 1, 5);
      } else {
        combo = 1;
      }
      if (combo > bestCombo) bestCombo = combo;
      lastHitTime = now;

      const villainType = hole.villainType;
      gameStats.villainsWhacked[villainType] = (gameStats.villainsWhacked[villainType] || 0) + 1;
      const pts = VILLAINS[villainType].points;
      const earned = pts * combo;
      score += earned;

      // Whack animation
      hole.villainEl.classList.add('whacked');
      hole.villainEl.classList.remove('show');
      clearTimeout(hole.timeout);

      // VFX
      playHitVFX(hole.el, villainType);
      thorTriumph();

      showScorePopup(hole.el, `+${earned}`, villainType);
      setTimeout(() => {
        hole.villainEl.classList.remove('whacked');
        hole.villainEl.className = 'villain';
        hole.active = false;
        hole.villainType = null;
        activeMoles--;
      }, 400);
    } else {
      // MISS
      gameStats.misses++;
      score = Math.max(0, score - MISS_PENALTY);
      combo = 0;
      thorFrustrated();
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
    showOverlay('⚡ WHACK-A-VILLAIN', 'Press <b>START</b> to smite villains!<br><small>Loki · Mangog · Thanos</small>');
  });

  // ---- Daily Dashboard Button -----------------------------------
  btnSendDashboard.addEventListener('click', () => {
    const daily = getDailyGames();
    if (!daily.games || daily.games.length === 0) {
      showToast('No games played today yet!', 'error');
      return;
    }
    const html = buildDailyDashboardHTML(daily, playerName);
    sendGraphEmail(`📊 Daily Dashboard — ${playerName} — ${new Date().toLocaleDateString()}`, html);
  });

  // ---- Keyboard shortcuts ---------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!running && playerName) startGame();
    }
    if (e.code === 'KeyP' && running) togglePause();
  });

  // ---- Boot -----------------------------------------------------
  init();
})();
