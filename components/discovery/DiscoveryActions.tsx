import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Palette } from "../../lib/theme";

export type DiscoveryActionsProps = {
  disabled: boolean;
  palette: Palette;
  accent: string;
  onAccent: string;
  onSave(): void;
  onSkip(): void;
  onSimilar(): void;
};

export function DiscoveryActions({
  disabled,
  palette,
  accent,
  onAccent,
  onSave,
  onSkip,
  onSimilar,
}: DiscoveryActionsProps) {
  const disabledState = { disabled };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="Not for me"
        accessibilityRole="button"
        accessibilityState={disabledState}
        disabled={disabled}
        onPress={onSkip}
        style={({ pressed }) => [
          styles.action,
          styles.secondaryAction,
          {
            backgroundColor: palette.surface,
            borderColor: palette.borderStrong,
            opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
          },
        ]}
      >
        <FontAwesome
          accessible={false}
          name="times"
          size={16}
          color={palette.textSecondary}
        />
        <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>Not for me</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Save"
        accessibilityRole="button"
        accessibilityState={disabledState}
        disabled={disabled}
        onPress={onSave}
        style={({ pressed }) => [
          styles.action,
          styles.primaryAction,
          {
            backgroundColor: accent,
            opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <FontAwesome
          accessible={false}
          name="heart"
          size={16}
          color={onAccent}
        />
        <Text style={[styles.primaryLabel, { color: onAccent }]}>Save</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Find similar"
        accessibilityRole="button"
        accessibilityState={disabledState}
        disabled={disabled}
        onPress={onSimilar}
        style={({ pressed }) => [
          styles.action,
          styles.secondaryAction,
          {
            backgroundColor: palette.surface,
            borderColor: palette.borderStrong,
            opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
          },
        ]}
      >
        <FontAwesome
          accessible={false}
          name="clone"
          size={15}
          color={palette.textSecondary}
        />
        <Text style={[styles.secondaryLabel, { color: palette.textSecondary }]}>Find similar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    width: "100%",
  },
  action: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    flexShrink: 1,
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    maxWidth: "100%",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryAction: {
    borderWidth: 1,
    flexGrow: 1,
  },
  primaryAction: {
    flexGrow: 1.15,
  },
  secondaryLabel: {
    flexShrink: 1,
    flexWrap: "wrap",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  primaryLabel: {
    flexShrink: 1,
    flexWrap: "wrap",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
});
