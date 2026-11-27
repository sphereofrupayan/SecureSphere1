import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { mediaApi } from "@/api";
import {
  FadeInView,
  FeedbackBanner,
  PulseBeacon,
  ScreenContainer,
  StatusBadge,
} from "@/components";
import { useAuth } from "@/hooks/useAuth";
import { useRoom } from "@/hooks/useRoom";
import { colors, radii, spacing, typography } from "@/theme";
import type { ChatMessage, MediaAttachment } from "@/types";
import { formatFileSize, formatTime } from "@/utils/format";
import { confirmAction } from "@/utils/confirm";

const ALLOWED_REACTIONS = ["👍", "🔥", "💡", "✅", "❤️"];

interface PendingAttachment {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number;
}

function getMediaBadgeStyle(kind: string): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (kind) {
    case "image":
      return { icon: "image-outline", color: colors.cyan, bg: colors.cyanSoft };
    case "video":
      return { icon: "videocam-outline", color: "#A78BFA", bg: "rgba(167, 139, 250, 0.16)" };
    case "pdf":
      return { icon: "document-text-outline", color: "#F87171", bg: colors.dangerSoft };
    case "code":
      return { icon: "code-slash-outline", color: colors.success, bg: colors.successSoft };
    default:
      return { icon: "document-attach-outline", color: colors.primaryBright, bg: colors.primarySoft };
  }
}

export default function ChatScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isWideScreen = screenWidth >= 680;
  const bubbleResponsiveStyle = useMemo(
    () => ({
      maxWidth: (isWideScreen ? "68%" : "86%") as `${number}%`,
    }),
    [isWideScreen]
  );
  const mediaResponsiveStyle = useMemo(
    () => ({
      width: Math.min(Math.round(screenWidth * 0.76), 350),
    }),
    [screenWidth]
  );

  const { user, token, activeRoomId } = useAuth();
  const {
    roomState,
    chatMessages,
    savedItems,
    connectionStatus,
    isRoomAdminOrOwner,
    voiceChannels,
    activeVoiceChannelId,
    voiceMuted,
    voiceDeafened,
    voiceSpeakerOn,
    voiceAudioSupported,
    voicePeerStates,
    voiceMicPermission,
    voiceError,
    sendChatMessage,
    toggleReaction,
    deleteChatMessage,
    clearChat,
    toggleSaveMessage,
    joinVoiceChannel,
    leaveVoiceChannel,
    setVoiceState,
    toggleVoiceSpeaker,
    openVoicePermissionSettings,
  } = useRoom();

  const [filterMode, setFilterMode] = useState<"all" | "media">("all");
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingAttachment | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [joiningVoiceId, setJoiningVoiceId] = useState<string | null>(null);
  const [keyboardPadding, setKeyboardPadding] = useState(0);

  const activeVoiceChannel = useMemo(
    () => voiceChannels.find(c => c.id === activeVoiceChannelId) || null,
    [activeVoiceChannelId, voiceChannels]
  );
  const totalVoiceParticipants = useMemo(
    () => voiceChannels.reduce((acc, c) => acc + c.participants.length, 0),
    [voiceChannels]
  );
  const liveJoinableChannel = useMemo(
    () =>
      voiceChannels.find(c => c.participants.length > 0) ||
      voiceChannels.find(c => c.isDefault) ||
      voiceChannels[0] ||
      null,
    [voiceChannels]
  );
  const connectedPeerCount = useMemo(
    () => Object.values(voicePeerStates).filter(s => s === "connected").length,
    [voicePeerStates]
  );

  const handleQuickVoiceJoin = async (channelId?: string) => {
    const targetId = channelId || liveJoinableChannel?.id;
    if (!targetId) {
      router.push("/voice");
      return;
    }
    setJoiningVoiceId(targetId);
    setErrorMsg(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const res = await joinVoiceChannel(targetId);
    setJoiningVoiceId(null);
    if (!res.ok) {
      setErrorMsg(res.error || "Unable to connect Voice Chat.");
      return;
    }
    setVoiceSheetOpen(false);
  };

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const maxContainerHeightRef = useRef(0);
  const currentContainerHeightRef = useRef(0);
  const keyboardVisibleHeightRef = useRef(0);

  const syncKeyboardPadding = () => {
    if (Platform.OS !== "android") return;
    const kbH = keyboardVisibleHeightRef.current;
    if (kbH <= 0) {
      setKeyboardPadding(0);
      return;
    }
    const osShrank =
      maxContainerHeightRef.current > 0 &&
      maxContainerHeightRef.current - currentContainerHeightRef.current > kbH * 0.45;
    setKeyboardPadding(osShrank ? 0 : kbH);
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", evt => {
      keyboardVisibleHeightRef.current = evt.endCoordinates?.height || 0;
      setTimeout(() => {
        syncKeyboardPadding();
        listRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisibleHeightRef.current = 0;
      setKeyboardPadding(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    currentContainerHeightRef.current = h;
    if (keyboardVisibleHeightRef.current === 0 && h > maxContainerHeightRef.current) {
      maxContainerHeightRef.current = h;
    }
    syncKeyboardPadding();
  };

  const savedIdSet = useMemo(() => new Set(savedItems.map(item => item.id)), [savedItems]);

  const filteredMessages = useMemo(() => {
    if (filterMode === "media") {
      return chatMessages.filter(m => Boolean(m.media));
    }
    return chatMessages;
  }, [chatMessages, filterMode]);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMsg("Photo library permission is needed to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPendingFile({
      uri: asset.uri,
      fileName: asset.fileName || `media-${Date.now()}.${asset.type === "video" ? "mp4" : "jpg"}`,
      mimeType: asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"),
      size: asset.fileSize,
    });
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPendingFile({
      uri: asset.uri,
      fileName: asset.name || `file-${Date.now()}`,
      mimeType: asset.mimeType || "application/octet-stream",
      size: asset.size,
    });
  };

  const openAttachMenu = () => {
    setAttachSheetOpen(true);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !pendingFile) || sending) return;

    setSending(true);
    setErrorMsg(null);

    try {
      let uploadedMediaId: string | null = null;
      if (pendingFile) {
        setUploadProgress(0.05);
        const media = await mediaApi.uploadRoomMedia({
          roomId: roomState?.roomId || activeRoomId,
          uri: pendingFile.uri,
          fileName: pendingFile.fileName,
          mimeType: pendingFile.mimeType,
          onProgress: p => setUploadProgress(p),
        });
        uploadedMediaId = media.id;
        setUploadProgress(null);
      }

      const result = await sendChatMessage({
        message: text,
        replyToId: replyTarget?.id || null,
        mediaId: uploadedMediaId,
        messageType: uploadedMediaId && !text ? "media" : "discussion",
      });

      if (!result.ok) {
        setErrorMsg(result.error || "Failed to send message.");
        return;
      }

      setDraft("");
      setReplyTarget(null);
      setPendingFile(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (error) {
      setUploadProgress(null);
      setErrorMsg(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = () => {
    confirmAction({
      title: "Clear Room Chat",
      message: "Permanently delete all chat messages in this room?",
      confirmLabel: "Clear All",
      destructive: true,
      onConfirm: async () => {
        const res = await clearChat();
        if (!res.ok) setErrorMsg(res.error || "Unable to clear chat.");
      },
    });
  };

  const openMediaViewer = (media: MediaAttachment) => {
    router.push({
      pathname: "/media-viewer",
      params: {
        mediaId: media.id,
        originalName: media.originalName,
        mimeType: media.mimeType,
        mediaKind: media.mediaKind,
        fileSize: String(media.fileSize || 0),
        uploaderUsername: media.uploaderUsername || "",
      },
    });
  };

  const handleReact = async (msgId: string, emoji: string) => {
    setActionMessage(null);
    void Haptics.selectionAsync().catch(() => undefined);
    const res = await toggleReaction(msgId, emoji);
    if (!res.ok) setErrorMsg(res.error || "Unable to update reaction.");
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.username.toLowerCase() === (user?.username || "").toLowerCase();
    const reactionEntries = Object.entries(item.reactions || {}).filter(
      ([, users]) => Array.isArray(users) && users.length > 0
    );
    const isSaved = savedIdSet.has(item.id);
    const hasMedia = Boolean(item.media);
    const mediaBadge = item.media ? getMediaBadgeStyle(item.media.mediaKind) : null;
    const replySnippet = item.replyTo?.message?.trim() || "📎 Shared attachment";

    const bubbleInner = (
      <>
        <View style={styles.bubbleMeta}>
          <Text style={[styles.sender, isOwn && styles.senderOwn]}>
            {isOwn ? "You" : item.username}
          </Text>
          <View style={styles.metaRight}>
            {isSaved ? <Ionicons name="bookmark" size={11} color={colors.warning} /> : null}
            <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>

        {item.replyTo ? (
          <View style={styles.replyBox}>
            <Text style={styles.replyAuthor}>{item.replyTo.username}</Text>
            <Text style={styles.replySnippet} numberOfLines={2}>
              {replySnippet}
            </Text>
          </View>
        ) : null}

        {item.media && mediaBadge ? (
          <Pressable
            onPress={() => openMediaViewer(item.media!)}
            style={({ pressed }) => [styles.mediaBlock, pressed && styles.mediaPressed]}
          >
            {item.media.mediaKind === "image" && token ? (
              <Image
                source={{
                  uri: mediaApi.getMediaAbsoluteUrl(item.media.id),
                  headers: { Authorization: `Bearer ${token}` },
                }}
                style={styles.mediaThumb}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.mediaChip}>
              <View style={[styles.mediaIconPill, { backgroundColor: mediaBadge.bg }]}>
                <Ionicons name={mediaBadge.icon} size={18} color={mediaBadge.color} />
              </View>
              <View style={styles.mediaTextCol}>
                <Text style={styles.mediaName} numberOfLines={1} ellipsizeMode="middle">
                  {item.media.originalName}
                </Text>
                <Text style={styles.mediaSize} numberOfLines={1}>
                  {formatFileSize(item.media.fileSize)} · Tap to open
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        ) : null}

        {item.message ? <Text style={styles.messageText}>{item.message}</Text> : null}

        {reactionEntries.length > 0 ? (
          <View style={styles.reactionsRow}>
            {reactionEntries.map(([emoji, users]) => {
              const mine = users.some(
                u => u.toLowerCase() === (user?.username || "").toLowerCase()
              );
              return (
                <Pressable
                  key={emoji}
                  onPress={() => void handleReact(item.id, emoji)}
                  style={[styles.reactionPill, mine && styles.reactionPillMine]}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{users.length}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </>
    );

    return (
      <FadeInView duration={260} offsetY={8} scaleFrom={0.99}>
        <Pressable
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            setActionMessage(item);
          }}
          style={[styles.msgRow, isOwn ? styles.msgRowOwn : styles.msgRowOther]}
        >
          {isOwn ? (
            <LinearGradient
              colors={["rgba(37, 99, 235, 0.34)", "rgba(30, 58, 138, 0.28)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.bubble,
                bubbleResponsiveStyle,
                styles.bubbleOwn,
                hasMedia && mediaResponsiveStyle,
              ]}
            >
              {bubbleInner}
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                bubbleResponsiveStyle,
                styles.bubbleOther,
                hasMedia && mediaResponsiveStyle,
              ]}
            >
              {bubbleInner}
            </View>
          )}
        </Pressable>
      </FadeInView>
    );
  };

  return (
    <ScreenContainer keyboardAware padded={false} maxWidth={860}>
      <View
        style={[styles.chatRoot, keyboardPadding > 0 && { paddingBottom: keyboardPadding }]}
        onLayout={handleContainerLayout}
      >
      <View style={styles.header}>
        <View style={styles.flexOne}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {roomState?.roomName || "Team Chat"}
            </Text>
            <StatusBadge
              label={connectionStatus === "connected" ? "Live" : "Offline"}
              tone={connectionStatus === "connected" ? "success" : "danger"}
              showDot
            />
          </View>
          <Text style={styles.subtitle} numberOfLines={1}>
            Room {roomState?.roomId || activeRoomId} · Hold any message for actions
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              if (activeVoiceChannel) {
                setVoiceSheetOpen(true);
              } else if (voiceChannels.length <= 1) {
                void handleQuickVoiceJoin();
              } else {
                setVoiceSheetOpen(true);
              }
            }}
            style={({ pressed }) => [
              styles.voiceCallBtn,
              activeVoiceChannel && styles.voiceCallBtnActive,
              pressed && styles.mediaPressed,
            ]}
            accessibilityLabel="Voice Call in Chat"
          >
            <Ionicons
              name={activeVoiceChannel ? "mic" : "call-outline"}
              size={17}
              color={activeVoiceChannel ? colors.success : colors.cyan}
            />
            {totalVoiceParticipants > 0 ? (
              <Text
                style={[
                  styles.voiceCallCount,
                  activeVoiceChannel && { color: colors.success },
                ]}
              >
                {totalVoiceParticipants}
              </Text>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => router.push("/whiteboard")}
            style={({ pressed }) => [styles.headerIconBtn, pressed && styles.mediaPressed]}
            accessibilityLabel="Open Whiteboard"
          >
            <Ionicons name="brush-outline" size={18} color={colors.primaryBright} />
          </Pressable>
        </View>
      </View>

      {/* Filter & Admin Clear Bar */}
      <View style={styles.toolbar}>
        <View style={styles.filterGroup}>
          <Pressable
            onPress={() => setFilterMode("all")}
            style={[styles.filterChip, filterMode === "all" && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === "all" && styles.filterChipTextActive,
              ]}
            >
              All ({chatMessages.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilterMode("media")}
            style={[styles.filterChip, filterMode === "media" && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === "media" && styles.filterChipTextActive,
              ]}
            >
              Files
            </Text>
          </Pressable>
        </View>

        {isRoomAdminOrOwner && chatMessages.length > 0 ? (
          <Pressable onPress={handleClearChat} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear Chat</Text>
          </Pressable>
        ) : null}
      </View>

      {/* WhatsApp-style Live Voice Call Bar directly in Chat */}
      {activeVoiceChannel ? (
        <View style={styles.voiceLiveBar}>
          <Pressable onPress={() => router.push("/voice")} style={styles.voiceLiveIdentity}>
            <PulseBeacon color={colors.success} size={8} />
            <View style={styles.flexOne}>
              <Text style={styles.voiceLiveTitle} numberOfLines={1}>
                {activeVoiceChannel.name} · {activeVoiceChannel.participants.length} in call
              </Text>
              <Text style={styles.voiceLiveSub} numberOfLines={1}>
                {activeVoiceChannel.participants.length <= 1
                  ? "Waiting for teammates · Tap for details"
                  : `${connectedPeerCount}/${activeVoiceChannel.participants.length - 1} audio live · ${voiceAudioSupported ? "WebRTC" : "Signaling"}`}
              </Text>
            </View>
          </Pressable>
          <View style={styles.voiceLiveCtrls}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void setVoiceState({ muted: !voiceMuted });
              }}
              style={[styles.voiceMiniBtn, voiceMuted && styles.voiceMiniBtnMuted]}
              accessibilityLabel={voiceMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <Ionicons
                name={voiceMuted ? "mic-off" : "mic"}
                size={16}
                color={voiceMuted ? colors.danger : colors.success}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                void toggleVoiceSpeaker();
              }}
              style={[styles.voiceMiniBtn, voiceSpeakerOn && styles.voiceMiniBtnSpeaker]}
              accessibilityLabel={voiceSpeakerOn ? "Switch to earpiece" : "Switch to speakerphone"}
            >
              <Ionicons
                name={voiceSpeakerOn ? "volume-high" : "ear-outline"}
                size={16}
                color={voiceSpeakerOn ? colors.cyan : colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={() => void leaveVoiceChannel()}
              style={[styles.voiceMiniBtn, styles.voiceMiniBtnEnd]}
              accessibilityLabel="End voice call"
            >
              <Ionicons name="call" size={15} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : totalVoiceParticipants > 0 && liveJoinableChannel ? (
        <Pressable
          onPress={() => void handleQuickVoiceJoin(liveJoinableChannel.id)}
          style={styles.voiceJoinPromptBar}
        >
          <PulseBeacon color={colors.cyan} size={7} />
          <Text style={styles.voiceJoinPromptText} numberOfLines={1}>
            {liveJoinableChannel.participants.length} online in {liveJoinableChannel.name} · Tap to join audio
          </Text>
          <Text style={styles.voiceJoinPromptAction}>Join</Text>
        </Pressable>
      ) : null}

      {errorMsg || voiceError ? (
        <View style={styles.bannerWrap}>
          <FeedbackBanner
            tone="error"
            message={errorMsg || voiceError || ""}
            actionLabel={voiceMicPermission === "blocked" ? "Open Settings" : "Voice Check"}
            onAction={() => {
              if (voiceMicPermission === "blocked") {
                void openVoicePermissionSettings();
              } else {
                router.push("/voice");
              }
            }}
            onDismiss={() => setErrorMsg(null)}
          />
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.flexOne}
        data={filteredMessages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <FadeInView style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.primaryBright} />
            <Text style={styles.emptyTitle}>
              {filterMode === "media" ? "No files shared yet" : "Start the conversation"}
            </Text>
            <Text style={styles.emptySub}>
              Messages and files sync in real time across web and mobile room members.
            </Text>
          </FadeInView>
        }
      />

      {/* Reply Preview */}
      {replyTarget ? (
        <View style={styles.stagingBar}>
          <View style={styles.replyAccent} />
          <View style={styles.flexOne}>
            <Text style={styles.stagingTitle}>Replying to {replyTarget.username}</Text>
            <Text style={styles.stagingSub} numberOfLines={1}>
              {replyTarget.message || replyTarget.media?.originalName || "Shared attachment"}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTarget(null)} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Attachment Preview */}
      {pendingFile ? (
        <View style={styles.stagingBar}>
          <Ionicons name="attach" size={18} color={colors.primaryBright} />
          <View style={styles.flexOne}>
            <Text style={styles.stagingTitle} numberOfLines={1}>
              {pendingFile.fileName}
            </Text>
            <Text style={styles.stagingSub}>
              {uploadProgress !== null
                ? `Uploading ${Math.round(uploadProgress * 100)}%...`
                : pendingFile.size
                  ? formatFileSize(pendingFile.size)
                  : "Ready to send"}
            </Text>
          </View>
          {uploadProgress === null ? (
            <Pressable onPress={() => setPendingFile(null)} hitSlop={10}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <ActivityIndicator size="small" color={colors.primaryBright} />
          )}
        </View>
      ) : null}

      {/* Composer */}
      <View style={styles.composerBar}>
        <Pressable
          onPress={openAttachMenu}
          disabled={sending}
          style={styles.attachBtn}
          accessibilityLabel="Attach image or file"
        >
          <Ionicons name="attach" size={21} color={colors.textSecondary} />
        </Pressable>

        <TextInput
          style={styles.composerInput}
          placeholder="Message your room..."
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={4000}
        />

        <Pressable
          onPress={() => void handleSend()}
          disabled={(!draft.trim() && !pendingFile) || sending || connectionStatus !== "connected"}
          style={({ pressed }) => [
            styles.sendBtn,
            ((!draft.trim() && !pendingFile) || sending || connectionStatus !== "connected") &&
              styles.sendBtnDisabled,
            pressed && styles.sendBtnPressed,
          ]}
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Ionicons name="send" size={17} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>

      {/* Message Action Sheet Modal */}
      <Modal
        visible={Boolean(actionMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMessage(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActionMessage(null)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {actionMessage?.username} · {formatTime(actionMessage?.createdAt || 0)}
            </Text>

            <View style={styles.emojiBar}>
              {ALLOWED_REACTIONS.map(emoji => (
                <Pressable
                  key={emoji}
                  onPress={() => actionMessage && void handleReact(actionMessage.id, emoji)}
                  style={styles.emojiBtn}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                if (actionMessage) setReplyTarget(actionMessage);
                setActionMessage(null);
              }}
            >
              <Ionicons name="arrow-undo-outline" size={19} color={colors.text} />
              <Text style={styles.sheetActionText}>Reply</Text>
            </Pressable>

            <Pressable
              style={styles.sheetAction}
              onPress={async () => {
                if (actionMessage) await toggleSaveMessage(actionMessage);
                setActionMessage(null);
              }}
            >
              <Ionicons
                name={
                  actionMessage && savedIdSet.has(actionMessage.id)
                    ? "bookmark"
                    : "bookmark-outline"
                }
                size={19}
                color={colors.warning}
              />
              <Text style={styles.sheetActionText}>
                {actionMessage && savedIdSet.has(actionMessage.id)
                  ? "Remove from Saved"
                  : "Save Message"}
              </Text>
            </Pressable>

            {isRoomAdminOrOwner && actionMessage ? (
              <Pressable
                style={styles.sheetAction}
                onPress={async () => {
                  const id = actionMessage.id;
                  setActionMessage(null);
                  const res = await deleteChatMessage(id);
                  if (!res.ok) setErrorMsg(res.error || "Unable to delete message.");
                }}
              >
                <Ionicons name="trash-outline" size={19} color={colors.danger} />
                <Text style={[styles.sheetActionText, { color: colors.danger }]}>
                  Delete Message
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cross-Platform Attachment Source Picker Modal */}
      <Modal
        visible={attachSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachSheetOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setAttachSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Attach to Team Chat</Text>

            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                setAttachSheetOpen(false);
                void pickImage();
              }}
            >
              <Ionicons name="images-outline" size={20} color={colors.cyan} />
              <Text style={styles.sheetActionText}>Photo or Video</Text>
            </Pressable>

            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                setAttachSheetOpen(false);
                void pickDocument();
              }}
            >
              <Ionicons name="document-attach-outline" size={20} color={colors.primaryBright} />
              <Text style={styles.sheetActionText}>Document or File</Text>
            </Pressable>

            <Pressable
              style={styles.sheetAction}
              onPress={() => setAttachSheetOpen(false)}
            >
              <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
              <Text style={[styles.sheetActionText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick In-Chat Voice Call Modal */}
      <Modal
        visible={voiceSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVoiceSheetOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setVoiceSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Voice Call · Room {roomState?.roomId || activeRoomId}</Text>

            {voiceChannels.map(ch => {
              const joined = ch.id === activeVoiceChannelId;
              return (
                <Pressable
                  key={ch.id}
                  style={[styles.sheetAction, joined && styles.sheetVoiceActive]}
                  onPress={() => {
                    if (joined) {
                      void leaveVoiceChannel();
                      setVoiceSheetOpen(false);
                    } else {
                      void handleQuickVoiceJoin(ch.id);
                    }
                  }}
                >
                  <Ionicons
                    name={joined ? "mic" : "call-outline"}
                    size={19}
                    color={joined ? colors.success : colors.cyan}
                  />
                  <View style={styles.flexOne}>
                    <Text style={styles.sheetActionText}>{ch.name}</Text>
                    <Text style={styles.stagingSub}>
                      {ch.participants.length} online · {joined ? "Connected (tap to leave)" : "Tap to join"}
                    </Text>
                  </View>
                  <Text style={[styles.voiceSheetBadge, joined && { color: colors.danger }]}>
                    {joiningVoiceId === ch.id ? "Linking…" : joined ? "Leave" : "Join"}
                  </Text>
                </Pressable>
              );
            })}

            {activeVoiceChannel ? (
              <Pressable
                style={styles.sheetAction}
                onPress={() => void setVoiceState({ deafened: !voiceDeafened })}
              >
                <Ionicons
                  name={voiceDeafened ? "volume-mute" : "headset-outline"}
                  size={19}
                  color={voiceDeafened ? colors.warning : colors.text}
                />
                <Text style={styles.sheetActionText}>
                  {voiceDeafened ? "Undeafen Incoming Audio" : "Deafen Incoming Audio"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                setVoiceSheetOpen(false);
                router.push("/voice");
              }}
            >
              <Ionicons name="options-outline" size={19} color={colors.primaryBright} />
              <Text style={styles.sheetActionText}>Open Full Voice Rooms & Diagnostics</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chatRoot: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    flexShrink: 0,
  },
  voiceCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 38,
    minWidth: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
    justifyContent: "center",
  },
  voiceCallBtnActive: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  voiceCallCount: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.cyan,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceLiveBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderBottomWidth: 1,
    borderBottomColor: colors.successBorder,
  },
  voiceLiveIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  voiceLiveTitle: {
    ...typography.caption,
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.text,
  },
  voiceLiveSub: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  voiceLiveCtrls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  voiceMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceMiniBtnMuted: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerBorder,
  },
  voiceMiniBtnSpeaker: {
    backgroundColor: "rgba(56, 189, 248, 0.14)",
    borderColor: "rgba(56, 189, 248, 0.32)",
  },
  voiceMiniBtnEnd: {
    backgroundColor: colors.dangerSolid,
    borderColor: colors.dangerSolid,
  },
  voiceJoinPromptBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(56, 189, 248, 0.25)",
  },
  voiceJoinPromptText: {
    flex: 1,
    ...typography.caption,
    fontSize: 12,
    color: colors.text,
  },
  voiceJoinPromptAction: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "700",
    color: colors.cyan,
  },
  sheetVoiceActive: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successSoft,
  },
  voiceSheetBadge: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "700",
    color: colors.cyan,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    flexShrink: 1,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterGroup: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  filterChipText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.primaryBright,
    fontWeight: "600",
  },
  clearBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  clearBtnText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.danger,
    fontWeight: "600",
  },
  bannerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm + 2,
  },
  msgRow: {
    flexDirection: "row",
  },
  msgRowOwn: {
    justifyContent: "flex-end",
  },
  msgRowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "86%",
    minWidth: 124,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    borderWidth: 1,
    gap: 7,
  },
  bubbleMediaWide: {
    width: "82%",
    minWidth: 248,
    maxWidth: 340,
  },
  bubbleOwn: {
    borderColor: colors.primaryBorder,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "rgba(20, 26, 38, 0.92)",
    borderColor: colors.borderStrong,
    borderBottomLeftRadius: 4,
  },
  bubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sender: {
    ...typography.label,
    fontSize: 11,
    color: colors.cyan,
  },
  senderOwn: {
    color: colors.primaryBright,
  },
  timestamp: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
  },
  replyBox: {
    borderLeftWidth: 2.5,
    borderLeftColor: colors.primaryBright,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm,
    paddingVertical: 5,
    backgroundColor: "rgba(11, 14, 20, 0.52)",
    borderRadius: 6,
    gap: 2,
  },
  replyAuthor: {
    ...typography.label,
    fontSize: 11,
    color: colors.primaryBright,
  },
  replySnippet: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  mediaBlock: {
    width: "100%",
    gap: 8,
  },
  mediaPressed: {
    opacity: 0.82,
  },
  mediaThumb: {
    width: "100%",
    height: 158,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceInset,
  },
  mediaChip: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 1,
    borderRadius: radii.md,
    backgroundColor: "rgba(11, 14, 20, 0.72)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  mediaIconPill: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mediaTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  mediaName: {
    ...typography.bodyMedium,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  mediaSize: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  messageText: {
    ...typography.body,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(11, 14, 20, 0.65)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionPillMine: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    paddingTop: 64,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptySub: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
  stagingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyAccent: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: colors.primaryBright,
  },
  stagingTitle: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
  },
  stagingSub: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  composerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  attachBtn: {
    width: 42,
    height: 44,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceInset,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    ...typography.body,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceElevated,
    opacity: 0.5,
  },
  sendBtnPressed: {
    backgroundColor: colors.primaryDeep,
  },
  flexOne: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  sheetTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
  },
  emojiBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceInset,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: {
    fontSize: 22,
  },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetActionText: {
    ...typography.bodyMedium,
    color: colors.text,
  },
});
