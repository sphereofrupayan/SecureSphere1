import React, { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StartupSplash } from "@/components";
import { AuthProvider } from "@/context/AuthContext";
import { RoomProvider } from "@/context/RoomContext";
import { useAuth } from "@/hooks/useAuth";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function RootNavigationGate() {
  const { isHydrating } = useAuth();
  useProtectedRoute();

  useEffect(() => {
    if (!isHydrating) {
      void SplashScreen.hideAsync();
    }
  }, [isHydrating]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen
          name="gemini"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="media-viewer"
          options={{ presentation: "modal", animation: "fade" }}
        />
        <Stack.Screen name="whiteboard" />
        <Stack.Screen name="voice" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="game/[id]" />
      </Stack>
      <StartupSplash isReady={!isHydrating} />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RoomProvider>
            <StatusBar style="light" />
            <RootNavigationGate />
          </RoomProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
