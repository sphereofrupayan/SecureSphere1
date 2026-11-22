import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/theme";

interface InputProps extends TextInputProps {
  label: string;
  optionalLabel?: string;
  error?: string;
  helperText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
}

export function Input({
  label,
  optionalLabel,
  error,
  helperText,
  leftIcon,
  isPassword = false,
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optionalLabel ? <Text style={styles.optional}>{optionalLabel}</Text> : null}
      </View>

      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          Boolean(error) && styles.inputWrapError,
        ]}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? colors.primaryBright : colors.textMuted}
            style={styles.leftIcon}
          />
        ) : null}

        <TextInput
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primaryBright}
          secureTextEntry={isPassword && !passwordVisible}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
          {...rest}
        />

        {isPassword ? (
          <Pressable
            onPress={() => setPasswordVisible(prev => !prev)}
            hitSlop={10}
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  optional: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "400",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  inputWrapFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: "#101726",
  },
  inputWrapError: {
    borderColor: colors.danger,
  },
  leftIcon: {
    marginRight: 2,
  },
  input: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    fontSize: 12,
  },
  helperText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
});
