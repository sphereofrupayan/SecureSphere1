import { PermissionsAndroid, Platform } from "react-native";
import type { Socket } from "socket.io-client";
import { setAudioModeAsync } from "expo-audio";
import { voiceApi } from "@/api";
import { loadWebRTCPrimitives, type WebRTCPrimitives } from "@/services/webrtcLoader";

export type PeerAudioState = "connecting" | "connected" | "reconnecting";

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
  peerStates: Record<string, PeerAudioState>;
  connectedPeerCount: number;
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
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
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
  private activeChannelId: string | null = null;
  private localStream: any | null = null;
  private muted = false;
  private deafened = false;
  private error: string | null = null;
  private iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> =
    DEFAULT_ICE_SERVERS;
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
  private boundOnDisconnect = () => {
    if (this.activeChannelId) {
      this.stopLocalSession();
    }
  };

  constructor() {
    this.rtc = loadWebRTCPrimitives();
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
      peerStates,
      connectedPeerCount,
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
      this.socket.off("voice:peerJoined", this.boundOnPeerJoined);
      this.socket.off("voice:peerLeft", this.boundOnPeerLeft);
      this.socket.off("voice:offer", this.boundOnOffer);
      this.socket.off("voice:answer", this.boundOnAnswer);
      this.socket.off("voice:iceCandidate", this.boundOnIceCandidate);
      this.socket.off("voice:channelClosed", this.boundOnChannelClosed);
      this.socket.off("disconnect", this.boundOnDisconnect);
    }

    this.socket = nextSocket;
    if (this.socket) {
      this.socket.on("voice:peerJoined", this.boundOnPeerJoined);
      this.socket.on("voice:peerLeft", this.boundOnPeerLeft);
      this.socket.on("voice:offer", this.boundOnOffer);
      this.socket.on("voice:answer", this.boundOnAnswer);
      this.socket.on("voice:iceCandidate", this.boundOnIceCandidate);
      this.socket.on("voice:channelClosed", this.boundOnChannelClosed);
      this.socket.on("disconnect", this.boundOnDisconnect);
    }
  }

  private async requestMicrophonePermission(): Promise<void> {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "SecureSphere needs microphone access so your teammates can hear you in voice channels.",
          buttonPositive: "Allow",
          buttonNegative: "Cancel",
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error(
          "Microphone permission denied. Enable Microphone permission for SecureSphere in Android Settings."
        );
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
        shouldRouteThroughEarpiece: false,
        interruptionMode: "doNotMix",
      });
    } catch {
      // Non-fatal; WebRTC manages its own native AudioManager focus on Android
    }
  }

  private async acquireMicrophone(): Promise<any> {
    if (!this.rtc) {
      this.rtc = loadWebRTCPrimitives();
    }
    if (!this.rtc) {
      throw new Error(
        "Native WebRTC audio is unavailable in this runtime. Install the SecureSphere Android APK build for live voice audio."
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
        throw new Error("Could not capture microphone audio stream.");
      }
      return stream;
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("Microphone permission denied. Please allow microphone access and try again.");
      }
      if (name === "NotFoundError") {
        throw new Error("No microphone was detected on this device.");
      }
      throw new Error(err?.message || "Unable to open microphone for voice chat.");
    }
  }

  private async refreshIceServers(): Promise<void> {
    try {
      const cfg = await voiceApi.getVoiceIceConfig();
      if (Array.isArray(cfg?.iceServers) && cfg.iceServers.length > 0) {
        this.iceServers = cfg.iceServers;
      }
    } catch {
      this.iceServers = DEFAULT_ICE_SERVERS;
    }
  }

  public async prepareForJoin(): Promise<{ ok: boolean; error?: string }> {
    this.error = null;
    try {
      if (!this.localStream) {
        this.localStream = await this.acquireMicrophone();
      }
      this.applyLocalTrackMuteState();
      await this.refreshIceServers();
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
    this.applyLocalTrackMuteState();

    const mySid = this.socket?.id;
    for (const peer of existingPeers || []) {
      if (!peer?.socketId || peer.socketId === mySid) continue;
      this.createOrGetPeer(peer, true);
    }
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
      // ignore
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

  public stopLocalSession() {
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
    this.error = null;
    this.emitSnapshot();
  }

  private destroyPeer(socketId: string) {
    const entry = this.peers.get(socketId);
    if (!entry) return;
    if (entry.iceRestartTimer) {
      clearTimeout(entry.iceRestartTimer);
      entry.iceRestartTimer = null;
    }
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
      // ignore
    }
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

    const pc = new this.rtc.RTCPeerConnection({
      iceServers: this.iceServers.length ? this.iceServers : DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 4,
    });

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
      iceRestartTimer: null,
    };
    this.peers.set(remoteSid, entry);

    if (this.localStream) {
      try {
        this.localStream.getAudioTracks().forEach((track: any) => {
          pc.addTrack(track, this.localStream);
        });
      } catch {
        // ignore
      }
    }

    pc.onicecandidate = (event: any) => {
      const candidate = serializeCandidate(event?.candidate);
      if (candidate) {
        this.socket?.emit("voice:iceCandidate", {
          targetSocketId: remoteSid,
          candidate,
        });
      }
    };

    pc.ontrack = (event: any) => {
      const stream = event?.streams?.[0] || null;
      entry.remoteStream = stream;
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
        if (entry.iceRestartTimer) {
          clearTimeout(entry.iceRestartTimer);
          entry.iceRestartTimer = null;
        }
      } else if (cs === "failed") {
        entry.connectionState = "reconnecting";
        if (entry.isPolite) {
          void this.triggerIceRestart(entry);
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
      }
      this.emitSnapshot();
    };

    pc.onconnectionstatechange = handleStateChange;
    pc.oniceconnectionstatechange = handleStateChange;

    if (shouldInitiateOffer) {
      void this.createAndSendOffer(entry, false);
    }

    this.emitSnapshot();
    return entry;
  }

  private async createAndSendOffer(entry: PeerEntry, iceRestart: boolean) {
    if (!entry?.pc || entry.makingOffer) return;
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
        this.socket?.emit("voice:offer", {
          targetSocketId: entry.socketId,
          sdp,
        });
      }
    } catch {
      // ignore transient negotiation errors
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
    // Wait for the newly joined peer to send the offer (mirrors public/voice.js)
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
        if (answerSdp) {
          this.socket?.emit("voice:answer", {
            targetSocketId: fromSocketId,
            sdp: answerSdp,
          });
        }
      }
    } catch {
      // ignore failed glare recovery
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
    } catch {
      // ignore
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
      // ignore
    }
  }
}

export const voiceWebRTCEngine = new VoiceWebRTCEngine();
