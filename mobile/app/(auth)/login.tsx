import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { authApi } from "@/api";
import {
  BrandShield,
  Button,
  Card,
  FadeInView,
  FeedbackBanner,
  FloatingOrb,
  Input,
  ScreenContainer,
  StatusBadge,
  TypewriterText,
} from "@/components";
import { ENV } from "@/constants/env";
import { useAuth } from "@/hooks/useAuth";
import { colors, radii, spacing, typography } from "@/theme";
import { isApiError } from "@/types";
import { LoginFormValues, loginSchema } from "@/utils/validation";

const HERO_PHRASES = [
  "Private real-time rooms for your team.",
  "Live chat, voice & shared whiteboard.",
  "Synchronized YouTube, Chess & Ludo.",
  "Powered by room-aware Gemini AI.",
];

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, sessionNotice, clearSessionNotice } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [defaultRoomName, setDefaultRoomName] = useState<string>("Friends Room");

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    let active = true;
    async function checkBackend() {
      try {
        const cfg = await authApi.getServerConfig();
        if (!active) return;
        setServerStatus("online");
        if (cfg.roomName) setDefaultRoomName(cfg.roomName);
      } catch {
        if (active) setServerStatus("offline");
      }
    }
    void checkBackend();
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    clearSessionNotice();
    try {
      await signIn(values);
    } catch (error) {
      setSubmitError(
        isApiError(error)
          ? error.message
          : "Unable to sign in right now. Please try again."
      );
    }
  };

  return (
    <ScreenContainer scroll keyboardAware maxWidth={540} edges={["top", "bottom", "left", "right"]}>
      <FadeInView delay={0} offsetY={-8}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <FloatingOrb distance={3} duration={2800}>
              <BrandShield size={46} />
            </FloatingOrb>
            <View>
              <Text style={styles.brandName}>
                Secure<Text style={styles.brandAccent}>Sphere</Text>
              </Text>
              <Text style={styles.brandTagline}>Zero-Friction Encrypted Workspace</Text>
            </View>
          </View>

          <StatusBadge
            label={
              serverStatus === "online"
                ? "Server Online"
                : serverStatus === "checking"
                  ? "Checking..."
                  : "Offline"
            }
            tone={
              serverStatus === "online"
                ? "success"
                : serverStatus === "checking"
                  ? "primary"
                  : "danger"
            }
            showDot
          />
        </View>
      </FadeInView>

      <FadeInView delay={90} style={styles.heroCopy}>
        <Text style={styles.title}>Welcome to {defaultRoomName}</Text>
        <View style={styles.typewriterBox}>
          <TypewriterText
            phrases={HERO_PHRASES}
            typingSpeedMs={42}
            deletingSpeedMs={22}
            pauseMs={2100}
            style={styles.typewriterText}
          />
        </View>
      </FadeInView>

      {ENV.configWarning ? (
        <FadeInView delay={120} style={styles.bannerGap}>
          <FeedbackBanner tone="warning" message={ENV.configWarning} />
        </FadeInView>
      ) : null}

      {sessionNotice ? (
        <FadeInView delay={120} style={styles.bannerGap}>
          <FeedbackBanner
            tone="warning"
            message={sessionNotice}
            onDismiss={clearSessionNotice}
          />
        </FadeInView>
      ) : null}

      {submitError ? (
        <FadeInView delay={0} style={styles.bannerGap}>
          <FeedbackBanner
            tone="error"
            message={submitError}
            onDismiss={() => setSubmitError(null)}
          />
        </FadeInView>
      ) : null}

      <FadeInView delay={170}>
        <Card variant="elevated" style={styles.formCard}>
          <View style={styles.formFields}>
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Username"
                  placeholder="Enter your username"
                  leftIcon="person-outline"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  returnKeyType="next"
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
                  placeholder="Enter your password"
                  leftIcon="lock-closed-outline"
                  isPassword
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  returnKeyType="done"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  onSubmitEditing={() => void handleSubmit(onSubmit)()}
                  error={errors.password?.message}
                  helperText="New non-admin usernames are registered automatically on first sign-in."
                />
              )}
            />

            <View style={styles.submitWrap}>
              <Button
                label="Sign In"
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                icon={<Ionicons name="shield-checkmark-outline" size={18} color={colors.onPrimary} />}
              />
            </View>
          </View>
        </Card>
      </FadeInView>

      <FadeInView delay={250}>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>QUICK ROOM ENTRY</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.quickGrid}>
          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && styles.quickTilePressed]}
            onPress={() => router.push("/(auth)/create-room")}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primaryBright} />
            </View>
            <Text style={styles.quickTitle}>Create Room</Text>
            <Text style={styles.quickDesc}>Launch a private room with an invite code.</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && styles.quickTilePressed]}
            onPress={() => router.push("/(auth)/join-room")}
          >
            <View style={[styles.quickIconWrap, { backgroundColor: colors.cyanSoft }]}>
              <Ionicons name="enter-outline" size={22} color={colors.cyan} />
            </View>
            <Text style={styles.quickTitle}>Join with Code</Text>
            <Text style={styles.quickDesc}>Enter a Room ID like SS-7K4M9P to join.</Text>
          </Pressable>
        </View>
      </FadeInView>

      <FadeInView delay={320} style={styles.footerMeta}>
        <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
        <Text style={styles.footerText}>
          {ENV.appEnv.toUpperCase()} · {ENV.apiUrl || "No API URL"}
        </Text>
      </FadeInView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  brandName: {
    ...typography.title,
    color: colors.text,
  },
  brandAccent: {
    color: colors.primaryBright,
  },
  brandTagline: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  heroCopy: {
    gap: 6,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.hero,
    color: colors.text,
  },
  typewriterBox: {
    minHeight: 26,
    justifyContent: "center",
  },
  typewriterText: {
    ...typography.bodyMedium,
    color: colors.cyan,
    fontSize: 15,
  },
  bannerGap: {
    marginBottom: spacing.md,
  },
  formCard: {
    marginBottom: spacing.xl,
  },
  formFields: {
    gap: spacing.lg,
  },
  submitWrap: {
    marginTop: spacing.xs,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.label,
    fontSize: 11,
    color: colors.textMuted,
  },
  quickGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  quickTile: {
    flex: 1,
    backgroundColor: "rgba(20, 26, 38, 0.88)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  quickTilePressed: {
    backgroundColor: colors.surfacePressed,
    borderColor: colors.primaryBorder,
  },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTitle: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
  },
  quickDesc: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerMeta: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
});
