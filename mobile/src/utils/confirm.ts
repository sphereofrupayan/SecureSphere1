import { Alert, Platform } from "react-native";

export function confirmAction(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}): void {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const ok = window.confirm(`${options.title}\n\n${options.message}`);
    if (ok) {
      void options.onConfirm();
    }
    return;
  }

  Alert.alert(options.title, options.message, [
    { text: "Cancel", style: "cancel" },
    {
      text: options.confirmLabel || "Confirm",
      style: options.destructive ? "destructive" : "default",
      onPress: () => {
        void options.onConfirm();
      },
    },
  ]);
}
