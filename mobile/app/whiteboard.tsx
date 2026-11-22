import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { Button, FeedbackBanner, ScreenContainer, StatusBadge } from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import type { WhiteboardElement, WhiteboardTool } from "@/types";
import { confirmAction } from "@/utils/confirm";

type ActiveWbTool = WhiteboardTool | "pan";

const TOOLS: Array<{ id: ActiveWbTool; icon: keyof typeof Ionicons.glyphMap; label: string }> = [
  { id: "pan", icon: "hand-left-outline", label: "Pan" },
  { id: "pen", icon: "pencil", label: "Pen" },
  { id: "highlighter", icon: "color-wand-outline", label: "Highlight" },
  { id: "line", icon: "remove-outline", label: "Line" },
  { id: "arrow", icon: "arrow-up-outline", label: "Arrow" },
  { id: "rect", icon: "square-outline", label: "Rect" },
  { id: "ellipse", icon: "ellipse-outline", label: "Ellipse" },
  { id: "diamond", icon: "diamond-outline", label: "Diamond" },
  { id: "text", icon: "text-outline", label: "Text" },
  { id: "sticky", icon: "document-text-outline", label: "Sticky" },
  { id: "eraser", icon: "trash-outline", label: "Erase" },
];

const SWATCHES = ["#f4f5f8", "#60a5fa", "#34d399", "#fbbf24", "#f87171"];
const SIZES = [2, 4, 8];
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.5;

// Matches typical desktop website whiteboard world dimensions so the entire board
// (including the right-hand side) is immediately visible on mobile screens.
const DESKTOP_WORLD_WIDTH = 1040;
const DESKTOP_WORLD_HEIGHT = 600;

function pointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return "";
  if (points.length === 1) {
    const p = points[0]!;
    return `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${(p.x + 0.5).toFixed(1)},${(p.y + 0.5).toFixed(1)}`;
  }
  return points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");
}

function getElementsBounds(elements: WhiteboardElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const el of elements) {
    if (el.points && el.points.length) {
      for (const pt of el.points) include(pt.x, pt.y);
    } else if (el.type === "line" || el.type === "arrow") {
      include(el.x || 0, el.y || 0);
      include(el.x2 ?? el.x ?? 0, el.y2 ?? el.y ?? 0);
    } else {
      const x = el.x || 0;
      const y = el.y || 0;
      const w = el.w ?? (el.type === "sticky" ? 160 : 120);
      const h = el.h ?? (el.type === "sticky" ? 96 : 40);
      include(x, y);
      include(x + w, y + h);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return { minX, minY, maxX, maxY };
}

function hitTestElement(
  elements: WhiteboardElement[],
  x: number,
  y: number,
  tolerance = 22
): WhiteboardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el) continue;
    if (el.points && el.points.length > 0) {
      if (el.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < tolerance)) return el;
    } else if (el.type === "line" || el.type === "arrow") {
      const minX = Math.min(el.x || 0, el.x2 || 0) - tolerance;
      const maxX = Math.max(el.x || 0, el.x2 || 0) + tolerance;
      const minY = Math.min(el.y || 0, el.y2 || 0) - tolerance;
      const maxY = Math.max(el.y || 0, el.y2 || 0) + tolerance;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) return el;
    } else {
      const rx = el.w && el.w < 0 ? (el.x || 0) + el.w : el.x || 0;
      const ry = el.h && el.h < 0 ? (el.y || 0) + el.h : el.y || 0;
      const rw = Math.abs(el.w || 140);
      const rh = Math.abs(el.h || 60);
      if (
        x >= rx - tolerance &&
        x <= rx + rw + tolerance &&
        y >= ry - tolerance &&
        y <= ry + rh + tolerance
      ) {
        return el;
      }
    }
  }
  return null;
}

export default function WhiteboardScreen() {
  const router = useRouter();
  const { activeRoomId } = useAuth();
  const {
    roomState,
    whiteboardState,
    remoteStrokes,
    isRoomAdminOrOwner,
    upsertWhiteboardElement,
    deleteWhiteboardElement,
    emitWhiteboardStrokeProgress,
    emitWhiteboardCursor,
    undoWhiteboard,
    redoWhiteboard,
    clearWhiteboard,
  } = useRoom();

  const [activeTool, setActiveTool] = useState<ActiveWbTool>("pen");
  const [strokeColor, setStrokeColor] = useState<string>(SWATCHES[0]!);
  const [strokeSize, setStrokeSize] = useState<number>(4);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draftElement, setDraftElement] = useState<WhiteboardElement | null>(null);
  const [optimisticMap, setOptimisticMap] = useState<Record<string, WhiteboardElement>>({});
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textModalPos, setTextModalPos] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState("");

  const canvasRef = useRef<React.ComponentRef<typeof View>>(null);
  const canvasOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const strokeSizeRef = useRef(strokeSize);
  strokeSizeRef.current = strokeSize;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const panStartRef = useRef<{ sx: number; sy: number; origX: number; origY: number } | null>(null);
  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    origZoom: number;
    origPanX: number;
    origPanY: number;
  } | null>(null);
  const draftRef = useRef<WhiteboardElement | null>(null);
  const lastEmitRef = useRef(0);
  const didInitialFrameRef = useRef(false);
  const userManuallyZoomedRef = useRef(false);

  const canDraw =
    Boolean(whiteboardState?.memberDrawAllowed ?? roomState?.whiteboardMemberDraw ?? true) ||
    isRoomAdminOrOwner;
  const canDrawRef = useRef(canDraw);
  canDrawRef.current = canDraw;

  const elementsRef = useRef<WhiteboardElement[]>([]);
  elementsRef.current = whiteboardState?.elements || [];

  /**
   * Frames the full whiteboard (at least the desktop world canvas 0..1040 x 0..600,
   * expanded to include every element on the board) cleanly inside the mobile viewport.
   */
  const fitBoardToView = useCallback(
    (elements: WhiteboardElement[], w: number, h: number, tightToContent = false) => {
      if (w <= 0 || h <= 0) return;

      const elBounds = getElementsBounds(elements);
      let minX = 0;
      let minY = 0;
      let maxX = DESKTOP_WORLD_WIDTH;
      let maxY = DESKTOP_WORLD_HEIGHT;

      if (elBounds) {
        if (tightToContent) {
          minX = Math.min(0, elBounds.minX);
          minY = Math.min(0, elBounds.minY);
          maxX = Math.max(elBounds.maxX, Math.min(DESKTOP_WORLD_WIDTH, elBounds.maxX + 40));
          maxY = Math.max(elBounds.maxY, Math.min(DESKTOP_WORLD_HEIGHT, elBounds.maxY + 40));
        } else {
          minX = Math.min(0, elBounds.minX);
          minY = Math.min(0, elBounds.minY);
          maxX = Math.max(DESKTOP_WORLD_WIDTH, elBounds.maxX);
          maxY = Math.max(DESKTOP_WORLD_HEIGHT, elBounds.maxY);
        }
      }

      const pad = 16;
      const contentW = Math.max(200, maxX - minX);
      const contentH = Math.max(200, maxY - minY);
      const scaleX = (w - pad * 2) / contentW;
      const scaleY = (h - pad * 2) / contentH;
      const nextZoom = Number(
        Math.min(1.0, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY))).toFixed(3)
      );
      const nextPanX = (w - contentW * nextZoom) / 2 - minX * nextZoom;
      const nextPanY = (h - contentH * nextZoom) / 2 - minY * nextZoom;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    },
    []
  );

  // Frame the full desktop board width automatically on first layout
  useEffect(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return;
    if (!didInitialFrameRef.current) {
      didInitialFrameRef.current = true;
      fitBoardToView(whiteboardState?.elements || [], canvasSize.width, canvasSize.height, false);
    }
  }, [canvasSize.height, canvasSize.width, fitBoardToView, whiteboardState?.elements]);

  // If new remote strokes arrive beyond the current viewport (and user hasn't manually zoomed),
  // automatically expand the view so the full whiteboard stays visible.
  useEffect(() => {
    if (
      userManuallyZoomedRef.current ||
      canvasSize.width <= 0 ||
      canvasSize.height <= 0 ||
      !whiteboardState?.elements?.length
    ) {
      return;
    }
    const bounds = getElementsBounds(whiteboardState.elements);
    if (!bounds) return;
    const z = zoomRef.current || 1;
    const vbLeft = -panRef.current.x / z;
    const vbTop = -panRef.current.y / z;
    const vbRight = vbLeft + canvasSize.width / z;
    const vbBottom = vbTop + canvasSize.height / z;

    if (
      bounds.minX < vbLeft + 4 ||
      bounds.maxX > vbRight - 4 ||
      bounds.minY < vbTop + 4 ||
      bounds.maxY > vbBottom - 4
    ) {
      fitBoardToView(whiteboardState.elements, canvasSize.width, canvasSize.height, false);
    }
  }, [canvasSize.height, canvasSize.width, fitBoardToView, whiteboardState?.elements]);

  const adjustZoom = useCallback(
    (factor: number) => {
      userManuallyZoomedRef.current = true;
      const prevZoom = zoomRef.current;
      const nextZoom = Number(
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor)).toFixed(3)
      );
      if (nextZoom === prevZoom) return;
      const cx = canvasSize.width / 2;
      const cy = canvasSize.height / 2;
      const worldCx = (cx - panRef.current.x) / prevZoom;
      const worldCy = (cy - panRef.current.y) / prevZoom;
      setZoom(nextZoom);
      setPan({
        x: cx - worldCx * nextZoom,
        y: cy - worldCy * nextZoom,
      });
    },
    [canvasSize.height, canvasSize.width]
  );

  const handleFitAll = useCallback(() => {
    userManuallyZoomedRef.current = false;
    fitBoardToView(elementsRef.current, canvasSize.width, canvasSize.height, false);
  }, [canvasSize.height, canvasSize.width, fitBoardToView]);

  const refreshCanvasOrigin = useCallback(() => {
    canvasRef.current?.measureInWindow((x, y) => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        canvasOriginRef.current = { x, y };
      }
    });
  }, []);

  const handleCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasSize({ width, height });
    }
    refreshCanvasOrigin();
  };

  const getScreenPoint = useCallback((evt: GestureResponderEvent): { x: number; y: number } => {
    const ne = evt.nativeEvent as unknown as {
      locationX?: number;
      locationY?: number;
      pageX?: number;
      pageY?: number;
      clientX?: number;
      clientY?: number;
    };

    if (Platform.OS === "web") {
      const node = canvasRef.current as unknown as {
        getBoundingClientRect?: () => { left: number; top: number };
      } | null;
      const rect = node?.getBoundingClientRect?.();
      const px = typeof ne.clientX === "number" ? ne.clientX : ne.pageX;
      const py = typeof ne.clientY === "number" ? ne.clientY : ne.pageY;
      if (rect && typeof px === "number" && typeof py === "number") {
        return { x: px - rect.left, y: py - rect.top };
      }
    }

    if (
      typeof ne.pageX === "number" &&
      typeof ne.pageY === "number" &&
      (canvasOriginRef.current.x !== 0 || canvasOriginRef.current.y !== 0)
    ) {
      return {
        x: ne.pageX - canvasOriginRef.current.x,
        y: ne.pageY - canvasOriginRef.current.y,
      };
    }

    return {
      x: typeof ne.locationX === "number" ? ne.locationX : 0,
      y: typeof ne.locationY === "number" ? ne.locationY : 0,
    };
  }, []);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const z = zoomRef.current || 1;
    return {
      x: (sx - panRef.current.x) / z,
      y: (sy - panRef.current.y) / z,
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: evt => {
          refreshCanvasOrigin();
          const touches = evt.nativeEvent.touches;

          // 2-finger pinch-to-zoom & pan gesture works in ANY tool mode
          if (touches && touches.length >= 2) {
            const t0 = touches[0]!;
            const t1 = touches[1]!;
            const dist = Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY);
            const midX = (t0.pageX + t1.pageX) / 2 - canvasOriginRef.current.x;
            const midY = (t0.pageY + t1.pageY) / 2 - canvasOriginRef.current.y;
            pinchStartRef.current = {
              dist: Math.max(10, dist),
              midX,
              midY,
              origZoom: zoomRef.current,
              origPanX: panRef.current.x,
              origPanY: panRef.current.y,
            };
            draftRef.current = null;
            setDraftElement(null);
            return;
          }

          const screenPt = getScreenPoint(evt);
          const tool = activeToolRef.current;

          if (tool === "pan") {
            userManuallyZoomedRef.current = true;
            panStartRef.current = {
              sx: screenPt.x,
              sy: screenPt.y,
              origX: panRef.current.x,
              origY: panRef.current.y,
            };
            return;
          }

          if (!canDrawRef.current) {
            setErrorMsg("Whiteboard drawing is restricted to the Room Admin.");
            return;
          }
          setErrorMsg(null);
          const { x, y } = screenToWorld(screenPt.x, screenPt.y);

          if (tool === "eraser") {
            const hit = hitTestElement(
              elementsRef.current,
              x,
              y,
              24 / Math.max(0.25, zoomRef.current)
            );
            if (hit) {
              setOptimisticMap(prev => {
                const next = { ...prev };
                delete next[hit.id];
                return next;
              });
              void deleteWhiteboardElement(hit.id);
            }
            return;
          }

          if (tool === "text" || tool === "sticky") {
            setTextDraft("");
            setTextModalPos({ x, y });
            return;
          }

          const id = `wb-m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          let nextEl: WhiteboardElement;
          if (tool === "pen" || tool === "highlighter") {
            nextEl = {
              id,
              type: tool,
              color: strokeColorRef.current,
              size: strokeSizeRef.current,
              points: [{ x, y }],
            };
          } else if (tool === "line" || tool === "arrow") {
            nextEl = {
              id,
              type: tool,
              color: strokeColorRef.current,
              size: strokeSizeRef.current,
              x,
              y,
              x2: x,
              y2: y,
            };
          } else {
            nextEl = {
              id,
              type: tool,
              color: strokeColorRef.current,
              size: strokeSizeRef.current,
              x,
              y,
              w: 0,
              h: 0,
            };
          }
          draftRef.current = nextEl;
          setDraftElement(nextEl);
        },
        onPanResponderMove: evt => {
          const touches = evt.nativeEvent.touches;

          // Handle active 2-finger pinch zoom & pan
          if (touches && touches.length >= 2) {
            const t0 = touches[0]!;
            const t1 = touches[1]!;
            const dist = Math.max(10, Math.hypot(t1.pageX - t0.pageX, t1.pageY - t0.pageY));
            const midX = (t0.pageX + t1.pageX) / 2 - canvasOriginRef.current.x;
            const midY = (t0.pageY + t1.pageY) / 2 - canvasOriginRef.current.y;

            if (!pinchStartRef.current) {
              pinchStartRef.current = {
                dist,
                midX,
                midY,
                origZoom: zoomRef.current,
                origPanX: panRef.current.x,
                origPanY: panRef.current.y,
              };
              draftRef.current = null;
              setDraftElement(null);
              return;
            }

            userManuallyZoomedRef.current = true;
            const ps = pinchStartRef.current;
            const scaleRatio = dist / ps.dist;
            const nextZoom = Number(
              Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, ps.origZoom * scaleRatio)).toFixed(3)
            );
            const worldMidX = (ps.midX - ps.origPanX) / ps.origZoom;
            const worldMidY = (ps.midY - ps.origPanY) / ps.origZoom;

            setZoom(nextZoom);
            setPan({
              x: midX - worldMidX * nextZoom,
              y: midY - worldMidY * nextZoom,
            });
            return;
          }

          const screenPt = getScreenPoint(evt);

          if (panStartRef.current && activeToolRef.current === "pan") {
            setPan({
              x: panStartRef.current.origX + (screenPt.x - panStartRef.current.sx),
              y: panStartRef.current.origY + (screenPt.y - panStartRef.current.sy),
            });
            return;
          }

          const { x, y } = screenToWorld(screenPt.x, screenPt.y);
          const now = Date.now();
          if (now - lastEmitRef.current > 60) {
            emitWhiteboardCursor(x, y, activeToolRef.current);
          }

          const cur = draftRef.current;
          if (!cur) return;

          let updated: WhiteboardElement;
          if (cur.points) {
            updated = { ...cur, points: [...cur.points, { x, y }] };
          } else if (cur.type === "line" || cur.type === "arrow") {
            updated = { ...cur, x2: x, y2: y };
          } else {
            updated = { ...cur, w: x - (cur.x || 0), h: y - (cur.y || 0) };
          }

          draftRef.current = updated;
          setDraftElement(updated);

          if (now - lastEmitRef.current > 60) {
            lastEmitRef.current = now;
            emitWhiteboardStrokeProgress(updated);
          }
        },
        onPanResponderRelease: () => {
          if (pinchStartRef.current) {
            pinchStartRef.current = null;
            return;
          }
          if (panStartRef.current) {
            panStartRef.current = null;
            return;
          }

          const finished = draftRef.current;
          draftRef.current = null;
          setDraftElement(null);
          if (!finished) return;

          if (
            (finished.type === "rect" ||
              finished.type === "ellipse" ||
              finished.type === "diamond") &&
            Math.abs(finished.w || 0) < 4 &&
            Math.abs(finished.h || 0) < 4
          ) {
            return;
          }
          if (
            (finished.type === "line" || finished.type === "arrow") &&
            Math.hypot(
              (finished.x2 || 0) - (finished.x || 0),
              (finished.y2 || 0) - (finished.y || 0)
            ) < 4
          ) {
            return;
          }

          setOptimisticMap(prev => ({ ...prev, [finished.id]: finished }));

          void upsertWhiteboardElement(finished, true).then(res => {
            setOptimisticMap(prev => {
              const next = { ...prev };
              delete next[finished.id];
              return next;
            });
            if (!res.ok) setErrorMsg(res.error || "Unable to save whiteboard stroke.");
          });
        },
      }),
    [
      deleteWhiteboardElement,
      emitWhiteboardCursor,
      emitWhiteboardStrokeProgress,
      getScreenPoint,
      refreshCanvasOrigin,
      screenToWorld,
      upsertWhiteboardElement,
    ]
  );

  const handlePlaceText = async () => {
    const clean = textDraft.trim();
    if (!clean || !textModalPos) {
      setTextModalPos(null);
      return;
    }
    const el: WhiteboardElement = {
      id: `wb-t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: activeTool === "sticky" ? "sticky" : "text",
      color: strokeColor,
      size: strokeSize,
      x: textModalPos.x,
      y: textModalPos.y,
      w: 160,
      h: activeTool === "sticky" ? 96 : 36,
      text: clean,
    };
    setTextModalPos(null);
    setOptimisticMap(prev => ({ ...prev, [el.id]: el }));
    const res = await upsertWhiteboardElement(el, true);
    setOptimisticMap(prev => {
      const next = { ...prev };
      delete next[el.id];
      return next;
    });
    if (!res.ok) setErrorMsg(res.error || "Unable to add note.");
  };

  const handleClearEverything = () => {
    confirmAction({
      title: "Clear Everything",
      message:
        "Clear all drawings, shapes, and notes on the room whiteboard? (You can tap Undo to restore.)",
      confirmLabel: "Clear Everything",
      destructive: true,
      onConfirm: async () => {
        setOptimisticMap({});
        const res = await clearWhiteboard();
        if (!res.ok) setErrorMsg(res.error || "Unable to clear whiteboard.");
      },
    });
  };

  const allRenderElements = useMemo(() => {
    const byId = new Map<string, WhiteboardElement>();
    for (const item of whiteboardState?.elements || []) {
      if (item?.id) byId.set(item.id, item);
    }
    for (const item of Object.values(optimisticMap)) {
      if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
    }
    for (const st of Object.values(remoteStrokes)) {
      if (st?.id && !byId.has(st.id)) byId.set(st.id, st);
    }
    if (draftElement?.id) {
      byId.set(draftElement.id, draftElement);
    }
    return Array.from(byId.values());
  }, [draftElement, optimisticMap, remoteStrokes, whiteboardState?.elements]);

  // Native SVG viewBox mapping — works 100% identically on Android Fabric, iOS, and Web!
  const safeZoom = Math.max(MIN_ZOOM, zoom);
  const svgW = Math.max(1, canvasSize.width);
  const svgH = Math.max(1, canvasSize.height);
  const vbX = -pan.x / safeZoom;
  const vbY = -pan.y / safeZoom;
  const vbW = svgW / safeZoom;
  const vbH = svgH / safeZoom;

  return (
    <ScreenContainer padded={false} edges={["top", "bottom", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.flexOne}>
          <Text style={styles.title}>Whiteboard</Text>
          <Text style={styles.subtitle}>
            Room {roomState?.roomId || activeRoomId} · {allRenderElements.length} items · Pinch to zoom
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => void undoWhiteboard()}
            style={styles.iconBtn}
            accessibilityLabel="Undo"
          >
            <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => void redoWhiteboard()}
            style={styles.iconBtn}
            accessibilityLabel="Redo"
          >
            <Ionicons name="arrow-redo-outline" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Zoom, Fit & Clear Everything Strip */}
      <View style={styles.zoomBar}>
        <View style={styles.zoomGroup}>
          <Pressable
            onPress={() => adjustZoom(0.8)}
            style={styles.zoomBtn}
            accessibilityLabel="Zoom out"
          >
            <Ionicons name="remove" size={16} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleFitAll}
            style={styles.zoomLabelBtn}
            accessibilityLabel="Reset view to fit board"
          >
            <Text style={styles.zoomLabel}>{Math.round(safeZoom * 100)}%</Text>
          </Pressable>
          <Pressable
            onPress={() => adjustZoom(1.25)}
            style={styles.zoomBtn}
            accessibilityLabel="Zoom in"
          >
            <Ionicons name="add" size={16} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={handleFitAll}
            style={styles.fitBtn}
            accessibilityLabel="Fit full whiteboard in view"
          >
            <Ionicons name="scan-outline" size={14} color={colors.primaryBright} />
            <Text style={styles.fitBtnText}>Fit All</Text>
          </Pressable>
        </View>

        {canDraw ? (
          <Pressable
            onPress={handleClearEverything}
            style={styles.clearAllBtn}
            accessibilityLabel="Clear everything on whiteboard"
          >
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        ) : null}
      </View>

      {errorMsg ? (
        <View style={styles.bannerWrap}>
          <FeedbackBanner
            tone="error"
            message={errorMsg}
            onDismiss={() => setErrorMsg(null)}
          />
        </View>
      ) : null}

      {!canDraw ? (
        <View style={styles.bannerWrap}>
          <StatusBadge label="Read-only mode (Owner restricted)" tone="warning" />
        </View>
      ) : null}

      {/* Touch & Mouse Vector Canvas with Native SVG viewBox Zoom & Pan */}
      <View
        ref={canvasRef}
        onLayout={handleCanvasLayout}
        style={styles.canvasWrap}
        {...panResponder.panHandlers}
      >
        {canvasSize.width > 0 && canvasSize.height > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg
              width={svgW}
              height={svgH}
              viewBox={`${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}`}
            >
              {/* Subtle reference frame matching the desktop whiteboard canvas area */}
              <Rect
                x={0}
                y={0}
                width={DESKTOP_WORLD_WIDTH}
                height={DESKTOP_WORLD_HEIGHT}
                rx={12}
                fill="rgba(255, 255, 255, 0.015)"
                stroke="rgba(148, 163, 184, 0.16)"
                strokeWidth={1.5 / safeZoom}
                strokeDasharray={`${8 / safeZoom},${6 / safeZoom}`}
              />

              {allRenderElements.map(el => (
                <RenderWhiteboardElement key={el.id} el={el} />
              ))}

              {(whiteboardState?.cursors || []).map(cursor => (
                <G key={cursor.socketId}>
                  <Circle
                    cx={cursor.x}
                    cy={cursor.y}
                    r={5 / safeZoom}
                    fill={cursor.color || colors.primaryBright}
                  />
                  <SvgText
                    x={cursor.x + 8 / safeZoom}
                    y={cursor.y + 4 / safeZoom}
                    fill={cursor.color || colors.primaryBright}
                    fontSize={11 / safeZoom}
                    fontWeight="600"
                  >
                    {cursor.username}
                  </SvgText>
                </G>
              ))}
            </Svg>
          </View>
        ) : null}
      </View>

      {/* Style Swatches & Size */}
      <View style={styles.styleBar}>
        <View style={styles.swatchRow}>
          {SWATCHES.map(hex => (
            <Pressable
              key={hex}
              onPress={() => setStrokeColor(hex)}
              style={[
                styles.swatch,
                { backgroundColor: hex },
                strokeColor === hex && styles.swatchActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.sizeRow}>
          {SIZES.map((sz, i) => (
            <Pressable
              key={sz}
              onPress={() => setStrokeSize(sz)}
              style={[styles.sizeChip, strokeSize === sz && styles.sizeChipActive]}
            >
              <Text style={styles.sizeText}>{i === 0 ? "S" : i === 1 ? "M" : "L"}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Tool Dock */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.toolBar}
        contentContainerStyle={styles.toolBarContent}
      >
        {TOOLS.map(tool => {
          const active = activeTool === tool.id;
          return (
            <Pressable
              key={tool.id}
              onPress={() => setActiveTool(tool.id)}
              style={[styles.toolBtn, active && styles.toolBtnActive]}
            >
              <Ionicons
                name={tool.icon}
                size={18}
                color={active ? colors.primaryBright : colors.textSecondary}
              />
              <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Text / Sticky Input Modal */}
      <Modal
        visible={Boolean(textModalPos)}
        transparent
        animationType="fade"
        onRequestClose={() => setTextModalPos(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {activeTool === "sticky" ? "Add Sticky Note" : "Add Text Label"}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Type your note..."
              placeholderTextColor={colors.textMuted}
              value={textDraft}
              onChangeText={setTextDraft}
              multiline
              autoFocus
            />
            <View style={styles.modalBtns}>
              <View style={styles.flexOne}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setTextModalPos(null)}
                />
              </View>
              <View style={styles.flexOne}>
                <Button label="Place" onPress={() => void handlePlaceText()} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function RenderWhiteboardElement({ el }: { el: WhiteboardElement }) {
  const stroke = el.color || "#f4f5f8";
  const width = el.size || 4;

  if ((el.type === "pen" || el.type === "highlighter") && el.points?.length) {
    const d = pointsToSvgPath(el.points);
    return (
      <Path
        d={d}
        stroke={stroke}
        strokeWidth={el.type === "highlighter" ? width * 3.2 : width}
        strokeOpacity={el.type === "highlighter" ? 0.35 : 1}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    );
  }

  if (el.type === "line" || el.type === "arrow") {
    const x1 = el.x || 0;
    const y1 = el.y || 0;
    const x2 = el.x2 ?? x1;
    const y2 = el.y2 ?? y1;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 12;
    const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
    const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
    const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
    const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);

    return (
      <G>
        <Line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
        />
        {el.type === "arrow" ? (
          <Polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={stroke} />
        ) : null}
      </G>
    );
  }

  const rx = (el.w || 0) < 0 ? (el.x || 0) + (el.w || 0) : el.x || 0;
  const ry = (el.h || 0) < 0 ? (el.y || 0) + (el.h || 0) : el.y || 0;
  const rw = Math.abs(el.w || 0);
  const rh = Math.abs(el.h || 0);

  if (el.type === "rect") {
    return (
      <Rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        rx={6}
        stroke={stroke}
        strokeWidth={width}
        fill="none"
      />
    );
  }

  if (el.type === "ellipse") {
    return (
      <Ellipse
        cx={rx + rw / 2}
        cy={ry + rh / 2}
        rx={rw / 2}
        ry={rh / 2}
        stroke={stroke}
        strokeWidth={width}
        fill="none"
      />
    );
  }

  if (el.type === "diamond") {
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const pts = `${cx},${ry} ${rx + rw},${cy} ${cx},${ry + rh} ${rx},${cy}`;
    return <Polygon points={pts} stroke={stroke} strokeWidth={width} fill="none" />;
  }

  if (el.type === "sticky") {
    const w = el.w || 160;
    const h = el.h || 96;
    return (
      <G>
        <Rect
          x={el.x || 0}
          y={el.y || 0}
          width={w}
          height={h}
          rx={10}
          fill="#FEF08A"
          stroke="#CA8A04"
          strokeWidth={1.5}
        />
        <SvgText
          x={(el.x || 0) + 10}
          y={(el.y || 0) + 26}
          fill="#1E293B"
          fontSize={13}
          fontWeight="600"
        >
          {(el.text || "").slice(0, 60)}
        </SvgText>
      </G>
    );
  }

  if (el.type === "text") {
    return (
      <SvgText x={el.x || 0} y={(el.y || 0) + 18} fill={stroke} fontSize={16} fontWeight="600">
        {el.text || ""}
      </SvgText>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(15, 20, 31, 0.72)",
    gap: spacing.sm,
  },
  zoomGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomLabelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 50,
    alignItems: "center",
  },
  zoomLabel: {
    ...typography.mono,
    fontSize: 11,
    color: colors.text,
  },
  fitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  fitBtnText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.primaryBright,
    fontWeight: "600",
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  clearAllText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.danger,
    fontWeight: "700",
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
    fontSize: 11,
    color: colors.textMuted,
  },
  bannerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  canvasWrap: {
    flex: 1,
    margin: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: "#0E131D",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? ({ touchAction: "none", userSelect: "none", cursor: "crosshair" } as object)
      : {}),
  },
  styleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  swatchRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: {
    borderColor: colors.primaryBright,
    transform: [{ scale: 1.15 }],
  },
  sizeRow: {
    flexDirection: "row",
    gap: 6,
  },
  sizeChip: {
    width: 30,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sizeChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  sizeText: {
    ...typography.label,
    fontSize: 11,
    color: colors.text,
  },
  toolBar: {
    maxHeight: 68,
    flexGrow: 0,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toolBarContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  toolBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  toolBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  toolLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  toolLabelActive: {
    color: colors.primaryBright,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.heading,
    color: colors.text,
  },
  modalInput: {
    minHeight: 80,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    ...typography.body,
    textAlignVertical: "top",
  },
  modalBtns: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
