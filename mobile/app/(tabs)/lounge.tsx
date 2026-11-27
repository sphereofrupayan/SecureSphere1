import React, { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Button, Card, FeedbackBanner, ScreenContainer, StatusBadge } from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import type { GameType } from "@/types";
import { confirmAction } from "@/utils/confirm";

function formatClockSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? "0" : ""}${rem}`;
}

export default function LoungeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    roomState,
    gamesLobby,
    isRoomAdminOrOwner,
    setPluginState,
    createGameMatch,
    respondGameInvite,
    joinGameMatch,
    spectateGameMatch,
    clearGamesLounge,
    setYoutubeSong,
    addToYoutubeQueue,
    removeFromYoutubeQueue,
    youtubePlay,
    youtubePause,
    youtubeNext,
    requestSync,
  } = useRoom();

  const [activeTab, setActiveTab] = useState<"games" | "youtube">("games");
  const [chessMinutes, setChessMinutes] = useState<5 | 10 | 15>(10);
  const [ludoPlayers, setLudoPlayers] = useState<2 | 3 | 4>(4);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(
    null
  );

  // YouTube inputs & reconciled playback position
  const [playUrlInput, setPlayUrlInput] = useState("");
  const [queueUrlInput, setQueueUrlInput] = useState("");
  const [displayPos, setDisplayPos] = useState(0);

  useEffect(() => {
    if (!roomState) {
      setDisplayPos(0);
      return;
    }
    const basePos = roomState.position || 0;
    const baseTime = roomState.serverTime || Date.now();
    const compute = () => {
      if (roomState.playing) {
        const delta = Math.max(0, (Date.now() - baseTime) / 1000);
        setDisplayPos(basePos + delta);
      } else {
        setDisplayPos(basePos);
      }
    };
    compute();
    if (!roomState.playing) return;
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [roomState]);

  const myUsernameLower = (user?.username || "").toLowerCase();

  const myPendingInvites = useMemo(
    () =>
      (gamesLobby?.pendingInvites || []).filter(
        inv => inv.toUsername.toLowerCase() === myUsernameLower && inv.status === "pending"
      ),
    [gamesLobby?.pendingInvites, myUsernameLower]
  );

  const activeMatches = useMemo(
    () =>
      (gamesLobby?.matches || []).filter(
        m => m.status === "waiting" || m.status === "active"
      ),
    [gamesLobby?.matches]
  );

  const handleEnablePlugin = async (pluginId: "games" | "youtube") => {
    setBusyKey(`enable-${pluginId}`);
    setFeedback(null);
    const res = await setPluginState(pluginId, true);
    setBusyKey(null);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to enable module." });
    }
  };

  const handleCreateGame = async (gameType: GameType) => {
    setBusyKey(`create-${gameType}`);
    setFeedback(null);
    const options =
      gameType === "chess"
        ? { timeMinutes: chessMinutes }
        : gameType === "ludo"
          ? { maxPlayers: ludoPlayers }
          : {};
    const res = await createGameMatch(gameType, options);
    setBusyKey(null);
    if (!res.ok || !res.match) {
      setFeedback({ tone: "error", text: res.error || "Unable to create match." });
      return;
    }
    router.push({ pathname: "/game/[id]", params: { id: res.match.id } });
  };

  const handleRespondInvite = async (inviteId: string, accept: boolean) => {
    setBusyKey(`inv-${inviteId}`);
    setFeedback(null);
    const res = await respondGameInvite(inviteId, accept);
    setBusyKey(null);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to respond to invitation." });
      return;
    }
    if (accept && res.match?.id) {
      router.push({ pathname: "/game/[id]", params: { id: res.match.id } });
    }
  };

  const handleJoinMatch = async (matchId: string) => {
    setBusyKey(`join-${matchId}`);
    const res = await joinGameMatch(matchId);
    setBusyKey(null);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to join match." });
      return;
    }
    router.push({ pathname: "/game/[id]", params: { id: matchId } });
  };

  const handleSpectateMatch = async (matchId: string) => {
    setBusyKey(`spec-${matchId}`);
    const res = await spectateGameMatch(matchId);
    setBusyKey(null);
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error || "Unable to spectate match." });
      return;
    }
    router.push({ pathname: "/game/[id]", params: { id: matchId } });
  };

  const handleClearLounge = () => {
    confirmAction({
      title: "Clear Games Lounge",
      message: "Remove all active, waiting, and completed matches & pending invitations in this room?",
      confirmLabel: "Clear Lounge",
      destructive: true,
      onConfirm: async () => {
        setBusyKey("clear-lounge");
        setFeedback(null);
        const res = await clearGamesLounge();
        setBusyKey(null);
        if (res.ok) {
          setFeedback({ tone: "success", text: "Games Lounge cleared for this room." });
        } else {
          setFeedback({ tone: "error", text: res.error || "Unable to clear Games Lounge." });
        }
      },
    });
  };

  const handlePlayNow = () => {
    const val = playUrlInput.trim();
    if (!val) return;
    setYoutubeSong(val);
    setPlayUrlInput("");
    setFeedback({ tone: "success", text: "Requested track change for the room." });
  };

  const handleAddQueue = () => {
    const val = queueUrlInput.trim();
    if (!val) return;
    addToYoutubeQueue(val);
    setQueueUrlInput("");
    setFeedback({ tone: "success", text: "Added track to shared room queue." });
  };

  const handleOpenExternalYouTube = async () => {
    if (!roomState?.videoId) return;
    const t = Math.max(0, Math.floor(displayPos));
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(roomState.videoId)}&t=${t}s`;
    await Linking.openURL(url);
  };

  const gamesEnabled = Boolean(roomState?.plugins.games);
  const youtubeEnabled = Boolean(roomState?.plugins.youtube);

  return (
    <ScreenContainer scroll keyboardAware maxWidth={760}>
      <View style={styles.header}>
        <Text style={styles.title}>Lounge</Text>
        <Text style={styles.subtitle}>
          Real-time multiplayer games and synchronized room YouTube queue.
        </Text>
      </View>

      {/* Segmented Switcher */}
      <View style={styles.segmentWrap}>
        <Pressable
          onPress={() => setActiveTab("games")}
          style={[styles.segmentBtn, activeTab === "games" && styles.segmentBtnActive]}
        >
          <Ionicons
            name="game-controller-outline"
            size={16}
            color={activeTab === "games" ? colors.primaryBright : colors.textSecondary}
          />
          <Text
            style={[styles.segmentText, activeTab === "games" && styles.segmentTextActive]}
          >
            Games {myPendingInvites.length > 0 ? `(${myPendingInvites.length})` : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("youtube")}
          style={[styles.segmentBtn, activeTab === "youtube" && styles.segmentBtnActive]}
        >
          <Ionicons
            name="logo-youtube"
            size={16}
            color={activeTab === "youtube" ? "#EF4444" : colors.textSecondary}
          />
          <Text
            style={[styles.segmentText, activeTab === "youtube" && styles.segmentTextActive]}
          >
            YouTube Sync
          </Text>
        </Pressable>
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

      {activeTab === "games" ? (
        <View style={styles.stack}>
          {!gamesEnabled ? (
            <Card variant="elevated" style={styles.disabledCard}>
              <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
              <Text style={styles.disabledTitle}>Games Lounge is Disabled</Text>
              <Text style={styles.disabledSub}>
                The Room Admin ({roomState?.owner || "System"}) must enable Multiplayer Games for
                this room.
              </Text>
              {isRoomAdminOrOwner ? (
                <Button
                  label="Enable Games Lounge"
                  loading={busyKey === "enable-games"}
                  onPress={() => void handleEnablePlugin("games")}
                />
              ) : null}
            </Card>
          ) : (
            <>
              {/* Pending Invites */}
              {myPendingInvites.length > 0 ? (
                <Card variant="accent" style={styles.stackSm}>
                  <Text style={styles.sectionTitle}>Pending Invitations</Text>
                  {myPendingInvites.map(inv => (
                    <View key={inv.id} style={styles.inviteRow}>
                      <View style={styles.flexOne}>
                        <Text style={styles.inviteTitle}>
                          {inv.fromUsername} invited you to {inv.gameType.toUpperCase()}
                        </Text>
                        <Text style={styles.muted}>Tap Accept to jump right in</Text>
                      </View>
                      <View style={styles.inlineBtns}>
                        <Pressable
                          onPress={() => void handleRespondInvite(inv.id, true)}
                          style={styles.acceptPill}
                        >
                          <Text style={styles.acceptText}>Accept</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void handleRespondInvite(inv.id, false)}
                          style={styles.declinePill}
                        >
                          <Text style={styles.declineText}>Decline</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </Card>
              ) : null}

              {/* Create Games Catalog */}
              <Card variant="elevated" style={styles.stackSm}>
                <View style={styles.gameHeader}>
                  <Text style={styles.gameTitle}>Chess</Text>
                  <StatusBadge label="2 Players · FIDE" tone="primary" />
                </View>
                <Text style={styles.muted}>
                  8×8 board with live clocks, legal move highlights, and pawn promotion.
                </Text>
                <View style={styles.optionRow}>
                  {([5, 10, 15] as const).map(mins => (
                    <Pressable
                      key={mins}
                      onPress={() => setChessMinutes(mins)}
                      style={[
                        styles.optChip,
                        chessMinutes === mins && styles.optChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optChipText,
                          chessMinutes === mins && styles.optChipTextActive,
                        ]}
                      >
                        {mins}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  label={`Start ${chessMinutes}m Chess Match`}
                  loading={busyKey === "create-chess"}
                  onPress={() => void handleCreateGame("chess")}
                />
              </Card>

              <Card variant="elevated" style={styles.stackSm}>
                <View style={styles.gameHeader}>
                  <Text style={styles.gameTitle}>Ludo</Text>
                  <StatusBadge label="2–4 Players" tone="success" />
                </View>
                <Text style={styles.muted}>
                  Classic 4-color 15×15 board with live dice rolls, safe stars, and captures.
                </Text>
                <View style={styles.optionRow}>
                  {([2, 3, 4] as const).map(cnt => (
                    <Pressable
                      key={cnt}
                      onPress={() => setLudoPlayers(cnt)}
                      style={[
                        styles.optChip,
                        ludoPlayers === cnt && styles.optChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optChipText,
                          ludoPlayers === cnt && styles.optChipTextActive,
                        ]}
                      >
                        {cnt} Players
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Button
                  label={`Start ${ludoPlayers}-Player Ludo`}
                  variant="secondary"
                  loading={busyKey === "create-ludo"}
                  onPress={() => void handleCreateGame("ludo")}
                />
              </Card>

              <Card variant="elevated" style={styles.stackSm}>
                <View style={styles.gameHeader}>
                  <Text style={styles.gameTitle}>Tic Tac Toe</Text>
                  <StatusBadge label="2 Players" tone="warning" />
                </View>
                <Text style={styles.muted}>Quick X & O rounds with persistent match scoreboard.</Text>
                <Button
                  label="Start Tic Tac Toe"
                  variant="secondary"
                  loading={busyKey === "create-tictactoe"}
                  onPress={() => void handleCreateGame("tictactoe")}
                />
              </Card>

              {/* Active Matches */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Active & Open Matches ({activeMatches.length})
                </Text>
                {isRoomAdminOrOwner &&
                ((gamesLobby?.matches?.length || 0) > 0 ||
                  (gamesLobby?.pendingInvites?.length || 0) > 0) ? (
                  <Pressable
                    onPress={handleClearLounge}
                    disabled={busyKey === "clear-lounge"}
                    style={styles.clearLoungeBtn}
                  >
                    <Ionicons name="trash-outline" size={13} color={colors.danger} />
                    <Text style={styles.clearLoungeText}>Clear Lounge</Text>
                  </Pressable>
                ) : null}
              </View>

              {activeMatches.length === 0 ? (
                <Card>
                  <Text style={styles.emptyText}>
                    No active matches in this room yet. Start one above!
                  </Text>
                </Card>
              ) : (
                activeMatches.map(match => {
                  const isParticipant = match.players.some(
                    p => p.toLowerCase() === myUsernameLower
                  );
                  return (
                    <Card key={match.id} style={styles.matchRowCard}>
                      <View style={styles.gameHeader}>
                        <Text style={styles.matchTitle}>
                          {match.gameType.toUpperCase()} · Host: {match.hostUsername}
                        </Text>
                        <StatusBadge
                          label={match.status === "waiting" ? "Waiting" : "In Progress"}
                          tone={match.status === "waiting" ? "warning" : "success"}
                        />
                      </View>
                      <Text style={styles.muted}>
                        Players: {match.players.join(", ")} ({match.spectators.length} watching)
                      </Text>
                      <View style={styles.inlineBtns}>
                        {isParticipant ? (
                          <View style={styles.flexOne}>
                            <Button
                              label="Open Match"
                              onPress={() =>
                                router.push({ pathname: "/game/[id]", params: { id: match.id } })
                              }
                            />
                          </View>
                        ) : match.status === "waiting" ? (
                          <View style={styles.flexOne}>
                            <Button
                              label="Join Match"
                              loading={busyKey === `join-${match.id}`}
                              onPress={() => void handleJoinMatch(match.id)}
                            />
                          </View>
                        ) : (
                          <View style={styles.flexOne}>
                            <Button
                              label="Spectate"
                              variant="secondary"
                              loading={busyKey === `spec-${match.id}`}
                              onPress={() => void handleSpectateMatch(match.id)}
                            />
                          </View>
                        )}
                      </View>
                    </Card>
                  );
                })
              )}
            </>
          )}
        </View>
      ) : (
        /* YOUTUBE SYNC TAB */
        <View style={styles.stack}>
          {!youtubeEnabled ? (
            <Card variant="elevated" style={styles.disabledCard}>
              <Ionicons name="logo-youtube" size={30} color="#EF4444" />
              <Text style={styles.disabledTitle}>YouTube Shared Queue is Disabled</Text>
              <Text style={styles.disabledSub}>
                The Room Admin ({roomState?.owner || "System"}) must enable YouTube Sync for this
                room.
              </Text>
              {isRoomAdminOrOwner ? (
                <Button
                  label="Enable YouTube Sync"
                  loading={busyKey === "enable-youtube"}
                  onPress={() => void handleEnablePlugin("youtube")}
                />
              ) : null}
            </Card>
          ) : (
            <>
              {/* Synchronized Now Playing Card (Native — Zero WebView) */}
              <Card variant="accent" style={styles.stackSm}>
                <View style={styles.gameHeader}>
                  <Text style={styles.sectionTitle}>Synchronized Playback</Text>
                  <StatusBadge
                    label={roomState?.playing ? "Playing" : roomState?.videoId ? "Paused" : "Idle"}
                    tone={roomState?.playing ? "success" : "neutral"}
                    showDot
                  />
                </View>

                {roomState?.videoId ? (
                  <>
                    <Image
                      source={{
                        uri: `https://img.youtube.com/vi/${roomState.videoId}/hqdefault.jpg`,
                      }}
                      style={styles.ytThumb}
                      resizeMode="cover"
                    />
                    <View style={styles.ytMetaRow}>
                      <View style={styles.flexOne}>
                        <Text style={styles.ytId}>Video ID: {roomState.videoId}</Text>
                        <Text style={styles.muted}>
                          Synced position: {formatClockSeconds(displayPos)}
                          {roomState.changedBy ? ` · Set by ${roomState.changedBy}` : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void handleOpenExternalYouTube()}
                        style={styles.openYtBtn}
                      >
                        <Ionicons name="open-outline" size={15} color={colors.text} />
                        <Text style={styles.openYtText}>YouTube</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    No active track. Paste a YouTube link below to start playing together.
                  </Text>
                )}

                <View style={styles.ytControlsRow}>
                  <Pressable
                    onPress={() => youtubePlay(displayPos)}
                    style={styles.ytCtrlBtn}
                  >
                    <Ionicons name="play" size={18} color={colors.text} />
                    <Text style={styles.ytCtrlText}>Play</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => youtubePause(displayPos)}
                    style={styles.ytCtrlBtn}
                  >
                    <Ionicons name="pause" size={18} color={colors.text} />
                    <Text style={styles.ytCtrlText}>Pause</Text>
                  </Pressable>
                  <Pressable onPress={youtubeNext} style={styles.ytCtrlBtn}>
                    <Ionicons name="play-skip-forward" size={18} color={colors.text} />
                    <Text style={styles.ytCtrlText}>Next</Text>
                  </Pressable>
                  <Pressable onPress={requestSync} style={styles.ytCtrlBtn}>
                    <Ionicons name="sync" size={18} color={colors.primaryBright} />
                    <Text style={styles.ytCtrlText}>Sync</Text>
                  </Pressable>
                </View>
              </Card>

              {/* Play Now & Add to Queue */}
              <Card variant="elevated" style={styles.stackSm}>
                <Text style={styles.sectionTitle}>Add Tracks</Text>
                <View style={styles.urlRow}>
                  <TextInput
                    style={styles.urlInput}
                    placeholder="Paste YouTube URL to play now..."
                    placeholderTextColor={colors.textMuted}
                    value={playUrlInput}
                    onChangeText={setPlayUrlInput}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={handlePlayNow} style={styles.urlSubmitBtn}>
                    <Text style={styles.urlSubmitText}>Play</Text>
                  </Pressable>
                </View>

                <View style={styles.urlRow}>
                  <TextInput
                    style={styles.urlInput}
                    placeholder="Paste YouTube URL to queue..."
                    placeholderTextColor={colors.textMuted}
                    value={queueUrlInput}
                    onChangeText={setQueueUrlInput}
                    autoCapitalize="none"
                  />
                  <Pressable onPress={handleAddQueue} style={styles.urlSubmitBtnSecondary}>
                    <Text style={styles.urlSubmitText}>Add</Text>
                  </Pressable>
                </View>
              </Card>

              {/* Queue List */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Shared Queue</Text>
                <Text style={styles.muted}>{roomState?.queue?.length || 0} tracks</Text>
              </View>

              <Card>
                {!roomState?.queue?.length ? (
                  <Text style={styles.emptyText}>Queue is empty.</Text>
                ) : (
                  <View style={styles.stackSm}>
                    {roomState.queue.map((track, idx) => (
                      <View key={track.id} style={styles.queueItem}>
                        <Text style={styles.queueIndex}>#{idx + 1}</Text>
                        <View style={styles.flexOne}>
                          <Text style={styles.queueTitle} numberOfLines={1}>
                            {track.title || track.videoId}
                          </Text>
                          {track.addedBy ? (
                            <Text style={styles.muted}>Added by {track.addedBy}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          onPress={() => removeFromYoutubeQueue(track.id)}
                          hitSlop={10}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  segmentWrap: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.lg,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.text,
  },
  gap: {
    marginBottom: spacing.md,
  },
  stack: {
    gap: spacing.md,
  },
  stackSm: {
    gap: spacing.sm + 2,
  },
  disabledCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  disabledTitle: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  disabledSub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.heading,
    fontSize: 16,
    color: colors.text,
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  gameTitle: {
    ...typography.heading,
    color: colors.text,
  },
  muted: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  optionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  optChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  optChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  optChipTextActive: {
    color: colors.primaryBright,
    fontWeight: "700",
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  inviteTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontSize: 14,
  },
  inlineBtns: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  acceptPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  acceptText: {
    ...typography.caption,
    color: colors.onPrimary,
    fontWeight: "700",
    fontSize: 12,
  },
  declinePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  declineText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
    fontSize: 12,
  },
  clearLoungeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  clearLoungeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.danger,
    fontWeight: "600",
  },
  matchRowCard: {
    gap: spacing.sm,
  },
  matchTitle: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  flexOne: {
    flex: 1,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  ytThumb: {
    width: "100%",
    height: 175,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
  },
  ytMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ytId: {
    ...typography.mono,
    color: colors.text,
    fontSize: 13,
  },
  openYtBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  openYtText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 12,
  },
  ytControlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ytCtrlBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(11, 14, 20, 0.65)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  ytCtrlText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text,
  },
  urlRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  urlInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
    fontSize: 13,
  },
  urlSubmitBtn: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  urlSubmitBtnSecondary: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  urlSubmitText: {
    ...typography.caption,
    color: colors.onPrimary,
    fontWeight: "700",
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueIndex: {
    ...typography.mono,
    color: colors.primaryBright,
    fontSize: 12,
    width: 26,
  },
  queueTitle: {
    ...typography.bodyMedium,
    fontSize: 14,
    color: colors.text,
  },
});
