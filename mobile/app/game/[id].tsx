import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, FeedbackBanner, ScreenContainer, StatusBadge } from "@/components";
import { ChessBoard } from "@/components/games/ChessBoard";
import { LudoBoard } from "@/components/games/LudoBoard";
import { TicTacToeBoard } from "@/components/games/TicTacToeBoard";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { gameSounds } from "@/services/gameSounds";
import { colors, radii, spacing, typography } from "@/theme";
import type { ChessState, LudoState, TicTacToeState } from "@/types";

export default function GameArenaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const {
    gamesLobby,
    members,
    inviteGamePlayer,
    startGameMatch,
    leaveGameMatch,
    makeGameMove,
    rollLudoDice,
    sendChessAction,
    rematchGame,
  } = useRoom();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => gameSounds.isMuted());

  const toggleSound = () => {
    const next = !soundMuted;
    gameSounds.setMuted(next);
    setSoundMuted(next);
  };

  const match = useMemo(
    () => (gamesLobby?.matches || []).find(m => m.id === id) || null,
    [gamesLobby?.matches, id]
  );

  const myUsername = user?.username || "";
  const myLower = myUsername.toLowerCase();

  if (!match) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.missingWrap}>
          <Ionicons name="game-controller-outline" size={44} color={colors.textMuted} />
          <Text style={styles.title}>Match Not Found</Text>
          <Text style={styles.subtitle}>This match may have ended or been closed.</Text>
          <Button label="Back to Lounge" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScreenContainer>
    );
  }

  const isHost = match.hostUsername.toLowerCase() === myLower;
  const isPlayer = match.players.some(p => p.toLowerCase() === myLower);

  const invitablePlayers = members.filter(
    m => !match.players.some(p => p.toLowerCase() === m.username.toLowerCase())
  );

  const handleInvite = async (target: string) => {
    setErrorMsg(null);
    const res = await inviteGamePlayer(match.id, target);
    if (!res.ok) setErrorMsg(res.error || "Unable to send invite.");
    else setInfoMsg(`Invited ${target} to join.`);
  };

  const handleStartNow = async () => {
    setBusy(true);
    setErrorMsg(null);
    const res = await startGameMatch(match.id);
    setBusy(false);
    if (!res.ok) setErrorMsg(res.error || "Unable to start match.");
  };

  const handleLeave = async () => {
    await leaveGameMatch(match.id);
    router.back();
  };

  const handleMove = async (move: unknown) => {
    setErrorMsg(null);
    const res = await makeGameMove(match.id, move);
    if (!res.ok) setErrorMsg(res.error || "Move rejected.");
  };

  const handleLudoRoll = async () => {
    setErrorMsg(null);
    const res = await rollLudoDice(match.id);
    if (!res.ok) setErrorMsg(res.error || "Cannot roll dice right now.");
  };

  const handleChessAction = async (action: string) => {
    setErrorMsg(null);
    const res = await sendChessAction(match.id, action);
    if (!res.ok) setErrorMsg(res.error || "Action failed.");
  };

  const handleRematch = async () => {
    setBusy(true);
    setErrorMsg(null);
    const res = await rematchGame(match.id);
    setBusy(false);
    if (!res.ok) setErrorMsg(res.error || "Unable to start rematch.");
  };

  return (
    <ScreenContainer scroll edges={["top", "bottom", "left", "right"]}>
      {/* Top Bar */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>{match.gameType.toUpperCase()}</Text>
          <Text style={styles.subtitle}>
            {match.players.join(" vs ")} · {match.spectators.length} watching
          </Text>
        </View>
        <Pressable
          onPress={toggleSound}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityLabel={soundMuted ? "Unmute game sounds" : "Mute game sounds"}
        >
          <Ionicons
            name={soundMuted ? "volume-mute-outline" : "volume-high-outline"}
            size={18}
            color={soundMuted ? colors.textMuted : colors.cyan}
          />
        </Pressable>
        <Pressable onPress={() => void handleLeave()} style={styles.leavePill}>
          <Text style={styles.leaveText}>Leave</Text>
        </Pressable>
      </View>

      {errorMsg ? (
        <View style={styles.gap}>
          <FeedbackBanner tone="error" message={errorMsg} onDismiss={() => setErrorMsg(null)} />
        </View>
      ) : null}

      {infoMsg ? (
        <View style={styles.gap}>
          <FeedbackBanner tone="success" message={infoMsg} onDismiss={() => setInfoMsg(null)} />
        </View>
      ) : null}

      {/* Waiting Room */}
      {match.status === "waiting" ? (
        <Card variant="elevated" style={styles.waitingCard}>
          <StatusBadge label="Waiting for Players" tone="warning" showDot />
          <Text style={styles.waitingTitle}>
            Joined ({match.players.length}): {match.players.join(", ")}
          </Text>
          <Text style={styles.subtitle}>
            Invite online room members below to start playing.
          </Text>

          {invitablePlayers.length > 0 ? (
            <View style={styles.inviteChips}>
              {invitablePlayers.map(p => (
                <Pressable
                  key={p.username}
                  onPress={() => void handleInvite(p.username)}
                  style={styles.inviteChip}
                >
                  <Ionicons name="person-add-outline" size={14} color={colors.primaryBright} />
                  <Text style={styles.inviteChipText}>Invite {p.username}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>No other online members available to invite right now.</Text>
          )}

          {isHost && match.players.length >= 2 ? (
            <Button
              label="Start Match Now"
              loading={busy}
              onPress={() => void handleStartNow()}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Result Banner */}
      {match.status === "completed" ? (
        <Card variant="accent" style={styles.resultCard}>
          <Text style={styles.resultTitle}>
            {match.winner === "draw"
              ? "Match Drawn"
              : `${match.winner || "Player"} Wins!`}
          </Text>
          {isPlayer ? (
            <Button
              label="Play Rematch"
              loading={busy}
              onPress={() => void handleRematch()}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Game Stages */}
      {match.state && match.gameType === "tictactoe" ? (
        <TicTacToeBoard
          state={match.state as TicTacToeState}
          currentUsername={myUsername}
          onMove={cellIndex => void handleMove({ cellIndex })}
        />
      ) : null}

      {match.state && match.gameType === "chess" ? (
        <ChessBoard
          state={match.state as ChessState}
          currentUsername={myUsername}
          onMove={payload => void handleMove(payload)}
          onAction={action => void handleChessAction(action)}
        />
      ) : null}

      {match.state && match.gameType === "ludo" ? (
        <LudoBoard
          state={match.state as LudoState}
          currentUsername={myUsername}
          onRoll={() => void handleLudoRoll()}
          onMoveToken={tokenIndex => void handleMove({ tokenIndex })}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    ...typography.heading,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  leavePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  leaveText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: "600",
    fontSize: 12,
  },
  gap: {
    marginBottom: spacing.md,
  },
  waitingCard: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  waitingTitle: {
    ...typography.heading,
    color: colors.text,
  },
  inviteChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  inviteChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  inviteChipText: {
    ...typography.caption,
    color: colors.primaryBright,
    fontWeight: "600",
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  resultCard: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  resultTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: "center",
  },
  missingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
});
