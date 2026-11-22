(() => {
  const $ = id => document.getElementById(id);

  const fab = $("geminiOrbFab");
  const overlay = $("geminiAssistantOverlay");
  const backdrop = $("geminiAssistantBackdrop");
  const shell = $("geminiAssistantShell");
  const orbStage = $("geminiOrbStage");
  const orbStateLabel = $("geminiOrbStateLabel");
  const contextStrip = $("geminiContextStrip");
  const contextSubtitle = $("geminiContextSubtitle");
  const modelBadge = $("geminiModelBadge");
  const messagesEl = $("geminiMessages");
  const summaryMenuBtn = $("geminiSummaryMenuBtn");
  const summaryOptions = $("geminiSummaryOptions");
  const toggleSelectBtn = $("geminiToggleSelectBtn");
  const toggleSelectLabel = $("geminiToggleSelectLabel");
  const selectDock = $("geminiSelectDock");
  const selectCountEl = $("geminiSelectCount");
  const summarizeSelectedBtn = $("geminiSummarizeSelectedBtn");
  const cancelSelectBtn = $("geminiCancelSelectBtn");
  const selectedBanner = $("geminiSelectedBanner");
  const selectedBannerText = $("geminiSelectedBannerText");
  const clearSelectedBtn = $("geminiClearSelectedBtn");
  const form = $("geminiForm");
  const inputEl = $("geminiInput");
  const sendBtn = $("geminiSendBtn");
  const stopBtn = $("geminiStopBtn");
  const voiceBtn = $("geminiVoiceBtn");
  const closeBtn = $("geminiCloseBtn");
  const clearBtn = $("geminiClearBtn");
  const refreshContextBtn = $("geminiRefreshContextBtn");

  if (!fab || !overlay || !shell || !messagesEl) return;

  let isOpen = false;
  let isStreaming = false;
  let isListening = false;
  let isSelectMode = false;
  let abortController = null;
  let recognition = null;
  let conversationHistory = [];
  let selectedMessageIds = new Set();
  let lastRequest = null;
  let currentStats = null;
  let closeTimer = null;

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (!SpeechRecognitionCtor && voiceBtn) {
    voiceBtn.classList.add("hidden");
  }

  function getAuthToken() {
    try {
      return localStorage.getItem("synctune_token") || "";
    } catch {
      return "";
    }
  }

  function isLoggedInView() {
    const appView = $("appView");
    return Boolean(appView && !appView.classList.contains("hidden") && getAuthToken());
  }

  function getCurrentRoomId() {
    const codeText = $("activeRoomCode")?.textContent?.trim();
    if (codeText) return codeText;
    try {
      return localStorage.getItem("synctune_active_room") || "MAIN";
    } catch {
      return "MAIN";
    }
  }

  function getActiveSection() {
    if (!isLoggedInView()) return "#loginView";
    const activeLink = document.querySelector('.sidebar-link[aria-current="location"]');
    return activeLink?.getAttribute("href") || "#overviewCard";
  }

  function getActiveCollabTab() {
    const wbTab = $("collabTabWhiteboard");
    if (wbTab && wbTab.classList.contains("is-active")) return "whiteboard";
    return "discussion";
  }

  function escapeHtmlLocal(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMd(text) {
    if (typeof window.renderMarkdownSafe === "function") {
      try {
        const res = window.renderMarkdownSafe(text);
        if (res && typeof res === "object" && typeof res.html === "string") {
          return res;
        }
        if (typeof res === "string") {
          return { html: res, codeBlocks: [] };
        }
      } catch {}
    }
    const safe = escapeHtmlLocal(text).replace(/\n/g, "<br>");
    return { html: `<p>${safe}</p>`, codeBlocks: [] };
  }

  async function copyText(text) {
    if (typeof window.copyTextToClipboard === "function") {
      return window.copyTextToClipboard(text);
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function setOrbState(state, labelText) {
    const nextState = ["idle", "listening", "thinking", "responding"].includes(state) ? state : "idle";
    shell.setAttribute("data-state", nextState);
    if (orbStage) orbStage.setAttribute("data-state", nextState);
    if (orbStateLabel && labelText) {
      orbStateLabel.textContent = labelText;
    }
  }

  function updateOrbCompactState() {
    if (!orbStage) return;
    orbStage.classList.toggle("is-compact", conversationHistory.length > 0 || isStreaming);
  }

  function autoResizeInput() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(120, Math.max(36, inputEl.scrollHeight))}px`;
  }

  function updateSelectedUI() {
    const count = selectedMessageIds.size;
    if (selectCountEl) {
      selectCountEl.textContent = `${count} selected`;
    }
    if (summarizeSelectedBtn) {
      summarizeSelectedBtn.disabled = count === 0;
      summarizeSelectedBtn.textContent = count > 0 ? `Summarize Selected (${count})` : "Summarize Selected";
    }
    if (selectedBanner && selectedBannerText) {
      selectedBanner.classList.toggle("hidden", count === 0);
      selectedBannerText.textContent = `${count} chat message${count === 1 ? "" : "s"} selected for Gemini`;
    }
    if (toggleSelectBtn) {
      toggleSelectBtn.classList.toggle("is-active", isSelectMode || count > 0);
      if (toggleSelectLabel) {
        toggleSelectLabel.textContent = count > 0 ? `Selected (${count})` : "Select Msgs";
      } else {
        toggleSelectBtn.textContent = count > 0 ? `Selected (${count})` : "Select Msgs";
      }
    }
    document.querySelectorAll("#chatList .chat-message").forEach(row => {
      const id = row.dataset.messageId;
      row.classList.toggle("is-gemini-selected", Boolean(id && selectedMessageIds.has(id)));
    });
  }

  function setSelectMode(enabled) {
    isSelectMode = Boolean(enabled);
    document.body.classList.toggle("gemini-select-mode", isSelectMode);
    if (selectDock) selectDock.classList.toggle("hidden", !isSelectMode);
    if (isSelectMode) {
      closeModal();
      const chatCard = $("chatCard");
      if (chatCard) {
        chatCard.classList.add("is-revealed");
        chatCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const discTab = $("collabTabDiscussion");
      if (discTab) discTab.click();
    }
    updateSelectedUI();
  }

  function clearSelectedMessages() {
    selectedMessageIds.clear();
    isSelectMode = false;
    document.body.classList.remove("gemini-select-mode");
    if (selectDock) selectDock.classList.add("hidden");
    updateSelectedUI();
  }

  // Delegate clicks on Team Chat messages while selection mode is active
  document.addEventListener(
    "click",
    e => {
      if (!isSelectMode) return;
      const row = e.target?.closest?.("#chatList .chat-message");
      if (!row) return;
      if (e.target.closest("button, a, audio, video")) return;
      e.preventDefault();
      e.stopPropagation();
      const id = row.dataset.messageId;
      if (!id) return;
      if (selectedMessageIds.has(id)) selectedMessageIds.delete(id);
      else selectedMessageIds.add(id);
      updateSelectedUI();
    },
    true
  );

  function renderContextPills(stats) {
    currentStats = stats;
    if (!contextStrip) return;
    contextStrip.innerHTML = "";

    const pills = [];
    if (!stats || !stats.authenticated) {
      pills.push({ text: "Guest Mode · Website Guide", accent: true });
      if (contextSubtitle) contextSubtitle.textContent = "Sign in to analyze rooms, chats & live activity";
    } else {
      pills.push({ text: `${stats.roomName || stats.roomId} (${stats.roomId})`, accent: true });
      pills.push({ text: `${stats.onlineCount || 0} online` });
      pills.push({ text: `${stats.messageCount || 0} chat msgs` });
      if (stats.unreadNotifications > 0) {
        pills.push({ text: `${stats.unreadNotifications} unread alerts` });
      }
      if (stats.activeGamesCount > 0) {
        pills.push({ text: `${stats.activeGamesCount} active game${stats.activeGamesCount === 1 ? "" : "s"}` });
      }
      if (stats.voiceParticipantsCount > 0) {
        pills.push({ text: `${stats.voiceParticipantsCount} in voice` });
      }
      if (contextSubtitle) {
        contextSubtitle.textContent = `${stats.currentView || "Workspace"} · Live Context`;
      }
    }

    pills.forEach(p => {
      const span = document.createElement("span");
      span.className = `gemini-ctx-pill${p.accent ? " is-accent" : ""}`;
      span.textContent = p.text;
      contextStrip.appendChild(span);
    });
  }

  async function refreshLiveContext() {
    const token = getAuthToken();
    try {
      if (isLoggedInView() && token) {
        const params = new URLSearchParams({
          roomId: getCurrentRoomId(),
          section: getActiveSection(),
          collabTab: getActiveCollabTab()
        });
        const res = await fetch(`/api/gemini/context-summary?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (modelBadge && data.model) modelBadge.textContent = data.model;
          renderContextPills(data.stats);
          return;
        }
      }
      const res = await fetch("/api/gemini/status");
      if (res.ok) {
        const data = await res.json();
        if (modelBadge && data.model) modelBadge.textContent = data.model;
        renderContextPills({ authenticated: false });
      }
    } catch {
      renderContextPills({ authenticated: false });
    }
  }

  function renderWelcomeStarters() {
    if (!messagesEl) return;
    const loggedIn = isLoggedInView();
    const starters = loggedIn
      ? [
          {
            title: "Website & Room Overview",
            desc: "Summarize online members, active apps, notifications, games, and recent room activity.",
            mode: "website_overview",
            tone: "blue",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>',
            prompt: "Give me a complete overview of what is happening across my room and workspace right now."
          },
          {
            title: "Summarize Team Chat",
            desc: "Key points, decisions, shared files, tasks, and pending discussions from chat history.",
            mode: "summarize_bullets",
            tone: "violet",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>',
            prompt: "Summarize the room's chat conversation in clear bullet points with key takeaways."
          },
          {
            title: "Action Items & Unanswered Qs",
            desc: "Extract tasks, decisions, owners, and any questions still waiting for a reply.",
            mode: "action_items",
            tone: "amber",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
            prompt: "Extract all decisions, tasks, action items, and unanswered questions from our chat."
          },
          {
            title: "Current Page Insights",
            desc: "Explain features on the current section and suggest helpful next steps.",
            mode: "page_insights",
            tone: "emerald",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>',
            prompt: "Explain what I can do on this current page and share insights from our live room data."
          }
        ]
      : [
          {
            title: "Explore SecureSphere Features",
            desc: "Learn about private rooms, Team Chat, Whiteboard, YouTube Sync, Voice, and Games.",
            mode: "chat",
            tone: "blue",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
            prompt: "What features does SecureSphere offer and how do rooms work?"
          },
          {
            title: "How to Get Started",
            desc: "Quick guide to creating a private room or joining with an invite code.",
            mode: "chat",
            tone: "emerald",
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
            prompt: "How do I create a room or join an existing room on SecureSphere?"
          }
        ];

    messagesEl.innerHTML = `<div class="gemini-welcome-section">
      <div class="gemini-welcome-label">Suggested prompts</div>
      <div class="gemini-welcome-grid">${starters
        .map(
          (s, idx) => `
            <button type="button" class="gemini-starter-card" data-starter-idx="${idx}" data-tone="${s.tone}">
              <span class="gemini-starter-top">
                <span class="gemini-starter-icon is-${s.tone}" aria-hidden="true">${s.icon}</span>
                <span class="gemini-starter-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
                </span>
              </span>
              <strong class="gemini-starter-title">${escapeHtmlLocal(s.title)}</strong>
              <span class="gemini-starter-desc">${escapeHtmlLocal(s.desc)}</span>
            </button>
          `
        )
        .join("")}</div>
    </div>`;

    messagesEl.querySelectorAll(".gemini-starter-card").forEach(btn => {
      btn.addEventListener("click", () => {
        const s = starters[Number(btn.getAttribute("data-starter-idx"))];
        if (s) sendGeminiPrompt(s.prompt, s.mode);
      });
    });
  }

  function openModal() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    isOpen = true;
    overlay.classList.remove("hidden");
    fab.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
    });

    if (conversationHistory.length === 0 && !isStreaming) {
      renderWelcomeStarters();
    }
    updateOrbCompactState();
    updateSelectedUI();
    refreshLiveContext();
    setTimeout(() => {
      if (inputEl && !isListening) inputEl.focus();
    }, 180);
  }

  function closeModal() {
    if (!isOpen) return;
    isOpen = false;
    stopVoiceInput();
    overlay.classList.remove("is-open");
    fab.setAttribute("aria-expanded", "false");
    closeTimer = setTimeout(() => {
      if (!isOpen) overlay.classList.add("hidden");
    }, 280);
  }

  function appendUserBubble(text) {
    const welcome = messagesEl.querySelector(".gemini-welcome-section, .gemini-welcome-grid");
    if (welcome) welcome.remove();

    const row = document.createElement("div");
    row.className = "gemini-msg is-user";
    row.innerHTML = `<div class="gemini-msg-bubble">${escapeHtmlLocal(text).replace(/\n/g, "<br>")}</div>`;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createAssistantBubble() {
    const row = document.createElement("div");
    row.className = "gemini-msg is-assistant";
    row.innerHTML = `
      <div class="gemini-msg-bubble">
        <div class="gemini-msg-sender">
          <span class="gemini-msg-sparkle" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#4285F4"/>
            </svg>
          </span>
          <span class="gemini-msg-meta">Gemini</span>
        </div>
        <div class="gemini-msg-body">
          <div class="gemini-typing-dots" aria-label="Gemini is thinking">
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>
      <div class="gemini-msg-footer">
        <div class="gemini-msg-actions"></div>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function attachCodeCopyHandlers(container, codeBlocks) {
    container.querySelectorAll(".md-copy-code-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-code-idx"));
        const raw = codeBlocks?.[idx]?.raw || "";
        await copyText(raw);
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy Code";
        }, 1200);
      });
    });
  }

  function setStreamingControls(active) {
    isStreaming = active;
    if (sendBtn) sendBtn.classList.toggle("hidden", active);
    if (stopBtn) stopBtn.classList.toggle("hidden", !active);
    if (inputEl) inputEl.disabled = false;
    updateOrbCompactState();
  }

  async function sendGeminiPrompt(promptText, mode = "chat", isRetry = false) {
    if (isStreaming) return;
    stopVoiceInput();

    const cleanPrompt = String(promptText || "").trim();
    if (!cleanPrompt && mode === "chat") return;

    const modeLabels = {
      website_overview: "Summarize everything happening across my SecureSphere workspace",
      page_insights: "Analyze the current page and give recommendations",
      summarize_short: "Give a short summary of the conversation",
      summarize_detailed: "Give a detailed summary of the conversation",
      summarize_bullets: "Summarize the conversation in bullet points",
      action_items: "Extract decisions, tasks, and action items",
      unanswered: "Identify unanswered questions and pending discussions",
      search: cleanPrompt || "Search room activity"
    };

    const displayPrompt = cleanPrompt || modeLabels[mode] || "Ask Gemini";
    const selectedIdsArray = Array.from(selectedMessageIds);

    lastRequest = { prompt: displayPrompt, mode, selectedMessageIds: selectedIdsArray };
    if (summaryOptions) summaryOptions.classList.add("hidden");
    if (summaryMenuBtn) summaryMenuBtn.classList.remove("is-active");

    if (!isRetry) {
      appendUserBubble(
        selectedIdsArray.length > 0
          ? `${displayPrompt}\n(Using ${selectedIdsArray.length} selected message${selectedIdsArray.length === 1 ? "" : "s"})`
          : displayPrompt
      );
    }

    if (inputEl) {
      inputEl.value = "";
      autoResizeInput();
    }

    setStreamingControls(true);
    setOrbState("thinking", "Thinking…");

    const assistantRow = createAssistantBubble();
    const bodyEl = assistantRow.querySelector(".gemini-msg-body");
    const metaEl = assistantRow.querySelector(".gemini-msg-meta");
    const actionsEl = assistantRow.querySelector(".gemini-msg-actions");

    abortController = new AbortController();
    let fullText = "";
    let usedModel = "";
    let hadError = false;

    try {
      const token = getAuthToken();
      const res = await fetch("/api/gemini/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          prompt: displayPrompt,
          mode,
          roomId: getCurrentRoomId(),
          activeSection: getActiveSection(),
          activeCollabTab: getActiveCollabTab(),
          selectedMessageIds: selectedIdsArray,
          history: conversationHistory.slice(-10)
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Gemini request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Streaming response is unavailable in this browser.");

      const decoder = new TextDecoder();
      let buffer = "";
      let firstToken = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          let evt;
          try {
            evt = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (evt.type === "meta") {
            usedModel = evt.model || usedModel;
            if (modelBadge && usedModel) modelBadge.textContent = usedModel;
            if (evt.stats) renderContextPills(evt.stats);
            if (metaEl) metaEl.textContent = usedModel ? `Gemini · ${usedModel}` : "Gemini AI";
          } else if (evt.type === "delta" && typeof evt.text === "string") {
            if (!firstToken) {
              firstToken = true;
              setOrbState("responding", "Responding…");
            }
            fullText += evt.text;
            const rendered = renderMd(fullText);
            bodyEl.innerHTML = rendered.html;
            attachCodeCopyHandlers(bodyEl, rendered.codeBlocks);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else if (evt.type === "error") {
            hadError = true;
            throw new Error(evt.message || "Gemini encountered an error.");
          } else if (evt.type === "done") {
            if (evt.model) usedModel = evt.model;
          }
        }
      }

      if (fullText.trim()) {
        conversationHistory.push({ role: "user", text: displayPrompt });
        conversationHistory.push({ role: "model", text: fullText });
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "gemini-msg-action-btn";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", async () => {
          await copyText(fullText);
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1200);
        });
        actionsEl.appendChild(copyBtn);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        if (!fullText.trim()) {
          bodyEl.innerHTML = "<p class=\"muted\">Generation stopped.</p>";
        } else {
          conversationHistory.push({ role: "user", text: displayPrompt });
          conversationHistory.push({ role: "model", text: fullText });
        }
      } else {
        hadError = true;
        assistantRow.classList.add("is-error");
        bodyEl.innerHTML = `<p>${escapeHtmlLocal(err?.message || "Unable to reach Gemini right now.")}</p>`;
        if (metaEl) metaEl.textContent = "Error";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "gemini-msg-action-btn";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => {
          assistantRow.remove();
          if (lastRequest) {
            sendGeminiPrompt(lastRequest.prompt, lastRequest.mode, true);
          }
        });
        actionsEl.appendChild(retryBtn);
      }
    } finally {
      abortController = null;
      setStreamingControls(false);
      setOrbState("idle", hadError ? "Ready · Click Retry to try again" : "Ready to assist");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function stopVoiceInput() {
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch {}
    }
    isListening = false;
    if (voiceBtn) {
      voiceBtn.classList.remove("is-listening");
      voiceBtn.setAttribute("aria-pressed", "false");
    }
    if (!isStreaming) setOrbState("idle", "Ready to assist");
  }

  function startVoiceInput() {
    if (!SpeechRecognitionCtor || isStreaming) return;
    if (isListening) {
      stopVoiceInput();
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = () => {
      isListening = true;
      if (voiceBtn) {
        voiceBtn.classList.add("is-listening");
        voiceBtn.setAttribute("aria-pressed", "true");
      }
      setOrbState("listening", "Listening… speak now");
    };

    recognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (inputEl) {
        inputEl.value = (finalTranscript + interim).trim();
        autoResizeInput();
      }
    };

    recognition.onerror = () => {
      stopVoiceInput();
      setOrbState("idle", "Voice unavailable — type your question");
    };

    recognition.onend = () => {
      const spoken = (inputEl?.value || "").trim();
      stopVoiceInput();
      if (spoken && isOpen && !isStreaming) {
        sendGeminiPrompt(spoken, "chat");
      }
    };

    try {
      recognition.start();
    } catch {
      stopVoiceInput();
    }
  }

  /* ── Event Bindings ── */
  fab.addEventListener("click", () => {
    if (isOpen) closeModal();
    else openModal();
  });

  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (isOpen) closeModal();
      else if (isSelectMode) setSelectMode(false);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (isStreaming && abortController) abortController.abort();
      conversationHistory = [];
      clearSelectedMessages();
      renderWelcomeStarters();
      updateOrbCompactState();
      setOrbState("idle", "Ready to assist");
    });
  }

  if (refreshContextBtn) {
    refreshContextBtn.addEventListener("click", () => {
      refreshLiveContext();
      setOrbState("idle", "Workspace context refreshed");
    });
  }

  if (summaryMenuBtn && summaryOptions) {
    summaryMenuBtn.addEventListener("click", () => {
      const isNowHidden = summaryOptions.classList.toggle("hidden");
      summaryMenuBtn.classList.toggle("is-active", !isNowHidden);
    });
  }

  document.querySelectorAll("[data-gemini-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-gemini-action") || "chat";
      sendGeminiPrompt("", mode);
    });
  });

  if (toggleSelectBtn) {
    toggleSelectBtn.addEventListener("click", () => {
      if (!isLoggedInView()) {
        sendGeminiPrompt("Sign in to a room first to select and summarize specific Team Chat messages.", "chat");
        return;
      }
      setSelectMode(!isSelectMode);
    });
  }

  if (cancelSelectBtn) {
    cancelSelectBtn.addEventListener("click", () => setSelectMode(false));
  }

  if (summarizeSelectedBtn) {
    summarizeSelectedBtn.addEventListener("click", () => {
      isSelectMode = false;
      document.body.classList.remove("gemini-select-mode");
      if (selectDock) selectDock.classList.add("hidden");
      openModal();
      sendGeminiPrompt("", "summarize_detailed");
    });
  }

  if (clearSelectedBtn) {
    clearSelectedBtn.addEventListener("click", clearSelectedMessages);
  }

  if (voiceBtn) {
    voiceBtn.addEventListener("click", startVoiceInput);
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (abortController) abortController.abort();
    });
  }

  if (inputEl) {
    inputEl.addEventListener("input", autoResizeInput);
    inputEl.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (text && !isStreaming) sendGeminiPrompt(text, "chat");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const text = (inputEl?.value || "").trim();
      if (text && !isStreaming) sendGeminiPrompt(text, "chat");
    });
  }

  window.SecureSphereGemini = {
    open: openModal,
    close: closeModal,
    ask: (prompt, mode = "chat") => {
      openModal();
      sendGeminiPrompt(prompt, mode);
    },
    refreshContext: refreshLiveContext
  };
})();
