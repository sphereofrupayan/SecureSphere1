import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Clipboard from "expo-clipboard";
import { Controller, useForm } from "react-hook-form";
import {
  Button,
  Card,
  FeedbackBanner,
  Input,
  ScreenContainer,
  StatusBadge,
} from "@/components";
import { ENV } from "@/constants/env";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import { isApiError } from "@/types";
import { getInitials } from "@/utils/format";
import {
  CreateRoomFormValues,
  createRoomSchema,
  JoinRoomFormValues,
  joinRoomSchema,
} from "@/utils/validation";

export default function RoomsScreen() {
  const { user, activeRoomId } = useAuth();
  const {
    roomState,
    members,
    isRoomAdminOrOwner,
    createAndSwitchRoom,
    joinAndSwitchRoom,
    switchRoom,
    setWhiteboardMemberDraw,
    transferRoomAdmin,
    isSwitchingRoom,
  } = useRoom();

  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const createForm = useForm<CreateRoomFormValues>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: { name: "" },
  });

  const joinForm = useForm<JoinRoomFormValues>({
    resolver: zodResolver(joinRoomSchema),
    defaultValues: { roomId: "" },
  });

  const onCreateRoom = async (values: CreateRoomFormValues) => {
    setFeedback(null);
    try {
      const created = await createAndSwitchRoom(values.name?.trim() || undefined);
      createForm.reset();
      setFeedback({
        tone: "success",
        text: `Created & joined "${created.roomName}" (${created.roomId}).`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: isApiError(error) ? error.message : "Unable to create room.",
      });
    }
  };

  const onJoinRoom = async (values: JoinRoomFormValues) => {
    setFeedback(null);
    try {
      const joined = await joinAndSwitchRoom(values.roomId);
      joinForm.reset();
      setFeedback({
        tone: "success",
        text: `Joined "${joined.roomName}" (${joined.roomId}).`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: isApiError(error) ? error.message : "Unable to join room.",
      });
    }
  };

  const handleReturnToDefault = async () => {
    setFeedback(null);
    const result = await switchRoom(ENV.defaultRoomId);
    if (result.ok) {
      setFeedback({ tone: "success", text: `Switched to ${ENV.defaultRoomId}.` });
    } else {
      setFeedback({ tone: "error", text: result.error || "Unable to switch room." });
    }
  };

  const handleCopyCode = async () => {
    const code = roomState?.roomId || activeRoomId;
    await Clipboard.setStringAsync(code);
    setFeedback({ tone: "success", text: `Room code ${code} copied.` });
  };

  const handleToggleWhiteboardDraw = async (val: boolean) => {
    setUpdatingSettings(true);
    const res = await setWhiteboardMemberDraw(val);
    setUpdatingSettings(false);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to update whiteboard setting." });
    }
  };

  const handleTransferAdmin = (targetUsername: string) => {
    Alert.alert(
      "Transfer Room Admin",
      `Hand over Room Admin ownership for ${roomState?.roomId || activeRoomId} to ${targetUsername}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Transfer",
          onPress: async () => {
            const res = await transferRoomAdmin(targetUsername);
            if (res.ok) {
              setFeedback({ tone: "success", text: `Room Admin transferred to ${targetUsername}.` });
            } else {
              setFeedback({ tone: "error", text: res.error || "Unable to transfer admin rights." });
            }
          },
        },
      ]
    );
  };

  const currentCode = roomState?.roomId || activeRoomId;
  const otherOnlineMembers = members.filter(
    m => m.username.toLowerCase() !== (user?.username || "").toLowerCase()
  );

  return (
    <ScreenContainer scroll keyboardAware maxWidth={760}>
      <View style={styles.header}>
        <Text style={styles.title}>Rooms & Settings</Text>
        <Text style={styles.subtitle}>
          Create private spaces, join by code, or manage active room permissions.
        </Text>
      </View>

      {feedback ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone={feedback.tone}
            message={feedback.text}
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : null}

      <Card variant="accent" style={styles.cardGap}>
        <View style={styles.activeRow}>
          <View style={styles.flexOne}>
            <Text style={styles.eyebrow}>CURRENTLY IN</Text>
            <Text style={styles.roomTitle}>{roomState?.roomName || "Friends Room"}</Text>
          </View>
          <StatusBadge label={currentCode} tone="primary" />
        </View>

        <View style={styles.rowActions}>
          <View style={styles.flexOne}>
            <Button
              label="Copy Code"
              variant="secondary"
              onPress={handleCopyCode}
              icon={<Ionicons name="copy-outline" size={16} color={colors.text} />}
            />
          </View>
          {currentCode !== ENV.defaultRoomId ? (
            <View style={styles.flexOne}>
              <Button
                label="Main Room"
                variant="secondary"
                loading={isSwitchingRoom}
                onPress={handleReturnToDefault}
                icon={<Ionicons name="home-outline" size={16} color={colors.text} />}
              />
            </View>
          ) : null}
        </View>
      </Card>

      {/* Owner/Admin Room Permissions */}
      {isRoomAdminOrOwner ? (
        <Card variant="elevated" style={styles.cardGap}>
          <View style={styles.activeRow}>
            <Text style={styles.cardHeading}>Room Controls</Text>
            <StatusBadge label="Owner / Admin" tone="primary" />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.flexOne}>
              <Text style={styles.settingTitle}>Allow Members to Draw</Text>
              <Text style={styles.cardDesc}>
                Let all room participants draw on the shared whiteboard.
              </Text>
            </View>
            <Switch
              value={Boolean(roomState?.whiteboardMemberDraw)}
              disabled={updatingSettings}
              onValueChange={val => void handleToggleWhiteboardDraw(val)}
              trackColor={{ false: colors.surfaceInset, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {otherOnlineMembers.length > 0 ? (
            <View style={styles.transferSection}>
              <Text style={styles.settingTitle}>Transfer Room Admin</Text>
              <Text style={styles.cardDesc}>Tap an online member to hand over room ownership.</Text>
              <View style={styles.memberChips}>
                {otherOnlineMembers.map(m => (
                  <Pressable
                    key={m.username}
                    onPress={() => handleTransferAdmin(m.username)}
                    style={styles.transferChip}
                  >
                    <Text style={styles.transferChipText}>{m.username}</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.primaryBright} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card variant="elevated" style={styles.cardGap}>
        <Text style={styles.cardHeading}>Create a Private Room</Text>
        <Text style={styles.cardDesc}>
          Generates a unique room code you can share with friends or teammates.
        </Text>
        <View style={styles.formStack}>
          <Controller
            control={createForm.control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Room Name"
                optionalLabel="(optional)"
                placeholder="e.g. Late Night Coding"
                leftIcon="cube-outline"
                maxLength={60}
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                error={createForm.formState.errors.name?.message}
              />
            )}
          />
          <Button
            label="Create & Switch"
            loading={createForm.formState.isSubmitting || isSwitchingRoom}
            onPress={createForm.handleSubmit(onCreateRoom)}
            icon={<Ionicons name="add-circle-outline" size={18} color={colors.onPrimary} />}
          />
        </View>
      </Card>

      <Card variant="elevated" style={styles.cardGap}>
        <Text style={styles.cardHeading}>Join Room by Code</Text>
        <Text style={styles.cardDesc}>
          Enter an existing SecureSphere Room ID to join immediately.
        </Text>
        <View style={styles.formStack}>
          <Controller
            control={joinForm.control}
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
                error={joinForm.formState.errors.roomId?.message}
              />
            )}
          />
          <Button
            label="Join Room"
            variant="secondary"
            loading={joinForm.formState.isSubmitting || isSwitchingRoom}
            onPress={joinForm.handleSubmit(onJoinRoom)}
            icon={<Ionicons name="enter-outline" size={18} color={colors.text} />}
          />
        </View>
      </Card>

      {/* Active Members List */}
      <Card>
        <View style={styles.activeRow}>
          <Text style={styles.cardHeading}>Members in {currentCode}</Text>
          <StatusBadge label={`${members.length} online`} tone="success" showDot />
        </View>
        <View style={styles.membersList}>
          {members.map(m => (
            <View key={m.username} style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(m.username)}</Text>
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.memberName}>{m.username}</Text>
                <Text style={styles.cardDesc}>
                  {m.isOwner ? "Owner" : m.isAdmin ? "Administrator" : "Member"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  gap: {
    marginBottom: spacing.md,
  },
  cardGap: {
    marginBottom: spacing.lg,
  },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...typography.label,
    fontSize: 10,
    color: colors.primaryBright,
  },
  roomTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cardHeading: {
    ...typography.heading,
    color: colors.text,
    marginBottom: 4,
  },
  cardDesc: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  settingTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  transferSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  memberChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  transferChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  transferChipText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontWeight: "600",
  },
  formStack: {
    gap: spacing.md,
  },
  membersList: {
    gap: spacing.sm + 2,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontWeight: "700",
  },
  memberName: {
    ...typography.bodyMedium,
    color: colors.text,
  },
});
