import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { getCategoryTheme, CATEGORY_ORDER } from "../../lib/discovery/categoryThemes";
import type { ContentDetail } from "../../lib/discovery/loadDetail";
import type { ContentCategory, ResultItem } from "../../types/content";

export type WebSection = "archive" | "discover" | "atlas" | "account";
export type WebLayoutMode = "mobile" | "tabletPortrait" | "tabletLandscape" | "desktop";

export type WebPalette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  violet: string;
  tangerine: string;
  mint: string;
  lime: string;
  border: string;
};

export const webPalette: WebPalette = {
  bg: "#15111F",
  surface: "#F4F1EA",
  text: "#F9F5EF",
  muted: "#B8AFC7",
  violet: "#7C5CFC",
  tangerine: "#FF8A5B",
  mint: "#B6F0D2",
  lime: "#D7F36A",
  border: "rgba(255,255,255,0.16)",
};

export function resolveWebLayout(width: number, height: number): WebLayoutMode {
  if (width < 700) return "mobile";
  if (height > width) return "tabletPortrait";
  if (width < 1200 || height > width) return "tabletLandscape";
  return "desktop";
}

export function WebShell({
  section,
  onSectionChange,
  savedCount,
  children,
}: {
  section: WebSection;
  onSectionChange(section: WebSection): void;
  savedCount: number;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  const nav = [
    ["archive", "Archive", "th-large"],
    ["discover", "Discover", "compass"],
    ["atlas", `Saved Atlas${savedCount ? ` ${savedCount}` : ""}`, "sitemap"],
    ["account", "Account", "user-circle-o"],
  ] as const;

  return (
    <View style={styles.shell}>
      <View style={styles.chrome}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="GoDiscover home"
          onPress={() => onSectionChange("archive")}
          style={styles.wordmark}
        >
          <Text style={styles.wordmarkSmall}>GO / DISCOVER</Text>
          <Text style={styles.wordmarkLarge}>a culture arcade</Text>
        </Pressable>
        <View style={styles.nav} accessibilityRole="tablist">
          {nav.map(([value, label, icon]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === value }}
              onPress={() => onSectionChange(value)}
              style={({ pressed }) => [
                styles.navItem,
                section === value && styles.navItemActive,
                pressed && styles.pressed,
              ]}
            >
              <FontAwesome name={icon as any} size={14} color={section === value ? webPalette.bg : webPalette.muted} />
              <Text style={[styles.navLabel, section === value && styles.navLabelActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {width >= 700 ? <Text style={styles.chromeHint}>A FIELD GUIDE FOR YOUR NEXT OBSESSION</Text> : null}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

export function ArchiveAtlas({
  recentItems,
  onSelect,
  onOpenRecent,
  onSurprise,
}: {
  recentItems: readonly (ResultItem & { category: ContentCategory })[];
  onSelect(category: ContentCategory): void;
  onOpenRecent(item: ResultItem & { category: ContentCategory }): void;
  onSurprise(): void;
}) {
  const { width } = useWindowDimensions();
  const tileWidth = width < 700 ? "47%" : width < 1100 ? "48%" : "23.5%";
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.archive}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>THE ARCHIVE IS OPEN</Text>
          <Text style={[styles.heroTitle, width < 700 && styles.heroTitleMobile]}>Find a new{ "\n" }favourite rabbit hole.</Text>
          <Text style={styles.heroBody}>
            Browse the shelves, follow a strange connection, and let the next great thing find you.
          </Text>
          <Pressable accessibilityRole="button" onPress={onSurprise} style={styles.heroButton}>
            <Text style={styles.heroButtonText}>Surprise me</Text>
            <FontAwesome name="long-arrow-right" size={16} color={webPalette.bg} />
          </Pressable>
        </View>
        <View style={styles.heroStamp} accessible={false}>
          <Text style={styles.heroStampText}>EST.</Text>
          <Text style={styles.heroStampYear}>2026</Text>
          <Text style={styles.heroStampText}>KEEP LOOKING</Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionKicker}>01 / CHOOSE A DOOR</Text>
        <Text style={styles.sectionTitle}>Explore the archive</Text>
      </View>
      <View style={styles.atlasGrid}>
        {CATEGORY_ORDER.map((category, index) => {
          const theme = getCategoryTheme(category);
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityLabel={`Explore ${theme.label}`}
              onPress={() => onSelect(category)}
              style={({ pressed }) => [styles.atlasTile, styles.atlasTileGrow, { backgroundColor: theme.softDark, borderColor: theme.accent, width: tileWidth }, pressed && styles.atlasTilePressed]}
            >
              <View style={[styles.atlasOrb, { backgroundColor: theme.accent }]} />
              <Text style={[styles.atlasNumber, { color: theme.accent }]}>0{index + 1}</Text>
              <FontAwesome name={theme.icon} size={25} color={theme.accent} />
              <Text style={styles.atlasLabel}>{theme.label}</Text>
              <Text style={[styles.atlasHint, { color: theme.accent }]}>OPEN PORTAL ↗</Text>
            </Pressable>
          );
        })}
      </View>

      {recentItems.length > 0 ? (
        <View style={styles.recentSection}>
          <View style={styles.sectionHeadingInline}>
            <View>
              <Text style={styles.sectionKicker}>02 / PICK UP THE THREAD</Text>
              <Text style={styles.sectionTitle}>Recently viewed</Text>
            </View>
            <Text style={styles.sectionAside}>YOUR TRAIL SO FAR</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
            {recentItems.slice(0, 8).map((item) => {
              const theme = getCategoryTheme(item.category);
              return (
                <Pressable key={`${item.category}:${item.id}`} accessibilityRole="button" onPress={() => onOpenRecent(item)} style={styles.recentTile}>
                  <View style={[styles.recentImage, { backgroundColor: theme.softDark }]}>
                    {item.imageUrl ? <View style={[styles.recentImageFill, { backgroundImage: `url(${item.imageUrl})` } as any]} /> : <FontAwesome name={theme.icon} size={22} color={theme.accent} />}
                  </View>
                  <Text style={styles.recentCategory}>{theme.label.toUpperCase()}</Text>
                  <Text style={styles.recentTitle} numberOfLines={2}>{item.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function WebDiscoveryStage({
  category,
  activeItem,
  nextItem,
  loading,
  onSkip,
  onSave,
  onSimilar,
  onOpen,
  reducedMotion = false,
}: {
  category: ContentCategory;
  activeItem: ResultItem | null;
  nextItem: ResultItem | null;
  loading: boolean;
  onSkip(): void;
  onSave(): void;
  onSimilar(): void;
  onOpen(): void;
  reducedMotion?: boolean;
}) {
  const { width } = useWindowDimensions();
  const theme = getCategoryTheme(category);
  if (!activeItem && loading) {
    return <View style={styles.emptyStage}><Text style={styles.stageKicker}>OPENING PORTAL</Text><Text style={styles.stageTitle}>Finding a new {theme.singular}...</Text><View style={styles.loadingBar}><View style={[styles.loadingFill, { backgroundColor: theme.accent }]} /></View></View>;
  }
  if (!activeItem) {
    return <View style={styles.emptyStage}><Text style={styles.stageKicker}>THE CABINET IS QUIET</Text><Text style={styles.stageTitle}>Choose a new door from the archive.</Text></View>;
  }
  return (
    <View style={styles.discoveryStage}>
      <View style={styles.discoveryHeader}>
        <View>
          <Text style={styles.sectionKicker}>DISCOVERY / {theme.label.toUpperCase()}</Text>
          <Text style={styles.discoveryHeading}>One good thing leads to another.</Text>
        </View>
        <Text style={[styles.portalTag, { color: theme.accent, borderColor: theme.accent }]}>{theme.badge}</Text>
      </View>
      <View style={styles.cardStage}>
        {nextItem ? <View style={[styles.peekCard, { borderColor: theme.accent, backgroundColor: theme.softDark }]} accessible={false}><Text style={styles.peekLabel}>NEXT IN THE STACK</Text><Text style={styles.peekTitle}>{nextItem.title}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Open details for ${activeItem.title}`} onPress={onOpen} style={[styles.webCard, reducedMotion && styles.webCardReduced]}>
          <View style={[styles.cardArt, { backgroundColor: theme.softDark }]}>
            {activeItem.imageUrl ? <View style={[styles.cardArtImage, { backgroundImage: `url(${activeItem.imageUrl})` } as any]} /> : <FontAwesome name={theme.icon} size={62} color={theme.accent} />}
            <View style={[styles.cardBadge, { backgroundColor: theme.accent }]}><Text style={[styles.cardBadgeText, { color: theme.onAccent }]}>{theme.badge}</Text></View>
          </View>
          <View style={styles.cardCopy}>
            <Text style={styles.cardCategory}>{theme.label.toUpperCase()}</Text>
            <Text style={styles.cardTitle}>{activeItem.title}</Text>
            <Text style={styles.cardSubtitle}>{activeItem.subtitle}</Text>
            <Text style={styles.cardMeta}>{activeItem.meta}</Text>
          </View>
        </Pressable>
      </View>
      <View style={[styles.actionRow, width < 700 && styles.actionRowMobile]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not for me" onPress={onSkip} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>← Not for me</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={onSave} style={[styles.primaryAction, { backgroundColor: theme.accent }]}><Text style={[styles.primaryActionText, { color: theme.onAccent }]}>Save to map</Text><FontAwesome name="plus" size={14} color={theme.onAccent} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Find similar" onPress={onSimilar} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Find similar →</Text></Pressable>
      </View>
      <Text style={styles.keyboardHint}>ARROWS TO DECIDE · S TO SAVE · U TO UNDO · ENTER FOR DETAILS</Text>
    </View>
  );
}

export function WebDetailPanel({
  item,
  category,
  detail,
  saved,
  loading,
  onClose,
  onSave,
  onSimilar,
  onShare,
  presentation = "rail",
  expanded = true,
  onToggleExpanded,
  similarLabel = "Find similar",
}: {
  item: ResultItem | null;
  category: ContentCategory | null;
  detail: ContentDetail | null;
  saved: boolean;
  loading: boolean;
  onClose(): void;
  onSave(): void;
  onSimilar(): void;
  onShare?(): void;
  presentation?: "drawer" | "rail" | "sheet";
  expanded?: boolean;
  onToggleExpanded?(): void;
  similarLabel?: string;
}) {
  const { width } = useWindowDimensions();
  if (!item || !category) return null;
  const theme = getCategoryTheme(category);
  const description = detail ? detailDescription(detail) : "Open the full detail card to see why this one belongs in your orbit.";
  return (
    <View style={[styles.detailPanel, presentation === "drawer" && styles.detailPanelDrawer, (presentation === "sheet" || width < 700) && styles.detailPanelMobile]} accessibilityViewIsModal={presentation === "sheet"} accessibilityLabel={`${item.title} details`}>
      <View style={styles.detailTop}><Text style={[styles.sectionKicker, { color: theme.accent }]}>{theme.label.toUpperCase()} / FIELD NOTE</Text><Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
      <Text style={styles.detailTitle}>{item.title}</Text>
      <Text style={styles.detailSubtitle}>{item.subtitle}</Text>
      <Text style={styles.detailMeta}>{item.meta}</Text>
      {presentation === "drawer" && onToggleExpanded ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Collapse detail drawer" : "Expand detail drawer"} onPress={onToggleExpanded} style={styles.drawerToggle}><Text style={styles.drawerToggleText}>{expanded ? "Show preview" : "Expand details"}</Text></Pressable> : null}
      {expanded || presentation !== "drawer" ? <>
        {loading ? <Text style={styles.detailLoading}>Gathering the long version...</Text> : <Text style={styles.detailDescription}>{description}</Text>}
        <View style={styles.detailActions}>
          <Pressable accessibilityRole="button" onPress={onSave} style={[styles.primaryAction, { backgroundColor: theme.accent }]}><Text style={[styles.primaryActionText, { color: theme.onAccent }]}>{saved ? "Remove from map" : "Save to map"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={similarLabel} onPress={onSimilar} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{similarLabel}</Text></Pressable>
          {onShare ? <Pressable accessibilityRole="button" onPress={onShare} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Share</Text></Pressable> : null}
        </View>
      </> : null}
    </View>
  );
}

function detailDescription(detail: ContentDetail): string {
  const data = detail.data as any;
  return data.overview || data.description || (data.genres?.length ? data.genres.join(" · ") : "No additional field note available.");
}

const styles = StyleSheet.create({
  shell: { backgroundColor: webPalette.bg, flex: 1, minHeight: "100vh" as any },
  chrome: { alignItems: "center", borderBottomColor: webPalette.border, borderBottomWidth: 1, flexDirection: "row", gap: 28, justifyContent: "space-between", paddingHorizontal: 28, paddingVertical: 18 },
  wordmark: { flexShrink: 0 }, wordmarkSmall: { color: webPalette.mint, fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 1.4 }, wordmarkLarge: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 18, fontWeight: "800", marginTop: 3 },
  nav: { alignItems: "center", flexDirection: "row", flexShrink: 1, flexWrap: "wrap", gap: 6, justifyContent: "center" }, navItem: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 7, minHeight: 44, paddingHorizontal: 13 }, navItemActive: { backgroundColor: webPalette.lime }, navLabel: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 13, fontWeight: "700" }, navLabelActive: { color: webPalette.bg }, chromeHint: { color: webPalette.muted, fontFamily: "IBM Plex Mono", fontSize: 9, maxWidth: 180, textAlign: "right" }, pressed: { opacity: 0.72 }, content: { flex: 1 },
  archive: { alignSelf: "center", gap: 34, maxWidth: 1180, padding: 34, width: "100%" }, heroRow: { flexDirection: "row", justifyContent: "space-between", minHeight: 260 }, heroCopy: { maxWidth: 700 }, eyebrow: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 11, letterSpacing: 2 }, heroTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 58, fontWeight: "900", letterSpacing: -2, lineHeight: 61, marginTop: 12 }, heroBody: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 17, lineHeight: 26, maxWidth: 560, marginTop: 18 }, heroButton: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, flexDirection: "row", gap: 12, marginTop: 22, paddingHorizontal: 19, paddingVertical: 12 }, heroButtonText: { color: webPalette.bg, fontFamily: "DM Sans", fontSize: 14, fontWeight: "800" }, heroStamp: { alignItems: "center", borderColor: webPalette.tangerine, borderRadius: 100, borderWidth: 1, height: 132, justifyContent: "center", marginTop: 10, transform: [{ rotate: "8deg" }], width: 132 }, heroStampText: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 9, letterSpacing: 1 }, heroStampYear: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 26, fontWeight: "900", marginVertical: 4 },
  sectionHeading: { gap: 5 }, sectionHeadingInline: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" }, sectionKicker: { color: webPalette.mint, fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 1.6 }, sectionTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 30, fontWeight: "900", marginTop: 4 }, sectionAside: { color: webPalette.muted, fontFamily: "IBM Plex Mono", fontSize: 9 }, atlasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 13 }, atlasTile: { borderRadius: 22, borderWidth: 1, minHeight: 190, overflow: "hidden", padding: 19, position: "relative", width: "23.5%" }, atlasTilePressed: { opacity: 0.75, transform: [{ scale: 0.98 }] }, atlasOrb: { borderRadius: 999, height: 120, opacity: 0.16, position: "absolute", right: -18, top: -25, width: 120 }, atlasNumber: { fontFamily: "IBM Plex Mono", fontSize: 10, marginBottom: 26 }, atlasLabel: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 25, fontWeight: "900", marginTop: 12 }, atlasHint: { bottom: 17, fontFamily: "IBM Plex Mono", fontSize: 9, position: "absolute" }, recentSection: { gap: 17 }, recentRow: { gap: 13 }, recentTile: { width: 150 }, recentImage: { alignItems: "center", borderRadius: 14, height: 112, justifyContent: "center", overflow: "hidden", width: 150 }, recentImageFill: { backgroundPosition: "center" as any, backgroundSize: "cover" as any, height: "100%" as any, width: "100%" as any }, recentCategory: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 9, marginTop: 10 }, recentTitle: { color: webPalette.text, fontFamily: "DM Sans", fontSize: 14, fontWeight: "800", lineHeight: 18, marginTop: 4 },
  discoveryStage: { alignSelf: "center", maxWidth: 1040, padding: 34, width: "100%" }, discoveryHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" }, discoveryHeading: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 34, fontWeight: "900", marginTop: 6 }, portalTag: { borderRadius: 999, borderWidth: 1, fontFamily: "IBM Plex Mono", fontSize: 9, paddingHorizontal: 10, paddingVertical: 8 }, cardStage: { alignItems: "center", justifyContent: "center", minHeight: 610, position: "relative" }, peekCard: { borderRadius: 26, borderWidth: 1, height: 430, opacity: 0.55, padding: 20, position: "absolute", right: "12%" as any, top: 75, transform: [{ rotate: "5deg" }], width: 360 }, peekLabel: { color: webPalette.muted, fontFamily: "IBM Plex Mono", fontSize: 9 }, peekTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 23, fontWeight: "900", marginTop: 20 }, webCard: { backgroundColor: webPalette.surface, borderRadius: 28, maxWidth: 470, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 26, transform: [{ rotate: "-2deg" }], width: "100%" }, cardArt: { alignItems: "center", height: 310, justifyContent: "center", overflow: "hidden", position: "relative" }, cardArtImage: { backgroundPosition: "center" as any, backgroundSize: "cover" as any, height: "100%" as any, position: "absolute", width: "100%" as any }, cardBadge: { borderRadius: 999, left: 17, paddingHorizontal: 10, paddingVertical: 6, position: "absolute", top: 17 }, cardBadgeText: { fontFamily: "IBM Plex Mono", fontSize: 9, fontWeight: "800" }, cardCopy: { padding: 22 }, cardCategory: { color: "#6D5B88", fontFamily: "IBM Plex Mono", fontSize: 9, letterSpacing: 1 }, cardTitle: { color: "#171225", fontFamily: "Bricolage Grotesque", fontSize: 32, fontWeight: "900", lineHeight: 35, marginTop: 10 }, cardSubtitle: { color: "#4A4057", fontFamily: "DM Sans", fontSize: 15, marginTop: 7 }, cardMeta: { color: "#857896", fontFamily: "IBM Plex Mono", fontSize: 10, marginTop: 14 }, actionRow: { alignItems: "stretch", flexDirection: "row", gap: 10, justifyContent: "center" }, primaryAction: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 48, paddingHorizontal: 18 }, primaryActionText: { fontFamily: "DM Sans", fontSize: 14, fontWeight: "900" }, secondaryAction: { alignItems: "center", borderColor: webPalette.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 18 }, secondaryActionText: { color: webPalette.text, fontFamily: "DM Sans", fontSize: 13, fontWeight: "800" }, keyboardHint: { color: webPalette.muted, fontFamily: "IBM Plex Mono", fontSize: 9, marginTop: 18, textAlign: "center" }, emptyStage: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center", minHeight: 520, padding: 34 }, stageKicker: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 1.5 }, stageTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 32, fontWeight: "900", textAlign: "center" }, loadingBar: { backgroundColor: webPalette.border, borderRadius: 999, height: 6, marginTop: 10, overflow: "hidden", width: 240 }, loadingFill: { height: "100%" as any, width: "55%" as any },
  atlasTileGrow: { flexGrow: 1 }, heroTitleMobile: { fontSize: 40, lineHeight: 43 }, webCardReduced: { transform: [] },
  actionRowMobile: { flexDirection: "column" }, detailPanel: { backgroundColor: "#241B35", borderLeftColor: webPalette.border, borderLeftWidth: 1, minHeight: 300, padding: 28, width: 360 }, detailPanelDrawer: { borderLeftWidth: 0, borderTopColor: webPalette.border, borderTopWidth: 1, maxHeight: "80%" as any, width: "100%" as any }, detailPanelMobile: { borderLeftWidth: 0, width: "100%" as any }, detailTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, closeButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 }, closeText: { color: webPalette.muted, fontSize: 28, lineHeight: 30 }, drawerToggle: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, marginTop: 8 }, drawerToggleText: { color: webPalette.lime, fontFamily: "DM Sans", fontSize: 13, fontWeight: "900" }, detailTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 35, fontWeight: "900", lineHeight: 38, marginTop: 22 }, detailSubtitle: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 15, marginTop: 9 }, detailMeta: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 10, marginTop: 15 }, detailLoading: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 14, marginTop: 34 }, detailDescription: { color: webPalette.text, fontFamily: "DM Sans", fontSize: 15, lineHeight: 23, marginTop: 28 }, detailActions: { gap: 10, marginTop: 30 },
});
