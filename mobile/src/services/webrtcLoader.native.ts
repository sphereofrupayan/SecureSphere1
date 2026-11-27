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

let lastWebRTCLoadError: string | null = null;

export function getWebRTCLoadError(): string | null {
  return lastWebRTCLoadError;
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
      lastWebRTCLoadError = null;
      return {
        RTCPeerConnection: rnWebRTC.RTCPeerConnection,
        RTCSessionDescription: rnWebRTC.RTCSessionDescription,
        RTCIceCandidate: rnWebRTC.RTCIceCandidate,
        MediaStream: rnWebRTC.MediaStream,
        mediaDevices: rnWebRTC.mediaDevices,
        isNative: true,
      };
    }
    lastWebRTCLoadError = "react-native-webrtc loaded without RTCPeerConnection primitives.";
  } catch (err: any) {
    lastWebRTCLoadError = err?.message || "WebRTC native module is unavailable in this runtime.";
    return null;
  }
  return null;
}
