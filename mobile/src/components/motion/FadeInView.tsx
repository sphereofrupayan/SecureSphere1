import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  offsetY?: number;
  offsetX?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 420,
  offsetY = 14,
  offsetX = 0,
  scaleFrom = 0.985,
  style,
}: FadeInViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(offsetY);
  const translateX = useSharedValue(offsetX);
  const scale = useSharedValue(scaleFrom);

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);
    opacity.value = withDelay(delay, withTiming(1, { duration, easing }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing }));
    translateX.value = withDelay(delay, withTiming(0, { duration, easing }));
    scale.value = withDelay(delay, withTiming(1, { duration, easing }));
  }, [delay, duration, opacity, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}
