import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import type {
  CollaborationResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomState,
} from "@/types";

export async function getRoomState(roomId: string): Promise<RoomState> {
  const { data } = await apiClient.get<RoomState>(API_ENDPOINTS.STATE, {
    params: { roomId },
  });
  return data;
}

export async function getRoomCollaboration(roomId: string): Promise<CollaborationResponse> {
  const { data } = await apiClient.get<CollaborationResponse>(
    API_ENDPOINTS.roomCollaboration(roomId)
  );
  return data;
}

export async function createRoom(payload: CreateRoomRequest): Promise<CreateRoomResponse> {
  const { data } = await apiClient.post<CreateRoomResponse>(API_ENDPOINTS.ROOMS, payload);
  return data;
}

export async function joinRoom(payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  const { data } = await apiClient.post<JoinRoomResponse>(API_ENDPOINTS.ROOMS_JOIN, payload);
  return data;
}
