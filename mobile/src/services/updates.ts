import Constants from "expo-constants";
import * as Updates from "expo-updates";

export interface UpdateStatusInfo {
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
  channel: string;
  runtimeVersion: string;
  updateId: string | null;
}

export function getUpdateStatusInfo(): UpdateStatusInfo {
  const isEnabled = Boolean(Updates.isEnabled);
  return {
    isEnabled,
    isEmbeddedLaunch: isEnabled ? Updates.isEmbeddedLaunch : true,
    channel: isEnabled && Updates.channel ? Updates.channel : "local-dev",
    runtimeVersion:
      (isEnabled && Updates.runtimeVersion) ||
      Constants.expoConfig?.version ||
      "1.0.0",
    updateId: isEnabled ? Updates.updateId ?? null : null,
  };
}

export async function checkForOtaUpdateSafely(): Promise<{
  status: "unsupported" | "up-to-date" | "updated" | "error";
  message: string;
}> {
  if (__DEV__ || !Updates.isEnabled) {
    return {
      status: "unsupported",
      message: "OTA updates are active in EAS preview and production builds.",
    };
  }

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return {
        status: "up-to-date",
        message: "You are running the latest SecureSphere update.",
      };
    }

    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return {
      status: "updated",
      message: "Update downloaded. Reloading SecureSphere...",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to check for updates right now.",
    };
  }
}
