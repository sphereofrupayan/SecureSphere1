import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi, setUnauthorizedHandler } from "@/api";
import { ENV } from "@/constants/env";
import { STORAGE_KEYS } from "@/constants/storage";
import {
  clearMemoryCache,
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from "@/services/secureStorage";
import { disconnectSocket } from "@/services/socket";
import { isApiError } from "@/types";
import type {
  AuthUser,
  CreateRoomAuthRequest,
  EnterRoomAuthRequest,
  LoginRequest,
} from "@/types";
import { normalizeRoomCode } from "@/utils/format";

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  activeRoomId: string;
  isAuthenticated: boolean;
  isHydrating: boolean;
  sessionNotice: string | null;
  clearSessionNotice: () => void;
  signIn: (payload: LoginRequest) => Promise<void>;
  createRoomSession: (payload: CreateRoomAuthRequest) => Promise<{ roomId: string; roomName: string }>;
  enterRoomSession: (payload: EnterRoomAuthRequest) => Promise<{ roomId: string; roomName: string }>;
  setActiveRoomId: (roomId: string) => Promise<void>;
  updateUserRole: (isAdmin: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  handleSessionExpired: (reason?: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomIdState] = useState<string>(ENV.defaultRoomId);
  const [isHydrating, setIsHydrating] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const expiringRef = useRef(false);

  const persistSession = useCallback(
    async (nextToken: string, nextUser: AuthUser, nextRoomId?: string) => {
      const normalizedRoom = normalizeRoomCode(nextRoomId) || ENV.defaultRoomId;
      await Promise.all([
        setSecureItem(STORAGE_KEYS.AUTH_TOKEN, nextToken),
        setSecureItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(nextUser)),
        setSecureItem(STORAGE_KEYS.ACTIVE_ROOM_ID, normalizedRoom),
      ]);
      setToken(nextToken);
      setUser(nextUser);
      setActiveRoomIdState(normalizedRoom);
      setSessionNotice(null);
    },
    []
  );

  const wipeLocalSession = useCallback(async () => {
    disconnectSocket();
    await Promise.all([
      deleteSecureItem(STORAGE_KEYS.AUTH_TOKEN),
      deleteSecureItem(STORAGE_KEYS.AUTH_USER),
      deleteSecureItem(STORAGE_KEYS.ACTIVE_ROOM_ID),
    ]);
    clearMemoryCache();
    setToken(null);
    setUser(null);
    setActiveRoomIdState(ENV.defaultRoomId);
  }, []);

  const handleSessionExpired = useCallback(
    async (reason = "Your session has expired. Please sign in again.") => {
      if (expiringRef.current) return;
      expiringRef.current = true;
      try {
        await wipeLocalSession();
        setSessionNotice(reason);
      } finally {
        expiringRef.current = false;
      }
    },
    [wipeLocalSession]
  );

  useEffect(() => {
    setUnauthorizedHandler(reason => {
      void handleSessionExpired(reason);
    });
    return () => setUnauthorizedHandler(null);
  }, [handleSessionExpired]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const [storedToken, storedUserRaw, storedRoom] = await Promise.all([
          getSecureItem(STORAGE_KEYS.AUTH_TOKEN),
          getSecureItem(STORAGE_KEYS.AUTH_USER),
          getSecureItem(STORAGE_KEYS.ACTIVE_ROOM_ID),
        ]);

        if (!active) return;

        if (!storedToken) {
          setIsHydrating(false);
          return;
        }

        const roomId = normalizeRoomCode(storedRoom) || ENV.defaultRoomId;
        let cachedUser: AuthUser | null = null;
        if (storedUserRaw) {
          try {
            cachedUser = JSON.parse(storedUserRaw) as AuthUser;
          } catch {
            cachedUser = null;
          }
        }

        try {
          const verifiedUser = await authApi.getCurrentUser();
          if (!active) return;
          await setSecureItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(verifiedUser));
          setToken(storedToken);
          setUser(verifiedUser);
          setActiveRoomIdState(roomId);
        } catch (error) {
          if (!active) return;

          if (isApiError(error) && error.isUnauthorized) {
            await wipeLocalSession();
            setSessionNotice("Your previous session expired. Please sign in again.");
          } else if (cachedUser) {
            // Preserve session locally on transient offline boot
            setToken(storedToken);
            setUser(cachedUser);
            setActiveRoomIdState(roomId);
          } else {
            await wipeLocalSession();
          }
        }
      } finally {
        if (active) {
          setIsHydrating(false);
        }
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [wipeLocalSession]);

  const signIn = useCallback(
    async (payload: LoginRequest) => {
      const response = await authApi.login(payload);
      await persistSession(
        response.token,
        { username: response.username, isAdmin: response.isAdmin },
        ENV.defaultRoomId
      );
    },
    [persistSession]
  );

  const createRoomSession = useCallback(
    async (payload: CreateRoomAuthRequest) => {
      const response = await authApi.createRoomWithAuth(payload);
      await persistSession(
        response.token,
        { username: response.username, isAdmin: response.isAdmin },
        response.roomId
      );
      return { roomId: response.roomId, roomName: response.roomName };
    },
    [persistSession]
  );

  const enterRoomSession = useCallback(
    async (payload: EnterRoomAuthRequest) => {
      const response = await authApi.enterRoomWithAuth(payload);
      await persistSession(
        response.token,
        { username: response.username, isAdmin: response.isAdmin },
        response.roomId
      );
      return { roomId: response.roomId, roomName: response.roomName };
    },
    [persistSession]
  );

  const setActiveRoomId = useCallback(async (roomId: string) => {
    const normalized = normalizeRoomCode(roomId) || ENV.defaultRoomId;
    setActiveRoomIdState(normalized);
    await setSecureItem(STORAGE_KEYS.ACTIVE_ROOM_ID, normalized);
  }, []);

  const updateUserRole = useCallback(async (isAdmin: boolean) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, isAdmin };
      void setSecureItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Always clear local secure session even if backend is offline
    } finally {
      await wipeLocalSession();
      setSessionNotice(null);
    }
  }, [wipeLocalSession]);

  const clearSessionNotice = useCallback(() => {
    setSessionNotice(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      activeRoomId,
      isAuthenticated: Boolean(user && token),
      isHydrating,
      sessionNotice,
      clearSessionNotice,
      signIn,
      createRoomSession,
      enterRoomSession,
      setActiveRoomId,
      updateUserRole,
      signOut,
      handleSessionExpired,
    }),
    [
      user,
      token,
      activeRoomId,
      isHydrating,
      sessionNotice,
      clearSessionNotice,
      signIn,
      createRoomSession,
      enterRoomSession,
      setActiveRoomId,
      updateUserRole,
      signOut,
      handleSessionExpired,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
