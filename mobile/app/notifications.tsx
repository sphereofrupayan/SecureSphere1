import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card, ScreenContainer, StatusBadge } from "@/components";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import type { UserNotification } from "@/types";
import { formatTime } from "@/utils/format";

type NotifFilter = "all" | "unread" | "games" | "workspace";

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    unreadNotificationsCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useRoom();

  const [filter, setFilter] = useState<NotifFilter>("all");

  const filtered = useMemo(() => {
    return notifications.filter(item => {
      if (filter === "unread") return !item.isRead;
      if (filter === "games") return item.type.startsWith("game") || item.targetType.startsWith("games");
      if (filter === "workspace") {
        return !item.type.startsWith("game") && !item.targetType.startsWith("games");
      }
      return true;
    });
  }, [filter, notifications]);

  const handlePressNotif = async (item: UserNotification) => {
    if (!item.isRead) {
      await markNotificationRead(item.id);
    }
    if (item.targetType === "games_match" && item.targetId) {
      router.push({ pathname: "/game/[id]", params: { id: item.targetId } });
    } else if (item.targetType === "chat") {
      router.push("/(tabs)/chat");
    } else if (item.targetType === "whiteboard") {
      router.push("/whiteboard");
    } else if (item.targetType === "members") {
      router.push("/(tabs)/rooms");
    }
  };

  return (
    <ScreenContainer padded={false} maxWidth={760} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>{unreadNotificationsCount} unread</Text>
        </View>
        {unreadNotificationsCount > 0 ? (
          <Pressable
            onPress={() => void markAllNotificationsRead()}
            style={styles.markAllBtn}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {(
          [
            { id: "all", label: "All" },
            { id: "unread", label: "Unread" },
            { id: "games", label: "Games" },
            { id: "workspace", label: "Room" },
          ] as const
        ).map(tab => (
          <Pressable
            key={tab.id}
            onPress={() => setFilter(tab.id)}
            style={[styles.chip, filter === tab.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === tab.id && styles.chipTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={38} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySub}>
              Room joins, game invites, and mentions appear here in real time.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => void handlePressNotif(item)}>
            <Card variant={item.isRead ? "default" : "elevated"} style={styles.notifCard}>
              <View style={styles.notifHeader}>
                <View style={styles.titleWrap}>
                  {!item.isRead ? <View style={styles.unreadDot} /> : null}
                  <Text style={styles.notifTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
              </View>
              <Text style={styles.notifBody}>{item.message}</Text>
              <View style={styles.footerRow}>
                <StatusBadge label={item.roomId} tone="neutral" />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  markAllText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontSize: 12,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  chipText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primaryBright,
    fontWeight: "600",
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm + 2,
  },
  notifCard: {
    gap: 6,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primaryBright,
  },
  notifTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
    flex: 1,
  },
  timeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  notifBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footerRow: {
    marginTop: 2,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 72,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
});
