import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import type {
  CreateRoomAuthRequest,
  CreateRoomAuthResponse,
  EnterRoomAuthRequest,
  EnterRoomAuthResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  ServerConfigResponse,
} from "@/types";

export async function getServerConfig(): Promise<ServerConfigResponse> {
  const { data } = await apiClient.get<ServerConfigResponse>(API_ENDPOINTS.CONFIG, {
    skipAuth: true,
    skipUnauthorizedHandler: true,
  });
  return data;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>(API_ENDPOINTS.LOGIN, payload, {
    skipAuth: true,
    skipUnauthorizedHandler: true,
  });
  return data;
}

export async function createRoomWithAuth(
  payload: CreateRoomAuthRequest
): Promise<CreateRoomAuthResponse> {
  const { data } = await apiClient.post<CreateRoomAuthResponse>(
    API_ENDPOINTS.AUTH_CREATE_ROOM,
    payload,
    {
      skipAuth: true,
      skipUnauthorizedHandler: true,
    }
  );
  return data;
}

export async function enterRoomWithAuth(
  payload: EnterRoomAuthRequest
): Promise<EnterRoomAuthResponse> {
  const { data } = await apiClient.post<EnterRoomAuthResponse>(
    API_ENDPOINTS.AUTH_ENTER_ROOM,
    payload,
    {
      skipAuth: true,
      skipUnauthorizedHandler: true,
    }
  );
  return data;
}

export async function getCurrentUser(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>(API_ENDPOINTS.ME, {
    skipUnauthorizedHandler: true,
  });
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post(
    API_ENDPOINTS.LOGOUT,
    {},
    {
      skipUnauthorizedHandler: true,
    }
  );
}
