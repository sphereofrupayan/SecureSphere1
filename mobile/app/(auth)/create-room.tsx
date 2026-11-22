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
import { CreateRoomAuthFormValues, createRoomAuthSchema } from "@/utils/validation";

export default function CreateRoomAuthScreen() {
  const router = useRouter();
  const { createRoomSession } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateRoomAuthFormValues>({
    resolver: zodResolver(createRoomAuthSchema),
    defaultValues: {
      username: "",
      roomName: "",
      password: "",
    },
  });

  const onSubmit = async (values: CreateRoomAuthFormValues) => {
    setSubmitError(null);
    try {
      await createRoomSession({
        username: values.username,
        roomName: values.roomName?.trim() || undefined,
        password: values.password || undefined,
      });
    } catch (error) {
      setSubmitError(
        isApiError(error)
          ? error.message
          : "Unable to create room right now. Please try again."
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
        <Text style={styles.title}>Create a private room</Text>
        <TypewriterText
          phrases={[
            "Launch an encrypted workspace with a shareable code.",
            "Invite friends across web & Android in seconds.",
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
              name="roomName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Room name"
                  optionalLabel="(optional)"
                  placeholder="e.g. Design Review, Study Lounge"
                  leftIcon="cube-outline"
                  maxLength={60}
                  value={value ?? ""}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.roomName?.message}
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
              label="Create & Enter Room"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              icon={<Ionicons name="add-circle-outline" size={18} color={colors.onPrimary} />}
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
