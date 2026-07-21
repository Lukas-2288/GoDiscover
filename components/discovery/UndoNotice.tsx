import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Palette } from "../../lib/theme";

export type UndoNoticeProps = {
  message: string | null;
  canUndo: boolean;
  palette: Palette;
  onUndo(): void;
};

export function UndoNotice({ message, canUndo, palette, onUndo }: UndoNoticeProps) {
  if (!message) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        {
          backgroundColor: palette.surface,
          borderColor: canUndo ? palette.success : palette.danger,
        },
      ]}
    >
      <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      {canUndo ? (
        <Pressable
          accessibilityLabel="Undo"
          accessibilityRole="button"
          onPress={onUndo}
          style={({ pressed }) => [styles.undo, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.undoLabel, { color: palette.focus }]}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    maxWidth: 560,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: "100%",
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    minWidth: 180,
  },
  undo: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  undoLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
});
