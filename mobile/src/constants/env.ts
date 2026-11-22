export type AppEnvironment = "development" | "preview" | "production";

const PRIVATE_OR_LOCAL_HOST_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|::1)$/i;

const PLACEHOLDER_URL_PATTERN = /your-live-securesphere-backend|example\.com/i;

function resolveAppEnv(): AppEnvironment {
  const raw = (process.env.EXPO_PUBLIC_APP_ENV || (__DEV__ ? "development" : "production"))
    .trim()
    .toLowerCase();
  if (raw === "production") return "production";
  if (raw === "preview") return "preview";
  return "development";
}

function normalizeUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

function resolveApiUrl(appEnv: AppEnvironment): {
  apiUrl: string;
  isPlaceholder: boolean;
  validationError: string | null;
} {
  const raw = normalizeUrl(process.env.EXPO_PUBLIC_API_URL || "");

  if (!raw) {
    return {
      apiUrl: "",
      isPlaceholder: false,
      validationError:
        "EXPO_PUBLIC_API_URL is not configured. Set it in .env.development or .env.production.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      apiUrl: raw,
      isPlaceholder: false,
      validationError: `EXPO_PUBLIC_API_URL is not a valid URL: "${raw}"`,
    };
  }

  const isPlaceholder = PLACEHOLDER_URL_PATTERN.test(parsed.hostname);

  if (appEnv === "production") {
    if (parsed.protocol !== "https:") {
      throw new Error(
        `[SecureSphere Env] Production builds require an HTTPS EXPO_PUBLIC_API_URL. Received: "${raw}"`
      );
    }
    if (PRIVATE_OR_LOCAL_HOST_PATTERN.test(parsed.hostname)) {
      throw new Error(
        `[SecureSphere Env] Production builds cannot target localhost or private LAN addresses. Received: "${raw}"`
      );
    }
  }

  return {
    apiUrl: raw,
    isPlaceholder,
    validationError: isPlaceholder
      ? "Production backend URL is still a placeholder. Update EXPO_PUBLIC_API_URL in .env.production before releasing."
      : null,
  };
}

function resolveTimeoutMs(): number {
  const parsed = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 3000 && parsed <= 60000) {
    return parsed;
  }
  return 15000;
}

const appEnv = resolveAppEnv();
const urlResolution = resolveApiUrl(appEnv);

export const ENV = Object.freeze({
  appEnv,
  isDev: appEnv === "development",
  isPreview: appEnv === "preview",
  isProduction: appEnv === "production",
  apiUrl: urlResolution.apiUrl,
  isPlaceholderApiUrl: urlResolution.isPlaceholder,
  configWarning: urlResolution.validationError,
  apiTimeoutMs: resolveTimeoutMs(),
  defaultRoomId: "MAIN",
});
