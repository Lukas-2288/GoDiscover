import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let receivedLiveChange = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !receivedLiveChange) setReducedMotion(enabled);
    });

    const handleChange = (enabled: boolean) => {
      receivedLiveChange = true;
      if (mounted) setReducedMotion(enabled);
    };

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      handleChange
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
