export interface RoomPluginStates {
  chatgpt: boolean;
  claude: boolean;
  gemini: boolean;
  youtube: boolean;
  games: boolean;
}

export interface QueueTrack {
  id: string;
  videoId: string;
  title?: string;
  addedBy?: string;
  addedAt?: number;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  owner: string;
  allowMemberPluginToggle: boolean;
  activeAiPlatform: string | null;
  whiteboardMemberDraw: boolean;
  plugins: RoomPluginStates;
  videoId: string | null;
  playing: boolean;
  position: number;
  changedBy: string | null;
  serverTime: number;
  queue: QueueTrack[];
}

export interface RoomMember {
  username: string;
  isAdmin: boolean;
  isOwner: boolean;
}

export interface PresencePayload {
  roomId: string;
  owner: string;
  count: number;
  participants: string[];
  members: RoomMember[];
}

export interface MediaAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  mediaKind: string;
  fileSize: number;
  uploaderUsername: string;
  url: string;
}

export interface ChatReplyRef {
  id: string;
  username: string;
  message: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: number | null;
  username: string;
  message: string;
  messageType: string;
  targetPlatform: string | null;
  mediaId: string | null;
  media: MediaAttachment | null;
  reactions: Record<string, string[]>;
  createdAt: number;
  replyToId: string | null;
  replyToUsername: string | null;
  replyToMessage: string | null;
  replyTo: ChatReplyRef | null;
}

export interface CreateRoomRequest {
  name?: string;
}

export interface CreateRoomResponse {
  roomId: string;
  roomName: string;
  createdBy: string;
  inviteUrl: string;
}

export interface JoinRoomRequest {
  roomId: string;
}

export interface JoinRoomResponse {
  roomId: string;
  roomName: string;
  createdBy: string;
  createdAt: string;
  onlineCount: number;
  participants: string[];
}

export interface CollaborationResponse {
  state: RoomState;
  chatHistory: ChatMessage[];
  aiSessionState: unknown;
  whiteboardState: unknown;
}

export type SocketConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
