import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Card } from "@/components";
import { colors, radii, spacing, typography } from "@/theme";
import type { TicTacToeState } from "@/types";

interface TicTacToeBoardProps {
  state: TicTacToeState;
  currentUsername: string;
  onMove: (cellIndex: number) => void;
}

export function TicTacToeBoard({ state, currentUsername, onMove }: TicTacToeBoardProps) {
  const myTurn =
    state.status === "active" &&
    state.turnUsername.toLowerCase() === currentUsername.toLowerCase();
  const winSet = new Set(state.winningLine || []);

  const p0 = state.players[0] || "Player X";
  const p1 = state.players[1] || "Player O";

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreRow}>
        <Card style={[styles.scoreCard, state.turn === "X" && state.status === "active" && styles.activeCard]}>
          <Text style={[styles.markBadge, { color: colors.cyan }]}>X</Text>
          <Text style={styles.playerName} numberOfLines={1}>
            {p0}
          </Text>
          <Text style={styles.scoreNum}>{state.scores?.[p0] ?? 0} wins</Text>
        </Card>

        <Card style={styles.drawCard}>
          <Text style={styles.drawLabel}>Draws</Text>
          <Text style={styles.drawNum}>{state.scores?.draws ?? 0}</Text>
        </Card>

        <Card style={[styles.scoreCard, state.turn === "O" && state.status === "active" && styles.activeCard]}>
          <Text style={[styles.markBadge, { color: "#FB7185" }]}>O</Text>
          <Text style={styles.playerName} numberOfLines={1}>
            {p1}
          </Text>
          <Text style={styles.scoreNum}>{state.scores?.[p1] ?? 0} wins</Text>
        </Card>
      </View>

      <Text style={styles.turnBanner}>
        {state.status === "active"
          ? myTurn
            ? `Your turn (${state.turn})`
            : `Waiting for ${state.turnUsername} (${state.turn})`
          : state.winner === "draw"
            ? "Round ended in a Draw"
            : `${state.winnerUsername || state.winner} Wins!`}
      </Text>

      <View style={styles.grid}>
        {state.board.map((cell, idx) => {
          const isWin = winSet.has(idx);
          const isLast = state.lastMoveIndex === idx;
          const canTap = myTurn && cell === null;

          return (
            <Pressable
              key={idx}
              disabled={!canTap}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                onMove(idx);
              }}
              style={({ pressed }) => [
                styles.cell,
                isLast && styles.cellLast,
                isWin && styles.cellWin,
                pressed && canTap && styles.cellPressed,
              ]}
            >
              {cell ? (
                <Text
                  style={[
                    styles.cellText,
                    { color: cell === "X" ? colors.cyan : "#FB7185" },
                  ]}
                >
                  {cell}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  scoreRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  scoreCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  activeCard: {
    borderColor: colors.primaryBorder,
  },
  drawCard: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  markBadge: {
    fontSize: 18,
    fontWeight: "800",
  },
  playerName: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  scoreNum: {
    fontSize: 11,
    color: colors.textMuted,
  },
  drawLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  drawNum: {
    ...typography.heading,
    color: colors.text,
  },
  turnBanner: {
    ...typography.heading,
    color: colors.primaryBright,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "center",
    width: 288,
    height: 288,
    gap: 10,
    justifyContent: "center",
  },
  cell: {
    width: 88,
    height: 88,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLast: {
    borderColor: colors.primaryBorder,
  },
  cellWin: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  cellPressed: {
    backgroundColor: colors.surfacePressed,
  },
  cellText: {
    fontSize: 40,
    fontWeight: "800",
  },
});
