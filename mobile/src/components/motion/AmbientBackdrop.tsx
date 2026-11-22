import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export function AmbientBackdrop() {
  const pulse = useSharedValue(0.85);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.75, { duration: 4200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [pulse]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="glowTop" cx="88%" cy="6%" rx="52%" ry="34%">
              <Stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
              <Stop offset="50%" stopColor="#2563EB" stopOpacity="0.07" />
              <Stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="glowBottom" cx="12%" cy="92%" rx="55%" ry="34%">
              <Stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.16" />
              <Stop offset="50%" stopColor="#0284C7" stopOpacity="0.05" />
              <Stop offset="100%" stopColor="#0B0E14" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowTop)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glowBottom)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
