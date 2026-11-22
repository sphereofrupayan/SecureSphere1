/**
 * Centralized SecureSphere REST API endpoints.
 * Mapped 1-to-1 to existing routes in server.js (no invented endpoints).
 */
export const API_ENDPOINTS = {
  // Public server configuration
  CONFIG: "/api/config",

  // Authentication & direct room entry
  LOGIN: "/api/login",
  LOGOUT: "/api/logout",
  AUTH_CREATE_ROOM: "/api/auth/create-room",
  AUTH_ENTER_ROOM: "/api/auth/enter-room",
  ME: "/api/me",

  // Rooms & real-time collaboration snapshots
  STATE: "/api/state",
  ROOMS: "/api/rooms",
  ROOMS_JOIN: "/api/rooms/join",
  roomById: (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}`,
  roomCollaboration: (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}/collaboration`,
  roomMediaUpload: (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}/media`,
  mediaById: (mediaId: string) => `/api/media/${encodeURIComponent(mediaId)}`,

  // Voice & Gemini AI
  VOICE_ICE_CONFIG: "/api/voice/ice-config",
  GEMINI_STATUS: "/api/gemini/status",
  GEMINI_CONTEXT_SUMMARY: "/api/gemini/context-summary",
  GEMINI_STREAM: "/api/gemini/stream",

  // Admin
  ADMIN_USERS: "/api/admin/users",
  adminUserById: (id: number) => `/api/admin/users/${id}`,
  adminUserPassword: (id: number) => `/api/admin/users/${id}/password`,
  adminUserRole: (id: number) => `/api/admin/users/${id}/role`,
  ADMIN_EXPORT_CSV: "/api/admin/exports/database.csv",
  ADMIN_EXPORT_PDF: "/api/admin/exports/database.pdf",
} as const;
