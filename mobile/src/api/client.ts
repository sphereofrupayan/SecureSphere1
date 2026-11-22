import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { ENV } from "@/constants/env";
import { STORAGE_KEYS } from "@/constants/storage";
import { getSecureItem } from "@/services/secureStorage";
import { ApiError } from "@/types";

declare module "axios" {
  export interface AxiosRequestConfig {
    skipAuth?: boolean;
    skipUnauthorizedHandler?: boolean;
  }
}

type UnauthorizedListener = (reason: string) => void;

let unauthorizedListener: UnauthorizedListener | null = null;

export function setUnauthorizedHandler(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export const apiClient = axios.create({
  baseURL: ENV.apiUrl || undefined,
  timeout: ENV.apiTimeoutMs,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (!config.baseURL && ENV.apiUrl) {
      config.baseURL = ENV.apiUrl;
    }

    if (!config.baseURL) {
      return Promise.reject(
        new ApiError({
          message:
            ENV.configWarning ||
            "Backend API URL is not configured. Check EXPO_PUBLIC_API_URL.",
          code: "MISSING_API_URL",
        })
      );
    }

    if (!config.skipAuth) {
      const token = await getSecureItem(STORAGE_KEYS.AUTH_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  error => Promise.reject(normalizeApiError(error))
);

apiClient.interceptors.response.use(
  response => response,
  (error: unknown) => {
    const normalized = normalizeApiError(error);
    const requestConfig = axios.isAxiosError(error)
      ? (error.config as AxiosRequestConfig | undefined)
      : undefined;

    if (
      normalized.isUnauthorized &&
      !requestConfig?.skipUnauthorizedHandler &&
      unauthorizedListener
    ) {
      unauthorizedListener("Your session has expired. Please sign in again.");
    }

    return Promise.reject(normalized);
  }
);

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{ error?: string; message?: string }>;
    const status = axiosErr.response?.status ?? null;
    const serverMessage =
      axiosErr.response?.data?.error || axiosErr.response?.data?.message;

    if (axiosErr.code === "ECONNABORTED" || axiosErr.code === "ETIMEDOUT") {
      return new ApiError({
        message: "Request timed out. Verify your connection and backend availability.",
        status,
        code: axiosErr.code,
        isTimeout: true,
        isNetworkError: true,
        cause: error,
      });
    }

    if (!axiosErr.response) {
      return new ApiError({
        message: `Cannot reach SecureSphere server at ${ENV.apiUrl || "configured URL"}. Check Wi-Fi and server status.`,
        status: null,
        code: axiosErr.code ?? "NETWORK_ERROR",
        isNetworkError: true,
        cause: error,
      });
    }

    const fallbackByStatus =
      status === 401
        ? "Authentication required or session expired."
        : status === 403
          ? "You do not have permission to perform this action."
          : status === 404
            ? "The requested resource was not found."
            : status && status >= 500
              ? "Server error occurred. Please try again shortly."
              : "Request failed. Please try again.";

    return new ApiError({
      message: serverMessage || fallbackByStatus,
      status,
      code: axiosErr.code ?? null,
      isUnauthorized: status === 401,
      cause: error,
    });
  }

  return new ApiError({
    message: error instanceof Error ? error.message : "An unexpected error occurred.",
    cause: error,
  });
}
