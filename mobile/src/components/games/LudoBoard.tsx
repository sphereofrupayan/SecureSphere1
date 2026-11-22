import React from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { Card } from "@/components";
import { colors, radii, spacing, typography } from "@/theme";
import type { LudoColor, LudoState } from "@/types";

const LUDO_TRACK_COORDS: Array<[number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

const LUDO_HOME_STRETCH: Record<LudoColor, Array<[number, number]>> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

const LUDO_YARD_SLOTS: Record<LudoColor, Array<[number, number]>> = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

const LUDO_FINISH_SLOTS: Record<LudoColor, [number, number]> = {
  red: [7, 6],
  green: [6, 7],
  yellow: [7, 8],
  blue: [8, 7],
};

const LUDO_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

const COLOR_HEX: Record<LudoColor, string> = {
  red: "#E53935",
  green: "#43A047",
  yellow: "#FBC02D",
  blue: "#1E88E5",
};

function getTokenGridCoord(color: LudoColor, tokenIdx: number, step: number): [number, number] {
  if (step === -1) {
    return LUDO_YARD_SLOTS[color][tokenIdx] ?? [1.5, 1.5];
  }
  if (step >= 0 && step <= 50) {
    const gIdx = (LUDO_START_OFFSET[color] + step) % 52;
    return LUDO_TRACK_COORDS[gIdx] ?? [6, 1];
  }
  if (step >= 51 && step <= 55) {
    return LUDO_HOME_STRETCH[color][step - 51] ?? [7, 5];
  }
  return LUDO_FINISH_SLOTS[color];
}

interface LudoBoardProps {
  state: LudoState;
  currentUsername: string;
  onRoll: () => void;
  onMoveToken: (tokenIndex: number) => void;
}

export function LudoBoard({ state, currentUsername, onRoll, onMoveToken }: LudoBoardProps) {
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - spacing.lg * 2, 360);
  const cell = boardPx / 15;

  const isMyTurn =
    state.status === "active" &&
    state.turnUsername.toLowerCase() === currentUsername.toLowerCase();
  const canRollNow = isMyTurn && state.canRoll;
  const mustMoveNow = isMyTurn && state.mustMove && state.validTokenIndices.length > 0;

  return (
    <View style={styles.wrap}>
      {/* Turn & Action Banner */}
      <Card variant="elevated" style={styles.turnCard}>
        <View style={styles.turnRow}>
          <View
            style={[
              styles.turnDot,
              { backgroundColor: COLOR_HEX[state.turnColor] || colors.primary },
            ]}
          />
          <View style={styles.flexOne}>
            <Text style={styles.turnTitle}>
              {state.status === "completed"
                ? `Winner: ${state.winnerUsername || state.winner}`
                : isMyTurn
                  ? "Your Turn"
                  : `${state.turnUsername}'s Turn (${state.turnColor.toUpperCase()})`}
            </Text>
            {state.lastAction ? (
              <Text style={styles.muted} numberOfLines={2}>
                {state.lastAction}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* 15x15 SVG Ludo Board */}
      <View style={[styles.boardWrap, { width: boardPx, height: boardPx }]}>
        <Svg width={boardPx} height={boardPx}>
          {/* Base white/slate board */}
          <Rect x={0} y={0} width={boardPx} height={boardPx} fill="#1E293B" />

          {/* Track squares */}
          {LUDO_TRACK_COORDS.map(([r, c], idx) => (
            <Rect
              key={`t-${idx}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill={
                idx === 0
                  ? COLOR_HEX.red
                  : idx === 13
                    ? COLOR_HEX.green
                    : idx === 26
                      ? COLOR_HEX.yellow
                      : idx === 39
                        ? COLOR_HEX.blue
                        : "#F1F5F9"
              }
              stroke="#94A3B8"
              strokeWidth={0.6}
            />
          ))}

          {/* Home Stretches */}
          {(["red", "green", "yellow", "blue"] as const).map(col =>
            LUDO_HOME_STRETCH[col].map(([r, c], i) => (
              <Rect
                key={`h-${col}-${i}`}
                x={c * cell}
                y={r * cell}
                width={cell}
                height={cell}
                fill={COLOR_HEX[col]}
                fillOpacity={0.85}
                stroke="#0F172A"
                strokeWidth={0.6}
              />
            ))
          )}

          {/* 4 Corner Yards */}
          <Rect x={0} y={0} width={cell * 6} height={cell * 6} fill={COLOR_HEX.red} />
          <Rect x={cell * 9} y={0} width={cell * 6} height={cell * 6} fill={COLOR_HEX.green} />
          <Rect x={cell * 9} y={cell * 9} width={cell * 6} height={cell * 6} fill={COLOR_HEX.yellow} />
          <Rect x={0} y={cell * 9} width={cell * 6} height={cell * 6} fill={COLOR_HEX.blue} />

          {/* Yard Inner White Panels */}
          <Rect x={cell * 0.8} y={cell * 0.8} width={cell * 4.4} height={cell * 4.4} rx={8} fill="#FFFFFF" />
          <Rect x={cell * 9.8} y={cell * 0.8} width={cell * 4.4} height={cell * 4.4} rx={8} fill="#FFFFFF" />
          <Rect x={cell * 9.8} y={cell * 9.8} width={cell * 4.4} height={cell * 4.4} rx={8} fill="#FFFFFF" />
          <Rect x={cell * 0.8} y={cell * 9.8} width={cell * 4.4} height={cell * 4.4} rx={8} fill="#FFFFFF" />

          {/* Center Home Triangles */}
          <Polygon
            points={`${cell * 6},${cell * 6} ${cell * 7.5},${cell * 7.5} ${cell * 6},${cell * 9}`}
            fill={COLOR_HEX.red}
          />
          <Polygon
            points={`${cell * 6},${cell * 6} ${cell * 9},${cell * 6} ${cell * 7.5},${cell * 7.5}`}
            fill={COLOR_HEX.green}
          />
          <Polygon
            points={`${cell * 9},${cell * 6} ${cell * 9},${cell * 9} ${cell * 7.5},${cell * 7.5}`}
            fill={COLOR_HEX.yellow}
          />
          <Polygon
            points={`${cell * 6},${cell * 9} ${cell * 9},${cell * 9} ${cell * 7.5},${cell * 7.5}`}
            fill={COLOR_HEX.blue}
          />

          {/* Active Tokens */}
          {state.activeColors.map(col => {
            const arr = state.tokens?.[col] || [];
            return arr.map((step, tIdx) => {
              const [r, c] = getTokenGridCoord(col, tIdx, step);
              const cx = (c + 0.5) * cell;
              const cy = (r + 0.5) * cell;
              const isMovable =
                mustMoveNow &&
                col === state.turnColor &&
                state.validTokenIndices.includes(tIdx);

              return (
                <G key={`${col}-${tIdx}`}>
                  {isMovable ? (
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={cell * 0.52}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={2.5}
                    />
                  ) : null}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={cell * 0.36}
                    fill={COLOR_HEX[col]}
                    stroke="#0F172A"
                    strokeWidth={1.6}
                  />
                  <SvgText
                    x={cx}
                    y={cy + 3.5}
                    fill="#FFFFFF"
                    fontSize={9}
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {tIdx + 1}
                  </SvgText>
                </G>
              );
            });
          })}
        </Svg>
      </View>

      {/* Dice & Move Controls */}
      <Card variant="elevated" style={styles.diceCard}>
        <Pressable
          disabled={!canRollNow}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            onRoll();
          }}
          style={[styles.diceBtn, canRollNow && styles.diceBtnReady]}
        >
          <Text style={styles.diceNum}>{state.diceValue ?? state.lastDiceValue ?? "🎲"}</Text>
          <Text style={styles.diceSub}>{canRollNow ? "TAP TO ROLL" : "DICE"}</Text>
        </Pressable>

        <View style={styles.flexOne}>
          <Text style={styles.diceHeading}>
            {canRollNow
              ? "Roll the dice!"
              : mustMoveNow
                ? `Rolled ${state.diceValue} — Choose a token:`
                : "Wait for next roll"}
          </Text>

          {mustMoveNow ? (
            <View style={styles.tokenBtnsRow}>
              {state.validTokenIndices.map(tIdx => (
                <Pressable
                  key={tIdx}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    onMoveToken(tIdx);
                  }}
                  style={[
                    styles.tokenBtn,
                    { backgroundColor: COLOR_HEX[state.turnColor] || colors.primary },
                  ]}
                >
                  <Text style={styles.tokenBtnText}>Token #{tIdx + 1}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>Roll a 6 to bring a token out of your yard.</Text>
          )}
        </View>
      </Card>

      {/* Players HUD */}
      <Card>
        <View style={styles.hudList}>
          {state.activeColors.map(col => {
            const uname = state.colorPlayers?.[col] || col;
            const homeCount = (state.tokens?.[col] || []).filter(s => s === 56).length;
            return (
              <View key={col} style={styles.hudRow}>
                <View style={[styles.hudSwatch, { backgroundColor: COLOR_HEX[col] }]} />
                <Text style={styles.hudName}>{uname}</Text>
                <Text style={styles.muted}>{homeCount}/4 Home</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  turnCard: {
    paddingVertical: spacing.md,
  },
  turnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  turnDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  flexOne: {
    flex: 1,
  },
  turnTitle: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
  },
  muted: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  boardWrap: {
    alignSelf: "center",
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  diceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  diceBtn: {
    width: 78,
    height: 78,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  diceBtnReady: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBright,
  },
  diceNum: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  diceSub: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.primaryBright,
    marginTop: 2,
  },
  diceHeading: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
    marginBottom: 6,
  },
  tokenBtnsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tokenBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  tokenBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  hudList: {
    gap: spacing.sm,
  },
  hudRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  hudSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  hudName: {
    ...typography.bodyMedium,
    color: colors.text,
    flex: 1,
  },
});
