import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { getCategoryTheme, CATEGORY_ORDER } from "../../lib/discovery/categoryThemes";
import { SIMILAR_TIER_LABELS, type SimilarTier } from "../../lib/discovery/similarTiers";
import { thumbnailUrl } from "../../lib/api/imageSizes";
import type { ContentDetail } from "../../lib/discovery/loadDetail";
import type { ContentCategory, ResultItem } from "../../types/content";
import { bodyFont, displayFont, monoFont } from "../../lib/typography";
import { darkPalette } from "../../lib/theme";

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

/**
 * Projected from the shared dark palette rather than declared again, so the app
 * and the site cannot drift apart by editing one file and forgetting the other.
 *
 * The one field that does not map by name: `WebPalette.surface` is the *cream
 * card face*, while `Palette.surface` is the dark panel behind it. Cream is
 * `Palette.cream`.
 */
export const webPalette: WebPalette = {
  bg: darkPalette.bg,
  surface: darkPalette.cream,
  text: darkPalette.text,
  muted: darkPalette.textMuted,
  violet: darkPalette.violet,
  tangerine: darkPalette.tangerine,
  mint: darkPalette.mint,
  lime: darkPalette.lime,
  border: darkPalette.border,
};

export const MOBILE_MAX_WIDTH = 700;
/**
 * A phone held sideways is 852x393 — wide enough to pass a width-only test and
 * far too short for the two-column workspace and its fixed 360px detail rail.
 * Height has to be part of the decision or every phone in landscape is served
 * a tablet layout.
 */
export const MOBILE_MAX_HEIGHT = 500;

export function resolveWebLayout(width: number, height: number): WebLayoutMode {
  if (width < MOBILE_MAX_WIDTH || height < MOBILE_MAX_HEIGHT) return "mobile";
  if (height > width) return "tabletPortrait";
  return width < 1200 ? "tabletLandscape" : "desktop";
}

/**
 * Every component that used to test `width < 700` on its own now asks this, so
 * the shell, the deck and the detail panel cannot disagree about whether they
 * are on a phone.
 */
export function useIsMobileLayout(): boolean {
  const { width, height } = useWindowDimensions();
  return resolveWebLayout(width, height) === "mobile";
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
  const isMobile = useIsMobileLayout();
  const nav = [
    ["archive", "Archive", "th-large"],
    ["discover", "Discover", "compass"],
    ["atlas", `Saved Atlas${savedCount ? ` ${savedCount}` : ""}`, "sitemap"],
    ["account", "Account", "user-circle-o"],
  ] as const;

  return (
    <View style={styles.shell}>
      {/* Four nav items only get ~176px beside a non-shrinking wordmark at 390px,
          so they wrapped onto four rows and pushed the deck below the fold.
          On mobile the nav takes its own full-width row instead. */}
      <View style={[styles.chrome, isMobile && styles.chromeMobile]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="GoDiscover home"
          onPress={() => onSectionChange("archive")}
          style={styles.wordmark}
        >
          <Text style={styles.wordmarkSmall}>GO / DISCOVER</Text>
          <Text style={styles.wordmarkLarge}>a culture arcade</Text>
        </Pressable>
        <View style={[styles.nav, isMobile && styles.navMobile]} accessibilityRole="tablist">
          {nav.map(([value, label, icon]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: section === value }}
              onPress={() => onSectionChange(value)}
              style={({ pressed }) => [
                styles.navItem,
                isMobile && styles.navItemMobile,
                section === value && styles.navItemActive,
                pressed && styles.pressed,
              ]}
            >
              <FontAwesome name={icon as any} size={14} color={section === value ? webPalette.bg : webPalette.muted} />
              <Text style={[styles.navLabel, section === value && styles.navLabelActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {!isMobile ? <Text style={styles.chromeHint}>A FIELD GUIDE FOR YOUR NEXT OBSESSION</Text> : null}
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
  const isMobile = useIsMobileLayout();
  const tileWidth = isMobile ? "47%" : width < 1100 ? "48%" : "23.5%";
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.archive}>
      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>THE ARCHIVE IS OPEN</Text>
          <Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>Find a new{ "\n" }favourite rabbit hole.</Text>
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
                    {item.imageUrl ? <View style={[styles.recentImageFill, { backgroundImage: `url(${thumbnailUrl(item.imageUrl)})` } as any]} /> : <FontAwesome name={theme.icon} size={22} color={theme.accent} />}
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

export type WebDeckNotice = {
  message: string;
  onUndo?(): void;
  actions?: readonly { label: string; onPress(): void }[];
};

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
  notice,
  similarContext,
  exhausted = false,
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
  /** Undo for a dismissed card, or the follow-up choice after a save. */
  notice?: WebDeckNotice | null;
  /** Names how far the current Similar results have widened from the seed. */
  similarContext?: { sourceTitle: string; tier?: SimilarTier } | null;
  /** True only once a top-up has actually come back empty. */
  exhausted?: boolean;
}) {
  const { height } = useWindowDimensions();
  const isMobile = useIsMobileLayout();
  const theme = getCategoryTheme(category);
  // This used to subtract a hand-measured `chromeReserve` from the viewport to
  // keep the action row above a fold that could not be scrolled past. The stage
  // scrolls now, so the artwork just takes a sensible share of the viewport and
  // anything below it is reachable rather than lost.
  const cardStageHeight = Math.max(300, Math.min(610, height - 300));
  // Body scrolling is disabled app-wide, so without this the action row, the
  // undo bar and the keyboard hint are simply unreachable on a short viewport.
  const stage = (contentStyle: StyleProp<ViewStyle>, children: React.ReactNode) => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentStyle}
    >
      {children}
    </ScrollView>
  );
  if (!activeItem && loading) {
    return stage(styles.emptyStage, <><Text style={styles.stageKicker}>OPENING PORTAL</Text><Text style={styles.stageTitle}>Finding a new {theme.singular}...</Text><View style={styles.loadingBar}><View style={[styles.loadingFill, { backgroundColor: theme.accent }]} /></View></>);
  }
  if (!activeItem) {
    // "The cabinet is quiet" used to show after five swipes, when the deck had
    // simply not been topped up yet — it read as a dead end. It is now reserved
    // for genuine exhaustion, and says what to do next.
    return exhausted
      ? stage(
          styles.emptyStage,
          <>
            <Text style={styles.stageKicker}>THAT&apos;S THE WHOLE SHELF</Text>
            <Text style={styles.stageTitle}>
              You&apos;ve seen every {theme.singular} we can find down this path.
            </Text>
            <Text style={styles.keyboardHint}>
              TRY ANOTHER CATEGORY, OR LOOSEN YOUR FILTERS
            </Text>
          </>
        )
      : stage(
          styles.emptyStage,
          <>
            <Text style={styles.stageKicker}>FETCHING MORE</Text>
            <Text style={styles.stageTitle}>
              Lining up the next {theme.singular}...
            </Text>
            <View style={styles.loadingBar}>
              <View style={[styles.loadingFill, { backgroundColor: theme.accent }]} />
            </View>
          </>
        );
  }
  return stage(
    [styles.discoveryStage, isMobile && styles.discoveryStageMobile],
    <>
      <View style={styles.discoveryHeader}>
        <View style={styles.discoveryHeaderCopy}>
          <Text style={styles.sectionKicker}>DISCOVERY / {theme.label.toUpperCase()}</Text>
          <Text style={[styles.discoveryHeading, isMobile && styles.discoveryHeadingMobile]}>One good thing leads to another.</Text>
        </View>
        <Text style={[styles.portalTag, { color: theme.accent, borderColor: theme.accent }]}>{theme.badge}</Text>
      </View>
      {similarContext ? (
        <Text style={styles.similarTierBanner}>
          {/* Naming the rung keeps the label honest once the ladder widens. */}
          {(similarContext.tier
            ? SIMILAR_TIER_LABELS[similarContext.tier]
            : "Similar"
          ).toUpperCase()}{" "}
          TO {similarContext.sourceTitle.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.cardStage, { minHeight: cardStageHeight }]}>
        {nextItem && !isMobile ? <View style={[styles.peekCard, { borderColor: theme.accent, backgroundColor: theme.softDark }]} accessible={false}><Text style={styles.peekLabel}>NEXT IN THE STACK</Text><Text style={styles.peekTitle}>{nextItem.title}</Text></View> : null}
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
      <View style={[styles.actionRow, isMobile && styles.actionRowMobile]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not for me" onPress={onSkip} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>← Not for me</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={onSave} style={[styles.primaryAction, { backgroundColor: theme.accent }]}><Text style={[styles.primaryActionText, { color: theme.onAccent }]}>Save to map</Text><FontAwesome name="plus" size={14} color={theme.onAccent} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Find similar" onPress={onSimilar} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Find similar →</Text></Pressable>
      </View>
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.deckNotice, !isMobile && styles.deckNoticePinned]}
        >
          <Text style={styles.deckNoticeText}>{notice.message}</Text>
          {notice.actions?.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={styles.deckNoticeAction}
            >
              <Text style={styles.deckNoticeActionText}>{action.label}</Text>
            </Pressable>
          ))}
          {notice.onUndo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo"
              onPress={notice.onUndo}
              style={styles.deckNoticeAction}
            >
              <Text style={styles.deckNoticeActionText}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.keyboardHint}>ARROWS TO DECIDE · S TO SAVE · U TO UNDO · ENTER FOR DETAILS</Text>
    </>
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
  onFindSimilarInAtlas,
  atlasRecommendations = [],
  atlasRecommendationsLoading = false,
  atlasRecommendationsError = false,
  onPreviewAtlasRecommendation,
  onSaveAtlasRecommendation,
  onSkipAtlasRecommendation,
  onReseedAtlasRecommendation,
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
  onFindSimilarInAtlas?(): void;
  atlasRecommendations?: readonly { id: string; title: string; reason: string }[];
  atlasRecommendationsLoading?: boolean;
  atlasRecommendationsError?: boolean;
  onPreviewAtlasRecommendation?(id: string): void;
  onSaveAtlasRecommendation?(id: string): void;
  onSkipAtlasRecommendation?(id: string): void;
  onReseedAtlasRecommendation?(id: string): void;
}) {
  const isMobile = useIsMobileLayout();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<{ focus?(): void } | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (presentation !== "sheet" || typeof document === "undefined") return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus?.();
    return () => returnFocusRef.current?.focus?.();
  }, [presentation]);
  if (!item || !category) return null;
  const theme = getCategoryTheme(category);
  const description = detail ? detailDescription(detail) : "Open the full detail card to see why this one belongs in your orbit.";
  // A long field note plus eight orbit recommendations easily outruns a phone
  // sheet or the tablet drawer's 80% cap, and neither had anything to scroll.
  const panel = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[styles.detailPanel, presentation === "drawer" && styles.detailPanelDrawer, (presentation === "sheet" || isMobile) && styles.detailPanelMobile]}
      contentContainerStyle={styles.detailPanelContent}
      accessibilityLabel={presentation === "sheet" ? undefined : `${item.title} details`}>
      <View style={styles.detailTop}><Text style={[styles.sectionKicker, { color: theme.accent }]}>{theme.label.toUpperCase()} / FIELD NOTE</Text><Pressable ref={closeRef as any} accessibilityRole="button" accessibilityLabel="Close details" onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
      <Text style={styles.detailTitle}>{item.title}</Text>
      <Text style={styles.detailSubtitle}>{item.subtitle}</Text>
      <Text style={styles.detailMeta}>{item.meta}</Text>
      {presentation === "drawer" && onToggleExpanded ? <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Collapse detail drawer" : "Expand detail drawer"} onPress={onToggleExpanded} style={styles.drawerToggle}><Text style={styles.drawerToggleText}>{expanded ? "Show preview" : "Expand details"}</Text></Pressable> : null}
      {expanded || presentation !== "drawer" ? <>
        {loading ? <Text style={styles.detailLoading}>Gathering the long version...</Text> : <Text style={styles.detailDescription}>{description}</Text>}
        <View style={styles.detailActions}>
          <Pressable accessibilityRole="button" onPress={onSave} style={[styles.primaryAction, { backgroundColor: theme.accent }]}><Text style={[styles.primaryActionText, { color: theme.onAccent }]}>{saved ? "Remove from map" : "Save to map"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={similarLabel} onPress={onSimilar} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{similarLabel}</Text></Pressable>
          {onFindSimilarInAtlas ? <Pressable accessibilityRole="button" accessibilityLabel="Find similar in atlas" onPress={onFindSimilarInAtlas} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{atlasRecommendationsError ? "Retry atlas recommendations" : atlasRecommendationsLoading ? "Looking in atlas…" : "Find similar in atlas"}</Text></Pressable> : null}
          {onShare ? <Pressable accessibilityRole="button" onPress={onShare} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Share</Text></Pressable> : null}
        </View>
        {atlasRecommendationsError ? <Text style={styles.atlasOrbitError}>Discovery is offline. Your saved atlas and trails are still available.</Text> : null}
        {atlasRecommendations.map((recommendation) => (
          <View key={recommendation.id} style={styles.atlasOrbitResult}>
            <View style={styles.atlasOrbitCopy}>
              <Text style={styles.atlasOrbitTitle}>{recommendation.title}</Text>
              <Text style={styles.atlasOrbitReason}>{recommendation.reason}</Text>
            </View>
            <View style={styles.atlasOrbitActions}>
              {onPreviewAtlasRecommendation ? <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${recommendation.title} in atlas`} onPress={() => onPreviewAtlasRecommendation(recommendation.id)} style={styles.atlasOrbitAction}><Text style={styles.atlasOrbitActionText}>Preview</Text></Pressable> : null}
              {onSaveAtlasRecommendation ? <Pressable accessibilityRole="button" accessibilityLabel={`Save ${recommendation.title} to map`} onPress={() => onSaveAtlasRecommendation(recommendation.id)} style={[styles.atlasOrbitAction, styles.atlasOrbitSave]}><Text style={styles.atlasOrbitSaveText}>Save</Text></Pressable> : null}
              {onSkipAtlasRecommendation ? <Pressable accessibilityRole="button" accessibilityLabel={`Skip ${recommendation.title}`} onPress={() => onSkipAtlasRecommendation(recommendation.id)} style={styles.atlasOrbitAction}><Text style={styles.atlasOrbitActionText}>Skip</Text></Pressable> : null}
              {onReseedAtlasRecommendation ? <Pressable accessibilityRole="button" accessibilityLabel={`Reseed from ${recommendation.title}`} onPress={() => onReseedAtlasRecommendation(recommendation.id)} style={styles.atlasOrbitAction}><Text style={styles.atlasOrbitActionText}>Reseed</Text></Pressable> : null}
            </View>
          </View>
        ))}
      </> : null}
    </ScrollView>
  );
  if (presentation !== "sheet") return panel;
  const handleSheetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      aria-label={`${item.title} details`}
      aria-modal="true"
      onKeyDown={handleSheetKeyDown}
      ref={sheetRef}
      role="dialog"
      style={{ width: "100%" }}
    >
      {panel}
    </div>
  );
}

function detailDescription(detail: ContentDetail): string {
  const data = detail.data as any;
  return data.overview || data.description || (data.genres?.length ? data.genres.join(" · ") : "No additional field note available.");
}

const styles = StyleSheet.create({
  shell: { backgroundColor: webPalette.bg, flex: 1, minHeight: "100vh" as any },
  chrome: { alignItems: "center", borderBottomColor: webPalette.border, borderBottomWidth: 1, flexDirection: "row", gap: 28, justifyContent: "space-between", paddingHorizontal: 28, paddingVertical: 18 }, chromeMobile: { alignItems: "stretch", flexDirection: "column", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }, navMobile: { justifyContent: "space-between", width: "100%" }, navItemMobile: { paddingHorizontal: 9 },
  wordmark: { flexShrink: 0, justifyContent: "center", minHeight: 44 }, wordmarkSmall: { color: webPalette.mint, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.4 }, wordmarkLarge: { color: webPalette.text, fontFamily: displayFont, fontSize: 18, fontWeight: "800", marginTop: 3 },
  nav: { alignItems: "center", flexDirection: "row", flexShrink: 1, flexWrap: "wrap", gap: 6, justifyContent: "center" }, navItem: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 7, minHeight: 44, paddingHorizontal: 13 }, navItemActive: { backgroundColor: webPalette.lime }, navLabel: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 13, fontWeight: "700" }, navLabelActive: { color: webPalette.bg }, chromeHint: { color: webPalette.muted, fontFamily: monoFont, fontSize: 9, maxWidth: 180, textAlign: "right" }, pressed: { opacity: 0.72 }, content: { flex: 1 },
  archive: { alignSelf: "center", gap: 34, maxWidth: 1180, padding: 34, width: "100%" }, heroRow: { flexDirection: "row", flexWrap: "wrap", gap: 20, justifyContent: "space-between", minHeight: 260 }, heroCopy: { flexGrow: 1, flexShrink: 1, maxWidth: 700, minWidth: 260 }, eyebrow: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 11, letterSpacing: 2 }, heroTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 58, fontWeight: "900", letterSpacing: -2, lineHeight: 61, marginTop: 12 }, heroBody: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 17, lineHeight: 26, maxWidth: 560, marginTop: 18 }, heroButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: webPalette.lime, borderRadius: 999, flexDirection: "row", gap: 12, justifyContent: "center", marginTop: 22, minHeight: 44, paddingHorizontal: 19 }, heroButtonText: { color: webPalette.bg, fontFamily: bodyFont, fontSize: 14, fontWeight: "800" }, heroStamp: { alignItems: "center", borderColor: webPalette.tangerine, borderRadius: 100, borderWidth: 1, height: 132, justifyContent: "center", marginTop: 10, transform: [{ rotate: "8deg" }], width: 132 }, heroStampText: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 9, letterSpacing: 1 }, heroStampYear: { color: webPalette.text, fontFamily: displayFont, fontSize: 26, fontWeight: "900", marginVertical: 4 },
  sectionHeading: { gap: 5 }, sectionHeadingInline: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between" }, sectionKicker: { color: webPalette.mint, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.6 }, sectionTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 30, fontWeight: "900", marginTop: 4 }, sectionAside: { color: webPalette.muted, fontFamily: monoFont, fontSize: 9 }, atlasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 13 }, atlasTile: { borderRadius: 22, borderWidth: 1, minHeight: 190, overflow: "hidden", padding: 19, position: "relative", width: "23.5%" }, atlasTilePressed: { opacity: 0.75, transform: [{ scale: 0.98 }] }, atlasOrb: { borderRadius: 999, height: 120, opacity: 0.16, position: "absolute", right: -18, top: -25, width: 120 }, atlasNumber: { fontFamily: monoFont, fontSize: 10, marginBottom: 26 }, atlasLabel: { color: webPalette.text, fontFamily: displayFont, fontSize: 25, fontWeight: "900", marginTop: 12 }, atlasHint: { bottom: 17, fontFamily: monoFont, fontSize: 9, position: "absolute" }, recentSection: { gap: 17 }, recentRow: { gap: 13 }, recentTile: { width: 150 }, recentImage: { alignItems: "center", borderRadius: 14, height: 112, justifyContent: "center", overflow: "hidden", width: 150 }, recentImageFill: { backgroundPosition: "center" as any, backgroundSize: "cover" as any, height: "100%" as any, width: "100%" as any }, recentCategory: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 9, marginTop: 10 }, recentTitle: { color: webPalette.text, fontFamily: bodyFont, fontSize: 14, fontWeight: "800", lineHeight: 18, marginTop: 4 },
  discoveryStage: { alignSelf: "center", maxWidth: 1040, padding: 34, paddingBottom: 104, width: "100%" }, discoveryStageMobile: { paddingBottom: 24, paddingHorizontal: 16 }, discoveryHeader: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, discoveryHeaderCopy: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 200 }, discoveryHeading: { color: webPalette.text, fontFamily: displayFont, fontSize: 34, fontWeight: "900", marginTop: 6 }, discoveryHeadingMobile: { fontSize: 24, lineHeight: 28 }, portalTag: { borderRadius: 999, borderWidth: 1, fontFamily: monoFont, fontSize: 9, paddingHorizontal: 10, paddingVertical: 8 }, cardStage: { alignItems: "center", justifyContent: "center", minHeight: 610, position: "relative", width: "100%" }, peekCard: { borderRadius: 26, borderWidth: 1, height: 430, opacity: 0.55, padding: 20, position: "absolute", right: "12%" as any, top: 75, transform: [{ rotate: "5deg" }], width: 360 }, peekLabel: { color: webPalette.muted, fontFamily: monoFont, fontSize: 9 }, peekTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 23, fontWeight: "900", marginTop: 20 }, webCard: { backgroundColor: webPalette.surface, borderRadius: 28, maxWidth: 470, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 26, transform: [{ rotate: "-2deg" }], width: "100%" }, cardArt: { alignItems: "center", height: 310, justifyContent: "center", overflow: "hidden", position: "relative" }, cardArtImage: { backgroundPosition: "center" as any, backgroundSize: "cover" as any, height: "100%" as any, position: "absolute", width: "100%" as any }, cardBadge: { borderRadius: 999, left: 17, paddingHorizontal: 10, paddingVertical: 6, position: "absolute", top: 17 }, cardBadgeText: { fontFamily: monoFont, fontSize: 9, fontWeight: "800" }, cardCopy: { padding: 22 }, cardCategory: { color: "#6D5B88", fontFamily: monoFont, fontSize: 9, letterSpacing: 1 }, cardTitle: { color: "#171225", fontFamily: displayFont, fontSize: 32, fontWeight: "900", lineHeight: 35, marginTop: 10 }, cardSubtitle: { color: "#4A4057", fontFamily: bodyFont, fontSize: 15, marginTop: 7 }, cardMeta: { color: "#857896", fontFamily: monoFont, fontSize: 10, marginTop: 14 }, actionRow: { alignItems: "stretch", flexDirection: "row", gap: 10, justifyContent: "center" }, primaryAction: { alignItems: "center", borderRadius: 999, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 48, paddingHorizontal: 18 }, primaryActionText: { fontFamily: bodyFont, fontSize: 14, fontWeight: "900" }, secondaryAction: { alignItems: "center", borderColor: webPalette.border, borderRadius: 999, borderWidth: 1, justifyContent: "center", minHeight: 48, paddingHorizontal: 18 }, secondaryActionText: { color: webPalette.text, fontFamily: bodyFont, fontSize: 13, fontWeight: "800" }, similarTierBanner: { color: webPalette.mint, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.4, marginTop: 14 }, deckNotice: { alignItems: "center", alignSelf: "center", backgroundColor: webPalette.surface, borderRadius: 999, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16, maxWidth: 560, paddingHorizontal: 18, paddingVertical: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }, deckNoticePinned: { bottom: 24, left: 0, marginTop: 0, position: "fixed" as any, right: 0, zIndex: 20 }, deckNoticeText: { color: "#171225", fontFamily: bodyFont, fontSize: 13, fontWeight: "800" }, deckNoticeAction: { alignItems: "center", justifyContent: "center", minHeight: 44, paddingHorizontal: 10 }, deckNoticeActionText: { color: "#3C2E63", fontFamily: bodyFont, fontSize: 13, fontWeight: "900", textDecorationLine: "underline" }, keyboardHint: { color: webPalette.muted, fontFamily: monoFont, fontSize: 9, marginTop: 18, textAlign: "center" }, emptyStage: { alignItems: "center", flexGrow: 1, gap: 14, justifyContent: "center", minHeight: 300, padding: 34 }, stageKicker: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.5 }, stageTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 32, fontWeight: "900", textAlign: "center" }, loadingBar: { backgroundColor: webPalette.border, borderRadius: 999, height: 6, marginTop: 10, overflow: "hidden", width: 240 }, loadingFill: { height: "100%" as any, width: "55%" as any },
  atlasTileGrow: { flexGrow: 1 }, heroTitleMobile: { fontSize: 40, lineHeight: 43 }, webCardReduced: { transform: [] },
  actionRowMobile: { flexDirection: "column" }, detailPanel: { backgroundColor: "#241B35", borderLeftColor: webPalette.border, borderLeftWidth: 1, flexGrow: 0, flexShrink: 0, width: 360 }, detailPanelContent: { minHeight: 300, padding: 28 }, detailPanelDrawer: { borderLeftWidth: 0, borderTopColor: webPalette.border, borderTopWidth: 1, maxHeight: "80%" as any, width: "100%" as any }, detailPanelMobile: { borderLeftWidth: 0, width: "100%" as any }, detailTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, closeButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 }, closeText: { color: webPalette.muted, fontSize: 28, lineHeight: 30 }, drawerToggle: { alignSelf: "flex-start", justifyContent: "center", minHeight: 44, marginTop: 8 }, drawerToggleText: { color: webPalette.lime, fontFamily: bodyFont, fontSize: 13, fontWeight: "900" }, detailTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 35, fontWeight: "900", lineHeight: 38, marginTop: 22 }, detailSubtitle: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 15, marginTop: 9 }, detailMeta: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 10, marginTop: 15 }, detailLoading: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 14, marginTop: 34 }, detailDescription: { color: webPalette.text, fontFamily: bodyFont, fontSize: 15, lineHeight: 23, marginTop: 28 }, detailActions: { gap: 10, marginTop: 30 }, atlasOrbitError: { color: "#F4C7A1", fontFamily: bodyFont, fontSize: 12, marginTop: 14 }, atlasOrbitResult: { borderTopColor: webPalette.border, borderTopWidth: 1, marginTop: 12, paddingTop: 12 }, atlasOrbitCopy: { minWidth: 180 }, atlasOrbitTitle: { color: webPalette.text, fontFamily: bodyFont, fontSize: 13, fontWeight: "900" }, atlasOrbitReason: { color: webPalette.muted, fontFamily: monoFont, fontSize: 9, marginTop: 4 }, atlasOrbitActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }, atlasOrbitAction: { alignItems: "center", borderColor: webPalette.border, borderRadius: 5, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 10 }, atlasOrbitSave: { backgroundColor: webPalette.violet, borderColor: webPalette.violet }, atlasOrbitActionText: { color: webPalette.text, fontFamily: bodyFont, fontSize: 11, fontWeight: "800" }, atlasOrbitSaveText: { color: webPalette.text, fontFamily: bodyFont, fontSize: 11, fontWeight: "900" },
});
