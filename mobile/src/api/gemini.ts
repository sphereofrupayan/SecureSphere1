import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import { ENV } from "@/constants/env";
import { STORAGE_KEYS } from "@/constants/storage";
import { getSecureItem } from "@/services/secureStorage";
import type {
  GeminiContextStats,
  GeminiContextSummaryResponse,
  GeminiStatusResponse,
} from "@/types";

export async function getGeminiStatus(): Promise<GeminiStatusResponse> {
  const { data } = await apiClient.get<GeminiStatusResponse>(API_ENDPOINTS.GEMINI_STATUS, {
    skipUnauthorizedHandler: true,
  });
  return data;
}

export async function getGeminiContextSummary(
  roomId: string,
  section = "overview"
): Promise<GeminiContextSummaryResponse> {
  const { data } = await apiClient.get<GeminiContextSummaryResponse>(
    API_ENDPOINTS.GEMINI_CONTEXT_SUMMARY,
    {
      params: { roomId, section, collabTab: "discussion" },
    }
  );
  return data;
}

export interface StreamGeminiOptions {
  prompt: string;
  mode?: string;
  roomId: string;
  activeSection?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  selectedMessageIds?: string[];
  onMeta?: (meta: { model?: string; stats?: GeminiContextStats }) => void;
  onDelta: (text: string) => void;
  onDone: (model?: string) => void;
  onError: (message: string) => void;
}

export interface StreamHandle {
  abort: () => void;
}

/**
 * Progressive SSE streaming over XMLHttpRequest so token-by-token responses
 * work reliably across Android Hermes, iOS, and Web.
 */
export function streamGeminiResponse(options: StreamGeminiOptions): StreamHandle {
  const xhr = new XMLHttpRequest();
  let aborted = false;
  let processedIndex = 0;
  let buffer = "";
  let settled = false;

  const parseChunk = (chunkText: string) => {
    buffer += chunkText;
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const rawJson = line.slice(5).trim();
        if (!rawJson) continue;
        try {
          const event = JSON.parse(rawJson) as {
            type?: string;
            text?: string;
            model?: string;
            message?: string;
            stats?: GeminiContextStats;
          };
          if (event.type === "meta") {
            options.onMeta?.({ model: event.model, stats: event.stats });
          } else if (event.type === "delta" && typeof event.text === "string") {
            options.onDelta(event.text);
          } else if (event.type === "done") {
            settled = true;
            options.onDone(event.model);
          } else if (event.type === "error") {
            settled = true;
            options.onError(event.message || "Gemini could not complete this request.");
          }
        } catch {
          // Ignore incomplete JSON frames
        }
      }
    }
  };

  void (async () => {
    const token = await getSecureItem(STORAGE_KEYS.AUTH_TOKEN);
    if (aborted) return;

    xhr.open("POST", `${ENV.apiUrl}${API_ENDPOINTS.GEMINI_STREAM}`, true);
    xhr.timeout = 60000;
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.onprogress = () => {
      if (aborted) return;
      const fullText = xhr.responseText || "";
      if (fullText.length > processedIndex) {
        const nextSlice = fullText.slice(processedIndex);
        processedIndex = fullText.length;
        parseChunk(nextSlice);
      }
    };

    xhr.onload = () => {
      if (aborted) return;
      const fullText = xhr.responseText || "";
      if (fullText.length > processedIndex) {
        parseChunk(fullText.slice(processedIndex));
        processedIndex = fullText.length;
      }

      if (xhr.status >= 400 && !settled) {
        try {
          const errJson = JSON.parse(fullText) as { error?: string };
          options.onError(errJson.error || `Gemini returned status ${xhr.status}.`);
        } catch {
          options.onError(`Gemini request failed (${xhr.status}).`);
        }
        settled = true;
        return;
      }

      if (!settled) {
        settled = true;
        options.onDone();
      }
    };

    xhr.onerror = () => {
      if (aborted || settled) return;
      settled = true;
      options.onError("Network error while reaching Gemini AI.");
    };

    xhr.ontimeout = () => {
      if (aborted || settled) return;
      settled = true;
      options.onError("Gemini request timed out. Please try again.");
    };

    xhr.send(
      JSON.stringify({
        prompt: options.prompt,
        mode: options.mode || "chat",
        roomId: options.roomId,
        activeSection: options.activeSection || "mobile",
        activeCollabTab: "discussion",
        history: options.history || [],
        selectedMessageIds: options.selectedMessageIds || [],
      })
    );
  })();

  return {
    abort: () => {
      aborted = true;
      try {
        xhr.abort();
      } catch {
        // ignore
      }
    },
  };
}
