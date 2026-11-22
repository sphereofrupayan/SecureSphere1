import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { AmbientBackdrop } from "./motion/AmbientBackdrop";
import { colors, gradients, spacing } from "@/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
  ambient?: boolean;
  maxWidth?: number;
}

export function ScreenContainer({
  children,
  scroll = false,
  keyboardAware = false,
  edges = ["top", "left", "right"],
  contentStyle,
  padded = true,
  ambient = true,
  maxWidth,
}: ScreenContainerProps) {
  const paddingStyle = padded ? styles.padded : undefined;
  const widthStyle = maxWidth ? { maxWidth, width: "100%" as const, alignSelf: "center" as const } : undefined;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, paddingStyle, widthStyle, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, paddingStyle, widthStyle, contentStyle]}>{children}</View>
  );

  return (
    <LinearGradient colors={gradients.background} style={styles.flex}>
      {ambient ? <AmbientBackdrop /> : null}
      <SafeAreaView style={styles.flex} edges={edges}>
        {keyboardAware ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            {body}
          </KeyboardAvoidingView>
        ) : (
          body
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "transparent",
  },
  padded: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
  },
});

export { colors };
