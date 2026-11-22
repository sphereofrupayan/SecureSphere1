import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Button, Card, StatusBadge } from "@/components";
import { colors, radii, spacing, typography } from "@/theme";
import type { ChessColor, ChessPieceType, ChessState } from "@/types";

const PIECE_GLYPHS: Record<ChessColor, Record<ChessPieceType, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

function formatChessClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

interface ChessBoardProps {
  state: ChessState;
  currentUsername: string;
  onMove: (payload: {
    from: { r: number; c: number };
    to: { r: number; c: number };
    promotion?: ChessPieceType;
  }) => void;
  onAction: (action: string) => void;
}

export function ChessBoard({ state, currentUsername, onMove, onAction }: ChessBoardProps) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.lg * 2, 380);
  const sqSize = Math.floor(boardSize / 8);

  const myColor: ChessColor | null = useMemo(() => {
    const me = currentUsername.toLowerCase();
    if (state.players.w.toLowerCase() === me) return "w";
    if (state.players.b.toLowerCase() === me) return "b";
    return null;
  }, [currentUsername, state.players.b, state.players.w]);

  const [flipped, setFlipped] = useState(myColor === "b");
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{
    from: { r: number; c: number };
    to: { r: number; c: number };
  } | null>(null);
  const [liveClocks, setLiveClocks] = useState(state.clocks);

  useEffect(() => {
    setSelected(null);
    setLiveClocks(state.clocks);
  }, [state]);

  useEffect(() => {
    if (state.status !== "active" || state.moveHistory.length === 0) return;
    const timer = setInterval(() => {
      const elapsed = Math.max(0, Date.now() - (state.lastTimestamp || Date.now()));
      setLiveClocks({
        w: state.turn === "w" ? Math.max(0, state.clocks.w - elapsed) : state.clocks.w,
        b: state.turn === "b" ? Math.max(0, state.clocks.b - elapsed) : state.clocks.b,
      });
    }, 500);
    return () => clearInterval(timer);
  }, [state.clocks, state.lastTimestamp, state.moveHistory.length, state.status, state.turn]);

  const isMyTurn = state.status === "active" && myColor === state.turn;

  const handleSquareTap = (r: number, c: number) => {
    if (!isMyTurn || !myColor) return;
    const piece = state.board[r]?.[c] ?? null;

    if (selected) {
      if (selected.r === r && selected.c === c) {
        setSelected(null);
        return;
      }
      if (piece && piece.color === myColor) {
        setSelected({ r, c });
        return;
      }

      const movingPiece = state.board[selected.r]?.[selected.c];
      const isPawnPromo =
        movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && r === 0) || (movingPiece.color === "b" && r === 7));

      void Haptics.selectionAsync().catch(() => undefined);
      if (isPawnPromo) {
        setPendingPromo({ from: selected, to: { r, c } });
        setSelected(null);
        return;
      }

      onMove({ from: selected, to: { r, c } });
      setSelected(null);
      return;
    }

    if (piece && piece.color === myColor) {
      void Haptics.selectionAsync().catch(() => undefined);
      setSelected({ r, c });
    }
  };

  const topColor: ChessColor = flipped ? "w" : "b";
  const bottomColor: ChessColor = flipped ? "b" : "w";

  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const hasIncomingDraw =
    state.pendingDraw &&
    state.pendingDraw.offeredBy.toLowerCase() !== currentUsername.toLowerCase() &&
    myColor !== null;
  const hasIncomingUndo =
    state.pendingUndo &&
    state.pendingUndo.requestedBy.toLowerCase() !== currentUsername.toLowerCase() &&
    myColor !== null;

  return (
    <View style={styles.wrap}>
      {/* Pending Draw / Undo Request Banner */}
      {hasIncomingDraw ? (
        <Card variant="accent" style={styles.promptCard}>
          <Text style={styles.promptText}>
            {state.pendingDraw?.offeredBy} offered a draw.
          </Text>
          <View style={styles.promptBtns}>
            <View style={styles.flexOne}>
              <Button label="Accept Draw" onPress={() => onAction("acceptDraw")} />
            </View>
            <View style={styles.flexOne}>
              <Button
                label="Decline"
                variant="secondary"
                onPress={() => onAction("declineDraw")}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {hasIncomingUndo ? (
        <Card variant="accent" style={styles.promptCard}>
          <Text style={styles.promptText}>
            {state.pendingUndo?.requestedBy} requested an undo.
          </Text>
          <View style={styles.promptBtns}>
            <View style={styles.flexOne}>
              <Button label="Allow Undo" onPress={() => onAction("acceptUndo")} />
            </View>
            <View style={styles.flexOne}>
              <Button
                label="Decline"
                variant="secondary"
                onPress={() => onAction("declineUndo")}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {/* Top Player Bar */}
      <PlayerBar
        name={state.players[topColor]}
        color={topColor}
        clockMs={liveClocks[topColor]}
        isTurn={state.status === "active" && state.turn === topColor}
        captured={state.capturedPieces?.[topColor] || []}
        inCheck={state.inCheck && state.turn === topColor}
      />

      {/* 8x8 Board */}
      <View style={[styles.board, { width: sqSize * 8, height: sqSize * 8 }]}>
        {rows.map(r => (
          <View key={r} style={styles.row}>
            {cols.map(c => {
              const isLight = (r + c) % 2 === 0;
              const piece = state.board[r]?.[c] ?? null;
              const isSelected = selected?.r === r && selected?.c === c;
              const isLast =
                (state.lastMove?.from.r === r && state.lastMove?.from.c === c) ||
                (state.lastMove?.to.r === r && state.lastMove?.to.c === c);

              return (
                <Pressable
                  key={`${r}-${c}`}
                  onPress={() => handleSquareTap(r, c)}
                  style={[
                    styles.square,
                    {
                      width: sqSize,
                      height: sqSize,
                      backgroundColor: isSelected
                        ? "#2563EB"
                        : isLast
                          ? isLight
                            ? "#CBD5E1"
                            : "#475569"
                          : isLight
                            ? "#E2E8F0"
                            : "#334155",
                    },
                  ]}
                >
                  {piece ? (
                    <Text
                      style={[
                        styles.piece,
                        {
                          fontSize: Math.floor(sqSize * 0.72),
                          color: piece.color === "w" ? "#FFFFFF" : "#0F172A",
                          textShadowColor:
                            piece.color === "w" ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.28)",
                        },
                      ]}
                    >
                      {PIECE_GLYPHS[piece.color][piece.type]}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Bottom Player Bar */}
      <PlayerBar
        name={state.players[bottomColor]}
        color={bottomColor}
        clockMs={liveClocks[bottomColor]}
        isTurn={state.status === "active" && state.turn === bottomColor}
        captured={state.capturedPieces?.[bottomColor] || []}
        inCheck={state.inCheck && state.turn === bottomColor}
      />

      {/* Controls */}
      <View style={styles.controlsRow}>
        <Pressable onPress={() => setFlipped(f => !f)} style={styles.ctrlChip}>
          <Text style={styles.ctrlText}>Flip</Text>
        </Pressable>
        {myColor && state.status === "active" ? (
          <>
            <Pressable onPress={() => onAction("requestUndo")} style={styles.ctrlChip}>
              <Text style={styles.ctrlText}>Undo</Text>
            </Pressable>
            <Pressable onPress={() => onAction("offerDraw")} style={styles.ctrlChip}>
              <Text style={styles.ctrlText}>Draw</Text>
            </Pressable>
            <Pressable
              onPress={() => onAction("resign")}
              style={[styles.ctrlChip, styles.ctrlDanger]}
            >
              <Text style={[styles.ctrlText, { color: colors.danger }]}>Resign</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {/* Move History */}
      <Card>
        <Text style={styles.historyTitle}>Moves ({state.moveHistory.length})</Text>
        <Text style={styles.historyBody}>
          {state.moveHistory.length === 0
            ? "No moves played yet."
            : state.moveHistory
                .map((m, idx) => `${idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ` : ""}${m.san || m.notation || ""}`)
                .join("  ")}
        </Text>
      </Card>

      {/* Promotion Modal */}
      <Modal visible={Boolean(pendingPromo)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Card variant="elevated" style={styles.promoCard}>
            <Text style={styles.promptText}>Promote Pawn</Text>
            <View style={styles.promoGrid}>
              {(["q", "r", "b", "n"] as const).map(p => (
                <Pressable
                  key={p}
                  style={styles.promoBtn}
                  onPress={() => {
                    if (pendingPromo) {
                      onMove({ ...pendingPromo, promotion: p });
                    }
                    setPendingPromo(null);
                  }}
                >
                  <Text style={styles.promoGlyph}>{PIECE_GLYPHS[myColor || "w"][p]}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function PlayerBar({
  name,
  color,
  clockMs,
  isTurn,
  captured,
  inCheck,
}: {
  name: string;
  color: ChessColor;
  clockMs: number;
  isTurn: boolean;
  captured: ChessPieceType[];
  inCheck: boolean;
}) {
  const oppColor: ChessColor = color === "w" ? "b" : "w";
  return (
    <View style={[styles.playerBar, isTurn && styles.playerBarActive]}>
      <View style={styles.playerLeft}>
        <View
          style={[
            styles.colorChip,
            { backgroundColor: color === "w" ? "#F8FAFC" : "#1E293B" },
          ]}
        >
          <Text
            style={{
              fontWeight: "800",
              fontSize: 12,
              color: color === "w" ? "#0F172A" : "#F8FAFC",
            }}
          >
            {color.toUpperCase()}
          </Text>
        </View>
        <View style={styles.flexOne}>
          <View style={styles.nameRow}>
            <Text style={styles.playerName} numberOfLines={1}>
              {name}
            </Text>
            {inCheck ? <StatusBadge label="CHECK" tone="danger" /> : null}
          </View>
          {captured.length > 0 ? (
            <Text style={styles.capturedText} numberOfLines={1}>
              {captured.map(p => PIECE_GLYPHS[oppColor][p]).join("")}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.clockPill, isTurn && styles.clockPillActive]}>
        <Text style={styles.clockText}>{formatChessClock(clockMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  promptCard: {
    gap: spacing.sm,
  },
  promptText: {
    ...typography.heading,
    fontSize: 15,
    color: colors.text,
    textAlign: "center",
  },
  promptBtns: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  flexOne: {
    flex: 1,
  },
  playerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  playerBarActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceElevated,
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  colorChip: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  playerName: {
    ...typography.bodyMedium,
    color: colors.text,
    fontWeight: "600",
  },
  capturedText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  clockPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clockPillActive: {
    borderColor: colors.primaryBright,
    backgroundColor: colors.primarySoft,
  },
  clockText: {
    ...typography.mono,
    color: colors.text,
    fontSize: 14,
  },
  board: {
    alignSelf: "center",
    borderRadius: radii.sm,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  row: {
    flexDirection: "row",
  },
  square: {
    alignItems: "center",
    justifyContent: "center",
  },
  piece: {
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  controlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctrlChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctrlDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  ctrlText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
  },
  historyTitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
  historyBody: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  promoCard: {
    gap: spacing.md,
  },
  promoGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  promoBtn: {
    width: 58,
    height: 58,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  promoGlyph: {
    fontSize: 34,
    color: "#FFFFFF",
  },
});
