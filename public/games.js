/* ═══════════════════════════════════════════════════════════════
   SYNCTUNE MULTIPLAYER GAMES LOUNGE CLIENT ENGINE
   Floating, Draggable, Minimizable, Expandable Panel + Chess, Ludo & TTT
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const g$ = id => document.getElementById(id);

  const LUDO_TRACK_COORDS = [
    // 0..4 Red arm top row (right)
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    // 5..10 Top arm left col (up)
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    // 11..12 Top turn
    [0, 7], [0, 8],
    // 13..17 Top arm right col (down) — Green start at 13 (1,8)
    [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    // 18..23 Right arm top row (right)
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    // 24..25 Right turn
    [7, 14], [8, 14],
    // 26..30 Right arm bottom row (left) — Yellow start at 26 (8,13)
    [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    // 31..36 Bottom arm right col (down)
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    // 37..38 Bottom turn
    [14, 7], [14, 6],
    // 39..43 Bottom arm left col (up) — Blue start at 39 (13,6)
    [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    // 44..49 Left arm bottom row (left)
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    // 50..51 Left turn
    [7, 0], [6, 0]
  ];

  const LUDO_HOME_STRETCH = {
    red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
  };

  const LUDO_YARD_SLOTS = {
    red: [[1.42, 1.42], [1.42, 3.58], [3.58, 1.42], [3.58, 3.58]],
    green: [[1.42, 10.42], [1.42, 12.58], [3.58, 10.42], [3.58, 12.58]],
    yellow: [[10.42, 10.42], [10.42, 12.58], [12.58, 10.42], [12.58, 12.58]],
    blue: [[10.42, 1.42], [10.42, 3.58], [12.58, 1.42], [12.58, 3.58]]
  };

  const LUDO_FINISH_SLOTS = {
    red: [7, 5.88],
    green: [5.88, 7],
    yellow: [7, 8.12],
    blue: [8.12, 7]
  };

  const LUDO_START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };
  const LUDO_SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const LUDO_COLOR_NAMES = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };

  /* ── Web Audio API Synthesized Game Sound Effects ──────────── */
  const SOUND_STORAGE_KEY = "synctune_games_muted";
  let isSoundMuted = false;
  try {
    isSoundMuted = localStorage.getItem(SOUND_STORAGE_KEY) === "true";
  } catch {
    isSoundMuted = false;
  }

  let audioCtx = null;
  const lastSoundTimeByKey = new Map();
  const matchSoundSnapshots = new Map();

  function getOrCreateAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) {
      try {
        audioCtx = new Ctx();
      } catch {
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      try {
        audioCtx.resume().catch(() => {});
      } catch {}
    }
    return audioCtx;
  }

  function bindAudioUnlockGestures() {
    const unlock = () => {
      if (isSoundMuted) return;
      getOrCreateAudioContext();
    };
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock, { passive: true });
  }
  bindAudioUnlockGestures();

  function syncSoundToggleUi() {
    const btn = g$("gamesSoundToggleBtn");
    if (!btn) return;
    const onIcon = btn.querySelector(".icon-sound-on");
    const offIcon = btn.querySelector(".icon-sound-off");
    if (onIcon) onIcon.classList.toggle("hidden", isSoundMuted);
    if (offIcon) offIcon.classList.toggle("hidden", !isSoundMuted);
    btn.classList.toggle("is-muted", isSoundMuted);
    btn.setAttribute("aria-pressed", String(isSoundMuted));
    btn.setAttribute("title", isSoundMuted ? "Unmute game sounds" : "Mute game sounds");
    btn.setAttribute("aria-label", isSoundMuted ? "Unmute game sounds" : "Mute game sounds");
  }

  function setSoundMuted(muted) {
    isSoundMuted = Boolean(muted);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(isSoundMuted));
    } catch {}
    syncSoundToggleUi();
    if (!isSoundMuted) {
      getOrCreateAudioContext();
    }
  }

  function scheduleTone(ctx, { type = "sine", freq = 440, endFreq = null, delay = 0, duration = 0.08, gain = 0.12 }) {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), now);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }
    amp.gain.setValueAtTime(0.0008, now);
    amp.gain.linearRampToValueAtTime(Math.max(0.001, gain), now + Math.min(0.012, duration * 0.25));
    amp.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playGameSound(effectName, opts = {}) {
    if (isSoundMuted) return;
    const nowMs = Date.now();
    const minGap = opts.minGapMs ?? 70;
    const prevTs = lastSoundTimeByKey.get(effectName) || 0;
    if (nowMs - prevTs < minGap) return;
    lastSoundTimeByKey.set(effectName, nowMs);

    const ctx = getOrCreateAudioContext();
    if (!ctx || ctx.state !== "running") return;

    switch (effectName) {
      case "chessMove":
        scheduleTone(ctx, { type: "triangle", freq: 195, endFreq: 95, duration: 0.065, gain: 0.14 });
        scheduleTone(ctx, { type: "sine", freq: 120, endFreq: 68, delay: 0.005, duration: 0.055, gain: 0.09 });
        break;
      case "chessCapture":
        scheduleTone(ctx, { type: "triangle", freq: 320, endFreq: 105, duration: 0.075, gain: 0.17 });
        scheduleTone(ctx, { type: "sawtooth", freq: 185, endFreq: 72, delay: 0.032, duration: 0.07, gain: 0.08 });
        break;
      case "chessCheck":
        scheduleTone(ctx, { type: "sine", freq: 587.33, endFreq: 587.33, duration: 0.09, gain: 0.12 });
        scheduleTone(ctx, { type: "sine", freq: 880, endFreq: 860, delay: 0.085, duration: 0.14, gain: 0.13 });
        break;
      case "chessEnd":
      case "ludoWin":
      case "tttWin": {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, i) => {
          scheduleTone(ctx, {
            type: "triangle",
            freq: n,
            endFreq: n,
            delay: i * 0.085,
            duration: i === notes.length - 1 ? 0.28 : 0.11,
            gain: 0.12
          });
        });
        break;
      }
      case "draw":
        scheduleTone(ctx, { type: "sine", freq: 392, endFreq: 370, duration: 0.12, gain: 0.1 });
        scheduleTone(ctx, { type: "sine", freq: 329.63, endFreq: 311.13, delay: 0.12, duration: 0.18, gain: 0.1 });
        break;
      case "ludoRoll":
        [270, 345, 295, 390].forEach((f, idx) => {
          scheduleTone(ctx, { type: "triangle", freq: f, endFreq: f * 0.72, delay: idx * 0.062, duration: 0.04, gain: 0.1 });
        });
        scheduleTone(ctx, { type: "sine", freq: 210, endFreq: 120, delay: 0.28, duration: 0.09, gain: 0.13 });
        break;
      case "ludoStep": {
        const stepIdx = Number(opts.stepIndex) || 0;
        const f = 370 + (stepIdx % 6) * 26;
        scheduleTone(ctx, { type: "sine", freq: f, endFreq: f * 1.12, duration: 0.048, gain: 0.085 });
        break;
      }
      case "ludoCapture":
        scheduleTone(ctx, { type: "triangle", freq: 620, endFreq: 195, duration: 0.22, gain: 0.15 });
        scheduleTone(ctx, { type: "sine", freq: 330, endFreq: 120, delay: 0.08, duration: 0.16, gain: 0.11 });
        break;
      case "ludoHome":
        [587.33, 880, 1174.66].forEach((n, idx) => {
          scheduleTone(ctx, { type: "sine", freq: n, endFreq: n, delay: idx * 0.07, duration: 0.14, gain: 0.11 });
        });
        break;
      case "tttPlaceX":
        scheduleTone(ctx, { type: "sine", freq: 520, endFreq: 690, duration: 0.075, gain: 0.12 });
        break;
      case "tttPlaceO":
        scheduleTone(ctx, { type: "sine", freq: 410, endFreq: 510, duration: 0.08, gain: 0.12 });
        break;
      default:
        break;
    }
  }

  function snapshotMatchForSounds(match) {
    if (!match || !match.state) return null;
    const st = match.state;
    if (match.gameType === "chess") {
      return {
        gameType: "chess",
        moveCount: (st.moveHistory || []).length,
        status: st.status
      };
    }
    if (match.gameType === "tictactoe") {
      return {
        gameType: "tictactoe",
        moveCount: Array.isArray(st.board) ? st.board.filter(Boolean).length : 0,
        status: st.status
      };
    }
    if (match.gameType === "ludo") {
      return {
        gameType: "ludo",
        rollId: st.rollId || 0,
        moveId: st.lastMove?.moveId || st.moveSeq || 0,
        status: st.status
      };
    }
    return null;
  }

  function handleMatchSoundTransition(match) {
    if (!match || !match.state) return;
    const prev = matchSoundSnapshots.get(match.id);
    const curr = snapshotMatchForSounds(match);
    if (!curr) return;

    if (!prev) {
      matchSoundSnapshots.set(match.id, curr);
      return;
    }

    matchSoundSnapshots.set(match.id, curr);
    const st = match.state;

    if (match.gameType === "chess") {
      if (curr.status === "completed" && prev.status !== "completed") {
        playGameSound(st.winner === "draw" ? "draw" : "chessEnd");
      } else if (curr.moveCount > prev.moveCount) {
        if (st.inCheck) playGameSound("chessCheck");
        else if (st.lastMove?.captured) playGameSound("chessCapture");
        else playGameSound("chessMove");
      }
    } else if (match.gameType === "tictactoe") {
      if (curr.status === "completed" && prev.status !== "completed") {
        playGameSound(st.winner === "draw" ? "draw" : "tttWin");
      } else if (curr.moveCount > prev.moveCount) {
        const justPlayed = st.turn === "X" ? "O" : "X";
        playGameSound(justPlayed === "X" ? "tttPlaceX" : "tttPlaceO");
      }
    } else if (match.gameType === "ludo") {
      if (curr.status === "completed" && prev.status !== "completed") {
        playGameSound("ludoWin");
      }
    }
  }

  let lobbyState = {
    roomId: "MAIN",
    gamesEnabled: false,
    owner: "System",
    matches: [],
    pendingInvites: []
  };

  let currentMatchId = null;
  let currentMatch = null;
  let isPanelOpen = false;
  let isMinimized = false;
  let isExpanded = false;
  let chessFlipped = false;
  let chessSelectedSquare = null;
  let chessLegalTargets = [];
  let pendingPromotionMove = null;
  let chessClockTimer = null;
  let lastTimeoutClaimMatchId = null;
  let dragState = null;
  let customPosition = null;
  let socketBound = null;

  /* ── Ludo Dice & Step Animation State ──────────────────────── */
  let ludoIsRolling = false;
  let ludoIsAnimatingMove = false;
  let ludoRollAnimTimer = null;
  let ludoEventBannerTimer = null;
  let ludoLastRenderedMatchId = null;
  let lastSeenLudoRollId = 0;
  let lastAnimatedLudoMoveId = 0;
  let ludoAnimationRunToken = 0;

  function escapeGamesHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getBridge() {
    return window.SyncTuneGamesBridge || null;
  }

  function getSocket() {
    return getBridge()?.getSocket?.() || null;
  }

  function getCurrentUser() {
    return getBridge()?.getCurrentUser?.() || { username: "", isAdmin: false };
  }

  function getRoomCtx() {
    return (
      getBridge()?.getRoomContext?.() || {
        roomId: "MAIN",
        owner: "System",
        isOwner: false,
        plugins: { games: false },
        members: []
      }
    );
  }

  function showGamesError(msg) {
    const el = g$("gamesActionError");
    if (!el) return;
    if (!msg) {
      el.textContent = "";
      el.classList.add("hidden");
    } else {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  /* ── Floating Panel Open / Minimize / Expand / Close / Drag ── */
  function syncFabIndicators() {
    const fab = g$("gamesLoungeFab");
    const badge = g$("gamesFabInviteBadge");
    const statusPill = g$("gamesFabStatusPill");
    const user = getCurrentUser();

    const myInvites = (lobbyState.pendingInvites || []).filter(
      inv =>
        inv.status === "pending" &&
        inv.toUsername.toLowerCase() === String(user.username || "").toLowerCase()
    );

    if (badge) {
      badge.textContent = String(myInvites.length);
      badge.classList.toggle("hidden", myInvites.length === 0);
    }

    const activeMatch =
      currentMatch && ["waiting", "active"].includes(currentMatch.status) ? currentMatch : null;

    if (statusPill) {
      if (activeMatch) {
        const labelMap = { chess: "Chess", ludo: "Ludo", tictactoe: "TTT" };
        const gameLabel = labelMap[activeMatch.gameType] || "Match";
        const isTurn =
          activeMatch.state?.turnUsername &&
          activeMatch.state.turnUsername.toLowerCase() === String(user.username || "").toLowerCase();
        statusPill.textContent =
          activeMatch.status === "waiting"
            ? `${gameLabel} · Waiting`
            : isTurn
            ? `${gameLabel} · Your Turn`
            : `${gameLabel} · Live`;
        statusPill.classList.remove("hidden");
      } else {
        statusPill.classList.add("hidden");
      }
    }

    if (fab) {
      fab.setAttribute("aria-expanded", String(isPanelOpen && !isMinimized));
      fab.classList.toggle("has-active-match", Boolean(activeMatch));
    }

    const sidebarGamesBadge = g$("sidebarGamesBadge");
    if (sidebarGamesBadge) {
      const liveMatchesCount = (lobbyState.matches || []).filter(m => m.status === "active" || m.status === "waiting").length;
      if (activeMatch) {
        sidebarGamesBadge.textContent = "ACTIVE";
        sidebarGamesBadge.classList.remove("hidden");
      } else if (myInvites.length > 0) {
        sidebarGamesBadge.textContent = `${myInvites.length}`;
        sidebarGamesBadge.classList.remove("hidden");
      } else if (liveMatchesCount > 0) {
        sidebarGamesBadge.textContent = `${liveMatchesCount}`;
        sidebarGamesBadge.classList.remove("hidden");
      } else {
        sidebarGamesBadge.classList.add("hidden");
      }
    }
  }

  function applyPanelLayout() {
    const panel = g$("gamesLoungePanel");
    if (!panel) return;
    panel.classList.toggle("hidden", !isPanelOpen);
    panel.classList.toggle("is-minimized", isMinimized);
    panel.classList.toggle("is-expanded", isExpanded && !isMinimized);

    if (isExpanded || window.innerWidth <= 768) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
    } else if (customPosition) {
      const clampedX = Math.max(12, Math.min(window.innerWidth - panel.offsetWidth - 12, customPosition.x));
      const clampedY = Math.max(12, Math.min(window.innerHeight - 60, customPosition.y));
      panel.style.left = `${clampedX}px`;
      panel.style.top = `${clampedY}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    }

    if (g$("gamesBackToLobbyBtn")) {
      g$("gamesBackToLobbyBtn").classList.toggle("hidden", !currentMatch);
    }
    if (g$("gamesExpandBtn")) {
      g$("gamesExpandBtn").setAttribute("title", isExpanded ? "Restore size" : "Expand Games Lounge");
    }
    syncFabIndicators();
  }

  function openPanel() {
    isPanelOpen = true;
    isMinimized = false;
    applyPanelLayout();
    const sock = getSocket();
    if (sock && sock.connected) {
      sock.emit("games:getState");
    }
  }

  function closePanelPreserveMatch() {
    isPanelOpen = false;
    isMinimized = false;
    applyPanelLayout();
  }

  function toggleMinimizePanel() {
    if (!isPanelOpen) {
      openPanel();
      return;
    }
    isMinimized = !isMinimized;
    applyPanelLayout();
  }

  function toggleExpandPanel() {
    if (isMinimized) isMinimized = false;
    isExpanded = !isExpanded;
    applyPanelLayout();
  }

  function setupPanelDragging() {
    const header = g$("gamesPanelHeader");
    const panel = g$("gamesLoungePanel");
    if (!header || !panel) return;

    header.addEventListener("pointerdown", e => {
      if (e.target.closest("button") || isExpanded || window.innerWidth <= 768) return;
      const rect = panel.getBoundingClientRect();
      dragState = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top
      };
      panel.classList.add("is-dragging");
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener("pointermove", e => {
      if (!dragState) return;
      const nextX = Math.max(12, Math.min(window.innerWidth - panel.offsetWidth - 12, e.clientX - dragState.offsetX));
      const nextY = Math.max(12, Math.min(window.innerHeight - 64, e.clientY - dragState.offsetY));
      customPosition = { x: nextX, y: nextY };
      panel.style.left = `${nextX}px`;
      panel.style.top = `${nextY}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });

    const endDrag = () => {
      if (!dragState) return;
      dragState = null;
      panel.classList.remove("is-dragging");
    };
    header.addEventListener("pointerup", endDrag);
    header.addEventListener("pointercancel", endDrag);
  }

  /* ── Invite Toast Notifications ───────────────────────────── */
  function showInviteToast(invite) {
    const container = g$("gamesInviteToastContainer");
    if (!container || !invite) return;
    if (container.querySelector(`[data-toast-invite="${CSS.escape(invite.id)}"]`)) return;

    const labelMap = { chess: "Chess", ludo: "Ludo", tictactoe: "Tic Tac Toe" };
    const toast = document.createElement("div");
    toast.className = "games-invite-toast";
    toast.dataset.toastInvite = invite.id;
    toast.innerHTML = `
      <div class="games-toast-copy">
        <strong>${escapeGamesHtml(invite.fromUsername)} invited you to play ${escapeGamesHtml(
      labelMap[invite.gameType] || invite.gameType
    )}</strong>
        <span class="muted">Room ${escapeGamesHtml(invite.roomId)} · Real-time multiplayer</span>
      </div>
      <div class="games-toast-actions">
        <button type="button" class="games-primary-btn" data-toast-accept="${escapeGamesHtml(invite.id)}">Accept</button>
        <button type="button" class="small-btn" data-toast-decline="${escapeGamesHtml(invite.id)}">Decline</button>
      </div>
    `;
    container.appendChild(toast);

    toast.querySelector("[data-toast-accept]")?.addEventListener("click", () => {
      respondToInvite(invite.id, true);
      toast.remove();
    });
    toast.querySelector("[data-toast-decline]")?.addEventListener("click", () => {
      respondToInvite(invite.id, false);
      toast.remove();
    });

    setTimeout(() => {
      toast.remove();
    }, 20000);
  }

  function respondToInvite(inviteId, accept) {
    showGamesError("");
    const sock = getSocket();
    if (!sock) return;
    sock.emit("games:respondInvite", { inviteId, accept }, res => {
      if (!res?.ok) {
        showGamesError(res?.error || "Could not respond to invitation.");
        return;
      }
      if (accept && res.match) {
        openMatchInPanel(res.match);
      }
    });
  }

  /* ── Render Admin Enablement Gate & Lobby View ────────────── */
  function renderGamesGateAndHeader() {
    const ctx = getRoomCtx();
    const enabled = Boolean(lobbyState.gamesEnabled || ctx.plugins?.games);
    const isAdmin = Boolean(ctx.isOwner);

    const statusBadge = g$("gamesAdminStatusBadge");
    if (statusBadge) {
      statusBadge.textContent = enabled ? "Enabled" : "Disabled";
      statusBadge.classList.toggle("is-enabled", enabled);
    }

    const quickEnableBtn = g$("gamesQuickEnableBtn");
    if (quickEnableBtn) {
      quickEnableBtn.classList.toggle("hidden", enabled || !isAdmin);
    }

    const disabledBanner = g$("gamesDisabledBanner");
    const lobbyView = g$("gamesLobbyView");
    const matchView = g$("gamesMatchView");
    const bannerEnableBtn = g$("gamesBannerEnableBtn");
    const disabledMsg = g$("gamesDisabledMessage");

    if (!enabled) {
      if (disabledBanner) disabledBanner.classList.remove("hidden");
      if (lobbyView) lobbyView.classList.add("hidden");
      if (matchView) matchView.classList.add("hidden");
      if (bannerEnableBtn) bannerEnableBtn.classList.toggle("hidden", !isAdmin);
      if (disabledMsg) {
        disabledMsg.textContent = isAdmin
          ? "As Room Admin, enable Multiplayer Games Lounge so team members can create and play Chess, Ludo, and Tic Tac Toe."
          : `All room features are enabled exclusively by the Room Admin (${ctx.owner || "System"}). Ask the Room Admin to enable Multiplayer Games Lounge.`;
      }
    } else {
      if (disabledBanner) disabledBanner.classList.add("hidden");
      if (currentMatch) {
        if (lobbyView) lobbyView.classList.add("hidden");
        if (matchView) matchView.classList.remove("hidden");
      } else {
        if (lobbyView) lobbyView.classList.remove("hidden");
        if (matchView) matchView.classList.add("hidden");
      }
    }
  }

  function renderLobbyView() {
    renderGamesGateAndHeader();
    const user = getCurrentUser();
    const ctx = getRoomCtx();

    // Pending invites for current user
    const myInvites = (lobbyState.pendingInvites || []).filter(
      inv =>
        inv.status === "pending" &&
        inv.toUsername.toLowerCase() === String(user.username || "").toLowerCase()
    );
    const invSection = g$("gamesPendingInvitesSection");
    const invList = g$("gamesPendingInvitesList");
    if (invSection && invList) {
      invSection.classList.toggle("hidden", myInvites.length === 0);
      invList.innerHTML = "";
      myInvites.forEach(inv => {
        const labelMap = { chess: "Chess", ludo: "Ludo", tictactoe: "Tic Tac Toe" };
        const row = document.createElement("div");
        row.className = "games-invite-row";
        row.innerHTML = `
          <div>
            <strong>${escapeGamesHtml(inv.fromUsername)}</strong> invited you to <strong>${escapeGamesHtml(
          labelMap[inv.gameType] || inv.gameType
        )}</strong>
          </div>
          <div class="games-invite-row-actions">
            <button type="button" class="games-primary-btn" data-accept-invite="${escapeGamesHtml(inv.id)}">Accept</button>
            <button type="button" class="small-btn" data-decline-invite="${escapeGamesHtml(inv.id)}">Decline</button>
          </div>
        `;
        invList.appendChild(row);
      });
      invList.querySelectorAll("[data-accept-invite]").forEach(b => {
        b.addEventListener("click", () => respondToInvite(b.dataset.acceptInvite, true));
      });
      invList.querySelectorAll("[data-decline-invite]").forEach(b => {
        b.addEventListener("click", () => respondToInvite(b.dataset.declineInvite, false));
      });
    }

    // Matches list
    const matchesList = g$("gamesActiveMatchesList");
    const matches = lobbyState.matches || [];
    if (g$("gamesMatchCountBadge")) {
      g$("gamesMatchCountBadge").textContent = String(matches.length);
    }
    if (matchesList) {
      matchesList.innerHTML = "";
      if (!matches.length) {
        matchesList.innerHTML = '<div class="queue-empty">No room matches yet. Create a Chess, Ludo, or Tic Tac Toe match!</div>';
      } else {
        matches.forEach(m => {
          const isPlayer = (m.players || []).some(
            p => p.toLowerCase() === String(user.username || "").toLowerCase()
          );
          const gameTitle = { chess: "Chess", ludo: "Ludo", tictactoe: "Tic Tac Toe" }[m.gameType] || m.gameType;
          const maxP = m.gameType === "ludo" ? m.options?.maxPlayers || 4 : 2;
          const statusLabel =
            m.status === "waiting"
              ? `Waiting (${m.players.length}/${maxP})`
              : m.status === "active"
              ? "In Progress"
              : m.winner === "draw"
              ? "Completed · Draw"
              : `Completed · Winner: ${m.winner || "—"}`;

          const actionBtnHtml = isPlayer
            ? `<button type="button" class="games-primary-btn" data-open-match="${escapeGamesHtml(m.id)}">${
                m.status === "completed" ? "View Result" : "Resume"
              }</button>`
            : m.status === "waiting" && m.players.length < maxP
            ? `<button type="button" class="games-primary-btn" data-join-match="${escapeGamesHtml(m.id)}">Join</button>
               <button type="button" class="small-btn" data-spectate-match="${escapeGamesHtml(m.id)}">Spectate</button>`
            : `<button type="button" class="small-btn" data-spectate-match="${escapeGamesHtml(m.id)}">Spectate</button>`;

          const gameMiniLogo = {
            chess: `<svg class="game-mini-logo" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#689F38"/><g transform="translate(9.5, 9.5)"><path d="M22 8.5C32.5 9.5 38.5 16.5 38 37.5H15C15 28.5 25 26 23 11.5" fill="#FFFFFF" stroke="#2B471A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 16.5C24.38 19.41 18.45 23.87 16 25.5C13 27.5 13.18 29.84 11 29.5C9.96 28.56 12.41 26.46 11 26.5C10 26.5 11.19 27.73 10 28.5C9 28.5 6 29.5 6 24.5C6 22.5 12 12.5 12 12.5C12 12.5 13.89 10.6 14 9C13.27 8.01 13.5 7 13.5 6C14.5 5 16.5 8.5 16.5 8.5H18.5C18.5 8.5 19.28 6.51 21 5.5C22 5.5 22 8.5 22 8.5Z" fill="#FFFFFF" stroke="#2B471A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="37.5" width="28" height="4.4" rx="2.2" fill="#F1F8E9" stroke="#2B471A" stroke-width="1.6"/></g></svg>`,
            ludo: `<svg class="game-mini-logo" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#FFFFFF"/><rect x="4" y="4" width="22" height="22" rx="5" fill="#E53935"/><rect x="38" y="4" width="22" height="22" rx="5" fill="#43A047"/><rect x="4" y="38" width="22" height="22" rx="5" fill="#1E88E5"/><rect x="38" y="38" width="22" height="22" rx="5" fill="#FBC02D"/><polygon points="23,23 32,32 23,41" fill="#E53935"/><polygon points="23,23 41,23 32,32" fill="#43A047"/><polygon points="41,23 41,41 32,32" fill="#FBC02D"/><polygon points="23,41 41,41 32,32" fill="#1E88E5"/><circle cx="32" cy="32" r="7" fill="#FFFFFF"/><path d="M27.6 34.4 28.7 29.5l3.3 2.4 3.3-2.4 1.1 4.9H27.6Z" fill="#F59E0B"/></svg>`,
            tictactoe: `<svg class="game-mini-logo" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#1E293B"/><path d="M14 14l10 10m0-10-10 10" stroke="#38BDF8" stroke-width="4" stroke-linecap="round"/><circle cx="44" cy="44" r="7" stroke="#FB7185" stroke-width="4"/></svg>`
          }[m.gameType] || "";

          const row = document.createElement("div");
          row.className = "games-match-row";
          row.innerHTML = `
            <div class="games-match-row-info">
              <div class="games-match-row-top">
                ${gameMiniLogo}
                <strong>${escapeGamesHtml(gameTitle)}</strong>
                <span class="plugin-status-badge ${m.status === "active" ? "is-enabled" : ""}">${escapeGamesHtml(statusLabel)}</span>
              </div>
              <span class="muted">Players: ${escapeGamesHtml((m.players || []).join(" vs ")) || "—"}</span>
            </div>
            <div class="games-match-row-actions">${actionBtnHtml}</div>
          `;
          matchesList.appendChild(row);
        });

        matchesList.querySelectorAll("[data-open-match]").forEach(btn => {
          btn.addEventListener("click", () => {
            const target = matches.find(x => x.id === btn.dataset.openMatch);
            if (target) openMatchInPanel(target);
          });
        });
        matchesList.querySelectorAll("[data-join-match]").forEach(btn => {
          btn.addEventListener("click", () => joinMatch(btn.dataset.joinMatch));
        });
        matchesList.querySelectorAll("[data-spectate-match]").forEach(btn => {
          btn.addEventListener("click", () => spectateMatch(btn.dataset.spectateMatch));
        });
      }
    }

    // Online Room Players list (with direct Challenge buttons!)
    const playersList = g$("gamesAvailablePlayersList");
    const onlineMembers = (ctx.members || []).filter(
      m => m?.username && m.username.toLowerCase() !== String(user.username || "").toLowerCase()
    );
    if (g$("gamesPlayerCountBadge")) {
      g$("gamesPlayerCountBadge").textContent = String(onlineMembers.length);
    }
    if (playersList) {
      playersList.innerHTML = "";
      if (!onlineMembers.length) {
        playersList.innerHTML =
          '<div class="queue-empty">Invite teammates to this room to challenge them directly.</div>';
      } else {
        onlineMembers.forEach(member => {
          const row = document.createElement("div");
          row.className = "games-player-row";
          row.innerHTML = `
            <div class="games-player-ident">
              <span class="member-avatar">${escapeGamesHtml(member.username.slice(0, 1).toUpperCase())}</span>
              <div>
                <strong>${escapeGamesHtml(member.username)}</strong>
                <span class="muted">${member.isOwner ? "Room Admin" : "Online Member"}</span>
              </div>
            </div>
            <div class="games-player-challenge-btns">
              <button type="button" class="small-btn" data-challenge-user="${escapeGamesHtml(member.username)}" data-challenge-game="chess">Chess</button>
              <button type="button" class="small-btn" data-challenge-user="${escapeGamesHtml(member.username)}" data-challenge-game="ludo">Ludo</button>
              <button type="button" class="small-btn" data-challenge-user="${escapeGamesHtml(member.username)}" data-challenge-game="tictactoe">TTT</button>
            </div>
          `;
          playersList.appendChild(row);
        });

        playersList.querySelectorAll("[data-challenge-user]").forEach(btn => {
          btn.addEventListener("click", () => {
            createMatch(btn.dataset.challengeGame, [btn.dataset.challengeUser]);
          });
        });
      }
    }

    syncFabIndicators();
  }

  /* ── Match Lifecycle Actions ──────────────────────────────── */
  function createMatch(gameType, inviteUsernames = []) {
    showGamesError("");
    const sock = getSocket();
    if (!sock) return;

    const options =
      gameType === "chess"
        ? { timeMinutes: Number(g$("chessTimeSelect")?.value || 10) }
        : gameType === "ludo"
        ? { maxPlayers: Number(g$("ludoPlayersSelect")?.value || 4) }
        : {};

    sock.emit("games:createMatch", { gameType, options, inviteUsernames }, res => {
      if (!res?.ok) {
        showGamesError(res?.error || "Unable to create match.");
        return;
      }
      openMatchInPanel(res.match);
    });
  }

  function joinMatch(matchId) {
    showGamesError("");
    const sock = getSocket();
    if (!sock) return;
    sock.emit("games:joinMatch", { matchId }, res => {
      if (!res?.ok) {
        showGamesError(res?.error || "Unable to join match.");
        return;
      }
      openMatchInPanel(res.match);
    });
  }

  function spectateMatch(matchId) {
    showGamesError("");
    const sock = getSocket();
    if (!sock) return;
    sock.emit("games:spectateMatch", { matchId }, res => {
      if (!res?.ok) {
        showGamesError(res?.error || "Unable to spectate match.");
        return;
      }
      openMatchInPanel(res.match);
    });
  }

  function openMatchInPanel(match) {
    if (!match) return;
    if (currentMatchId !== match.id) {
      const snap = snapshotMatchForSounds(match);
      if (snap) matchSoundSnapshots.set(match.id, snap);
    }
    if (ludoLastRenderedMatchId !== match.id) {
      ludoLastRenderedMatchId = null;
      ludoIsRolling = false;
      ludoIsAnimatingMove = false;
      ludoAnimationRunToken += 1;
    }
    currentMatchId = match.id;
    currentMatch = match;
    chessSelectedSquare = null;
    chessLegalTargets = [];
    pendingPromotionMove = null;
    lastTimeoutClaimMatchId = null;
    isPanelOpen = true;
    isMinimized = false;
    renderCurrentMatch();
    applyPanelLayout();
  }

  function returnToLobby() {
    currentMatchId = null;
    currentMatch = null;
    chessSelectedSquare = null;
    chessLegalTargets = [];
    pendingPromotionMove = null;
    ludoLastRenderedMatchId = null;
    ludoIsRolling = false;
    ludoIsAnimatingMove = false;
    ludoAnimationRunToken += 1;
    if (ludoRollAnimTimer) {
      clearInterval(ludoRollAnimTimer);
      ludoRollAnimTimer = null;
    }
    stopChessClockTimer();
    renderLobbyView();
    applyPanelLayout();
  }

  /* ── Active Match Rendering (Shared Bar + Stages) ─────────── */
  function renderCurrentMatch() {
    renderGamesGateAndHeader();
    if (!currentMatch) {
      stopChessClockTimer();
      return;
    }

    const user = getCurrentUser();
    const ctx = getRoomCtx();
    const m = currentMatch;
    const isPlayer = (m.players || []).some(
      p => p.toLowerCase() === String(user.username || "").toLowerCase()
    );
    const isHost =
      String(m.hostUsername || "").toLowerCase() === String(user.username || "").toLowerCase() ||
      ctx.isOwner;
    const maxP = m.gameType === "ludo" ? m.options?.maxPlayers || 4 : 2;

    const titleMap = { chess: "CHESS", ludo: "LUDO", tictactoe: "TIC TAC TOE" };
    if (g$("matchGameBadge")) g$("matchGameBadge").textContent = titleMap[m.gameType] || "GAME";
    if (g$("matchSpectatorBadge")) {
      const sCount = (m.spectators || []).length;
      g$("matchSpectatorBadge").textContent = `${sCount} Spectator${sCount === 1 ? "" : "s"}`;
    }

    const statusBadge = g$("matchStatusBadge");
    if (statusBadge) {
      if (!isPlayer) {
        statusBadge.textContent = m.status === "completed" ? "Spectating · Ended" : "Spectating";
        statusBadge.classList.remove("is-enabled");
      } else if (m.status === "waiting") {
        statusBadge.textContent = `Waiting (${m.players.length}/${maxP})`;
        statusBadge.classList.remove("is-enabled");
      } else if (m.status === "active") {
        const myTurn =
          m.state?.turnUsername &&
          m.state.turnUsername.toLowerCase() === String(user.username || "").toLowerCase();
        statusBadge.textContent = myTurn ? "Your Turn" : `${m.state?.turnUsername || "Opponent"}'s Turn`;
        statusBadge.classList.toggle("is-enabled", myTurn);
      } else {
        statusBadge.textContent = "Completed";
        statusBadge.classList.remove("is-enabled");
      }
    }

    // Waiting controls & Invite dropdown
    const waitBanner = g$("matchWaitingBanner");
    const waitInviteWrap = g$("matchWaitInviteWrap");
    const startNowBtn = g$("matchStartNowBtn");
    const rematchBtn = g$("matchRematchBtn");

    if (waitBanner) {
      waitBanner.classList.toggle("hidden", m.status !== "waiting");
      if (g$("matchWaitingTitle")) {
        g$("matchWaitingTitle").textContent =
          m.gameType === "ludo" && m.players.length >= 2
            ? `Ready to start (${m.players.length}/${maxP} joined)`
            : `Waiting for opponent (${m.players.length}/${maxP} joined)...`;
      }
      if (g$("matchWaitingPlayers")) {
        g$("matchWaitingPlayers").textContent = `Players joined: ${(m.players || []).join(", ")}`;
      }
    }

    if (waitInviteWrap) {
      const showInvite = m.status === "waiting" && isPlayer;
      waitInviteWrap.classList.toggle("hidden", !showInvite);
      const sel = g$("matchInvitePlayerSelect");
      if (sel && showInvite) {
        const prev = sel.value;
        const candidates = (ctx.members || []).filter(
          mem =>
            mem?.username &&
            !m.players.some(p => p.toLowerCase() === mem.username.toLowerCase())
        );
        sel.innerHTML = '<option value="">Invite player...</option>';
        candidates.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.username;
          opt.textContent = c.username;
          sel.appendChild(opt);
        });
        if (prev && candidates.some(c => c.username === prev)) sel.value = prev;
      }
    }

    if (startNowBtn) {
      startNowBtn.classList.toggle("hidden", !(m.status === "waiting" && isHost && m.players.length >= 2));
    }
    if (rematchBtn) {
      rematchBtn.classList.toggle("hidden", !(m.status === "completed" && isPlayer));
    }

    // Result Banner
    const resBanner = g$("gamesResultBanner");
    if (resBanner) {
      resBanner.classList.toggle("hidden", m.status !== "completed");
      if (m.status === "completed") {
        const winner = m.state?.winnerUsername || m.state?.winner || m.winner;
        if (g$("gamesResultTitle")) {
          g$("gamesResultTitle").textContent =
            winner === "draw"
              ? "Match Drawn"
              : winner
              ? `${winner} Wins!`
              : "Match Completed";
        }
        if (g$("gamesResultSubtitle")) {
          g$("gamesResultSubtitle").textContent =
            m.state?.reason ||
            (m.gameType === "ludo" && Array.isArray(m.state?.rankings)
              ? `Final Rankings: ${m.state.rankings.map((u, idx) => `#${idx + 1} ${u}`).join(" · ")}`
              : "Challenge again with Play Rematch.");
        }
        if (g$("gamesBannerRematchBtn")) {
          g$("gamesBannerRematchBtn").classList.toggle("hidden", !isPlayer);
        }
      }
    }

    // Stage visibility
    if (g$("chessStage")) g$("chessStage").classList.toggle("hidden", m.gameType !== "chess" || !m.state);
    if (g$("ludoStage")) g$("ludoStage").classList.toggle("hidden", m.gameType !== "ludo" || !m.state);
    if (g$("tttStage")) g$("tttStage").classList.toggle("hidden", m.gameType !== "tictactoe" || !m.state);

    if (m.state) {
      handleMatchSoundTransition(m);
      if (m.gameType === "chess") {
        renderChessStage(m, isPlayer);
      } else if (m.gameType === "ludo") {
        stopChessClockTimer();
        renderLudoStage(m, isPlayer);
      } else if (m.gameType === "tictactoe") {
        stopChessClockTimer();
        renderTttStage(m, isPlayer);
      }
    } else {
      stopChessClockTimer();
    }

    syncFabIndicators();
  }

  /* ═══════════════════════════════════════════════════════════
     CHESS CLIENT BOARD, LEGAL MOVE HIGHLIGHTER & CLOCKS
     ═══════════════════════════════════════════════════════════ */
  const CHESS_SVGS = {
    k: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><g fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" fill="none" stroke="var(--piece-detail)"/></g></svg>`,
    q: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><g fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linejoin="round"><circle cx="6" cy="12" r="2.6"/><circle cx="14" cy="9" r="2.6"/><circle cx="22.5" cy="8" r="2.6"/><circle cx="31" cy="9" r="2.6"/><circle cx="39" cy="12" r="2.6"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-13.5V25L7 14l2 12z"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="var(--piece-detail)"/></g></svg>`,
    r: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><g fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke="var(--piece-detail)"/></g></svg>`,
    b: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><g fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><g><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><circle cx="22.5" cy="8" r="2.5"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" fill="none" stroke="var(--piece-detail)"/></g></svg>`,
    n: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><g fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/></g></svg>`,
    p: c =>
      `<svg viewBox="0 0 45 45" class="chess-piece-svg ${c === "w" ? "is-white" : "is-black"}"><path fill="currentColor" stroke="var(--piece-stroke)" stroke-width="1.6" stroke-linecap="round" d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></svg>`
  };

  function inChessBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function isSquareAttackedClient(board, tr, tc, attacker) {
    const pDir = attacker === "w" ? 1 : -1;
    for (const dc of [-1, 1]) {
      const pr = tr + pDir;
      const pc = tc + dc;
      if (inChessBounds(pr, pc) && board[pr][pc]?.color === attacker && board[pr][pc]?.type === "p") return true;
    }
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = tr + dr;
      const nc = tc + dc;
      if (inChessBounds(nr, nc) && board[nr][nc]?.color === attacker && board[nr][nc]?.type === "n") return true;
    }
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let nr = tr + dr;
      let nc = tc + dc;
      while (inChessBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p) {
          if (p.color === attacker && (p.type === "b" || p.type === "q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = tr + dr;
      let nc = tc + dc;
      while (inChessBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p) {
          if (p.color === attacker && (p.type === "r" || p.type === "q")) return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = tr + dr;
        const nc = tc + dc;
        if (inChessBounds(nr, nc) && board[nr][nc]?.color === attacker && board[nr][nc]?.type === "k") return true;
      }
    }
    return false;
  }

  function isKingInCheckClient(board, color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]?.color === color && board[r][c]?.type === "k") {
          return isSquareAttackedClient(board, r, c, color === "w" ? "b" : "w");
        }
      }
    }
    return false;
  }

  function computeClientLegalMoves(state, r, c) {
    const board = state.board;
    const piece = board[r]?.[c];
    if (!piece) return [];
    const color = piece.color;
    const enemy = color === "w" ? "b" : "w";
    const pseudo = [];

    if (piece.type === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoRow = color === "w" ? 0 : 7;
      const r1 = r + dir;
      if (inChessBounds(r1, c) && !board[r1][c]) {
        pseudo.push({ r: r1, c, isPromotion: r1 === promoRow });
        const r2 = r + dir * 2;
        if (r === startRow && inChessBounds(r2, c) && !board[r2][c]) pseudo.push({ r: r2, c });
      }
      for (const dc of [-1, 1]) {
        const nc = c + dc;
        if (!inChessBounds(r1, nc)) continue;
        if (board[r1][nc]?.color === enemy) {
          pseudo.push({ r: r1, c: nc, isPromotion: r1 === promoRow, isCapture: true });
        } else if (state.enPassant && state.enPassant.r === r1 && state.enPassant.c === nc) {
          if (board[r][nc]?.color === enemy && board[r][nc]?.type === "p") {
            pseudo.push({ r: r1, c: nc, isEnPassant: true, isCapture: true });
          }
        }
      }
    } else if (piece.type === "n") {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (inChessBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === enemy)) {
          pseudo.push({ r: nr, c: nc, isCapture: Boolean(board[nr][nc]) });
        }
      }
    } else if (["b", "r", "q"].includes(piece.type)) {
      const dirs = [];
      if (piece.type !== "r") dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (piece.type !== "b") dirs.push([-1,0],[1,0],[0,-1],[0,1]);
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (inChessBounds(nr, nc)) {
          if (!board[nr][nc]) pseudo.push({ r: nr, c: nc });
          else {
            if (board[nr][nc].color === enemy) pseudo.push({ r: nr, c: nc, isCapture: true });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (piece.type === "k") {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (inChessBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === enemy)) {
            pseudo.push({ r: nr, c: nc, isCapture: Boolean(board[nr][nc]) });
          }
        }
      }
      const homeRow = color === "w" ? 7 : 0;
      if (r === homeRow && c === 4 && !isKingInCheckClient(board, color)) {
        if ((color === "w" ? state.castling.wK : state.castling.bK) &&
            board[homeRow][7]?.type === "r" && !board[homeRow][5] && !board[homeRow][6] &&
            !isSquareAttackedClient(board, homeRow, 5, enemy) && !isSquareAttackedClient(board, homeRow, 6, enemy)) {
          pseudo.push({ r: homeRow, c: 6, isCastling: "K" });
        }
        if ((color === "w" ? state.castling.wQ : state.castling.bQ) &&
            board[homeRow][0]?.type === "r" && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
            !isSquareAttackedClient(board, homeRow, 3, enemy) && !isSquareAttackedClient(board, homeRow, 2, enemy)) {
          pseudo.push({ r: homeRow, c: 2, isCastling: "Q" });
        }
      }
    }

    return pseudo.filter(m => {
      const sim = board.map(row => row.map(cell => (cell ? { ...cell } : null)));
      sim[r][c] = null;
      if (m.isEnPassant) sim[r][m.c] = null;
      if (m.isCastling === "K") { sim[r][5] = sim[r][7]; sim[r][7] = null; }
      if (m.isCastling === "Q") { sim[r][3] = sim[r][0]; sim[r][0] = null; }
      sim[m.r][m.c] = { ...piece };
      return !isKingInCheckClient(sim, color);
    });
  }

  function formatChessClockMs(ms) {
    const totalSec = Math.max(0, Math.ceil((ms || 0) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function stopChessClockTimer() {
    if (chessClockTimer) {
      clearInterval(chessClockTimer);
      chessClockTimer = null;
    }
  }

  function updateChessClocksDisplay() {
    if (!currentMatch || currentMatch.gameType !== "chess" || !currentMatch.state) return;
    const st = currentMatch.state;
    const user = getCurrentUser();
    const myColor =
      String(st.players.b || "").toLowerCase() === String(user.username || "").toLowerCase() ? "b" : "w";
    const viewFlipped = chessFlipped !== (myColor === "b");
    const topColor = viewFlipped ? "w" : "b";
    const bottomColor = viewFlipped ? "b" : "w";

    let wMs = st.clocks?.w ?? st.timeControlMs;
    let bMs = st.clocks?.b ?? st.timeControlMs;
    if (st.status === "active" && st.moveHistory?.length > 0 && st.lastTimestamp) {
      const elapsed = Math.max(0, Date.now() - st.lastTimestamp);
      if (st.turn === "w") wMs = Math.max(0, wMs - elapsed);
      else bMs = Math.max(0, bMs - elapsed);
      if ((wMs <= 0 || bMs <= 0) && lastTimeoutClaimMatchId !== currentMatch.id) {
        lastTimeoutClaimMatchId = currentMatch.id;
        getSocket()?.emit("games:chessAction", { matchId: currentMatch.id, action: "claimTimeout" });
      }
    }

    const clocks = { w: wMs, b: bMs };
    if (g$("chessTopClock")) {
      g$("chessTopClock").textContent = formatChessClockMs(clocks[topColor]);
      g$("chessTopClock").classList.toggle("is-low", clocks[topColor] < 30000);
    }
    if (g$("chessBottomClock")) {
      g$("chessBottomClock").textContent = formatChessClockMs(clocks[bottomColor]);
      g$("chessBottomClock").classList.toggle("is-low", clocks[bottomColor] < 30000);
    }
  }

  function sendChessMove(from, to, promotion = null) {
    if (!isSoundMuted) getOrCreateAudioContext();
    const sock = getSocket();
    if (!sock || !currentMatch) return;
    chessSelectedSquare = null;
    chessLegalTargets = [];
    pendingPromotionMove = null;
    if (g$("chessPromotionModal")) g$("chessPromotionModal").classList.add("hidden");
    sock.emit(
      "games:makeMove",
      { matchId: currentMatch.id, move: { from, to, promotion } },
      res => {
        if (!res?.ok) showGamesError(res?.error || "Illegal move.");
      }
    );
  }

  function renderChessStage(match, isPlayer) {
    const st = match.state;
    const user = getCurrentUser();
    const myColor =
      String(st.players.w || "").toLowerCase() === String(user.username || "").toLowerCase()
        ? "w"
        : String(st.players.b || "").toLowerCase() === String(user.username || "").toLowerCase()
        ? "b"
        : null;
    const viewFlipped = chessFlipped !== (myColor === "b");
    const topColor = viewFlipped ? "w" : "b";
    const bottomColor = viewFlipped ? "b" : "w";

    // Player bars
    const setPlayerBar = (barId, nameId, capId, color) => {
      const bar = g$(barId);
      const nameEl = g$(nameId);
      const capEl = g$(capId);
      if (nameEl) nameEl.textContent = st.players[color] || (color === "w" ? "White" : "Black");
      if (bar) {
        bar.classList.toggle("is-turn", st.status === "active" && st.turn === color);
        const chip = bar.querySelector(".chess-color-chip");
        if (chip) {
          chip.className = `chess-color-chip ${color === "w" ? "white" : "black"}`;
          chip.textContent = color === "w" ? "W" : "B";
        }
      }
      if (capEl) {
        const capTypes = st.capturedPieces?.[color] || [];
        const enemyColor = color === "w" ? "b" : "w";
        capEl.innerHTML = capTypes
          .map(t => `<span class="chess-captured-mini">${CHESS_SVGS[t]?.(enemyColor) || ""}</span>`)
          .join("");
      }
    };
    setPlayerBar("chessTopPlayerBar", "chessTopPlayerName", "chessTopCaptured", topColor);
    setPlayerBar("chessBottomPlayerBar", "chessBottomPlayerName", "chessBottomCaptured", bottomColor);

    updateChessClocksDisplay();
    stopChessClockTimer();
    if (st.status === "active") {
      chessClockTimer = setInterval(updateChessClocksDisplay, 250);
    }

    // Check badge & controls
    if (g$("chessCheckBadge")) g$("chessCheckBadge").classList.toggle("hidden", !st.inCheck);
    if (g$("chessUndoBtn")) g$("chessUndoBtn").disabled = !isPlayer || st.status !== "active" || !st.canUndo;
    if (g$("chessDrawBtn")) g$("chessDrawBtn").disabled = !isPlayer || st.status !== "active";
    if (g$("chessResignBtn")) g$("chessResignBtn").disabled = !isPlayer || st.status !== "active";

    // Pending Undo / Draw prompt banner
    const alertPrompt = g$("chessAlertPrompt");
    if (alertPrompt) {
      const undoFrom = st.pendingUndo?.fromUsername;
      const drawFrom = st.pendingDraw?.fromUsername;
      const meLower = String(user.username || "").toLowerCase();

      if (undoFrom && isPlayer && undoFrom.toLowerCase() !== meLower) {
        alertPrompt.classList.remove("hidden");
        alertPrompt.innerHTML = `
          <span><strong>${escapeGamesHtml(undoFrom)}</strong> requested to undo the last move.</span>
          <div class="chess-prompt-btns">
            <button type="button" class="games-primary-btn" data-respond-undo="1">Accept</button>
            <button type="button" class="small-btn" data-respond-undo="0">Decline</button>
          </div>
        `;
        alertPrompt.querySelectorAll("[data-respond-undo]").forEach(btn => {
          btn.addEventListener("click", () => {
            getSocket()?.emit("games:chessAction", {
              matchId: match.id,
              action: "respondUndo",
              payload: { accept: btn.dataset.respondUndo === "1" }
            });
          });
        });
      } else if (drawFrom && isPlayer && drawFrom.toLowerCase() !== meLower) {
        alertPrompt.classList.remove("hidden");
        alertPrompt.innerHTML = `
          <span><strong>${escapeGamesHtml(drawFrom)}</strong> offered a draw.</span>
          <div class="chess-prompt-btns">
            <button type="button" class="games-primary-btn" data-respond-draw="1">Accept Draw</button>
            <button type="button" class="small-btn" data-respond-draw="0">Decline</button>
          </div>
        `;
        alertPrompt.querySelectorAll("[data-respond-draw]").forEach(btn => {
          btn.addEventListener("click", () => {
            getSocket()?.emit("games:chessAction", {
              matchId: match.id,
              action: "respondDraw",
              payload: { accept: btn.dataset.respondDraw === "1" }
            });
          });
        });
      } else if ((undoFrom || drawFrom) && isPlayer) {
        alertPrompt.classList.remove("hidden");
        alertPrompt.innerHTML = `<span>Waiting for opponent response to ${undoFrom ? "undo request" : "draw offer"}...</span>`;
      } else {
        alertPrompt.classList.add("hidden");
        alertPrompt.innerHTML = "";
      }
    }

    // Move history
    const histEl = g$("chessMoveHistory");
    if (histEl) {
      const moves = st.moveHistory || [];
      if (!moves.length) {
        histEl.innerHTML = '<div class="queue-empty">White to open...</div>';
      } else {
        let html = "";
        for (let i = 0; i < moves.length; i += 2) {
          const num = Math.floor(i / 2) + 1;
          const wMove = moves[i];
          const bMove = moves[i + 1];
          html += `
            <div class="chess-hist-row">
              <span class="chess-hist-num">${num}.</span>
              <span class="chess-hist-san">${escapeGamesHtml(wMove.san)}</span>
              <span class="chess-hist-san">${bMove ? escapeGamesHtml(bMove.san) : ""}</span>
            </div>
          `;
        }
        histEl.innerHTML = html;
        histEl.scrollTop = histEl.scrollHeight;
      }
    }

    // Render 8x8 Board
    const grid = g$("chessBoardGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const rows = viewFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const cols = viewFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];
    const isMyTurn = isPlayer && st.status === "active" && st.turn === myColor;

    rows.forEach((r, visualR) => {
      cols.forEach((c, visualC) => {
        const sq = document.createElement("button");
        sq.type = "button";
        const isLight = (r + c) % 2 === 0;
        const piece = st.board[r]?.[c];
        const isSelected = chessSelectedSquare && chessSelectedSquare.r === r && chessSelectedSquare.c === c;
        const isLastMove =
          st.lastMove &&
          ((st.lastMove.from.r === r && st.lastMove.from.c === c) ||
            (st.lastMove.to.r === r && st.lastMove.to.c === c));
        const legalTarget = chessLegalTargets.find(m => m.r === r && m.c === c);
        const isCheckedKing = st.inCheck && piece && piece.type === "k" && piece.color === st.turn;

        sq.className = `chess-square ${isLight ? "is-light" : "is-dark"}${
          isSelected ? " is-selected" : ""
        }${isLastMove ? " is-last-move" : ""}${isCheckedKing ? " is-in-check" : ""}`;
        sq.dataset.r = String(r);
        sq.dataset.c = String(c);
        sq.setAttribute("aria-label", `${"abcdefgh"[c]}${8 - r}`);

        let overlay = "";
        if (visualC === 0) overlay += `<span class="chess-coord-rank">${8 - r}</span>`;
        if (visualR === 7) overlay += `<span class="chess-coord-file">${"abcdefgh"[c]}</span>`;
        if (legalTarget) {
          overlay += piece
            ? '<span class="chess-legal-capture"></span>'
            : '<span class="chess-legal-dot"></span>';
        }
        if (piece && CHESS_SVGS[piece.type]) {
          overlay += CHESS_SVGS[piece.type](piece.color);
        }
        sq.innerHTML = overlay;

        sq.addEventListener("click", () => {
          showGamesError("");
          if (!isMyTurn) return;

          if (legalTarget && chessSelectedSquare) {
            if (legalTarget.isPromotion) {
              pendingPromotionMove = { from: { ...chessSelectedSquare }, to: { r, c } };
              if (g$("chessPromotionModal")) g$("chessPromotionModal").classList.remove("hidden");
              return;
            }
            sendChessMove({ ...chessSelectedSquare }, { r, c }, null);
            return;
          }

          if (piece && piece.color === myColor) {
            if (chessSelectedSquare && chessSelectedSquare.r === r && chessSelectedSquare.c === c) {
              chessSelectedSquare = null;
              chessLegalTargets = [];
            } else {
              chessSelectedSquare = { r, c };
              chessLegalTargets = computeClientLegalMoves(st, r, c);
            }
            renderChessStage(match, isPlayer);
          } else {
            chessSelectedSquare = null;
            chessLegalTargets = [];
            renderChessStage(match, isPlayer);
          }
        });

        grid.appendChild(sq);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     LUDO CLIENT 15x15 BOARD, DICE & ANIMATED TOKENS
     ═══════════════════════════════════════════════════════════ */
  function buildLudoStaticBoardCells(boardEl) {
    if (boardEl.dataset.initialized === "1") return;
    boardEl.dataset.initialized = "1";

    const trackLookup = new Map();
    LUDO_TRACK_COORDS.forEach(([r, c], idx) => {
      trackLookup.set(`${r},${c}`, idx);
    });

    const homeLookup = new Map();
    for (const [col, cells] of Object.entries(LUDO_HOME_STRETCH)) {
      cells.forEach(([r, c]) => homeLookup.set(`${r},${c}`, col));
    }

    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        // Corner 6x6 Yards & 3x3 Center rendered as unified blocks below; skip inner cells except top-left anchor
        const inRedYard = r <= 5 && c <= 5;
        const inGreenYard = r <= 5 && c >= 9;
        const inBlueYard = r >= 9 && c <= 5;
        const inYellowYard = r >= 9 && c >= 9;
        const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

        if (inRedYard || inGreenYard || inBlueYard || inYellowYard || inCenter) {
          continue;
        }

        const cell = document.createElement("div");
        const key = `${r},${c}`;
        const tIdx = trackLookup.get(key);
        const hCol = homeLookup.get(key);

        let cls = "ludo-cell";
        if (tIdx === 0) cls += " is-start-red is-safe";
        else if (tIdx === 13) cls += " is-start-green is-safe";
        else if (tIdx === 26) cls += " is-start-yellow is-safe";
        else if (tIdx === 39) cls += " is-start-blue is-safe";
        else if (tIdx !== undefined && LUDO_SAFE_INDICES.has(tIdx)) cls += " is-safe";
        if (hCol) cls += ` is-home-${hCol}`;

        cell.className = cls;
        cell.style.gridRow = String(r + 1);
        cell.style.gridColumn = String(c + 1);

        if (tIdx !== undefined && LUDO_SAFE_INDICES.has(tIdx)) {
          cell.innerHTML = `<svg viewBox="0 0 24 24" class="ludo-star-icon" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/></svg>`;
        }
        boardEl.appendChild(cell);
      }
    }

    // 4 Corner Yards (6x6)
    const addYard = (col, rowStart, colStart) => {
      const yard = document.createElement("div");
      yard.className = `ludo-yard ludo-yard-${col}`;
      yard.style.gridRow = `${rowStart} / span 6`;
      yard.style.gridColumn = `${colStart} / span 6`;
      yard.innerHTML = `<div class="ludo-yard-inner"><span></span><span></span><span></span><span></span></div>`;
      boardEl.appendChild(yard);
    };
    addYard("red", 1, 1);
    addYard("green", 1, 10);
    addYard("blue", 10, 1);
    addYard("yellow", 10, 10);

    // 3x3 Center Finish House with 4 triangles + Center Interactive Ludo Dice Hub
    const center = document.createElement("div");
    center.className = "ludo-center-home";
    center.style.gridRow = "7 / span 3";
    center.style.gridColumn = "7 / span 3";
    center.innerHTML = `
      <svg viewBox="0 0 100 100" class="ludo-center-svg" aria-hidden="true">
        <polygon points="0,0 50,50 0,100" fill="#ef4444" opacity="0.92"/>
        <polygon points="0,0 100,0 50,50" fill="#22c55e" opacity="0.92"/>
        <polygon points="100,0 100,100 50,50" fill="#eab308" opacity="0.92"/>
        <polygon points="0,100 100,100 50,50" fill="#3b82f6" opacity="0.92"/>
      </svg>
      <button id="ludoCenterDiceBtn" class="ludo-center-dice-btn" type="button" aria-label="Roll Ludo dice">
        <div id="ludoCenterDiceFace" class="ludo-center-dice-face" data-face="6">${renderLudoDiceSvg(6)}</div>
        <span id="ludoCenterDiceTurnChip" class="ludo-center-dice-chip">ROLL</span>
      </button>
    `;
    boardEl.appendChild(center);

    center.querySelector("#ludoCenterDiceBtn")?.addEventListener("click", triggerLudoDiceRollRequest);

    // Dynamic Token Overlay Layer
    const tokenLayer = document.createElement("div");
    tokenLayer.id = "ludoTokenLayer";
    tokenLayer.className = "ludo-token-layer";
    boardEl.appendChild(tokenLayer);
  }

  function getLudoTokenBoardPosition(color, tokenIdx, step) {
    if (step === -1) {
      return LUDO_YARD_SLOTS[color][tokenIdx];
    }
    if (step >= 0 && step <= 50) {
      const gIdx = (LUDO_START_OFFSET[color] + step) % 52;
      return LUDO_TRACK_COORDS[gIdx];
    }
    if (step >= 51 && step <= 55) {
      return LUDO_HOME_STRETCH[color][step - 51];
    }
    return LUDO_FINISH_SLOTS[color];
  }

  function renderLudoDiceSvg(faceVal) {
    const pipPositions = {
      1: [[50, 50]],
      2: [[28, 28], [72, 72]],
      3: [[25, 25], [50, 50], [75, 75]],
      4: [[28, 28], [72, 28], [28, 72], [72, 72]],
      5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
      6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]]
    };
    const pips = pipPositions[faceVal] || pipPositions[6];
    const isOne = faceVal === 1;
    const pipRadius = isOne ? 14 : 10.2;
    return `<svg viewBox="0 0 100 100" class="ludo-dice-svg" aria-hidden="true">${pips
      .map(
        ([cx, cy]) =>
          `<circle cx="${cx}" cy="${cy}" r="${pipRadius}" fill="${isOne ? "#dc2626" : "#0f172a"}"/>`
      )
      .join("")}</svg>`;
  }

  function showLudoEventBanner(text, tone = "info", durationMs = 2400) {
    const banner = g$("ludoEventBanner");
    if (!banner) return;
    if (ludoEventBannerTimer) clearTimeout(ludoEventBannerTimer);
    if (!text) {
      banner.classList.add("hidden");
      banner.textContent = "";
      return;
    }
    banner.textContent = text;
    banner.dataset.tone = tone;
    banner.classList.remove("hidden");
    ludoEventBannerTimer = setTimeout(() => {
      banner.classList.add("hidden");
    }, durationMs);
  }

  function ensurePersistentLudoTokenElements(tokenLayer, activeColors, match, isMyTurn, st) {
    const existingIds = new Set();
    (activeColors || []).forEach(col => {
      for (let idx = 0; idx < 4; idx++) {
        const key = `${col}-${idx}`;
        existingIds.add(key);
        let btn = tokenLayer.querySelector(`[data-token-id="${CSS.escape(key)}"]`);
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.dataset.tokenId = key;
          btn.dataset.color = col;
          btn.dataset.tokenIndex = String(idx);
          btn.setAttribute("aria-label", `${col} token ${idx + 1}`);
          btn.innerHTML = `<span>${idx + 1}</span>`;
          btn.addEventListener("click", () => {
            if (!btn.classList.contains("is-movable") || ludoIsRolling || ludoIsAnimatingMove) return;
            showGamesError("");
            ludoIsAnimatingMove = true;
            syncLudoInteractiveControls();
            getSocket()?.emit(
              "games:makeMove",
              { matchId: currentMatch?.id || match.id, move: { tokenIndex: idx } },
              res => {
                if (!res?.ok) {
                  ludoIsAnimatingMove = false;
                  showGamesError(res?.error || "Unable to move token.");
                  if (currentMatch?.gameType === "ludo" && currentMatch.state) {
                    const user = getCurrentUser();
                    const amPlayer = (currentMatch.players || []).some(
                      p => p.toLowerCase() === String(user.username || "").toLowerCase()
                    );
                    renderLudoStage(currentMatch, amPlayer);
                  }
                }
              }
            );
          });
          tokenLayer.appendChild(btn);
        }
      }
    });

    // Remove any stale token elements from previous matches
    Array.from(tokenLayer.children).forEach(el => {
      if (!existingIds.has(el.dataset.tokenId)) el.remove();
    });
  }

  function layoutLudoTokenMap(tokenLayer, stepSnapshotByColor, movableSet, movingColor, isMyTurn, st) {
    const grouped = new Map();
    Object.entries(stepSnapshotByColor).forEach(([col, steps]) => {
      steps.forEach((step, idx) => {
        const [r, c] = getLudoTokenBoardPosition(col, idx, step);
        const key = `${r.toFixed(2)},${c.toFixed(2)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({ color: col, idx, step, r, c });
      });
    });

    const offsets = [
      [0, 0],
      [-0.16, -0.16],
      [0.16, 0.16],
      [-0.16, 0.16],
      [0.16, -0.16],
      [0, -0.2],
      [0, 0.2]
    ];

    for (const group of grouped.values()) {
      group.forEach((tok, stackIdx) => {
        const btn = tokenLayer.querySelector(`[data-token-id="${CSS.escape(`${tok.color}-${tok.idx}`)}"]`);
        if (!btn) return;
        const [dr, dc] = group.length > 1 ? offsets[stackIdx % offsets.length] : [0, 0];
        const isMovable =
          isMyTurn &&
          !ludoIsRolling &&
          !ludoIsAnimatingMove &&
          st.mustMove &&
          tok.color === movingColor &&
          movableSet.has(tok.idx);

        btn.className = `ludo-token ludo-token-${tok.color}${isMovable ? " is-movable" : ""}${
          tok.step === 56 ? " is-finished" : ""
        }`;
        btn.style.top = `${((tok.r + 0.5 + dr) / 15) * 100}%`;
        btn.style.left = `${((tok.c + 0.5 + dc) / 15) * 100}%`;
        btn.style.setProperty("--scale", group.length > 1 ? "0.84" : "1");
        btn.disabled = !isMovable;
      });
    }
  }

  function triggerLudoDiceRollRequest() {
    if (!currentMatch || currentMatch.gameType !== "ludo" || !currentMatch.state) return;
    if (!isSoundMuted) getOrCreateAudioContext();
    const st = currentMatch.state;
    const user = getCurrentUser();
    const isMyTurn =
      st.status === "active" &&
      String(st.turnUsername || "").toLowerCase() === String(user.username || "").toLowerCase();
    if (!isMyTurn || !st.canRoll || ludoIsRolling || ludoIsAnimatingMove) return;

    showGamesError("");
    ludoIsRolling = true;
    syncLudoInteractiveControls();
    if (g$("ludoDiceLabel")) g$("ludoDiceLabel").textContent = "Rolling...";

    const diceBtns = [g$("ludoDiceBtn"), g$("ludoCenterDiceBtn")].filter(Boolean);
    const diceFaces = [g$("ludoDiceFace"), g$("ludoCenterDiceFace")].filter(Boolean);
    diceBtns.forEach(b => b.classList.add("is-rolling"));
    diceFaces.forEach(f => f.classList.add("is-rolling"));

    getSocket()?.emit("games:ludoRoll", { matchId: currentMatch.id }, res => {
      if (!res?.ok) {
        ludoIsRolling = false;
        diceBtns.forEach(b => b.classList.remove("is-rolling"));
        diceFaces.forEach(f => f.classList.remove("is-rolling"));
        syncLudoInteractiveControls();
        showGamesError(res?.error || "Unable to roll dice.");
        return;
      }
      if (res.match) {
        currentMatch = res.match;
        renderCurrentMatch();
      }
    });
  }

  function syncLudoInteractiveControls() {
    if (!currentMatch || currentMatch.gameType !== "ludo" || !currentMatch.state) return;
    const st = currentMatch.state;
    const user = getCurrentUser();
    const isPlayer = (currentMatch.players || []).some(
      p => p.toLowerCase() === String(user.username || "").toLowerCase()
    );
    const isMyTurn =
      isPlayer &&
      st.status === "active" &&
      String(st.turnUsername || "").toLowerCase() === String(user.username || "").toLowerCase();

    const canClickRoll = isMyTurn && st.canRoll && !ludoIsRolling && !ludoIsAnimatingMove;
    const turnColor = st.turnColor || "red";

    [g$("ludoDiceBtn"), g$("ludoCenterDiceBtn")].forEach(diceBtn => {
      if (!diceBtn) return;
      diceBtn.disabled = !canClickRoll;
      diceBtn.dataset.turnColor = turnColor;
      diceBtn.classList.toggle("can-roll", canClickRoll);
      diceBtn.classList.toggle("is-locked", ludoIsRolling || ludoIsAnimatingMove);
      diceBtn.classList.toggle("is-my-turn", isMyTurn && st.status === "active");
    });

    const centerChip = g$("ludoCenterDiceTurnChip");
    if (centerChip) {
      if (ludoIsRolling) {
        centerChip.textContent = "ROLLING";
      } else if (canClickRoll) {
        centerChip.textContent = "ROLL";
      } else if (isMyTurn && st.mustMove) {
        centerChip.textContent = "MOVE";
      } else {
        centerChip.textContent = st.turnUsername ? String(st.turnUsername).slice(0, 7).toUpperCase() : "WAIT";
      }
    }

    const tokenLayer = g$("ludoTokenLayer");
    if (tokenLayer) {
      const movableSet = new Set(st.validTokenIndices || []);
      Array.from(tokenLayer.children).forEach(btn => {
        const idx = Number(btn.dataset.tokenIndex);
        const col = btn.dataset.color;
        const allowed =
          isMyTurn &&
          !ludoIsRolling &&
          !ludoIsAnimatingMove &&
          st.mustMove &&
          col === st.turnColor &&
          movableSet.has(idx);
        btn.classList.toggle("is-movable", allowed);
        btn.disabled = !allowed;
      });
    }
  }

  function triggerLudoDiceRollVisual(finalDiceValue, onComplete) {
    const diceBtns = [g$("ludoDiceBtn"), g$("ludoCenterDiceBtn")].filter(Boolean);
    const diceFaces = [g$("ludoDiceFace"), g$("ludoCenterDiceFace")].filter(Boolean);
    const valueBadge = g$("ludoDiceValueBadge");
    if (!diceFaces.length) {
      onComplete?.();
      return;
    }

    if (ludoRollAnimTimer) {
      clearInterval(ludoRollAnimTimer);
      ludoRollAnimTimer = null;
    }

    ludoIsRolling = true;
    playGameSound("ludoRoll");
    syncLudoInteractiveControls();
    diceBtns.forEach(btn => {
      btn.classList.remove("is-rolling");
      void btn.offsetWidth;
      btn.classList.add("is-rolling");
    });
    diceFaces.forEach(face => {
      face.classList.remove("is-landed", "is-rolling");
      void face.offsetWidth;
      face.classList.add("is-rolling");
    });

    let frame = 0;
    const tumbleTimer = setInterval(() => {
      frame += 1;
      const previewVal = ((finalDiceValue + frame) % 6) + 1;
      const previewHtml = renderLudoDiceSvg(previewVal);
      diceFaces.forEach(face => {
        face.innerHTML = previewHtml;
      });
      if (valueBadge) valueBadge.textContent = "…";
      if (frame >= 5) {
        clearInterval(tumbleTimer);
        const finalHtml = renderLudoDiceSvg(finalDiceValue);
        diceFaces.forEach(face => {
          face.classList.remove("is-rolling");
          face.innerHTML = finalHtml;
          face.dataset.face = String(finalDiceValue);
          face.classList.add("is-landed");
          setTimeout(() => face.classList.remove("is-landed"), 340);
        });
        diceBtns.forEach(btn => btn.classList.remove("is-rolling"));
        if (valueBadge) valueBadge.textContent = String(finalDiceValue);
        ludoIsRolling = false;
        onComplete?.();
      }
    }, 68);
    ludoRollAnimTimer = tumbleTimer;
  }

  async function animateLudoTokenStepSequence(match, isPlayer, mv) {
    const tokenLayer = g$("ludoTokenLayer");
    if (!tokenLayer || !mv) {
      ludoIsAnimatingMove = false;
      syncLudoInteractiveControls();
      return;
    }

    const runToken = ++ludoAnimationRunToken;
    ludoIsAnimatingMove = true;
    syncLudoInteractiveControls();

    const st = match.state;
    // Build snapshot of positions just BEFORE the move finished
    const preTokens = {};
    (st.activeColors || []).forEach(c => {
      preTokens[c] = [...(st.tokens[c] || [-1, -1, -1, -1])];
    });
    preTokens[mv.color][mv.tokenIndex] = mv.fromStep;
    if (mv.captured?.capturedTokens) {
      mv.captured.capturedTokens.forEach(cap => {
        if (preTokens[cap.victimColor]) {
          preTokens[cap.victimColor][cap.tokenIndex] = cap.fromStep;
        }
      });
    }

    const user = getCurrentUser();
    const isMyTurn =
      isPlayer &&
      st.status === "active" &&
      String(st.turnUsername || "").toLowerCase() === String(user.username || "").toLowerCase();

    layoutLudoTokenMap(tokenLayer, preTokens, new Set(), st.turnColor, false, st);

    const movingBtn = tokenLayer.querySelector(
      `[data-token-id="${CSS.escape(`${mv.color}-${mv.tokenIndex}`)}"]`
    );

    if (mv.fromStep === -1 && mv.toStep === 0) {
      preTokens[mv.color][mv.tokenIndex] = 0;
      layoutLudoTokenMap(tokenLayer, preTokens, new Set(), st.turnColor, false, st);
      playGameSound("ludoStep", { stepIndex: 0, minGapMs: 40 });
      if (movingBtn) movingBtn.classList.add("is-entering-board", "is-moving");
      await new Promise(r => setTimeout(r, 290));
    } else if (mv.fromStep >= 0 && mv.toStep > mv.fromStep) {
      for (let step = mv.fromStep + 1; step <= mv.toStep; step++) {
        if (runToken !== ludoAnimationRunToken) return;
        preTokens[mv.color][mv.tokenIndex] = step;
        layoutLudoTokenMap(tokenLayer, preTokens, new Set(), st.turnColor, false, st);
        playGameSound("ludoStep", { stepIndex: step - mv.fromStep - 1, minGapMs: 40 });
        if (movingBtn) movingBtn.classList.add("is-moving");
        await new Promise(r => setTimeout(r, 120));
      }
    }

    if (runToken !== ludoAnimationRunToken) return;
    if (movingBtn) movingBtn.classList.remove("is-moving", "is-entering-board");

    if (mv.captured?.capturedTokens?.length) {
      playGameSound("ludoCapture");
      showLudoEventBanner(
        `${mv.username} captured ${mv.captured.victim}'s token! Bonus roll!`,
        "capture",
        2600
      );
      mv.captured.capturedTokens.forEach(cap => {
        const vicBtn = tokenLayer.querySelector(
          `[data-token-id="${CSS.escape(`${cap.victimColor}-${cap.tokenIndex}`)}"]`
        );
        if (vicBtn) {
          vicBtn.classList.add("is-captured-victim");
          setTimeout(() => vicBtn.classList.remove("is-captured-victim"), 420);
        }
      });
    } else if (mv.reachedHome) {
      playGameSound("ludoHome");
      showLudoEventBanner(`${mv.username}'s token reached Home! Bonus roll!`, "home", 2600);
      if (movingBtn) {
        movingBtn.classList.add("is-home-arrived");
        setTimeout(() => movingBtn.classList.remove("is-home-arrived"), 500);
      }
    }

    ludoIsAnimatingMove = false;
    layoutLudoTokenMap(
      tokenLayer,
      st.tokens,
      new Set(st.validTokenIndices || []),
      st.turnColor,
      isMyTurn,
      st
    );
    syncLudoInteractiveControls();
  }

  function renderLudoStage(match, isPlayer) {
    const st = match.state;
    const user = getCurrentUser();
    const boardEl = g$("ludoBoardContainer");
    if (!boardEl) return;
    buildLudoStaticBoardCells(boardEl);

    const isFreshMatchLoad = ludoLastRenderedMatchId !== match.id;
    if (isFreshMatchLoad) {
      ludoLastRenderedMatchId = match.id;
      lastSeenLudoRollId = st.rollId || 0;
      lastAnimatedLudoMoveId = st.lastMove?.moveId || st.moveSeq || 0;
      ludoIsRolling = false;
      ludoIsAnimatingMove = false;
      ludoAnimationRunToken += 1;
      showLudoEventBanner("");
    }

    const isMyTurn =
      isPlayer &&
      st.status === "active" &&
      String(st.turnUsername || "").toLowerCase() === String(user.username || "").toLowerCase();

    if (g$("ludoTurnBanner")) {
      g$("ludoTurnBanner").textContent = st.lastAction || `${st.turnUsername}'s turn`;
      g$("ludoTurnBanner").dataset.turnColor = st.turnColor || "red";
    }

    const diceFaces = [g$("ludoDiceFace"), g$("ludoCenterDiceFace")].filter(Boolean);
    const valueBadge = g$("ludoDiceValueBadge");
    const rolledVal = st.diceValue || st.lastDiceValue || st.lastRoll?.dice || 6;
    const hasNewServerRoll = Boolean(st.rollId && st.rollId > lastSeenLudoRollId);

    if (g$("ludoDiceLabel")) {
      g$("ludoDiceLabel").textContent = st.diceValue
        ? `Rolled ${st.diceValue}`
        : isMyTurn && st.canRoll
        ? "Your Turn — Roll Dice!"
        : `Turn: ${st.turnUsername}`;
    }
    if (g$("ludoActionNote")) {
      g$("ludoActionNote").textContent =
        isMyTurn && st.mustMove
          ? "Click a pulsing highlighted token to move"
          : isMyTurn && st.canRoll
          ? "Roll a 6 to move a token out of yard or advance"
          : st.lastRoll?.autoPassed
          ? `Rolled ${rolledVal} with no legal moves`
          : `${st.turnUsername} (${LUDO_COLOR_NAMES[st.turnColor] || ""}) is playing`;
    }

    // Players HUD
    const hud = g$("ludoPlayersHud");
    if (hud) {
      hud.innerHTML = "";
      (st.activeColors || []).forEach(col => {
        const uname = st.colorPlayers[col];
        const homeCount = (st.tokens[col] || []).filter(s => s === 56).length;
        const isCurrent = st.status === "active" && st.turnColor === col;
        const card = document.createElement("div");
        card.className = `ludo-hud-card is-color-${col}${isCurrent ? " is-turn" : ""}`;
        card.innerHTML = `
          <span class="ludo-hud-dot"></span>
          <div class="ludo-hud-info">
            <strong>${escapeGamesHtml(uname)}</strong>
            <span class="muted">${LUDO_COLOR_NAMES[col]} · ${homeCount}/4 Home</span>
          </div>
        `;
        hud.appendChild(card);
      });
    }

    const tokenLayer = g$("ludoTokenLayer");
    if (!tokenLayer) return;
    ensurePersistentLudoTokenElements(tokenLayer, st.activeColors, match, isMyTurn, st);

    const finalizeDiceVisual = () => {
      if (!ludoIsRolling) {
        const svgHtml = renderLudoDiceSvg(rolledVal);
        diceFaces.forEach(face => {
          face.innerHTML = svgHtml;
          face.dataset.face = String(rolledVal);
        });
      }
      if (valueBadge && !ludoIsRolling) {
        valueBadge.textContent = st.rollId ? String(rolledVal) : "–";
      }
      syncLudoInteractiveControls();
    };

    if (hasNewServerRoll) {
      lastSeenLudoRollId = st.rollId;
      triggerLudoDiceRollVisual(rolledVal, () => {
        syncLudoInteractiveControls();
      });
    } else if (!ludoIsRolling) {
      finalizeDiceVisual();
    } else {
      syncLudoInteractiveControls();
    }

    // Step-by-step animated move or direct sync
    const mv = st.lastMove;
    if (mv && mv.moveId > lastAnimatedLudoMoveId) {
      lastAnimatedLudoMoveId = mv.moveId;
      animateLudoTokenStepSequence(match, isPlayer, mv);
    } else if (!ludoIsAnimatingMove) {
      layoutLudoTokenMap(
        tokenLayer,
        st.tokens,
        new Set(st.validTokenIndices || []),
        st.turnColor,
        isMyTurn,
        st
      );
      syncLudoInteractiveControls();
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TIC TAC TOE CLIENT RENDERER
     ═══════════════════════════════════════════════════════════ */
  const TTT_X_SVG = `<svg viewBox="0 0 64 64" class="ttt-mark-svg is-x"><line x1="16" y1="16" x2="48" y2="48" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="48" y1="16" x2="16" y2="48" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>`;
  const TTT_O_SVG = `<svg viewBox="0 0 64 64" class="ttt-mark-svg is-o"><circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" stroke-width="6"/></svg>`;

  function renderTttStage(match, isPlayer) {
    const st = match.state;
    const user = getCurrentUser();
    const pX = Object.keys(st.symbols || {}).find(u => st.symbols[u] === "X") || st.players?.[0] || "Player X";
    const pO = Object.keys(st.symbols || {}).find(u => st.symbols[u] === "O") || st.players?.[1] || "Player O";

    if (g$("tttPlayerXName")) g$("tttPlayerXName").textContent = pX;
    if (g$("tttPlayerOName")) g$("tttPlayerOName").textContent = pO;
    if (g$("tttScoreX")) g$("tttScoreX").textContent = `${st.scores?.[pX] || 0} Wins`;
    if (g$("tttScoreO")) g$("tttScoreO").textContent = `${st.scores?.[pO] || 0} Wins`;
    if (g$("tttScoreDraws")) g$("tttScoreDraws").textContent = String(st.scores?.draws || 0);

    if (g$("tttPlayerXCard")) g$("tttPlayerXCard").classList.toggle("is-turn", st.status === "active" && st.turn === "X");
    if (g$("tttPlayerOCard")) g$("tttPlayerOCard").classList.toggle("is-turn", st.status === "active" && st.turn === "O");

    const isMyTurn =
      isPlayer &&
      st.status === "active" &&
      String(st.turnUsername || "").toLowerCase() === String(user.username || "").toLowerCase();

    if (g$("tttTurnNotice")) {
      if (st.status === "completed") {
        g$("tttTurnNotice").textContent =
          st.winner === "draw" ? "Round ended in a Draw" : `${st.winnerUsername} (${st.winner}) wins!`;
      } else {
        g$("tttTurnNotice").textContent = isMyTurn
          ? `Your Turn (${st.turn})`
          : `${st.turnUsername}'s Turn (${st.turn})`;
      }
    }

    const winSet = new Set(st.winningLine || []);
    document.querySelectorAll("[data-ttt-cell]").forEach(btn => {
      const idx = Number(btn.dataset.tttCell);
      const val = st.board[idx];
      btn.innerHTML = val === "X" ? TTT_X_SVG : val === "O" ? TTT_O_SVG : "";
      btn.classList.toggle("is-filled", Boolean(val));
      btn.classList.toggle("is-winning-cell", winSet.has(idx));
      btn.disabled = !isMyTurn || Boolean(val);
    });
  }

  /* ── Wire DOM Event Listeners ─────────────────────────────── */
  function bindStaticDomEvents() {
    g$("gamesLoungeFab")?.addEventListener("click", () => {
      if (isPanelOpen && !isMinimized) {
        toggleMinimizePanel();
      } else {
        openPanel();
      }
    });

    g$("gamesSoundToggleBtn")?.addEventListener("click", () => {
      setSoundMuted(!isSoundMuted);
    });
    syncSoundToggleUi();

    g$("gamesMinimizeBtn")?.addEventListener("click", toggleMinimizePanel);
    g$("gamesExpandBtn")?.addEventListener("click", toggleExpandPanel);
    g$("gamesCloseBtn")?.addEventListener("click", closePanelPreserveMatch);
    g$("gamesBackToLobbyBtn")?.addEventListener("click", returnToLobby);
    g$("gamesBannerLobbyBtn")?.addEventListener("click", returnToLobby);

    const handleEnable = () => {
      showGamesError("");
      getBridge()?.enableGamesByAdmin?.();
    };
    g$("gamesQuickEnableBtn")?.addEventListener("click", handleEnable);
    g$("gamesBannerEnableBtn")?.addEventListener("click", handleEnable);

    document.querySelectorAll("[data-create-game]").forEach(btn => {
      btn.addEventListener("click", () => createMatch(btn.dataset.createGame));
    });

    g$("matchSendInviteBtn")?.addEventListener("click", () => {
      const target = g$("matchInvitePlayerSelect")?.value || "";
      if (!target || !currentMatch) return;
      getSocket()?.emit("games:invitePlayer", { matchId: currentMatch.id, targetUsername: target }, res => {
        if (!res?.ok) showGamesError(res?.error || "Could not send invite.");
        else {
          if (g$("matchInvitePlayerSelect")) g$("matchInvitePlayerSelect").value = "";
        }
      });
    });

    g$("matchStartNowBtn")?.addEventListener("click", () => {
      if (!currentMatch) return;
      getSocket()?.emit("games:startMatch", { matchId: currentMatch.id }, res => {
        if (!res?.ok) showGamesError(res?.error || "Unable to start match.");
      });
    });

    const handleRematch = () => {
      if (!currentMatch) return;
      getSocket()?.emit("games:rematch", { matchId: currentMatch.id }, res => {
        if (!res?.ok) showGamesError(res?.error || "Unable to start rematch.");
      });
    };
    g$("matchRematchBtn")?.addEventListener("click", handleRematch);
    g$("gamesBannerRematchBtn")?.addEventListener("click", handleRematch);

    g$("matchLeaveBtn")?.addEventListener("click", () => {
      if (!currentMatch) return;
      const leavingId = currentMatch.id;
      getSocket()?.emit("games:leaveMatch", { matchId: leavingId }, () => {
        if (currentMatchId === leavingId) returnToLobby();
      });
    });

    // Chess buttons
    g$("chessFlipBtn")?.addEventListener("click", () => {
      chessFlipped = !chessFlipped;
      if (currentMatch?.gameType === "chess" && currentMatch.state) renderCurrentMatch();
    });
    g$("chessUndoBtn")?.addEventListener("click", () => {
      if (!currentMatch) return;
      getSocket()?.emit("games:chessAction", { matchId: currentMatch.id, action: "requestUndo" }, res => {
        if (!res?.ok) showGamesError(res?.error || "Cannot request undo.");
      });
    });
    g$("chessDrawBtn")?.addEventListener("click", () => {
      if (!currentMatch) return;
      getSocket()?.emit("games:chessAction", { matchId: currentMatch.id, action: "offerDraw" }, res => {
        if (!res?.ok) showGamesError(res?.error || "Cannot offer draw.");
      });
    });
    g$("chessResignBtn")?.addEventListener("click", () => {
      if (!currentMatch) return;
      getSocket()?.emit("games:chessAction", { matchId: currentMatch.id, action: "resign" });
    });

    document.querySelectorAll("[data-promo-piece]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!pendingPromotionMove) return;
        sendChessMove(pendingPromotionMove.from, pendingPromotionMove.to, btn.dataset.promoPiece);
      });
    });

    // Ludo dice roll (server-generated with double-click lock & smooth landing)
    g$("ludoDiceBtn")?.addEventListener("click", triggerLudoDiceRollRequest);

    // Tic Tac Toe clicks
    document.querySelectorAll("[data-ttt-cell]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (!currentMatch) return;
        if (!isSoundMuted) getOrCreateAudioContext();
        showGamesError("");
        const cellIndex = Number(btn.dataset.tttCell);
        getSocket()?.emit("games:makeMove", { matchId: currentMatch.id, move: { cellIndex } }, res => {
          if (!res?.ok) showGamesError(res?.error || "Invalid move.");
        });
      });
    });

    setupPanelDragging();
  }

  /* ── Socket.IO Event Binding ──────────────────────────────── */
  function bindSocket(sock) {
    if (!sock || socketBound === sock) return;
    socketBound = sock;

    sock.on("games:lobbyState", payload => {
      if (!payload) return;
      const ctx = getRoomCtx();
      if (payload.roomId && String(payload.roomId).toUpperCase() !== String(ctx.roomId || "MAIN").toUpperCase()) {
        return;
      }
      lobbyState = payload;

      if (currentMatchId) {
        const updated = (payload.matches || []).find(m => m.id === currentMatchId);
        if (updated) {
          currentMatch = updated;
          renderCurrentMatch();
        } else {
          // Match was cancelled or cleared
          currentMatchId = null;
          currentMatch = null;
          renderLobbyView();
        }
      } else {
        renderLobbyView();
      }
      applyPanelLayout();
    });

    sock.on("games:matchUpdated", match => {
      if (!match) return;
      const ctx = getRoomCtx();
      if (match.roomId && String(match.roomId).toUpperCase() !== String(ctx.roomId || "MAIN").toUpperCase()) {
        return;
      }
      const existingIdx = (lobbyState.matches || []).findIndex(m => m.id === match.id);
      if (existingIdx >= 0) lobbyState.matches[existingIdx] = match;
      else lobbyState.matches = [match, ...(lobbyState.matches || [])];

      if (currentMatchId === match.id) {
        currentMatch = match;
        renderCurrentMatch();
      } else {
        renderLobbyView();
      }
      syncFabIndicators();
    });

    sock.on("games:inviteReceived", invite => {
      const user = getCurrentUser();
      if (!invite || invite.toUsername.toLowerCase() !== String(user.username || "").toLowerCase()) return;
      lobbyState.pendingInvites = [
        invite,
        ...(lobbyState.pendingInvites || []).filter(i => i.id !== invite.id)
      ];
      showInviteToast(invite);
      renderLobbyView();
    });

    sock.on("games:inviteDeclined", info => {
      if (info?.byUsername) {
        showGamesError(`${info.byUsername} declined the invitation.`);
      }
    });

    sock.emit("games:getState");
  }

  function openMatchById(matchId) {
    if (!matchId) {
      openPanel();
      return;
    }
    openPanel();
    const user = getCurrentUser();
    const openOrSpectate = found => {
      const amPlayer = (found.players || []).some(
        p => p.toLowerCase() === String(user.username || "").toLowerCase()
      );
      const isPendingInviteForMe = (lobbyState.pendingInvites || []).some(
        inv =>
          inv.matchId === found.id &&
          inv.status === "pending" &&
          inv.toUsername.toLowerCase() === String(user.username || "").toLowerCase()
      );
      if (amPlayer || found.status === "completed") {
        openMatchInPanel(found);
      } else if (found.status === "waiting" && isPendingInviteForMe) {
        // Show lobby pending invite card prominently or open match view
        openMatchInPanel(found);
      } else {
        spectateMatch(found.id);
      }
    };

    const target = (lobbyState.matches || []).find(m => m.id === matchId);
    if (target) {
      openOrSpectate(target);
      return;
    }
    const sock = getSocket();
    if (!sock) return;
    sock.emit("games:getState", {}, res => {
      const list = res?.matches || lobbyState.matches || [];
      const found = list.find(m => m.id === matchId);
      if (found) openOrSpectate(found);
    });
  }

  window.SyncTuneGames = {
    openPanel,
    openMatchById,
    getMatches: () => [...(lobbyState.matches || [])],
    getSoundState: () => ({ muted: isSoundMuted }),
    setSoundMuted,
    onSocketReady: sock => bindSocket(sock),
    onRoomStateUpdated: () => {
      const ctx = getRoomCtx();
      if (lobbyState.roomId !== ctx.roomId) {
        currentMatchId = null;
        currentMatch = null;
        ludoLastRenderedMatchId = null;
        lastSeenLudoRollId = 0;
        lastAnimatedLudoMoveId = 0;
        ludoIsRolling = false;
        ludoIsAnimatingMove = false;
      }
      lobbyState.roomId = ctx.roomId;
      lobbyState.gamesEnabled = Boolean(ctx.plugins?.games);
      lobbyState.owner = ctx.owner;
      if (currentMatch) renderCurrentMatch();
      else renderLobbyView();
      applyPanelLayout();
    }
  };

  bindStaticDomEvents();
  const initialSock = getSocket();
  if (initialSock) bindSocket(initialSock);
})();
