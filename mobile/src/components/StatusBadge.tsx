import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PulseBeacon } from "./motion/PulseBeacon";
import { colors, radii, spacing, typography } from "@/theme";

type BadgeTone = "primary" | "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  showDot?: boolean;
}

const TONE_MAP: Record<
  BadgeTone,
  { bg: string; border: string; text: string; dot: string }
> = {
  primary: {
    bg: colors.primarySoft,
    border: colors.primaryBorder,
    text: colors.primaryBright,
    dot: colors.primaryBright,
  },
  success: {
    bg: colors.successSoft,
    border: colors.successBorder,
    text: colors.success,
    dot: colors.success,
  },
  warning: {
    bg: colors.warningSoft,
    border: colors.warningBorder,
    text: colors.warning,
    dot: colors.warning,
  },
  danger: {
    bg: colors.dangerSoft,
    border: colors.dangerBorder,
    text: colors.danger,
    dot: colors.danger,
  },
  neutral: {
    bg: "rgba(148, 163, 184, 0.12)",
    border: colors.border,
    text: colors.textSecondary,
    dot: colors.textSecondary,
  },
};

export function StatusBadge({
  label,
  tone = "neutral",
  showDot = false,
}: StatusBadgeProps) {
  const palette = TONE_MAP[tone];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      {showDot ? <PulseBeacon color={palette.dot} size={7} /> : null}
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: spacing.sm + 3,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  label: {
    ...typography.label,
    fontSize: 11,
  },
});
