import React from "react";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoom } from "@/hooks/useRoom";
import { colors } from "@/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { gamesLobby } = useRoom();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 8);

  const pendingInvitesCount = gamesLobby?.pendingInvites?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primaryBright,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Hub",
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? "shield-checkmark" : "shield-checkmark-outline"}
              size={size}
              color={focused ? colors.primaryBright : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={focused ? colors.primaryBright : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="lounge"
        options={{
          title: "Lounge",
          tabBarBadge: pendingInvitesCount > 0 ? pendingInvitesCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.onPrimary,
            fontSize: 10,
          },
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? "game-controller" : "game-controller-outline"}
              size={size}
              color={focused ? colors.primaryBright : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: "Rooms",
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? "layers" : "layers-outline"}
              size={size}
              color={focused ? colors.primaryBright : colors.textMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={size}
              color={focused ? colors.primaryBright : colors.textMuted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
