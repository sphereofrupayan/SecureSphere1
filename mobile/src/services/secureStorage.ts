import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// In-memory cache so request interceptors don't hit native bridge on every request
const memoryCache = new Map<string, string | null>();

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }

  try {
    if (await isSecureStoreAvailable()) {
      const value = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
      memoryCache.set(key, value);
      return value;
    }

    if (Platform.OS === "web" && typeof window !== "undefined" && window.sessionStorage) {
      const value = window.sessionStorage.getItem(key);
      memoryCache.set(key, value);
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  memoryCache.set(key, value);

  try {
    if (await isSecureStoreAvailable()) {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
      return;
    }

    if (Platform.OS === "web" && typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn(`[SecureStorage] Failed to persist key "${key}"`, error);
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  memoryCache.delete(key);

  try {
    if (await isSecureStoreAvailable()) {
      await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
      return;
    }

    if (Platform.OS === "web" && typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn(`[SecureStorage] Failed to delete key "${key}"`, error);
  }
}

export function clearMemoryCache(): void {
  memoryCache.clear();
}
