import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
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
  const { width } = useWindowDimensions();
  const isCompact = width < 380;

  const { user, activeRoomId } = useAuth();
  const {
    roomState,
    voiceChannels,
    activeVoiceChannelId,
    voiceMuted,
    voiceDeafened,
    voiceSpeakerOn,
    voiceAudioSupported,
    voicePeerStates,
    voiceMicPermission,
    voiceHasTurn,
    voiceIceServerCount,
    voiceError,
    connectionStatus,
    isRoomAdminOrOwner,
    createVoiceChannel,
    deleteVoiceChannel,
    joinVoiceChannel,
    leaveVoiceChannel,
    setVoiceState,
    toggleVoiceSpeaker,
    openVoicePermissionSettings,
    refreshVoiceDiagnostics,
    retryVoiceConnections,
  } = useRoom();

  const [newChannelName, setNewChannelName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [iceInfo, setIceInfo] = useState<{
    count: number;
    hasTurn: boolean;
    provider?: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(
    null
  );

  const loadIceStatus = useCallback(async () => {
    try {
      const cfg = await voiceApi.getVoiceIceConfig();
      setIceInfo({
        count: cfg.iceServers.length,
        hasTurn: cfg.hasTurn,
        provider: cfg.provider,
      });
    } catch {
      // Keep snapshot fallback counts if endpoint fails
    }
  }, []);

  useEffect(() => {
    void refreshVoiceDiagnostics();
    void loadIceStatus();
  }, [loadIceStatus, refreshVoiceDiagnostics]);

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

  const handleRunDiagnosticsRefresh = async () => {
    await refreshVoiceDiagnostics();
    await loadIceStatus();
    setFeedback({ tone: "info", text: "Voice permissions and ICE relay status refreshed." });
  };

  const activeChannel = voiceChannels.find(c => c.id === activeVoiceChannelId) || null;
  const connectedPeersCount = Object.values(voicePeerStates).filter(s => s === "connected").length;
  const stalledOrFailedCount = Object.values(voicePeerStates).filter(
    s => s === "reconnecting" || s === "failed"
  ).length;

  const hasTurn = iceInfo ? iceInfo.hasTurn : voiceHasTurn;
  const iceCount = iceInfo ? iceInfo.count : voiceIceServerCount;
  const activeErrorText = feedback?.tone === "error" ? feedback.text : voiceError;
  const isMicBlocked = voiceMicPermission === "blocked";

  return (
    <ScreenContainer scroll keyboardAware maxWidth={720} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title} numberOfLines={1}>
            Voice Channels
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Room {roomState?.roomId || activeRoomId} · Two-Way WebRTC Audio
          </Text>
        </View>
        <Pressable
          onPress={() => setShowDiagnostics(v => !v)}
          style={styles.diagToggleBtn}
          accessibilityLabel="Toggle voice diagnostics"
        >
          <StatusBadge
            label={hasTurn ? "STUN + TURN" : `${iceCount} STUN`}
            tone={hasTurn ? "success" : "primary"}
          />
          <Ionicons
            name={showDiagnostics ? "chevron-up" : "pulse-outline"}
            size={14}
            color={colors.primaryBright}
          />
        </Pressable>
      </View>

      {!voiceAudioSupported ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone="warning"
            message="Native WebRTC audio is unavailable in this runtime. Install or update to the latest SecureSphere Android APK build for two-way live voice chat."
          />
        </View>
      ) : null}

      {activeErrorText ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone="error"
            message={activeErrorText}
            actionLabel={
              isMicBlocked
                ? "Open Settings"
                : activeChannel && stalledOrFailedCount > 0
                  ? "Reconnect"
                  : undefined
            }
            onAction={
              isMicBlocked
                ? () => void openVoicePermissionSettings()
                : activeChannel && stalledOrFailedCount > 0
                  ? () => void retryVoiceConnections()
                  : undefined
            }
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : feedback ? (
        <View style={styles.gap}>
          <FeedbackBanner
            tone={feedback.tone}
            message={feedback.text}
            onDismiss={() => setFeedback(null)}
          />
        </View>
      ) : null}

      {/* Expandable Readiness & Error Diagnostics */}
      {showDiagnostics || isMicBlocked || !voiceAudioSupported ? (
        <Card style={styles.diagCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.diagTitle}>Voice Diagnostics</Text>
            <Pressable onPress={() => void handleRunDiagnosticsRefresh()} style={styles.refreshBtn}>
              <Ionicons name="refresh-outline" size={14} color={colors.primaryBright} />
              <Text style={styles.refreshText}>Recheck</Text>
            </Pressable>
          </View>

          <View style={styles.diagGrid}>
            <DiagPill
              label="WebRTC"
              value={voiceAudioSupported ? "Native Ready" : "Missing"}
              ok={voiceAudioSupported}
            />
            <DiagPill
              label="Mic"
              value={
                voiceMicPermission === "granted"
                  ? "Allowed"
                  : voiceMicPermission === "blocked"
                    ? "Blocked"
                    : voiceMicPermission === "denied"
                      ? "Denied"
                      : "Prompt on Join"
              }
              ok={voiceMicPermission === "granted" || voiceMicPermission === "unknown"}
            />
            <DiagPill
              label="Signaling"
              value={connectionStatus === "connected" ? "Socket Live" : "Offline"}
              ok={connectionStatus === "connected"}
            />
            <DiagPill
              label="NAT / Relay"
              value={hasTurn ? "STUN + TURN" : `${iceCount} STUN only`}
              ok={hasTurn}
            />
          </View>

          {!hasTurn ? (
            <Text style={styles.diagHint}>
              Same Wi-Fi networks connect directly via STUN. If cross-network 4G/5G calls stall, add
              CLOUDFLARE_TURN_* or METERED_TURN_* env vars on the Render backend for relay support.
            </Text>
          ) : null}

          {isMicBlocked ? (
            <Button
              label="Open Android Mic Settings"
              variant="secondary"
              onPress={() => void openVoicePermissionSettings()}
              icon={<Ionicons name="settings-outline" size={16} color={colors.text} />}
            />
          ) : null}
        </Card>
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
              <Text style={styles.channelTitle} numberOfLines={1}>
                {activeChannel.name}
              </Text>
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

          <View style={[styles.controlsRow, isCompact && styles.controlsRowWrap]}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void setVoiceState({ muted: !voiceMuted });
              }}
              style={[
                styles.ctrlBtn,
                isCompact && styles.ctrlBtnHalf,
                voiceMuted && styles.ctrlBtnMuted,
              ]}
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
              style={[
                styles.ctrlBtn,
                isCompact && styles.ctrlBtnHalf,
                voiceDeafened && styles.ctrlBtnActive,
              ]}
            >
              <Ionicons
                name={voiceDeafened ? "volume-mute" : "headset-outline"}
                size={20}
                color={voiceDeafened ? colors.warning : colors.text}
              />
              <Text style={styles.ctrlLabel}>{voiceDeafened ? "Undeafen" : "Deafen"}</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void toggleVoiceSpeaker();
              }}
              style={[
                styles.ctrlBtn,
                isCompact && styles.ctrlBtnHalf,
                voiceSpeakerOn && styles.ctrlBtnSpeaker,
              ]}
            >
              <Ionicons
                name={voiceSpeakerOn ? "volume-high" : "ear-outline"}
                size={20}
                color={voiceSpeakerOn ? colors.cyan : colors.textSecondary}
              />
              <Text style={styles.ctrlLabel}>{voiceSpeakerOn ? "Speaker" : "Earpiece"}</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleLeave()}
              style={[styles.ctrlBtn, isCompact && styles.ctrlBtnHalf, styles.leaveBtn]}
            >
              <Ionicons name="call-outline" size={20} color={colors.danger} />
              <Text style={[styles.ctrlLabel, { color: colors.danger }]}>Leave</Text>
            </Pressable>
          </View>

          {stalledOrFailedCount > 0 ? (
            <Pressable
              onPress={() => void retryVoiceConnections()}
              style={styles.reconnectAudioBtn}
            >
              <Ionicons name="refresh" size={14} color={colors.cyan} />
              <Text style={styles.reconnectAudioText}>
                Reconnect Peer Audio ({stalledOrFailedCount} retrying)
              </Text>
            </Pressable>
          ) : null}
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
                    <Text style={styles.channelName} numberOfLines={1}>
                      {ch.name}
                    </Text>
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
                                  : peerState === "failed"
                                    ? colors.danger
                                    : peerState === "reconnecting"
                                      ? colors.warning
                                      : colors.primaryBright,
                            },
                          ]}
                        />
                        <Text style={styles.participantName} numberOfLines={1}>
                          {p.username}
                          {isMe ? " (You)" : ""}
                        </Text>
                        {!isMe && peerState === "connecting" ? (
                          <Text style={styles.peerStateMini}>Linking…</Text>
                        ) : !isMe && peerState === "failed" ? (
                          <Text style={[styles.peerStateMini, { color: colors.danger }]}>NAT Err</Text>
                        ) : null}
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
        <View style={[styles.createRow, isCompact && styles.createRowCompact]}>
          <TextInput
            style={styles.createInput}
            placeholder="Channel name (e.g. Squad Alpha)"
            placeholderTextColor={colors.textMuted}
            value={newChannelName}
            onChangeText={setNewChannelName}
            maxLength={40}
          />
          <View style={isCompact ? styles.createBtnFull : styles.createBtnWrap}>
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

function DiagPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={[styles.diagPill, !ok && styles.diagPillWarn]}>
      <Text style={styles.diagPillLabel}>{label}</Text>
      <Text style={[styles.diagPillVal, { color: ok ? colors.success : colors.warning }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
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
    flexShrink: 0,
  },
  flexOne: {
    flex: 1,
    minWidth: 0,
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
  diagToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  gap: {
    marginBottom: spacing.md,
  },
  diagCard: {
    marginBottom: spacing.md,
    gap: spacing.sm + 2,
  },
  diagTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "700",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  refreshText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.primaryBright,
    fontWeight: "600",
  },
  diagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  diagPill: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: colors.surfaceInset,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    gap: 2,
  },
  diagPillWarn: {
    borderColor: colors.warningBorder,
  },
  diagPillLabel: {
    ...typography.caption,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  diagPillVal: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: "700",
  },
  diagHint: {
    ...typography.caption,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
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
  controlsRowWrap: {
    flexWrap: "wrap",
  },
  ctrlBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    backgroundColor: "rgba(11, 14, 20, 0.65)",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  ctrlBtnHalf: {
    flexBasis: "47%",
    flexGrow: 1,
  },
  ctrlBtnMuted: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  ctrlBtnActive: {
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
  },
  ctrlBtnSpeaker: {
    borderColor: "rgba(56, 189, 248, 0.35)",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  leaveBtn: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  ctrlLabel: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.text,
    fontWeight: "600",
  },
  reconnectAudioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: radii.md,
    backgroundColor: "rgba(56, 189, 248, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.28)",
  },
  reconnectAudioText: {
    ...typography.caption,
    color: colors.cyan,
    fontWeight: "600",
    fontSize: 12,
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
    minWidth: 0,
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
    flexShrink: 0,
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
    flexShrink: 0,
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
    maxWidth: "100%",
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
    flexShrink: 1,
  },
  peerStateMini: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.warning,
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
  createRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  createInput: {
    flex: 1,
    minWidth: 0,
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
    minWidth: 84,
  },
  createBtnFull: {
    width: "100%",
  },
});
