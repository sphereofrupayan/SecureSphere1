import { io, Socket } from "socket.io-client";
import { ENV } from "@/constants/env";

let activeSocket: Socket | null = null;

export function connectSocket(token: string, roomId: string): Socket {
  if (activeSocket) {
    activeSocket.removeAllListeners();
    activeSocket.disconnect();
    activeSocket = null;
  }

  const socket = io(ENV.apiUrl, {
    auth: {
      token,
      roomId,
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1200,
    reconnectionDelayMax: 8000,
    timeout: ENV.apiTimeoutMs,
  });

  activeSocket = socket;
  return socket;
}

export function getActiveSocket(): Socket | null {
  return activeSocket;
}

export function disconnectSocket(): void {
  if (!activeSocket) return;
  activeSocket.removeAllListeners();
  activeSocket.disconnect();
  activeSocket = null;
}
