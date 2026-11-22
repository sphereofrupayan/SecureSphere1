import React, { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card, ScreenContainer, StatusBadge } from "@/components";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import { formatTime } from "@/utils/format";

export default function SavedAndHistoryScreen() {
  const router = useRouter();
  const { savedItems, gamesLobby, clearSavedItems } = useRoom();
  const [tab, setTab] = useState<"saved" | "history">("saved");

  const completedMatches = useMemo(
    () => (gamesLobby?.matches || []).filter(m => m.status === "completed"),
    [gamesLobby?.matches]
  );

  const confirmClearSaved = () => {
    Alert.alert("Clear Saved Messages", "Remove all bookmarked messages from this device?", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => void clearSavedItems() },
    ]);
  };

  return (
    <ScreenContainer padded={false} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>Saved & History</Text>
          <Text style={styles.subtitle}>Bookmarked chat items and finished matches</Text>
        </View>
        {tab === "saved" && savedItems.length > 0 ? (
          <Pressable onPress={confirmClearSaved} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segmentWrap}>
        <Pressable
          onPress={() => setTab("saved")}
          style={[styles.segmentBtn, tab === "saved" && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, tab === "saved" && styles.segmentTextActive]}>
            Saved ({savedItems.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          style={[styles.segmentBtn, tab === "history" && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, tab === "history" && styles.segmentTextActive]}>
            Match History ({completedMatches.length})
          </Text>
        </Pressable>
      </View>

      {tab === "saved" ? (
        <FlatList
          data={savedItems}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="bookmark-outline" size={38} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No saved messages</Text>
              <Text style={styles.emptySub}>
                Long-press any message in Team Chat and tap Save Message to bookmark it here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card style={styles.itemCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.author}>{item.username}</Text>
                <StatusBadge label={item.roomId} tone="neutral" />
              </View>
              <Text style={styles.body}>{item.message}</Text>
              <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={completedMatches}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="trophy-outline" size={38} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No completed matches yet</Text>
              <Text style={styles.emptySub}>
                Finished Chess, Ludo, and Tic Tac Toe matches in this room appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: item.id } })}
            >
              <Card style={styles.itemCard}>
                <View style={styles.rowBetween}>
                  <Text style={styles.author}>{item.gameType.toUpperCase()}</Text>
                  <StatusBadge
                    label={item.winner === "draw" ? "Draw" : `Winner: ${item.winner || "N/A"}`}
                    tone={item.winner === "draw" ? "warning" : "success"}
                  />
                </View>
                <Text style={styles.body}>Players: {item.players.join(" vs ")}</Text>
                <Text style={styles.time}>{formatTime(item.updatedAt)}</Text>
              </Card>
            </Pressable>
          )}
        />
      )}
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
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  clearText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentWrap: {
    flexDirection: "row",
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.text,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm + 2,
  },
  itemCard: {
    gap: 6,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  author: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  body: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  time: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 64,
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
