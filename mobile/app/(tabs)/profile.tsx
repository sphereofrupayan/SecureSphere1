import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Button,
  Card,
  FeedbackBanner,
  ScreenContainer,
  StatusBadge,
} from "@/components";
import { ENV } from "@/constants/env";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { checkForOtaUpdateSafely, getUpdateStatusInfo } from "@/services/updates";
import { colors, radii, spacing, typography } from "@/theme";
import { getInitials } from "@/utils/format";
import { confirmAction } from "@/utils/confirm";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, activeRoomId, signOut } = useAuth();
  const { connectionStatus, unreadNotificationsCount, savedItems } = useRoom();

  const [signingOut, setSigningOut] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{
    tone: "info" | "success" | "error";
    text: string;
  } | null>(null);

  const updateInfo = getUpdateStatusInfo();

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateNotice(null);
    try {
      const result = await checkForOtaUpdateSafely();
      setUpdateNotice({
        tone:
          result.status === "error"
            ? "error"
            : result.status === "updated"
              ? "success"
              : "info",
        text: result.message,
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const confirmSignOut = () => {
    confirmAction({
      title: "Sign Out",
      message: "Sign out of SecureSphere on this device?",
      confirmLabel: "Sign Out",
      destructive: true,
      onConfirm: async () => {
        setSigningOut(true);
        try {
          await signOut();
        } finally {
          setSigningOut(false);
        }
      },
    });
  };

  return (
    <ScreenContainer scroll maxWidth={760}>
      <View style={styles.header}>
        <Text style={styles.title}>Account & Security</Text>
        <Text style={styles.subtitle}>Session security, tools, admin access, and updates.</Text>
      </View>

      <Card variant="elevated" style={styles.cardGap}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.username)}</Text>
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.username}>{user?.username || "User"}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge
                label={user?.isAdmin ? "Administrator" : "Member"}
                tone={user?.isAdmin ? "primary" : "neutral"}
              />
              <StatusBadge
                label={connectionStatus === "connected" ? "Connected" : "Offline"}
                tone={connectionStatus === "connected" ? "success" : "danger"}
                showDot
              />
            </View>
          </View>
        </View>
      </Card>

      {/* Navigation Shortcuts */}
      <Card style={styles.cardGap}>
        <Text style={styles.sectionHeading}>Workspace</Text>
        <View style={styles.navList}>
          <NavRow
            icon="notifications-outline"
            iconColor={colors.primaryBright}
            label="Notifications"
            meta={unreadNotificationsCount > 0 ? `${unreadNotificationsCount} unread` : "All caught up"}
            onPress={() => router.push("/notifications")}
          />
          <NavRow
            icon="bookmark-outline"
            iconColor={colors.warning}
            label="Saved & Match History"
            meta={`${savedItems.length} saved`}
            onPress={() => router.push("/saved")}
          />
          <NavRow
            icon="sparkles-outline"
            iconColor="#A78BFA"
            label="Gemini AI Assistant"
            meta="Live room Q&A"
            onPress={() => router.push("/gemini")}
          />
          {user?.isAdmin ? (
            <NavRow
              icon="shield-outline"
              iconColor={colors.success}
              label="Admin Console"
              meta="Users & CSV/PDF Exports"
              onPress={() => router.push("/admin")}
            />
          ) : null}
        </View>
      </Card>

      <Card style={styles.cardGap}>
        <Text style={styles.sectionHeading}>Environment & Security</Text>
        <View style={styles.infoList}>
          <InfoRow label="Active Room" value={activeRoomId} />
          <InfoRow label="Environment" value={ENV.appEnv.toUpperCase()} />
          <InfoRow label="Backend Endpoint" value={ENV.apiUrl || "Not configured"} />
          <InfoRow label="Token Storage" value="Android Keystore / SecureStore" />
        </View>
      </Card>

      <Card style={styles.cardGap}>
        <Text style={styles.sectionHeading}>App Updates (EAS Update)</Text>
        <View style={styles.infoList}>
          <InfoRow label="Package ID" value="com.rupayan.securesphere" />
          <InfoRow label="Runtime Version" value={updateInfo.runtimeVersion} />
          <InfoRow label="Update Channel" value={updateInfo.channel} />
        </View>

        {updateNotice ? (
          <View style={styles.updateBanner}>
            <FeedbackBanner
              tone={updateNotice.tone}
              message={updateNotice.text}
              onDismiss={() => setUpdateNotice(null)}
            />
          </View>
        ) : null}

        <View style={styles.updateBtnWrap}>
          <Button
            label="Check for Updates"
            variant="secondary"
            loading={checkingUpdate}
            onPress={handleCheckUpdates}
            icon={<Ionicons name="cloud-download-outline" size={18} color={colors.text} />}
          />
        </View>
      </Card>

      <Button
        label="Sign Out"
        variant="danger"
        loading={signingOut}
        onPress={confirmSignOut}
        icon={<Ionicons name="log-out-outline" size={18} color={colors.danger} />}
      />
    </ScreenContainer>
  );
}

function NavRow({
  icon,
  iconColor,
  label,
  meta,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <View style={styles.flexOne}>
        <Text style={styles.navLabel}>{label}</Text>
        <Text style={styles.navMeta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardGap: {
    marginBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.title,
    color: colors.primaryBright,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  username: {
    ...typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  sectionHeading: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  navList: {
    gap: spacing.xs,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  navRowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  navLabel: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  navMeta: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  infoList: {
    gap: spacing.sm + 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
    textAlign: "right",
  },
  updateBanner: {
    marginTop: spacing.md,
  },
  updateBtnWrap: {
    marginTop: spacing.md,
  },
});
