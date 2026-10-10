import { useEffect } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export type DiscoveryAnnouncerProps = {
  message: string | null;
  actionErrorMessage?: string | null;
};

export default function DiscoveryAnnouncer({
  message,
  actionErrorMessage = null,
}: DiscoveryAnnouncerProps) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  useEffect(() => {
    if (Platform.OS === "ios" && actionErrorMessage) {
      AccessibilityInfo.announceForAccessibility(actionErrorMessage);
    }
  }, [actionErrorMessage]);

  return null;
}
