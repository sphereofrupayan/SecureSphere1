import React, { useEffect, useState } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/theme";

interface TypewriterTextProps {
  phrases: string[];
  typingSpeedMs?: number;
  deletingSpeedMs?: number;
  pauseMs?: number;
  loop?: boolean;
  style?: StyleProp<TextStyle>;
  cursorColor?: string;
  showCursor?: boolean;
}

export function TypewriterText({
  phrases,
  typingSpeedMs = 46,
  deletingSpeedMs = 26,
  pauseMs = 1900,
  loop = true,
  style,
  cursorColor = colors.cyan,
  showCursor = true,
}: TypewriterTextProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const cursorOpacity = useSharedValue(1);
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 480, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 480, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [cursorOpacity]);

  useEffect(() => {
    if (!phrases.length) return;
    const currentPhrase = phrases[phraseIndex % phrases.length] ?? "";

    let timer: ReturnType<typeof setTimeout>;

    if (!isDeleting) {
      if (displayed.length < currentPhrase.length) {
        timer = setTimeout(() => {
          setDisplayed(currentPhrase.slice(0, displayed.length + 1));
        }, typingSpeedMs);
      } else if (loop && phrases.length > 1) {
        timer = setTimeout(() => {
          textOpacity.value = withTiming(0.82, { duration: 180 });
          setIsDeleting(true);
        }, pauseMs);
      }
    } else if (displayed.length > 0) {
      timer = setTimeout(() => {
        setDisplayed(currentPhrase.slice(0, displayed.length - 1));
      }, deletingSpeedMs);
    } else {
      setIsDeleting(false);
      setPhraseIndex(prev => (prev + 1) % phrases.length);
      textOpacity.value = withTiming(1, { duration: 240 });
    }

    return () => clearTimeout(timer);
  }, [deletingSpeedMs, displayed, isDeleting, loop, pauseMs, phraseIndex, phrases, textOpacity, typingSpeedMs]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.row}>
      <Animated.Text style={[style, textAnimStyle]}>
        {displayed}
        {showCursor ? (
          <Animated.Text style={[style, { color: cursorColor }, cursorStyle]}>|</Animated.Text>
        ) : null}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
});
