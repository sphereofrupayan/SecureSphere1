import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/theme";

type BannerTone = "error" | "warning" | "success" | "info";

interface FeedbackBannerProps {
  message: string;
  tone?: BannerTone;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_CONFIG: Record<
  BannerTone,
  {
    bg: string;
    border: string;
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  error: {
    bg: colors.dangerSoft,
    border: colors.dangerBorder,
    color: colors.danger,
    icon: "alert-circle-outline",
  },
  warning: {
    bg: colors.warningSoft,
    border: colors.warningBorder,
    color: colors.warning,
    icon: "warning-outline",
  },
  success: {
    bg: colors.successSoft,
    border: colors.successBorder,
    color: colors.success,
    icon: "checkmark-circle-outline",
  },
  info: {
    bg: colors.primarySoft,
    border: colors.primaryBorder,
    color: colors.primaryBright,
    icon: "information-circle-outline",
  },
};

export function FeedbackBanner({
  message,
  tone = "info",
  onDismiss,
  actionLabel,
  onAction,
}: FeedbackBannerProps) {
  const cfg = TONE_CONFIG[tone];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: cfg.bg, borderColor: cfg.border },
      ]}
      accessibilityRole="alert"
    >
      <Ionicons name={cfg.icon} size={18} color={cfg.color} style={styles.icon} />
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.action, { color: cfg.color }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    flex: 1,
    ...typography.caption,
    fontWeight: "500",
  },
  action: {
    ...typography.caption,
    fontWeight: "700",
  },
});
