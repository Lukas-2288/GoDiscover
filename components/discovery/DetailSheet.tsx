import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { getCategoryTheme } from "../../lib/discovery/categoryThemes";
import type { ContentDetail } from "../../lib/discovery/loadDetail";
import { getMotionSpec } from "../../lib/discovery/motion";
import type { Palette } from "../../lib/theme";
import type { ContentCategory, ResultItem } from "../../types/content";

export type DetailSelection = {
  category: ContentCategory;
  item: ResultItem;
  origin: "deck" | "stored";
};

export type DetailSheetProps = {
  visible: boolean;
  selection: DetailSelection | null;
  detail: ContentDetail | null;
  loading: boolean;
  errorMessage: string | null;
  savedMutationErrorMessage?: string | null;
  saved: boolean;
  palette: Palette;
  reducedMotion: boolean;
  onClose(): void;
  onRetry(): void;
  onSave(item: ResultItem): void;
  onSkip(item: ResultItem): void;
  onSimilar(item: ResultItem): void;
  onShare(item: ResultItem): void;
};

function openExternalUrl(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

function DetailPill({ children, palette }: { children: React.ReactNode; palette: Palette }) {
  return (
    <View style={[styles.pill, { backgroundColor: palette.surfaceAltStrong }]}>
      <Text style={[styles.pillText, { color: palette.textSecondary }]}>{children}</Text>
    </View>
  );
}

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: Palette }) {
  return <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>{children}</Text>;
}

function ExternalLink({
  label,
  url,
  palette,
  accent,
}: {
  label: string;
  url: string;
  palette: Palette;
  accent: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${label}`}
      accessibilityHint="Opens an external website"
      accessibilityRole="link"
      onPress={() => openExternalUrl(url)}
      style={({ pressed }) => [
        styles.linkButton,
        {
          backgroundColor: palette.surfaceAlt,
          borderColor: accent,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <FontAwesome
        accessible={false}
        name="external-link"
        size={14}
        color={accent}
      />
      <Text style={[styles.linkLabel, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

function DetailBody({
  accent,
  detail,
  fallbackAuthor,
  palette,
}: {
  accent: string;
  detail: ContentDetail;
  fallbackAuthor: string;
  palette: Palette;
}) {
  switch (detail.category) {
    case "movies": {
      const movie = detail.data;
      return (
        <View style={styles.details}>
          <View style={styles.pillRow}>
            <DetailPill palette={palette}>{movie.releaseYear}</DetailPill>
            {movie.runtime ? <DetailPill palette={palette}>{movie.runtime} min</DetailPill> : null}
            <DetailPill palette={palette}>★ {movie.rating.toFixed(1)}</DetailPill>
          </View>
          <Text style={[styles.categoryMeta, { color: accent }]}>
            {movie.genres.join(" / ") || "Genre unavailable"}
          </Text>
          <SectionLabel palette={palette}>Language</SectionLabel>
          <Text style={[styles.value, { color: palette.text }]}>
            {movie.language ? movie.language.toUpperCase() : "Unavailable"}
          </Text>
          <SectionLabel palette={palette}>Synopsis</SectionLabel>
          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {movie.overview || "No synopsis available."}
          </Text>
        </View>
      );
    }
    case "books": {
      const book = detail.data;
      return (
        <View style={styles.details}>
          <View style={styles.pillRow}>
            {book.firstPublishYear ? (
              <DetailPill palette={palette}>{book.firstPublishYear}</DetailPill>
            ) : null}
            {book.rating ? <DetailPill palette={palette}>★ {book.rating.toFixed(1)}</DetailPill> : null}
          </View>
          {book.subjects.length ? (
            <Text style={[styles.categoryMeta, { color: accent }]}>
              {book.subjects.slice(0, 3).join(" / ")}
            </Text>
          ) : null}
          <SectionLabel palette={palette}>Author</SectionLabel>
          <Text style={[styles.value, { color: palette.text }]}>
            {book.authors.join(", ") || fallbackAuthor || "Author unavailable"}
          </Text>
          <SectionLabel palette={palette}>Description</SectionLabel>
          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {book.description || "No description available."}
          </Text>
        </View>
      );
    }
    case "artists": {
      const artist = detail.data;
      return (
        <View style={styles.details}>
          <SectionLabel palette={palette}>Discography</SectionLabel>
          {artist.albums.length ? (
            artist.albums.map((album, index) => (
              <View key={album.id} style={styles.trackRow}>
                <Text style={[styles.trackNumber, { color: palette.textMuted }]}>{index + 1}</Text>
                <Text style={[styles.trackName, { color: palette.textSecondary }]}>{album.name}</Text>
                {album.releaseDate ? (
                  <Text style={[styles.trackYear, { color: palette.textMuted }]}>
                    {album.releaseDate.slice(0, 4)}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={[styles.value, { color: palette.text }]}>No albums found.</Text>
          )}
        </View>
      );
    }
    case "albums": {
      const album = detail.data;
      const albumType = album.albumType
        ? album.albumType.charAt(0).toUpperCase() + album.albumType.slice(1)
        : "Album";
      return (
        <View style={styles.details}>
          <View style={styles.pillRow}>
            <DetailPill palette={palette}>
              {album.releaseDate ? album.releaseDate.slice(0, 4) : "Year unavailable"}
            </DetailPill>
            <DetailPill palette={palette}>{album.totalTracks} tracks</DetailPill>
            <DetailPill palette={palette}>{albumType}</DetailPill>
          </View>
          <Text
            style={[styles.categoryMeta, { color: accent }]}
          >
            {album.artists.join(", ") || "Artist unavailable"}
          </Text>
          {album.genres.length ? (
            <Text style={[styles.value, { color: palette.textSecondary }]}>
              {album.genres.join(" / ")}
            </Text>
          ) : null}
          <SectionLabel palette={palette}>Tracks</SectionLabel>
          {album.tracks.slice(0, 8).map((track, index) => (
            <View key={track.id} style={styles.trackRow}>
              <Text style={[styles.trackNumber, { color: palette.textMuted }]}>{index + 1}</Text>
              <Text style={[styles.trackName, { color: palette.textSecondary }]}>{track.name}</Text>
            </View>
          ))}
        </View>
      );
    }
  }
}

function ExternalLinks({
  category,
  item,
  detail,
  palette,
}: {
  category: ContentCategory;
  item: ResultItem;
  detail: ContentDetail | null;
  palette: Palette;
}) {
  const theme = getCategoryTheme(category);
  const searchTerm = category === "albums" ? `${item.title} ${item.subtitle}` : item.title;

  if (category === "movies") {
    return (
      <View style={styles.externalLinks}>
        <SectionLabel palette={palette}>Watch</SectionLabel>
        <View style={styles.linkRow}>
          <ExternalLink
            label="JustWatch"
            url={`https://www.justwatch.com/us/search?q=${encodeURIComponent(item.title)}`}
            palette={palette}
            accent={theme.accent}
          />
          <ExternalLink
            label="TMDB"
            url={`https://www.themoviedb.org/movie/${encodeURIComponent(item.id)}`}
            palette={palette}
            accent={theme.secondary}
          />
        </View>
      </View>
    );
  }

  if (category === "books") {
    return (
      <View style={styles.externalLinks}>
        <SectionLabel palette={palette}>Read</SectionLabel>
        <View style={styles.linkRow}>
          <ExternalLink
            label="Open Library"
            url={`https://openlibrary.org/works/${encodeURIComponent(item.id)}`}
            palette={palette}
            accent={theme.accent}
          />
          <ExternalLink
            label="Goodreads"
            url={`https://www.goodreads.com/search?q=${encodeURIComponent(item.title)}`}
            palette={palette}
            accent={theme.secondary}
          />
        </View>
      </View>
    );
  }

  const providerUrl =
    detail?.category === "artists" || detail?.category === "albums"
      ? detail.data.spotifyUrl
      : null;
  return (
    <View style={styles.externalLinks}>
      <SectionLabel palette={palette}>Listen</SectionLabel>
      <View style={styles.linkRow}>
        <ExternalLink
          label="Spotify"
          url={`https://open.spotify.com/search/${encodeURIComponent(searchTerm)}`}
          palette={palette}
          accent={theme.accent}
        />
        <ExternalLink
          label="Apple Music"
          url={`https://music.apple.com/us/search?term=${encodeURIComponent(searchTerm)}`}
          palette={palette}
          accent={theme.secondary}
        />
        {providerUrl ? (
          <ExternalLink
            label="Discogs"
            url={providerUrl}
            palette={palette}
            accent={palette.textMuted}
          />
        ) : null}
      </View>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  primary,
  palette,
  accent,
  onAccent,
  onPress,
}: {
  label: string;
  icon: "bookmark" | "bookmark-o" | "clone" | "share-alt" | "times";
  primary?: boolean;
  palette: Palette;
  accent: string;
  onAccent: string;
  onPress(): void;
}) {
  const color = primary ? onAccent : palette.textSecondary;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? accent : palette.surfaceAlt,
          borderColor: primary ? accent : palette.borderStrong,
          opacity: pressed ? 0.76 : 1,
        },
      ]}
    >
      <FontAwesome accessible={false} name={icon} size={15} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function DetailSheet({
  visible,
  selection,
  detail,
  loading,
  errorMessage,
  savedMutationErrorMessage = null,
  saved,
  palette,
  reducedMotion,
  onClose,
  onRetry,
  onSave,
  onSkip,
  onSimilar,
  onShare,
}: DetailSheetProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [imageFailed, setImageFailed] = useState(false);
  const motion = useMemo(() => getMotionSpec(reducedMotion), [reducedMotion]);
  const matchingDetail =
    selection && detail?.category === selection.category ? detail : null;
  const imageUrl = (() => {
    if (!selection) return undefined;
    if (!matchingDetail) return selection.item.imageUrl;
    switch (matchingDetail.category) {
      case "movies":
        return matchingDetail.data.backdropUrl ??
          matchingDetail.data.posterUrl ??
          selection.item.imageUrl;
      case "books":
        return matchingDetail.data.coverUrl ?? selection.item.imageUrl;
      case "artists":
      case "albums":
        return matchingDetail.data.imageUrl ?? selection.item.imageUrl;
    }
  })();

  useEffect(() => {
    if (!visible || !selection) return;

    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    opacity.setValue(0);
    translateY.setValue(28);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        duration: motion.commitDurationMs,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: motion.commitDurationMs,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [motion.commitDurationMs, opacity, reducedMotion, selection, translateY, visible]);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!selection) return null;

  const { category, item, origin } = selection;
  const theme = getCategoryTheme(category);
  const showImage = Boolean(imageUrl) && !imageFailed;
  const saveLabel = saved ? "Remove from saved" : "Save";

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        style={[
          styles.overlay,
          {
            alignItems: wide ? "center" : "stretch",
            backgroundColor: palette.overlay,
            justifyContent: wide ? "center" : "flex-end",
          },
        ]}
      >
        <Animated.View
          accessibilityLabel={`${item.title} details`}
          accessibilityViewIsModal
          aria-modal
          onAccessibilityEscape={onClose}
          role="dialog"
          style={[
            styles.surface,
            wide ? styles.wideSurface : styles.phoneSurface,
            {
              backgroundColor: palette.surface,
              borderColor: theme.accent,
              opacity,
            },
            reducedMotion ? null : { transform: [{ translateY }] },
          ]}
          testID="detail-sheet-surface"
        >
          <View
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.accentStrip, { backgroundColor: theme.accent }]}
          />
          {!wide ? (
            <View
              accessibilityElementsHidden
              aria-hidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.grabber, { backgroundColor: palette.borderStrong }]}
            />
          ) : null}
          <Pressable
            accessibilityLabel="Close details"
            accessibilityRole="button"
            hitSlop={6}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: palette.pillDark,
                borderColor: palette.borderStrong,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <FontAwesome
              accessible={false}
              name="close"
              size={18}
              color={palette.onAccent}
            />
          </Pressable>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <FontAwesome
                accessible={false}
                name={theme.icon}
                size={13}
                color={theme.onAccent}
              />
              <Text style={[styles.badgeText, { color: theme.onAccent }]}>{theme.label}</Text>
            </View>

            <View
              style={[
                styles.hero,
                category === "books" ? styles.bookHero : null,
                category === "artists" || category === "albums" ? styles.squareHero : null,
                { backgroundColor: palette.isDark ? theme.softDark : theme.softLight },
              ]}
              testID="detail-sheet-hero"
            >
              {showImage ? (
                <Image
                  accessible={false}
                  onError={() => setImageFailed(true)}
                  resizeMode="cover"
                  source={{ uri: imageUrl }}
                  style={styles.heroImage}
                  testID="detail-sheet-hero-image"
                />
              ) : (
                <View style={styles.heroFallback} testID="detail-sheet-hero-fallback">
                  <FontAwesome
                    accessible={false}
                    name={theme.icon}
                    size={54}
                    color={theme.accent}
                  />
                  <Text style={[styles.heroFallbackText, { color: theme.accent }]}>
                    {theme.badge}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={[styles.baseMeta, { color: palette.textSecondary }]}>{item.subtitle}</Text>
            ) : null}
            {item.meta ? (
              <Text style={[styles.baseMeta, { color: palette.textMuted }]}>{item.meta}</Text>
            ) : null}

            {loading ? (
              <View accessibilityLabel="Loading details" accessibilityRole="progressbar" style={styles.status}>
                <ActivityIndicator accessible={false} color={theme.accent} />
                <Text style={[styles.statusText, { color: palette.textSecondary }]}>Loading details…</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={[styles.errorCard, { backgroundColor: palette.surfaceAlt, borderColor: palette.danger }]}>
                <Text accessibilityRole="alert" style={[styles.statusText, { color: palette.text }]}>
                  {errorMessage}
                </Text>
                <Pressable
                  accessibilityLabel="Retry loading details"
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={({ pressed }) => [
                    styles.retryButton,
                    { borderColor: palette.borderStrong, opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <Text style={[styles.retryLabel, { color: palette.text }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            {matchingDetail ? (
              <DetailBody
                accent={theme.accent}
                detail={matchingDetail}
                fallbackAuthor={item.subtitle}
                palette={palette}
              />
            ) : null}
            <ExternalLinks
              category={category}
              item={item}
              detail={matchingDetail}
              palette={palette}
            />

            {savedMutationErrorMessage ? (
              <Text
                accessibilityLabel={savedMutationErrorMessage}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={[
                  styles.savedMutationError,
                  {
                    backgroundColor: palette.surfaceAlt,
                    borderColor: palette.danger,
                    color: palette.text,
                  },
                ]}
              >
                {savedMutationErrorMessage}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <ActionButton
                label={saveLabel}
                icon={saved ? "bookmark" : "bookmark-o"}
                primary={!saved}
                palette={palette}
                accent={theme.accent}
                onAccent={theme.onAccent}
                onPress={() => onSave(item)}
              />
              {origin === "deck" ? (
                <ActionButton
                  label="Not for me"
                  icon="times"
                  palette={palette}
                  accent={theme.accent}
                  onAccent={theme.onAccent}
                  onPress={() => onSkip(item)}
                />
              ) : null}
              <ActionButton
                label="Similar"
                icon="clone"
                palette={palette}
                accent={theme.accent}
                onAccent={theme.onAccent}
                onPress={() => onSimilar(item)}
              />
              {origin === "stored" ? (
                <ActionButton
                  label="Share"
                  icon="share-alt"
                  palette={palette}
                  accent={theme.accent}
                  onAccent={theme.onAccent}
                  onPress={() => onShare(item)}
                />
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingTop: 24,
  },
  surface: {
    borderWidth: 1,
    maxHeight: "94%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  phoneSurface: {
    borderBottomWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  wideSurface: {
    borderRadius: 28,
    maxWidth: 680,
    width: "90%",
  },
  accentStrip: {
    height: 5,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  grabber: {
    alignSelf: "center",
    borderRadius: 3,
    height: 5,
    marginTop: 12,
    width: 42,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    top: 14,
    width: 44,
    zIndex: 10,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 36,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    maxWidth: "80%",
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: {
    flexShrink: 1,
    fontFamily: "SpaceMono",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  hero: {
    alignSelf: "center",
    aspectRatio: 16 / 9,
    borderRadius: 18,
    marginTop: 4,
    maxWidth: 600,
    overflow: "hidden",
    width: "100%",
  },
  bookHero: {
    aspectRatio: 3 / 4,
    maxWidth: 280,
  },
  squareHero: {
    aspectRatio: 1,
    maxWidth: 320,
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  heroFallback: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    padding: 24,
  },
  heroFallbackText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  title: {
    flexShrink: 1,
    fontSize: 27,
    fontWeight: "800",
    lineHeight: 34,
    marginTop: 6,
  },
  baseMeta: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  details: {
    gap: 8,
    marginTop: 6,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    maxWidth: "100%",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  pillText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  categoryMeta: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
  },
  sectionLabel: {
    flexShrink: 1,
    fontFamily: "SpaceMono",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 8,
    textTransform: "uppercase",
  },
  value: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  description: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 23,
  },
  trackRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 6,
  },
  trackNumber: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    width: 24,
  },
  trackName: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    minWidth: 0,
  },
  trackYear: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "600",
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 44,
    paddingVertical: 10,
  },
  statusText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 14,
  },
  savedMutationError: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
    padding: 14,
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  externalLinks: {
    gap: 4,
    marginTop: 8,
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  linkButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: 8,
    justifyContent: "center",
    maxWidth: "100%",
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkLabel: {
    flexShrink: 1,
    flexWrap: "wrap",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 14,
  },
  action: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    flexGrow: 1,
    flexShrink: 1,
    gap: 8,
    justifyContent: "center",
    maxWidth: "100%",
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  actionLabel: {
    flexShrink: 1,
    flexWrap: "wrap",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
});
