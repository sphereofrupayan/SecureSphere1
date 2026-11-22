import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { roomsApi } from "@/api";
import { STORAGE_KEYS } from "@/constants/storage";
import { useAuth } from "@/hooks/useAuth";
import { getSecureItem, setSecureItem } from "@/services/secureStorage";
import { connectSocket, disconnectSocket, getActiveSocket } from "@/services/socket";
import type {
  ChatMessage,
  GameMatch,
  GamesLobbyState,
  GameType,
  NotificationsState,
  PresencePayload,
  RoomMember,
  RoomState,
  SavedChatItem,
  SocketConnectionStatus,
  UserNotification,
  VoiceChannel,
  VoiceChannelsPayload,
  WhiteboardCursor,
  WhiteboardElement,
  WhiteboardState,
} from "@/types";
import { normalizeRoomCode } from "@/utils/format";

type ActionResult<T = object> = Promise<({ ok: boolean; error?: string } & Partial<T>)>;

export interface SendMessageOptions {
  message?: string;
  replyToId?: string | null;
  mediaId?: string | null;
  messageType?: "discussion" | "prompt_suggestion" | "media";
}

export interface RoomContextValue {
  roomState: RoomState | null;
  roomOpenedAt: number | null;
  presenceCount: number;
  participants: string[];
  members: RoomMember[];
  chatMessages: ChatMessage[];
  savedItems: SavedChatItem[];
  gamesLobby: GamesLobbyState | null;
  whiteboardState: WhiteboardState | null;
  remoteStrokes: Record<string, WhiteboardElement>;
  voiceChannels: VoiceChannel[];
  activeVoiceChannelId: string | null;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  notifications: UserNotification[];
  unreadNotificationsCount: number;
  connectionStatus: SocketConnectionStatus;
  lastError: string | null;
  isSwitchingRoom: boolean;
  isRoomAdminOrOwner: boolean;

  // Room & Workspace
  refreshRoom: () => Promise<void>;
  switchRoom: (roomId: string) => ActionResult;
  createAndSwitchRoom: (name?: string) => Promise<{ roomId: string; roomName: string }>;
  joinAndSwitchRoom: (roomId: string) => Promise<{ roomId: string; roomName: string }>;
  setPluginState: (pluginId: "youtube" | "games", enabled: boolean) => ActionResult;
  setWhiteboardMemberDraw: (enabled: boolean) => ActionResult;
  transferRoomAdmin: (targetUsername: string) => ActionResult;

  // Chat & Bookmarks
  sendChatMessage: (input: string | SendMessageOptions) => ActionResult;
  toggleReaction: (messageId: string, emoji: string) => ActionResult;
  deleteChatMessage: (messageId: string) => ActionResult;
  clearChat: () => ActionResult;
  toggleSaveMessage: (msg: ChatMessage) => Promise<boolean>;
  clearSavedItems: () => Promise<void>;

  // YouTube Sync
  setYoutubeSong: (urlOrId: string) => void;
  addToYoutubeQueue: (urlOrId: string) => void;
  removeFromYoutubeQueue: (trackId: string) => void;
  youtubePlay: (position: number) => void;
  youtubePause: (position: number) => void;
  youtubeSeek: (position: number) => void;
  youtubeNext: () => void;
  requestSync: () => void;

  // Whiteboard
  upsertWhiteboardElement: (element: WhiteboardElement, pushUndo?: boolean) => ActionResult;
  deleteWhiteboardElement: (id: string) => ActionResult;
  emitWhiteboardStrokeProgress: (element: WhiteboardElement) => void;
  emitWhiteboardCursor: (x: number, y: number, tool: string) => void;
  undoWhiteboard: () => ActionResult;
  redoWhiteboard: () => ActionResult;
  clearWhiteboard: () => ActionResult;

  // Games Lounge
  refreshGamesLobby: () => ActionResult;
  createGameMatch: (
    gameType: GameType,
    options?: { timeMinutes?: number; maxPlayers?: number },
    inviteUsername?: string
  ) => ActionResult<{ match: GameMatch }>;
  inviteGamePlayer: (matchId: string, targetUsername: string) => ActionResult;
  respondGameInvite: (inviteId: string, accept: boolean) => ActionResult<{ match?: GameMatch }>;
  joinGameMatch: (matchId: string) => ActionResult<{ match: GameMatch }>;
  startGameMatch: (matchId: string) => ActionResult<{ match: GameMatch }>;
  spectateGameMatch: (matchId: string) => ActionResult<{ match: GameMatch }>;
  leaveGameMatch: (matchId: string) => ActionResult;
  makeGameMove: (matchId: string, move: unknown) => ActionResult<{ match: GameMatch }>;
  rollLudoDice: (matchId: string) => ActionResult<{ dice: number; match: GameMatch }>;
  sendChessAction: (matchId: string, action: string) => ActionResult<{ match: GameMatch }>;
  rematchGame: (matchId: string) => ActionResult<{ match: GameMatch }>;
  clearGamesLounge: () => ActionResult;

  // Voice Channels
  createVoiceChannel: (name: string) => ActionResult;
  deleteVoiceChannel: (channelId: string) => ActionResult;
  joinVoiceChannel: (channelId: string) => ActionResult;
  leaveVoiceChannel: () => ActionResult;
  setVoiceState: (next: { muted?: boolean; deafened?: boolean }) => ActionResult;

  // Notifications
  markNotificationRead: (id: string) => ActionResult;
  markAllNotificationsRead: () => ActionResult;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

function emitWithAck<T extends { ok: boolean; error?: string }>(
  event: string,
  payload?: unknown,
  timeoutMs = 8000
): Promise<T> {
  const socket = getActiveSocket();
  if (!socket?.connected) {
    return Promise.resolve({
      ok: false,
      error: "Not connected to room server. Waiting for reconnection...",
    } as T);
  }
  return new Promise<T>(resolve => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, ack?: T) => {
      if (err) {
        resolve({ ok: false, error: "Request timed out. Please try again." } as T);
        return;
      }
      resolve(ack ?? ({ ok: true } as T));
    });
  });
}

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    isAuthenticated,
    token,
    activeRoomId,
    setActiveRoomId,
    updateUserRole,
    handleSessionExpired,
  } = useAuth();

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomOpenedAt, setRoomOpenedAt] = useState<number | null>(null);
  const [presenceCount, setPresenceCount] = useState(0);
  const [participants, setParticipants] = useState<string[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [savedItems, setSavedItems] = useState<SavedChatItem[]>([]);
  const [gamesLobby, setGamesLobby] = useState<GamesLobbyState | null>(null);
  const [whiteboardState, setWhiteboardState] = useState<WhiteboardState | null>(null);
  const [remoteStrokes, setRemoteStrokes] = useState<Record<string, WhiteboardElement>>({});
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceDeafened, setVoiceDeafened] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isSwitchingRoom, setIsSwitchingRoom] = useState(false);

  const activeRoomRef = useRef(activeRoomId);
  activeRoomRef.current = activeRoomId;

  // Hydrate locally saved bookmarked chat messages
  useEffect(() => {
    if (!isAuthenticated) {
      setSavedItems([]);
      return;
    }
    let mounted = true;
    void (async () => {
      const raw = await getSecureItem(STORAGE_KEYS.SAVED_ITEMS);
      if (!mounted || !raw) return;
      try {
        const parsed = JSON.parse(raw) as SavedChatItem[];
        if (Array.isArray(parsed)) setSavedItems(parsed);
      } catch {
        setSavedItems([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const refreshRoom = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const collab = await roomsApi.getRoomCollaboration(activeRoomRef.current);
      setRoomState(collab.state);
      setChatMessages(Array.isArray(collab.chatHistory) ? collab.chatHistory : []);
      if (collab.whiteboardState && typeof collab.whiteboardState === "object") {
        setWhiteboardState(collab.whiteboardState as WhiteboardState);
      }
      setLastError(null);
      const sock = getActiveSocket();
      if (sock?.connected) {
        sock.emit("requestSync");
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to load room state.");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      disconnectSocket();
      setRoomState(null);
      setRoomOpenedAt(null);
      setPresenceCount(0);
      setParticipants([]);
      setMembers([]);
      setChatMessages([]);
      setGamesLobby(null);
      setWhiteboardState(null);
      setRemoteStrokes({});
      setVoiceChannels([]);
      setActiveVoiceChannelId(null);
      setVoiceMuted(false);
      setVoiceDeafened(false);
      setNotifications([]);
      setUnreadNotificationsCount(0);
      setConnectionStatus("disconnected");
      setLastError(null);
      return;
    }

    setConnectionStatus("connecting");
    setLastError(null);

    const socket = connectSocket(token, activeRoomRef.current);

    socket.on("connect", () => {
      setConnectionStatus("connected");
      setLastError(null);
    });

    socket.on("disconnect", () => {
      setConnectionStatus("disconnected");
      setActiveVoiceChannelId(null);
    });

    socket.on("connect_error", (err: Error) => {
      if (err.message === "Unauthorized") {
        void handleSessionExpired("Your real-time session expired. Please sign in again.");
        return;
      }
      setConnectionStatus("error");
      setLastError(err.message || "Unable to connect to real-time server.");
    });

    socket.on("state", (nextState: RoomState) => {
      setRoomState(nextState);
    });

    socket.on("roomStatus", (payload: { roomOpenedAt?: number | null }) => {
      setRoomOpenedAt(payload?.roomOpenedAt ?? null);
    });

    socket.on("presence", (payload: PresencePayload) => {
      setPresenceCount(payload.count || 0);
      setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    });

    socket.on("chatHistory", (history: ChatMessage[]) => {
      setChatMessages(Array.isArray(history) ? history : []);
    });

    socket.on("chatMessage", (msg: ChatMessage) => {
      setChatMessages(prev => {
        if (prev.some(item => item.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    socket.on(
      "messageReactionUpdated",
      (payload: { messageId?: string; reactions?: Record<string, string[]> }) => {
        if (!payload?.messageId) return;
        setChatMessages(prev =>
          prev.map(msg =>
            msg.id === payload.messageId
              ? { ...msg, reactions: payload.reactions || {} }
              : msg
          )
        );
      }
    );

    socket.on("chatMessageDeleted", (payload: { id?: string; messageId?: string }) => {
      const targetId = payload?.messageId || payload?.id;
      if (!targetId) return;
      setChatMessages(prev => prev.filter(item => item.id !== targetId));
    });

    socket.on("chatCleared", () => {
      setChatMessages([]);
    });

    // Whiteboard live sync
    socket.on("whiteboardState", (payload: WhiteboardState) => {
      setWhiteboardState(payload);
      setRemoteStrokes({});
    });

    socket.on("whiteboard:element:upserted", (payload: { element?: WhiteboardElement }) => {
      const el = payload?.element;
      if (!el?.id) return;
      setWhiteboardState(prev => {
        if (!prev) return prev;
        const exists = prev.elements.some(item => item.id === el.id);
        const elements = exists
          ? prev.elements.map(item => (item.id === el.id ? el : item))
          : [...prev.elements, el];
        return { ...prev, elements };
      });
      setRemoteStrokes(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (next[k]?.id === el.id) delete next[k];
        });
        return next;
      });
    });

    socket.on("whiteboard:element:deleted", (payload: { ids?: string[] }) => {
      const ids = Array.isArray(payload?.ids) ? new Set(payload.ids) : null;
      if (!ids) return;
      setWhiteboardState(prev =>
        prev ? { ...prev, elements: prev.elements.filter(el => !ids.has(el.id)) } : prev
      );
    });

    socket.on(
      "whiteboard:stroke:progress",
      (payload: WhiteboardElement & { socketId?: string }) => {
        if (!payload?.socketId) return;
        setRemoteStrokes(prev => ({ ...prev, [payload.socketId!]: payload }));
      }
    );

    socket.on("whiteboard:cursor", (cursor: WhiteboardCursor) => {
      if (!cursor?.socketId) return;
      setWhiteboardState(prev => {
        if (!prev) return prev;
        const others = prev.cursors.filter(c => c.socketId !== cursor.socketId);
        return { ...prev, cursors: [...others, cursor] };
      });
    });

    socket.on("whiteboard:cursor:remove", (payload: { socketId?: string }) => {
      if (!payload?.socketId) return;
      setWhiteboardState(prev =>
        prev
          ? { ...prev, cursors: prev.cursors.filter(c => c.socketId !== payload.socketId) }
          : prev
      );
    });

    // Games Lounge live sync
    socket.on("games:lobbyState", (payload: GamesLobbyState) => {
      setGamesLobby(payload);
    });

    socket.on("games:matchUpdated", (match: GameMatch) => {
      if (!match?.id) return;
      setGamesLobby(prev => {
        if (!prev) return prev;
        const exists = prev.matches.some(m => m.id === match.id);
        const matches = exists
          ? prev.matches.map(m => (m.id === match.id ? match : m))
          : [match, ...prev.matches];
        return { ...prev, matches };
      });
    });

    // Voice Channels live sync
    socket.on("voice:channelsUpdated", (payload: VoiceChannelsPayload) => {
      setVoiceChannels(Array.isArray(payload?.channels) ? payload.channels : []);
    });

    socket.on("voice:channelClosed", (payload: { channelId?: string }) => {
      setActiveVoiceChannelId(prev => (prev === payload?.channelId ? null : prev));
    });

    // Notifications live sync
    socket.on("notifications:state", (payload: NotificationsState) => {
      setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      setUnreadNotificationsCount(Number(payload?.unreadCount) || 0);
    });

    socket.on("accountRoleUpdated", (payload: { isAdmin?: boolean }) => {
      if (typeof payload?.isAdmin === "boolean") {
        void updateUserRole(payload.isAdmin);
      }
    });

    socket.on("errorMessage", (message: string) => {
      if (typeof message === "string" && message.trim()) {
        setLastError(message);
      }
    });

    void refreshRoom();

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, token, handleSessionExpired, refreshRoom, updateUserRole]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        const socket = getActiveSocket();
        if (socket?.connected) {
          socket.emit("requestSync");
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const isRoomAdminOrOwner = useMemo(() => {
    if (!user) return false;
    if (user.isAdmin) return true;
    if (!roomState?.owner) return false;
    return roomState.owner.toLowerCase() === user.username.toLowerCase();
  }, [roomState?.owner, user]);

  // ── Room & Workspace Actions ──
  const switchRoom = useCallback(
    async (rawRoomId: string) => {
      const code = normalizeRoomCode(rawRoomId);
      if (!code) return { ok: false, error: "Enter a valid Room ID." };

      setIsSwitchingRoom(true);
      setLastError(null);
      try {
        const ack = await emitWithAck<{ ok: boolean; error?: string; roomId?: string }>(
          "joinRoom",
          { roomId: code }
        );
        if (!ack.ok) {
          const joined = await roomsApi.joinRoom({ roomId: code });
          await setActiveRoomId(joined.roomId);
          await refreshRoom();
          setActiveVoiceChannelId(null);
          return { ok: true };
        }
        await setActiveRoomId(ack.roomId || code);
        setActiveVoiceChannelId(null);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unable to switch room.",
        };
      } finally {
        setIsSwitchingRoom(false);
      }
    },
    [refreshRoom, setActiveRoomId]
  );

  const createAndSwitchRoom = useCallback(
    async (name?: string) => {
      const created = await roomsApi.createRoom({ name });
      await switchRoom(created.roomId);
      return { roomId: created.roomId, roomName: created.roomName };
    },
    [switchRoom]
  );

  const joinAndSwitchRoom = useCallback(
    async (roomId: string) => {
      const joined = await roomsApi.joinRoom({ roomId: normalizeRoomCode(roomId) });
      await switchRoom(joined.roomId);
      return { roomId: joined.roomId, roomName: joined.roomName };
    },
    [switchRoom]
  );

  const setPluginState = useCallback(
    (pluginId: "youtube" | "games", enabled: boolean) =>
      emitWithAck("setPluginState", { pluginId, enabled }),
    []
  );

  const setWhiteboardMemberDraw = useCallback(
    (enabled: boolean) =>
      emitWithAck("setWorkspaceSettings", { whiteboardMemberDraw: enabled }),
    []
  );

  const transferRoomAdmin = useCallback(
    (targetUsername: string) => emitWithAck("room:switchAdmin", { targetUsername }),
    []
  );

  // ── Chat & Saved Actions ──
  const sendChatMessage = useCallback(async (input: string | SendMessageOptions) => {
    const payload =
      typeof input === "string"
        ? { message: input.trim(), messageType: "discussion" }
        : {
            message: (input.message || "").trim(),
            replyToId: input.replyToId || undefined,
            mediaId: input.mediaId || undefined,
            messageType: input.messageType || (input.mediaId ? "media" : "discussion"),
          };

    if (!payload.message && !payload.mediaId) {
      return { ok: false, error: "Message or attachment required." };
    }
    return emitWithAck("sendMessage", payload);
  }, []);

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) =>
      emitWithAck("toggleReaction", { messageId, emoji }),
    []
  );

  const deleteChatMessage = useCallback(
    (messageId: string) => emitWithAck("chat:deleteMessage", { messageId }),
    []
  );

  const clearChat = useCallback(() => emitWithAck("chat:clear", {}), []);

  const toggleSaveMessage = useCallback(async (msg: ChatMessage): Promise<boolean> => {
    let savedNow = false;
    setSavedItems(prev => {
      const exists = prev.some(item => item.id === msg.id);
      const next = exists
        ? prev.filter(item => item.id !== msg.id)
        : [
            {
              id: msg.id,
              roomId: msg.roomId,
              username: msg.username,
              message: msg.message || msg.media?.originalName || "Attachment",
              createdAt: msg.createdAt,
              savedAt: Date.now(),
            },
            ...prev,
          ].slice(0, 60);
      savedNow = !exists;
      void setSecureItem(STORAGE_KEYS.SAVED_ITEMS, JSON.stringify(next));
      return next;
    });
    return savedNow;
  }, []);

  const clearSavedItems = useCallback(async () => {
    setSavedItems([]);
    await setSecureItem(STORAGE_KEYS.SAVED_ITEMS, "[]");
  }, []);

  // ── YouTube Sync Actions ──
  const setYoutubeSong = useCallback((urlOrId: string) => {
    getActiveSocket()?.emit("setSong", urlOrId);
  }, []);

  const addToYoutubeQueue = useCallback((urlOrId: string) => {
    getActiveSocket()?.emit("addToQueue", urlOrId);
  }, []);

  const removeFromYoutubeQueue = useCallback((trackId: string) => {
    getActiveSocket()?.emit("removeFromQueue", trackId);
  }, []);

  const youtubePlay = useCallback((position: number) => {
    getActiveSocket()?.emit("play", position);
  }, []);

  const youtubePause = useCallback((position: number) => {
    getActiveSocket()?.emit("pause", position);
  }, []);

  const youtubeSeek = useCallback((position: number) => {
    getActiveSocket()?.emit("seek", position);
  }, []);

  const youtubeNext = useCallback(() => {
    getActiveSocket()?.emit("next");
  }, []);

  const requestSync = useCallback(() => {
    getActiveSocket()?.emit("requestSync");
  }, []);

  // ── Whiteboard Actions ──
  const upsertWhiteboardElement = useCallback(
    (element: WhiteboardElement, pushUndo = true) =>
      emitWithAck("whiteboard:element:upsert", { element, pushUndo }),
    []
  );

  const deleteWhiteboardElement = useCallback(
    (id: string) => emitWithAck("whiteboard:element:delete", { id }),
    []
  );

  const emitWhiteboardStrokeProgress = useCallback((element: WhiteboardElement) => {
    getActiveSocket()?.emit("whiteboard:stroke:progress", element);
  }, []);

  const emitWhiteboardCursor = useCallback((x: number, y: number, tool: string) => {
    getActiveSocket()?.emit("whiteboard:cursor", { x, y, tool });
  }, []);

  const undoWhiteboard = useCallback(() => emitWithAck("whiteboard:undo", {}), []);
  const redoWhiteboard = useCallback(() => emitWithAck("whiteboard:redo", {}), []);
  const clearWhiteboard = useCallback(() => emitWithAck("whiteboard:clear", {}), []);

  // ── Games Actions ──
  const refreshGamesLobby = useCallback(() => emitWithAck("games:getState", {}), []);

  const createGameMatch = useCallback(
    (
      gameType: GameType,
      options?: { timeMinutes?: number; maxPlayers?: number },
      inviteUsername?: string
    ) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:createMatch", {
        gameType,
        options,
        inviteUsername,
      }),
    []
  );

  const inviteGamePlayer = useCallback(
    (matchId: string, targetUsername: string) =>
      emitWithAck("games:invitePlayer", { matchId, targetUsername }),
    []
  );

  const respondGameInvite = useCallback(
    (inviteId: string, accept: boolean) =>
      emitWithAck<{ ok: boolean; error?: string; match?: GameMatch }>("games:respondInvite", {
        inviteId,
        accept,
      }),
    []
  );

  const joinGameMatch = useCallback(
    (matchId: string) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:joinMatch", {
        matchId,
      }),
    []
  );

  const startGameMatch = useCallback(
    (matchId: string) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:startMatch", {
        matchId,
      }),
    []
  );

  const spectateGameMatch = useCallback(
    (matchId: string) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:spectateMatch", {
        matchId,
      }),
    []
  );

  const leaveGameMatch = useCallback(
    (matchId: string) => emitWithAck("games:leaveMatch", { matchId }),
    []
  );

  const makeGameMove = useCallback(
    (matchId: string, move: unknown) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:makeMove", {
        matchId,
        move,
      }),
    []
  );

  const rollLudoDice = useCallback(
    (matchId: string) =>
      emitWithAck<{ ok: boolean; error?: string; dice: number; match: GameMatch }>(
        "games:ludoRoll",
        { matchId }
      ),
    []
  );

  const sendChessAction = useCallback(
    (matchId: string, action: string) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:chessAction", {
        matchId,
        action,
      }),
    []
  );

  const rematchGame = useCallback(
    (matchId: string) =>
      emitWithAck<{ ok: boolean; error?: string; match: GameMatch }>("games:rematch", {
        matchId,
      }),
    []
  );

  const clearGamesLounge = useCallback(() => emitWithAck("games:clear", {}), []);

  // ── Voice Channel Actions ──
  const createVoiceChannel = useCallback(
    (name: string) => emitWithAck("voice:createChannel", { name }),
    []
  );

  const deleteVoiceChannel = useCallback(
    (channelId: string) => emitWithAck("voice:deleteChannel", { channelId }),
    []
  );

  const joinVoiceChannel = useCallback(async (channelId: string) => {
    const res = await emitWithAck<{ ok: boolean; error?: string }>("voice:join", {
      channelId,
      muted: false,
      deafened: false,
    });
    if (res.ok) {
      setActiveVoiceChannelId(channelId);
      setVoiceMuted(false);
      setVoiceDeafened(false);
    }
    return res;
  }, []);

  const leaveVoiceChannel = useCallback(async () => {
    const res = await emitWithAck<{ ok: boolean; error?: string }>("voice:leave", {});
    setActiveVoiceChannelId(null);
    setVoiceMuted(false);
    setVoiceDeafened(false);
    return res;
  }, []);

  const setVoiceState = useCallback(
    async (next: { muted?: boolean; deafened?: boolean }) => {
      const nextMuted = next.muted ?? voiceMuted;
      const nextDeafened = next.deafened ?? voiceDeafened;
      const res = await emitWithAck<{ ok: boolean; error?: string }>("voice:state", {
        muted: nextDeafened ? true : nextMuted,
        deafened: nextDeafened,
      });
      if (res.ok) {
        setVoiceMuted(nextDeafened ? true : nextMuted);
        setVoiceDeafened(nextDeafened);
      }
      return res;
    },
    [voiceDeafened, voiceMuted]
  );

  // ── Notifications Actions ──
  const markNotificationRead = useCallback(
    (id: string) => emitWithAck("notifications:markRead", { id }),
    []
  );

  const markAllNotificationsRead = useCallback(
    () => emitWithAck("notifications:markAllRead", {}),
    []
  );

  const value = useMemo<RoomContextValue>(
    () => ({
      roomState,
      roomOpenedAt,
      presenceCount,
      participants,
      members,
      chatMessages,
      savedItems,
      gamesLobby,
      whiteboardState,
      remoteStrokes,
      voiceChannels,
      activeVoiceChannelId,
      voiceMuted,
      voiceDeafened,
      notifications,
      unreadNotificationsCount,
      connectionStatus,
      lastError,
      isSwitchingRoom,
      isRoomAdminOrOwner,
      refreshRoom,
      switchRoom,
      createAndSwitchRoom,
      joinAndSwitchRoom,
      setPluginState,
      setWhiteboardMemberDraw,
      transferRoomAdmin,
      sendChatMessage,
      toggleReaction,
      deleteChatMessage,
      clearChat,
      toggleSaveMessage,
      clearSavedItems,
      setYoutubeSong,
      addToYoutubeQueue,
      removeFromYoutubeQueue,
      youtubePlay,
      youtubePause,
      youtubeSeek,
      youtubeNext,
      requestSync,
      upsertWhiteboardElement,
      deleteWhiteboardElement,
      emitWhiteboardStrokeProgress,
      emitWhiteboardCursor,
      undoWhiteboard,
      redoWhiteboard,
      clearWhiteboard,
      refreshGamesLobby,
      createGameMatch,
      inviteGamePlayer,
      respondGameInvite,
      joinGameMatch,
      startGameMatch,
      spectateGameMatch,
      leaveGameMatch,
      makeGameMove,
      rollLudoDice,
      sendChessAction,
      rematchGame,
      clearGamesLounge,
      createVoiceChannel,
      deleteVoiceChannel,
      joinVoiceChannel,
      leaveVoiceChannel,
      setVoiceState,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      roomState,
      roomOpenedAt,
      presenceCount,
      participants,
      members,
      chatMessages,
      savedItems,
      gamesLobby,
      whiteboardState,
      remoteStrokes,
      voiceChannels,
      activeVoiceChannelId,
      voiceMuted,
      voiceDeafened,
      notifications,
      unreadNotificationsCount,
      connectionStatus,
      lastError,
      isSwitchingRoom,
      isRoomAdminOrOwner,
      refreshRoom,
      switchRoom,
      createAndSwitchRoom,
      joinAndSwitchRoom,
      setPluginState,
      setWhiteboardMemberDraw,
      transferRoomAdmin,
      sendChatMessage,
      toggleReaction,
      deleteChatMessage,
      clearChat,
      toggleSaveMessage,
      clearSavedItems,
      setYoutubeSong,
      addToYoutubeQueue,
      removeFromYoutubeQueue,
      youtubePlay,
      youtubePause,
      youtubeSeek,
      youtubeNext,
      requestSync,
      upsertWhiteboardElement,
      deleteWhiteboardElement,
      emitWhiteboardStrokeProgress,
      emitWhiteboardCursor,
      undoWhiteboard,
      redoWhiteboard,
      clearWhiteboard,
      refreshGamesLobby,
      createGameMatch,
      inviteGamePlayer,
      respondGameInvite,
      joinGameMatch,
      startGameMatch,
      spectateGameMatch,
      leaveGameMatch,
      makeGameMove,
      rollLudoDice,
      sendChessAction,
      rematchGame,
      clearGamesLounge,
      createVoiceChannel,
      deleteVoiceChannel,
      joinVoiceChannel,
      leaveVoiceChannel,
      setVoiceState,
      markNotificationRead,
      markAllNotificationsRead,
    ]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
