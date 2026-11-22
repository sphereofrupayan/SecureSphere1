import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import type { VoiceIceConfigResponse } from "@/types";

export async function getVoiceIceConfig(): Promise<VoiceIceConfigResponse> {
  const { data } = await apiClient.get<VoiceIceConfigResponse>(
    API_ENDPOINTS.VOICE_ICE_CONFIG
  );
  return data;
}
