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
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rnWebRTC = require("react-native-webrtc");
    if (
      rnWebRTC?.RTCPeerConnection &&
      rnWebRTC?.RTCSessionDescription &&
      rnWebRTC?.RTCIceCandidate &&
      rnWebRTC?.mediaDevices?.getUserMedia
    ) {
      return {
        RTCPeerConnection: rnWebRTC.RTCPeerConnection,
        RTCSessionDescription: rnWebRTC.RTCSessionDescription,
        RTCIceCandidate: rnWebRTC.RTCIceCandidate,
        mediaDevices: rnWebRTC.mediaDevices,
        isNative: true,
      };
    }
  } catch {
    return null;
  }
  return null;
}
