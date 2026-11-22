import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
  Button,
  Card,
  FadeInView,
  FeedbackBanner,
  Input,
  ScreenContainer,
  TypewriterText,
} from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { colors, radii, spacing, typography } from "@/theme";
import { isApiError } from "@/types";
import { EnterRoomAuthFormValues, enterRoomAuthSchema } from "@/utils/validation";

export default function JoinRoomAuthScreen() {
  const router = useRouter();
  const { enterRoomSession } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EnterRoomAuthFormValues>({
    resolver: zodResolver(enterRoomAuthSchema),
    defaultValues: {
      roomId: "",
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: EnterRoomAuthFormValues) => {
    setSubmitError(null);
    try {
      await enterRoomSession({
        roomId: values.roomId.trim().toUpperCase(),
        username: values.username,
        password: values.password || undefined,
      });
    } catch (error) {
      setSubmitError(
        isApiError(error)
          ? error.message
          : "Unable to join room right now. Check the Room ID and try again."
      );
    }
  };

  return (
    <ScreenContainer scroll keyboardAware maxWidth={540} edges={["top", "bottom", "left", "right"]}>
      <FadeInView delay={0}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
          <Text style={styles.backLabel}>Back to Sign In</Text>
        </Pressable>
      </FadeInView>

      <FadeInView delay={80} style={styles.hero}>
        <Text style={styles.title}>Join an existing room</Text>
        <TypewriterText
          phrases={[
            "Enter a Room ID shared by your team (MAIN or SS-XXXXXX).",
            "Sync immediately with live web & Android members.",
          ]}
          typingSpeedMs={38}
          style={styles.subtitle}
        />
      </FadeInView>

      {submitError ? (
        <View style={styles.bannerGap}>
          <FeedbackBanner
            tone="error"
            message={submitError}
            onDismiss={() => setSubmitError(null)}
          />
        </View>
      ) : null}

      <FadeInView delay={150}>
        <Card variant="elevated">
          <View style={styles.formFields}>
            <Controller
              control={control}
              name="roomId"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Room ID"
                  placeholder="e.g. MAIN or SS-7K4M9P"
                  leftIcon="key-outline"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={value}
                  onChangeText={text => onChange(text.toUpperCase())}
                  onBlur={onBlur}
                  error={errors.roomId?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Display name"
                  placeholder="Your name or username"
                  leftIcon="person-outline"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.username?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Password"
                  optionalLabel="(optional for guests)"
                  placeholder="Required for existing admin accounts"
                  leftIcon="lock-closed-outline"
                  isPassword
                  autoCapitalize="none"
                  value={value ?? ""}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                />
              )}
            />

            <Button
              label="Join Room"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              icon={<Ionicons name="enter-outline" size={18} color={colors.onPrimary} />}
            />
          </View>
        </Card>
      </FadeInView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  backLabel: {
    ...typography.caption,
    color: colors.text,
  },
  hero: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.hero,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.cyan,
  },
  bannerGap: {
    marginBottom: spacing.md,
  },
  formFields: {
    gap: spacing.lg,
  },
});
