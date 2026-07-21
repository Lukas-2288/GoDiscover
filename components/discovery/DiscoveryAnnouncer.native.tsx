import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

export type DiscoveryAnnouncerProps = {
  message: string | null;
};

export default function DiscoveryAnnouncer({ message }: DiscoveryAnnouncerProps) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return null;
}
