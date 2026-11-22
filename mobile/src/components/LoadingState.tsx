import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BrandShield } from "./BrandShield";
import { colors, spacing, typography } from "@/theme";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Securing your session..." }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <BrandShield size={56} />
      <ActivityIndicator size="small" color={colors.primaryBright} style={styles.spinner} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  spinner: {
    marginTop: spacing.lg,
  },
  text: {
    marginTop: spacing.md,
    ...typography.caption,
    color: colors.textSecondary,
  },
});
