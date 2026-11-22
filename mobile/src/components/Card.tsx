import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, gradients, radii, shadows, spacing } from "@/theme";

interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "accent";
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({
  children,
  variant = "default",
  style,
  padded = true,
}: CardProps) {
  if (variant === "accent") {
    return (
      <LinearGradient
        colors={["rgba(37, 99, 235, 0.24)", "rgba(14, 165, 233, 0.10)", "rgba(20, 26, 38, 0.92)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.base,
          styles.accentBorder,
          padded && styles.padded,
          shadows.glow,
          style,
        ]}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.base,
        variant === "elevated" ? styles.elevated : styles.default,
        padded && styles.padded,
        shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  default: {
    backgroundColor: "rgba(20, 26, 38, 0.88)",
    borderColor: colors.border,
  },
  elevated: {
    backgroundColor: "rgba(26, 34, 51, 0.92)",
    borderColor: colors.borderStrong,
  },
  accentBorder: {
    borderColor: colors.primaryBorder,
  },
  padded: {
    padding: spacing.lg,
  },
});

export { gradients };
