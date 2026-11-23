import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Card } from "@/components";
import { gameSounds } from "@/services/gameSounds";
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

// Standard 3x3 normalized pip coordinates inside a 64x64 die face
const DICE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[32, 32]],
  2: [[19, 19], [45, 45]],
  3: [[19, 19], [32, 32], [45, 45]],
  4: [[19, 19], [45, 19], [19, 45], [45, 45]],
  5: [[19, 19], [45, 19], [32, 32], [19, 45], [45, 45]],
  6: [[19, 17], [45, 17], [19, 32], [45, 32], [19, 47], [45, 47]],
};

function DiceFaceSvg({
  value,
  size = 64,
  accentColor,
  isSix,
}: {
  value: number;
  size?: number;
  accentColor: string;
  isSix: boolean;
}) {
  const face = Math.min(6, Math.max(1, Math.round(value || 1)));
  const pips = DICE_PIPS[face] ?? DICE_PIPS[1] ?? [[32, 32]];

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <SvgLinearGradient id="diceBodyGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="65%" stopColor="#F1F5F9" />
          <Stop offset="100%" stopColor="#CBD5E1" />
        </SvgLinearGradient>
        <SvgLinearGradient id="diceGlossGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgLinearGradient>
      </Defs>

      {/* Outer die bevel */}
      <Rect
        x={2}
        y={2}
        width={60}
        height={60}
        rx={14}
        fill="url(#diceBodyGrad)"
        stroke={isSix ? "#FBBF24" : accentColor}
        strokeWidth={isSix ? 3 : 2.2}
      />

      {/* Inner recessed face highlight */}
      <Rect
        x={6}
        y={5}
        width={52}
        height={24}
        rx={10}
        fill="url(#diceGlossGrad)"
      />

      {/* Crisp die pips */}
      {pips.map(([cx, cy], idx) => (
        <G key={`pip-${face}-${idx}`}>
          {/* Subtle inner rim */}
          <Circle
            cx={cx}
            cy={cy + 0.9}
            r={face === 1 ? 7.8 : 5.4}
            fill="#FFFFFF"
            fillOpacity={0.7}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={face === 1 ? 7.4 : 5.2}
            fill={face === 1 ? "#DC2626" : face === 6 ? "#1E3A8A" : "#0F172A"}
          />
        </G>
      ))}
    </Svg>
  );
}

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

  const actualDice = state.diceValue ?? state.lastDiceValue ?? 6;
  const [displayFace, setDisplayFace] = useState<number>(actualDice);
  const [isRollingAnim, setIsRollingAnim] = useState(false);

  const prevRollIdRef = useRef<number>(state.rollId || 0);
  const prevMoveSeqRef = useRef<number>(state.moveSeq || 0);
  const prevStatusRef = useRef<string>(state.status);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestActualDiceRef = useRef<number>(actualDice);
  latestActualDiceRef.current = actualDice;

  // Reanimated shared values for 3D-feel tumble & bounce
  const rotDeg = useSharedValue(0);
  const bounceY = useSharedValue(0);
  const diceScale = useSharedValue(1);

  const diceAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bounceY.value },
      { rotate: `${rotDeg.value}deg` },
      { scale: diceScale.value },
    ],
  }));

  useEffect(() => {
    gameSounds.preloadAll();
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollStopTimerRef.current) clearTimeout(rollStopTimerRef.current);
    };
  }, []);

  const triggerDiceRollFeedback = useCallback(
    (finalFace?: number | null) => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollStopTimerRef.current) clearTimeout(rollStopTimerRef.current);

      setIsRollingAnim(true);
      void gameSounds.play("ludoRoll", 180);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

      // Juicy multi-bounce tumble animation
      rotDeg.value = withSequence(
        withTiming(-28, { duration: 75 }),
        withTiming(24, { duration: 80 }),
        withTiming(-18, { duration: 80 }),
        withTiming(14, { duration: 85 }),
        withTiming(-8, { duration: 75 }),
        withSpring(0, { damping: 12, stiffness: 220 })
      );
      bounceY.value = withSequence(
        withTiming(-14, { duration: 110 }),
        withTiming(3, { duration: 95 }),
        withTiming(-8, { duration: 95 }),
        withTiming(2, { duration: 85 }),
        withSpring(0, { damping: 14, stiffness: 240 })
      );
      diceScale.value = withSequence(
        withTiming(1.18, { duration: 110 }),
        withTiming(0.92, { duration: 100 }),
        withTiming(1.1, { duration: 100 }),
        withSpring(1, { damping: 12, stiffness: 220 })
      );

      let tick = 0;
      rollIntervalRef.current = setInterval(() => {
        tick++;
        const nextRandom = ((tick * 2 + Math.floor(Math.random() * 5)) % 6) + 1;
        setDisplayFace(nextRandom);
      }, 65);

      rollStopTimerRef.current = setTimeout(() => {
        if (rollIntervalRef.current) {
          clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        const resolved = finalFace ?? latestActualDiceRef.current ?? 1;
        setDisplayFace(resolved);
        setIsRollingAnim(false);
        if (resolved === 6) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined
          );
        }
      }, 480);
    },
    [bounceY, diceScale, rotDeg]
  );

  // Sync visual dice & sound whenever ANY player rolls (server rollId increments)
  useEffect(() => {
    const nextRollId = state.rollId || 0;
    if (nextRollId > prevRollIdRef.current) {
      prevRollIdRef.current = nextRollId;
      triggerDiceRollFeedback(state.diceValue ?? state.lastDiceValue ?? 1);
    } else if (!isRollingAnim && (state.diceValue || state.lastDiceValue)) {
      setDisplayFace(state.diceValue ?? state.lastDiceValue ?? 1);
    }
  }, [state.rollId, state.diceValue, state.lastDiceValue, isRollingAnim, triggerDiceRollFeedback]);

  // Trigger move / capture / win sound effects when board state advances
  useEffect(() => {
    const nextMoveSeq = state.moveSeq || 0;
    if (nextMoveSeq > prevMoveSeqRef.current) {
      prevMoveSeqRef.current = nextMoveSeq;
      const actionLower = (state.lastAction || "").toLowerCase();
      if (actionLower.includes("captur") || actionLower.includes("sent back") || actionLower.includes("knock")) {
        void gameSounds.play("ludoCapture", 100);
      } else {
        void gameSounds.play("ludoStep", 90);
      }
    }

    if (prevStatusRef.current !== "completed" && state.status === "completed") {
      void gameSounds.play("ludoWin", 200);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
    }
    prevStatusRef.current = state.status;
  }, [state.moveSeq, state.lastAction, state.status]);

  const handleTapRoll = () => {
    if (!canRollNow || isRollingAnim) return;
    triggerDiceRollFeedback(null);
    onRoll();
  };

  const activeTurnHex = COLOR_HEX[state.turnColor] || colors.primaryBright;
  const shownDiceValue = isRollingAnim ? displayFace : (state.diceValue ?? state.lastDiceValue ?? displayFace);

  return (
    <View style={styles.wrap}>
      {/* Turn & Action Banner */}
      <Card variant="elevated" style={styles.turnCard}>
        <View style={styles.turnRow}>
          <View style={[styles.turnDot, { backgroundColor: activeTurnHex }]} />
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
          {/* Base board */}
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
                <G
                  key={`${col}-${tIdx}`}
                  onPress={
                    isMovable
                      ? () => {
                          void Haptics.selectionAsync().catch(() => undefined);
                          onMoveToken(tIdx);
                        }
                      : undefined
                  }
                >
                  {isMovable ? (
                    <Circle
                      cx={cx}
                      cy={cy}
                      r={cell * 0.56}
                      fill="rgba(255,255,255,0.22)"
                      stroke="#FFFFFF"
                      strokeWidth={2.5}
                    />
                  ) : null}
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={cell * 0.37}
                    fill={COLOR_HEX[col]}
                    stroke="#0F172A"
                    strokeWidth={1.6}
                  />
                  <SvgText
                    x={cx}
                    y={cy + 3.5}
                    fill="#FFFFFF"
                    fontSize={9.5}
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

      {/* Visual Animated 3D Dice & Move Controls */}
      <Card variant="elevated" style={styles.diceCard}>
        <Pressable
          disabled={!canRollNow || isRollingAnim}
          onPress={handleTapRoll}
          style={({ pressed }) => [
            styles.diceTray,
            canRollNow && styles.diceTrayReady,
            pressed && canRollNow && { opacity: 0.92 },
          ]}
          accessibilityLabel="Roll Ludo dice"
        >
          <Animated.View style={diceAnimStyle}>
            <DiceFaceSvg
              value={shownDiceValue}
              size={62}
              accentColor={canRollNow ? activeTurnHex : "#64748B"}
              isSix={!isRollingAnim && shownDiceValue === 6}
            />
          </Animated.View>
          <Text style={[styles.diceSub, canRollNow && styles.diceSubReady]}>
            {isRollingAnim ? "ROLLING…" : canRollNow ? "TAP TO ROLL" : `ROLLED ${shownDiceValue}`}
          </Text>
        </Pressable>

        <View style={styles.flexOne}>
          <Text style={styles.diceHeading}>
            {isRollingAnim
              ? "Rolling the die…"
              : canRollNow
                ? "Tap the die to roll!"
                : mustMoveNow
                  ? `Rolled ${state.diceValue} — Choose a token:`
                  : state.diceValue
                    ? `Last roll: ${state.diceValue}`
                    : "Wait for next roll"}
          </Text>

          {mustMoveNow && !isRollingAnim ? (
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
                    { backgroundColor: activeTurnHex },
                  ]}
                >
                  <Text style={styles.tokenBtnText}>Token #{tIdx + 1}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>
              {canRollNow
                ? "Roll a 6 to bring a token out of your yard."
                : mustMoveNow
                  ? "Tap a glowing token on the board or below."
                  : "Roll a 6 to get a bonus turn."}
            </Text>
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
  diceTray: {
    width: 92,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  diceTrayReady: {
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    borderColor: colors.cyan,
  },
  diceSub: {
    fontSize: 9.5,
    fontWeight: "800",
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  diceSubReady: {
    color: colors.cyan,
  },
  diceHeading: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "700",
    marginBottom: 6,
  },
  tokenBtnsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tokenBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
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
