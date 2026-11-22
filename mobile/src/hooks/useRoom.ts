import { useContext } from "react";
import { RoomContext, RoomContextValue } from "@/context/RoomContext";

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoom must be used inside a RoomProvider");
  }
  return ctx;
}
