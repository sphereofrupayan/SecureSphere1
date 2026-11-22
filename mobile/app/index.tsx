import React from "react";
import { Redirect } from "expo-router";
import { LoadingState } from "@/components";
import { useAuth } from "@/hooks/useAuth";

export default function IndexScreen() {
  const { isHydrating, isAuthenticated } = useAuth();

  if (isHydrating) {
    return <LoadingState message="Restoring SecureSphere session..." />;
  }

  return <Redirect href={isAuthenticated ? "/(tabs)" : "/(auth)/login"} />;
}
