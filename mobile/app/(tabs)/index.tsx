import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import {
  BrandShield,
  Card,
  FadeInView,
  FeedbackBanner,
  FloatingOrb,
  ScreenContainer,
  StatusBadge,
  TypewriterText,
} from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import { getInitials } from "@/utils/format";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HubScreen() {
  const router = useRouter();
  const { user, activeRoomId } = useAuth();
  const {
    roomState,
    presenceCount,
    members,
    chatMessages,
    voiceChannels,
    activeVoiceChannelId,
    unreadNotificationsCount,
    connectionStatus,
    lastError,
    isRoomAdminOrOwner,
    refreshRoom,
    setPluginState,
  } = useRoom();

  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [togglingPlugin, setTogglingPlugin] = useState<"youtube" | "games" | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshRoom();
    } finally {
      setRefreshing(false);
    }
  }, [refreshRoom]);

  const handleCopyRoomCode = async () => {
    const code = roomState?.roomId || activeRoomId;
    await Clipboard.setStringAsync(code);
    setBanner({ tone: "success", text: `Room code ${code} copied to clipboard.` });
    setTimeout(() => setBanner(null), 2200);
  };

  const handleTogglePlugin = async (pluginId: "youtube" | "games", enabled: boolean) => {
    setTogglingPlugin(pluginId);
    const res = await setPluginState(pluginId, enabled);
    setTogglingPlugin(null);
    if (!res.ok) {
      setBanner({ tone: "error", text: res.error || "Unable to update plugin state." });
    }
  };

  const roomName = roomState?.roomName || "Friends Room";
  const roomId = roomState?.roomId || activeRoomId;
  const owner = roomState?.owner || "System";

  const totalVoiceUsers = voiceChannels.reduce((acc, ch) => acc + ch.participants.length, 0);

  const connectionTone =
    connectionStatus === "connected"
      ? "success"
      : connectionStatus === "connecting"
        ? "primary"
        : "danger";

  const connectionLabel =
    connectionStatus === "connected"
      ? "Live"
      : connectionStatus === "connecting"
        ? "Syncing..."
        : "Offline";

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryBright}
            colors={[colors.primaryBright]}
          />
        }
      >
        {/* Top bar */}
        <FadeInView delay={0} offsetY={-6}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <FloatingOrb distance={2.5} duration={2600}>
                <BrandShield size={38} />
              </FloatingOrb>
              <View>
                <Text style={styles.greeting}>SecureSphere</Text>
                <Text style={styles.username}>{user?.username || "Member"}</Text>
              </View>
            </View>

            <View style={styles.topActions}>
              <Pressable
                onPress={() => router.push("/gemini")}
                style={({ pressed }) => [styles.geminiPill, pressed && styles.pressed]}
                accessibilityLabel="Open Gemini AI Assistant"
              >
                <Ionicons name="sparkles" size={15} color={colors.cyan} />
                <Text style={styles.geminiPillText}>Gemini</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/notifications")}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                accessibilityLabel="Open notifications"
              >
                <Ionicons name="notifications-outline" size={20} color={colors.text} />
                {unreadNotificationsCount > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        </FadeInView>

        {lastError ? (
          <FeedbackBanner
            tone="error"
            message={lastError}
            actionLabel="Retry"
            onAction={onRefresh}
          />
        ) : null}

        {banner ? (
          <FeedbackBanner
            tone={banner.tone}
            message={banner.text}
            onDismiss={() => setBanner(null)}
          />
        ) : null}

        {/* Active Room Hero */}
        <FadeInView delay={80}>
          <Card variant="accent" style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.heroTitleCol}>
                <View style={styles.eyebrowRow}>
                  <Text style={styles.eyebrow}>ACTIVE ROOM</Text>
                  <StatusBadge label={connectionLabel} tone={connectionTone} showDot />
                </View>
                <Text style={styles.roomName}>{roomName}</Text>
                <TypewriterText
                  phrases={[
                    "Real-time sync active across web & mobile",
                    "Encrypted session · Low-latency Socket.IO",
                    "Tap any module below to collaborate",
                  ]}
                  typingSpeedMs={40}
                  deletingSpeedMs={20}
                  pauseMs={2400}
                  style={styles.heroTagline}
                />
              </View>
              <Pressable
                onPress={handleCopyRoomCode}
                style={({ pressed }) => [styles.codePill, pressed && styles.pressed]}
                accessibilityLabel="Copy Room ID"
              >
                <Text style={styles.codeText}>{roomId}</Text>
                <Ionicons name="copy-outline" size={14} color={colors.primaryBright} />
              </Pressable>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{presenceCount}</Text>
                <Text style={styles.statLabel}>Online</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{chatMessages.length}</Text>
                <Text style={styles.statLabel}>Messages</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{totalVoiceUsers}</Text>
                <Text style={styles.statLabel}>In Voice</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {owner}
                </Text>
                <Text style={styles.statLabel}>Owner</Text>
              </View>
            </View>
          </Card>
        </FadeInView>

        {/* Quick Workspace Launchers */}
        <FadeInView delay={150}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Workspace Tools</Text>
            <Text style={styles.sectionMeta}>Native mobile modules</Text>
          </View>
        </FadeInView>

        <FadeInView delay={200}>
          <View style={styles.toolsGrid}>
            <ToolTile
              icon="brush-outline"
              iconColor={colors.primaryBright}
              gradientColors={["rgba(59, 130, 246, 0.22)", "rgba(20, 26, 38, 0.92)"]}
              title="Whiteboard"
              subtitle="Live vector canvas"
              onPress={() => router.push("/whiteboard")}
            />
            <ToolTile
              icon="mic-outline"
              iconColor={activeVoiceChannelId ? colors.success : colors.cyan}
              gradientColors={["rgba(14, 165, 233, 0.20)", "rgba(20, 26, 38, 0.92)"]}
              title="Voice Rooms"
              subtitle={
                activeVoiceChannelId
                  ? "Connected"
                  : `${voiceChannels.length} channel${voiceChannels.length === 1 ? "" : "s"}`
              }
              onPress={() => router.push("/voice")}
            />
            <ToolTile
              icon="sparkles-outline"
              iconColor="#A78BFA"
              gradientColors={["rgba(139, 92, 246, 0.22)", "rgba(20, 26, 38, 0.92)"]}
              title="Gemini AI"
              subtitle="Room summaries & Q&A"
              onPress={() => router.push("/gemini")}
            />
            <ToolTile
              icon="bookmark-outline"
              iconColor={colors.warning}
              gradientColors={["rgba(245, 158, 11, 0.18)", "rgba(20, 26, 38, 0.92)"]}
              title="Saved & History"
              subtitle="Bookmarks & matches"
              onPress={() => router.push("/saved")}
            />
          </View>
        </FadeInView>

        {/* Room Apps & Integrations */}
        <FadeInView delay={260} style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Room Apps</Text>
            <Text style={styles.sectionMeta}>
              {isRoomAdminOrOwner ? "Admin controls active" : "Managed by owner"}
            </Text>
          </View>

          <Card style={styles.pluginsCard}>
            <View style={styles.pluginRow}>
              <View style={[styles.pluginIcon, { backgroundColor: "rgba(239, 68, 68, 0.16)" }]}>
                <Ionicons name="logo-youtube" size={20} color="#EF4444" />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.pluginTitle}>YouTube Shared Queue</Text>
                <Text style={styles.pluginDesc}>
                  {roomState?.plugins.youtube
                    ? `${roomState.queue.length} queued · Open Lounge to control`
                    : "Disabled in this room"}
                </Text>
              </View>
              {isRoomAdminOrOwner ? (
                <Switch
                  value={Boolean(roomState?.plugins.youtube)}
                  disabled={togglingPlugin === "youtube"}
                  onValueChange={val => void handleTogglePlugin("youtube", val)}
                  trackColor={{ false: colors.surfaceInset, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              ) : (
                <StatusBadge
                  label={roomState?.plugins.youtube ? "On" : "Off"}
                  tone={roomState?.plugins.youtube ? "success" : "neutral"}
                />
              )}
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.pluginRow}>
              <View style={[styles.pluginIcon, { backgroundColor: colors.cyanSoft }]}>
                <Ionicons name="game-controller-outline" size={20} color={colors.cyan} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.pluginTitle}>Multiplayer Games Lounge</Text>
                <Text style={styles.pluginDesc}>
                  {roomState?.plugins.games
                    ? "Chess, Ludo & Tic Tac Toe active"
                    : "Disabled in this room"}
                </Text>
              </View>
              {isRoomAdminOrOwner ? (
                <Switch
                  value={Boolean(roomState?.plugins.games)}
                  disabled={togglingPlugin === "games"}
                  onValueChange={val => void handleTogglePlugin("games", val)}
                  trackColor={{ false: colors.surfaceInset, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              ) : (
                <StatusBadge
                  label={roomState?.plugins.games ? "On" : "Off"}
                  tone={roomState?.plugins.games ? "success" : "neutral"}
                />
              )}
            </View>
          </Card>
        </FadeInView>

        {/* Online Members */}
        <FadeInView delay={320} style={styles.sectionGap}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Online in {roomId}</Text>
            <Text style={styles.sectionMeta}>{members.length} active</Text>
          </View>

          <Card>
            {members.length === 0 ? (
              <Text style={styles.emptyText}>Connecting to live room presence...</Text>
            ) : (
              <View style={styles.membersWrap}>
                {members.map(member => (
                  <View key={member.username} style={styles.memberRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getInitials(member.username)}</Text>
                    </View>
                    <View style={styles.flexOne}>
                      <Text style={styles.memberName}>{member.username}</Text>
                      <Text style={styles.memberRole}>
                        {member.isOwner
                          ? "Room Owner"
                          : member.isAdmin
                            ? "Administrator"
                            : "Member"}
                      </Text>
                    </View>
                    <View style={styles.onlineDot} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </FadeInView>
      </ScrollView>
    </ScreenContainer>
  );
}

function ToolTile({
  icon,
  iconColor,
  gradientColors,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  gradientColors: readonly [string, string];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 16, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 320 });
      }}
      style={[styles.toolTileWrap, animStyle]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.toolTile}
      >
        <View style={[styles.toolIconWrap, { borderColor: `${iconColor}44` }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <Text style={styles.toolTitle}>{title}</Text>
        <Text style={styles.toolSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  greeting: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  username: {
    ...typography.heading,
    color: colors.text,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  geminiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  geminiPillText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.dangerSolid,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.82,
  },
  heroCard: {
    gap: spacing.md,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.label,
    fontSize: 10,
    color: colors.primaryBright,
  },
  roomName: {
    ...typography.title,
    color: colors.text,
  },
  heroTagline: {
    ...typography.caption,
    fontSize: 12,
    color: colors.cyan,
    marginTop: 2,
  },
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: "rgba(11, 14, 20, 0.72)",
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  codeText: {
    ...typography.mono,
    fontSize: 12,
    color: colors.primaryBright,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(11, 14, 20, 0.58)",
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  statValue: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  sectionGap: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  sectionMeta: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  toolTileWrap: {
    width: "47.5%",
  },
  toolTile: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md + 2,
    gap: 6,
  },
  toolIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: "rgba(11, 14, 20, 0.6)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  toolTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  toolSub: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pluginsCard: {
    gap: spacing.md,
  },
  pluginRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pluginIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  pluginTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  pluginDesc: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  flexOne: {
    flex: 1,
  },
  membersWrap: {
    gap: spacing.md,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontWeight: "700",
  },
  memberName: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  memberRole: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
});
