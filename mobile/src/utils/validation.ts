import { z } from "zod";

// Matches SecureSphere server.js username rules exactly
const USERNAME_REGEX = /^[a-zA-Z0-9_.\-\s]{2,30}$/;

const usernameField = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(USERNAME_REGEX, "Only letters, numbers, spaces, _, ., or - are allowed.");

const roomCodeField = z
  .string()
  .trim()
  .min(2, "Enter a valid Room ID (e.g. MAIN or SS-7K4M9P).")
  .max(32, "Room ID is too long.")
  .transform(val => val.toUpperCase());

export const loginSchema = z.object({
  username: usernameField,
  password: z.string().min(1, "Enter your password to sign in."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const createRoomAuthSchema = z.object({
  username: usernameField,
  password: z.string().max(128, "Password is too long.").optional().default(""),
  roomName: z.string().trim().max(60, "Room name must be 60 characters or fewer.").optional().default(""),
});

export type CreateRoomAuthFormValues = z.input<typeof createRoomAuthSchema>;

export const enterRoomAuthSchema = z.object({
  roomId: roomCodeField,
  username: usernameField,
  password: z.string().max(128, "Password is too long.").optional().default(""),
});

export type EnterRoomAuthFormValues = z.input<typeof enterRoomAuthSchema>;

export const createRoomSchema = z.object({
  name: z.string().trim().max(60, "Room name must be 60 characters or fewer.").optional().default(""),
});

export type CreateRoomFormValues = z.input<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  roomId: roomCodeField,
});

export type JoinRoomFormValues = z.input<typeof joinRoomSchema>;
