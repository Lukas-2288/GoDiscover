import { StyleSheet, Text } from "react-native";

export type DiscoveryAnnouncerProps = {
  message: string | null;
};

export default function DiscoveryAnnouncer({ message }: DiscoveryAnnouncerProps) {
  return (
    <Text aria-live="polite" role="status" style={styles.visuallyHidden}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  visuallyHidden: {
    borderWidth: 0,
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    width: 1,
  },
});
