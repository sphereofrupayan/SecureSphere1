import { Linking, PermissionsAndroid, Platform } from "react-native";
import type { Socket } from "socket.io-client";
import { setAudioModeAsync } from "expo-audio";
import { voiceApi } from "@/api";
import {
  getWebRTCLoadError,
  loadWebRTCPrimitives,
  type WebRTCPrimitives,
} from "@/services/webrtcLoader";

export type PeerAudioState = "connecting" | "connected" | "reconnecting" | "failed";
export type VoiceMicPermissionStatus = "unknown" | "granted" | "denied" | "blocked";
export type VoiceDiagnosticCode =
  | "mic_permission_denied"
  | "mic_blocked_settings"
  | "webrtc_unavailable"
  | "socket_disconnected"
  | "ice_stalled_no_turn"
  | "ice_failed"
  | "peer_negotiation_failed"
  | null;

export interface VoicePeerSnapshot {
  socketId: string;
  username: string;
  connectionState: PeerAudioState;
}

export interface VoiceEngineSnapshot {
  supported: boolean;
  activeChannelId: string | null;
  muted: boolean;
  deafened: boolean;
  speakerOn: boolean;
  micPermission: VoiceMicPermissionStatus;
  socketConnected: boolean;
  iceServerCount: number;
  hasTurn: boolean;
  peerStates: Record<string, PeerAudioState>;
  connectedPeerCount: number;
  lastDiagnosticCode: VoiceDiagnosticCode;
  error: string | null;
}

interface PeerEntry {
  socketId: string;
  username: string;
  pc: any;
  connectionState: PeerAudioState;
  remoteStream: any | null;
  remoteAudioEl: HTMLAudioElement | null;
  pendingCandidates: any[];
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  isPolite: boolean;
  restartAttempted: boolean;
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
  connectWatchdogTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.relay.metered.ca:80" },
];

function serializeSdp(desc: any): { type: string; sdp: string } | null {
  if (!desc?.type || !desc?.sdp) return null;
  return { type: String(desc.type), sdp: String(desc.sdp) };
}

function serializeCandidate(cand: any): Record<string, unknown> | null {
  if (!cand) return null;
  if (typeof cand.toJSON === "function") {
    return cand.toJSON();
  }
  return {
    candidate: cand.candidate,
    sdpMid: cand.sdpMid ?? null,
    sdpMLineIndex: cand.sdpMLineIndex ?? null,
  };
}

class VoiceWebRTCEngine {
  private rtc: WebRTCPrimitives | null = null;
  private socket: Socket | null = null;
  private socketConnected = false;
  private activeChannelId: string | null = null;
  private localStream: any | null = null;
  private muted = false;
  private deafened = false;
  private speakerOn = true;
  private micPermission: VoiceMicPermissionStatus = Platform.OS === "web" ? "unknown" : "unknown";
  private lastDiagnosticCode: VoiceDiagnosticCode = null;
  private error: string | null = null;
  private iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> =
    DEFAULT_ICE_SERVERS;
  private hasTurn = false;
  private peers = new Map<string, PeerEntry>();
  private listeners = new Set<(snapshot: VoiceEngineSnapshot) => void>();

  private boundOnPeerJoined = (payload: any) => this.handlePeerJoined(payload);
  private boundOnPeerLeft = (payload: any) => this.handlePeerLeft(payload);
  private boundOnOffer = (payload: any) => void this.handleIncomingOffer(payload);
  private boundOnAnswer = (payload: any) => void this.handleIncomingAnswer(payload);
  private boundOnIceCandidate = (payload: any) => void this.handleIncomingCandidate(payload);
  private boundOnChannelClosed = (info: any) => {
    if (this.activeChannelId && info?.channelId === this.activeChannelId) {
      this.stopLocalSession();
    }
  };
  private boundOnConnect = () => {
    this.socketConnected = true;
    if (this.lastDiagnosticCode === "socket_disconnected") {
      this.lastDiagnosticCode = null;
      this.error = null;
    }
    this.emitSnapshot();
  };
  private boundOnDisconnect = () => {
    this.socketConnected = false;
    if (this.activeChannelId) {
      this.lastDiagnosticCode = "socket_disconnected";
      this.error =
        "Voice disconnected because real-time server connection dropped. Rejoin once Online.";
      this.stopLocalSession({ preserveError: true });
      return;
    }
    this.emitSnapshot();
  };

  constructor() {
    this.rtc = loadWebRTCPrimitives();
    if (!this.rtc && Platform.OS !== "web") {
      this.lastDiagnosticCode = "webrtc_unavailable";
    }
  }

  public isSupported(): boolean {
    if (!this.rtc) {
      this.rtc = loadWebRTCPrimitives();
    }
    return Boolean(this.rtc);
  }

  public getSnapshot(): VoiceEngineSnapshot {
    const peerStates: Record<string, PeerAudioState> = {};
    let connectedPeerCount = 0;
    this.peers.forEach((entry, sid) => {
      peerStates[sid] = entry.connectionState;
      if (entry.connectionState === "connected") connectedPeerCount++;
    });

    return {
      supported: this.isSupported(),
      activeChannelId: this.activeChannelId,
      muted: this.muted,
      deafened: this.deafened,
      speakerOn: this.speakerOn,
      micPermission: this.micPermission,
      socketConnected: this.socketConnected,
      iceServerCount: this.iceServers.length,
      hasTurn: this.hasTurn,
      peerStates,
      connectedPeerCount,
      lastDiagnosticCode: this.lastDiagnosticCode,
      error: this.error,
    };
  }

  public subscribe(listener: (snapshot: VoiceEngineSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitSnapshot() {
    const snap = this.getSnapshot();
    this.listeners.forEach(fn => {
      try {
        fn(snap);
      } catch {
        // ignore listener errors
      }
    });
  }

  public bindSocket(nextSocket: Socket | null) {
    if (this.socket === nextSocket) return;
    if (this.socket) {
      this.socket.off("connect", this.boundOnConnect);
      this.socket.off("disconnect", this.boundOnDisconnect);
      this.socket.off("voice:peerJoined", this.boundOnPeerJoined);
      this.socket.off("voice:peerLeft", this.boundOnPeerLeft);
      this.socket.off("voice:offer", this.boundOnOffer);
      this.socket.off("voice:answer", this.boundOnAnswer);
      this.socket.off("voice:iceCandidate", this.boundOnIceCandidate);
      this.socket.off("voice:channelClosed", this.boundOnChannelClosed);
    }

    this.socket = nextSocket;
    this.socketConnected = Boolean(nextSocket?.connected);
    if (this.socket) {
      this.socket.on("connect", this.boundOnConnect);
      this.socket.on("disconnect", this.boundOnDisconnect);
      this.socket.on("voice:peerJoined", this.boundOnPeerJoined);
      this.socket.on("voice:peerLeft", this.boundOnPeerLeft);
      this.socket.on("voice:offer", this.boundOnOffer);
      this.socket.on("voice:answer", this.boundOnAnswer);
      this.socket.on("voice:iceCandidate", this.boundOnIceCandidate);
      this.socket.on("voice:channelClosed", this.boundOnChannelClosed);
    }
    this.emitSnapshot();
  }

  public async refreshMicPermissionStatus(): Promise<VoiceMicPermissionStatus> {
    if (Platform.OS === "android") {
      try {
        const hasAudio = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (hasAudio) {
          this.micPermission = "granted";
          if (
            this.lastDiagnosticCode === "mic_permission_denied" ||
            this.lastDiagnosticCode === "mic_blocked_settings"
          ) {
            this.lastDiagnosticCode = null;
            this.error = null;
          }
        } else if (this.micPermission === "granted") {
          this.micPermission = "unknown";
        }
      } catch {
        // leave current status
      }
      this.emitSnapshot();
    }
    return this.micPermission;
  }

  public async openPermissionSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch {
      // ignore if settings cannot open on platform
    }
  }

  private async requestMicrophonePermission(): Promise<void> {
    if (Platform.OS !== "android") return;

    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (!alreadyGranted) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Access for Voice Chat",
          message:
            "SecureSphere needs microphone access for real-time room voice calls.",
          buttonPositive: "Allow Microphone",
          buttonNegative: "Not Now",
        }
      );

      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        this.micPermission = "blocked";
        this.lastDiagnosticCode = "mic_blocked_settings";
        this.emitSnapshot();
        throw new Error(
          "Microphone access is blocked in Android Settings. Tap Open Settings to allow Microphone for SecureSphere."
        );
      }

      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        this.micPermission = "denied";
        this.lastDiagnosticCode = "mic_permission_denied";
        this.emitSnapshot();
        throw new Error(
          "Microphone permission denied. Allow Microphone access when prompted to talk in voice chat."
        );
      }
    }

    this.micPermission = "granted";

    // Android 12+ (API 31+): request BLUETOOTH_CONNECT best-effort for BT headset routing
    if (typeof Platform.Version === "number" && Platform.Version >= 31) {
      const btPerm = (PermissionsAndroid.PERMISSIONS as any).BLUETOOTH_CONNECT;
      if (btPerm) {
        try {
          const hasBt = await PermissionsAndroid.check(btPerm);
          if (!hasBt) {
            await PermissionsAndroid.request(btPerm);
          }
        } catch {
          // non-fatal for speaker/earpiece voice calls
        }
      }
    }
  }

  private async configureAudioSessionForVoice(): Promise<void> {
    if (Platform.OS === "web") return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: !this.speakerOn,
        interruptionMode: "doNotMix",
      });
    } catch {
      // WebRTC JavaAudioDeviceModule still handles Android communication mode natively
    }
  }

  private async releaseAudioSession(): Promise<void> {
    if (Platform.OS === "web") return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: "mixWithOthers",
      });
    } catch {
      // ignore cleanup failures
    }
  }

  public async setSpeakerOn(enabled: boolean): Promise<void> {
    this.speakerOn = Boolean(enabled);
    if (this.activeChannelId) {
      await this.configureAudioSessionForVoice();
    }
    this.emitSnapshot();
  }

  private async acquireMicrophone(): Promise<any> {
    if (!this.rtc) {
      this.rtc = loadWebRTCPrimitives();
    }
    if (!this.rtc) {
      this.lastDiagnosticCode = "webrtc_unavailable";
      const reason = getWebRTCLoadError();
      throw new Error(
        Platform.OS === "web"
          ? reason || "WebRTC audio requires a supported modern browser over HTTPS."
          : reason ||
              "Native WebRTC audio module is unavailable in Expo Go. Install the SecureSphere Android APK build for live voice."
      );
    }

    await this.requestMicrophonePermission();
    await this.configureAudioSessionForVoice();

    try {
      const constraints = this.rtc.isNative
        ? { audio: true, video: false }
        : {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          };
      const stream = await this.rtc.mediaDevices.getUserMedia(constraints);
      if (!stream || !stream.getAudioTracks?.().length) {
        throw new Error("Could not open a valid microphone audio track on this device.");
      }
      this.micPermission = "granted";
      return stream;
    } catch (err: any) {
      const name = String(err?.name || "");
      const msg = String(err?.message || "");
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        /permission/i.test(msg)
      ) {
        if (this.micPermission !== "blocked") {
          this.micPermission = "denied";
          this.lastDiagnosticCode = "mic_permission_denied";
        }
        throw new Error(
          this.micPermission === "blocked"
            ? "Microphone access is blocked in Android Settings. Tap Open Settings to enable Microphone."
            : "Microphone permission was denied. Allow Microphone permission and try again."
        );
      }
      if (name === "NotFoundError") {
        throw new Error("No working microphone was detected on this device.");
      }
      if (name === "NotReadableError") {
        throw new Error("Microphone is currently busy in another app or phone call.");
      }
      throw new Error(msg || "Unable to open microphone for voice chat.");
    }
  }

  public async refreshIceServers(): Promise<{
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    hasTurn: boolean;
  }> {
    try {
      const cfg = await voiceApi.getVoiceIceConfig();
      if (Array.isArray(cfg?.iceServers) && cfg.iceServers.length > 0) {
        this.iceServers = cfg.iceServers;
        this.hasTurn = Boolean(cfg.hasTurn);
      }
    } catch {
      this.iceServers = DEFAULT_ICE_SERVERS;
      this.hasTurn = false;
    }
    this.emitSnapshot();
    return { iceServers: this.iceServers, hasTurn: this.hasTurn };
  }

  public async prepareForJoin(): Promise<{ ok: boolean; error?: string }> {
    this.error = null;
    this.lastDiagnosticCode = null;
    try {
      if (!this.socket?.connected) {
        this.lastDiagnosticCode = "socket_disconnected";
        this.error = "Real-time server socket is disconnected. Wait for Live status and retry.";
        this.emitSnapshot();
        return { ok: false, error: this.error };
      }

      if (!this.localStream) {
        this.localStream = await this.acquireMicrophone();
      }
      this.applyLocalTrackMuteState();
      await this.refreshIceServers();
      this.emitSnapshot();
      return { ok: true };
    } catch (err: any) {
      const message = err?.message || "Could not initialize microphone for voice chat.";
      this.error = message;
      this.emitSnapshot();
      return { ok: false, error: message };
    }
  }

  public startChannelMesh(
    channelId: string,
    existingPeers: Array<{ socketId: string; username: string }>
  ) {
    if (this.activeChannelId && this.activeChannelId !== channelId) {
      this.destroyAllPeers();
    }
    this.activeChannelId = channelId;
    this.error = null;
    this.lastDiagnosticCode = null;
    this.applyLocalTrackMuteState();

    const mySid = this.socket?.id;
    for (const peer of existingPeers || []) {
      if (!peer?.socketId || peer.socketId === mySid) continue;
      this.createOrGetPeer(peer, true);
    }
    this.emitSnapshot();
  }

  public async retryPeerConnections(): Promise<void> {
    if (!this.activeChannelId) return;
    this.error = null;
    this.lastDiagnosticCode = null;
    await this.refreshIceServers();
    this.peers.forEach(entry => {
      entry.restartAttempted = false;
      void this.triggerIceRestart(entry);
    });
    this.emitSnapshot();
  }

  public setLocalVoiceFlags(muted: boolean, deafened: boolean) {
    this.deafened = Boolean(deafened);
    this.muted = this.deafened ? true : Boolean(muted);
    this.applyLocalTrackMuteState();
    this.applyRemoteDeafenState();
    this.emitSnapshot();
  }

  private applyLocalTrackMuteState() {
    if (!this.localStream) return;
    const enabled = !this.muted && !this.deafened;
    try {
      this.localStream.getAudioTracks().forEach((track: any) => {
        track.enabled = enabled;
      });
    } catch {
      // ignore track toggle errors
    }
  }

  private applyRemoteDeafenState() {
    this.peers.forEach(entry => {
      if (entry.remoteAudioEl) {
        entry.remoteAudioEl.muted = this.deafened;
      }
      if (entry.remoteStream?.getAudioTracks) {
        try {
          entry.remoteStream.getAudioTracks().forEach((track: any) => {
            track.enabled = !this.deafened;
            if (typeof track._setVolume === "function") {
              track._setVolume(this.deafened ? 0 : 1);
            }
          });
        } catch {
          // ignore
        }
      }
    });
  }

  public stopLocalSession(options?: { preserveError?: boolean }) {
    this.destroyAllPeers();
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((t: any) => t.stop());
      } catch {
        // ignore
      }
      this.localStream = null;
    }
    this.activeChannelId = null;
    this.muted = false;
    this.deafened = false;
    if (!options?.preserveError) {
      this.error = null;
      this.lastDiagnosticCode = this.isSupported() ? null : "webrtc_unavailable";
    }
    void this.releaseAudioSession();
    this.emitSnapshot();
  }

  private clearPeerTimers(entry: PeerEntry) {
    if (entry.iceRestartTimer) {
      clearTimeout(entry.iceRestartTimer);
      entry.iceRestartTimer = null;
    }
    if (entry.connectWatchdogTimer) {
      clearTimeout(entry.connectWatchdogTimer);
      entry.connectWatchdogTimer = null;
    }
  }

  private destroyPeer(socketId: string) {
    const entry = this.peers.get(socketId);
    if (!entry) return;
    this.clearPeerTimers(entry);
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.close();
    } catch {
      // ignore
    }
    if (entry.remoteAudioEl) {
      try {
        entry.remoteAudioEl.pause();
        entry.remoteAudioEl.srcObject = null;
        entry.remoteAudioEl.remove();
      } catch {
        // ignore
      }
    }
    this.peers.delete(socketId);
  }

  private destroyAllPeers() {
    Array.from(this.peers.keys()).forEach(sid => this.destroyPeer(sid));
  }

  private attachWebAudioElement(entry: PeerEntry, stream: any) {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    try {
      let audioEl = entry.remoteAudioEl;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        (audioEl as any).playsInline = true;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
        entry.remoteAudioEl = audioEl;
      }
      audioEl.srcObject = stream;
      audioEl.muted = this.deafened;
      void audioEl.play().catch(() => {});
    } catch {
      // ignore web audio autoplay failures
    }
  }

  private scheduleConnectWatchdog(entry: PeerEntry) {
    if (entry.connectWatchdogTimer) {
      clearTimeout(entry.connectWatchdogTimer);
    }
    entry.connectWatchdogTimer = setTimeout(() => {
      entry.connectWatchdogTimer = null;
      if (!this.peers.has(entry.socketId)) return;
      const state = entry.pc.connectionState || entry.pc.iceConnectionState || "connecting";
      if (state === "connected" || state === "completed") return;

      if (!entry.restartAttempted && entry.isPolite) {
        entry.restartAttempted = true;
        entry.connectionState = "reconnecting";
        this.emitSnapshot();
        void this.triggerIceRestart(entry);
        this.scheduleConnectWatchdog(entry);
        return;
      }

      entry.connectionState = "failed";
      this.lastDiagnosticCode = this.hasTurn ? "ice_failed" : "ice_stalled_no_turn";
      this.error = this.hasTurn
        ? "Could not complete peer audio connection (ICE firewall blocked). Tap Reconnect Audio to retry."
        : "Cross-network audio failed (STUN only, no TURN relay on server). Both devices may work on the same Wi-Fi, or add TURN env on Render.";
      this.emitSnapshot();
    }, 12000);
  }

  private createOrGetPeer(
    remotePeer: { socketId: string; username?: string },
    shouldInitiateOffer: boolean
  ): PeerEntry | null {
    if (!this.rtc || !this.activeChannelId || !remotePeer?.socketId) return null;
    const remoteSid = remotePeer.socketId;
    const existing = this.peers.get(remoteSid);
    if (existing) return existing;

    const mySid = this.socket?.id || "";
    const isPolite = Boolean(mySid && remoteSid && mySid < remoteSid);

    let pc: any;
    try {
      pc = new this.rtc.RTCPeerConnection({
        iceServers: this.iceServers.length ? this.iceServers : DEFAULT_ICE_SERVERS,
        iceCandidatePoolSize: 4,
      });
    } catch (err: any) {
      this.lastDiagnosticCode = "webrtc_unavailable";
      this.error = err?.message || "Failed to initialize WebRTC peer connection.";
      this.emitSnapshot();
      return null;
    }

    const entry: PeerEntry = {
      socketId: remoteSid,
      username: remotePeer.username || "Teammate",
      pc,
      connectionState: "connecting",
      remoteStream: null,
      remoteAudioEl: null,
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      isPolite,
      restartAttempted: false,
      iceRestartTimer: null,
      connectWatchdogTimer: null,
    };
    this.peers.set(remoteSid, entry);

    if (this.localStream) {
      try {
        this.localStream.getAudioTracks().forEach((track: any) => {
          pc.addTrack(track, this.localStream);
        });
      } catch (err: any) {
        this.lastDiagnosticCode = "peer_negotiation_failed";
        this.error = err?.message || "Failed to attach local microphone track to peer connection.";
      }
    } else if (typeof pc.addTransceiver === "function") {
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch {
        // ignore if unsupported
      }
    }

    pc.onicecandidate = (event: any) => {
      const candidate = serializeCandidate(event?.candidate);
      if (candidate && this.socket?.connected) {
        this.socket.emit(
          "voice:iceCandidate",
          {
            targetSocketId: remoteSid,
            candidate,
          },
          (ack: any) => {
            if (ack && ack.ok === false && ack.error) {
              // Surface only if connection isn't already established
              if (entry.connectionState !== "connected") {
                this.error = ack.error;
                this.emitSnapshot();
              }
            }
          }
        );
      }
    };

    pc.ontrack = (event: any) => {
      let stream = event?.streams?.[0] || null;
      if (!stream && event?.track && this.rtc?.MediaStream) {
        try {
          stream = new this.rtc.MediaStream([event.track]);
        } catch {
          stream = null;
        }
      }
      if (stream) {
        entry.remoteStream = stream;
      }
      if (event?.track && event.track.kind === "audio") {
        event.track.enabled = !this.deafened;
        if (typeof event.track._setVolume === "function") {
          event.track._setVolume(this.deafened ? 0 : 1);
        }
      }
      if (stream) {
        this.attachWebAudioElement(entry, stream);
      }
      this.applyRemoteDeafenState();
      this.emitSnapshot();
    };

    const handleStateChange = () => {
      const cs = pc.connectionState || pc.iceConnectionState || "connecting";
      if (cs === "connected" || cs === "completed") {
        entry.connectionState = "connected";
        entry.restartAttempted = false;
        this.clearPeerTimers(entry);
        if (
          this.lastDiagnosticCode === "ice_failed" ||
          this.lastDiagnosticCode === "ice_stalled_no_turn" ||
          this.lastDiagnosticCode === "peer_negotiation_failed"
        ) {
          this.lastDiagnosticCode = null;
          this.error = null;
        }
      } else if (cs === "failed") {
        if (!entry.restartAttempted && entry.isPolite) {
          entry.restartAttempted = true;
          entry.connectionState = "reconnecting";
          void this.triggerIceRestart(entry);
          this.scheduleConnectWatchdog(entry);
        } else {
          entry.connectionState = "failed";
          this.lastDiagnosticCode = this.hasTurn ? "ice_failed" : "ice_stalled_no_turn";
          this.error = this.hasTurn
            ? "WebRTC peer audio failed (ICE blocked). Tap Reconnect Audio."
            : "Cross-network peer audio failed (STUN only, no TURN relay configured on server).";
        }
      } else if (cs === "disconnected") {
        entry.connectionState = "reconnecting";
        if (!entry.iceRestartTimer && entry.isPolite) {
          entry.iceRestartTimer = setTimeout(() => {
            entry.iceRestartTimer = null;
            const cur = pc.connectionState || pc.iceConnectionState;
            if (cur === "disconnected") {
              void this.triggerIceRestart(entry);
            }
          }, 3500);
        }
      } else {
        entry.connectionState = "connecting";
        if (!entry.connectWatchdogTimer) {
          this.scheduleConnectWatchdog(entry);
        }
      }
      this.emitSnapshot();
    };

    pc.onconnectionstatechange = handleStateChange;
    pc.oniceconnectionstatechange = handleStateChange;
    this.scheduleConnectWatchdog(entry);

    if (shouldInitiateOffer) {
      void this.createAndSendOffer(entry, false);
    }

    this.emitSnapshot();
    return entry;
  }

  private async createAndSendOffer(entry: PeerEntry, iceRestart: boolean) {
    if (!entry?.pc || entry.makingOffer) return;
    if (!this.socket?.connected) {
      this.lastDiagnosticCode = "socket_disconnected";
      this.error = "Cannot exchange WebRTC offer while socket is offline.";
      this.emitSnapshot();
      return;
    }
    try {
      entry.makingOffer = true;
      const offer = await entry.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
        ...(iceRestart ? { iceRestart: true } : {}),
      });
      if (!iceRestart && entry.pc.signalingState !== "stable") return;
      await entry.pc.setLocalDescription(offer);
      const sdp = serializeSdp(entry.pc.localDescription || offer);
      if (sdp) {
        this.socket.emit(
          "voice:offer",
          {
            targetSocketId: entry.socketId,
            sdp,
          },
          (ack: any) => {
            if (ack && ack.ok === false && ack.error) {
              this.lastDiagnosticCode = "peer_negotiation_failed";
              this.error = ack.error;
              this.emitSnapshot();
            }
          }
        );
      }
    } catch (err: any) {
      this.lastDiagnosticCode = "peer_negotiation_failed";
      this.error = err?.message || "WebRTC offer negotiation failed.";
      this.emitSnapshot();
    } finally {
      entry.makingOffer = false;
    }
  }

  private async triggerIceRestart(entry: PeerEntry) {
    await this.createAndSendOffer(entry, true);
  }

  private handlePeerJoined(payload: any) {
    const { channelId, participant } = payload || {};
    if (!this.activeChannelId || channelId !== this.activeChannelId || !participant?.socketId) {
      return;
    }
    if (participant.socketId === this.socket?.id) return;
    // Wait for the newly joined peer to send the offer
    this.createOrGetPeer(participant, false);
  }

  private handlePeerLeft(payload: any) {
    const { channelId, socketId } = payload || {};
    if (!socketId || (this.activeChannelId && channelId && channelId !== this.activeChannelId)) {
      return;
    }
    this.destroyPeer(socketId);
    this.emitSnapshot();
  }

  private async handleIncomingOffer(payload: any) {
    if (!this.rtc) return;
    const { fromSocketId, fromUsername, channelId, sdp } = payload || {};
    if (!fromSocketId || !sdp || !this.activeChannelId || channelId !== this.activeChannelId) {
      return;
    }
    const entry = this.createOrGetPeer(
      { socketId: fromSocketId, username: fromUsername },
      false
    );
    if (!entry) return;
    const pc = entry.pc;

    try {
      const readyForOffer =
        !entry.makingOffer &&
        (pc.signalingState === "stable" || entry.isSettingRemoteAnswerPending);
      const offerCollision = sdp.type === "offer" && !readyForOffer;
      entry.ignoreOffer = !entry.isPolite && offerCollision;
      if (entry.ignoreOffer) return;

      if (offerCollision && entry.isPolite && pc.signalingState !== "stable") {
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch {
          // Unified Plan enableImplicitRollback will handle setRemoteDescription fallback
        }
      }

      await pc.setRemoteDescription(new this.rtc.RTCSessionDescription(sdp));
      while (entry.pendingCandidates.length) {
        const cand = entry.pendingCandidates.shift();
        try {
          await pc.addIceCandidate(new this.rtc.RTCIceCandidate(cand));
        } catch {
          // ignore stale candidate
        }
      }

      if (sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const answerSdp = serializeSdp(pc.localDescription || answer);
        if (answerSdp && this.socket?.connected) {
          this.socket.emit(
            "voice:answer",
            {
              targetSocketId: fromSocketId,
              sdp: answerSdp,
            },
            (ack: any) => {
              if (ack && ack.ok === false && ack.error) {
                this.lastDiagnosticCode = "peer_negotiation_failed";
                this.error = ack.error;
                this.emitSnapshot();
              }
            }
          );
        }
      }
    } catch (err: any) {
      this.lastDiagnosticCode = "peer_negotiation_failed";
      this.error = err?.message || "WebRTC incoming call handshake failed.";
      this.emitSnapshot();
    }
  }

  private async handleIncomingAnswer(payload: any) {
    if (!this.rtc) return;
    const { fromSocketId, channelId, sdp } = payload || {};
    if (!fromSocketId || !sdp || channelId !== this.activeChannelId) return;
    const entry = this.peers.get(fromSocketId);
    if (!entry) return;

    try {
      entry.isSettingRemoteAnswerPending = true;
      await entry.pc.setRemoteDescription(new this.rtc.RTCSessionDescription(sdp));
      while (entry.pendingCandidates.length) {
        const cand = entry.pendingCandidates.shift();
        try {
          await entry.pc.addIceCandidate(new this.rtc.RTCIceCandidate(cand));
        } catch {
          // ignore stale candidate
        }
      }
    } catch (err: any) {
      this.lastDiagnosticCode = "peer_negotiation_failed";
      this.error = err?.message || "WebRTC answer application failed.";
      this.emitSnapshot();
    } finally {
      entry.isSettingRemoteAnswerPending = false;
    }
  }

  private async handleIncomingCandidate(payload: any) {
    if (!this.rtc) return;
    const { fromSocketId, channelId, candidate } = payload || {};
    if (!fromSocketId || !candidate || channelId !== this.activeChannelId) return;
    const entry = this.peers.get(fromSocketId);
    if (!entry || entry.ignoreOffer) return;

    try {
      if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
        await entry.pc.addIceCandidate(new this.rtc.RTCIceCandidate(candidate));
      } else {
        entry.pendingCandidates.push(candidate);
      }
    } catch {
      // ignore late/unmatched candidate
    }
  }
}

export const voiceWebRTCEngine = new VoiceWebRTCEngine();
