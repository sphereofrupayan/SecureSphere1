import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { apiClient } from "./client";
import { API_ENDPOINTS } from "./endpoints";
import { ENV } from "@/constants/env";
import { STORAGE_KEYS } from "@/constants/storage";
import { getSecureItem } from "@/services/secureStorage";
import { ApiError } from "@/types";
import type { MediaAttachment } from "@/types";

export interface UploadMediaInput {
  roomId: string;
  uri: string;
  fileName: string;
  mimeType: string;
  onProgress?: (progress: number) => void;
}

export async function uploadRoomMedia(input: UploadMediaInput): Promise<MediaAttachment> {
  const token = await getSecureItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) {
    throw new ApiError({
      message: "Authentication required to upload files.",
      status: 401,
      isUnauthorized: true,
    });
  }

  const endpoint = `${ENV.apiUrl}${API_ENDPOINTS.roomMediaUpload(input.roomId)}`;
  const fileResponse = await fetch(input.uri);
  const blob = await fileResponse.blob();

  return new Promise<MediaAttachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    xhr.timeout = 60000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", input.mimeType || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(input.fileName || "attachment"));
    xhr.setRequestHeader("x-mime-type", input.mimeType || "application/octet-stream");

    if (xhr.upload && input.onProgress) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && event.total > 0) {
          input.onProgress?.(Math.min(1, event.loaded / event.total));
        }
      };
    }

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || "{}") as {
          media?: MediaAttachment;
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && parsed.media) {
          resolve(parsed.media);
          return;
        }
        reject(
          new ApiError({
            message: parsed.error || "File upload failed.",
            status: xhr.status,
            isUnauthorized: xhr.status === 401,
          })
        );
      } catch {
        reject(
          new ApiError({
            message: `Upload failed with status ${xhr.status}.`,
            status: xhr.status,
          })
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError({
          message: "Network error while uploading file.",
          isNetworkError: true,
        })
      );
    };

    xhr.ontimeout = () => {
      reject(
        new ApiError({
          message: "Upload timed out. Try a smaller file or check your connection.",
          isTimeout: true,
          isNetworkError: true,
        })
      );
    };

    xhr.send(blob);
  });
}

export function getMediaAbsoluteUrl(mediaId: string): string {
  return `${ENV.apiUrl}${API_ENDPOINTS.mediaById(mediaId)}`;
}

export async function fetchMediaTextPreview(mediaId: string): Promise<string> {
  const { data } = await apiClient.get<string>(API_ENDPOINTS.mediaById(mediaId), {
    params: { preview: "1" },
    responseType: "text",
    transformResponse: [raw => raw],
  });
  return typeof data === "string" ? data : String(data ?? "");
}

export async function downloadAndShareAuthenticatedFile(
  endpointPath: string,
  fileName: string,
  mimeType?: string
): Promise<string> {
  const token = await getSecureItem(STORAGE_KEYS.AUTH_TOKEN);
  if (!token) {
    throw new ApiError({
      message: "Authentication required to download files.",
      status: 401,
      isUnauthorized: true,
    });
  }

  const fullUrl = endpointPath.startsWith("http")
    ? endpointPath
    : `${ENV.apiUrl}${endpointPath}`;

  if (Platform.OS === "web") {
    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError({ message: `Download failed (${res.status}).`, status: res.status });
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return fileName;
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_") || "securesphere-file";
  const targetFile = new File(Paths.cache, safeName);
  const downloaded = await File.downloadFileAsync(fullUrl, targetFile, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloaded.uri, {
      mimeType,
      dialogTitle: fileName,
    });
  }

  return downloaded.uri;
}
