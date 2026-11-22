import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuth } from "./useAuth";

/**
 * Enforces authentication boundaries across Expo Router route groups.
 * Unauthenticated users are routed to /(auth)/login; authenticated users
 * leaving /(auth) are routed to /(tabs).
 */
export function useProtectedRoute(): void {
  const { isAuthenticated, isHydrating } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isHydrating) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isHydrating, router, segments]);
}
