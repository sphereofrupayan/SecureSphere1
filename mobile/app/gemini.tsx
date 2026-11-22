import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { geminiApi } from "@/api";
import type { StreamHandle } from "@/api/gemini";
import {
  FadeInView,
  FeedbackBanner,
  FloatingOrb,
  MarkdownText,
  PulseBeacon,
  ScreenContainer,
  TypewriterText,
} from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { colors, radii, shadows, spacing, typography } from "@/theme";
import type { GeminiChatMessage, GeminiContextStats } from "@/types";
import { cleanMarkdownForCopy } from "@/utils/markdownMath";

const QUICK_ACTIONS = [
  {
    id: "website_overview",
    label: "Overview",
    icon: "compass-outline" as const,
    prompt: "Summarize everything happening across my SecureSphere workspace right now.",
  },
  {
    id: "summarize_short",
    label: "Short Summary",
    icon: "flash-outline" as const,
    prompt: "Give me a short summary of the room chat.",
  },
  {
    id: "summarize_bullets",
    label: "Bullets",
    icon: "list-outline" as const,
    prompt: "Summarize the room chat in concise bullet points.",
  },
  {
    id: "action_items",
    label: "Action Items",
    icon: "checkbox-outline" as const,
    prompt: "Extract all decisions, tasks, and action items from the room chat.",
  },
  {
    id: "unanswered",
    label: "Unanswered",
    icon: "help-circle-outline" as const,
    prompt: "List any unanswered questions or pending threads in the chat.",
  },
  {
    id: "page_insights",
    label: "Insights",
    icon: "analytics-outline" as const,
    prompt: "Give me key workspace insights and next-step recommendations.",
  },
] as const;

const STARTER_CARDS = [
  {
    id: "website_overview",
    title: "Workspace Briefing",
    subtitle: "Snapshot of chats, files & activity",
    icon: "pulse-outline" as const,
    accent: "#38BDF8",
    prompt: "Summarize everything happening across my SecureSphere workspace right now.",
  },
  {
    id: "action_items",
    title: "Extract Tasks",
    subtitle: "Pull decisions & next action items",
    icon: "checkmark-done-outline" as const,
    accent: "#34D399",
    prompt: "Extract all decisions, tasks, and action items from the room chat.",
  },
  {
    id: "unanswered",
    title: "Pending Threads",
    subtitle: "Spot open questions in the room",
    icon: "chatbubble-ellipses-outline" as const,
    accent: "#FBBF24",
    prompt: "List any unanswered questions or pending threads in the chat.",
  },
  {
    id: "page_insights",
    title: "Smart Insights",
    subtitle: "Key takeaways & recommendations",
    icon: "sparkles-outline" as const,
    accent: "#A78BFA",
    prompt: "Give me key workspace insights and next-step recommendations.",
  },
] as const;

function formatTime(ts?: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function GeminiModalScreen() {
  const router = useRouter();
  const { activeRoomId } = useAuth();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelName, setModelName] = useState<string>("Gemini AI");
  const [stats, setStats] = useState<GeminiContextStats | null>(null);
  const [messages, setMessages] = useState<GeminiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  const streamRef = useRef<StreamHandle | null>(null);
  const listRef = useRef<FlatList<GeminiChatMessage>>(null);
  const maxHeightRef = useRef(0);
  const curHeightRef = useRef(0);
  const kbHeightRef = useRef(0);

  const syncKbPadding = () => {
    if (Platform.OS !== "android") return;
    const kbH = kbHeightRef.current;
    if (kbH <= 0) {
      setKeyboardPadding(0);
      return;
    }
    const osShrank =
      maxHeightRef.current > 0 && maxHeightRef.current - curHeightRef.current > kbH * 0.45;
    setKeyboardPadding(osShrank ? 0 : kbH);
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const s1 = Keyboard.addListener("keyboardDidShow", e => {
      kbHeightRef.current = e.endCoordinates?.height || 0;
      setTimeout(() => {
        syncKbPadding();
        listRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });
    const s2 = Keyboard.addListener("keyboardDidHide", () => {
      kbHeightRef.current = 0;
      setKeyboardPadding(0);
    });
    return () => {
      s1.remove();
      s2.remove();
    };
  }, []);

  const handleRootLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    curHeightRef.current = h;
    if (kbHeightRef.current === 0 && h > maxHeightRef.current) {
      maxHeightRef.current = h;
    }
    syncKbPadding();
  };

  const loadContext = async () => {
    try {
      const summary = await geminiApi.getGeminiContextSummary(activeRoomId, "mobile");
      setConfigured(summary.configured);
      setModelName(summary.model || "Gemini AI");
      setStats(summary.stats || null);
      setErrorMsg(null);
    } catch {
      try {
        const status = await geminiApi.getGeminiStatus();
        setConfigured(status.configured);
        setModelName(status.model || "Gemini AI");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Unable to load Gemini status.");
      }
    }
  };

  useEffect(() => {
    void loadContext();
    return () => {
      streamRef.current?.abort();
    };
  }, [activeRoomId]);

  const stopStreaming = () => {
    streamRef.current?.abort();
    streamRef.current = null;
    setIsStreaming(false);
    setMessages(prev => prev.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m)));
  };

  const runPrompt = (promptText: string, mode = "chat") => {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt && mode === "chat") return;
    if (isStreaming) stopStreaming();

    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    setErrorMsg(null);
    const userMsgId = `u-${Date.now()}`;
    const aiMsgId = `a-${Date.now() + 1}`;

    const historyPayload = messages
      .filter(m => !m.isError && m.text.trim())
      .slice(-10)
      .map(m => ({ role: m.role, text: m.text }));

    setMessages(prev => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        text: cleanPrompt,
        createdAt: Date.now(),
      },
      {
        id: aiMsgId,
        role: "model",
        text: "",
        model: modelName,
        isStreaming: true,
        createdAt: Date.now(),
      },
    ]);
    setInput("");
    setIsStreaming(true);

    streamRef.current = geminiApi.streamGeminiResponse({
      prompt: cleanPrompt,
      mode,
      roomId: activeRoomId,
      activeSection: "mobile",
      history: historyPayload,
      onMeta: meta => {
        if (meta.model) setModelName(meta.model);
        if (meta.stats) setStats(meta.stats);
      },
      onDelta: delta => {
        setMessages(prev =>
          prev.map(m => (m.id === aiMsgId ? { ...m, text: m.text + delta } : m))
        );
      },
      onDone: finalModel => {
        setIsStreaming(false);
        streamRef.current = null;
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMsgId
              ? { ...m, model: finalModel || m.model, isStreaming: false }
              : m
          )
        );
      },
      onError: message => {
        setIsStreaming(false);
        streamRef.current = null;
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMsgId
              ? { ...m, text: message, isStreaming: false, isError: true }
              : m
          )
        );
      },
    });
  };

  const handleRegenerate = (aiIndex: number) => {
    if (isStreaming || configured === false) return;
    // Find the closest preceding user message
    for (let idx = aiIndex - 1; idx >= 0; idx--) {
      const candidate = messages[idx];
      if (candidate?.role === "user" && candidate.text.trim()) {
        runPrompt(candidate.text, "chat");
        return;
      }
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await Clipboard.setStringAsync(cleanMarkdownForCopy(text));
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const canSend = Boolean(input.trim()) && configured !== false;

  return (
    <ScreenContainer keyboardAware padded={false} edges={["top", "bottom", "left", "right"]}>
      <View
        style={[{ flex: 1 }, keyboardPadding > 0 && { paddingBottom: keyboardPadding }]}
        onLayout={handleRootLayout}
      >
        {/* Premium Top Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <LinearGradient
              colors={["#38BDF8", "#3B82F6", "#6366F1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sparkIcon}
            >
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            </LinearGradient>
            <View style={styles.brandMeta}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Gemini AI</Text>
                <View style={styles.liveChip}>
                  <PulseBeacon
                    color={configured === false ? colors.warning : colors.success}
                    size={6}
                  />
                  <Text
                    style={[
                      styles.liveChipText,
                      configured === false && styles.liveChipTextWarn,
                    ]}
                  >
                    {configured === false ? "Offline" : "Live"}
                  </Text>
                </View>
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {modelName} · Room {activeRoomId}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {messages.length > 0 ? (
              <Pressable
                onPress={() => {
                  stopStreaming();
                  setMessages([]);
                }}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                accessibilityLabel="Clear conversation"
              >
                <Ionicons name="trash-outline" size={17} color={colors.textSecondary} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityLabel="Close Gemini"
            >
              <Ionicons name="close" size={19} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* Unified Context Telemetry + Quick Actions Bar */}
        <View style={styles.subHeader}>
          {stats ? (
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Ionicons name="shield-checkmark-outline" size={12} color={colors.primaryBright} />
                <Text style={styles.statText}>Room {stats.roomId || activeRoomId}</Text>
              </View>
              {typeof stats.onlineCount === "number" ? (
                <View style={[styles.statPill, styles.statPillSuccess]}>
                  <View style={styles.onlineDot} />
                  <Text style={[styles.statText, styles.statTextSuccess]}>
                    {stats.onlineCount} online
                  </Text>
                </View>
              ) : null}
              {typeof stats.chatCount === "number" ? (
                <View style={styles.statPill}>
                  <Ionicons name="chatbubble-outline" size={11} color={colors.textSecondary} />
                  <Text style={styles.statText}>{stats.chatCount} msgs</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {QUICK_ACTIONS.map(action => (
              <Pressable
                key={action.id}
                disabled={isStreaming || configured === false}
                onPress={() => runPrompt(action.prompt, action.id)}
                style={({ pressed }) => [
                  styles.chip,
                  pressed && styles.chipPressed,
                  (isStreaming || configured === false) && styles.chipDisabled,
                ]}
              >
                <Ionicons name={action.icon} size={13} color={colors.cyan} />
                <Text style={styles.chipText}>{action.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {configured === false ? (
          <View style={styles.bannerWrap}>
            <FeedbackBanner
              tone="warning"
              message="Gemini API key is not configured on the backend server (.env)."
            />
          </View>
        ) : null}

        {errorMsg ? (
          <View style={styles.bannerWrap}>
            <FeedbackBanner
              tone="error"
              message={errorMsg}
              onDismiss={() => setErrorMsg(null)}
            />
          </View>
        ) : null}

        {/* Chat Thread */}
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listContentEmpty,
          ]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (messages.length > 0) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListEmptyComponent={
            <FadeInView style={styles.emptyWrap}>
              <FloatingOrb distance={5} duration={2600}>
                <LinearGradient
                  colors={["rgba(56, 189, 248, 0.25)", "rgba(59, 130, 246, 0.12)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyOrb}
                >
                  <Ionicons name="sparkles" size={32} color={colors.cyan} />
                </LinearGradient>
              </FloatingOrb>

              <Text style={styles.emptyTitle}>SecureSphere Intelligence</Text>
              <TypewriterText
                phrases={[
                  "Summarize live room discussions in seconds.",
                  "Extract tasks, owners & pending threads.",
                  "Explain code, math & files with zero clutter.",
                ]}
                typingSpeedMs={36}
                style={styles.emptyTypewriter}
              />

              <View style={styles.starterGrid}>
                {STARTER_CARDS.map(card => (
                  <Pressable
                    key={card.id}
                    disabled={configured === false}
                    onPress={() => runPrompt(card.prompt, card.id)}
                    style={({ pressed }) => [
                      styles.starterCard,
                      pressed && styles.starterCardPressed,
                      configured === false && styles.chipDisabled,
                    ]}
                  >
                    <View
                      style={[
                        styles.starterIconWrap,
                        { backgroundColor: `${card.accent}1F`, borderColor: `${card.accent}44` },
                      ]}
                    >
                      <Ionicons name={card.icon} size={17} color={card.accent} />
                    </View>
                    <Text style={styles.starterTitle} numberOfLines={1}>
                      {card.title}
                    </Text>
                    <Text style={styles.starterSub} numberOfLines={2}>
                      {card.subtitle}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </FadeInView>
          }
          renderItem={({ item, index }) => {
            const isUser = item.role === "user";
            const timeLabel = formatTime(item.createdAt);

            if (isUser) {
              return (
                <View style={styles.userRow}>
                  <LinearGradient
                    colors={["rgba(37, 99, 235, 0.34)", "rgba(29, 78, 216, 0.22)"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.userBubble}
                  >
                    <View style={styles.userMetaRow}>
                      <Text style={styles.userAuthor}>You</Text>
                      {timeLabel ? <Text style={styles.msgTime}>{timeLabel}</Text> : null}
                    </View>
                    <Text style={styles.userText} selectable>
                      {item.text}
                    </Text>
                  </LinearGradient>
                </View>
              );
            }

            if (item.isError) {
              return (
                <View style={styles.errorCard}>
                  <View style={styles.errorHeader}>
                    <View style={styles.modelIdentity}>
                      <Ionicons name="alert-circle" size={16} color={colors.danger} />
                      <Text style={styles.errorTitle}>Response Error</Text>
                    </View>
                    <Pressable
                      onPress={() => handleRegenerate(index)}
                      style={styles.retryBtn}
                    >
                      <Ionicons name="refresh" size={13} color={colors.text} />
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.errorBody} selectable>
                    {item.text}
                  </Text>
                </View>
              );
            }

            return (
              <View style={styles.aiCard}>
                {/* Refined top gradient accent bar */}
                <LinearGradient
                  colors={["#38BDF8", "#3B82F6", "#818CF8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.aiAccentBar}
                />

                {/* Card Header */}
                <View style={styles.aiHeader}>
                  <View style={styles.modelIdentity}>
                    <LinearGradient
                      colors={["#38BDF8", "#3B82F6"]}
                      style={styles.aiMiniSpark}
                    >
                      <Ionicons name="sparkles" size={11} color="#FFFFFF" />
                    </LinearGradient>
                    <Text style={styles.aiModelLabel} numberOfLines={1}>
                      {item.model || "Gemini AI"}
                    </Text>
                  </View>

                  {item.isStreaming ? (
                    <View style={styles.streamingBadge}>
                      <ActivityIndicator size={10} color={colors.cyan} />
                      <Text style={styles.streamingBadgeText}>Writing</Text>
                    </View>
                  ) : timeLabel ? (
                    <Text style={styles.msgTime}>{timeLabel}</Text>
                  ) : null}
                </View>

                {/* Card Body */}
                <View style={styles.aiBody}>
                  {item.text ? (
                    <MarkdownText content={item.text} isStreaming={item.isStreaming} />
                  ) : item.isStreaming ? (
                    <View style={styles.thinkingRow}>
                      <ActivityIndicator size="small" color={colors.cyan} />
                      <Text style={styles.thinkingText}>Analyzing live room context…</Text>
                    </View>
                  ) : null}
                </View>

                {/* Card Footer Actions */}
                {!item.isStreaming && item.text ? (
                  <View style={styles.aiFooter}>
                    <Pressable
                      onPress={() => void handleCopy(item.id, item.text)}
                      style={({ pressed }) => [
                        styles.footerAction,
                        pressed && styles.footerActionPressed,
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons
                        name={copiedId === item.id ? "checkmark-circle" : "copy-outline"}
                        size={14}
                        color={copiedId === item.id ? colors.success : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.footerActionText,
                          copiedId === item.id && styles.footerActionTextSuccess,
                        ]}
                      >
                        {copiedId === item.id ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => handleRegenerate(index)}
                      disabled={isStreaming}
                      style={({ pressed }) => [
                        styles.footerAction,
                        pressed && styles.footerActionPressed,
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.footerActionText}>Regenerate</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />

        {/* Floating Premium Composer */}
        <View style={styles.composerOuter}>
          <View
            style={[
              styles.composerPill,
              inputFocused && styles.composerPillFocused,
            ]}
          >
            <TextInput
              style={styles.composerInput}
              placeholder="Ask Gemini anything about your room…"
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              multiline
              maxLength={4000}
              editable={configured !== false}
            />
            {isStreaming ? (
              <Pressable
                onPress={stopStreaming}
                style={({ pressed }) => [styles.stopBtn, pressed && { opacity: 0.85 }]}
                accessibilityLabel="Stop generating"
              >
                <Ionicons name="stop" size={16} color="#FFFFFF" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => runPrompt(input, "chat")}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendBtnWrap,
                  !canSend && styles.sendBtnDisabled,
                  pressed && canSend && { transform: [{ scale: 0.95 }] },
                ]}
                accessibilityLabel="Send to Gemini"
              >
                <LinearGradient
                  colors={canSend ? ["#38BDF8", "#2563EB"] : ["#1E293B", "#1E293B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtn}
                >
                  <Ionicons
                    name="arrow-up"
                    size={19}
                    color={canSend ? "#FFFFFF" : colors.textMuted}
                  />
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(15, 20, 31, 0.92)",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
    marginRight: spacing.sm,
  },
  sparkIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.glow,
  },
  brandMeta: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    ...typography.heading,
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: "rgba(52, 211, 153, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.28)",
  },
  liveChipText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: colors.success,
    letterSpacing: 0.3,
  },
  liveChipTextWarn: {
    color: colors.warning,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnPressed: {
    backgroundColor: colors.surfacePressed,
  },
  subHeader: {
    backgroundColor: "rgba(11, 14, 20, 0.65)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.1)",
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.lg,
    marginBottom: 4,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(30, 41, 59, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.16)",
  },
  statPillSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.25)",
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  statTextSuccess: {
    color: colors.success,
  },
  chipsScroll: {
    maxHeight: 46,
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(26, 34, 51, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.24)",
  },
  chipPressed: {
    borderColor: colors.cyan,
    backgroundColor: "rgba(56, 189, 248, 0.16)",
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    ...typography.caption,
    color: "#E2E8F0",
    fontSize: 12,
    fontWeight: "600",
  },
  bannerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: 14,
  },
  listContentEmpty: {
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
    gap: 10,
  },
  emptyOrb: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 20,
    color: "#FFFFFF",
    textAlign: "center",
  },
  emptyTypewriter: {
    ...typography.caption,
    fontSize: 13,
    color: colors.cyan,
    textAlign: "center",
    minHeight: 20,
    marginBottom: 8,
  },
  starterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
    marginTop: 6,
  },
  starterCard: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: "rgba(20, 26, 38, 0.92)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    padding: 13,
    gap: 6,
  },
  starterCardPressed: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceElevated,
  },
  starterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  starterTitle: {
    ...typography.caption,
    fontSize: 13.5,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  starterSub: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  userRow: {
    width: "100%",
    alignItems: "flex-end",
  },
  userBubble: {
    maxWidth: "84%",
    minWidth: 110,
    borderRadius: radii.lg,
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.42)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  userMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  userAuthor: {
    fontSize: 11,
    fontWeight: "700",
    color: "#93C5FD",
    letterSpacing: 0.3,
  },
  userText: {
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: "#FFFFFF",
  },
  aiCard: {
    width: "100%",
    backgroundColor: "#111827",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    overflow: "hidden",
    ...shadows.card,
  },
  aiAccentBar: {
    height: 2.5,
    width: "100%",
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.1)",
  },
  modelIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  aiMiniSpark: {
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  aiModelLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E0F2FE",
    letterSpacing: 0.2,
  },
  msgTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: "500",
  },
  streamingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.28)",
  },
  streamingBadgeText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: colors.cyan,
  },
  aiBody: {
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  thinkingText: {
    ...typography.caption,
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  aiFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.1)",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: "rgba(148, 163, 184, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
  },
  footerActionPressed: {
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  footerActionText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  footerActionTextSuccess: {
    color: colors.success,
  },
  errorCard: {
    width: "100%",
    backgroundColor: "rgba(127, 29, 29, 0.2)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 14,
    gap: 8,
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.danger,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(248, 113, 113, 0.18)",
  },
  retryText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorBody: {
    ...typography.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#FECACA",
  },
  composerOuter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.12)",
    backgroundColor: "rgba(11, 14, 20, 0.96)",
  },
  composerPill: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  composerPillFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: "#161E2E",
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 112,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    color: colors.text,
    ...typography.body,
    fontSize: 14.5,
    lineHeight: 20,
  },
  sendBtnWrap: {
    borderRadius: 19,
    overflow: "hidden",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
  stopBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.dangerSolid,
    alignItems: "center",
    justifyContent: "center",
  },
});
