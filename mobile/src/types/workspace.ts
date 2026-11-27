export type WhiteboardTool =
  | "pen"
  | "highlighter"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "diamond"
  | "text"
  | "sticky"
  | "eraser";

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardElement {
  id: string;
  type: WhiteboardTool | "image";
  color?: string;
  size?: number;
  points?: WhiteboardPoint[];
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  w?: number;
  h?: number;
  text?: string;
  src?: string;
  mediaId?: string;
  author?: string;
  updatedAt?: number;
}

export interface WhiteboardCursor {
  socketId: string;
  username: string;
  color: string;
  x: number;
  y: number;
  tool: string;
  updatedAt: number;
}

export interface WhiteboardState {
  roomId: string;
  elements: WhiteboardElement[];
  canClear: boolean;
  memberDrawAllowed: boolean;
  cursors: WhiteboardCursor[];
}

export interface VoiceParticipant {
  socketId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  speaking?: boolean;
  joinedAt: number;
}

export interface VoiceChannel {
  id: string;
  roomId: string;
  name: string;
  createdBy: string;
  isDefault: boolean;
  createdAt: number;
  participants: VoiceParticipant[];
}

export interface VoiceChannelsPayload {
  roomId: string;
  channels: VoiceChannel[];
}

export interface VoiceIceConfigResponse {
  ok: boolean;
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  hasTurn: boolean;
  stunCount?: number;
  turnCount?: number;
  provider?: string;
}

export interface UserNotification {
  id: string;
  roomId: string;
  recipientUsername: string;
  type: string;
  title: string;
  message: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown>;
  isRead: boolean;
  createdAt: number;
}

export interface NotificationsState {
  notifications: UserNotification[];
  unreadCount: number;
}

export interface AdminUserRecord {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
}

export interface GeminiStatusResponse {
  ok: boolean;
  configured: boolean;
  model: string;
  authenticated: boolean;
  username: string | null;
}

export interface GeminiContextStats {
  roomId?: string;
  roomName?: string;
  onlineCount?: number;
  chatCount?: number;
  mediaCount?: number;
  unreadNotifications?: number;
  selectedCount?: number;
}

export interface GeminiContextSummaryResponse {
  ok: boolean;
  configured: boolean;
  model: string;
  stats: GeminiContextStats;
}

export interface GeminiChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  model?: string;
  isStreaming?: boolean;
  isError?: boolean;
  createdAt: number;
}

export interface SavedChatItem {
  id: string;
  roomId: string;
  username: string;
  message: string;
  createdAt: number;
  savedAt: number;
}
