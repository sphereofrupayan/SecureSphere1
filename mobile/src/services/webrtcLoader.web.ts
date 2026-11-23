export interface WebRTCPrimitives {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  mediaDevices: {
    getUserMedia: (constraints: Record<string, unknown>) => Promise<any>;
  };
  isNative: boolean;
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
      mediaDevices: g.navigator.mediaDevices,
      isNative: false,
    };
  }
  return null;
}
