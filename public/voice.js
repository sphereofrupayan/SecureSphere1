/* ═══════════════════════════════════════════════════════════════
   SYNCTUNE REAL-TIME WEBRTC VOICE ROOM ENGINE
   Discord-style Voice Channels, STUN/TURN Mesh, Device & Speaker Control
   ═══════════════════════════════════════════════════════════════ */
(() => {
  const v$ = id => document.getElementById(id);

  const STORAGE_MIC_KEY = "synctune_voice_mic_id";
  const STORAGE_SPEAKER_KEY = "synctune_voice_speaker_id";

  const DEFAULT_ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  let socketBound = null;
  let channels = [];
  let activeChannelId = null;
  let activeChannelName = "General Voice";
  let selectedChannelId = null;
  let localStream = null;
  let isConnecting = false;
  let isMuted = false;
  let isDeafened = false;
  let localSpeaking = false;
  let lastSpeakingSent = false;
  let lastSpeakingAboveAt = 0;

  let iceConfig = { iceServers: DEFAULT_ICE_SERVERS, hasTurn: false };
  let selectedMicId = "";
  let selectedSpeakerId = "";
  try {
    selectedMicId = localStorage.getItem(STORAGE_MIC_KEY) || "";
    selectedSpeakerId = localStorage.getItem(STORAGE_SPEAKER_KEY) || "";
  } catch {}

  let voiceAudioCtx = null;
  let localAnalyser = null;
  let localSource = null;
  let volumeMonitorTimer = null;

  // socketId -> { socketId, username, pc, connectionState, audioEl, remoteStream,
  //               remoteAnalyser, remoteSource, remoteSpeaking, pendingCandidates,
  //               makingOffer, ignoreOffer, isSettingRemoteAnswerPending, iceRestartTimer }
  const peerConnections = new Map();

  function getBridge() {
    return window.SyncTuneVoiceBridge || null;
  }

  function getSocket() {
    return getBridge()?.getSocket?.() || null;
  }

  function getToken() {
    return getBridge()?.getToken?.() || localStorage.getItem("synctune_token") || "";
  }

  function getCurrentUser() {
    return getBridge()?.getCurrentUser?.() || { username: "", isAdmin: false };
  }

  function getRoomCtx() {
    return (
      getBridge()?.getRoomContext?.() || {
        roomId: "MAIN",
        roomName: "Friends Room",
        owner: "System",
        isOwner: false
      }
    );
  }

  function escapeVoiceHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showVoiceError(msg) {
    const el = v$("voiceErrorBanner");
    if (!el) return;
    if (!msg) {
      el.textContent = "";
      el.classList.add("hidden");
    } else {
      el.textContent = msg;
      el.classList.remove("hidden");
    }
  }

  function showAudioUnlockBanner(show) {
    const el = v$("voiceAudioUnlockBanner");
    if (el) el.classList.toggle("hidden", !show);
  }

  function getOrCreateVoiceAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!voiceAudioCtx) {
      try {
        voiceAudioCtx = new Ctx();
      } catch {
        return null;
      }
    }
    if (voiceAudioCtx.state === "suspended") {
      try {
        voiceAudioCtx.resume().catch(() => {});
      } catch {}
    }
    return voiceAudioCtx;
  }

  async function fetchIceServersConfig() {
    try {
      const tok = getToken();
      const res = await fetch("/api/voice/ice-config", {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        cache: "no-store"
      });
      if (!res.ok) throw new Error("ICE config fetch failed");
      const data = await res.json();
      if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
        iceConfig = {
          iceServers: data.iceServers,
          hasTurn: Boolean(data.hasTurn)
        };
      }
    } catch {
      iceConfig = { iceServers: DEFAULT_ICE_SERVERS, hasTurn: false };
    }
    if (v$("voiceIceTypeBadge")) {
      v$("voiceIceTypeBadge").textContent = iceConfig.hasTurn ? "WebRTC · STUN+TURN" : "WebRTC · STUN";
    }
    return iceConfig;
  }

  /* ── Audio Device Enumeration & Switching ─────────────────── */
  async function refreshAudioDevices() {
    const micSel = v$("voiceMicSelect");
    const spkSel = v$("voiceSpeakerSelect");
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter(d => d.kind === "audioinput");
      const speakers = devices.filter(d => d.kind === "audiooutput");

      if (micSel) {
        micSel.innerHTML = "";
        if (!mics.length) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "Default Microphone";
          micSel.appendChild(opt);
        } else {
          mics.forEach((d, idx) => {
            const opt = document.createElement("option");
            opt.value = d.deviceId;
            opt.textContent = d.label || `Microphone ${idx + 1}`;
            micSel.appendChild(opt);
          });
          if (selectedMicId && mics.some(m => m.deviceId === selectedMicId)) {
            micSel.value = selectedMicId;
          } else if (mics[0]) {
            selectedMicId = mics[0].deviceId;
          }
        }
      }

      if (spkSel) {
        spkSel.innerHTML = "";
        const supportsSink =
          typeof HTMLMediaElement !== "undefined" &&
          "setSinkId" in HTMLMediaElement.prototype;
        if (!speakers.length || !supportsSink) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = supportsSink ? "System Default Speaker" : "System Default (Managed by OS)";
          spkSel.appendChild(opt);
          spkSel.disabled = !supportsSink;
        } else {
          spkSel.disabled = false;
          speakers.forEach((d, idx) => {
            const opt = document.createElement("option");
            opt.value = d.deviceId;
            opt.textContent = d.label || `Speaker ${idx + 1}`;
            spkSel.appendChild(opt);
          });
          if (selectedSpeakerId && speakers.some(s => s.deviceId === selectedSpeakerId)) {
            spkSel.value = selectedSpeakerId;
          } else if (speakers[0]) {
            selectedSpeakerId = speakers[0].deviceId;
          }
        }
      }
    } catch {}
  }

  async function acquireMicrophoneStream(deviceId = selectedMicId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not supported in this browser or requires HTTPS / localhost.");
    }
    const baseAudio = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    const constraints = {
      audio: deviceId ? { ...baseAudio, deviceId: { exact: deviceId } } : baseAudio,
      video: false
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (deviceId && (err?.name === "OverconstrainedError" || err?.name === "NotFoundError")) {
        return await navigator.mediaDevices.getUserMedia({ audio: baseAudio, video: false });
      }
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        throw new Error("Microphone access denied. Allow microphone permissions in your browser settings and try again.");
      }
      if (err?.name === "NotFoundError") {
        throw new Error("No microphone hardware was detected on this device.");
      }
      if (err?.name === "NotReadableError") {
        throw new Error("Your microphone is currently in use by another application.");
      }
      throw new Error(err?.message || "Unable to access microphone.");
    }
  }

  function setupLocalAnalyser(stream) {
    cleanupLocalAnalyser();
    if (!stream) return;
    const ctx = getOrCreateVoiceAudioContext();
    if (!ctx) return;
    try {
      localSource = ctx.createMediaStreamSource(stream);
      localAnalyser = ctx.createAnalyser();
      localAnalyser.fftSize = 512;
      localAnalyser.smoothingTimeConstant = 0.45;
      localSource.connect(localAnalyser);
    } catch {
      localSource = null;
      localAnalyser = null;
    }
  }

  function cleanupLocalAnalyser() {
    try {
      if (localSource) localSource.disconnect();
    } catch {}
    localSource = null;
    localAnalyser = null;
    if (v$("voiceMicMeterFill")) v$("voiceMicMeterFill").style.width = "0%";
  }

  function attachRemoteAnalyser(peerEntry, stream) {
    try {
      if (peerEntry.remoteSource) peerEntry.remoteSource.disconnect();
    } catch {}
    peerEntry.remoteSource = null;
    peerEntry.remoteAnalyser = null;
    if (!stream) return;
    const ctx = getOrCreateVoiceAudioContext();
    if (!ctx) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.45;
      src.connect(analyser);
      peerEntry.remoteSource = src;
      peerEntry.remoteAnalyser = analyser;
    } catch {}
  }

  function computeRmsLevel(analyser) {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
    }
    return Math.sqrt(sumSq / data.length);
  }

  function startSpeakingMonitor() {
    stopSpeakingMonitor();
    volumeMonitorTimer = setInterval(() => {
      if (!activeChannelId) return;

      // 1) Local mic RMS detection + socket broadcast on state edges
      let nextLocalSpeaking = false;
      let pct = 0;
      if (!isMuted && !isDeafened && localAnalyser && localStream?.getAudioTracks().some(t => t.enabled)) {
        const rms = computeRmsLevel(localAnalyser);
        pct = Math.min(100, Math.round((rms / 75) * 100));
        const now = Date.now();
        if (rms >= 16) {
          nextLocalSpeaking = true;
          lastSpeakingAboveAt = now;
        } else if (now - lastSpeakingAboveAt < 280 && localSpeaking) {
          nextLocalSpeaking = true;
        }
      }
      if (v$("voiceMicMeterFill")) {
        v$("voiceMicMeterFill").style.width = `${pct}%`;
      }

      if (nextLocalSpeaking !== localSpeaking) {
        localSpeaking = nextLocalSpeaking;
        if (localSpeaking !== lastSpeakingSent) {
          lastSpeakingSent = localSpeaking;
          getSocket()?.emit("voice:speaking", { speaking: localSpeaking });
        }
        updateSpeakingClassesInDom();
      }

      // 2) Local fast check on remote incoming streams for zero-lag halo glow
      let remoteChanged = false;
      peerConnections.forEach(peer => {
        if (!peer.remoteAnalyser) return;
        const rRms = computeRmsLevel(peer.remoteAnalyser);
        const now = Date.now();
        let nextRemote = peer.remoteSpeaking;
        if (rRms >= 14) {
          nextRemote = true;
          peer.lastRemoteAboveAt = now;
        } else if (now - (peer.lastRemoteAboveAt || 0) > 300) {
          nextRemote = false;
        }
        if (nextRemote !== peer.remoteSpeaking) {
          peer.remoteSpeaking = nextRemote;
          remoteChanged = true;
        }
      });
      if (remoteChanged) {
        updateSpeakingClassesInDom();
      }
    }, 85);
  }

  function stopSpeakingMonitor() {
    if (volumeMonitorTimer) {
      clearInterval(volumeMonitorTimer);
      volumeMonitorTimer = null;
    }
    localSpeaking = false;
    lastSpeakingSent = false;
    if (v$("voiceMicMeterFill")) v$("voiceMicMeterFill").style.width = "0%";
  }

  async function switchMicrophoneDevice(newDeviceId) {
    selectedMicId = newDeviceId || "";
    try {
      localStorage.setItem(STORAGE_MIC_KEY, selectedMicId);
    } catch {}
    if (!localStream || !activeChannelId) return;

    showVoiceError("");
    try {
      const nextStream = await acquireMicrophoneStream(selectedMicId);
      const nextTrack = nextStream.getAudioTracks()[0];
      if (!nextTrack) return;
      nextTrack.enabled = !isMuted && !isDeafened;

      for (const peer of peerConnections.values()) {
        const sender = peer.pc.getSenders().find(s => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(nextTrack);
        }
      }
      localStream.getTracks().forEach(t => t.stop());
      localStream = nextStream;
      setupLocalAnalyser(localStream);
    } catch (err) {
      showVoiceError(err.message || "Unable to switch microphone.");
    }
  }

  async function switchSpeakerDevice(newSpeakerId) {
    selectedSpeakerId = newSpeakerId || "";
    try {
      localStorage.setItem(STORAGE_SPEAKER_KEY, selectedSpeakerId);
    } catch {}
    for (const peer of peerConnections.values()) {
      if (peer.audioEl && typeof peer.audioEl.setSinkId === "function" && selectedSpeakerId) {
        try {
          await peer.audioEl.setSinkId(selectedSpeakerId);
        } catch {}
      }
    }
  }

  /* ── WebRTC Peer Connection Management ────────────────────── */
  function destroyPeerConnection(socketId) {
    const entry = peerConnections.get(socketId);
    if (!entry) return;
    if (entry.iceRestartTimer) clearTimeout(entry.iceRestartTimer);
    try {
      if (entry.remoteSource) entry.remoteSource.disconnect();
    } catch {}
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onnegotiationneeded = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    } catch {}
    if (entry.audioEl) {
      try {
        entry.audioEl.pause();
        entry.audioEl.srcObject = null;
        entry.audioEl.remove();
      } catch {}
    }
    peerConnections.delete(socketId);
  }

  function destroyAllPeers() {
    for (const sid of Array.from(peerConnections.keys())) {
      destroyPeerConnection(sid);
    }
  }

  function createAudioElementForPeer(socketId, username, remoteStream) {
    const container = v$("voiceRemoteAudioContainer") || document.body;
    let audioEl = container.querySelector(`audio[data-peer-socket="${CSS.escape(socketId)}"]`);
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.dataset.peerSocket = socketId;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      container.appendChild(audioEl);
    }
    audioEl.srcObject = remoteStream;
    audioEl.muted = isDeafened;
    if (selectedSpeakerId && typeof audioEl.setSinkId === "function") {
      audioEl.setSinkId(selectedSpeakerId).catch(() => {});
    }
    audioEl
      .play()
      .then(() => showAudioUnlockBanner(false))
      .catch(() => showAudioUnlockBanner(true));
    return audioEl;
  }

  function createOrGetPeer(remotePeer, shouldInitiateOffer = false) {
    if (!remotePeer?.socketId || !activeChannelId) return null;
    const remoteSid = remotePeer.socketId;
    if (peerConnections.has(remoteSid)) {
      return peerConnections.get(remoteSid);
    }

    const sock = getSocket();
    const mySid = sock?.id || "";
    const isPolite = Boolean(mySid && remoteSid && mySid < remoteSid);

    const pc = new RTCPeerConnection({
      iceServers: iceConfig.iceServers?.length ? iceConfig.iceServers : DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 4
    });

    const entry = {
      socketId: remoteSid,
      username: remotePeer.username || "Teammate",
      pc,
      connectionState: "connecting",
      audioEl: null,
      remoteStream: null,
      remoteAnalyser: null,
      remoteSource: null,
      remoteSpeaking: false,
      lastRemoteAboveAt: 0,
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      isPolite,
      iceRestartTimer: null
    };
    peerConnections.set(remoteSid, entry);

    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = event => {
      if (event.candidate) {
        getSocket()?.emit("voice:iceCandidate", {
          targetSocketId: remoteSid,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = event => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      entry.remoteStream = stream;
      entry.audioEl = createAudioElementForPeer(remoteSid, entry.username, stream);
      attachRemoteAnalyser(entry, stream);
      renderVoiceStage();
    };

    const handleStateUpdate = () => {
      const cs = pc.connectionState || pc.iceConnectionState || "connecting";
      if (cs === "connected" || cs === "completed") {
        entry.connectionState = "connected";
        if (entry.iceRestartTimer) {
          clearTimeout(entry.iceRestartTimer);
          entry.iceRestartTimer = null;
        }
      } else if (cs === "failed") {
        entry.connectionState = "reconnecting";
        if (isPolite) {
          triggerIceRestart(entry);
        }
      } else if (cs === "disconnected") {
        entry.connectionState = "reconnecting";
        if (!entry.iceRestartTimer && isPolite) {
          entry.iceRestartTimer = setTimeout(() => {
            entry.iceRestartTimer = null;
            if (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected") {
              triggerIceRestart(entry);
            }
          }, 3500);
        }
      } else {
        entry.connectionState = "connecting";
      }
      renderVoiceStage();
    };

    pc.onconnectionstatechange = handleStateUpdate;
    pc.oniceconnectionstatechange = handleStateUpdate;

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        getSocket()?.emit("voice:offer", {
          targetSocketId: remoteSid,
          sdp: pc.localDescription
        });
      } catch {}
      finally {
        entry.makingOffer = false;
      }
    };

    if (shouldInitiateOffer) {
      (async () => {
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);
          getSocket()?.emit("voice:offer", {
            targetSocketId: remoteSid,
            sdp: pc.localDescription
          });
        } catch {}
        finally {
          entry.makingOffer = false;
        }
      })();
    }

    renderVoiceStage();
    return entry;
  }

  async function triggerIceRestart(entry) {
    if (!entry?.pc || entry.makingOffer) return;
    try {
      entry.makingOffer = true;
      const offer = await entry.pc.createOffer({ iceRestart: true });
      await entry.pc.setLocalDescription(offer);
      getSocket()?.emit("voice:offer", {
        targetSocketId: entry.socketId,
        sdp: entry.pc.localDescription
      });
    } catch {}
    finally {
      entry.makingOffer = false;
    }
  }

  async function handleIncomingOffer(payload) {
    const { fromSocketId, fromUsername, channelId, sdp } = payload || {};
    if (!fromSocketId || !sdp || !activeChannelId || channelId !== activeChannelId) return;
    const entry = createOrGetPeer({ socketId: fromSocketId, username: fromUsername }, false);
    if (!entry) return;
    const pc = entry.pc;

    try {
      const readyForOffer =
        !entry.makingOffer &&
        (pc.signalingState === "stable" || entry.isSettingRemoteAnswerPending);
      const offerCollision = sdp.type === "offer" && !readyForOffer;
      entry.ignoreOffer = !entry.isPolite && offerCollision;
      if (entry.ignoreOffer) return;

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      while (entry.pendingCandidates.length) {
        const cand = entry.pendingCandidates.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }

      if (sdp.type === "offer") {
        await pc.setLocalDescription();
        getSocket()?.emit("voice:answer", {
          targetSocketId: fromSocketId,
          sdp: pc.localDescription
        });
      }
    } catch {}
  }

  async function handleIncomingAnswer(payload) {
    const { fromSocketId, channelId, sdp } = payload || {};
    if (!fromSocketId || !sdp || channelId !== activeChannelId) return;
    const entry = peerConnections.get(fromSocketId);
    if (!entry) return;
    try {
      entry.isSettingRemoteAnswerPending = true;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      while (entry.pendingCandidates.length) {
        const cand = entry.pendingCandidates.shift();
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
    } catch {}
    finally {
      entry.isSettingRemoteAnswerPending = false;
    }
  }

  async function handleIncomingCandidate(payload) {
    const { fromSocketId, channelId, candidate } = payload || {};
    if (!fromSocketId || !candidate || channelId !== activeChannelId) return;
    const entry = peerConnections.get(fromSocketId);
    if (!entry) return;
    if (entry.ignoreOffer) return;
    try {
      if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        entry.pendingCandidates.push(candidate);
      }
    } catch {}
  }

  /* ── Join / Leave / Toggle Voice Session ──────────────────── */
  async function joinChannel(targetChannelId = null) {
    if (isConnecting) return;
    showVoiceError("");
    const sock = getSocket();
    if (!sock || !sock.connected) {
      showVoiceError("Not connected to room server yet. Wait a moment and try again.");
      return;
    }

    const desiredId = targetChannelId || selectedChannelId || channels[0]?.id || "";
    if (activeChannelId && desiredId && activeChannelId === desiredId) {
      return;
    }

    isConnecting = true;
    renderVoiceUi();

    try {
      getOrCreateVoiceAudioContext();
      if (!localStream) {
        localStream = await acquireMicrophoneStream(selectedMicId);
        await refreshAudioDevices();
        setupLocalAnalyser(localStream);
      }
      localStream.getAudioTracks().forEach(t => {
        t.enabled = !isMuted && !isDeafened;
      });

      await fetchIceServersConfig();

      if (activeChannelId && desiredId !== activeChannelId) {
        destroyAllPeers();
      }

      const joinRes = await new Promise(resolve => {
        sock.timeout(6000).emit(
          "voice:join",
          { channelId: desiredId, muted: isMuted, deafened: isDeafened },
          (err, res) => {
            if (err) resolve({ ok: false, error: "Timed out joining voice channel." });
            else resolve(res || { ok: false, error: "Unable to join voice channel." });
          }
        );
      });

      if (!joinRes?.ok) {
        throw new Error(joinRes?.error || "Unable to join voice channel.");
      }

      activeChannelId = joinRes.channelId;
      selectedChannelId = joinRes.channelId;
      activeChannelName = joinRes.channelName || "General Voice";

      startSpeakingMonitor();

      const peers = Array.isArray(joinRes.peers) ? joinRes.peers : [];
      for (const p of peers) {
        createOrGetPeer(p, true);
      }
    } catch (err) {
      showVoiceError(err?.message || "Could not turn on voice.");
      if (!activeChannelId && localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
        cleanupLocalAnalyser();
      }
    } finally {
      isConnecting = false;
      renderVoiceUi();
    }
  }

  function leaveChannel(notifyServer = true) {
    stopSpeakingMonitor();
    cleanupLocalAnalyser();
    destroyAllPeers();

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    const wasActive = Boolean(activeChannelId);
    activeChannelId = null;
    isConnecting = false;
    isMuted = false;
    isDeafened = false;
    showAudioUnlockBanner(false);

    if (notifyServer && wasActive) {
      getSocket()?.emit("voice:leave");
    }
    renderVoiceUi();
  }

  function toggleVoiceConnection() {
    if (activeChannelId) {
      leaveChannel(true);
    } else {
      const targetId = selectedChannelId || channels[0]?.id || null;
      joinChannel(targetId);
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (!isMuted && isDeafened) {
      isDeafened = false;
      for (const peer of peerConnections.values()) {
        if (peer.audioEl) peer.audioEl.muted = false;
      }
    }
    if (localStream) {
      localStream.getAudioTracks().forEach(t => {
        t.enabled = !isMuted && !isDeafened;
      });
    }
    if (isMuted) localSpeaking = false;
    getSocket()?.emit("voice:state", { muted: isMuted, deafened: isDeafened });
    renderVoiceUi();
  }

  function toggleDeafen() {
    isDeafened = !isDeafened;
    if (isDeafened) {
      isMuted = true;
    }
    if (localStream) {
      localStream.getAudioTracks().forEach(t => {
        t.enabled = !isMuted && !isDeafened;
      });
    }
    for (const peer of peerConnections.values()) {
      if (peer.audioEl) {
        peer.audioEl.muted = isDeafened;
      }
    }
    if (isDeafened) localSpeaking = false;
    getSocket()?.emit("voice:state", { muted: isMuted, deafened: isDeafened });
    renderVoiceUi();
  }

  function createVoiceChannel(rawName) {
    showVoiceError("");
    const name = String(rawName || "").trim();
    if (name.length < 2) {
      showVoiceError("Enter at least 2 characters for the voice channel name.");
      return;
    }
    const sock = getSocket();
    if (!sock || !sock.connected) return;
    sock.emit("voice:createChannel", { name }, res => {
      if (!res?.ok) {
        showVoiceError(res?.error || "Unable to create voice channel.");
        return;
      }
      if (v$("newVoiceChannelInput")) v$("newVoiceChannelInput").value = "";
      if (res.channel?.id) {
        selectedChannelId = res.channel.id;
      }
      renderVoiceChannels();
    });
  }

  function deleteVoiceChannel(channelId) {
    showVoiceError("");
    if (!confirm("Delete this voice channel?")) return;
    getSocket()?.emit("voice:deleteChannel", { channelId }, res => {
      if (!res?.ok) showVoiceError(res?.error || "Unable to delete voice channel.");
    });
  }

  /* ── Rendering Voice UI ───────────────────────────────────── */
  function isParticipantSpeaking(p) {
    const mySid = getSocket()?.id;
    if (p.socketId === mySid) return Boolean(localSpeaking && !isMuted && !isDeafened);
    const peer = peerConnections.get(p.socketId);
    return Boolean((peer?.remoteSpeaking || p.speaking) && !p.muted && !p.deafened);
  }

  function updateSpeakingClassesInDom() {
    const activeCh = channels.find(c => c.id === activeChannelId);
    if (!activeCh) return;
    const grid = v$("voiceParticipantsGrid");
    if (grid) {
      (activeCh.participants || []).forEach(p => {
        const card = grid.querySelector(`[data-voice-sid="${CSS.escape(p.socketId)}"]`);
        if (card) {
          card.classList.toggle("is-speaking", isParticipantSpeaking(p));
        }
      });
    }
    const list = v$("voiceChannelsList");
    if (list) {
      channels.forEach(ch => {
        (ch.participants || []).forEach(p => {
          const chip = list.querySelector(`[data-ch-participant-sid="${CSS.escape(p.socketId)}"]`);
          if (chip) {
            chip.classList.toggle("is-speaking", isParticipantSpeaking(p));
          }
        });
      });
    }

    const speakers = (activeCh.participants || []).filter(isParticipantSpeaking).map(p => p.username);
    if (v$("voiceDockSpeakerNote")) {
      v$("voiceDockSpeakerNote").textContent = speakers.length
        ? `Speaking: ${speakers.join(", ")}`
        : isMuted
        ? "Mic Muted"
        : `${(activeCh.participants || []).length} in channel`;
    }
  }

  function renderVoiceChannels() {
    const list = v$("voiceChannelsList");
    const countPill = v$("voiceChannelsCountPill");
    if (countPill) countPill.textContent = String(channels.length || 0);
    if (!list) return;

    const user = getCurrentUser();
    const ctx = getRoomCtx();
    list.innerHTML = "";

    if (!channels.length) {
      list.innerHTML = '<div class="queue-empty">No voice channels found.</div>';
      return;
    }

    if (!selectedChannelId || !channels.some(c => c.id === selectedChannelId)) {
      selectedChannelId = activeChannelId || channels[0].id;
    }

    channels.forEach(ch => {
      const isJoinedHere = ch.id === activeChannelId;
      const isSelected = ch.id === selectedChannelId;
      const canDelete =
        !ch.isDefault &&
        (ctx.isOwner ||
          String(ch.createdBy || "").toLowerCase() === String(user.username || "").toLowerCase());
      const participants = Array.isArray(ch.participants) ? ch.participants : [];

      const card = document.createElement("div");
      card.className = `voice-channel-item${isJoinedHere ? " is-joined" : ""}${
        isSelected ? " is-selected" : ""
      }`;
      card.dataset.voiceChannelId = ch.id;

      const participantsHtml = participants.length
        ? `<div class="voice-channel-members">${participants
            .map(p => {
              const spk = isParticipantSpeaking(p);
              return `
                <div class="voice-ch-member-row${spk ? " is-speaking" : ""}" data-ch-participant-sid="${escapeVoiceHtml(
                p.socketId
              )}">
                  <span class="voice-mini-avatar">${escapeVoiceHtml(
                    String(p.username || "U").slice(0, 1).toUpperCase()
                  )}</span>
                  <span class="voice-mini-name">${escapeVoiceHtml(p.username)}</span>
                  ${
                    p.muted || p.deafened
                      ? `<span class="voice-mini-state">${p.deafened ? "DEAF" : "MUTED"}</span>`
                      : spk
                      ? `<span class="voice-mini-state is-live">LIVE</span>`
                      : ""
                  }
                </div>
              `;
            })
            .join("")}</div>`
        : "";

      card.innerHTML = `
        <div class="voice-channel-head">
          <div class="voice-channel-title-wrap">
            <span class="voice-channel-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            </span>
            <div>
              <strong>${escapeVoiceHtml(ch.name)}</strong>
              <span class="muted">${participants.length} connected</span>
            </div>
          </div>
          <div class="voice-channel-actions">
            ${
              canDelete
                ? `<button type="button" class="small-btn danger voice-del-ch-btn" data-delete-voice-ch="${escapeVoiceHtml(
                    ch.id
                  )}" title="Delete voice channel">&times;</button>`
                : ""
            }
            <button type="button" class="small-btn ${
              isJoinedHere ? "is-connected-btn" : ""
            }" data-join-voice-ch="${escapeVoiceHtml(ch.id)}">${
        isJoinedHere ? "Connected" : "Join"
      }</button>
          </div>
        </div>
        ${participantsHtml}
      `;

      card.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        selectedChannelId = ch.id;
        renderVoiceChannels();
      });

      list.appendChild(card);
    });

    list.querySelectorAll("[data-join-voice-ch]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const chId = btn.getAttribute("data-join-voice-ch");
        if (!chId) return;
        selectedChannelId = chId;
        if (chId !== activeChannelId) {
          joinChannel(chId);
        }
      });
    });

    list.querySelectorAll("[data-delete-voice-ch]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const chId = btn.getAttribute("data-delete-voice-ch");
        if (chId) deleteVoiceChannel(chId);
      });
    });
  }

  function renderVoiceStage() {
    const idleEl = v$("voiceStageIdle");
    const connectedEl = v$("voiceStageConnected");
    const activeCh = channels.find(c => c.id === activeChannelId) || null;
    const isConnected = Boolean(activeChannelId && activeCh);

    if (idleEl) idleEl.classList.toggle("hidden", isConnected);
    if (connectedEl) connectedEl.classList.toggle("hidden", !isConnected);

    if (!isConnected) return;

    activeChannelName = activeCh.name;
    const participants = Array.isArray(activeCh.participants) ? activeCh.participants : [];

    if (v$("voiceActiveChannelTitle")) v$("voiceActiveChannelTitle").textContent = activeCh.name;
    if (v$("voiceActiveCountPill")) {
      v$("voiceActiveCountPill").textContent = `${participants.length} Connected`;
    }

    const grid = v$("voiceParticipantsGrid");
    if (!grid) return;
    const mySid = getSocket()?.id;

    grid.innerHTML = "";
    participants.forEach(p => {
      const isMe = p.socketId === mySid;
      const peerEntry = !isMe ? peerConnections.get(p.socketId) : null;
      const connStatus = isMe
        ? "You · Live"
        : peerEntry?.connectionState === "connected"
        ? "Connected"
        : peerEntry?.connectionState === "reconnecting"
        ? "Reconnecting..."
        : "Connecting...";
      const speaking = isParticipantSpeaking(p);

      const card = document.createElement("div");
      card.className = `voice-participant-card${speaking ? " is-speaking" : ""}${
        p.muted || p.deafened ? " is-muted" : ""
      }`;
      card.dataset.voiceSid = p.socketId;

      card.innerHTML = `
        <div class="voice-avatar-ring">
          <div class="voice-avatar-circle">${escapeVoiceHtml(
            String(p.username || "U").slice(0, 1).toUpperCase()
          )}</div>
          <span class="voice-eq-bars" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
        <div class="voice-participant-meta">
          <div class="voice-participant-name-row">
            <strong>${escapeVoiceHtml(p.username)}${isMe ? " (You)" : ""}</strong>
            ${p.isOwner ? '<span class="voice-role-pill">ADMIN</span>' : ""}
          </div>
          <div class="voice-participant-badges">
            <span class="voice-conn-pill is-${
              isMe ? "connected" : escapeVoiceHtml(peerEntry?.connectionState || "connecting")
            }">${escapeVoiceHtml(connStatus)}</span>
            ${p.deafened ? '<span class="voice-state-pill is-danger">Deafened</span>' : ""}
            ${!p.deafened && p.muted ? '<span class="voice-state-pill is-warn">Muted</span>' : ""}
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function renderVoiceControlsAndBadges() {
    const isConnected = Boolean(activeChannelId);
    const totalVoiceUsers = channels.reduce(
      (sum, ch) => sum + (Array.isArray(ch.participants) ? ch.participants.length : 0),
      0
    );

    const statusBadge = v$("voiceConnectionBadge");
    if (statusBadge) {
      statusBadge.textContent = isConnecting
        ? "Connecting..."
        : isConnected
        ? `Connected · ${activeChannelName}`
        : "Disconnected";
      statusBadge.classList.toggle("is-enabled", isConnected);
    }

    const headerBtn = v$("headerVoiceToggleBtn");
    const headerLbl = v$("headerVoiceToggleLabel");
    if (headerBtn && headerLbl) {
      headerBtn.setAttribute("aria-pressed", String(isConnected));
      headerBtn.classList.toggle("is-active", isConnected);
      headerBtn.classList.toggle("is-muted", isConnected && isMuted);
      headerBtn.disabled = isConnecting;
      headerLbl.textContent = isConnecting
        ? "Connecting..."
        : isConnected
        ? isMuted
          ? "Voice · Muted"
          : "Voice On"
        : "Turn On Voice";
      headerBtn.title = isConnected
        ? "Leave Voice Room or open Voice Channels"
        : "Turn On Voice";
    }

    const primaryBtn = v$("voicePrimaryToggleBtn");
    const primaryLbl = v$("voicePrimaryToggleLabel");
    if (primaryBtn && primaryLbl) {
      primaryBtn.classList.toggle("is-connected", isConnected);
      primaryBtn.disabled = isConnecting;
      primaryLbl.textContent = isConnecting
        ? "Connecting..."
        : isConnected
        ? "Leave Voice"
        : "Turn On Voice";
    }

    const sidebarBadge = v$("sidebarVoiceBadge");
    if (sidebarBadge) {
      if (isConnected) {
        sidebarBadge.textContent = "LIVE";
        sidebarBadge.classList.remove("hidden");
        sidebarBadge.classList.add("is-on");
      } else if (totalVoiceUsers > 0) {
        sidebarBadge.textContent = String(totalVoiceUsers);
        sidebarBadge.classList.remove("hidden", "is-on");
      } else {
        sidebarBadge.classList.add("hidden");
        sidebarBadge.classList.remove("is-on");
      }
    }

    const muteBtn = v$("voiceMuteBtn");
    const muteTxt = v$("voiceMuteBtnText");
    if (muteBtn && muteTxt) {
      muteBtn.setAttribute("aria-pressed", String(isMuted));
      muteBtn.classList.toggle("is-active-danger", isMuted);
      muteTxt.textContent = isMuted ? "Unmute" : "Mute";
    }

    const deafBtn = v$("voiceDeafenBtn");
    const deafTxt = v$("voiceDeafenBtnText");
    if (deafBtn && deafTxt) {
      deafBtn.setAttribute("aria-pressed", String(isDeafened));
      deafBtn.classList.toggle("is-active-danger", isDeafened);
      deafTxt.textContent = isDeafened ? "Undeafen" : "Deafen";
    }

    const dock = v$("voiceFloatingDock");
    if (dock) {
      dock.classList.toggle("hidden", !isConnected);
      if (v$("voiceDockChannelName")) v$("voiceDockChannelName").textContent = activeChannelName;
    }
    const dockMute = v$("voiceDockMuteBtn");
    if (dockMute) {
      dockMute.classList.toggle("is-active-danger", isMuted);
      dockMute.setAttribute("title", isMuted ? "Unmute Mic" : "Mute Mic");
    }
  }

  function renderVoiceUi() {
    renderVoiceChannels();
    renderVoiceStage();
    renderVoiceControlsAndBadges();
    updateSpeakingClassesInDom();
  }

  /* ── Socket.IO Event Listeners ────────────────────────────── */
  function bindSocket(sock) {
    if (!sock || socketBound === sock) return;
    socketBound = sock;

    sock.on("voice:channelsUpdated", payload => {
      if (!payload) return;
      const ctx = getRoomCtx();
      if (payload.roomId && String(payload.roomId).toUpperCase() !== String(ctx.roomId || "MAIN").toUpperCase()) {
        return;
      }
      channels = Array.isArray(payload.channels) ? payload.channels : [];
      if (activeChannelId) {
        const ch = channels.find(c => c.id === activeChannelId);
        const stillIn = ch?.participants?.some(p => p.socketId === sock.id);
        if (!ch || !stillIn) {
          // Server ended channel or moved user out cleanly
          leaveChannel(false);
        }
      }
      renderVoiceUi();
    });

    sock.on("voice:participantStateUpdated", info => {
      if (!info) return;
      const ch = channels.find(c => c.id === info.channelId);
      const p = ch?.participants?.find(x => x.socketId === info.socketId);
      if (p) {
        if (typeof info.muted === "boolean") p.muted = info.muted;
        if (typeof info.deafened === "boolean") p.deafened = info.deafened;
        if (typeof info.speaking === "boolean") p.speaking = info.speaking;
        renderVoiceChannels();
        renderVoiceStage();
        updateSpeakingClassesInDom();
      }
    });

    sock.on("voice:peerJoined", payload => {
      const { channelId, participant } = payload || {};
      if (!activeChannelId || channelId !== activeChannelId || !participant?.socketId) return;
      if (participant.socketId === sock.id) return;
      createOrGetPeer(participant, false);
    });

    sock.on("voice:peerLeft", payload => {
      const { channelId, socketId } = payload || {};
      if (!socketId || (activeChannelId && channelId && channelId !== activeChannelId)) return;
      destroyPeerConnection(socketId);
      renderVoiceStage();
    });

    sock.on("voice:channelClosed", info => {
      if (activeChannelId && info?.channelId === activeChannelId) {
        leaveChannel(false);
        showVoiceError(`Voice channel "${info.name || ""}" was closed by ${info.by || "admin"}.`);
      }
    });

    sock.on("voice:offer", handleIncomingOffer);
    sock.on("voice:answer", handleIncomingAnswer);
    sock.on("voice:iceCandidate", handleIncomingCandidate);

    sock.on("disconnect", () => {
      if (activeChannelId) {
        leaveChannel(false);
      }
    });

    if (getToken()) {
      fetchIceServersConfig();
    }
    sock.emit("voice:getChannels");
  }

  /* ── Static DOM Bindings ──────────────────────────────────── */
  function bindStaticDomEvents() {
    v$("headerVoiceToggleBtn")?.addEventListener("click", () => {
      if (activeChannelId) {
        getBridge()?.jumpToVoiceSection?.();
      } else {
        toggleVoiceConnection();
      }
    });
    v$("voicePrimaryToggleBtn")?.addEventListener("click", toggleVoiceConnection);
    v$("voiceStageJoinBtn")?.addEventListener("click", () => joinChannel(selectedChannelId));
    v$("voiceMuteBtn")?.addEventListener("click", toggleMute);
    v$("voiceDockMuteBtn")?.addEventListener("click", toggleMute);
    v$("voiceDeafenBtn")?.addEventListener("click", toggleDeafen);
    v$("voiceLeaveBtn")?.addEventListener("click", () => leaveChannel(true));
    v$("voiceDockLeaveBtn")?.addEventListener("click", () => leaveChannel(true));

    v$("createVoiceChannelForm")?.addEventListener("submit", e => {
      e.preventDefault();
      createVoiceChannel(v$("newVoiceChannelInput")?.value || "");
    });

    v$("voiceMicSelect")?.addEventListener("change", e => {
      switchMicrophoneDevice(e.target.value);
    });
    v$("voiceSpeakerSelect")?.addEventListener("change", e => {
      switchSpeakerDevice(e.target.value);
    });
    v$("voiceRefreshDevicesBtn")?.addEventListener("click", refreshAudioDevices);

    v$("voiceAudioUnlockBtn")?.addEventListener("click", () => {
      getOrCreateVoiceAudioContext();
      for (const peer of peerConnections.values()) {
        if (peer.audioEl) {
          peer.audioEl.play().catch(() => {});
        }
      }
      showAudioUnlockBanner(false);
    });

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", refreshAudioDevices);
    }

    refreshAudioDevices();
    if (getToken()) {
      fetchIceServersConfig();
    }
    renderVoiceUi();
  }

  window.SyncTuneVoice = {
    joinChannel,
    leaveChannel: () => leaveChannel(true),
    toggleVoiceConnection,
    toggleMute,
    toggleDeafen,
    onSocketReady: sock => bindSocket(sock),
    onRoomContextUpdated: () => {
      const sock = getSocket();
      if (sock && sock.connected) {
        sock.emit("voice:getChannels");
      }
      renderVoiceUi();
    },
    getVoiceState: () => ({
      activeChannelId,
      activeChannelName,
      isConnecting,
      isMuted,
      isDeafened,
      localSpeaking,
      peerCount: peerConnections.size,
      channelsCount: channels.length,
      iceServersCount: iceConfig.iceServers?.length || 0,
      hasTurn: iceConfig.hasTurn
    })
  };

  bindStaticDomEvents();
  const initialSock = getSocket();
  if (initialSock) bindSocket(initialSock);
})();
