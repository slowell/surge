// M0 placeholder. Static, no async state. M2 replaces it with the Login and Home screens (SPEC §11).
import type { ClaimStatus } from "@surge/shared";
import { StyleSheet, Text, View } from "react-native";
import { colors, space, type } from "../src/ui/theme";

// Typed against the shared contract, so a breaking change in packages/shared fails `pnpm typecheck` here.
const OUTCOMES: readonly ClaimStatus[] = ["CLAIMED", "SOLD_OUT", "ALREADY_CLAIMED", "NOT_OPEN", "CLOSED"];

export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        Surge
      </Text>
      <Text style={styles.body}>Live Drops for fan members. The app arrives in M2.</Text>
      <Text style={styles.caption}>Contract outcomes: {OUTCOMES.join(" · ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: space.lg, gap: space.sm, backgroundColor: colors.bg },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.textMuted },
  caption: { ...type.caption, color: colors.textMuted },
});
