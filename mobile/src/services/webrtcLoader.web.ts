export interface WebRTCPrimitives {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  MediaStream?: any;
  mediaDevices: {
    getUserMedia: (constraints: Record<string, unknown>) => Promise<any>;
  };
  isNative: boolean;
}

export function getWebRTCLoadError(): string | null {
  if (typeof globalThis === "undefined") return "Browser environment unavailable.";
  const g = globalThis as any;
  if (!g?.RTCPeerConnection || !g?.navigator?.mediaDevices?.getUserMedia) {
    return "Browser does not support WebRTC audio (requires HTTPS or localhost).";
  }
  return null;
}

export function loadWebRTCPrimitives(): WebRTCPrimitives | null {
  const g = globalThis as any;
  if (
    g?.RTCPeerConnection &&
    g?.RTCSessionDescription &&
    g?.RTCIceCandidate &&
    g?.navigator?.mediaDevices?.getUserMedia
  ) {
    return {
      RTCPeerConnection: g.RTCPeerConnection,
      RTCSessionDescription: g.RTCSessionDescription,
      RTCIceCandidate: g.RTCIceCandidate,
      MediaStream: g.MediaStream,
      mediaDevices: g.navigator.mediaDevices,
      isNative: false,
    };
  }
  return null;
}
