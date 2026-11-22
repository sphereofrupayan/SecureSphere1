export interface AuthUser {
  username: string;
  isAdmin: boolean;
}

export interface ServerConfigResponse {
  roomId: string;
  roomName: string;
  roomOpenedAt: number | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  isAdmin: boolean;
}

export interface CreateRoomAuthRequest {
  username: string;
  password?: string;
  roomName?: string;
}

export interface CreateRoomAuthResponse {
  token: string;
  username: string;
  isAdmin: boolean;
  roomId: string;
  roomName: string;
  createdBy: string;
  inviteUrl: string;
}

export interface EnterRoomAuthRequest {
  roomId: string;
  username: string;
  password?: string;
}

export interface EnterRoomAuthResponse {
  token: string;
  username: string;
  isAdmin: boolean;
  roomId: string;
  roomName: string;
  createdBy: string;
}

export interface MeResponse {
  username: string;
  isAdmin: boolean;
}
