import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BrandShield } from "./BrandShield";
import { AmbientBackdrop } from "./motion/AmbientBackdrop";
import { TypewriterText } from "./motion/TypewriterText";
import { colors, radii, spacing, typography } from "@/theme";

interface StartupSplashProps {
  isReady: boolean;
}

export function StartupSplash({ isReady }: StartupSplashProps) {
  const [visible, setVisible] = useState(true);
  const [minElapsed, setMinElapsed] = useState(false);

  const containerOpacity = useSharedValue(1);
  const containerScale = useSharedValue(1);
  const logoScale = useSharedValue(0.68);
  const logoOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(16);
  const ringScale = useSharedValue(0.9);
  const ringOpacity = useSharedValue(0.55);
  const barWidth = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 160 });

    titleOpacity.value = withDelay(240, withTiming(1, { duration: 460 }));
    titleY.value = withDelay(240, withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) }));

    barWidth.value = withDelay(
      260,
      withTiming(1, { duration: 1450, easing: Easing.inOut(Easing.cubic) })
    );

    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.52, { duration: 1500, easing: Easing.out(Easing.ease) }),
        withTiming(0.9, { duration: 0 })
      ),
      -1,
      false
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
        withTiming(0.5, { duration: 0 })
      ),
      -1,
      false
    );

    const timer = setTimeout(() => setMinElapsed(true), 1850);
    return () => clearTimeout(timer);
  }, [barWidth, logoOpacity, logoScale, ringOpacity, ringScale, titleOpacity, titleY]);

  useEffect(() => {
    if (!isReady || !minElapsed) return;
    containerOpacity.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.ease) });
    containerScale.value = withTiming(1.04, { duration: 420, easing: Easing.out(Easing.ease) });
    const hideTimer = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(hideTimer);
  }, [containerOpacity, containerScale, isReady, minElapsed]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: barWidth.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, containerStyle]} pointerEvents="auto">
      <LinearGradient colors={["#070B14", "#0C1425", "#070B14"]} style={styles.overlay}>
        <AmbientBackdrop />
        <View style={styles.center}>
          <View style={styles.logoStage}>
            <Animated.View style={[styles.pulseRing, ringStyle]} />
            <Animated.View style={logoStyle}>
              <BrandShield size={102} />
            </Animated.View>
          </View>

          <Animated.View style={[styles.brandCopy, titleStyle]}>
            <Text style={styles.wordmark}>
              Secure<Text style={styles.wordmarkAccent}>Sphere</Text>
            </Text>
            <View style={styles.taglineBox}>
              <TypewriterText
                phrases={["Private · Real-Time · Encrypted"]}
                loop={false}
                typingSpeedMs={36}
                style={styles.tagline}
              />
            </View>
          </Animated.View>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, barStyle]} />
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  logoStage: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 112,
    height: 112,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: colors.cyan,
  },
  brandCopy: {
    alignItems: "center",
    gap: spacing.xs + 2,
  },
  wordmark: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: "#FFFFFF",
  },
  wordmarkAccent: {
    color: colors.cyan,
  },
  taglineBox: {
    minHeight: 22,
    justifyContent: "center",
  },
  tagline: {
    ...typography.caption,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  progressTrack: {
    width: 150,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.16)",
    overflow: "hidden",
    marginTop: spacing.sm,
  },
  progressFill: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.cyan,
    borderRadius: radii.pill,
  },
});
