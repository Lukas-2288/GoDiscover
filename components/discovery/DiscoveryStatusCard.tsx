import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { Palette } from "../../lib/theme";

export type DiscoveryStatusCardProps =
  | { kind: "loading"; label: string; palette: Palette; reducedMotion: boolean }
  | {
      kind: "empty";
      label: string;
      actionLabel: string;
      onAction(): void;
      palette: Palette;
    }
  | { kind: "error"; message: string; onRetry(): void; palette: Palette };

export function DiscoveryStatusCard(props: DiscoveryStatusCardProps) {
  if (props.kind === "loading") {
    return (
      <View
        accessible
        accessibilityLabel={props.label}
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        style={[styles.card, { backgroundColor: props.palette.surface, borderColor: props.palette.border }]}
      >
        <ActivityIndicator
          accessible={false}
          animating={!props.reducedMotion}
          color={props.palette.accent}
          size="large"
        />
        <Text style={[styles.label, { color: props.palette.text }]}>{props.label}</Text>
      </View>
    );
  }

  if (props.kind === "empty") {
    return (
      <View style={[styles.card, { backgroundColor: props.palette.surface, borderColor: props.palette.border }]}>
        <Text style={[styles.label, { color: props.palette.text }]}>{props.label}</Text>
        <Pressable
          accessibilityLabel={props.actionLabel}
          accessibilityRole="button"
          onPress={props.onAction}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: props.palette.accent,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text style={[styles.actionLabel, { color: props.palette.onAccent }]}>{props.actionLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          backgroundColor: props.palette.surface,
          borderColor: props.palette.danger,
        },
      ]}
    >
      <Text style={[styles.label, { color: props.palette.text }]}>{props.message}</Text>
      <Pressable
        accessibilityLabel="Retry"
        accessibilityRole="button"
        onPress={props.onRetry}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: props.palette.danger,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text style={[styles.actionLabel, { color: props.palette.surface }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 22,
    borderWidth: 1,
    gap: 18,
    justifyContent: "center",
    maxWidth: 560,
    minHeight: 180,
    padding: 24,
    width: "100%",
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 25,
    textAlign: "center",
  },
  action: {
    alignItems: "center",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
});
