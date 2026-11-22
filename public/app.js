let token = localStorage.getItem("synctune_token");
let socket = null;
let player = null;
let pendingState = null;
let suppressEvents = false;
let lastVideoId = "";
let remoteControlUntil = 0;
let lastSyncAt = 0;
let sidebarClockInterval = null;
let sectionObserver = null;
let revealObserver = null;

/* ── User, Room, Reply & Plugin State ─────────────────────── */
let currentUsername = "";
let currentIsAdmin = false;
let activeRoomId = "MAIN";
let activeRoomName = "Friends Room";
let activeRoomOwner = "System";
let allowMemberPluginToggle = false;
let whiteboardMemberDraw = true;
let activeReply = null;
let roomMembers = [];

const pluginStates = {
  youtube: false,
  games: false
};

let inspectedPluginId = null;
let activePluginCategory = "all";

/* ── Collaborative Workspace, Media & Whiteboard State ─ */
let activeCollabTab = "discussion";
let discussionFilter = "all";
let pendingAttachment = null;
let wbElements = [];
let wbCursors = new Map();
let wbLiveStrokes = new Map();
let wbImageCache = new Map();
let wbActiveTool = "pen";
let wbStrokeColor = "#f4f5f8";
let wbStrokeSize = 4;
let wbZoom = 1;
let wbPanX = 0;
let wbPanY = 0;

const PLUGIN_CATALOG = {
  youtube: {
    id: "youtube",
    name: "YouTube",
    provider: "Shared Queue",
    category: "media",
    url: "https://www.youtube.com/",
    logoClass: "youtube-logo-tile",
    description:
      "Synchronized YouTube player and shared track queue for everyone in your room.",
    security:
      "Uses the official YouTube IFrame Player API with server-reconciled playback timestamps.",
    svg: `<svg viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M27.42 3.12a3.51 3.51 0 0 0-2.47-2.48C22.77 0 14 0 14 0S5.23 0 3.05.64A3.51 3.51 0 0 0 .58 3.12C0 5.31 0 10 0 10s0 4.69.58 6.88a3.51 3.51 0 0 0 2.47 2.48C5.23 20 14 20 14 20s8.77 0 10.95-.64a3.51 3.51 0 0 0 2.47-2.48C28 14.69 28 10 28 10s0-4.69-.58-6.88Z" fill="#FF0000"/><path d="M11.2 14.28 18.47 10 11.2 5.72v8.56Z" fill="#FFFFFF"/></svg>`
  },
  games: {
    id: "games",
    name: "Chess, Ludo & Games",
    provider: "Multiplayer",
    category: "games",
    url: "#",
    logoClass: "games-logo-tile",
    description:
      "Real-time multiplayer Chess, Ludo, and Tic Tac Toe with live invites, clocks, and spectators.",
    security:
      "Server-validated game state persisted automatically across refreshes.",
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="16" fill="#FFFFFF"/><rect x="4" y="4" width="22" height="22" rx="5" fill="#E53935"/><rect x="38" y="4" width="22" height="22" rx="5" fill="#43A047"/><rect x="4" y="38" width="22" height="22" rx="5" fill="#1E88E5"/><rect x="38" y="38" width="22" height="22" rx="5" fill="#FBC02D"/><polygon points="23,23 32,32 23,41" fill="#E53935"/><polygon points="23,23 41,23 32,32" fill="#43A047"/><polygon points="41,23 41,41 32,32" fill="#FBC02D"/><polygon points="23,41 41,41 32,32" fill="#1E88E5"/><circle cx="32" cy="32" r="7" fill="#FFFFFF"/><path d="M27.6 34.4 28.7 29.5l3.3 2.4 3.3-2.4 1.1 4.9H27.6Z" fill="#F59E0B"/></svg>`
  }
};

const chatMessagesById = new Map();
const $ = id => document.getElementById(id);

function formatRoomDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = [hours, minutes, seconds].map(value => String(value).padStart(2, "0")).join(":");
  return days ? `${days}d ${clock}` : clock;
}

function updateSidebarClock(roomOpenedAt) {
  const now = new Date();
  const timeEl = $("sidebarTime");
  const dateEl = $("sidebarDate");
  const durEl = $("roomDuration");
  if (timeEl) {
    timeEl.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(now);
    timeEl.dateTime = now.toISOString();
  }
  if (dateEl) {
    dateEl.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(now);
  }
  if (durEl) {
    durEl.textContent = Number.isFinite(roomOpenedAt)
      ? formatRoomDuration(now.getTime() - roomOpenedAt)
      : "Waiting for listeners";
  }
}

function startSidebarClock(roomOpenedAt) {
  if (sidebarClockInterval) clearInterval(sidebarClockInterval);
  updateSidebarClock(roomOpenedAt);
  sidebarClockInterval = setInterval(() => updateSidebarClock(roomOpenedAt), 1000);
}

/* ── Sidebar Collapse, Mobile Drawer & Topbar Dropdowns ───── */
function setSidebarCollapsed(collapsed) {
  const layout = $("workspaceLayout");
  const btn = $("sidebarCollapseBtn");
  if (!layout) return;
  layout.classList.toggle("is-sidebar-collapsed", collapsed);
  if (btn) {
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    btn.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
    const collapseIcon = btn.querySelector(".icon-collapse");
    const expandIcon = btn.querySelector(".icon-expand");
    if (collapseIcon) collapseIcon.classList.toggle("hidden", collapsed);
    if (expandIcon) expandIcon.classList.toggle("hidden", !collapsed);
  }
  localStorage.setItem("synctune_sidebar_collapsed", String(collapsed));
}

function setMobileSidebarOpen(open) {
  const sidebar = $("appSidebar");
  const backdrop = $("sidebarBackdrop");
  const menuBtn = $("mobileMenuBtn");
  if (sidebar) sidebar.classList.toggle("is-mobile-open", open);
  if (backdrop) backdrop.classList.toggle("hidden", !open);
  if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
}

function closeAllDropdowns() {
  const roomMenu = $("headerRoomDropdown");
  const roomBtn = $("headerRoomMenuBtn");
  const userMenu = $("userDropdownMenu");
  const userBtn = $("userMenuBtn");
  if (roomMenu) roomMenu.classList.add("hidden");
  if (roomBtn) roomBtn.setAttribute("aria-expanded", "false");
  if (userMenu) userMenu.classList.add("hidden");
  if (userBtn) userBtn.setAttribute("aria-expanded", "false");
}

function toggleDropdown(menuEl, triggerEl) {
  if (!menuEl || !triggerEl) return;
  const willOpen = menuEl.classList.contains("hidden");
  closeAllDropdowns();
  if (willOpen) {
    menuEl.classList.remove("hidden");
    triggerEl.setAttribute("aria-expanded", "true");
  }
}

if ($("sidebarCollapseBtn")) {
  const savedCollapsed = localStorage.getItem("synctune_sidebar_collapsed") === "true";
  setSidebarCollapsed(savedCollapsed);
  $("sidebarCollapseBtn").addEventListener("click", () => {
    const isCollapsed = $("workspaceLayout")?.classList.contains("is-sidebar-collapsed");
    setSidebarCollapsed(!isCollapsed);
  });
}

if ($("mobileMenuBtn")) {
  $("mobileMenuBtn").addEventListener("click", () => setMobileSidebarOpen(true));
}
if ($("sidebarMobileCloseBtn")) {
  $("sidebarMobileCloseBtn").addEventListener("click", () => setMobileSidebarOpen(false));
}
if ($("sidebarBackdrop")) {
  $("sidebarBackdrop").addEventListener("click", () => setMobileSidebarOpen(false));
}

if ($("headerRoomMenuBtn")) {
  $("headerRoomMenuBtn").addEventListener("click", e => {
    e.stopPropagation();
    toggleDropdown($("headerRoomDropdown"), $("headerRoomMenuBtn"));
  });
}

if ($("userMenuBtn")) {
  $("userMenuBtn").addEventListener("click", e => {
    e.stopPropagation();
    toggleDropdown($("userDropdownMenu"), $("userMenuBtn"));
  });
}

document.addEventListener("click", e => {
  if (
    !e.target.closest("#headerRoomMenuWrap") &&
    !e.target.closest("#userMenuWrap")
  ) {
    closeAllDropdowns();
  }
  if (
    $("sidebarNotificationsPanel") &&
    !$("sidebarNotificationsPanel").classList.contains("hidden") &&
    !e.target.closest("#sidebarNotificationsPanel") &&
    !e.target.closest("#notificationsNavBtn")
  ) {
    closeNotificationsPanel();
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeAllDropdowns();
    closeNotificationsPanel();
    closeWorkspaceUtilityModal();
    setMobileSidebarOpen(false);
    closeMediaLightbox();
    const wbWs = $("whiteboardWorkspace");
    if (wbWs?.classList.contains("is-fullscreen")) {
      wbWs.classList.remove("is-fullscreen");
      document.body.style.overflow = "";
      if ($("wbFullscreenBtn")) $("wbFullscreenBtn").textContent = "Expand";
      requestAnimationFrame(() => {
        resizeWhiteboardCanvas();
        renderWhiteboard();
        renderWhiteboardCursors();
      });
    }
  }
});

function jumpToSection(selector) {
  if (selector === "#adminCard" && !currentIsAdmin) {
    selector = "#overviewCard";
  }
  const target = document.querySelector(selector);
  closeAllDropdowns();
  setMobileSidebarOpen(false);
  if (target && !target.classList.contains("hidden")) {
    target.classList.add("is-revealed");
    target.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach(el => {
      el.classList.add("is-revealed");
    });
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSidebarLink(selector);
  }
}

document.querySelectorAll("[data-jump-section]").forEach(btn => {
  btn.addEventListener("click", () => {
    const sel = btn.getAttribute("data-jump-section");
    if (sel) jumpToSection(sel);
  });
});

if ($("presence")) {
  $("presence").addEventListener("click", () => jumpToSection("#membersCard"));
}
if ($("dropdownLogoutBtn")) {
  $("dropdownLogoutBtn").addEventListener("click", logout);
}

/* ── Scroll Spy & Scroll-Triggered Reveal Animations ──────── */
function setActiveSidebarLink(href) {
  document.querySelectorAll(".sidebar-link").forEach(item => {
    if (item.getAttribute("href") === href) {
      item.setAttribute("aria-current", "location");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

function setupSidebarScrollSpy() {
  if (!("IntersectionObserver" in window)) return;
  if (sectionObserver) sectionObserver.disconnect();
  const sections = [
    "overviewCard",
    "pluginsCard",
    "chatCard",
    "youtubePluginSection",
    "voiceRoomCard",
    "membersCard",
    "settingsCard",
    "roomsCard",
    "adminCard"
  ]
    .map(id => $(id))
    .filter(el => el && !el.classList.contains("hidden"));
  if (!sections.length) return;
  sectionObserver = new IntersectionObserver(
    entries => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSidebarLink(`#${visible.target.id}`);
    },
    { threshold: [0.2, 0.45], rootMargin: "-80px 0px -40% 0px" }
  );
  sections.forEach(sec => sectionObserver.observe(sec));
}

function setupScrollRevealObserver() {
  const staggerGroups = document.querySelectorAll("[data-reveal-stagger]");
  staggerGroups.forEach(group => {
    Array.from(group.children).forEach((child, idx) => {
      child.style.setProperty("--stagger-index", String(idx));
    });
  });

  const revealTargets = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach(el => el.classList.add("is-revealed"));
    return;
  }

  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.01, rootMargin: "0px 0px -12px 0px" }
  );

  revealTargets.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.96 && rect.bottom > 0) {
      el.classList.add("is-revealed");
    } else if (!el.classList.contains("is-revealed")) {
      revealObserver.observe(el);
    }
  });
}

document.querySelectorAll(".sidebar-link").forEach(link =>
  link.addEventListener("click", e => {
    const collabTab = link.getAttribute("data-nav-collab-tab");
    const utilityTab = link.getAttribute("data-utility-tab");
    if (utilityTab) {
      e.preventDefault();
      openWorkspaceUtilityModal(utilityTab);
      if (window.innerWidth <= 860) setMobileSidebarOpen(false);
      return;
    }

    if (link.id === "queueNavLink" && !pluginStates.youtube) {
      e.preventDefault();
      jumpToSection("#pluginsCard");
      const mediaChip = document.querySelector('[data-plugin-category="media"]');
      if (mediaChip) mediaChip.click();
      return;
    }

    const href = link.getAttribute("href");
    if (collabTab && typeof switchCollabTab === "function") {
      switchCollabTab(collabTab);
    }
    if (href) setActiveSidebarLink(href);
    if (href && href.startsWith("#")) {
      const target = document.querySelector(href);
      if (target) {
        target.classList.add("is-revealed");
        target.querySelectorAll("[data-reveal], [data-reveal-stagger]").forEach(el => {
          el.classList.add("is-revealed");
        });
      }
    }
    if (window.innerWidth <= 860) {
      setMobileSidebarOpen(false);
    }
  })
);

if ($("gamesNavLink")) {
  $("gamesNavLink").addEventListener("click", () => {
    window.SyncTuneGames?.openPanel?.();
    if (window.innerWidth <= 860) setMobileSidebarOpen(false);
  });
}

if ($("headerPluginsBtn")) {
  $("headerPluginsBtn").addEventListener("click", () => jumpToSection("#pluginsCard"));
}

/* ── Permissions & Plugin Management ──────────────────────── */
function isWorkspaceOwner() {
  if (currentIsAdmin) return true;
  if (!activeRoomOwner || activeRoomOwner === "System") return false;
  return currentUsername.toLowerCase() === String(activeRoomOwner).toLowerCase();
}

function canManagePlugins() {
  return isWorkspaceOwner();
}

function populateSwitchAdminSelect(members) {
  const select = $("switchAdminSelect");
  const btn = $("switchAdminBtn");
  const row = $("switchAdminSettingRow");
  const owner = isWorkspaceOwner();
  if (row) {
    row.classList.toggle("hidden", !owner);
    row.classList.remove("is-disabled-setting");
  }
  if (!select) return;

  const currentVal = select.value;
  const list = Array.isArray(members) ? members : [];
  const candidates = list.filter(
    m =>
      m?.username &&
      m.username.toLowerCase() !== String(activeRoomOwner || "").toLowerCase() &&
      m.username.toLowerCase() !== currentUsername.toLowerCase()
  );

  select.innerHTML = '<option value="">Select room member...</option>';
  candidates.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.username;
    opt.textContent = m.username;
    select.appendChild(opt);
  });

  if (currentVal && candidates.some(c => c.username === currentVal)) {
    select.value = currentVal;
  }
  select.disabled = !owner || candidates.length === 0;
  if (btn) btn.disabled = !owner || candidates.length === 0;
}

function switchRoomAdmin(targetUsername) {
  const feedback = $("switchAdminFeedback");
  if (feedback) {
    feedback.textContent = "";
    feedback.classList.remove("error");
  }
  if (!isWorkspaceOwner()) {
    if (feedback) {
      feedback.textContent = `Only the current Room Admin (${activeRoomOwner}) can switch admin rights.`;
      feedback.classList.add("error");
    }
    return;
  }
  const target = String(targetUsername || "").trim();
  if (!target) {
    if (feedback) {
      feedback.textContent = "Select a room member first.";
      feedback.classList.add("error");
    }
    return;
  }
  if (!socket || !socket.connected) return;
  socket.emit("room:switchAdmin", { targetUsername: target }, res => {
    if (!res?.ok) {
      if (feedback) {
        feedback.textContent = res?.error || "Unable to switch admin.";
        feedback.classList.add("error");
      }
      return;
    }
    activeRoomOwner = res.owner;
    if (feedback) {
      feedback.textContent = `Room Admin switched to ${res.owner}.`;
    }
    renderPermissionsAndSettingsUI();
    renderPluginsUI();
    window.SyncTuneGames?.onRoomStateUpdated?.();
  });
}

function renderPermissionsAndSettingsUI() {
  const owner = isWorkspaceOwner();
  const ownerDisplay =
    !activeRoomOwner || activeRoomOwner === "System" ? "System (Admin)" : activeRoomOwner;

  if ($("adminCard")) $("adminCard").classList.toggle("hidden", !currentIsAdmin);
  if ($("adminNavLink")) $("adminNavLink").classList.toggle("hidden", !currentIsAdmin);

  if ($("workspaceOwnerBadge")) {
    $("workspaceOwnerBadge").textContent = `Admin: ${ownerDisplay}`;
  }
  if ($("settingsRoleBadge")) {
    $("settingsRoleBadge").textContent = owner ? "ROOM ADMIN" : "TEAM MEMBER";
  }
  if ($("settingsSubtitle")) {
    $("settingsSubtitle").textContent = owner
      ? "Control plugin permissions, room admin access, and workspace preferences."
      : "Manage your personal workspace preferences.";
  }
  if ($("dropdownUserRole")) {
    $("dropdownUserRole").textContent = currentIsAdmin
      ? "Administrator"
      : owner
      ? "Room Admin"
      : "Team Member";
  }

  const noticeEl = $("pluginPermissionNotice");
  if (noticeEl) {
    noticeEl.textContent = owner
      ? "Room Admin mode: enable or disable AI platforms, Media, and Multiplayer Games for this room."
      : "View active room integrations and launch connected workspaces.";
  }

  // Strictly hide all admin-only rows and actions from regular users
  if ($("adminFeatureLockRow")) $("adminFeatureLockRow").classList.toggle("hidden", !owner);
  if ($("switchAdminSettingRow")) $("switchAdminSettingRow").classList.toggle("hidden", !owner);
  if ($("whiteboardPermissionSettingRow")) {
    $("whiteboardPermissionSettingRow").classList.toggle("hidden", !owner);
  }
  if ($("switchAdminFeedback")) $("switchAdminFeedback").classList.toggle("hidden", !owner);
  if ($("wbClearBtn")) $("wbClearBtn").classList.toggle("hidden", !owner);
  if ($("clearChatBtn")) $("clearChatBtn").classList.toggle("hidden", !owner);
  if ($("aiEmptyActivateBtn")) $("aiEmptyActivateBtn").classList.toggle("hidden", !owner);

  const wbPermBtn = $("allowWhiteboardMemberDrawBtn");
  if (wbPermBtn) {
    wbPermBtn.setAttribute("aria-checked", String(whiteboardMemberDraw));
    wbPermBtn.textContent = whiteboardMemberDraw ? "All Members Allowed" : "Admin Only";
    wbPermBtn.classList.toggle("is-on", whiteboardMemberDraw);
    wbPermBtn.disabled = !owner;
  }

  populateSwitchAdminSelect(roomMembers);
  updateCollabHeader();
}

/* ── Integrations Search, Filter & Detail Drawer ──────────── */
function filterIntegrations() {
  const query = ($("pluginSearchInput")?.value || "").trim().toLowerCase();
  const ytItem = $("youtubePluginItem");
  const gamesItem = $("gamesPluginItem");

  let visibleMedia = 0;
  if (ytItem) {
    const searchText = (ytItem.getAttribute("data-search") || "").toLowerCase();
    const isConnected = Boolean(pluginStates.youtube);
    const matchesSearch = !query || searchText.includes(query);
    const matchesCat =
      activePluginCategory === "all" ||
      activePluginCategory === "media" ||
      (activePluginCategory === "connected" && isConnected);
    const show = matchesSearch && matchesCat;
    ytItem.classList.toggle("hidden", !show);
    if (show) visibleMedia += 1;
  }
  if (gamesItem) {
    const searchText = (gamesItem.getAttribute("data-search") || "").toLowerCase();
    const isConnected = Boolean(pluginStates.games);
    const matchesSearch = !query || searchText.includes(query);
    const matchesCat =
      activePluginCategory === "all" ||
      activePluginCategory === "games" ||
      (activePluginCategory === "connected" && isConnected);
    const show = matchesSearch && matchesCat;
    gamesItem.classList.toggle("hidden", !show);
    if (show) visibleMedia += 1;
  }

  if ($("mediaPluginsGroup")) $("mediaPluginsGroup").classList.toggle("hidden", visibleMedia === 0);
  if ($("pluginSearchEmpty")) {
    $("pluginSearchEmpty").classList.toggle("hidden", visibleMedia > 0);
  }
}

function updatePluginDetailDrawer() {
  const drawer = $("pluginDetailDrawer");
  if (!drawer || !inspectedPluginId || !PLUGIN_CATALOG[inspectedPluginId]) {
    if (drawer) drawer.classList.add("hidden");
    document
      .querySelectorAll(".ai-plugin-card, .plugin-item")
      .forEach(el => el.classList.remove("is-inspected"));
    return;
  }

  const meta = PLUGIN_CATALOG[inspectedPluginId];
  const enabled = Boolean(pluginStates[meta.id]);
  const canToggle = canManagePlugins();

  document.querySelectorAll(".ai-plugin-card, .plugin-item").forEach(el => {
    el.classList.toggle("is-inspected", el.getAttribute("data-plugin-id") === meta.id);
  });

  const iconEl = $("detailPluginIcon");
  if (iconEl) {
    iconEl.className = `ai-plugin-logo ${meta.logoClass}`;
    iconEl.innerHTML = meta.svg;
  }
  if ($("detailPluginName")) $("detailPluginName").textContent = meta.name;
  if ($("detailPluginProvider")) $("detailPluginProvider").textContent = meta.provider;
  if ($("detailPluginUrl")) {
    $("detailPluginUrl").textContent = meta.url;
    $("detailPluginUrl").href = meta.url;
  }
  if ($("detailPluginStatus")) {
    $("detailPluginStatus").textContent = enabled ? "Connected" : "Disabled";
    $("detailPluginStatus").classList.toggle("is-enabled", enabled);
  }
  if ($("detailPluginDesc")) $("detailPluginDesc").textContent = meta.description;
  if ($("detailPluginSecurity")) $("detailPluginSecurity").textContent = meta.security;

  const toggleBtn = $("detailToggleBtn");
  if (toggleBtn) {
    toggleBtn.textContent = enabled ? "Disable" : "Enable";
    toggleBtn.classList.toggle("is-active", enabled);
    toggleBtn.disabled = !canToggle;
    toggleBtn.classList.toggle("hidden", !canToggle);
  }

  const openWorkspaceBtn = $("detailOpenWorkspaceBtn");
  const launchTabLink = $("detailLaunchTabLink");

  if (openWorkspaceBtn) {
    openWorkspaceBtn.textContent = "Open Games Lounge";
    openWorkspaceBtn.classList.toggle("hidden", !(meta.id === "games" && enabled));
  }
  if (launchTabLink) {
    launchTabLink.classList.add("hidden");
  }

  drawer.classList.remove("hidden");
}

function openPluginDetailDrawer(pluginId) {
  if (!PLUGIN_CATALOG[pluginId]) return;
  if (inspectedPluginId === pluginId) {
    closePluginDetailDrawer();
    return;
  }
  inspectedPluginId = pluginId;
  updatePluginDetailDrawer();
}

function closePluginDetailDrawer() {
  inspectedPluginId = null;
  updatePluginDetailDrawer();
}

if ($("pluginSearchInput")) {
  $("pluginSearchInput").addEventListener("input", filterIntegrations);
}

document.querySelectorAll("[data-plugin-category]").forEach(btn => {
  btn.addEventListener("click", () => {
    activePluginCategory = btn.getAttribute("data-plugin-category") || "all";
    document.querySelectorAll("[data-plugin-category]").forEach(chip => {
      const isAct = chip === btn;
      chip.classList.toggle("is-active", isAct);
      chip.setAttribute("aria-selected", String(isAct));
    });
    filterIntegrations();
  });
});

document.querySelectorAll("[data-inspect-plugin]").forEach(btn => {
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const id = btn.getAttribute("data-inspect-plugin");
    if (id) openPluginDetailDrawer(id);
  });
});

document.querySelectorAll(".ai-plugin-card, #youtubePluginItem, #gamesPluginItem").forEach(card => {
  card.addEventListener("click", e => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    const id = card.getAttribute("data-plugin-id");
    if (id) openPluginDetailDrawer(id);
  });
});

if ($("detailCloseBtn")) {
  $("detailCloseBtn").addEventListener("click", closePluginDetailDrawer);
}
if ($("detailToggleBtn")) {
  $("detailToggleBtn").addEventListener("click", () => {
    if (!inspectedPluginId) return;
    setPluginState(inspectedPluginId, !pluginStates[inspectedPluginId], true);
  });
}
if ($("detailOpenWorkspaceBtn")) {
  $("detailOpenWorkspaceBtn").addEventListener("click", () => {
    if (inspectedPluginId === "games") {
      window.SyncTuneGames?.openPanel?.();
    }
  });
}

function renderPluginsUI() {
  renderPermissionsAndSettingsUI();

  const canToggle = canManagePlugins();
  const enabledCount = [pluginStates.youtube, pluginStates.games].filter(Boolean).length;

  if ($("pluginsCountBadge")) {
    $("pluginsCountBadge").textContent = `${enabledCount} Connected`;
  }
  if ($("overviewPluginsCount")) {
    $("overviewPluginsCount").textContent = `${enabledCount} / 2 Enabled`;
  }
  if ($("sidebarPluginBadge")) {
    $("sidebarPluginBadge").textContent = `${enabledCount} ON`;
    $("sidebarPluginBadge").classList.toggle("is-on", enabledCount > 0);
  }

  const ytEnabled = Boolean(pluginStates.youtube);
  const ytSection = $("youtubePluginSection");
  const queueCard = $("queueCard");
  const playerCard = $("playerCard");
  const ytPill = $("sidebarYoutubePill");
  const workspaceGrid = $("workspaceGrid");
  const ytToggleBtn = $("youtubePluginToggleBtn");
  const ytStatusBadge = $("youtubePluginStatusBadge");
  const ytItem = $("youtubePluginItem");

  if (ytSection) ytSection.classList.toggle("hidden", !ytEnabled);
  if (queueCard) queueCard.classList.toggle("hidden", !ytEnabled);
  if (playerCard) playerCard.classList.toggle("hidden", !ytEnabled);
  if (ytPill) {
    ytPill.textContent = ytEnabled ? "ON" : "OFF";
    ytPill.classList.toggle("is-on", ytEnabled);
  }
  if (workspaceGrid) workspaceGrid.classList.toggle("has-youtube-plugin", ytEnabled);
  if (ytItem) ytItem.classList.toggle("is-enabled", ytEnabled);

  if (ytToggleBtn) {
    ytToggleBtn.setAttribute("aria-checked", String(ytEnabled));
    ytToggleBtn.textContent = ytEnabled ? "Disable" : "Enable";
    ytToggleBtn.classList.toggle("is-active", ytEnabled);
    ytToggleBtn.disabled = !canToggle;
    ytToggleBtn.classList.toggle("hidden", !canToggle);
  }
  if (ytStatusBadge) {
    ytStatusBadge.textContent = ytEnabled ? "Connected" : "Disabled";
    ytStatusBadge.classList.toggle("is-enabled", ytEnabled);
  }

  const gamesEnabled = Boolean(pluginStates.games);
  const gamesItem = $("gamesPluginItem");
  const gamesToggleBtn = $("gamesPluginToggleBtn");
  const gamesStatusBadge = $("gamesPluginStatusBadge");
  if (gamesItem) gamesItem.classList.toggle("is-enabled", gamesEnabled);
  if (gamesToggleBtn) {
    gamesToggleBtn.setAttribute("aria-checked", String(gamesEnabled));
    gamesToggleBtn.textContent = gamesEnabled ? "Disable" : "Enable";
    gamesToggleBtn.classList.toggle("is-active", gamesEnabled);
    gamesToggleBtn.disabled = !canToggle;
    gamesToggleBtn.classList.toggle("hidden", !canToggle);
  }
  if (gamesStatusBadge) {
    gamesStatusBadge.textContent = gamesEnabled ? "Connected" : "Disabled";
    gamesStatusBadge.classList.toggle("is-enabled", gamesEnabled);
  }

  filterIntegrations();
  if (inspectedPluginId) updatePluginDetailDrawer();
  setupSidebarScrollSpy();
  window.SyncTuneGames?.onRoomStateUpdated?.();
}

function setPluginState(pluginId, enabled) {
  if ($("pluginActionError")) $("pluginActionError").textContent = "";

  if (!canManagePlugins()) {
    if ($("pluginActionError")) {
      $("pluginActionError").textContent = `Only the Workspace Owner (${activeRoomOwner}) can enable or disable plugins in this room.`;
    }
    return;
  }

  if (!["youtube", "games"].includes(pluginId)) return;
  pluginStates[pluginId] = Boolean(enabled);

  if (pluginId === "youtube") {
    if (pluginStates.youtube) {
      if (socket) socket.emit("requestSync");
      if (pendingState) applyState(pendingState);
    } else if (player && typeof player.pauseVideo === "function") {
      try {
        markRemoteControl(800);
        player.pauseVideo();
      } catch {}
    }
  }

  renderPluginsUI();

  if (socket && socket.connected) {
    socket.emit("setPluginState", { pluginId, enabled: pluginStates[pluginId] }, res => {
      if (res && !res.ok && $("pluginActionError")) {
        $("pluginActionError").textContent = res.error || "Unable to update plugin state.";
      }
    });
  }
}

if ($("youtubePluginToggleBtn")) {
  $("youtubePluginToggleBtn").addEventListener("click", e => {
    e.stopPropagation();
    setPluginState("youtube", !pluginStates.youtube);
  });
}

if ($("gamesPluginToggleBtn")) {
  $("gamesPluginToggleBtn").addEventListener("click", e => {
    e.stopPropagation();
    setPluginState("games", !pluginStates.games);
  });
}

if ($("switchAdminBtn")) {
  $("switchAdminBtn").addEventListener("click", () => {
    const selected = $("switchAdminSelect")?.value || "";
    switchRoomAdmin(selected);
  });
}

/* YouTube Player / Shared Queue Segmented Tabs */
document.querySelectorAll("[data-yt-switch]").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetTab = btn.getAttribute("data-yt-switch") || "player";
    const section = $("youtubePluginSection");
    if (section) section.setAttribute("data-yt-tab", targetTab);
    document.querySelectorAll("[data-yt-switch]").forEach(tab => {
      const isAct = tab === btn;
      tab.classList.toggle("is-active", isAct);
      tab.setAttribute("aria-selected", String(isAct));
    });
  });
});

if ($("allowMemberPluginToggleBtn")) {
  $("allowMemberPluginToggleBtn").addEventListener("click", () => {
    if (!isWorkspaceOwner()) return;
    allowMemberPluginToggle = !allowMemberPluginToggle;
    renderPermissionsAndSettingsUI();
    if (socket && socket.connected) {
      socket.emit("setWorkspaceSettings", { allowMemberPluginToggle });
    }
  });
}

if ($("allowWhiteboardMemberDrawBtn")) {
  $("allowWhiteboardMemberDrawBtn").addEventListener("click", () => {
    if (!isWorkspaceOwner()) return;
    whiteboardMemberDraw = !whiteboardMemberDraw;
    renderPermissionsAndSettingsUI();
    if (socket && socket.connected) {
      socket.emit("setWorkspaceSettings", { whiteboardMemberDraw });
    }
  });
}

/* ── Team Members Panel Rendering ─────────────────────────── */
function renderMembersList(members, count) {
  const list = $("membersList");
  const badge = $("membersCountBadge");
  const presenceCount = count || members.length || 1;
  if (badge) badge.textContent = `${presenceCount} ONLINE`;
  if ($("overviewOnlineCount")) $("overviewOnlineCount").textContent = `${presenceCount} Online`;
  if ($("presenceText")) $("presenceText").textContent = `${presenceCount} online`;
  if ($("collabHeaderOnlineCount")) {
    $("collabHeaderOnlineCount").textContent = `${presenceCount} online`;
  }
  if (!list) return;

  const items =
    Array.isArray(members) && members.length
      ? members
      : currentUsername
      ? [{ username: currentUsername, isAdmin: currentIsAdmin, isOwner: isWorkspaceOwner() }]
      : [];

  list.innerHTML = "";
  const canSwitch = isWorkspaceOwner();
  items.forEach(m => {
    const isSelf = m.username.toLowerCase() === currentUsername.toLowerCase();
    const roleTag = m.isOwner
      ? "Room Admin"
      : m.isAdmin
      ? "Administrator"
      : "Team Member";
    const row = document.createElement("div");
    row.className = "member-row";
    const canTransferTo = canSwitch && !isSelf && !m.isOwner;
    row.innerHTML = `
      <div class="member-avatar" aria-hidden="true">${escapeHtml(m.username.slice(0, 1).toUpperCase())}</div>
      <div class="member-info">
        <strong>${escapeHtml(m.username)}${isSelf ? " (You)" : ""}</strong>
        <span>${escapeHtml(roleTag)} · Real-Time Session</span>
      </div>
      <div class="member-row-actions">
        ${
          canTransferTo
            ? `<button type="button" class="small-btn switch-admin-inline-btn" data-make-room-admin="${escapeHtml(
                m.username
              )}">Make Admin</button>`
            : ""
        }
        <span class="queue-badge ${m.isOwner ? "live-badge" : ""}">${escapeHtml(m.isOwner ? "ADMIN" : "MEMBER")}</span>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-make-room-admin]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-make-room-admin");
      if (target) switchRoomAdmin(target);
    });
  });

  populateSwitchAdminSelect(items);
  window.SyncTuneGames?.onRoomStateUpdated?.();
}

function setAudioFocus(enabled) {
  const card = $("playerCard");
  const button = $("audioFocusBtn");
  const note = $("audioFocusNote");
  if (!card || !button || !note) return;
  card.classList.toggle("audio-focus", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  note.hidden = !enabled;
}

const audioFocusBtn = $("audioFocusBtn");
if (audioFocusBtn) {
  setAudioFocus(localStorage.getItem("synctune_audio_focus") === "true");
  audioFocusBtn.addEventListener("click", () => {
    const enabled = !$("playerCard").classList.contains("audio-focus");
    localStorage.setItem("synctune_audio_focus", String(enabled));
    setAudioFocus(enabled);
  });
}

function applyTheme() {
  const light = localStorage.getItem("synctune_theme") === "night-light";
  document.body.classList.toggle("night-light", light);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", light ? "#ffffff" : "#131314");

  [$("themeBtn"), $("loginThemeBtn")].filter(Boolean).forEach(btn => {
    const moonIcon = btn.querySelector(".icon-moon");
    const sunIcon = btn.querySelector(".icon-sun");
    if (moonIcon) moonIcon.classList.toggle("hidden", light);
    if (sunIcon) sunIcon.classList.toggle("hidden", !light);
    btn.setAttribute("aria-label", light ? "Switch to Dark Mode" : "Switch to Light Mode");
    btn.setAttribute("title", light ? "Switch to Dark Mode" : "Switch to Light Mode");
  });
  if ($("settingsThemeBtn")) {
    $("settingsThemeBtn").textContent = light ? "Light Mode" : "Dark Mode";
  }
}

function toggleTheme() {
  const light = !document.body.classList.contains("night-light");
  localStorage.setItem("synctune_theme", light ? "night-light" : "dark");
  applyTheme();
}

/* ── Room UI & Multi-Room Switching ───────────────────────── */
function updateRoomDisplay(roomId, roomName, owner, syncUrl = true) {
  activeRoomId = String(roomId || "MAIN").toUpperCase();
  activeRoomName = String(roomName || "Friends Room");
  if (owner !== undefined) activeRoomOwner = owner || "System";

  if ($("roomName")) $("roomName").textContent = activeRoomName;
  if ($("headerRoomBadge")) $("headerRoomBadge").textContent = `ID: ${activeRoomId}`;
  if ($("sidebarRoomId")) $("sidebarRoomId").textContent = activeRoomId;
  if ($("activeRoomTitle")) $("activeRoomTitle").textContent = activeRoomName;
  if ($("activeRoomCode")) $("activeRoomCode").textContent = activeRoomId;
  if ($("roomsActiveTitle")) $("roomsActiveTitle").textContent = activeRoomName;
  if ($("roomsActiveCode")) $("roomsActiveCode").textContent = activeRoomId;
  if ($("chatRoomPill")) $("chatRoomPill").textContent = `ROOM: ${activeRoomId}`;
  if ($("collabHeaderRoomName")) $("collabHeaderRoomName").textContent = activeRoomName;
  if ($("wbRoomLabel")) $("wbRoomLabel").textContent = `WB: ${activeRoomId}`;
  if ($("voiceRoomIdPill")) $("voiceRoomIdPill").textContent = `ROOM: ${activeRoomId}`;

  renderPermissionsAndSettingsUI();
  window.SyncTuneVoice?.onRoomContextUpdated?.();

  if (syncUrl) {
    localStorage.setItem("synctune_active_room", activeRoomId);
    try {
      const url = new URL(window.location.href);
      if (activeRoomId && activeRoomId !== "MAIN") {
        url.searchParams.set("room", activeRoomId);
      } else {
        url.searchParams.delete("room");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }
}

function resetLocalRoomPluginAndPlayerState() {
  lastVideoId = "";
  pendingState = null;
  pluginStates.youtube = false;
  pluginStates.games = false;
  wbElements = [];
  wbCursors.clear();
  wbLiveStrokes.clear();
  clearPendingAttachment();

  if (player && typeof player.stopVideo === "function") {
    try {
      markRemoteControl(800);
      player.stopVideo();
    } catch {}
  }
  if ($("emptyPlayer")) $("emptyPlayer").classList.remove("hidden");
  if ($("status")) $("status").textContent = "Waiting for a song...";
  renderQueue([]);
  renderPluginsUI();
  renderWhiteboard();
}

function switchToRoom(roomId, roomName, feedbackMessage, owner) {
  window.SyncTuneVoice?.leaveChannel?.();
  cancelReply();
  updateRoomDisplay(roomId, roomName, owner);
  resetLocalRoomPluginAndPlayerState();

  if ($("enterRoomError")) $("enterRoomError").textContent = "";
  if (feedbackMessage && $("roomShareFeedback")) {
    $("roomShareFeedback").textContent = feedbackMessage;
  }

  if (socket && socket.connected) {
    socket.emit("joinRoom", { roomId: activeRoomId }, response => {
      if (response && response.ok) {
        updateRoomDisplay(response.roomId, response.roomName, response.owner);
        if (typeof response.allowMemberPluginToggle === "boolean") {
          allowMemberPluginToggle = response.allowMemberPluginToggle;
        }
        if (response.plugins) {
          pluginStates.youtube = Boolean(response.plugins.youtube);
          pluginStates.games = Boolean(response.plugins.games);
          renderPluginsUI();
        }
        if (typeof response.onlineCount === "number" && $("presenceText")) {
          $("presenceText").textContent = `${response.onlineCount} online`;
        }
        if (response.members) {
          roomMembers = response.members;
          renderMembersList(roomMembers, response.onlineCount);
        }
      }
    });
  } else {
    connectSocket();
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    ta.remove();
    return true;
  } catch {
    ta.remove();
    return false;
  }
}

function showShareFeedback(msg) {
  const el = $("roomShareFeedback");
  if (!el) return;
  el.textContent = msg;
}

async function handleCopyRoomId() {
  const ok = await copyTextToClipboard(activeRoomId);
  showShareFeedback(
    ok ? `Copied Room ID "${activeRoomId}" to clipboard.` : `Room ID: ${activeRoomId}`
  );
  closeAllDropdowns();
}

async function handleCopyInviteLink() {
  const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(activeRoomId)}`;
  const ok = await copyTextToClipboard(inviteUrl);
  showShareFeedback(
    ok ? `Copied invite link (${inviteUrl}) to clipboard.` : `Invite link: ${inviteUrl}`
  );
  closeAllDropdowns();
}

if ($("copyRoomIdBtn")) $("copyRoomIdBtn").addEventListener("click", handleCopyRoomId);
if ($("roomsCopyIdBtn")) $("roomsCopyIdBtn").addEventListener("click", handleCopyRoomId);
if ($("dropdownCopyRoomIdBtn")) $("dropdownCopyRoomIdBtn").addEventListener("click", handleCopyRoomId);

if ($("copyInviteLinkBtn")) $("copyInviteLinkBtn").addEventListener("click", handleCopyInviteLink);
if ($("roomsCopyInviteBtn")) $("roomsCopyInviteBtn").addEventListener("click", handleCopyInviteLink);
if ($("dropdownCopyInviteBtn")) $("dropdownCopyInviteBtn").addEventListener("click", handleCopyInviteLink);

if ($("createRoomForm")) {
  $("createRoomForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("createRoomBtn");
    const nameInput = $("createRoomName");
    const msgEl = $("createRoomMessage");
    if (msgEl) msgEl.textContent = "";
    if ($("enterRoomError")) $("enterRoomError").textContent = "";
    if (btn) btn.disabled = true;

    try {
      const data = await api("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name: nameInput ? nameInput.value.trim() : "" })
      });
      if (nameInput) nameInput.value = "";
      if (msgEl) {
        msgEl.textContent = `Created room ${data.roomId} (${data.roomName}).`;
      }
      switchToRoom(
        data.roomId,
        data.roomName,
        `Room ${data.roomId} is ready! Share the Room ID or invite link so others can join.`,
        data.createdBy || currentUsername
      );
    } catch (err) {
      if (msgEl) msgEl.textContent = err.message || "Unable to create room.";
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

if ($("enterRoomForm")) {
  $("enterRoomForm").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("enterRoomInput");
    const errEl = $("enterRoomError");
    const btn = $("enterRoomBtn");
    if (errEl) errEl.textContent = "";
    if ($("createRoomMessage")) $("createRoomMessage").textContent = "";

    const rawRoomId = input ? input.value.trim() : "";
    if (!rawRoomId) {
      if (errEl) errEl.textContent = "Please enter a Room ID or invitation code.";
      return;
    }

    if (btn) btn.disabled = true;
    try {
      const data = await api("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({ roomId: rawRoomId })
      });
      if (input) input.value = "";
      switchToRoom(
        data.roomId,
        data.roomName,
        `Joined room ${data.roomId} (${data.roomName}).`,
        data.createdBy
      );
    } catch (err) {
      if (errEl) errEl.textContent = err.message || "Invalid Room ID.";
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

/* ── App Entry & Authentication ───────────────────────────── */
async function showApp(username, isAdmin, initialRoomId, initialRoomName, initialFeedback, initialOwner) {
  currentUsername = username;
  currentIsAdmin = Boolean(isAdmin);

  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("currentUser").textContent = username;
  if ($("dropdownUsername")) $("dropdownUsername").textContent = username;
  if ($("userAvatarInitial")) $("userAvatarInitial").textContent = username.slice(0, 1).toUpperCase();
  $("welcomeName").textContent = username;
  $("sidebarUsername").textContent = username;

  const adminCard = $("adminCard");
  const adminNavLink = $("adminNavLink");
  if (adminCard) adminCard.classList.toggle("hidden", !isAdmin);
  if (adminNavLink) adminNavLink.classList.toggle("hidden", !isAdmin);
  if (isAdmin) loadUsers();

  resetLocalRoomPluginAndPlayerState();

  if (initialRoomId) {
    updateRoomDisplay(initialRoomId, initialRoomName || `${username}'s Room`, initialOwner || username);
    if (initialFeedback) showShareFeedback(initialFeedback);
  } else {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = (params.get("room") || localStorage.getItem("synctune_active_room") || "").trim();
    if (urlRoom && urlRoom.toUpperCase() !== "MAIN") {
      try {
        const joined = await api("/api/rooms/join", {
          method: "POST",
          body: JSON.stringify({ roomId: urlRoom })
        });
        updateRoomDisplay(joined.roomId, joined.roomName, joined.createdBy);
        showShareFeedback(`Joined invited room ${joined.roomId} (${joined.roomName}).`);
      } catch (err) {
        if ($("enterRoomError")) {
          $("enterRoomError").textContent = err.message || "Invited room was not found.";
        }
        updateRoomDisplay("MAIN", activeRoomName, "System");
      }
    } else {
      updateRoomDisplay(activeRoomId, activeRoomName, activeRoomOwner);
    }
  }

  renderMembersList([], 1);
  connectSocket();
  applyTheme();
  setupSidebarScrollSpy();
  requestAnimationFrame(() => setupScrollRevealObserver());
}

async function logout() {
  window.SyncTuneVoice?.leaveChannel?.();
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {}
  localStorage.removeItem("synctune_token");
  localStorage.removeItem("synctune_active_room");
  if (socket) socket.disconnect();
  window.location.href = "/";
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function handleLoginCreateRoom() {
  const errEl = $("loginError");
  const btn = $("loginCreateRoomBtn");
  errEl.textContent = "";

  const username = $("username").value.trim();
  const password = $("password").value;
  const roomName = $("loginCreateRoomName") ? $("loginCreateRoomName").value.trim() : "";

  if (!username) {
    errEl.textContent = "Please enter your name or username above to create a room.";
    $("username").focus();
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const data = await api("/api/auth/create-room", {
      method: "POST",
      body: JSON.stringify({ username, password, roomName })
    });
    token = data.token;
    localStorage.setItem("synctune_token", token);
    if ($("loginCreateRoomName")) $("loginCreateRoomName").value = "";
    await showApp(
      data.username,
      data.isAdmin,
      data.roomId,
      data.roomName,
      `Room ${data.roomId} created! Share the Room ID or invite link so others can join.`,
      data.createdBy || data.username
    );
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleLoginEnterRoom() {
  const errEl = $("loginError");
  const btn = $("loginEnterRoomBtn");
  errEl.textContent = "";

  const username = $("username").value.trim();
  const password = $("password").value;
  const roomId = $("loginEnterRoomId") ? $("loginEnterRoomId").value.trim() : "";

  if (!username) {
    errEl.textContent = "Please enter your name or username above to join the room.";
    $("username").focus();
    return;
  }
  if (!roomId) {
    errEl.textContent = "Please enter a Room ID or invitation code.";
    if ($("loginEnterRoomId")) $("loginEnterRoomId").focus();
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const data = await api("/api/auth/enter-room", {
      method: "POST",
      body: JSON.stringify({ username, password, roomId })
    });
    token = data.token;
    localStorage.setItem("synctune_token", token);
    if ($("loginEnterRoomId")) $("loginEnterRoomId").value = "";
    await showApp(
      data.username,
      data.isAdmin,
      data.roomId,
      data.roomName,
      `Joined room ${data.roomId} (${data.roomName}).`,
      data.createdBy
    );
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

if ($("loginCreateRoomBtn")) {
  $("loginCreateRoomBtn").addEventListener("click", handleLoginCreateRoom);
}
if ($("loginCreateRoomName")) {
  $("loginCreateRoomName").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLoginCreateRoom();
    }
  });
}
if ($("loginEnterRoomBtn")) {
  $("loginEnterRoomBtn").addEventListener("click", handleLoginEnterRoom);
}
if ($("loginEnterRoomId")) {
  $("loginEnterRoomId").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLoginEnterRoom();
    }
  });
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const errEl = $("loginError");
  const submitBtn = $("loginSubmitBtn");
  errEl.textContent = "";

  const username = $("username").value.trim();
  const password = $("password").value;
  const pendingRoomId = $("loginEnterRoomId") ? $("loginEnterRoomId").value.trim() : "";

  if (pendingRoomId) {
    await handleLoginEnterRoom();
    return;
  }

  if (!username || !password) {
    errEl.textContent =
      "Please enter both your username and password, or use Create Room / Enter Room above.";
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    token = data.token;
    localStorage.setItem("synctune_token", token);
    await showApp(data.username, data.isAdmin);
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

if ($("logoutBtn")) $("logoutBtn").onclick = logout;
if ($("themeBtn")) $("themeBtn").onclick = toggleTheme;
if ($("loginThemeBtn")) $("loginThemeBtn").onclick = toggleTheme;
if ($("settingsThemeBtn")) $("settingsThemeBtn").onclick = toggleTheme;

/* ── Admin Account Management & Exports ───────────────────── */
const adminForm = $("adminForm");
if (adminForm) {
  adminForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!currentIsAdmin) return;
    const message = $("adminMessage");
    message.textContent = "";
    message.classList.remove("error");
    try {
      const result = await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: $("newUsername").value,
          password: $("newPassword").value
        })
      });
      message.textContent = result.message || "User created successfully.";
      $("newUsername").value = "";
      $("newPassword").value = "";
      loadUsers();
    } catch (err) {
      message.textContent = err.message;
      message.classList.add("error");
    }
  });
}

async function loadUsers() {
  if (!currentIsAdmin) return;
  const list = $("userList");
  if (!list) return;
  try {
    const data = await api("/api/admin/users");
    list.innerHTML = "";
    const friends = data.users.filter(user => !user.is_admin);
    $("totalUsers").textContent = data.users.length;
    $("friendUsers").textContent = friends.length;
    if (!data.users.length) {
      list.innerHTML = '<div class="queue-empty">No accounts found</div>';
      return;
    }
    data.users.forEach(user => {
      const row = document.createElement("div");
      row.className = "user-row";
      const isSelf = user.username.toLowerCase() === currentUsername.toLowerCase();
      row.innerHTML = `<div><strong>${escapeHtml(user.username)}</strong><span>${
        user.is_admin
          ? "Administrator"
          : `Friend account · Created ${escapeHtml(formatDate(user.created_at))}`
      }</span></div><div class="user-actions">${
        user.is_admin
          ? `<span class="admin-badge">Admin</span>${
              isSelf
                ? ""
                : `<button class="small-btn" data-toggle-admin="${user.id}" data-next-admin="0">Revoke Admin</button>`
            }`
          : `<button class="small-btn" data-toggle-admin="${user.id}" data-next-admin="1">Make Admin</button><button class="small-btn" data-password="${user.id}">Password</button><button class="small-btn danger" data-delete="${user.id}">Delete</button>`
      }</div>`;
      list.appendChild(row);
    });
    list.querySelectorAll("[data-toggle-admin]").forEach(btn => {
      btn.onclick = async () => {
        const nextAdmin = btn.dataset.nextAdmin === "1";
        try {
          const res = await api(`/api/admin/users/${btn.dataset.toggleAdmin}/role`, {
            method: "PUT",
            body: JSON.stringify({ isAdmin: nextAdmin })
          });
          if ($("adminMessage")) {
            $("adminMessage").textContent = res.message || "Role updated.";
            $("adminMessage").classList.remove("error");
          }
          loadUsers();
        } catch (err) {
          alert(err.message);
        }
      };
    });
    list.querySelectorAll("[data-delete]").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Delete this user?")) return;
        try {
          await api(`/api/admin/users/${btn.dataset.delete}`, { method: "DELETE" });
          loadUsers();
        } catch (err) {
          alert(err.message);
        }
      };
    });
    list.querySelectorAll("[data-password]").forEach(btn => {
      btn.onclick = async () => {
        const password = prompt("Enter the new password:");
        if (password === null) return;
        try {
          await api(`/api/admin/users/${btn.dataset.password}/password`, {
            method: "PUT",
            body: JSON.stringify({ password })
          });
          alert("Password updated.");
        } catch (err) {
          alert(err.message);
        }
      };
    });
  } catch (err) {
    list.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

async function downloadAdminExport(format) {
  if (!currentIsAdmin) return;
  const message = $("exportMessage");
  const buttons = [$("exportCsvBtn"), $("exportPdfBtn")].filter(Boolean);
  message.textContent = "";
  message.classList.remove("error");
  buttons.forEach(button => (button.disabled = true));
  try {
    const response = await fetch(`/api/admin/exports/database.${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store"
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `securesphere-database-export.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = `${format.toUpperCase()} export downloaded.`;
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "Unable to download the export.";
    message.classList.add("error");
  } finally {
    buttons.forEach(button => (button.disabled = false));
  }
}

if ($("exportCsvBtn")) $("exportCsvBtn").addEventListener("click", () => downloadAdminExport("csv"));
if ($("exportPdfBtn")) $("exportPdfBtn").addEventListener("click", () => downloadAdminExport("pdf"));

function formatDate(value) {
  const date = new Date(String(value).replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short"
      }).format(date);
}

function formatMessageTime(timestamp) {
  const d = new Date(Number(timestamp));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

/* ── Reply to Message State & UI ──────────────────────────── */
function startReplyToMessage(messageObj) {
  if (!messageObj || !messageObj.id) return;
  activeReply = {
    id: String(messageObj.id),
    username: String(messageObj.username || "User"),
    message: String(messageObj.message || "")
  };

  const preview = $("replyPreview");
  const userEl = $("replyPreviewUser");
  const textEl = $("replyPreviewText");
  if (userEl) userEl.textContent = activeReply.username;
  if (textEl) textEl.textContent = activeReply.message;
  if (preview) preview.classList.remove("hidden");

  document.querySelectorAll(".chat-message.is-reply-target").forEach(el => {
    el.classList.remove("is-reply-target");
  });
  const targetRow = document.querySelector(
    `.chat-message[data-message-id="${CSS.escape(activeReply.id)}"]`
  );
  if (targetRow) targetRow.classList.add("is-reply-target");

  const input = $("chatMessage");
  if (input) input.focus();
}

function cancelReply() {
  activeReply = null;
  const preview = $("replyPreview");
  if (preview) preview.classList.add("hidden");
  if ($("replyPreviewUser")) $("replyPreviewUser").textContent = "";
  if ($("replyPreviewText")) $("replyPreviewText").textContent = "";
  document.querySelectorAll(".chat-message.is-reply-target").forEach(el => {
    el.classList.remove("is-reply-target");
  });
}

if ($("cancelReplyBtn")) {
  $("cancelReplyBtn").addEventListener("click", () => {
    cancelReply();
    if ($("chatMessage")) $("chatMessage").focus();
  });
}

if ($("chatMessage")) {
  $("chatMessage").addEventListener("keydown", e => {
    if (e.key === "Escape" && activeReply) {
      cancelReply();
    }
  });
}

function renderChat(messages) {
  const list = $("chatList");
  if (!list) return;
  list.innerHTML = "";
  chatMessagesById.clear();
  cancelReply();

  if (!Array.isArray(messages) || !messages.length) {
    list.innerHTML = '<div class="queue-empty">No messages in this room yet. Say hello!</div>';
    applyDiscussionFilter();
    return;
  }
  messages.forEach(appendChatMessage);
  applyDiscussionFilter();
}

const REPLY_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
const COPY_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessageReactionsBar(container, message) {
  if (!container || !message) return;
  const reactions = message.reactions || {};
  const quickEmojis = ["👍", "🔥", "💡", "✅"];
  container.innerHTML = "";

  Object.keys(reactions).forEach(emoji => {
    const users = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
    if (!users.length) return;
    const isMine = users.some(u => u.toLowerCase() === currentUsername.toLowerCase());
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `reaction-pill ${isMine ? "is-reacted" : ""}`;
    btn.title = users.join(", ");
    btn.textContent = `${emoji} ${users.length}`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      socket?.emit("toggleReaction", { messageId: message.id, emoji });
    });
    container.appendChild(btn);
  });

  quickEmojis.forEach(emoji => {
    if (Array.isArray(reactions[emoji]) && reactions[emoji].length) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reaction-pill reaction-picker-trigger";
    btn.textContent = emoji;
    btn.title = `React with ${emoji}`;
    btn.addEventListener("click", e => {
      e.stopPropagation();
      socket?.emit("toggleReaction", { messageId: message.id, emoji });
    });
    container.appendChild(btn);
  });
}

function appendChatMessage(message) {
  const list = $("chatList");
  if (!list || !message) return;

  if (message.roomId && String(message.roomId).toUpperCase() !== activeRoomId) {
    return;
  }

  chatMessagesById.set(String(message.id), message);

  const empty = list.querySelector(".queue-empty");
  if (empty) empty.remove();

  const existingRow = list.querySelector(
    `.chat-message[data-message-id="${CSS.escape(String(message.id))}"]`
  );
  if (existingRow) return;

  const isPrompt = message.messageType === "prompt_suggestion";
  const hasMedia = Boolean(message.media && message.media.id);
  const row = document.createElement("div");
  row.className = `chat-message${isPrompt ? " is-prompt-suggestion" : ""}`;
  row.dataset.messageId = String(message.id);
  row.dataset.messageType = String(message.messageType || "discussion");
  row.dataset.hasMedia = hasMedia ? "true" : "false";
  row.dataset.username = String(message.username || "");
  row.dataset.message = String(message.message || "");
  row.tabIndex = 0;
  row.setAttribute("role", "article");
  row.setAttribute("aria-label", `Message from ${message.username}: ${message.message || "Media"}`);

  const replyInfo =
    message.replyTo ||
    (message.replyToId
      ? {
          id: message.replyToId,
          username:
            message.replyToUsername ||
            chatMessagesById.get(String(message.replyToId))?.username ||
            "User",
          message:
            message.replyToMessage ||
            chatMessagesById.get(String(message.replyToId))?.message ||
            ""
        }
      : null);

  const replyHtml = replyInfo
    ? `<div class="chat-reply-quote" data-jump-id="${escapeHtml(replyInfo.id)}">
         <span class="chat-reply-author">${REPLY_SVG} ${escapeHtml(replyInfo.username)}</span>
         <span class="chat-reply-snippet">${escapeHtml(replyInfo.message)}</span>
       </div>`
    : "";

  const timeLabel = formatMessageTime(message.createdAt);
  const avatarChar = escapeHtml(String(message.username || "U").slice(0, 1).toUpperCase());
  const mediaKindLabelMap = {
    image: "Image",
    video: "Video",
    audio: "Audio",
    pdf: "PDF",
    code: "Code",
    document: "Document",
    file: "File"
  };
  const typePillHtml = hasMedia
    ? `<span class="msg-type-pill is-media">${escapeHtml(
        mediaKindLabelMap[message.media.mediaKind] || "File"
      )}</span>`
    : "";

  let mediaHtml = "";
  if (hasMedia) {
    const m = message.media;
    const safeUrl = escapeHtml(m.url);
    const safeName = escapeHtml(m.originalName || "attachment");
    const sizeText = escapeHtml(formatBytes(m.fileSize));
    const uploaderText = escapeHtml(m.uploaderUsername || message.username);
    const extBadge = escapeHtml(
      ((m.originalName || "").includes(".")
        ? (m.originalName || "").split(".").pop()
        : m.mediaKind || "FILE"
      )
        .toUpperCase()
        .slice(0, 8)
    );
    if (m.mediaKind === "image") {
      mediaHtml = `
        <div class="chat-media-card">
          <button type="button" class="chat-media-image-btn" data-lightbox-url="${safeUrl}" data-lightbox-name="${safeName}" data-lightbox-meta="${sizeText} · Uploaded by ${uploaderText}">
            <img src="${safeUrl}" alt="${safeName}" loading="lazy">
          </button>
          <div class="chat-media-footer">
            <div class="chat-media-meta">
              <strong>${safeName}</strong>
              <span class="muted">${sizeText} · ${uploaderText}</span>
            </div>
            <a class="small-btn" href="${safeUrl}?download=1" download="${safeName}" onclick="event.stopPropagation()">Download</a>
          </div>
        </div>
      `;
    } else if (m.mediaKind === "video") {
      mediaHtml = `
        <div class="chat-media-card" data-video-url="${safeUrl}" data-video-mime="${escapeHtml(m.mimeType)}">
          <div class="chat-video-placeholder">
            <div class="chat-media-meta">
              <strong>${safeName}</strong>
              <span class="muted">${sizeText} · Click Load Video to stream</span>
            </div>
            <button type="button" class="small-btn load-video-btn">Play Video</button>
          </div>
          <div class="chat-media-footer">
            <div class="chat-media-meta">
              <span>Uploaded by ${uploaderText}</span>
            </div>
            <a class="small-btn" href="${safeUrl}?download=1" download="${safeName}" onclick="event.stopPropagation()">Download</a>
          </div>
        </div>
      `;
    } else if (m.mediaKind === "audio") {
      mediaHtml = `
        <div class="chat-file-card is-audio">
          <div class="chat-file-row">
            <span class="chat-file-ext-badge is-audio">${extBadge || "AUDIO"}</span>
            <div class="chat-file-info">
              <strong>${safeName}</strong>
              <span class="muted">${sizeText} · ${uploaderText}</span>
            </div>
            <a class="small-btn" href="${safeUrl}?download=1" download="${safeName}" onclick="event.stopPropagation()">Download</a>
          </div>
          <audio class="chat-audio-player" controls preload="metadata" src="${safeUrl}" onclick="event.stopPropagation()"></audio>
        </div>
      `;
    } else {
      const canInlinePreview =
        ["code", "document"].includes(m.mediaKind) && Number(m.fileSize || 0) <= 512 * 1024;
      const canOpenInline = m.mediaKind === "pdf";
      mediaHtml = `
        <div class="chat-file-card is-${escapeHtml(m.mediaKind || "file")}">
          <div class="chat-file-row">
            <span class="chat-file-ext-badge is-${escapeHtml(m.mediaKind || "file")}">${extBadge || "FILE"}</span>
            <div class="chat-file-info">
              <strong>${safeName}</strong>
              <span class="muted">${sizeText} · ${escapeHtml(mediaKindLabelMap[m.mediaKind] || "File")} · ${uploaderText}</span>
            </div>
            <div class="chat-file-actions">
              ${
                canInlinePreview
                  ? `<button type="button" class="small-btn preview-file-btn" data-file-preview-url="${safeUrl}" data-file-name="${safeName}">Preview</button>`
                  : ""
              }
              ${
                canOpenInline
                  ? `<a class="small-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">View PDF</a>`
                  : ""
              }
              <a class="small-btn" href="${safeUrl}?download=1" download="${safeName}" onclick="event.stopPropagation()">Download</a>
            </div>
          </div>
          <div class="chat-file-preview-box hidden"></div>
        </div>
      `;
    }
  }

  const copyBtnHtml = isPrompt
    ? `<button type="button" class="reply-btn copy-prompt-btn" data-copy-prompt="${escapeHtml(
        message.id
      )}">${COPY_SVG}<span>Copy Prompt</span></button>`
    : message.message
    ? `<button type="button" class="reply-btn copy-msg-btn" data-copy-msg="${escapeHtml(
        message.id
      )}">${COPY_SVG}<span>Copy</span></button>`
    : "";

  const modBtnHtml = isWorkspaceOwner()
    ? `<button type="button" class="reply-btn delete-msg-btn" title="Remove message" aria-label="Remove message">${TRASH_SVG}</button>`
    : "";

  const saveBtnHtml = message.message
    ? `<button type="button" class="reply-btn save-msg-btn" title="Save to Saved Items"><span>Save</span></button>`
    : "";

  row.innerHTML = `
    <div class="chat-message-top">
      <div class="chat-author-meta">
        <span class="chat-author-avatar" aria-hidden="true">${avatarChar}</span>
        <strong class="chat-author">${escapeHtml(message.username)}</strong>
        ${timeLabel ? `<time class="chat-time">${escapeHtml(timeLabel)}</time>` : ""}
        ${typePillHtml}
      </div>
      <div class="chat-message-actions">
        ${copyBtnHtml}
        ${saveBtnHtml}
        <button type="button" class="reply-btn" data-reply-btn="${escapeHtml(
          message.id
        )}" aria-label="Reply to ${escapeHtml(message.username)}">${REPLY_SVG}<span>Reply</span></button>
        ${modBtnHtml}
      </div>
    </div>
    ${replyHtml}
    ${message.message ? `<div class="chat-text">${escapeHtml(message.message)}</div>` : ""}
    ${mediaHtml}
    <div class="chat-reactions-bar"></div>
  `;

  const reactionsBar = row.querySelector(".chat-reactions-bar");
  renderMessageReactionsBar(reactionsBar, message);

  const replyBtn = row.querySelector("[data-reply-btn]");
  if (replyBtn) {
    replyBtn.addEventListener("click", e => {
      e.stopPropagation();
      startReplyToMessage(message);
    });
  }

  const copyPromptBtn = row.querySelector(".copy-prompt-btn");
  if (copyPromptBtn) {
    copyPromptBtn.addEventListener("click", async e => {
      e.stopPropagation();
      await copyTextToClipboard(message.message || "");
      copyPromptBtn.querySelector("span").textContent = "Copied!";
      setTimeout(() => {
        if (copyPromptBtn.querySelector("span")) {
          copyPromptBtn.querySelector("span").textContent = "Copy";
        }
      }, 1400);
    });
  }

  const copyMsgBtn = row.querySelector(".copy-msg-btn");
  if (copyMsgBtn) {
    copyMsgBtn.addEventListener("click", async e => {
      e.stopPropagation();
      await copyTextToClipboard(message.message || "");
      copyMsgBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => {
        if (copyMsgBtn.querySelector("span")) {
          copyMsgBtn.querySelector("span").textContent = "Copy";
        }
      }, 1200);
    });
  }

  const saveMsgBtn = row.querySelector(".save-msg-btn");
  if (saveMsgBtn) {
    saveMsgBtn.addEventListener("click", e => {
      e.stopPropagation();
      saveWorkspaceBookmark({
        id: message.id,
        author: message.username,
        type: message.messageType === "prompt_suggestion" ? "Prompt Suggestion" : "Chat Message",
        content: message.message || "",
        roomId: activeRoomId,
        savedAt: Date.now()
      });
      const label = saveMsgBtn.querySelector("span");
      if (label) {
        label.textContent = "Saved";
        setTimeout(() => {
          if (label) label.textContent = "Save";
        }, 1200);
      }
    });
  }

  const deleteBtn = row.querySelector(".delete-msg-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (confirm("Remove this message from the room discussion?")) {
        socket?.emit("chat:deleteMessage", { messageId: message.id });
      }
    });
  }

  const lightboxTrigger = row.querySelector("[data-lightbox-url]");
  if (lightboxTrigger) {
    lightboxTrigger.addEventListener("click", e => {
      e.stopPropagation();
      openMediaLightbox(
        lightboxTrigger.getAttribute("data-lightbox-url"),
        lightboxTrigger.getAttribute("data-lightbox-name"),
        lightboxTrigger.getAttribute("data-lightbox-meta")
      );
    });
  }

  const loadVideoBtn = row.querySelector(".load-video-btn");
  if (loadVideoBtn) {
    loadVideoBtn.addEventListener("click", e => {
      e.stopPropagation();
      const card = loadVideoBtn.closest(".chat-media-card");
      const url = card?.getAttribute("data-video-url");
      const mime = card?.getAttribute("data-video-mime") || "video/mp4";
      const placeholder = card?.querySelector(".chat-video-placeholder");
      if (placeholder && url) {
        const video = document.createElement("video");
        video.className = "chat-video-player";
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        const srcEl = document.createElement("source");
        srcEl.src = url;
        srcEl.type = mime;
        video.appendChild(srcEl);
        placeholder.replaceWith(video);
      }
    });
  }

  const previewFileBtn = row.querySelector(".preview-file-btn");
  if (previewFileBtn) {
    previewFileBtn.addEventListener("click", async e => {
      e.stopPropagation();
      const card = previewFileBtn.closest(".chat-file-card");
      const box = card?.querySelector(".chat-file-preview-box");
      if (!box) return;
      if (!box.classList.contains("hidden")) {
        box.classList.add("hidden");
        previewFileBtn.textContent = "Preview";
        return;
      }
      if (box.dataset.loaded === "1") {
        box.classList.remove("hidden");
        previewFileBtn.textContent = "Hide";
        return;
      }
      const url = previewFileBtn.getAttribute("data-file-preview-url");
      const fname = previewFileBtn.getAttribute("data-file-name") || "file";
      previewFileBtn.disabled = true;
      previewFileBtn.textContent = "Loading...";
      try {
        const res = await fetch(`${url}?preview=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error("Unable to preview file.");
        const txt = await res.text();
        const highlighted = highlightCodeTokens(txt.slice(0, 60000));
        box.innerHTML = `
          <div class="md-code-block">
            <div class="md-code-header">
              <span>${escapeHtml(fname)}</span>
              <button type="button" class="small-btn file-copy-preview-btn">Copy</button>
            </div>
            <pre><code>${highlighted}</code></pre>
          </div>
        `;
        box.querySelector(".file-copy-preview-btn")?.addEventListener("click", async ev => {
          ev.stopPropagation();
          await copyTextToClipboard(txt);
          ev.target.textContent = "Copied!";
          setTimeout(() => {
            ev.target.textContent = "Copy";
          }, 1200);
        });
        box.dataset.loaded = "1";
        box.classList.remove("hidden");
        previewFileBtn.textContent = "Hide";
      } catch (err) {
        box.textContent = err.message || "Preview unavailable.";
        box.classList.remove("hidden");
        previewFileBtn.textContent = "Hide";
      } finally {
        previewFileBtn.disabled = false;
      }
    });
  }

  const quoteEl = row.querySelector(".chat-reply-quote");
  if (quoteEl) {
    quoteEl.addEventListener("click", e => {
      e.stopPropagation();
      const targetId = quoteEl.getAttribute("data-jump-id");
      if (!targetId) return;
      const origEl = list.querySelector(`.chat-message[data-message-id="${CSS.escape(targetId)}"]`);
      if (origEl) {
        origEl.scrollIntoView({ behavior: "smooth", block: "center" });
        origEl.classList.add("is-highlighted");
        setTimeout(() => origEl.classList.remove("is-highlighted"), 1400);
      }
    });
  }

  row.addEventListener("click", () => {
    const selection = window.getSelection ? String(window.getSelection()) : "";
    if (selection.length > 0) return;
    startReplyToMessage(message);
  });

  row.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      startReplyToMessage(message);
    }
  });

  list.appendChild(row);
  applyDiscussionFilter();
  list.scrollTop = list.scrollHeight;
}

/* ── Socket.IO Connection & Real-Time Events ──────────────── */
function connectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io({
    auth: { token, roomId: activeRoomId },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 250,
    reconnectionDelayMax: 1500
  });

  socket.on("connect", () => {
    if ($("status")) $("status").textContent = `Connected · Room ${activeRoomId}`;
    socket.emit("joinRoom", { roomId: activeRoomId }, response => {
      if (response && response.ok) {
        updateRoomDisplay(response.roomId, response.roomName, response.owner);
        if (typeof response.allowMemberPluginToggle === "boolean") {
          allowMemberPluginToggle = response.allowMemberPluginToggle;
        }
        if (typeof response.whiteboardMemberDraw === "boolean") {
          whiteboardMemberDraw = response.whiteboardMemberDraw;
        }
        if (response.plugins) {
          pluginStates.youtube = Boolean(response.plugins.youtube);
          pluginStates.games = Boolean(response.plugins.games);
          renderPluginsUI();
        }
        if (response.members) {
          roomMembers = response.members;
          renderMembersList(roomMembers, response.onlineCount);
        }
      }
    });
  });

  socket.on("connect_error", () => {
    if ($("status")) $("status").textContent = "Connection lost. Reconnecting...";
  });

  socket.on("presence", data => {
    if (data?.roomId && String(data.roomId).toUpperCase() !== activeRoomId) return;
    if (data?.owner) activeRoomOwner = data.owner;
    if (Array.isArray(data?.members)) {
      roomMembers = data.members;
      renderMembersList(roomMembers, data.count);
    } else if (typeof data?.count === "number") {
      if ($("presenceText")) $("presenceText").textContent = `${data.count} online`;
      if ($("overviewOnlineCount")) $("overviewOnlineCount").textContent = `${data.count} Online`;
      if ($("collabHeaderOnlineCount")) $("collabHeaderOnlineCount").textContent = `${data.count} online`;
    }
    renderPermissionsAndSettingsUI();
  });

  socket.on("roomStatus", data => {
    if (data?.roomId && String(data.roomId).toUpperCase() !== activeRoomId) return;
    if (data?.roomName) updateRoomDisplay(data.roomId || activeRoomId, data.roomName);
    const roomOpenedAt = data.roomOpenedAt === null ? null : Number(data.roomOpenedAt);
    startSidebarClock(Number.isFinite(roomOpenedAt) && roomOpenedAt > 0 ? roomOpenedAt : null);
  });

  socket.on("errorMessage", msg => {
    if ($("songError")) $("songError").textContent = msg;
    if ($("queueError")) $("queueError").textContent = msg;
  });

  socket.on("state", state => {
    if (state?.roomId && String(state.roomId).toUpperCase() !== activeRoomId) return;
    pendingState = { ...state, receivedAt: performance.now() };
    if (state?.owner) activeRoomOwner = state.owner;
    if (typeof state?.allowMemberPluginToggle === "boolean") {
      allowMemberPluginToggle = state.allowMemberPluginToggle;
    }
    if (typeof state?.whiteboardMemberDraw === "boolean") {
      whiteboardMemberDraw = state.whiteboardMemberDraw;
    }
    if (state?.plugins) {
      pluginStates.youtube = Boolean(state.plugins.youtube);
      pluginStates.games = Boolean(state.plugins.games);
      renderPluginsUI();
    }
    if (pluginStates.youtube) {
      applyState(state);
    }
    updateCollabHeader();
  });

  socket.on("chatHistory", renderChat);
  socket.on("chatMessage", appendChatMessage);

  socket.on("messageReactionUpdated", payload => {
    if (!payload?.messageId) return;
    const msg = chatMessagesById.get(String(payload.messageId));
    if (msg) {
      msg.reactions = payload.reactions || {};
      const row = document.querySelector(
        `.chat-message[data-message-id="${CSS.escape(String(payload.messageId))}"]`
      );
      const bar = row?.querySelector(".chat-reactions-bar");
      if (bar) renderMessageReactionsBar(bar, msg);
    }
  });

  socket.on("chatMessageDeleted", payload => {
    if (!payload?.messageId) return;
    chatMessagesById.delete(String(payload.messageId));
    const row = document.querySelector(
      `.chat-message[data-message-id="${CSS.escape(String(payload.messageId))}"]`
    );
    if (row) row.remove();
  });

  socket.on("chatCleared", payload => {
    if (payload?.roomId && String(payload.roomId).toUpperCase() !== activeRoomId) return;
    renderChat([]);
    if ($("chatError")) $("chatError").textContent = "";
  });

  socket.on("whiteboardState", payload => {
    if (payload?.roomId && String(payload.roomId).toUpperCase() !== activeRoomId) return;
    wbElements = Array.isArray(payload.elements) ? payload.elements : [];
    if (typeof payload.memberDrawAllowed === "boolean") {
      whiteboardMemberDraw = payload.memberDrawAllowed;
      renderPermissionsAndSettingsUI();
    }
    wbCursors.clear();
    if (Array.isArray(payload.cursors)) {
      payload.cursors.forEach(c => {
        if (c.socketId !== socket.id) wbCursors.set(c.socketId, c);
      });
    }
    renderWhiteboardCollaborators();
    renderWhiteboardCursors();
    renderWhiteboard();
  });

  socket.on("whiteboard:cursor", cursor => {
    if (!cursor || cursor.socketId === socket.id) return;
    wbCursors.set(cursor.socketId, cursor);
    renderWhiteboardCollaborators();
    renderWhiteboardCursors();
  });

  socket.on("whiteboard:cursor:remove", payload => {
    if (!payload?.socketId) return;
    wbCursors.delete(payload.socketId);
    renderWhiteboardCollaborators();
    renderWhiteboardCursors();
  });

  socket.on("whiteboard:stroke:progress", payload => {
    if (!payload?.id || payload.socketId === socket.id) return;
    wbLiveStrokes.set(payload.id, payload);
    renderWhiteboard();
  });

  socket.on("whiteboard:element:upserted", payload => {
    const el = payload?.element;
    if (!el || !el.id) return;
    wbLiveStrokes.delete(el.id);
    const idx = wbElements.findIndex(item => item.id === el.id);
    if (idx >= 0) wbElements[idx] = el;
    else wbElements.push(el);
    renderWhiteboard();
  });

  socket.on("whiteboard:element:deleted", payload => {
    const ids = Array.isArray(payload?.ids) ? new Set(payload.ids) : new Set();
    if (!ids.size) return;
    wbElements = wbElements.filter(el => !ids.has(el.id));
    renderWhiteboard();
  });

  socket.on("adminSwitched", info => {
    if (info?.roomId && String(info.roomId).toUpperCase() !== activeRoomId) return;
    if (info?.newAdmin) activeRoomOwner = info.newAdmin;
    renderPermissionsAndSettingsUI();
    renderPluginsUI();
    renderMembersList(roomMembers, roomMembers.length);
    if ($("switchAdminFeedback") && info?.newAdmin) {
      $("switchAdminFeedback").textContent = `Room Admin is now ${info.newAdmin}.`;
      $("switchAdminFeedback").classList.remove("error");
    }
    window.SyncTuneGames?.onRoomStateUpdated?.();
  });

  socket.on("accountRoleUpdated", info => {
    if (!info || String(info.username || "").toLowerCase() !== currentUsername.toLowerCase()) return;
    currentIsAdmin = Boolean(info.isAdmin);
    if ($("adminCard")) $("adminCard").classList.toggle("hidden", !currentIsAdmin);
    if ($("adminNavLink")) $("adminNavLink").classList.toggle("hidden", !currentIsAdmin);
    if (currentIsAdmin) {
      loadUsers();
    } else if ($("userList")) {
      $("userList").innerHTML = "";
    }
    renderPermissionsAndSettingsUI();
    renderPluginsUI();
    renderMembersList(roomMembers, roomMembers.length);
    window.SyncTuneGames?.onRoomStateUpdated?.();
  });

  socket.on("notifications:state", payload => {
    handleNotificationsStatePayload(payload);
  });

  socket.on("notification:new", payload => {
    handleIncomingNotification(payload);
  });

  window.SyncTuneGames?.onSocketReady?.(socket);
  window.SyncTuneVoice?.onSocketReady?.(socket);
}

/* ── YouTube Synchronized Player & Shared Queue ───────────── */
function updateMediaSession(state) {
  if (!("mediaSession" in navigator) || !pluginStates.youtube) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: state.videoId ? "Shared YouTube track" : "SecureSphere",
    artist: state.changedBy ? `Shared by ${state.changedBy}` : "Synchronized music",
    album: activeRoomName
  });
  navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
}

function setupBackgroundPlayback() {
  if (!("mediaSession" in navigator)) return;
  const action = (name, handler) => {
    try {
      navigator.mediaSession.setActionHandler(name, handler);
    } catch {}
  };
  action("play", () => {
    if (pluginStates.youtube) socket?.emit("play", currentTime());
  });
  action("pause", () => {
    if (pluginStates.youtube) socket?.emit("pause", currentTime());
  });
  action("seekbackward", () => {
    if (pluginStates.youtube && player?.seekTo) player.seekTo(Math.max(0, currentTime() - 10), true);
  });
  action("seekforward", () => {
    if (pluginStates.youtube && player?.seekTo) player.seekTo(currentTime() + 10, true);
  });
  action("nexttrack", () => {
    if (pluginStates.youtube) socket?.emit("next");
  });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && socket) socket.emit("requestSync");
});

function markRemoteControl(ms = 1200) {
  remoteControlUntil = Date.now() + ms;
  suppressEvents = true;
  setTimeout(() => {
    if (Date.now() >= remoteControlUntil) suppressEvents = false;
  }, ms + 50);
}

function ensurePlayer(videoId) {
  if (!pluginStates.youtube) return;
  if (!window.YT || !YT.Player) {
    pendingState = { ...pendingState, videoId };
    return;
  }
  if (!player) {
    $("emptyPlayer").classList.add("hidden");
    player = new YT.Player("player", {
      videoId,
      playerVars: { playsinline: 1, controls: 1, rel: 0, origin: location.origin },
      events: {
        onReady: () => {
          if (pendingState && pluginStates.youtube) syncPlayerToState(pendingState, true);
        },
        onStateChange: event => {
          if (!pluginStates.youtube || suppressEvents || Date.now() < remoteControlUntil) return;
          if (event.data === YT.PlayerState.ENDED) {
            socket?.emit("ended");
            return;
          }
          if (event.data === YT.PlayerState.PLAYING) {
            socket?.emit("play", player.getCurrentTime());
          } else if (event.data === YT.PlayerState.PAUSED) {
            socket?.emit("pause", player.getCurrentTime());
          }
        }
      }
    });
  } else if (player.getVideoData()?.video_id !== videoId) {
    const state = pendingState || {};
    const elapsed = (Date.now() - Number(state.serverTime || Date.now())) / 1000;
    const desired = Math.max(0, Number(state.position || 0) + (state.playing ? elapsed : 0));
    markRemoteControl(1600);
    lastVideoId = videoId;
    player.loadVideoById({ videoId, startSeconds: desired });
  }
}

function syncPlayerToState(state, force) {
  if (!pluginStates.youtube || !player || !player.seekTo) return;
  const elapsed = (Date.now() - Number(state.serverTime || Date.now())) / 1000;
  const desired = Math.max(0, Number(state.position || 0) + (state.playing ? elapsed : 0));
  const actual = Number(player.getCurrentTime() || 0);
  const differentVideo =
    lastVideoId !== state.videoId || player.getVideoData()?.video_id !== state.videoId;
  markRemoteControl(force ? 1800 : 1000);
  if (differentVideo) {
    lastVideoId = state.videoId;
    player.loadVideoById({ videoId: state.videoId, startSeconds: desired });
  } else if (Math.abs(actual - desired) > 0.8) {
    player.seekTo(desired, true);
  }
  if (state.playing) {
    player.setPlaybackRate(1);
    player.playVideo();
  } else {
    player.setPlaybackRate(1);
    player.pauseVideo();
  }
  $("status").textContent = state.playing
    ? `Playing · ${state.changedBy}`
    : `Paused · ${state.changedBy}`;
  lastSyncAt = Date.now();
  setTimeout(() => {
    if (player && pendingState === state && state.playing && pluginStates.youtube) {
      player.setPlaybackRate(1);
    }
  }, 500);
}

function applyState(state) {
  pendingState = { ...state, receivedAt: performance.now() };
  if (!pluginStates.youtube) return;
  updateMediaSession(state);
  renderQueue(state.queue || []);
  if (!state.videoId) {
    $("emptyPlayer").classList.remove("hidden");
    $("status").textContent = "Queue a song to start playback.";
    return;
  }
  $("emptyPlayer").classList.add("hidden");
  ensurePlayer(state.videoId);
  if (player) syncPlayerToState(pendingState, false);
}

function renderQueue(items) {
  const list = $("queueList");
  const countBadge = $("ytQueueCountBadge");
  if (countBadge) countBadge.textContent = String(items.length || 0);
  if (!list) return;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<div class="queue-empty">Queue is empty</div>';
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.innerHTML = `<div class="queue-number">${index + 1}</div><div class="queue-info"><strong>YouTube Track (${escapeHtml(
      item.videoId
    )})</strong><span>Added by ${escapeHtml(
      item.addedBy
    )}</span></div><button class="small-btn danger" data-remove="${item.id}">Remove</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => {
      if (pluginStates.youtube) socket?.emit("removeFromQueue", btn.dataset.remove);
    };
  });
}

function currentTime() {
  return player && player.getCurrentTime ? player.getCurrentTime() : 0;
}

$("songForm").addEventListener("submit", e => {
  e.preventDefault();
  $("songError").textContent = "";
  if (!socket || !pluginStates.youtube) return;
  socket.emit("setSong", $("youtubeUrl").value);
  $("youtubeUrl").value = "";
});

$("queueForm").addEventListener("submit", e => {
  e.preventDefault();
  $("queueError").textContent = "";
  if (!socket || !pluginStates.youtube) return;
  socket.emit("addToQueue", $("queueUrl").value);
  $("queueUrl").value = "";
});

$("playBtn").onclick = () => {
  if (player && socket && pluginStates.youtube) socket.emit("play", currentTime());
};

$("pauseBtn").onclick = () => {
  if (player && socket && pluginStates.youtube) socket.emit("pause", currentTime());
};

$("nextBtn").onclick = () => {
  if (socket && pluginStates.youtube) socket.emit("next");
};

$("syncBtn").onclick = () => {
  if (socket && pluginStates.youtube) socket.emit("requestSync");
};

$("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  const input = $("chatMessage");
  const send = $("chatSendBtn");
  const message = input.value.trim();
  if ((!message && !pendingAttachment) || !socket) return;

  send.disabled = true;
  $("chatError").textContent = "";

  let uploadedMediaId = null;
  try {
    if (pendingAttachment?.file) {
      const progressWrap = $("mediaUploadProgressWrap");
      const progressBar = $("mediaUploadProgress");
      if (progressWrap) progressWrap.classList.remove("hidden");
      if (progressBar) progressBar.style.width = "10%";
      const media = await uploadRoomMediaFile(pendingAttachment.file, pct => {
        if (progressBar) progressBar.style.width = `${pct}%`;
      });
      uploadedMediaId = media.id;
    }
  } catch (err) {
    send.disabled = false;
    $("chatError").textContent = err.message || "Media upload failed.";
    if ($("mediaUploadProgressWrap")) $("mediaUploadProgressWrap").classList.add("hidden");
    return;
  }

  const payload = {
    message,
    messageType: uploadedMediaId && !message ? "media" : "discussion",
    targetPlatform: null,
    mediaId: uploadedMediaId,
    clientId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    ...(activeReply
      ? {
          replyToId: activeReply.id,
          replyToUsername: activeReply.username,
          replyToMessage: activeReply.message
        }
      : {})
  };

  socket.timeout(5000).emit("sendMessage", payload, (error, result) => {
    send.disabled = false;
    if (error || !result?.ok) {
      $("chatError").textContent =
        result?.error || "Connection lost before your message was delivered.";
      return;
    }
    $("chatError").textContent = "";
    input.value = "";
    clearPendingAttachment();
    cancelReply();
    input.focus();
  });
});

$("emojiBtn").onclick = () => {
  const input = $("chatMessage");
  input.value += input.value ? " :)" : ":)";
  input.focus();
};

function onYouTubeIframeAPIReady() {
  if (pendingState?.videoId && pluginStates.youtube) ensurePlayer(pendingState.videoId);
}

setupBackgroundPlayback();

setInterval(() => {
  if (!pluginStates.youtube || !player || !socket || !pendingState?.videoId || !pendingState.playing) {
    return;
  }
  const now = Date.now();
  if (now - lastSyncAt < 1200 || now < remoteControlUntil) return;
  const desired =
    Number(pendingState.position || 0) + (now - Number(pendingState.serverTime || now)) / 1000;
  const actual = currentTime();
  const drift = desired - actual;
  if (Math.abs(drift) > 1.25) {
    markRemoteControl(700);
    player.seekTo(desired, true);
  } else if (Math.abs(drift) > 0.12) {
    player.setPlaybackRate(drift > 0 ? 1.03 : 0.97);
  } else {
    player.setPlaybackRate(1);
  }
}, 900);

/* ═══════════════════════════════════════════════════════════════
   COLLABORATIVE WORKSPACE: TABS, DISCUSSION, MEDIA & WHITEBOARD
   ═══════════════════════════════════════════════════════════════ */

function updateCollabHeader() {
  if ($("collabHeaderRoomName")) {
    $("collabHeaderRoomName").textContent = activeRoomName;
  }
}

function switchCollabTab(tabName) {
  activeCollabTab = ["discussion", "whiteboard"].includes(tabName) ? tabName : "discussion";
  const tabMap = {
    discussion: { btn: $("collabTabDiscussion"), pane: $("collabViewDiscussion") },
    whiteboard: { btn: $("collabTabWhiteboard"), pane: $("collabViewWhiteboard") }
  };

  Object.keys(tabMap).forEach(key => {
    const isAct = key === activeCollabTab;
    if (tabMap[key].btn) {
      tabMap[key].btn.classList.toggle("is-active", isAct);
      tabMap[key].btn.setAttribute("aria-selected", String(isAct));
    }
    if (tabMap[key].pane) {
      tabMap[key].pane.classList.toggle("hidden", !isAct);
    }
  });

  if (activeCollabTab === "whiteboard") {
    requestAnimationFrame(() => {
      resizeWhiteboardCanvas();
      renderWhiteboard();
      renderWhiteboardCursors();
    });
  }
}

/* ── Discussion Filters ───────────────────────────────────── */
function applyDiscussionFilter() {
  const list = $("chatList");
  if (!list) return;
  const rows = list.querySelectorAll(".chat-message");
  rows.forEach(row => {
    const type = row.dataset.messageType || "discussion";
    const hasMedia = row.dataset.hasMedia === "true";
    let show = true;
    if (discussionFilter === "media") {
      show = hasMedia || type === "media";
    }
    row.classList.toggle("hidden", !show);
  });
}

/* ── Media & Document/Code Upload, Preview, Drag/Drop & Paste ─ */
const IMAGE_STAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const VIDEO_STAGE_EXTS = new Set(["mp4", "webm", "mov"]);
const AUDIO_STAGE_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba"]);
const CODE_STAGE_EXTS = new Set([
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "java", "c", "cc", "cpp", "h", "hpp",
  "cs", "go", "rs", "rb", "php", "swift", "kt", "kts", "scala", "sql", "sh", "bash",
  "zsh", "ps1", "bat", "cmd", "html", "htm", "css", "scss", "sass", "less", "json",
  "jsonc", "yaml", "yml", "toml", "xml", "svg", "ini", "env", "conf", "vue", "svelte"
]);
const DOC_STAGE_EXTS = new Set([
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp",
  "rtf", "csv", "tsv", "txt", "md", "markdown", "log", "tex", "pages", "numbers", "key"
]);

function classifyLocalFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = (file?.name || "").includes(".") ? (file.name || "").split(".").pop().toLowerCase() : "";
  if (IMAGE_STAGE_EXTS.has(ext) || ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(mime)) {
    return { kind: "image", ext: ext || "IMG", maxMb: 15 };
  }
  if (VIDEO_STAGE_EXTS.has(ext) || ["video/mp4", "video/webm", "video/quicktime"].includes(mime)) {
    return { kind: "video", ext: ext || "VID", maxMb: 50 };
  }
  if (ext === "pdf" || mime === "application/pdf") {
    return { kind: "pdf", ext: "PDF", maxMb: 50 };
  }
  if (AUDIO_STAGE_EXTS.has(ext) || mime.startsWith("audio/")) {
    return { kind: "audio", ext: (ext || "AUD").toUpperCase(), maxMb: 50 };
  }
  if (CODE_STAGE_EXTS.has(ext)) {
    return { kind: "code", ext: ext.toUpperCase(), maxMb: 50 };
  }
  if (DOC_STAGE_EXTS.has(ext) || mime.startsWith("text/")) {
    return { kind: "document", ext: (ext || "DOC").toUpperCase(), maxMb: 50 };
  }
  return { kind: "file", ext: (ext || "FILE").toUpperCase().slice(0, 6), maxMb: 50 };
}

function clearPendingAttachment() {
  if (pendingAttachment?.objectUrl) {
    try {
      URL.revokeObjectURL(pendingAttachment.objectUrl);
    } catch {}
  }
  pendingAttachment = null;
  if ($("mediaFileInput")) $("mediaFileInput").value = "";
  if ($("mediaAttachmentStage")) $("mediaAttachmentStage").classList.add("hidden");
  if ($("mediaPreviewThumb")) $("mediaPreviewThumb").innerHTML = "";
  if ($("mediaUploadProgressWrap")) $("mediaUploadProgressWrap").classList.add("hidden");
  if ($("mediaUploadProgress")) $("mediaUploadProgress").style.width = "0%";
}

function stageMediaFile(file) {
  if (!file) return;
  $("chatError").textContent = "";
  if (file.size === 0) {
    $("chatError").textContent = "Cannot upload an empty file (0 bytes).";
    return;
  }
  const info = classifyLocalFile(file);
  const maxBytes = info.maxMb * 1024 * 1024;
  if (file.size > maxBytes) {
    $("chatError").textContent = `File exceeds the ${info.maxMb} MB upload limit.`;
    return;
  }

  clearPendingAttachment();
  const objectUrl = ["image", "video", "audio"].includes(info.kind) ? URL.createObjectURL(file) : null;
  pendingAttachment = { file, objectUrl, mediaKind: info.kind };

  if ($("mediaPreviewName")) $("mediaPreviewName").textContent = file.name || "attachment";
  if ($("mediaPreviewSize")) $("mediaPreviewSize").textContent = `${formatBytes(file.size)} · ${info.ext}`;
  if ($("mediaPreviewThumb")) {
    if (info.kind === "video" && objectUrl) {
      $("mediaPreviewThumb").innerHTML = `<video src="${escapeHtml(objectUrl)}" muted playsinline></video>`;
    } else if (info.kind === "image" && objectUrl) {
      $("mediaPreviewThumb").innerHTML = `<img src="${escapeHtml(objectUrl)}" alt="Attachment preview">`;
    } else {
      $("mediaPreviewThumb").innerHTML = `<div class="chat-stage-file-badge is-${escapeHtml(info.kind)}">${escapeHtml(info.ext)}</div>`;
    }
  }
  if ($("mediaAttachmentStage")) $("mediaAttachmentStage").classList.remove("hidden");
}

function uploadRoomMediaFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/rooms/${encodeURIComponent(activeRoomId)}/media`, true);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name || "upload"));
    xhr.setRequestHeader("X-Mime-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = evt => {
      if (evt.lengthComputable && typeof onProgress === "function") {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };
    xhr.onload = () => {
      let parsed = {};
      try {
        parsed = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && parsed.media) {
        resolve(parsed.media);
      } else {
        reject(new Error(parsed.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

function openMediaLightbox(url, name, metaText) {
  const modal = $("mediaLightboxModal");
  if (!modal || !url) return;
  if ($("lightboxImg")) $("lightboxImg").src = url;
  if ($("lightboxFileName")) $("lightboxFileName").textContent = name || "Shared Image";
  if ($("lightboxFileMeta")) $("lightboxFileMeta").textContent = metaText || "";
  if ($("lightboxDownloadLink")) {
    $("lightboxDownloadLink").href = `${url}?download=1`;
    $("lightboxDownloadLink").setAttribute("download", name || "image");
  }
  modal.classList.remove("hidden");
}

function closeMediaLightbox() {
  const modal = $("mediaLightboxModal");
  if (modal) modal.classList.add("hidden");
  if ($("lightboxImg")) $("lightboxImg").src = "";
}

/* ── Safe Markdown & Syntax Highlighter for Official AI Responses ─ */
function highlightCodeTokens(rawCode) {
  const src = String(rawCode || "");
  const tokenRegex =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\\n])*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|async|await|if|else|for|while|switch|case|break|import|export|from|class|new|try|catch|throw|def|SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|CREATE|TABLE|TRUE|FALSE|null|true|false|undefined)\b/g;
  let out = "";
  let lastIdx = 0;
  let match;
  while ((match = tokenRegex.exec(src)) !== null) {
    if (match.index > lastIdx) {
      out += escapeHtml(src.slice(lastIdx, match.index));
    }
    const [, comment, str, num, kw] = match;
    if (comment) out += `<span class="tok-com">${escapeHtml(comment)}</span>`;
    else if (str) out += `<span class="tok-str">${escapeHtml(str)}</span>`;
    else if (num) out += `<span class="tok-num">${escapeHtml(num)}</span>`;
    else if (kw) out += `<span class="tok-kw">${escapeHtml(kw)}</span>`;
    lastIdx = tokenRegex.lastIndex;
  }
  if (lastIdx < src.length) {
    out += escapeHtml(src.slice(lastIdx));
  }
  return out;
}

function formatInlineMarkdown(escapedText) {
  let out = escapedText;
  // Inline code
  out = out.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  // Bold & italic
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  // Safe http/https links
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function renderMarkdownSafe(raw) {
  const source = String(raw || "").replace(/\r\n/g, "\n");
  const codeBlocks = [];

  const withPlaceholders = source.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanLang = escapeHtml((lang || "code").trim() || "code");
    const rawCodeTrimmed = code.replace(/\n$/, "");
    codeBlocks.push({
      lang: cleanLang,
      raw: rawCodeTrimmed,
      highlighted: highlightCodeTokens(rawCodeTrimmed)
    });
    return `\n\u0000CODEBLOCK_${idx}\u0000\n`;
  });

  const lines = withPlaceholders.split("\n");
  const htmlParts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const cbMatch = line.trim().match(/^\u0000CODEBLOCK_(\d+)\u0000$/);
    if (cbMatch) {
      const cb = codeBlocks[Number(cbMatch[1])];
      htmlParts.push(
        `<div class="md-code-block"><div class="md-code-header"><span>${cb.lang}</span><button type="button" class="small-btn md-copy-code-btn" data-code-idx="${cbMatch[1]}">Copy Code</button></div><pre><code>${cb.highlighted}</code></pre></div>`
      );
      i += 1;
      continue;
    }

    // Markdown Table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const splitRow = r =>
        r
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map(cell => formatInlineMarkdown(escapeHtml(cell.trim())));
      const headers = splitRow(line);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(splitRow(lines[i]));
        i += 1;
      }
      htmlParts.push(
        `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${bodyRows
          .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`
      );
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      htmlParts.push(`<h${lvl}>${formatInlineMarkdown(escapeHtml(hMatch[2]))}</h${lvl}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(formatInlineMarkdown(escapeHtml(lines[i].trim().slice(2))));
        i += 1;
      }
      htmlParts.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${formatInlineMarkdown(escapeHtml(lines[i].replace(/^\s*[-*]\s+/, "")))}</li>`);
        i += 1;
      }
      htmlParts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${formatInlineMarkdown(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, "")))}</li>`);
        i += 1;
      }
      htmlParts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().match(/^\u0000CODEBLOCK_\d+\u0000$/) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("> ") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("|")
    ) {
      paraLines.push(formatInlineMarkdown(escapeHtml(lines[i])));
      i += 1;
    }
    if (paraLines.length) {
      htmlParts.push(`<p>${paraLines.join("<br>")}</p>`);
    }
  }

  return { html: htmlParts.join(""), codeBlocks };
}

/* ── Real-Time Multiplayer Collaborative Whiteboard Engine ───── */
let wbCtx = null;
let wbDrawing = false;
let wbCurrentElement = null;
let wbDragOffset = null;
let wbPanStart = null;
let wbLastCursorEmit = 0;
let wbLastStrokeEmit = 0;
let wbPendingTextWorldPos = null;

function screenToWorld(clientX, clientY) {
  const canvas = $("whiteboardCanvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - wbPanX) / wbZoom,
    y: (clientY - rect.top - wbPanY) / wbZoom
  };
}

function resizeWhiteboardCanvas() {
  const canvas = $("whiteboardCanvas");
  const stage = $("whiteboardStage");
  if (!canvas || !stage) return;
  const rect = stage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  wbCtx = canvas.getContext("2d");
  if (wbCtx) wbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getElementBounds(el) {
  if (!el) return { x: 0, y: 0, w: 0, h: 0 };
  if (el.type === "pen" || el.type === "highlighter") {
    const pts = el.points || [];
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { x: minX - 6, y: minY - 6, w: maxX - minX + 12, h: maxY - minY + 12 };
  }
  if (el.type === "line" || el.type === "arrow") {
    const minX = Math.min(el.x, el.x2);
    const minY = Math.min(el.y, el.y2);
    return {
      x: minX - 6,
      y: minY - 6,
      w: Math.abs(el.x2 - el.x) + 12,
      h: Math.abs(el.y2 - el.y) + 12
    };
  }
  if (el.type === "text") {
    const textW = Math.max(80, String(el.text || "").length * 8.5);
    return { x: el.x, y: el.y - 18, w: textW, h: 28 };
  }
  const rx = el.w < 0 ? el.x + el.w : el.x;
  const ry = el.h < 0 ? el.y + el.h : el.y;
  return { x: rx, y: ry, w: Math.abs(el.w || 120), h: Math.abs(el.h || 80) };
}

function hitTestWhiteboardElement(wx, wy) {
  for (let i = wbElements.length - 1; i >= 0; i--) {
    const b = getElementBounds(wbElements[i]);
    if (wx >= b.x - 6 && wx <= b.x + b.w + 6 && wy >= b.y - 6 && wy <= b.y + b.h + 6) {
      return wbElements[i];
    }
  }
  return null;
}

function translateWhiteboardElement(el, dx, dy) {
  const clone = JSON.parse(JSON.stringify(el));
  if (clone.points) {
    clone.points = clone.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
  } else if (clone.type === "line" || clone.type === "arrow") {
    clone.x += dx;
    clone.y += dy;
    clone.x2 += dx;
    clone.y2 += dy;
  } else {
    clone.x += dx;
    clone.y += dy;
  }
  return clone;
}

function drawSingleElement(ctx, el) {
  if (!el) return;
  ctx.save();
  ctx.strokeStyle = el.color || "#f4f5f8";
  ctx.fillStyle = el.color || "#f4f5f8";
  ctx.lineWidth = Number(el.size) || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (el.type === "highlighter") {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = (Number(el.size) || 4) * 3.2;
  }

  if (el.type === "pen" || el.type === "highlighter") {
    const pts = el.points || [];
    if (pts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.5, pts[0].y + 0.5);
      ctx.stroke();
    }
  } else if (el.type === "line" || el.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
    if (el.type === "arrow") {
      const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x);
      const head = 12;
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - head * Math.cos(angle - Math.PI / 6), el.y2 - head * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - head * Math.cos(angle + Math.PI / 6), el.y2 - head * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  } else if (el.type === "rect") {
    ctx.strokeRect(el.x, el.y, el.w, el.h);
  } else if (el.type === "ellipse") {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === "diamond") {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, el.y);
    ctx.lineTo(el.x + el.w, cy);
    ctx.lineTo(cx, el.y + el.h);
    ctx.lineTo(el.x, cy);
    ctx.closePath();
    ctx.stroke();
  } else if (el.type === "sticky") {
    const w = el.w || 160;
    const h = el.h || 110;
    ctx.fillStyle = "rgba(251, 191, 36, 0.2)";
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(el.x, el.y, w, h, 8) : ctx.rect(el.x, el.y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = document.body.classList.contains("night-light") ? "#141625" : "#fef3c7";
    ctx.font = "500 13px Inter, sans-serif";
    wrapCanvasText(ctx, String(el.text || ""), el.x + 12, el.y + 24, w - 24, 18);
  } else if (el.type === "text") {
    ctx.font = "600 16px Inter, sans-serif";
    wrapCanvasText(ctx, String(el.text || ""), el.x, el.y, 320, 22);
  } else if (el.type === "image" && el.src) {
    let img = wbImageCache.get(el.src);
    if (!img) {
      img = new Image();
      img.onload = () => renderWhiteboard();
      img.src = el.src;
      wbImageCache.set(el.src, img);
    }
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, el.x, el.y, el.w || 220, el.h || 160);
    } else {
      ctx.strokeRect(el.x, el.y, el.w || 220, el.h || 160);
    }
  }
  ctx.restore();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const lines = String(text || "").split("\n");
  let curY = y;
  lines.forEach(rawLine => {
    const words = rawLine.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line ? `${line} ${words[n]}` : words[n];
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, curY);
        line = words[n];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  });
}

function renderWhiteboard() {
  const canvas = $("whiteboardCanvas");
  if (!canvas || !wbCtx) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  wbCtx.save();
  wbCtx.setTransform(1, 0, 0, 1, 0, 0);
  wbCtx.clearRect(0, 0, canvas.width, canvas.height);
  wbCtx.restore();

  wbCtx.save();
  wbCtx.translate(wbPanX, wbPanY);
  wbCtx.scale(wbZoom, wbZoom);

  wbElements.forEach(el => drawSingleElement(wbCtx, el));
  wbLiveStrokes.forEach(el => drawSingleElement(wbCtx, el));
  if (wbCurrentElement) drawSingleElement(wbCtx, wbCurrentElement);

  wbCtx.restore();
  if ($("wbZoomLabel")) $("wbZoomLabel").textContent = `${Math.round(wbZoom * 100)}%`;
}

function renderWhiteboardCollaborators() {
  const list = $("wbCollaboratorsList");
  if (!list) return;
  list.innerHTML = "";
  wbCursors.forEach(c => {
    const chip = document.createElement("span");
    chip.className = "wb-collab-chip";
    chip.innerHTML = `<span class="wb-collab-dot" style="background:${escapeHtml(c.color)}"></span><span>${escapeHtml(
      c.username
    )}</span>`;
    list.appendChild(chip);
  });
}

function renderWhiteboardCursors() {
  const layer = $("whiteboardCursorsLayer");
  if (!layer) return;
  layer.innerHTML = "";
  const now = Date.now();
  wbCursors.forEach((c, sid) => {
    if (now - (c.updatedAt || 0) > 15000) {
      wbCursors.delete(sid);
      return;
    }
    const sx = c.x * wbZoom + wbPanX;
    const sy = c.y * wbZoom + wbPanY;
    const node = document.createElement("div");
    node.className = "wb-remote-cursor";
    node.style.transform = `translate(${sx}px, ${sy}px)`;
    node.innerHTML = `<span class="wb-cursor-pointer" style="background:${escapeHtml(
      c.color
    )}"></span><span class="wb-cursor-name" style="background:${escapeHtml(c.color)}">${escapeHtml(
      c.username
    )}</span>`;
    layer.appendChild(node);
  });
}

function exportWhiteboardPng() {
  const canvas = $("whiteboardCanvas");
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = `synctune-whiteboard-${activeRoomId}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function exportWhiteboardSvg() {
  const w = 1400;
  const h = 900;
  const parts = [];
  wbElements.forEach(el => {
    const color = escapeHtml(el.color || "#f4f5f8");
    const size = Number(el.size) || 3;
    if ((el.type === "pen" || el.type === "highlighter") && el.points?.length) {
      const d = el.points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
      const opacity = el.type === "highlighter" ? ' opacity="0.35"' : "";
      const sw = el.type === "highlighter" ? size * 3.2 : size;
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${opacity}/>`);
    } else if (el.type === "line" || el.type === "arrow") {
      parts.push(`<line x1="${el.x}" y1="${el.y}" x2="${el.x2}" y2="${el.y2}" stroke="${color}" stroke-width="${size}" stroke-linecap="round"/>`);
    } else if (el.type === "rect") {
      parts.push(`<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" fill="none" stroke="${color}" stroke-width="${size}"/>`);
    } else if (el.type === "ellipse") {
      parts.push(`<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${Math.abs(el.w / 2)}" ry="${Math.abs(el.h / 2)}" fill="none" stroke="${color}" stroke-width="${size}"/>`);
    } else if (el.type === "diamond") {
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      parts.push(`<polygon points="${cx},${el.y} ${el.x + el.w},${cy} ${cx},${el.y + el.h} ${el.x},${cy}" fill="none" stroke="${color}" stroke-width="${size}"/>`);
    } else if (el.type === "sticky" || el.type === "text") {
      parts.push(`<text x="${el.x + 8}" y="${el.y + 20}" fill="${color}" font-family="Inter, sans-serif" font-size="14">${escapeHtml(el.text || "")}</text>`);
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0b0d17"/>${parts.join("")}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `synctune-whiteboard-${activeRoomId}.svg`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initCollaborationWorkspace() {
  // Tab switchers & shortcuts
  document.querySelectorAll("[data-collab-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchCollabTab(btn.getAttribute("data-collab-tab"));
    });
  });

  if ($("openWhiteboardBtn")) {
    $("openWhiteboardBtn").addEventListener("click", () => {
      switchCollabTab("whiteboard");
      if ($("chatCard")) $("chatCard").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if ($("wbReturnToChatBtn")) {
    $("wbReturnToChatBtn").addEventListener("click", () => {
      if ($("whiteboardWorkspace")?.classList.contains("is-fullscreen")) {
        $("whiteboardWorkspace").classList.remove("is-fullscreen");
        document.body.style.overflow = "";
        if ($("wbFullscreenBtn")) $("wbFullscreenBtn").textContent = "Expand";
      }
      switchCollabTab("discussion");
    });
  }

  if ($("headerShareMediaBtn")) {
    $("headerShareMediaBtn").addEventListener("click", () => {
      switchCollabTab("discussion");
      if ($("mediaFileInput")) $("mediaFileInput").click();
    });
  }

  if ($("clearChatBtn")) {
    $("clearChatBtn").addEventListener("click", () => {
      if (!isWorkspaceOwner()) return;
      if (!confirm("Clear all Team Discussion messages in this room for everyone?")) return;
      if ($("chatError")) $("chatError").textContent = "";
      socket?.emit("chat:clear", {}, res => {
        if (res && !res.ok && $("chatError")) {
          $("chatError").textContent = res.error || "Unable to clear chat.";
        }
      });
    });
  }

  // Discussion filters & composer modes
  document.querySelectorAll("[data-discussion-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      discussionFilter = chip.getAttribute("data-discussion-filter") || "all";
      document.querySelectorAll("[data-discussion-filter]").forEach(c => {
        c.classList.toggle("is-active", c === chip);
      });
      applyDiscussionFilter();
    });
  });

  // Media file input, drag-and-drop, clipboard paste & lightbox
  if ($("attachMediaBtn") && $("mediaFileInput")) {
    $("attachMediaBtn").addEventListener("click", () => $("mediaFileInput").click());
    $("mediaFileInput").addEventListener("change", () => {
      const f = $("mediaFileInput").files?.[0];
      if (f) stageMediaFile(f);
    });
  }
  if ($("clearAttachmentBtn")) {
    $("clearAttachmentBtn").addEventListener("click", clearPendingAttachment);
  }

  const dropPane = $("collabViewDiscussion");
  if (dropPane) {
    dropPane.addEventListener("dragover", e => {
      e.preventDefault();
      dropPane.classList.add("is-drag-over");
    });
    dropPane.addEventListener("dragleave", () => dropPane.classList.remove("is-drag-over"));
    dropPane.addEventListener("drop", e => {
      e.preventDefault();
      dropPane.classList.remove("is-drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file) stageMediaFile(file);
    });
  }

  if ($("chatMessage")) {
    $("chatMessage").addEventListener("paste", e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            stageMediaFile(f);
            break;
          }
        }
      }
    });
  }

  if ($("lightboxCloseBtn")) $("lightboxCloseBtn").addEventListener("click", closeMediaLightbox);
  if ($("mediaLightboxBackdrop")) $("mediaLightboxBackdrop").addEventListener("click", closeMediaLightbox);

  // Whiteboard Tool Bindings & Pointer Events
  document.querySelectorAll("[data-wb-tool]").forEach(btn => {
    btn.addEventListener("click", () => {
      wbActiveTool = btn.getAttribute("data-wb-tool") || "pen";
      document.querySelectorAll("[data-wb-tool]").forEach(b => b.classList.toggle("is-active", b === btn));
      const canvas = $("whiteboardCanvas");
      if (canvas) {
        canvas.style.cursor =
          wbActiveTool === "pan" ? "grab" : wbActiveTool === "select" ? "default" : "crosshair";
      }
    });
  });

  document.querySelectorAll("[data-wb-color]").forEach(dot => {
    dot.addEventListener("click", () => {
      wbStrokeColor = dot.getAttribute("data-wb-color") || "#f4f5f8";
      document.querySelectorAll("[data-wb-color]").forEach(d => d.classList.toggle("is-active", d === dot));
    });
  });

  document.querySelectorAll("[data-wb-size]").forEach(btn => {
    btn.addEventListener("click", () => {
      wbStrokeSize = Number(btn.getAttribute("data-wb-size")) || 4;
      document.querySelectorAll("[data-wb-size]").forEach(b => b.classList.toggle("is-active", b === btn));
    });
  });

  if ($("wbInsertImageBtn") && $("wbImageInput")) {
    $("wbInsertImageBtn").addEventListener("click", () => $("wbImageInput").click());
    $("wbImageInput").addEventListener("change", async () => {
      const file = $("wbImageInput").files?.[0];
      $("wbImageInput").value = "";
      if (!file) return;
      if ($("whiteboardStatusError")) $("whiteboardStatusError").textContent = "";
      try {
        const media = await uploadRoomMediaFile(file);
        const stage = $("whiteboardStage");
        const rect = stage?.getBoundingClientRect() || { width: 600, height: 400 };
        const centerWorld = screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const element = {
          id: crypto.randomUUID ? crypto.randomUUID() : `wb-${Date.now()}`,
          type: "image",
          src: media.url,
          mediaId: media.id,
          x: centerWorld.x - 110,
          y: centerWorld.y - 80,
          w: 220,
          h: 160
        };
        wbElements.push(element);
        renderWhiteboard();
        socket?.emit("whiteboard:element:upsert", { element });
      } catch (err) {
        if ($("whiteboardStatusError")) {
          $("whiteboardStatusError").textContent = err.message || "Unable to insert image.";
        }
      }
    });
  }

  if ($("wbUndoBtn")) $("wbUndoBtn").addEventListener("click", () => socket?.emit("whiteboard:undo"));
  if ($("wbRedoBtn")) $("wbRedoBtn").addEventListener("click", () => socket?.emit("whiteboard:redo"));
  if ($("wbZoomInBtn")) {
    $("wbZoomInBtn").addEventListener("click", () => {
      wbZoom = Math.min(4, +(wbZoom + 0.15).toFixed(2));
      renderWhiteboard();
      renderWhiteboardCursors();
    });
  }
  if ($("wbZoomOutBtn")) {
    $("wbZoomOutBtn").addEventListener("click", () => {
      wbZoom = Math.max(0.25, +(wbZoom - 0.15).toFixed(2));
      renderWhiteboard();
      renderWhiteboardCursors();
    });
  }
  if ($("wbExportPngBtn")) $("wbExportPngBtn").addEventListener("click", exportWhiteboardPng);
  if ($("wbExportSvgBtn")) $("wbExportSvgBtn").addEventListener("click", exportWhiteboardSvg);
  if ($("wbClearBtn")) {
    $("wbClearBtn").addEventListener("click", () => {
      if (!confirm("Clear the entire whiteboard for everyone in this room?")) return;
      if ($("whiteboardStatusError")) $("whiteboardStatusError").textContent = "";
      socket?.emit("whiteboard:clear", {}, res => {
        if (res && !res.ok && $("whiteboardStatusError")) {
          $("whiteboardStatusError").textContent = res.error || "Permission denied.";
        }
      });
    });
  }
  if ($("wbFullscreenBtn")) {
    $("wbFullscreenBtn").addEventListener("click", () => {
      const ws = $("whiteboardWorkspace");
      if (!ws) return;
      const fs = ws.classList.toggle("is-fullscreen");
      document.body.style.overflow = fs ? "hidden" : "";
      $("wbFullscreenBtn").textContent = fs ? "Exit Fullscreen" : "Expand";
      requestAnimationFrame(() => {
        resizeWhiteboardCanvas();
        renderWhiteboard();
        renderWhiteboardCursors();
      });
    });
  }

  // Inline Text / Sticky Placement
  if ($("wbTextSaveBtn")) {
    $("wbTextSaveBtn").addEventListener("click", () => {
      const txt = $("whiteboardTextEditor")?.value.trim() || "";
      if ($("whiteboardTextEditorWrap")) $("whiteboardTextEditorWrap").classList.add("hidden");
      if (!txt || !wbPendingTextWorldPos) return;
      const isSticky = wbActiveTool === "sticky";
      const element = {
        id: crypto.randomUUID ? crypto.randomUUID() : `wb-${Date.now()}`,
        type: isSticky ? "sticky" : "text",
        text: txt,
        x: wbPendingTextWorldPos.x,
        y: wbPendingTextWorldPos.y,
        w: isSticky ? 180 : 200,
        h: isSticky ? 120 : 40,
        color: wbStrokeColor
      };
      wbPendingTextWorldPos = null;
      wbElements.push(element);
      renderWhiteboard();
      socket?.emit("whiteboard:element:upsert", { element });
    });
  }
  if ($("wbTextCancelBtn")) {
    $("wbTextCancelBtn").addEventListener("click", () => {
      wbPendingTextWorldPos = null;
      if ($("whiteboardTextEditorWrap")) $("whiteboardTextEditorWrap").classList.add("hidden");
    });
  }

  const canvas = $("whiteboardCanvas");
  if (canvas) {
    canvas.addEventListener("pointerdown", e => {
      if ($("whiteboardStatusError")) $("whiteboardStatusError").textContent = "";
      const world = screenToWorld(e.clientX, e.clientY);

      if (wbActiveTool === "pan") {
        wbPanStart = { clientX: e.clientX, clientY: e.clientY, origX: wbPanX, origY: wbPanY };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (!whiteboardMemberDraw && !isWorkspaceOwner()) {
        if ($("whiteboardStatusError")) {
          $("whiteboardStatusError").textContent = "Whiteboard drawing is restricted to the workspace owner.";
        }
        return;
      }

      if (wbActiveTool === "eraser") {
        const hit = hitTestWhiteboardElement(world.x, world.y);
        if (hit) {
          wbElements = wbElements.filter(el => el.id !== hit.id);
          renderWhiteboard();
          socket?.emit("whiteboard:element:delete", { id: hit.id });
        }
        return;
      }

      if (wbActiveTool === "select") {
        const hit = hitTestWhiteboardElement(world.x, world.y);
        if (hit) {
          wbDrawing = true;
          wbCurrentElement = hit;
          wbDragOffset = { startX: world.x, startY: world.y, orig: JSON.parse(JSON.stringify(hit)) };
          canvas.setPointerCapture(e.pointerId);
        }
        return;
      }

      if (wbActiveTool === "text" || wbActiveTool === "sticky") {
        wbPendingTextWorldPos = world;
        const wrap = $("whiteboardTextEditorWrap");
        const editor = $("whiteboardTextEditor");
        const rect = $("whiteboardStage")?.getBoundingClientRect();
        if (wrap && editor && rect) {
          wrap.style.left = `${Math.min(rect.width - 250, Math.max(8, e.clientX - rect.left))}px`;
          wrap.style.top = `${Math.min(rect.height - 130, Math.max(8, e.clientY - rect.top))}px`;
          editor.value = "";
          wrap.classList.remove("hidden");
          editor.focus();
        }
        return;
      }

      wbDrawing = true;
      canvas.setPointerCapture(e.pointerId);
      const id = crypto.randomUUID ? crypto.randomUUID() : `wb-${Date.now()}-${Math.random()}`;
      if (wbActiveTool === "pen" || wbActiveTool === "highlighter") {
        wbCurrentElement = {
          id,
          type: wbActiveTool,
          color: wbStrokeColor,
          size: wbStrokeSize,
          points: [world]
        };
      } else if (wbActiveTool === "line" || wbActiveTool === "arrow") {
        wbCurrentElement = {
          id,
          type: wbActiveTool,
          color: wbStrokeColor,
          size: wbStrokeSize,
          x: world.x,
          y: world.y,
          x2: world.x,
          y2: world.y
        };
      } else {
        wbCurrentElement = {
          id,
          type: wbActiveTool,
          color: wbStrokeColor,
          size: wbStrokeSize,
          x: world.x,
          y: world.y,
          w: 0,
          h: 0
        };
      }
      renderWhiteboard();
    });

    canvas.addEventListener("pointermove", e => {
      const world = screenToWorld(e.clientX, e.clientY);
      const now = Date.now();
      if (socket?.connected && now - wbLastCursorEmit > 40) {
        wbLastCursorEmit = now;
        socket.emit("whiteboard:cursor", { x: world.x, y: world.y, tool: wbActiveTool });
      }

      if (wbPanStart) {
        wbPanX = wbPanStart.origX + (e.clientX - wbPanStart.clientX);
        wbPanY = wbPanStart.origY + (e.clientY - wbPanStart.clientY);
        renderWhiteboard();
        renderWhiteboardCursors();
        return;
      }

      if (!wbDrawing || !wbCurrentElement) return;

      if (wbActiveTool === "select" && wbDragOffset) {
        const dx = world.x - wbDragOffset.startX;
        const dy = world.y - wbDragOffset.startY;
        const moved = translateWhiteboardElement(wbDragOffset.orig, dx, dy);
        wbCurrentElement = moved;
        const idx = wbElements.findIndex(item => item.id === moved.id);
        if (idx >= 0) wbElements[idx] = moved;
        renderWhiteboard();
        return;
      }

      if (wbCurrentElement.points) {
        wbCurrentElement.points.push(world);
      } else if (wbCurrentElement.type === "line" || wbCurrentElement.type === "arrow") {
        wbCurrentElement.x2 = world.x;
        wbCurrentElement.y2 = world.y;
      } else {
        wbCurrentElement.w = world.x - wbCurrentElement.x;
        wbCurrentElement.h = world.y - wbCurrentElement.y;
      }

      renderWhiteboard();
      if (socket?.connected && now - wbLastStrokeEmit > 45) {
        wbLastStrokeEmit = now;
        socket.emit("whiteboard:stroke:progress", wbCurrentElement);
      }
    });

    const finalizePointer = () => {
      if (wbPanStart) {
        wbPanStart = null;
        return;
      }
      if (!wbDrawing || !wbCurrentElement) return;
      wbDrawing = false;
      const finished = wbCurrentElement;
      wbCurrentElement = null;
      wbDragOffset = null;

      if (wbActiveTool !== "select") {
        const isZeroShape =
          (["rect", "ellipse", "diamond"].includes(finished.type) &&
            Math.abs(finished.w) < 3 &&
            Math.abs(finished.h) < 3) ||
          (["line", "arrow"].includes(finished.type) &&
            Math.hypot(finished.x2 - finished.x, finished.y2 - finished.y) < 3);
        if (isZeroShape) {
          renderWhiteboard();
          return;
        }
        wbElements.push(finished);
      }
      renderWhiteboard();
      socket?.emit("whiteboard:element:upsert", { element: finished }, res => {
        if (res && !res.ok && $("whiteboardStatusError")) {
          $("whiteboardStatusError").textContent = res.error || "Unable to save drawing.";
        }
      });
    };

    canvas.addEventListener("pointerup", finalizePointer);
    canvas.addEventListener("pointercancel", finalizePointer);
    canvas.addEventListener(
      "wheel",
      e => {
        if (activeCollabTab !== "whiteboard") return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        wbZoom = Math.min(4, Math.max(0.25, +(wbZoom + delta).toFixed(2)));
        renderWhiteboard();
        renderWhiteboardCursors();
      },
      { passive: false }
    );
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) {
      setMobileSidebarOpen(false);
    }
    if (activeCollabTab === "whiteboard") {
      resizeWhiteboardCanvas();
      renderWhiteboard();
      renderWhiteboardCursors();
    }
  });
}

async function init() {
  applyTheme();
  initCollaborationWorkspace();

  const params = new URLSearchParams(window.location.search);
  const invitedRoom = (params.get("room") || "").trim();
  if (invitedRoom && $("loginEnterRoomId")) {
    $("loginEnterRoomId").value = invitedRoom.toUpperCase();
  }

  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error(`Room configuration request failed (${response.status})`);
    const config = await response.json();
    activeRoomName = config.roomName || "Friends Room";
    activeRoomId = config.roomId || "MAIN";
    updateRoomDisplay(activeRoomId, activeRoomName, "System", false);
    const roomOpenedAt = config.roomOpenedAt === null ? null : Number(config.roomOpenedAt);
    startSidebarClock(Number.isFinite(roomOpenedAt) && roomOpenedAt > 0 ? roomOpenedAt : null);
  } catch (error) {
    if ($("roomDuration")) $("roomDuration").textContent = "Unavailable";
    startSidebarClock(null);
    console.error("Unable to load room configuration", error);
  }

  if (token) {
    try {
      const me = await api("/api/me");
      await showApp(me.username, me.isAdmin);
      return;
    } catch {
      localStorage.removeItem("synctune_token");
      token = null;
    }
  }
}

window.SyncTuneGamesBridge = {
  getSocket: () => socket,
  getCurrentUser: () => ({ username: currentUsername, isAdmin: currentIsAdmin }),
  getRoomContext: () => ({
    roomId: activeRoomId,
    roomName: activeRoomName,
    owner: activeRoomOwner,
    isOwner: isWorkspaceOwner(),
    plugins: { ...pluginStates },
    members: roomMembers
  }),
  enableGamesByAdmin: () => setPluginState("games", true, false),
  switchRoomAdmin: target => switchRoomAdmin(target)
};

window.SyncTuneVoiceBridge = {
  getSocket: () => socket,
  getToken: () => token,
  getCurrentUser: () => ({ username: currentUsername, isAdmin: currentIsAdmin }),
  getRoomContext: () => ({
    roomId: activeRoomId,
    roomName: activeRoomName,
    owner: activeRoomOwner,
    isOwner: isWorkspaceOwner()
  }),
  jumpToVoiceSection: () => jumpToSection("#voiceRoomCard")
};

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR NOTIFICATIONS CENTER & SECONDARY WORKSPACE TOOLS
   ═══════════════════════════════════════════════════════════════ */
let userNotifications = [];
let unreadNotificationsCount = 0;
let activeNotifFilter = "all";
let savedWorkspaceItems = [];
let activeUtilityTab = "history";

try {
  savedWorkspaceItems = JSON.parse(localStorage.getItem("synctune_saved_items") || "[]");
  if (!Array.isArray(savedWorkspaceItems)) savedWorkspaceItems = [];
} catch {
  savedWorkspaceItems = [];
}

function persistSavedWorkspaceItems() {
  try {
    localStorage.setItem("synctune_saved_items", JSON.stringify(savedWorkspaceItems.slice(0, 60)));
  } catch {}
  renderSavedItemsList();
}

function saveWorkspaceBookmark(item) {
  if (!item || !item.content) return;
  const exists = savedWorkspaceItems.some(s => s.id === item.id);
  if (!exists) {
    savedWorkspaceItems.unshift(item);
    persistSavedWorkspaceItems();
  }
}

function formatNotifRelativeTime(ts) {
  const diffSec = Math.max(0, Math.floor((Date.now() - Number(ts || Date.now())) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

function getNotificationCategoryIcon(type) {
  if (String(type || "").startsWith("game")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><rect width="20" height="12" x="2" y="6" rx="4"/></svg>`;
  }
  if (String(type || "").includes("whiteboard")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>`;
  }
  if (String(type || "").includes("room")) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}

function updateNotificationBadges() {
  const badge = $("sidebarNotifBadge");
  const panelCount = $("notifPanelUnreadCount");
  if (badge) {
    badge.textContent = unreadNotificationsCount > 99 ? "99+" : String(unreadNotificationsCount);
    badge.classList.toggle("hidden", unreadNotificationsCount === 0);
  }
  if (panelCount) {
    panelCount.textContent = `${unreadNotificationsCount} unread`;
    panelCount.classList.toggle("is-enabled", unreadNotificationsCount > 0);
  }
}

function handleNotificationsStatePayload(payload) {
  if (!payload) return;
  userNotifications = Array.isArray(payload.notifications) ? payload.notifications : [];
  unreadNotificationsCount =
    typeof payload.unreadCount === "number"
      ? payload.unreadCount
      : userNotifications.filter(n => !n.isRead).length;
  updateNotificationBadges();
  renderNotificationsList();
}

function handleIncomingNotification(payload) {
  const n = payload?.notification;
  if (!n || !n.id) return;
  if (!userNotifications.some(existing => existing.id === n.id)) {
    userNotifications.unshift(n);
    if (userNotifications.length > 60) userNotifications.length = 60;
  }
  unreadNotificationsCount =
    typeof payload.unreadCount === "number"
      ? payload.unreadCount
      : userNotifications.filter(x => !x.isRead).length;
  updateNotificationBadges();
  renderNotificationsList();
}

function navigateToNotificationTarget(notif) {
  if (!notif) return;
  if (!notif.isRead && socket && socket.connected) {
    notif.isRead = true;
    unreadNotificationsCount = Math.max(0, unreadNotificationsCount - 1);
    updateNotificationBadges();
    renderNotificationsList();
    socket.emit("notifications:markRead", { id: notif.id });
  }

  closeNotificationsPanel();
  if (window.innerWidth <= 860) setMobileSidebarOpen(false);

  const tt = notif.targetType || "overview";
  if (tt === "games_match") {
    window.SyncTuneGames?.openMatchById?.(notif.targetId);
  } else if (tt === "chat") {
    if (typeof switchCollabTab === "function") switchCollabTab("discussion");
    jumpToSection("#chatCard");
    if (notif.targetId) {
      setTimeout(() => {
        const msgEl = document.querySelector(`.chat-message[data-message-id="${CSS.escape(notif.targetId)}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
          msgEl.classList.add("is-highlighted");
          setTimeout(() => msgEl.classList.remove("is-highlighted"), 1600);
        }
      }, 220);
    }
  } else if (tt === "whiteboard") {
    if (typeof switchCollabTab === "function") switchCollabTab("whiteboard");
    jumpToSection("#chatCard");
  } else if (tt === "members") {
    jumpToSection("#membersCard");
  } else {
    jumpToSection("#overviewCard");
  }
}

function renderNotificationsList() {
  const list = $("sidebarNotificationsList");
  if (!list) return;

  const filtered = userNotifications.filter(n => {
    if (activeNotifFilter === "unread") return !n.isRead;
    if (activeNotifFilter === "games") return String(n.type || "").startsWith("game");
    if (activeNotifFilter === "workspace") return !String(n.type || "").startsWith("game");
    return true;
  });

  list.innerHTML = "";
  if (!filtered.length) {
    list.innerHTML =
      activeNotifFilter === "unread"
        ? '<div class="queue-empty">You are all caught up!</div>'
        : '<div class="queue-empty">No notifications yet. Activity updates appear here in real time.</div>';
    return;
  }

  filtered.forEach(n => {
    const item = document.createElement("div");
    item.className = `notif-item${n.isRead ? "" : " is-unread"}`;
    item.dataset.notifId = n.id;
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.innerHTML = `
      <span class="notif-item-icon" aria-hidden="true">${getNotificationCategoryIcon(n.type)}</span>
      <div class="notif-item-body">
        <div class="notif-item-top">
          <strong>${escapeHtml(n.title)}</strong>
          <time class="notif-item-time">${escapeHtml(formatNotifRelativeTime(n.createdAt))}</time>
        </div>
        <p class="notif-item-msg">${escapeHtml(n.message)}</p>
      </div>
      ${
        n.isRead
          ? ""
          : `<button type="button" class="notif-mark-btn" title="Mark as read" aria-label="Mark notification as read"><span class="notif-unread-dot"></span></button>`
      }
    `;

    const markBtn = item.querySelector(".notif-mark-btn");
    if (markBtn) {
      markBtn.addEventListener("click", e => {
        e.stopPropagation();
        n.isRead = true;
        unreadNotificationsCount = Math.max(0, unreadNotificationsCount - 1);
        updateNotificationBadges();
        renderNotificationsList();
        socket?.emit("notifications:markRead", { id: n.id });
      });
    }

    item.addEventListener("click", () => navigateToNotificationTarget(n));
    item.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToNotificationTarget(n);
      }
    });
    list.appendChild(item);
  });
}

function toggleNotificationsPanel(forceOpen) {
  const panel = $("sidebarNotificationsPanel");
  const btn = $("notificationsNavBtn");
  if (!panel) return;
  const willOpen = typeof forceOpen === "boolean" ? forceOpen : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !willOpen);
  if (btn) btn.setAttribute("aria-expanded", String(willOpen));
  if (willOpen) {
    renderNotificationsList();
    if (socket && socket.connected) socket.emit("notifications:get");
  }
}

function closeNotificationsPanel() {
  toggleNotificationsPanel(false);
}

function renderGameHistoryList() {
  const list = $("utilityGameHistoryList");
  if (!list) return;
  const matches = window.SyncTuneGames?.getMatches?.() || [];
  list.innerHTML = "";
  if (!matches.length) {
    list.innerHTML = '<div class="queue-empty">No matches recorded in this room yet.</div>';
    return;
  }

  matches.forEach(m => {
    const title = { chess: "Chess", ludo: "Ludo", tictactoe: "Tic Tac Toe" }[m.gameType] || m.gameType;
    const statusText =
      m.status === "completed"
        ? m.winner === "draw"
          ? "Draw"
          : `Winner: ${m.winner || "—"}`
        : m.status === "active"
        ? "In Progress"
        : "Waiting for Players";

    const row = document.createElement("div");
    row.className = "utility-item-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(title)} · ${escapeHtml(statusText)}</strong>
        <span class="muted">${escapeHtml((m.players || []).join(" vs ") || "—")}</span>
      </div>
      <button type="button" class="small-btn" data-open-history-match="${escapeHtml(m.id)}">Open</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-open-history-match]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeWorkspaceUtilityModal();
      window.SyncTuneGames?.openMatchById?.(btn.dataset.openHistoryMatch);
    });
  });
}

function renderSavedItemsList() {
  const list = $("utilitySavedItemsList");
  const badge = $("sidebarSavedBadge");
  if (badge) {
    badge.textContent = String(savedWorkspaceItems.length);
    badge.classList.toggle("hidden", savedWorkspaceItems.length === 0);
  }
  if (!list) return;
  list.innerHTML = "";
  if (!savedWorkspaceItems.length) {
    list.innerHTML =
      '<div class="queue-empty">Bookmark messages or AI responses in Team Discussion to save them here.</div>';
    return;
  }

  savedWorkspaceItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "utility-item-row";
    row.innerHTML = `
      <div class="utility-saved-copy">
        <strong>${escapeHtml(item.author || "Team")} · ${escapeHtml(item.type || "Message")}</strong>
        <p>${escapeHtml(item.content)}</p>
      </div>
      <div class="utility-item-actions">
        <button type="button" class="small-btn" data-copy-saved="${escapeHtml(item.id)}">Copy</button>
        <button type="button" class="small-btn danger" data-remove-saved="${escapeHtml(item.id)}">Remove</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-copy-saved]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = savedWorkspaceItems.find(x => x.id === btn.dataset.copySaved);
      if (target) copyTextToClipboard(target.content);
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    });
  });

  list.querySelectorAll("[data-remove-saved]").forEach(btn => {
    btn.addEventListener("click", () => {
      savedWorkspaceItems = savedWorkspaceItems.filter(x => x.id !== btn.dataset.removeSaved);
      persistSavedWorkspaceItems();
    });
  });
}

function switchUtilityTab(tabName) {
  activeUtilityTab = ["history", "saved", "help"].includes(tabName) ? tabName : "history";
  document.querySelectorAll("[data-utility-panel]").forEach(btn => {
    const isAct = btn.dataset.utilityPanel === activeUtilityTab;
    btn.classList.toggle("is-active", isAct);
    btn.setAttribute("aria-selected", String(isAct));
  });
  if ($("utilityTabHistory")) $("utilityTabHistory").classList.toggle("hidden", activeUtilityTab !== "history");
  if ($("utilityTabSaved")) $("utilityTabSaved").classList.toggle("hidden", activeUtilityTab !== "saved");
  if ($("utilityTabHelp")) $("utilityTabHelp").classList.toggle("hidden", activeUtilityTab !== "help");

  if (activeUtilityTab === "history") renderGameHistoryList();
  if (activeUtilityTab === "saved") renderSavedItemsList();
}

function openWorkspaceUtilityModal(tabName = "history") {
  closeNotificationsPanel();
  switchUtilityTab(tabName);
  const modal = $("workspaceUtilityModal");
  if (modal) modal.classList.remove("hidden");
}

function closeWorkspaceUtilityModal() {
  const modal = $("workspaceUtilityModal");
  if (modal) modal.classList.add("hidden");
}

function initNotificationsAndSecondaryNav() {
  if ($("notificationsNavBtn")) {
    $("notificationsNavBtn").addEventListener("click", e => {
      e.stopPropagation();
      toggleNotificationsPanel();
    });
  }
  if ($("notifPanelCloseBtn")) {
    $("notifPanelCloseBtn").addEventListener("click", closeNotificationsPanel);
  }
  if ($("notifMarkAllReadBtn")) {
    $("notifMarkAllReadBtn").addEventListener("click", () => {
      userNotifications.forEach(n => (n.isRead = true));
      unreadNotificationsCount = 0;
      updateNotificationBadges();
      renderNotificationsList();
      socket?.emit("notifications:markAllRead");
    });
  }
  document.querySelectorAll("[data-notif-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      activeNotifFilter = chip.dataset.notifFilter || "all";
      document.querySelectorAll("[data-notif-filter]").forEach(c => c.classList.toggle("is-active", c === chip));
      renderNotificationsList();
    });
  });

  if ($("utilityModalCloseBtn")) $("utilityModalCloseBtn").addEventListener("click", closeWorkspaceUtilityModal);
  if ($("utilityModalBackdrop")) $("utilityModalBackdrop").addEventListener("click", closeWorkspaceUtilityModal);
  if ($("utilityClearSavedBtn")) {
    $("utilityClearSavedBtn").addEventListener("click", () => {
      savedWorkspaceItems = [];
      persistSavedWorkspaceItems();
    });
  }
  document.querySelectorAll("[data-utility-panel]").forEach(btn => {
    btn.addEventListener("click", () => switchUtilityTab(btn.dataset.utilityPanel));
  });

  renderSavedItemsList();
  updateNotificationBadges();
}

initNotificationsAndSecondaryNav();
init();
