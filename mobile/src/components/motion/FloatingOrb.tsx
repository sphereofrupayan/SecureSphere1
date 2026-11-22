import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface FloatingOrbProps {
  children: React.ReactNode;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export function FloatingOrb({
  children,
  distance = 5,
  duration = 2600,
  style,
}: FloatingOrbProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(distance, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, [distance, duration, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}
