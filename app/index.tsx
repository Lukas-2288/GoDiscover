import AntDesign from "@expo/vector-icons/AntDesign";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LinearGradient } from "expo-linear-gradient";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  TextInput,
  useColorScheme,
} from "react-native";
import {
  GENRE_FILTERS,
  ERA_FILTERS,
  RATING_FILTERS,
} from "../constants/Filters";
import {
  searchMovies,
  randomMovies,
  filterMovies,
  getMovieDetail,
  getSimilarMovies,
  decadeToYearRange,
  TMDB_GENRES,
} from "../lib/api/tmdb";
import {
  searchBooks,
  randomBooks,
  filterBooks,
  getBookDetail,
  getSimilarBooks,
  OL_SUBJECTS,
} from "../lib/api/openlibrary";
import {
  searchArtists,
  searchAlbums,
  randomArtists,
  randomAlbums,
  filterArtists,
  filterAlbums,
  getArtistDetail,
  getAlbumDetail,
  getSimilarAlbums,
  getSimilarArtists,
  SPOTIFY_GENRE_MAP,
} from "../lib/api/discogs";
import type {
  ContentCategory,
  ResultItem,
  MovieDetail,
  BookDetail,
  ArtistDetail,
  AlbumDetail,
} from "../types/content";
import {
  listSaved,
  addSaved,
  removeSaved,
  syncLocalToCloud,
  clearLocalSaved,
  type SavedItem,
} from "../lib/storage/saved";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { signInWithGoogle } from "../lib/auth/oauth";
import {
  Palette,
  ThemeMode,
  resolvePalette,
  loadThemeMode,
  saveThemeMode,
} from "../lib/theme";

type ThemeStyles = ReturnType<typeof makeStyles>;
const ThemeContext = createContext<{ palette: Palette; styles: ThemeStyles } | null>(null);
const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeContext.Provider");
  return ctx;
};

// TODO (future refactoring):
// - This file is ~2,500 lines. Extract ResultCard, FilterSection, DetailModal,
//   AuthModal, RecentsList into separate files under components/
// - Wire up POPULARITY_FILTERS from constants/Filters.ts into the filter UI
// - Add pagination to search results (tmdb.ts already supports it)
// - Fix useColorScheme.web.ts — currently always returns 'light' even in dark-mode browsers


const CATEGORY_ICONS: Record<string, { name: string; family: string }> = {
  artists: { name: "microphone", family: "FontAwesome" },
  albums: { name: "music", family: "FontAwesome" },
  books: { name: "book", family: "FontAwesome" },
  movies: { name: "film", family: "FontAwesome" },
};

const CARD_WIDTH = (Dimensions.get("window").width - 48) / 2;

function ResultCard({
  title,
  subtitle,
  meta,
  isHero,
  category,
  imageUrl,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta: string;
  isHero?: boolean;
  category: string;
  imageUrl?: string;
  onPress?: () => void;
}) {
  const { styles, palette } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        isHero ? styles.heroCard : styles.gridCard,
        pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
      ]}
      onPress={onPress}
    >
      <View style={[styles.cardImagePlaceholder, isHero && styles.heroImagePlaceholder]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <FontAwesome
            name={CATEGORY_ICONS[category]?.name as any ?? "star"}
            size={isHero ? 40 : 24}
            color={palette.accentBorder}
          />
        )}
      </View>
      {/* Card info */}
      <View style={styles.cardInfo}>
        <Text style={[styles.cardTitle, isHero && styles.heroCardTitle]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={styles.cardMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

function ActionButton({
  label,
  value,
  activateAction,
  onPress,
}: {
  label: string;
  value: string;
  activateAction: string;
  onPress: () => void;
}) {
  const { styles } = useTheme();
  const isActive = activateAction === value;
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        isActive && styles.actionButtonActive,
        pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
        hovered && !isActive && styles.actionButtonHover,
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Text style={[styles.actionButtonText, isActive && styles.actionButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ContentButton({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: string;
  selected: string | null;
  onPress: () => void;
}) {
  const { styles } = useTheme();
  const isSelected = selected === value;
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.contentButton,
        isSelected && styles.contentButtonActive,
        pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
        hovered && !isSelected && styles.contentButtonHover,
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Text style={[styles.contentButtonText, isSelected && styles.contentButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterChip({
  label,
  value,
  selectedFilters,
  onPress,
}: {
  label: string;
  value: string;
  selectedFilters: string[];
  onPress: () => void;
}) {
  const { styles } = useTheme();
  const isSelected = selectedFilters.includes(value);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterChip,
        isSelected && styles.filterChipActive,
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Text
        style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FilterSection({
  title,
  sectionKey,
  options,
  openSection,
  onToggle,
  selectedFilters,
  onChipPress,
}: {
  title: string;
  sectionKey: string;
  options: { label: string; value: string }[];
  openSection: string | null;
  onToggle: () => void;
  selectedFilters: string[];
  onChipPress: (value: string) => void;
}) {
  const { styles, palette } = useTheme();
  const isOpen = openSection === sectionKey;
  const activeCount = options.filter((o) =>
    selectedFilters.includes(o.value)
  ).length;

  return (
    <View style={styles.filterSection}>
      <Pressable
        style={({ pressed }) => [
          styles.filterSectionHeader,
          pressed && { opacity: 0.8 },
        ]}
        onPress={onToggle}
      >
        <Text style={styles.filterSectionTitle}>
          {title}
          {activeCount > 0 && (
            <Text style={styles.filterSectionCount}> ({activeCount})</Text>
          )}
        </Text>
        <AntDesign
          name={isOpen ? "down" : "right"}
          size={14}
          color={palette.textMuted}
        />
      </Pressable>
      {isOpen && (
        <View style={styles.filterChipContainer}>
          {options.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              value={option.value}
              selectedFilters={selectedFilters}
              onPress={() => onChipPress(option.value)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [detailItem, setDetailItem] = useState<ResultItem | null>(null);
  const [movieDetail, setMovieDetail] = useState<MovieDetail | null>(null);
  const [bookDetail, setBookDetail] = useState<BookDetail | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [similarItems, setSimilarItems] = useState<ResultItem[]>([]);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const systemScheme = useColorScheme();

  const palette = useMemo(
    () => resolvePalette(themeMode, systemScheme === "dark"),
    [themeMode, systemScheme]
  );
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const changeThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
  };

  useEffect(() => {
    loadThemeMode().then(setThemeMode);
  }, []);

  useEffect(() => {
    listSaved().then(setSavedItems).catch(() => {});
    listRecents().then(setRecentItems).catch(() => {});
  }, []);

  useEffect(() => {
    if (!detailItem || !selected) return;
    addRecent(selected as ContentCategory, detailItem)
      .then(setRecentItems)
      .catch(() => {});
  }, [detailItem?.id, selected]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        listSaved().then(setSavedItems).catch(() => {});
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" && s) {
        await syncLocalToCloud();
        const items = await listSaved();
        setSavedItems(items);
      }
      if (event === "SIGNED_OUT") {
        await clearLocalSaved();
        setSavedItems([]);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword) {
      Alert.alert("Missing info", "Please enter email and password.");
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        setAuthEmail("");
        setAuthPassword("");
        setAccountOpen(false);
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        Alert.alert(
          "Check your inbox",
          "We sent a confirmation link to your email. Click it, then sign in."
        );
        setAuthMode("signin");
        setAuthPassword("");
      }
    } catch (e: any) {
      Alert.alert("Auth error", e.message ?? "Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  };

  const currentDisplayName = (): string => {
    const meta = session?.user?.user_metadata ?? {};
    return meta.display_name ?? meta.full_name ?? meta.name ?? "";
  };

  useEffect(() => {
    setDisplayNameDraft(currentDisplayName());
  }, [session?.user?.id, session?.user?.user_metadata]);

  const saveDisplayName = async () => {
    const next = displayNameDraft.trim();
    if (!next || next === currentDisplayName()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: next } });
      if (error) throw error;
    } catch (e: any) {
      Alert.alert("Couldn't save name", e?.message ?? "Something went wrong");
    } finally {
      setSavingName(false);
    }
  };

  const handleSignOut = async () => {
    console.log("[auth] signOut tapped");
    setAccountOpen(false);
    try {
      const { error } = await supabase.auth.signOut();
      console.log("[auth] signOut result", error ? `error: ${error.message}` : "ok");
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch (e: any) {
      console.warn("[auth] signOut threw", e?.message ?? e);
      await supabase.auth.signOut({ scope: "local" });
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      setAccountOpen(false);
    } catch (e: any) {
      if (e?.message !== "Sign-in cancelled") {
        Alert.alert("Google sign-in failed", e?.message ?? "Something went wrong");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const isItemSaved = (item: ResultItem | null): boolean => {
    if (!item || !selected) return false;
    return savedItems.some(
      (s) => s.category === (selected as ContentCategory) && s.id === item.id
    );
  };

  const toggleSaveDetail = async () => {
    if (!detailItem || !selected) return;
    const category = selected as ContentCategory;
    const next = isItemSaved(detailItem)
      ? await removeSaved(category, detailItem.id)
      : await addSaved(category, detailItem);
    setSavedItems(next);
  };

  const shareDetail = async () => {
    if (!detailItem || !selected) return;
    const kind =
      selected === "movies"
        ? "movie"
        : selected === "books"
        ? "book"
        : selected === "albums"
        ? "album"
        : "artist";
    let sourceUrl: string | null = null;
    if (selected === "movies") {
      sourceUrl = `https://www.themoviedb.org/movie/${detailItem.id}`;
    } else if (selected === "books") {
      sourceUrl = `https://openlibrary.org/works/${detailItem.id}`;
    } else if (selected === "artists") {
      sourceUrl = `https://open.spotify.com/search/${encodeURIComponent(detailItem.title)}`;
    } else if (selected === "albums") {
      const query = `${detailItem.title} ${detailItem.subtitle ?? ""}`.trim();
      sourceUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    }
    const lines = [
      `Check out this ${kind} I found on GoDiscover:`,
      "",
      `${detailItem.title}${detailItem.subtitle ? ` — ${detailItem.subtitle}` : ""}`,
    ];
    if (detailItem.meta) lines.push(detailItem.meta);
    if (sourceUrl) lines.push("", sourceUrl);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {}
  };

  const runAction = async (action: "search" | "filter" | "randomize") => {
    if (!selected || loading) return;
    if (action === "search" && !searchQuery.trim()) return;
    setLoading(true);
    try {
      const decade = selectedFilters.find((f) => /^\d{2}s$/.test(f));
      const range = decade ? decadeToYearRange(decade) : null;
      const ratingFilter = selectedFilters.find((f) => /^\d(\.\d)?\+$/.test(f));
      const minRating = ratingFilter ? parseFloat(ratingFilter) : undefined;

      if (selected === "movies") {
        if (action === "search") {
          setResults(await searchMovies(searchQuery));
        } else if (action === "randomize") {
          setResults(await randomMovies());
        } else {
          const genreIds = selectedFilters
            .map((f) => TMDB_GENRES[f])
            .filter((v): v is number => typeof v === "number");
          setResults(
            await filterMovies({
              genreIds: genreIds.length ? genreIds : undefined,
              yearFrom: range?.yearFrom,
              yearTo: range?.yearTo,
              minRating,
            })
          );
        }
      } else if (selected === "books") {
        if (action === "search") {
          setResults(await searchBooks(searchQuery));
        } else if (action === "randomize") {
          setResults(await randomBooks());
        } else {
          const subjects = selectedFilters
            .map((f) => OL_SUBJECTS[f])
            .filter((v): v is string => typeof v === "string");
          setResults(
            await filterBooks({
              subjects: subjects.length ? subjects : undefined,
              yearFrom: range?.yearFrom,
              yearTo: range?.yearTo,
              minRating,
            })
          );
        }
      } else if (selected === "artists" || selected === "albums") {
        if (action === "search") {
          setResults(
            selected === "artists"
              ? await searchArtists(searchQuery)
              : await searchAlbums(searchQuery)
          );
        } else if (action === "randomize") {
          setResults(
            selected === "artists" ? await randomArtists() : await randomAlbums()
          );
        } else {
          const genres = selectedFilters
            .map((f) => SPOTIFY_GENRE_MAP[f])
            .filter((v): v is string => typeof v === "string");
          const params = {
            genres: genres.length ? genres : undefined,
            yearFrom: range?.yearFrom,
            yearTo: range?.yearTo,
          };
          setResults(
            selected === "artists"
              ? await filterArtists(params)
              : await filterAlbums(params)
          );
        }
      }
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Something went wrong");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!detailItem) {
      setMovieDetail(null);
      setBookDetail(null);
      setArtistDetail(null);
      setAlbumDetail(null);
      setSimilarItems([]);
      setDetailError(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(false);
    setMovieDetail(null);
    setBookDetail(null);
    setArtistDetail(null);
    setAlbumDetail(null);
    setSimilarItems([]);

    let fetcher: Promise<void>;
    let similarFetcher: Promise<ResultItem[]> | null = null;
    if (selected === "movies") {
      fetcher = getMovieDetail(detailItem.id).then((d) => {
        if (!cancelled) setMovieDetail(d);
      });
      similarFetcher = getSimilarMovies(detailItem.id);
    } else if (selected === "books") {
      fetcher = getBookDetail(detailItem.id, {
        title: detailItem.title,
        imageUrl: detailItem.imageUrl,
      }).then((d) => {
        if (!cancelled) setBookDetail(d);
      });
      similarFetcher = getSimilarBooks(detailItem.id);
    } else if (selected === "artists") {
      fetcher = getArtistDetail(detailItem.id).then((d) => {
        if (!cancelled) setArtistDetail(d);
      });
      similarFetcher = getSimilarArtists(detailItem.id);
    } else if (selected === "albums") {
      fetcher = getAlbumDetail(detailItem.id).then((d) => {
        if (!cancelled) setAlbumDetail(d);
      });
      similarFetcher = getSimilarAlbums(detailItem.id);
    } else {
      return;
    }

    fetcher
      .catch(() => {
        if (!cancelled) setDetailError(true);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    if (similarFetcher) {
      similarFetcher
        .then((items) => {
          if (!cancelled) setSimilarItems(items);
        })
        .catch(() => {
          if (!cancelled) setSimilarItems([]);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [detailItem, selected]);

  const toggleFilter = (value: string) => {
    setSelectedFilters((prev) =>
      prev.includes(value)
        ? prev.filter((f) => f !== value)
        : [...prev, value]
    );
  };

  const genreOptions = selected
    ? GENRE_FILTERS[selected as keyof typeof GENRE_FILTERS].map((g) => ({
        label: g,
        value: g,
      }))
    : [];
  const eraOptions = [
    { label: "Any", value: "Any" },
    ...ERA_FILTERS.decades.map((e) => ({ label: e, value: e })),
  ];
  const ratingOptions =
    selected && selected !== "artists" && selected in RATING_FILTERS
      ? RATING_FILTERS[selected as keyof typeof RATING_FILTERS].map((r) => ({
          label: r.label,
          value: r.label,
        }))
      : null;
  const popularityOptions = null;

  return (
    <ThemeContext.Provider value={{ palette, styles }}>
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable
            style={({ pressed }) => pressed && { opacity: 0.6 }}
            onPress={() => setAccountOpen(true)}
          >
            <FontAwesome
              name={session ? "user-circle" : "user-circle-o"}
              size={26}
              color={palette.accent}
            />
          </Pressable>
        </View>
        <Text style={styles.logoText}>GoDiscover</Text>
        <View style={styles.topBarRight}>
          <Pressable
            style={({ pressed }) => pressed && { opacity: 0.6 }}
            onPress={() => setSavedOpen(true)}
          >
            <FontAwesome
              name={savedItems.length > 0 ? "bookmark" : "bookmark-o"}
              size={22}
              color={savedItems.length > 0 ? palette.accent : palette.borderStrong}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => pressed && { opacity: 0.6 }}
            onPress={() => setHowToOpen(true)}
          >
            <FontAwesome name="question-circle-o" size={24} color={palette.textMuted} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Content Type Selector */}
        <View style={styles.contentSelector}>
          <ContentButton
            label="🎤 Artists"
            value="artists"
            selected={selected}
            onPress={() => { setSelected("artists"); setSelectedFilters([]); setOpenSection(null); }}
          />
          <ContentButton
            label="🎵 Albums"
            value="albums"
            selected={selected}
            onPress={() => { setSelected("albums"); setSelectedFilters([]); setOpenSection(null); }}
          />
          <ContentButton
            label="📚 Books"
            value="books"
            selected={selected}
            onPress={() => { setSelected("books"); setSelectedFilters([]); setOpenSection(null); }}
          />
          <ContentButton
            label="🎬 Movies"
            value="movies"
            selected={selected}
            onPress={() => { setSelected("movies"); setSelectedFilters([]); setOpenSection(null); }}
          />
        </View>

        {/* Action Selector */}
        <View style={styles.actionSelector}>
          <ActionButton
            label="Search"
            value="search"
            activateAction={activeAction ?? ""}
            onPress={() => setActiveAction("search")}
          />
          <ActionButton
            label="Filter"
            value="filter"
            activateAction={activeAction ?? ""}
            onPress={() => setActiveAction("filter")}
          />
          <ActionButton
            label="Randomize"
            value="randomize"
            activateAction={activeAction ?? ""}
            onPress={() => setActiveAction("randomize")}
          />
        </View>

        {/* Recently Viewed */}
        {!activeAction && recentItems.length > 0 && (
          <View style={styles.recentsSection}>
            <View style={styles.recentsHeader}>
              <Text style={styles.recentsTitle}>Recently viewed</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentsRow}
            >
              {recentItems.map((item) => (
                <Pressable
                  key={`${item.category}:${item.id}`}
                  style={({ pressed }) => [
                    styles.recentCard,
                    pressed && { opacity: 0.75 },
                  ]}
                  onPress={() => {
                    setSelected(item.category);
                    setDetailItem(item);
                  }}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.recentImage}
                    />
                  ) : (
                    <View
                      style={[
                        styles.recentImage,
                        { backgroundColor: palette.accentBgSoft },
                      ]}
                    />
                  )}
                  <Text style={styles.recentCardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Empty States */}
        {!selected && recentItems.length === 0 && (
          <View style={styles.emptyState}>
            <FontAwesome name="hand-pointer-o" size={32} color={palette.textFaint} />
            <Text style={styles.emptyStateText}>
              Select a category above to get started
            </Text>
          </View>
        )}
        {selected && !activeAction && (
          <View style={styles.emptyState}>
            <AntDesign name="arrow-up" size={32} color={palette.textFaint} />
            <Text style={styles.emptyStateText}>
              Now choose Search, Filter, or Randomize
            </Text>
          </View>
        )}

        {/* Search Panel */}
        {selected && activeAction === "search" && (
          <View style={styles.searchState}>
            <View style={styles.searchInputContainer}>
              <FontAwesome
                name="search"
                size={16}
                color={palette.textFaint}
                style={styles.searchIcon}
              />
              <TextInput
                onChangeText={setSearchQuery}
                value={searchQuery}
                style={styles.searchInput}
                placeholder={`Describe the ${selected} you're looking for...`}
                placeholderTextColor={palette.textFaint}
                multiline={true}
              />
            </View>
            {searchQuery.length > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.searchButton,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => runAction(activeAction as "search" | "randomize")}
              >
                <Text style={styles.searchButtonText}>Find {selected}</Text>
                <AntDesign name="arrow-right" size={16} color={palette.onAccent} />
              </Pressable>
            )}
          </View>
        )}

        {/* Filter Panel */}
        {selected && activeAction === "filter" && (
          <View style={styles.filterState}>
            {selectedFilters.length > 0 && (
              <Pressable
                onPress={() => setSelectedFilters([])}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.clearFiltersText}>Clear all</Text>
              </Pressable>
            )}
            <FilterSection
              title="Genre"
              sectionKey="genre"
              options={genreOptions}
              openSection={openSection}
              onToggle={() =>
                setOpenSection(openSection === "genre" ? null : "genre")
              }
              selectedFilters={selectedFilters}
              onChipPress={toggleFilter}
            />
            <FilterSection
              title="Era"
              sectionKey="era"
              options={eraOptions}
              openSection={openSection}
              onToggle={() =>
                setOpenSection(openSection === "era" ? null : "era")
              }
              selectedFilters={selectedFilters}
              onChipPress={toggleFilter}
            />
            {ratingOptions && (
              <FilterSection
                title="Rating"
                sectionKey="rating"
                options={ratingOptions}
                openSection={openSection}
                onToggle={() =>
                  setOpenSection(openSection === "rating" ? null : "rating")
                }
                selectedFilters={selectedFilters}
                onChipPress={toggleFilter}
              />
            )}
            {popularityOptions && (
              <FilterSection
                title="Popularity"
                sectionKey="popularity"
                options={popularityOptions}
                openSection={openSection}
                onToggle={() =>
                  setOpenSection(
                    openSection === "popularity" ? null : "popularity"
                  )
                }
                selectedFilters={selectedFilters}
                onChipPress={toggleFilter}
              />
            )}
            <Pressable
              style={({ pressed }) => [
                styles.searchButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => runAction("filter")}
            >
              <Text style={styles.searchButtonText}>Find {selected}</Text>
              <AntDesign name="arrow-right" size={16} color={palette.onAccent} />
            </Pressable>
          </View>
        )}

        {/* Randomize Panel */}
        {selected && activeAction === "randomize" && (
          <View style={styles.randomizeState}>
            <Text style={styles.randomizeHint}>
              Tap to discover something new
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.randomizeButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
              ]}
              onPress={() => runAction("randomize")}
            >
              <FontAwesome name="random" size={22} color={palette.onAccent} />
              <Text style={styles.randomizeButtonText}>Surprise Me!</Text>
            </Pressable>
          </View>
        )}
        {/* Loading */}
        {loading && (
          <View style={styles.emptyState}>
            <ActivityIndicator color={palette.accent} size="large" />
            <Text style={styles.emptyStateText}>Finding your {selected}...</Text>
          </View>
        )}

        {/* No results */}
        {!loading && results && results.length === 0 && selected && (
          <View style={styles.emptyState}>
            <FontAwesome name="search-minus" size={32} color={palette.textFaint} />
            <Text style={styles.emptyStateText}>
              No {selected} matched those filters. Try loosening them.
            </Text>
          </View>
        )}

        {/* Results */}
        {!loading && results && results.length > 0 && selected && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Results</Text>
              <Pressable
                onPress={() => setResults(null)}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.clearResultsText}>Clear</Text>
              </Pressable>
            </View>

            {/* Hero Card */}
            <ResultCard
              title={results[0].title}
              subtitle={results[0].subtitle}
              meta={results[0].meta}
              isHero
              category={selected}
              imageUrl={results[0].imageUrl}
              onPress={() => setDetailItem(results[0])}
            />

            {/* Grid Cards */}
            <View style={styles.gridContainer}>
              {results.slice(1).map((item) => (
                <ResultCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  meta={item.meta}
                  category={selected}
                  imageUrl={item.imageUrl}
                  onPress={() => setDetailItem(item)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Detail Modal */}
      {selected && detailItem && (
        <Modal
          visible={true}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setDetailItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {/* Grabber bar */}
              <View style={styles.modalGrabber} />

              {/* Close button */}
              <Pressable
                style={({ pressed }) => [
                  styles.modalClose,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setDetailItem(null)}
                hitSlop={8}
              >
                <AntDesign name="close" size={18} color={palette.onAccent} />
              </Pressable>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Per-category hero */}
                {selected === "movies" ? (
                  <View style={styles.heroMovie}>
                    {movieDetail?.backdropUrl || detailItem.imageUrl ? (
                      <Image
                        source={{ uri: movieDetail?.backdropUrl ?? detailItem.imageUrl }}
                        style={styles.heroMovieImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.heroMoviePlaceholder}>
                        <FontAwesome
                          name={CATEGORY_ICONS[selected]?.name as any ?? "star"}
                          size={48}
                          color={palette.accentBorder}
                        />
                      </View>
                    )}
                    <LinearGradient
                      colors={["transparent", palette.gradientMid, palette.surface]}
                      style={styles.heroMovieGradient}
                      pointerEvents="none"
                    />
                  </View>
                ) : (
                  <View style={styles.heroCentered}>
                    {(() => {
                      const uri =
                        selected === "books"
                          ? bookDetail?.coverUrl ?? detailItem.imageUrl
                          : selected === "artists"
                          ? artistDetail?.imageUrl ?? detailItem.imageUrl
                          : selected === "albums"
                          ? albumDetail?.imageUrl ?? detailItem.imageUrl
                          : detailItem.imageUrl;
                      const wrapStyle =
                        selected === "books"
                          ? styles.heroBookWrap
                          : styles.heroSquareWrap;
                      if (!uri) {
                        return (
                          <View style={[wrapStyle, styles.heroEmptyWrap]}>
                            <FontAwesome
                              name={CATEGORY_ICONS[selected]?.name as any ?? "star"}
                              size={48}
                              color={palette.accentBorder}
                            />
                          </View>
                        );
                      }
                      return (
                        <Image
                          source={{ uri }}
                          style={wrapStyle}
                          resizeMode="cover"
                        />
                      );
                    })()}
                  </View>
                )}

                {/* Title */}
                <Text style={styles.modalTitle} numberOfLines={2}>{detailItem.title}</Text>

                {/* Content-specific details */}
                {selected === "movies" && (() => {
                  if (detailLoading && !movieDetail) {
                    return (
                      <View style={styles.modalDetails}>
                        <ActivityIndicator color={palette.accent} />
                      </View>
                    );
                  }
                  if (detailError) {
                    return (
                      <View style={styles.modalDetails}>
                        <Text style={styles.modalDescription}>
                          Couldn&apos;t load details. Check your connection and try again.
                        </Text>
                      </View>
                    );
                  }
                  const d = movieDetail;
                  if (!d) return null;
                  return (
                    <View style={styles.modalDetails}>
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaPill}>{d.releaseYear}</Text>
                        {d.runtime ? (
                          <Text style={styles.modalMetaPill}>{d.runtime} min</Text>
                        ) : null}
                        <Text style={styles.modalMetaPill}>⭐ {d.rating.toFixed(1)}</Text>
                      </View>
                      <Text style={styles.modalSubtitle}>{d.genres.join(" / ") || "—"}</Text>
                      <Text style={styles.modalLabel}>Language</Text>
                      <Text style={styles.modalValue}>{d.language.toUpperCase()}</Text>
                      <Text style={styles.modalLabel}>Synopsis</Text>
                      <Text style={styles.modalDescription}>{d.overview || "No synopsis available."}</Text>
                    </View>
                  );
                })()}

                {selected === "books" && (() => {
                  if (detailLoading && !bookDetail) {
                    return (
                      <View style={styles.modalDetails}>
                        <ActivityIndicator color={palette.accent} />
                      </View>
                    );
                  }
                  if (detailError) {
                    return (
                      <View style={styles.modalDetails}>
                        <Text style={styles.modalDescription}>
                          Couldn&apos;t load details. Check your connection and try again.
                        </Text>
                      </View>
                    );
                  }
                  const d = bookDetail;
                  if (!d) return null;
                  const fallbackAuthor = detailItem.subtitle;
                  const authorLine = d.authors.length ? d.authors.join(", ") : fallbackAuthor;
                  return (
                    <View style={styles.modalDetails}>
                      <View style={styles.modalMetaRow}>
                        {d.firstPublishYear ? (
                          <Text style={styles.modalMetaPill}>{d.firstPublishYear}</Text>
                        ) : null}
                        {d.rating ? (
                          <Text style={styles.modalMetaPill}>⭐ {d.rating.toFixed(1)}</Text>
                        ) : null}
                      </View>
                      {d.subjects.length ? (
                        <Text style={styles.modalSubtitle}>{d.subjects.slice(0, 3).join(" / ")}</Text>
                      ) : null}
                      <Text style={styles.modalLabel}>Author</Text>
                      <Text style={styles.modalValue}>{authorLine}</Text>
                      <Text style={styles.modalLabel}>Description</Text>
                      <Text style={styles.modalDescription}>
                        {d.description || "No description available."}
                      </Text>
                    </View>
                  );
                })()}

                {selected === "artists" && (() => {
                  if (detailLoading && !artistDetail) {
                    return (
                      <View style={styles.modalDetails}>
                        <ActivityIndicator color={palette.accent} />
                      </View>
                    );
                  }
                  if (detailError) {
                    return (
                      <View style={styles.modalDetails}>
                        <Text style={styles.modalDescription}>
                          Couldn&apos;t load details. Check your connection and try again.
                        </Text>
                      </View>
                    );
                  }
                  const d = artistDetail;
                  if (!d) return null;
                  return (
                    <View style={styles.modalDetails}>
                      <Text style={styles.modalLabel}>Discography</Text>
                      {d.albums.length ? (
                        d.albums.map((album, i) => {
                          const year = album.releaseDate ? album.releaseDate.slice(0, 4) : "";
                          return (
                            <View key={album.id} style={styles.trackRow}>
                              <Text style={styles.trackNumber}>{i + 1}</Text>
                              <Text style={styles.trackName} numberOfLines={1}>
                                {album.name}
                              </Text>
                              {year ? <Text style={styles.trackYear}>{year}</Text> : null}
                            </View>
                          );
                        })
                      ) : (
                        <Text style={styles.modalValue}>No albums found.</Text>
                      )}
                    </View>
                  );
                })()}

                {selected === "albums" && (() => {
                  if (detailLoading && !albumDetail) {
                    return (
                      <View style={styles.modalDetails}>
                        <ActivityIndicator color={palette.accent} />
                      </View>
                    );
                  }
                  if (detailError) {
                    return (
                      <View style={styles.modalDetails}>
                        <Text style={styles.modalDescription}>
                          Couldn&apos;t load details. Check your connection and try again.
                        </Text>
                      </View>
                    );
                  }
                  const d = albumDetail;
                  if (!d) return null;
                  const year = d.releaseDate ? d.releaseDate.slice(0, 4) : "—";
                  return (
                    <View style={styles.modalDetails}>
                      <View style={styles.modalMetaRow}>
                        <Text style={styles.modalMetaPill}>{year}</Text>
                        <Text style={styles.modalMetaPill}>{d.totalTracks} tracks</Text>
                        <Text style={styles.modalMetaPill}>
                          {d.albumType.charAt(0).toUpperCase() + d.albumType.slice(1)}
                        </Text>
                      </View>
                      <Text style={styles.modalSubtitle}>{d.artists.join(", ")}</Text>
                      <Text style={styles.modalLabel}>Tracks</Text>
                      {d.tracks.slice(0, 8).map((track, i) => (
                        <View key={track.id} style={styles.trackRow}>
                          <Text style={styles.trackNumber}>{i + 1}</Text>
                          <Text style={styles.trackName}>{track.name}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                {/* External Links */}
                <View style={styles.externalLinks}>
                  <Text style={styles.modalLabel}>
                    {selected === "artists" || selected === "albums"
                      ? "Listen"
                      : selected === "movies"
                      ? "Watch"
                      : selected === "books"
                      ? "Read"
                      : "Links"}
                  </Text>

                  {(selected === "artists" || selected === "albums") && (() => {
                    const searchTerm =
                      selected === "artists"
                        ? detailItem.title
                        : `${detailItem.title} ${detailItem.subtitle}`;
                    return (
                      <View style={styles.linkRow}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.linkButton,
                            styles.linkSpotify,
                            pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                          ]}
                          onPress={() =>
                            Linking.openURL(
                              `https://open.spotify.com/search/${encodeURIComponent(searchTerm)}`
                            )
                          }
                        >
                          <FontAwesome name="spotify" size={18} color={palette.onAccent} />
                          <Text style={styles.linkButtonText}>Spotify</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.linkButton,
                            styles.linkAppleMusic,
                            pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                          ]}
                          onPress={() =>
                            Linking.openURL(
                              `https://music.apple.com/us/search?term=${encodeURIComponent(searchTerm)}`
                            )
                          }
                        >
                          <FontAwesome name="apple" size={18} color={palette.onAccent} />
                          <Text style={styles.linkButtonText}>Apple Music</Text>
                        </Pressable>
                      </View>
                    );
                  })()}

                  {selected === "movies" && (
                    <View style={styles.linkRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.linkButton,
                          styles.linkJustWatch,
                          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                        ]}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.justwatch.com/us/search?q=${encodeURIComponent(detailItem.title)}`
                          )
                        }
                      >
                        <MaterialIcons name="live-tv" size={18} color={palette.onAccent} />
                        <Text style={styles.linkButtonText}>JustWatch</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.linkButton,
                          styles.linkTMDB,
                          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                        ]}
                        onPress={() =>
                          Linking.openURL(`https://www.themoviedb.org/movie/${detailItem.id}`)
                        }
                      >
                        <FontAwesome name="film" size={16} color={palette.onAccent} />
                        <Text style={styles.linkButtonText}>TMDB</Text>
                      </Pressable>
                    </View>
                  )}

                  {selected === "books" && (
                    <View style={styles.linkRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.linkButton,
                          styles.linkAmazon,
                          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                        ]}
                        onPress={() =>
                          Linking.openURL(
                            `https://openlibrary.org/works/${detailItem.id}`
                          )
                        }
                      >
                        <FontAwesome name="book" size={16} color={palette.onAccent} />
                        <Text style={styles.linkButtonText}>Open Library</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.linkButton,
                          styles.linkGoodreads,
                          pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                        ]}
                        onPress={() =>
                          Linking.openURL(
                            `https://www.goodreads.com/search?q=${encodeURIComponent(detailItem.title)}`
                          )
                        }
                      >
                        <FontAwesome name="star" size={16} color={palette.onAccent} />
                        <Text style={styles.linkButtonText}>Goodreads</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Save + Share */}
                <View style={styles.detailActionsRow}>
                  {(() => {
                    const saved = isItemSaved(detailItem);
                    return (
                      <Pressable
                        onPress={toggleSaveDetail}
                        style={({ pressed }) => [
                          styles.saveButton,
                          saved && styles.saveButtonActive,
                          pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                        ]}
                      >
                        <FontAwesome
                          name={saved ? "bookmark" : "bookmark-o"}
                          size={16}
                          color={palette.onAccent}
                        />
                        <Text style={styles.saveButtonText}>
                          {saved ? "Saved" : "Save"}
                        </Text>
                      </Pressable>
                    );
                  })()}
                  <Pressable
                    onPress={shareDetail}
                    style={({ pressed }) => [
                      styles.shareButton,
                      pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <FontAwesome
                      name="share-alt"
                      size={16}
                      color={palette.text}
                    />
                    <Text style={styles.shareButtonText}>Share</Text>
                  </Pressable>
                </View>

                {/* Similar Items */}
                {similarItems.length > 0 && (
                  <View style={styles.similarSection}>
                    <Text style={styles.similarTitle}>You might also like</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.similarRow}
                    >
                      {similarItems.map((item) => (
                        <Pressable
                          key={item.id}
                          style={({ pressed }) => [
                            styles.similarCard,
                            pressed && { opacity: 0.75 },
                          ]}
                          onPress={() => setDetailItem(item)}
                        >
                          {item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.similarImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.similarImage,
                                { backgroundColor: palette.accentBgSoft },
                              ]}
                            />
                          )}
                          <Text style={styles.similarCardTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          {item.subtitle ? (
                            <Text style={styles.similarCardSubtitle} numberOfLines={1}>
                              {item.subtitle}
                            </Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* How To Use Modal */}
      <Modal
        visible={howToOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setHowToOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setHowToOpen(false)}
            >
              <AntDesign name="close" size={20} color={palette.textMuted} />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.howToHeader}>
                <View style={styles.howToIconCircle}>
                  <FontAwesome name="compass" size={36} color={palette.accent} />
                </View>
                <Text style={styles.howToTitle}>How to use GoDiscover</Text>
                <Text style={styles.howToSubtitle}>
                  Discover something new in three simple steps
                </Text>
              </View>

              <View style={styles.stepsContainer}>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Pick a category</Text>
                    <Text style={styles.stepDescription}>
                      Choose between Artists, Albums, Books, or Movies — whatever
                      you're in the mood to discover.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Choose how to discover</Text>
                    <Text style={styles.stepDescription}>
                      <Text style={styles.stepBold}>Search</Text> with a description,{" "}
                      <Text style={styles.stepBold}>Filter</Text> by genre and era, or hit{" "}
                      <Text style={styles.stepBold}>Randomize</Text> for a surprise.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Explore & save</Text>
                    <Text style={styles.stepDescription}>
                      Tap any result to see details and open it on your favorite
                      platform. Save items you love to revisit later.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.howToFooter}>
                <Text style={styles.howToFooterText}>
                  Browse freely without an account — sign in only when you want to
                  save your finds.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Saved Modal */}
      <Modal
        visible={savedOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSavedOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.savedSheet}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setSavedOpen(false)}
            >
              <AntDesign name="close" size={20} color={palette.onAccent} />
            </Pressable>
            <Text style={styles.savedTitle}>Saved</Text>
            {!session && (
              <Pressable
                onPress={() => {
                  setSavedOpen(false);
                  setAccountOpen(true);
                }}
                style={({ pressed }) => [
                  styles.savedSignInBanner,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <FontAwesome name="cloud" size={14} color={palette.accent} />
                <Text style={styles.savedSignInText}>
                  Sign in to sync across devices
                </Text>
              </Pressable>
            )}
            {savedItems.length === 0 ? (
              <View style={styles.savedEmpty}>
                <FontAwesome name="bookmark-o" size={36} color={palette.textFaint} />
                <Text style={styles.savedEmptyText}>
                  Nothing saved yet. Tap the Save button on any result to keep it here.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.savedList}
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
              >
                {(["artists", "albums", "movies", "books"] as ContentCategory[]).map(
                  (cat) => {
                    const group = savedItems.filter((s) => s.category === cat);
                    if (group.length === 0) return null;
                    const label =
                      cat === "artists"
                        ? "Artists"
                        : cat === "albums"
                        ? "Albums"
                        : cat === "movies"
                        ? "Movies"
                        : "Books";
                    return (
                      <View key={cat} style={styles.savedGroup}>
                        <Text style={styles.savedGroupLabel}>{label}</Text>
                        {group.map((item) => (
                          <Pressable
                            key={`${item.category}:${item.id}`}
                            style={({ pressed }) => [
                              styles.savedItem,
                              pressed && { opacity: 0.7 },
                            ]}
                            onPress={() => {
                              setSelected(item.category);
                              setDetailItem(item);
                              setSavedOpen(false);
                            }}
                          >
                            {item.imageUrl ? (
                              <Image
                                source={{ uri: item.imageUrl }}
                                style={styles.savedItemImage}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.savedItemImage,
                                  { backgroundColor: palette.accentBgSoft },
                                ]}
                              />
                            )}
                            <View style={styles.savedItemText}>
                              <Text style={styles.savedItemTitle} numberOfLines={1}>
                                {item.title}
                              </Text>
                              <Text style={styles.savedItemSubtitle} numberOfLines={1}>
                                {item.subtitle}
                                {item.meta ? ` · ${item.meta}` : ""}
                              </Text>
                            </View>
                            <Pressable
                              hitSlop={10}
                              onPress={async () => {
                                const next = await removeSaved(item.category, item.id);
                                setSavedItems(next);
                              }}
                              style={({ pressed }) => [
                                styles.savedRemove,
                                pressed && { opacity: 0.6 },
                              ]}
                            >
                              <AntDesign
                                name="close"
                                size={16}
                                color={palette.textMuted}
                              />
                            </Pressable>
                          </Pressable>
                        ))}
                      </View>
                    );
                  }
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Account Modal */}
      <Modal
        visible={accountOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAccountOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setAccountOpen(false)}
            >
              <AntDesign name="close" size={20} color={palette.textMuted} />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              {session ? (
                <>
                  <View style={styles.authHeader}>
                    <View style={styles.howToIconCircle}>
                      <FontAwesome name="user-circle" size={36} color={palette.accent} />
                    </View>
                    <Text style={styles.howToTitle}>
                      {currentDisplayName() || "Signed in"}
                    </Text>
                    <Text style={styles.howToSubtitle}>
                      {session.user.email}
                    </Text>
                  </View>
                  <View style={styles.authForm}>
                    <Text style={styles.authLabel}>Display name</Text>
                    <View style={styles.nameRow}>
                      <TextInput
                        style={[styles.authInput, styles.nameInput]}
                        placeholder="Your name"
                        placeholderTextColor={palette.textFaint}
                        value={displayNameDraft}
                        onChangeText={setDisplayNameDraft}
                        editable={!savingName}
                        autoCapitalize="words"
                      />
                      <Pressable
                        disabled={
                          savingName ||
                          !displayNameDraft.trim() ||
                          displayNameDraft.trim() === currentDisplayName()
                        }
                        onPress={saveDisplayName}
                        style={({ pressed }) => [
                          styles.nameSaveButton,
                          (savingName ||
                            !displayNameDraft.trim() ||
                            displayNameDraft.trim() === currentDisplayName()) && {
                            opacity: 0.4,
                          },
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        {savingName ? (
                          <ActivityIndicator color={palette.onAccent} size="small" />
                        ) : (
                          <Text style={styles.nameSaveText}>Save</Text>
                        )}
                      </Pressable>
                    </View>

                    <Pressable
                      style={({ pressed }) => [
                        styles.authPrimaryButton,
                        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={handleSignOut}
                    >
                      <Text style={styles.authPrimaryText}>Sign Out</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.authHeader}>
                    <View style={styles.howToIconCircle}>
                      <FontAwesome name="user-circle-o" size={36} color={palette.accent} />
                    </View>
                    <Text style={styles.howToTitle}>
                      {authMode === "signin" ? "Welcome back" : "Create account"}
                    </Text>
                    <Text style={styles.howToSubtitle}>
                      {authMode === "signin"
                        ? "Sign in to save your favorite finds"
                        : "Sign up to sync your finds across devices"}
                    </Text>
                  </View>

                  <View style={styles.authForm}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.googleButton,
                        (pressed || authLoading) && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={handleGoogleSignIn}
                      disabled={authLoading}
                    >
                      <FontAwesome name="google" size={18} color={palette.text} />
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </Pressable>

                    <View style={styles.authDivider}>
                      <View style={styles.authDividerLine} />
                      <Text style={styles.authDividerText}>or</Text>
                      <View style={styles.authDividerLine} />
                    </View>

                    <Text style={styles.authLabel}>Email</Text>
                    <TextInput
                      style={styles.authInput}
                      placeholder="you@example.com"
                      placeholderTextColor={palette.textFaint}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={authEmail}
                      onChangeText={setAuthEmail}
                      editable={!authLoading}
                    />

                    <Text style={styles.authLabel}>Password</Text>
                    <TextInput
                      style={styles.authInput}
                      placeholder="••••••••"
                      placeholderTextColor={palette.textFaint}
                      secureTextEntry={true}
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      editable={!authLoading}
                    />

                    <Pressable
                      style={({ pressed }) => [
                        styles.authPrimaryButton,
                        (pressed || authLoading) && {
                          opacity: 0.85,
                          transform: [{ scale: 0.98 }],
                        },
                      ]}
                      onPress={handleAuthSubmit}
                      disabled={authLoading}
                    >
                      {authLoading ? (
                        <ActivityIndicator color={palette.onAccent} />
                      ) : (
                        <Text style={styles.authPrimaryText}>
                          {authMode === "signin" ? "Sign In" : "Sign Up"}
                        </Text>
                      )}
                    </Pressable>

                    <Pressable
                      style={styles.authSwitch}
                      onPress={() => {
                        setAuthMode(authMode === "signin" ? "signup" : "signin");
                        setAuthPassword("");
                      }}
                    >
                      <Text style={styles.authSwitchText}>
                        {authMode === "signin"
                          ? "Don't have an account? "
                          : "Already have an account? "}
                        <Text style={styles.authSwitchLink}>
                          {authMode === "signin" ? "Sign up" : "Sign in"}
                        </Text>
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={styles.themeSection}>
                <Text style={styles.themeSectionLabel}>Appearance</Text>
                <View style={styles.themeToggleRow}>
                  {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
                    const active = themeMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        style={({ pressed }) => [
                          styles.themeToggleOption,
                          active && styles.themeToggleOptionActive,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => changeThemeMode(mode)}
                      >
                        <Text
                          style={[
                            styles.themeToggleLabel,
                            active && styles.themeToggleLabelActive,
                          ]}
                        >
                          {mode === "light"
                            ? "Light"
                            : mode === "dark"
                            ? "Dark"
                            : "System"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </ThemeContext.Provider>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  // ── Layout ──
  container: { backgroundColor: c.bg, flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // ── Top Bar ──
  topBar: {
    backgroundColor: c.topBar,
    paddingTop: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.accentBorder,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", minWidth: 62 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 16, minWidth: 62, justifyContent: "flex-end" },
  logoText: { color: c.accent, fontSize: 20, fontWeight: "700", letterSpacing: 0.5 },

  // ── Content Selector ──
  contentSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  contentButton: {
    width: "47%",
    backgroundColor: c.surfaceAlt,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  contentButtonActive: { backgroundColor: c.accentBgMed, borderColor: c.accent },
  contentButtonHover: { backgroundColor: c.surfaceAltStrong, borderColor: c.borderStrong },
  contentButtonText: { color: c.textSecondary, fontSize: 16, fontWeight: "600" },
  contentButtonTextActive: { color: c.text },

  // ── Action Selector ──
  actionSelector: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: c.surfaceAlt,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 50,
    borderWidth: 1,
    borderColor: c.border,
  },
  actionButtonActive: { backgroundColor: c.accentBgMed, borderColor: c.accent },
  actionButtonHover: { backgroundColor: c.surfaceAltStrong, borderColor: c.borderStrong },
  actionButtonText: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  actionButtonTextActive: { color: c.text },

  // ── Empty State ──
  emptyState: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyStateText: { color: c.textFaint, fontSize: 15, fontWeight: "500" },

  // ── Search ──
  searchState: { paddingHorizontal: 20, marginTop: 20, gap: 16 },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: c.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchIcon: { marginTop: 3, marginRight: 12 },
  searchInput: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    fontWeight: "400",
    minHeight: 24,
    textAlignVertical: "top",
  },
  searchButton: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  searchButtonText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },

  // ── Filter ──
  filterState: { paddingHorizontal: 16, paddingTop: 16 },
  clearFiltersText: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "right",
    marginBottom: 8,
  },
  filterSection: { marginBottom: 6 },
  filterSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: c.surfaceAlt,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterSectionTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  filterSectionCount: { color: c.accent, fontSize: 13, fontWeight: "400" },
  filterChipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  filterChip: {
    backgroundColor: c.surfaceAlt,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  filterChipActive: { backgroundColor: c.accentBgMed, borderColor: c.accent },
  filterChipText: { color: c.textMuted, fontSize: 13, fontWeight: "500" },
  filterChipTextActive: { color: c.text },

  // ── Randomize ──
  randomizeState: { alignItems: "center", marginTop: 50, gap: 16 },
  randomizeHint: { color: c.textFaint, fontSize: 14, fontWeight: "400" },
  randomizeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.accent,
    paddingVertical: 20,
    paddingHorizontal: 48,
    borderRadius: 50,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  randomizeButtonText: {
    color: c.onAccent,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Results ──
  resultsContainer: { paddingHorizontal: 16, paddingTop: 32 },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  resultsTitle: { color: c.text, fontSize: 20, fontWeight: "700" },
  clearResultsText: { color: c.accent, fontSize: 13, fontWeight: "500" },
  heroCard: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  gridCard: {
    backgroundColor: c.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    overflow: "hidden",
    width: CARD_WIDTH,
  },
  cardImagePlaceholder: {
    height: 100,
    backgroundColor: c.accentBgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImagePlaceholder: { height: 180 },
  cardImage: { width: "100%", height: "100%" },
  cardInfo: { padding: 14, gap: 4 },
  cardTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  heroCardTitle: { fontSize: 20, fontWeight: "700" },
  cardSubtitle: { color: c.textMuted, fontSize: 13, fontWeight: "400" },
  cardMeta: { color: c.accent, fontSize: 12, fontWeight: "500", marginTop: 2 },
  gridContainer: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  // ── Saved Modal ──
  savedSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    maxHeight: "85%",
    minHeight: "55%",
  },
  savedTitle: { color: c.text, fontSize: 22, fontWeight: "700", marginBottom: 16 },
  savedEmpty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  savedEmptyText: {
    color: c.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  savedList: { flex: 1 },
  savedSignInBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.accentBgMed,
    borderWidth: 1,
    borderColor: c.accentBorder,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  savedSignInText: { color: c.accent, fontSize: 13, fontWeight: "600" },
  savedGroup: { marginBottom: 20 },
  savedGroupLabel: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  savedItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  savedItemImage: { width: 48, height: 48, borderRadius: 6 },
  savedItemText: { flex: 1 },
  savedItemTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  savedItemSubtitle: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  savedRemove: { padding: 6 },

  // ── Recently Viewed ──
  recentsSection: { marginTop: 8, marginBottom: 16 },
  recentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  recentsTitle: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  recentsRow: { gap: 12, paddingRight: 16 },
  recentCard: { width: 92 },
  recentImage: {
    width: 92,
    height: 92,
    borderRadius: 10,
    marginBottom: 6,
  },
  recentCardTitle: {
    color: c.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },

  // ── Similar Items (in detail modal) ──
  similarSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  similarTitle: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  similarRow: { gap: 12, paddingRight: 16 },
  similarCard: { width: 100 },
  similarImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
    marginBottom: 6,
  },
  similarCardTitle: {
    color: c.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  similarCardSubtitle: {
    color: c.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // ── Detail Modal ──
  modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: c.border,
    borderBottomWidth: 0,
  },
  modalClose: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.pillDark,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGrabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.borderStrong,
    marginTop: 8,
    marginBottom: 4,
  },
  modalImagePlaceholder: {
    height: 160,
    backgroundColor: c.accentBgSoft,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  heroMovie: { width: "100%", height: 220, position: "relative", overflow: "hidden" },
  heroMovieImage: { width: "100%", height: "100%" },
  heroMoviePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: c.accentBgSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroMovieGradient: { position: "absolute", left: 0, right: 0, bottom: 0, height: 120 },
  heroCentered: { alignItems: "center", paddingTop: 24, paddingBottom: 8 },
  heroSquareWrap: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: c.accentBgSoft,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  heroBookWrap: {
    width: 160,
    height: 240,
    borderRadius: 10,
    backgroundColor: c.accentBgSoft,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  heroEmptyWrap: { alignItems: "center", justifyContent: "center" },
  modalTitle: {
    color: c.text,
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  modalDetails: { paddingHorizontal: 20, gap: 8 },
  modalMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  modalMetaPill: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    backgroundColor: c.surfaceAltStrong,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    overflow: "hidden",
  },
  modalSubtitle: { color: c.accent, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  modalLabel: {
    color: c.textFaint,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 8,
  },
  modalValue: { color: c.text, fontSize: 15, fontWeight: "500" },
  modalDescription: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22,
  },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  trackNumber: {
    color: c.textFaint,
    fontSize: 13,
    fontWeight: "600",
    width: 20,
    textAlign: "right",
  },
  trackName: { color: c.textSecondary, fontSize: 14, fontWeight: "500", flex: 1 },
  trackYear: { color: c.textMuted, fontSize: 13, fontWeight: "600", marginLeft: 8 },
  saveButtonActive: { backgroundColor: c.accentDeep },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
  detailActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 28,
    marginBottom: 20,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
  },
  shareButtonText: { color: c.text, fontSize: 15, fontWeight: "600" },

  // ── External Links ──
  externalLinks: { paddingHorizontal: 20, marginTop: 16 },
  linkRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  linkButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  linkButtonText: { color: c.text, fontSize: 13, fontWeight: "600" },
  linkSpotify: {
    backgroundColor: "rgba(30,215,96,0.15)",
    borderColor: "rgba(30,215,96,0.3)",
  },
  linkAppleMusic: {
    backgroundColor: "rgba(252,60,68,0.15)",
    borderColor: "rgba(252,60,68,0.3)",
  },
  linkJustWatch: {
    backgroundColor: "rgba(253,209,0,0.12)",
    borderColor: "rgba(253,209,0,0.25)",
  },
  linkTMDB: {
    backgroundColor: "rgba(1,180,228,0.15)",
    borderColor: "rgba(1,180,228,0.3)",
  },
  linkAmazon: {
    backgroundColor: "rgba(255,153,0,0.15)",
    borderColor: "rgba(255,153,0,0.3)",
  },
  linkGoodreads: {
    backgroundColor: "rgba(135,113,90,0.2)",
    borderColor: "rgba(135,113,90,0.35)",
  },

  // ── How To Use / Account Modals ──
  howToHeader: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  authHeader: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  howToIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.accentBgMed,
    borderWidth: 1,
    borderColor: c.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  howToTitle: {
    color: c.text,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  howToSubtitle: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: "400",
    textAlign: "center",
  },
  stepsContainer: { paddingHorizontal: 20, gap: 20, paddingBottom: 24 },
  stepRow: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: c.surfaceAlt,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.accentBgMed,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: c.accent, fontSize: 14, fontWeight: "700" },
  stepContent: { flex: 1, gap: 4 },
  stepTitle: { color: c.text, fontSize: 16, fontWeight: "600" },
  stepDescription: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
  stepBold: { color: c.accent, fontWeight: "600" },
  howToFooter: { paddingHorizontal: 20, paddingVertical: 20, alignItems: "center" },
  howToFooterText: {
    color: c.textFaint,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Auth ──
  authForm: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  authLabel: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  authInput: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: c.text,
    fontSize: 15,
  },
  authPrimaryButton: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  authPrimaryText: { color: c.onAccent, fontSize: 15, fontWeight: "600" },
  authDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  authDividerLine: { flex: 1, height: 1, backgroundColor: c.border },
  authDividerText: { color: c.textFaint, fontSize: 12, fontWeight: "500" },
  authSocialRow: { flexDirection: "row", justifyContent: "center", gap: 12 },
  authSocialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  nameInput: {
    flex: 1,
    marginBottom: 0,
  },
  nameSaveButton: {
    backgroundColor: c.accent,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 68,
  },
  nameSaveText: { color: c.onAccent, fontSize: 14, fontWeight: "600" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    borderRadius: 12,
  },
  googleButtonText: { color: c.text, fontSize: 15, fontWeight: "600" },
  authSwitch: { marginTop: 28, alignItems: "center" },
  authSwitchText: { color: c.textMuted, fontSize: 14 },
  authSwitchLink: { color: c.accent, fontWeight: "600" },

  // ── Theme toggle ──
  themeSection: {
    marginTop: 28,
    paddingHorizontal: 4,
  },
  themeSectionLabel: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  themeToggleRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
  },
  themeToggleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  themeToggleOptionActive: {
    backgroundColor: c.accent,
  },
  themeToggleLabel: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  themeToggleLabelActive: {
    color: c.onAccent,
  },
});
