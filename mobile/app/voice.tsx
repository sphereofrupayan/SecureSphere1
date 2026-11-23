import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { voiceApi } from "@/api";
import { Button, Card, FeedbackBanner, PulseBeacon, ScreenContainer, StatusBadge } from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import { confirmAction } from "@/utils/confirm";

export default function VoiceChannelsScreen() {
  const router = useRouter();
  const { user, activeRoomId } = useAuth();
  const {
    roomState,
    voiceChannels,
    activeVoiceChannelId,
    voiceMuted,
    voiceDeafened,
    voiceAudioSupported,
    voicePeerStates,
    isRoomAdminOrOwner,
    createVoiceChannel,
    deleteVoiceChannel,
    joinVoiceChannel,
    leaveVoiceChannel,
    setVoiceState,
  } = useRoom();

  const [newChannelName, setNewChannelName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [iceInfo, setIceInfo] = useState<{ count: number; hasTurn: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(
    null
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const cfg = await voiceApi.getVoiceIceConfig();
        if (active) {
          setIceInfo({ count: cfg.iceServers.length, hasTurn: cfg.hasTurn });
        }
      } catch {
        // optional status info
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleCreateChannel = async () => {
    const clean = newChannelName.trim();
    if (clean.length < 2) {
      setFeedback({ tone: "error", text: "Channel name must be at least 2 characters." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const res = await createVoiceChannel(clean);
    setBusy(false);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to create channel." });
      return;
    }
    setNewChannelName("");
    setFeedback({ tone: "success", text: `Created voice channel "${clean}".` });
  };

  const handleDeleteChannel = (channelId: string, name: string) => {
    confirmAction({
      title: "Delete Channel",
      message: `Remove voice channel "${name}"?`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const res = await deleteVoiceChannel(channelId);
        if (!res.ok) {
          setFeedback({ tone: "error", text: res.error || "Unable to delete channel." });
        }
      },
    });
  };

  const handleJoin = async (channelId: string) => {
    setBusy(true);
    setJoiningChannelId(channelId);
    setFeedback(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const res = await joinVoiceChannel(channelId);
    setBusy(false);
    setJoiningChannelId(null);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to join voice channel." });
    } else {
      setFeedback({
        tone: "success",
        text: "Two-way live WebRTC audio connected! You can talk with teammates on mobile & web.",
      });
    }
  };

  const handleLeave = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await leaveVoiceChannel();
    setFeedback(null);
  };

  const activeChannel = voiceChannels.find(c => c.id === activeVoiceChannelId) || null;
  const connectedPeersCount = Object.values(voicePeerStates).filter(s => s === "connected").length;

  return (
    <ScreenContainer scroll keyboardAware edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>Voice Channels</Text>
          <Text style={styles.subtitle}>
            Room {roomState?.roomId || activeRoomId} · Two-Way WebRTC Audio
          </Text>
        </View>
        {iceInfo ? (
          <StatusBadge
            label={iceInfo.hasTurn ? "STUN + TURN" : `${iceInfo.count} STUN`}
            tone="primary"
          />
        ) : null}
      </View>

      {!voiceAudioSupported ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone="warning"
            message="Native WebRTC audio is unavailable in Expo Go. Install the SecureSphere Android APK build for live two-way voice chat."
          />
        </View>
      ) : null}

      {feedback ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone={feedback.tone}
            message={feedback.text}
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : null}

      {/* Active Connected Stage */}
      {activeChannel ? (
        <Card variant="accent" style={styles.cardGap}>
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <View style={styles.liveRow}>
                <PulseBeacon color={colors.success} size={8} />
                <Text style={styles.eyebrow}>VOICE LIVE · WEBRTC AUDIO</Text>
              </View>
              <Text style={styles.channelTitle}>{activeChannel.name}</Text>
              <Text style={styles.muted}>
                {activeChannel.participants.length <= 1
                  ? "Waiting for teammates to join this channel…"
                  : `${connectedPeersCount} of ${activeChannel.participants.length - 1} peer audio link${activeChannel.participants.length - 1 === 1 ? "" : "s"} live`}
              </Text>
            </View>
            <StatusBadge
              label={`${activeChannel.participants.length} In Voice`}
              tone="success"
              showDot
            />
          </View>

          <View style={styles.controlsRow}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void setVoiceState({ muted: !voiceMuted });
              }}
              style={[styles.ctrlBtn, voiceMuted && styles.ctrlBtnMuted]}
            >
              <Ionicons
                name={voiceMuted ? "mic-off" : "mic"}
                size={20}
                color={voiceMuted ? colors.danger : colors.success}
              />
              <Text style={styles.ctrlLabel}>{voiceMuted ? "Unmute" : "Mic Live"}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void setVoiceState({ deafened: !voiceDeafened });
              }}
              style={[styles.ctrlBtn, voiceDeafened && styles.ctrlBtnActive]}
            >
              <Ionicons
                name={voiceDeafened ? "volume-mute" : "headset-outline"}
                size={20}
                color={voiceDeafened ? colors.warning : colors.text}
              />
              <Text style={styles.ctrlLabel}>{voiceDeafened ? "Undeafen" : "Deafen"}</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleLeave()}
              style={[styles.ctrlBtn, styles.leaveBtn]}
            >
              <Ionicons name="call-outline" size={20} color={colors.danger} />
              <Text style={[styles.ctrlLabel, { color: colors.danger }]}>Leave</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* Channel List */}
      <View style={styles.stack}>
        {voiceChannels.map(ch => {
          const isJoined = ch.id === activeVoiceChannelId;
          const isJoiningThis = joiningChannelId === ch.id;
          const canDelete =
            !ch.isDefault &&
            (isRoomAdminOrOwner ||
              ch.createdBy.toLowerCase() === (user?.username || "").toLowerCase());

          return (
            <Card key={ch.id} variant={isJoined ? "elevated" : "default"} style={styles.channelCard}>
              <View style={styles.rowBetween}>
                <View style={styles.channelIdentity}>
                  <View style={[styles.chIconCircle, isJoined && styles.chIconCircleLive]}>
                    <Ionicons
                      name={isJoined ? "mic" : "volume-high-outline"}
                      size={18}
                      color={isJoined ? colors.success : colors.primaryBright}
                    />
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={styles.channelName}>{ch.name}</Text>
                    <Text style={styles.muted}>
                      {ch.participants.length} participant{ch.participants.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>

                <View style={styles.channelActions}>
                  {canDelete ? (
                    <Pressable
                      onPress={() => void handleDeleteChannel(ch.id, ch.name)}
                      hitSlop={8}
                      style={styles.trashBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  ) : null}

                  <Pressable
                    disabled={busy}
                    onPress={() => (isJoined ? void handleLeave() : void handleJoin(ch.id))}
                    style={[styles.joinPill, isJoined && styles.leavePill]}
                  >
                    <Text style={[styles.joinPillText, isJoined && { color: colors.danger }]}>
                      {isJoiningThis ? "Connecting…" : isJoined ? "Leave" : "Join"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {ch.participants.length > 0 ? (
                <View style={styles.participantsWrap}>
                  {ch.participants.map(p => {
                    const isMe = p.username.toLowerCase() === (user?.username || "").toLowerCase();
                    const peerState = !isMe && isJoined ? voicePeerStates[p.socketId] : undefined;
                    return (
                      <View
                        key={p.socketId}
                        style={[
                          styles.participantChip,
                          p.speaking && !p.muted && !p.deafened && styles.participantChipSpeaking,
                        ]}
                      >
                        <View
                          style={[
                            styles.peerDot,
                            {
                              backgroundColor:
                                isMe || peerState === "connected"
                                  ? colors.success
                                  : peerState === "reconnecting"
                                    ? colors.warning
                                    : colors.primaryBright,
                            },
                          ]}
                        />
                        <Text style={styles.participantName}>
                          {p.username}
                          {isMe ? " (You)" : ""}
                        </Text>
                        {p.muted ? (
                          <Ionicons name="mic-off" size={12} color={colors.danger} />
                        ) : null}
                        {p.deafened ? (
                          <Ionicons name="volume-mute" size={12} color={colors.warning} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      {/* Create Voice Channel */}
      <Card variant="elevated" style={styles.createCard}>
        <Text style={styles.sectionHeading}>Create Voice Channel</Text>
        <View style={styles.createRow}>
          <TextInput
            style={styles.createInput}
            placeholder="Channel name (e.g. Squad Alpha)"
            placeholderTextColor={colors.textMuted}
            value={newChannelName}
            onChangeText={setNewChannelName}
            maxLength={40}
          />
          <View style={styles.createBtnWrap}>
            <Button
              label="Add"
              loading={busy && !joiningChannelId}
              onPress={() => void handleCreateChannel()}
            />
          </View>
        </View>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  flexOne: {
    flex: 1,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  gap: {
    marginBottom: spacing.md,
  },
  cardGap: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  eyebrow: {
    ...typography.label,
    fontSize: 10,
    color: colors.success,
  },
  channelTitle: {
    ...typography.heading,
    color: colors.text,
  },
  controlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctrlBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: "rgba(11, 14, 20, 0.65)",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  ctrlBtnMuted: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  ctrlBtnActive: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  leaveBtn: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  ctrlLabel: {
    ...typography.caption,
    fontSize: 12,
    color: colors.text,
  },
  stack: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  channelCard: {
    gap: spacing.sm,
  },
  channelIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    flex: 1,
  },
  chIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  chIconCircleLive: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  channelName: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  muted: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  channelActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  trashBtn: {
    padding: 6,
  },
  joinPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  leavePill: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  joinPillText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontWeight: "700",
    fontSize: 12,
  },
  participantsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 4,
  },
  participantChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  participantChipSpeaking: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  peerDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  participantName: {
    ...typography.caption,
    fontSize: 12,
    color: colors.text,
  },
  createCard: {
    gap: spacing.sm,
  },
  sectionHeading: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  createInput: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
    fontSize: 14,
  },
  createBtnWrap: {
    width: 82,
  },
});
