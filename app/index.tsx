import AntDesign from "@expo/vector-icons/AntDesign";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  TextInput,
} from "react-native";
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from "react-native-safe-area-context";
import type {
  ContentCategory,
  ResultItem,
} from "../types/content";
import {
  listSaved,
  syncLocalToCloud,
  clearLocalSaved,
  type SavedItem,
} from "../lib/storage/saved";
import {
  removeSavedItem,
  runSavedMutation,
  SAVED_MUTATION_ERROR,
  toggleSavedItem,
} from "../lib/storage/savedMutations";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/auth-js";
import { signInWithGoogle } from "../lib/auth/oauth";
import { Palette, ThemeMode, setThemeMode } from "../lib/theme";
import { useAppTheme } from "../components/useAppTheme";
import { getCategoryTheme } from "../lib/discovery/categoryThemes";
import { CategoryPicker } from "../components/discovery/CategoryPicker";
// @ts-expect-error Expo resolves the platform-specific .native/.web module.
import DiscoveryAnnouncer from "../components/discovery/DiscoveryAnnouncer";
import { DiscoveryControls } from "../components/discovery/DiscoveryControls";
import {
  DetailSheet,
  type DetailSelection,
} from "../components/discovery/DetailSheet";
import { DiscoveryStatusCard } from "../components/discovery/DiscoveryStatusCard";
import {
  SwipeDeck,
  type SwipeDeckHandle,
} from "../components/discovery/SwipeDeck";
import { UndoNotice } from "../components/discovery/UndoNotice";
import { useDiscoveryController } from "../components/discovery/useDiscoveryController";
import { useReducedMotion } from "../components/discovery/useReducedMotion";
import {
  loadDetail,
  toDetailError,
  type ContentDetail,
} from "../lib/discovery/loadDetail";
import { SIMILAR_TIER_LABELS } from "../lib/discovery/similarTiers";
import { SAVE_INTENT_LABELS } from "../lib/discovery/saveIntent";
import { thumbnailUrl } from "../lib/api/imageSizes";
import { displayFont, monoFont } from "../lib/typography";

/** The deck's copy reads better in the singular: "the next movie", not "movies". */
function singularFor(category: ContentCategory): string {
  return getCategoryTheme(category).singular;
}

export default function HomeScreen() {
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [detailSavedMutationError, setDetailSavedMutationError] = useState<
    string | null
  >(null);
  const [savedSheetMutationError, setSavedSheetMutationError] = useState<
    string | null
  >(null);
  const [accountSavedMutationError, setAccountSavedMutationError] = useState<
    string | null
  >(null);
  // Declared ahead of the controller so saves can record the owner that made
  // them; Undo refuses to run once the account changes.
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const discoveryController = useDiscoveryController({
    onSavedItemsChange: setSavedItems,
    ownerId: authSession?.user.id ?? null,
  });
  const {
    state: discovery,
    session,
    activeItem,
    announcement,
  } = discoveryController;
  const selected = discovery.selected;
  const reducedMotion = useReducedMotion();
  const [categoryPickerExpanded, setCategoryPickerExpanded] = useState(true);
  const [detailSelection, setDetailSelection] = useState<DetailSelection | null>(null);
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
  const [detailRetryKey, setDetailRetryKey] = useState(0);
  const deckRef = useRef<SwipeDeckHandle>(null);
  const detailFocusGenerationRef = useRef(0);
  const detailRequestSequenceRef = useRef(0);
  const detailSavedMutationSequenceRef = useRef(0);
  const savedSheetMutationSequenceRef = useRef(0);
  const accountSavedMutationSequenceRef = useRef(0);
  const detailSelectionRef = useRef<DetailSelection | null>(null);
  detailSelectionRef.current = detailSelection;
  const [howToOpen, setHowToOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const { mode: themeMode, palette } = useAppTheme();
  // Insets rather than a hardcoded 54/40: the status bar is 20pt on a phone
  // without a notch and 59pt on one with, and the home indicator only exists on
  // some devices. The old constants were right on exactly one handset.
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(palette, insets), [palette, insets]);

  const changeThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  const openAccount = () => {
    accountSavedMutationSequenceRef.current += 1;
    setAccountSavedMutationError(null);
    setAccountOpen(true);
  };

  const closeAccount = () => {
    accountSavedMutationSequenceRef.current += 1;
    setAccountSavedMutationError(null);
    setAccountOpen(false);
  };

  useEffect(() => {
    runSavedMutation(() => listSaved()).then(setSavedItems).catch(() => {});
    listRecents().then(setRecentItems).catch(() => {});
  }, []);

  useEffect(() => {
    if (!detailSelection) return;
    addRecent(detailSelection.category, detailSelection.item)
      .then(setRecentItems)
      .catch(() => {});
  }, [detailSelection?.category, detailSelection?.item.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      if (data.session) {
        runSavedMutation(() => listSaved()).then(setSavedItems).catch(() => {});
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, s) => {
      setAuthSession(s);
      if (event === "SIGNED_IN" && s) {
        await applySavedMutation(
          () =>
            runSavedMutation(async () => {
              await syncLocalToCloud();
              return listSaved();
            }),
          "account"
        );
      }
      if (event === "SIGNED_OUT") {
        await applySavedMutation(
          () =>
            runSavedMutation(async () => {
              await clearLocalSaved();
              return [];
            }),
          "account"
        );
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
    } catch {
      Alert.alert(
        authMode === "signin" ? "Couldn't sign in" : "Couldn't create account",
        "Check your details and try again."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const currentDisplayName = (): string => {
    const meta = authSession?.user?.user_metadata ?? {};
    return meta.display_name ?? meta.full_name ?? meta.name ?? "";
  };

  useEffect(() => {
    setDisplayNameDraft(currentDisplayName());
  }, [authSession?.user?.id, authSession?.user?.user_metadata]);

  const saveDisplayName = async () => {
    const next = displayNameDraft.trim();
    if (!next || next === currentDisplayName()) return;
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: next } });
      if (error) throw error;
    } catch {
      Alert.alert("Couldn't save name", "Try again in a moment.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSignOut = async () => {
    setAccountOpen(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        await supabase.auth.signOut({ scope: "local" });
      }
    } catch (error: unknown) {
      console.warn({
        action: "signOut",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
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
        Alert.alert("Google sign-in failed", "Try again in a moment.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const isItemSaved = (category: ContentCategory, item: ResultItem): boolean => {
    return savedItems.some((saved) => saved.category === category && saved.id === item.id);
  };

  const applySavedMutation = async (
    mutation: () => Promise<SavedItem[]>,
    scope: "detail" | "savedSheet" | "account"
  ): Promise<boolean> => {
    const sequenceRef =
      scope === "detail"
        ? detailSavedMutationSequenceRef
        : scope === "savedSheet"
        ? savedSheetMutationSequenceRef
        : accountSavedMutationSequenceRef;
    const setError =
      scope === "detail"
        ? setDetailSavedMutationError
        : scope === "savedSheet"
        ? setSavedSheetMutationError
        : setAccountSavedMutationError;
    const operationId = ++sequenceRef.current;
    setError(null);
    try {
      setSavedItems(await mutation());
      if (sequenceRef.current === operationId) setError(null);
      return true;
    } catch {
      if (sequenceRef.current === operationId) {
        setError(SAVED_MUTATION_ERROR);
        if (scope === "account") setAccountOpen(true);
      }
      return false;
    }
  };

  const clearDetail = () => {
    detailSavedMutationSequenceRef.current += 1;
    setDetailSavedMutationError(null);
    detailSelectionRef.current = null;
    setDetailSelection(null);
    setDetail(null);
    setDetailLoading(false);
    setDetailErrorMessage(null);
  };

  const invalidateDetailFocusRestoration = () => {
    detailFocusGenerationRef.current += 1;
  };

  const focusActiveCardAfterDismissal = (generation: number) => {
    setTimeout(() => {
      if (
        detailFocusGenerationRef.current !== generation ||
        detailSelectionRef.current !== null
      ) {
        return;
      }
      deckRef.current?.focusActiveCard();
    }, 0);
  };

  const openDetail = (selection: DetailSelection) => {
    invalidateDetailFocusRestoration();
    detailSavedMutationSequenceRef.current += 1;
    setDetailSavedMutationError(null);
    detailSelectionRef.current = selection;
    setDetailRetryKey(0);
    setDetailSelection(selection);
  };

  const shareDetail = async (category: ContentCategory, item: ResultItem) => {
    const kind =
      category === "movies"
        ? "movie"
        : category === "books"
        ? "book"
        : category === "albums"
        ? "album"
        : "artist";
    let sourceUrl: string | null = null;
    if (category === "movies") {
      sourceUrl = `https://www.themoviedb.org/movie/${item.id}`;
    } else if (category === "books") {
      sourceUrl = `https://openlibrary.org/works/${item.id}`;
    } else if (category === "artists") {
      sourceUrl = `https://open.spotify.com/search/${encodeURIComponent(item.title)}`;
    } else if (category === "albums") {
      const query = `${item.title} ${item.subtitle ?? ""}`.trim();
      sourceUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    }
    const lines = [
      `Check out this ${kind} I found on GoDiscover:`,
      "",
      `${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`,
    ];
    if (item.meta) lines.push(item.meta);
    if (sourceUrl) lines.push("", sourceUrl);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {}
  };

  const closeDetail = () => {
    const restoreDeckFocus = detailSelectionRef.current?.origin === "deck";
    const focusGeneration = detailFocusGenerationRef.current;
    clearDetail();
    if (restoreDeckFocus) focusActiveCardAfterDismissal(focusGeneration);
  };

  const handleDetailSave = async (item: ResultItem) => {
    const selection = detailSelectionRef.current;
    if (!selection || selection.item.id !== item.id) return;

    if (selection.origin === "stored") {
      await applySavedMutation(
        () => toggleSavedItem(selection.category, item),
        "detail"
      );
      return;
    }

    const focusGeneration = detailFocusGenerationRef.current;
    clearDetail();
    await discoveryController.commit(item, "save");
    focusActiveCardAfterDismissal(focusGeneration);
  };

  const handleDetailSkip = async (item: ResultItem) => {
    const selection = detailSelectionRef.current;
    if (!selection || selection.origin !== "deck" || selection.item.id !== item.id) {
      return;
    }

    const focusGeneration = detailFocusGenerationRef.current;
    clearDetail();
    await discoveryController.commit(item, "skip");
    focusActiveCardAfterDismissal(focusGeneration);
  };

  const handleDetailSimilar = async (item: ResultItem) => {
    const selection = detailSelectionRef.current;
    if (!selection || selection.item.id !== item.id) return;

    const focusGeneration = detailFocusGenerationRef.current;
    clearDetail();
    await discoveryController.similar(item);
    focusActiveCardAfterDismissal(focusGeneration);
  };

  const handleCategorySelect = (category: ContentCategory) => {
    invalidateDetailFocusRestoration();
    if (!categoryPickerExpanded && category === selected) {
      setCategoryPickerExpanded(true);
      return;
    }
    discoveryController.selectCategory(category);
    setCategoryPickerExpanded(false);
    clearDetail();
  };

  const openStoredItem = (category: ContentCategory, item: ResultItem) => {
    discoveryController.selectCategory(category);
    openDetail({ category, item, origin: "stored" });
  };

  const openSavedSheet = () => {
    savedSheetMutationSequenceRef.current += 1;
    setSavedSheetMutationError(null);
    setSavedOpen(true);
  };

  const closeSavedSheet = () => {
    savedSheetMutationSequenceRef.current += 1;
    setSavedSheetMutationError(null);
    setSavedOpen(false);
  };

  useEffect(() => {
    const selection = detailSelection;
    if (!selection) return;

    const requestSequence = ++detailRequestSequenceRef.current;
    const { category, item } = selection;
    setDetailLoading(true);
    setDetailErrorMessage(null);
    setDetail(null);

    const isCurrentSelection = () => {
      const current = detailSelectionRef.current;
      return (
        detailRequestSequenceRef.current === requestSequence &&
        current?.category === category &&
        current.item.id === item.id
      );
    };

    void loadDetail(category, item)
      .then((nextDetail) => {
        if (isCurrentSelection()) setDetail(nextDetail);
      })
      .catch((error: unknown) => {
        if (!isCurrentSelection()) return;
        console.warn({
          category,
          itemId: item.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        setDetailErrorMessage(toDetailError());
      })
      .finally(() => {
        if (isCurrentSelection()) setDetailLoading(false);
      });

    return () => {
      if (detailRequestSequenceRef.current === requestSequence) {
        detailRequestSequenceRef.current += 1;
      }
    };
  }, [detailSelection?.category, detailSelection?.item.id, detailRetryKey]);

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar} testID="top-bar">
        <View style={styles.topBarLeft}>
          <Pressable
            accessibilityLabel="Open account"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.topBarAction,
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => {
              invalidateDetailFocusRestoration();
              openAccount();
            }}
          >
            <FontAwesome
              accessible={false}
              name={authSession ? "user-circle" : "user-circle-o"}
              size={26}
              color={palette.accent}
            />
          </Pressable>
        </View>
        <Text style={styles.logoText}>GoDiscover</Text>
        <View style={styles.topBarRight}>
          <Pressable
            accessibilityLabel="Open saved discoveries"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.topBarAction,
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => {
              invalidateDetailFocusRestoration();
              openSavedSheet();
            }}
          >
            <FontAwesome
              accessible={false}
              name={savedItems.length > 0 ? "bookmark" : "bookmark-o"}
              size={22}
              color={savedItems.length > 0 ? palette.accent : palette.borderStrong}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="How to use GoDiscover"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.topBarAction,
              pressed && { opacity: 0.6 },
            ]}
            onPress={() => {
              invalidateDetailFocusRestoration();
              setHowToOpen(true);
            }}
          >
            <FontAwesome
              accessible={false}
              name="question-circle-o"
              size={24}
              color={palette.textMuted}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="discovery-scroll"
      >
        <View style={styles.discoveryContent}>
          <CategoryPicker
            selected={selected}
            compact={Boolean(selected) && !categoryPickerExpanded}
            palette={palette}
            onSelect={handleCategorySelect}
          />

          {categoryPickerExpanded &&
          recentItems.length > 0 &&
          (!session ||
            (session.deck.queue.length === 0 &&
              session.activeRequest === null)) ? (
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
                    accessibilityLabel={`Open ${item.title} details`}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.recentCard,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => openStoredItem(item.category, item)}
                  >
                    {item.imageUrl ? (
                      <Image
                        accessible={false}
                        source={{ uri: thumbnailUrl(item.imageUrl) }}
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
          ) : null}

          {selected && session ? (
            <DiscoveryControls
              category={selected}
              activeAction={session.activeAction}
              query={session.searchQuery}
              filters={session.selectedFilters}
              openSection={session.openSection}
              loading={session.status === "loading"}
              palette={palette}
              onActionChange={discoveryController.setAction}
              onQueryChange={discoveryController.setQuery}
              onToggleFilter={discoveryController.toggleFilter}
              onOpenSection={discoveryController.setOpenSection}
              onClearFilters={discoveryController.clearFilters}
              onSubmit={discoveryController.submit}
            />
          ) : null}

          {session?.deck.similarContext ? (
            <View style={styles.similarContext}>
              <Text style={styles.similarContextText}>
                {/* Naming the rung keeps the label honest once the ladder has
                    widened, instead of calling a distant pick "similar". */}
                {session.deck.similarContext.tier
                  ? SIMILAR_TIER_LABELS[session.deck.similarContext.tier]
                  : "Similar"}{" "}
                to {session.deck.similarContext.sourceTitle}
              </Text>
              <Pressable
                accessibilityLabel="Back to unbiased Surprise Me"
                accessibilityRole="button"
                onPress={() => void discoveryController.submit("randomize")}
                style={({ pressed }) => [
                  styles.backToUnbiasedButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.backToUnbiasedText}>
                  Back to unbiased Surprise Me
                </Text>
              </Pressable>
            </View>
          ) : null}

          {selected && session?.status === "loading" ? (
            <DiscoveryStatusCard
              kind="loading"
              label={`Finding your ${selected}...`}
              palette={palette}
              reducedMotion={reducedMotion}
            />
          ) : null}

          {session?.status === "error" ? (
            <DiscoveryStatusCard
              kind="error"
              message={
                session.requestError ??
                "Something went wrong while finding recommendations."
              }
              onRetry={() => void discoveryController.retry()}
              palette={palette}
            />
          ) : null}

          {/* The deck refills in the background once it drops to two cards. If
              the last card is committed before that lands, the queue is empty
              while the status is still "ready" — which matched none of the
              states below and left the screen blank. */}
          {selected &&
          session &&
          session.deck.queue.length === 0 &&
          session.deck.toppingUp ? (
            <DiscoveryStatusCard
              kind="loading"
              label={`Lining up the next ${singularFor(selected)}...`}
              palette={palette}
              reducedMotion={reducedMotion}
            />
          ) : null}

          {/* A top-up that came back with nothing new. Distinct from "empty":
              there is no point retrying the same path, so point elsewhere. */}
          {selected &&
          session &&
          session.deck.queue.length === 0 &&
          discoveryController.deckExhausted ? (
            <DiscoveryStatusCard
              kind="exhausted"
              label={`You've seen every ${singularFor(selected)} we can find down this path.`}
              hint="Try another category, or loosen your filters."
              actionLabel="Start something new"
              onAction={() => void discoveryController.submit("randomize")}
              palette={palette}
            />
          ) : null}

          {session?.status === "empty" && !activeItem ? (
            <DiscoveryStatusCard
              kind="empty"
              label={`No ${selected} found. Try another approach.`}
              actionLabel={
                session.retryInput?.mode === "search" ||
                session.retryInput?.mode === "filter"
                  ? "Adjust search or filters"
                  : "Shuffle again"
              }
              onAction={() => {
                const mode = session.retryInput?.mode;
                if (mode === "search" || mode === "filter") {
                  discoveryController.setAction(mode);
                  return;
                }
                void discoveryController.submit("randomize");
              }}
              palette={palette}
            />
          ) : null}

          {selected && session && session.deck.queue.length > 0 ? (
            <SwipeDeck
              ref={deckRef}
              category={selected}
              items={session.deck.queue}
              palette={palette}
              reducedMotion={reducedMotion}
              disabled={session.status === "loading"}
              onCommit={(item, decision) =>
                void discoveryController.commit(item, decision)
              }
              onOpenDetail={(item) =>
                openDetail({ category: selected, item, origin: "deck" })
              }
              onSimilar={(item) => void discoveryController.similar(item)}
            />
          ) : null}

          {/* One notice serves both outcomes. A save offers a direction to go
              next; a skip offers the way back, which previously did not exist. */}
          <UndoNotice
            message={
              discovery.actionError ??
              (discovery.lastSave
                ? `Saved ${discovery.lastSave.item.title}`
                : discovery.lastSkip
                ? `Not for me: ${discovery.lastSkip.item.title}`
                : null)
            }
            canUndo={Boolean(
              (discovery.lastSave || discovery.lastSkip) &&
                discovery.actionError === null
            )}
            actions={
              discovery.lastSave && discovery.actionError === null
                ? (["more-like-this", "something-different"] as const).map(
                    (intent) => ({
                      label: SAVE_INTENT_LABELS[intent],
                      onPress: () =>
                        void discoveryController.followSave(
                          discovery.lastSave!.item,
                          intent
                        ),
                    })
                  )
                : undefined
            }
            palette={palette}
            onUndo={() =>
              void (discovery.lastSave
                ? discoveryController.undo()
                : discoveryController.undoSkip())
            }
          />
          <DiscoveryAnnouncer
            message={announcement}
            actionErrorMessage={discoveryController.actionErrorAnnouncement}
          />
          <DiscoveryAnnouncer
            message={null}
            actionErrorMessage={
              accountOpen
                ? accountSavedMutationError
                : detailSelection
                ? detailSavedMutationError
                : savedOpen
                ? savedSheetMutationError
                : null
            }
          />
        </View>
      </ScrollView>

      <DetailSheet
        visible={Boolean(detailSelection)}
        selection={detailSelection}
        detail={detail}
        loading={detailLoading}
        errorMessage={detailErrorMessage}
        savedMutationErrorMessage={detailSavedMutationError}
        saved={
          detailSelection?.origin === "stored"
            ? isItemSaved(detailSelection.category, detailSelection.item)
            : false
        }
        palette={palette}
        reducedMotion={reducedMotion}
        onClose={closeDetail}
        onRetry={() => setDetailRetryKey((key) => key + 1)}
        onSave={(item) => void handleDetailSave(item)}
        onSkip={(item) => void handleDetailSkip(item)}
        onSimilar={(item) => void handleDetailSimilar(item)}
        onShare={(item) => {
          const selection = detailSelectionRef.current;
          if (selection && selection.item.id === item.id) {
            void shareDetail(selection.category, item);
          }
        }}
      />

      {/* How To Use Modal */}
      <Modal
        visible={howToOpen}
        animationType={reducedMotion ? "none" : "slide"}
        transparent={true}
        onRequestClose={() => setHowToOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            accessibilityLabel="How to use GoDiscover"
            accessibilityViewIsModal
            aria-modal
            onAccessibilityEscape={() => setHowToOpen(false)}
            role="dialog"
            style={styles.modalContent}
          >
            <Pressable
              accessibilityLabel="Close How to use"
              accessibilityRole="button"
              style={styles.modalClose}
              onPress={() => setHowToOpen(false)}
            >
              <AntDesign
                accessible={false}
                name="close"
                size={20}
                color={palette.textMuted}
              />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.howToHeader}>
                <View style={styles.howToIconCircle}>
                  <FontAwesome
                    accessible={false}
                    name="compass"
                    size={36}
                    color={palette.accent}
                  />
                </View>
                <Text style={styles.howToTitle}>How to use GoDiscover</Text>
                <Text style={styles.howToSubtitle}>
                  Four simple steps to find your next spark
                </Text>
              </View>

              <View style={styles.stepsContainer}>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Choose your category</Text>
                    <Text style={styles.stepDescription}>
                      Movies, Books, Artists, or Albums each has its own vibe.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Let it surprise you</Text>
                    <Text style={styles.stepDescription}>
                      Surprise Me stays random; Search and Filter are optional.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Make your move</Text>
                    <Text style={styles.stepDescription}>
                      Swipe right to Save or left for Not for me. The labeled buttons
                      do the same thing.
                    </Text>
                  </View>
                </View>

                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>4</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>Follow a spark</Text>
                    <Text style={styles.stepDescription}>
                      Similar makes a temporary related deck only when you ask for it.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.howToFooter}>
                <Text style={styles.howToFooterText}>
                  Your saves and skips never train Surprise Me.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Saved Modal */}
      <Modal
        visible={savedOpen}
        animationType={reducedMotion ? "none" : "slide"}
        transparent={true}
        onRequestClose={closeSavedSheet}
      >
        <View style={styles.modalOverlay}>
          <View
            accessibilityLabel="Saved discoveries"
            accessibilityViewIsModal
            aria-modal
            onAccessibilityEscape={closeSavedSheet}
            role="dialog"
            style={styles.savedSheet}
          >
            <Pressable
              accessibilityLabel="Close saved discoveries"
              accessibilityRole="button"
              style={styles.modalClose}
              onPress={closeSavedSheet}
            >
              <AntDesign
                accessible={false}
                name="close"
                size={20}
                color={palette.onAccent}
              />
            </Pressable>
            <Text style={styles.savedTitle}>Saved</Text>
            {savedSheetMutationError ? (
              <Text
                accessibilityLabel={savedSheetMutationError}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
                style={styles.savedMutationError}
              >
                {savedSheetMutationError}
              </Text>
            ) : null}
            {!authSession && (
              <Pressable
                accessibilityLabel="Sign in to sync saved discoveries"
                accessibilityRole="button"
                onPress={() => {
                  closeSavedSheet();
                  openAccount();
                }}
                style={({ pressed }) => [
                  styles.savedSignInBanner,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <FontAwesome
                  accessible={false}
                  name="cloud"
                  size={14}
                  color={palette.accent}
                />
                <Text style={styles.savedSignInText}>
                  Sign in to sync across devices
                </Text>
              </Pressable>
            )}
            {savedItems.length === 0 ? (
              <View style={styles.savedEmpty}>
                <FontAwesome
                  accessible={false}
                  name="bookmark-o"
                  size={36}
                  color={palette.textFaint}
                />
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
                          <View
                            key={`${item.category}:${item.id}`}
                            style={styles.savedItem}
                          >
                            <Pressable
                              accessibilityLabel={`Open ${item.title} details`}
                              accessibilityRole="button"
                              style={({ pressed }) => [
                                styles.savedItemOpen,
                                pressed && { opacity: 0.7 },
                              ]}
                              onPress={() => {
                                openStoredItem(item.category, item);
                                closeSavedSheet();
                              }}
                            >
                              {item.imageUrl ? (
                                <Image
                                  accessible={false}
                                  source={{ uri: thumbnailUrl(item.imageUrl) }}
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
                            </Pressable>
                            <Pressable
                              accessibilityLabel={`Remove ${item.title} from saved discoveries`}
                              accessibilityRole="button"
                              hitSlop={10}
                              onPress={async () => {
                                await applySavedMutation(
                                  () => removeSavedItem(item.category, item.id),
                                  "savedSheet"
                                );
                              }}
                              style={({ pressed }) => [
                                styles.savedRemove,
                                pressed && { opacity: 0.6 },
                              ]}
                            >
                              <AntDesign
                                accessible={false}
                                name="close"
                                size={16}
                                color={palette.textMuted}
                              />
                            </Pressable>
                          </View>
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
        animationType={reducedMotion ? "none" : "slide"}
        transparent={true}
        onRequestClose={closeAccount}
      >
        <View style={styles.modalOverlay}>
          <View
            accessibilityLabel="Account"
            accessibilityViewIsModal
            aria-modal
            onAccessibilityEscape={closeAccount}
            role="dialog"
            style={styles.modalContent}
          >
            <Pressable
              accessibilityLabel="Close account"
              accessibilityRole="button"
              style={styles.modalClose}
              onPress={closeAccount}
            >
              <AntDesign
                accessible={false}
                name="close"
                size={20}
                color={palette.textMuted}
              />
            </Pressable>
            <ScrollView showsVerticalScrollIndicator={false}>
              {accountSavedMutationError ? (
                <Text
                  accessibilityLabel={accountSavedMutationError}
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={styles.savedMutationError}
                >
                  {accountSavedMutationError}
                </Text>
              ) : null}
              {authSession ? (
                <>
                  <View style={styles.authHeader}>
                    <View style={styles.howToIconCircle}>
                      <FontAwesome
                        accessible={false}
                        name="user-circle"
                        size={36}
                        color={palette.accent}
                      />
                    </View>
                    <Text style={styles.howToTitle}>
                      {currentDisplayName() || "Signed in"}
                    </Text>
                    <Text style={styles.howToSubtitle}>
                      {authSession.user.email}
                    </Text>
                  </View>
                  <View style={styles.authForm}>
                    <Text style={styles.authLabel}>Display name</Text>
                    <View style={styles.nameRow}>
                      <TextInput
                        accessibilityLabel="Display name"
                        accessibilityState={{ disabled: savingName }}
                        style={[styles.authInput, styles.nameInput]}
                        placeholder="Your name"
                        placeholderTextColor={palette.textFaint}
                        value={displayNameDraft}
                        onChangeText={setDisplayNameDraft}
                        editable={!savingName}
                        autoCapitalize="words"
                      />
                      <Pressable
                        accessibilityLabel="Save display name"
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled:
                            savingName ||
                            !displayNameDraft.trim() ||
                            displayNameDraft.trim() === currentDisplayName(),
                        }}
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
                      accessibilityLabel="Sign out"
                      accessibilityRole="button"
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
                      <FontAwesome
                        accessible={false}
                        name="user-circle-o"
                        size={36}
                        color={palette.accent}
                      />
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
                      accessibilityLabel="Continue with Google"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: authLoading }}
                      style={({ pressed }) => [
                        styles.googleButton,
                        (pressed || authLoading) && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                      ]}
                      onPress={handleGoogleSignIn}
                      disabled={authLoading}
                    >
                      <FontAwesome
                        accessible={false}
                        name="google"
                        size={18}
                        color={palette.text}
                      />
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </Pressable>

                    <View style={styles.authDivider}>
                      <View style={styles.authDividerLine} />
                      <Text style={styles.authDividerText}>or</Text>
                      <View style={styles.authDividerLine} />
                    </View>

                    <Text style={styles.authLabel}>Email</Text>
                    <TextInput
                      accessibilityLabel="Email"
                      accessibilityState={{ disabled: authLoading }}
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
                      accessibilityLabel="Password"
                      accessibilityState={{ disabled: authLoading }}
                      style={styles.authInput}
                      placeholder="••••••••"
                      placeholderTextColor={palette.textFaint}
                      secureTextEntry={true}
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      editable={!authLoading}
                    />

                    <Pressable
                      accessibilityLabel={authMode === "signin" ? "Sign in" : "Sign up"}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: authLoading }}
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
                      accessibilityLabel={
                        authMode === "signin"
                          ? "Create an account"
                          : "Sign in to your account"
                      }
                      accessibilityRole="button"
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
                        accessibilityLabel={`Use ${mode} theme`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
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
  );
}

const makeStyles = (c: Palette, insets: EdgeInsets) => StyleSheet.create({
  // ── Layout ──
  container: { backgroundColor: c.bg, flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 + insets.bottom },

  // ── Top Bar ──
  topBar: {
    backgroundColor: c.topBar,
    paddingTop: insets.top + 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.accentBorder,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", minWidth: 88 },
  topBarRight: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
    minWidth: 88,
  },
  topBarAction: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  logoText: { color: c.accent, fontFamily: monoFont, fontSize: 16, fontWeight: "700", letterSpacing: 1.4 },

  // ── Discovery ──
  discoveryContent: {
    alignSelf: "center",
    gap: 20,
    maxWidth: 992,
    paddingHorizontal: 16,
    paddingTop: 20,
    width: "100%",
  },
  similarContext: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: c.accentBgSoft,
    borderColor: c.accentBorder,
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
  similarContextText: {
    color: c.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
  },
  backToUnbiasedButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  backToUnbiasedText: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
  },

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
  savedTitle: { color: c.text, fontFamily: displayFont, fontSize: 26, fontWeight: "900", marginBottom: 16 },
  savedMutationError: {
    backgroundColor: c.surfaceAlt,
    borderColor: c.danger,
    borderRadius: 12,
    borderWidth: 1,
    color: c.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    padding: 12,
  },
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
    minHeight: 44,
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
  savedItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
  },
  savedItemOpen: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingVertical: 10,
  },
  savedItemImage: { width: 48, height: 48, borderRadius: 6 },
  savedItemText: { flex: 1 },
  savedItemTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
  savedItemSubtitle: { color: c.textMuted, fontSize: 13, marginTop: 2 },
  savedRemove: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },

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
  recentCard: { minHeight: 44, minWidth: 44, width: 92 },
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


  // ── Shared Overlay Modals ──
  modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: 24 + insets.bottom,
    borderWidth: 1,
    borderColor: c.border,
    borderBottomWidth: 0,
  },
  modalClose: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.pillDark,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 48,
  },
  authPrimaryButton: {
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    minHeight: 44,
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
    minHeight: 44,
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
    minHeight: 44,
  },
  googleButtonText: { color: c.text, fontSize: 15, fontWeight: "600" },
  authSwitch: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    minHeight: 44,
  },
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
    justifyContent: "center",
    minHeight: 44,
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
