import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { Session } from "@supabase/auth-js";

import { WebShell, ArchiveAtlas, WebDetailPanel, WebDiscoveryStage, resolveWebLayout, webPalette, type WebSection } from "../components/web/WebHomeScreen";
import { SavedList } from "../components/saved/SavedList";
import { useDiscoveryController } from "../components/discovery/useDiscoveryController";
import { useReducedMotion } from "../components/discovery/useReducedMotion";
import { useClientOnlyValue } from "../components/useClientOnlyValue";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { listSavedForOwner, type SavedItem } from "../lib/storage/saved";
import { removeSavedItem, runSavedMutation, savedMutationsForOwner, saveSavedItem, toggleSavedItem } from "../lib/storage/savedMutations";
import { loadDetail, type ContentDetail } from "../lib/discovery/loadDetail";
import {
  DEFAULT_SAVE_INTENT,
  SAVE_INTENT_LABELS,
  type SaveIntent,
} from "../lib/discovery/saveIntent";
import type { ContentCategory, ResultItem } from "../types/content";
import { supabase } from "../lib/supabase";
import { bodyFont, displayFont, monoFont } from "../lib/typography";
import { DiscoveryControls } from "../components/discovery/DiscoveryControls";
import { darkPalette } from "../lib/theme";

export default function WebHomeScreenEntry() {
  const hydrated = useClientOnlyValue(false, true);
  if (!hydrated) {
    return <View accessibilityLabel="Loading GoDiscover" />;
  }
  return <WebHomeScreen />;
}

function WebHomeScreen() {
  const { width, height } = useWindowDimensions();
  const layout = resolveWebLayout(width, height);
  const reducedMotion = useReducedMotion();
  const [section, setSection] = useState<WebSection>("archive");
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedOwnerId, setSavedOwnerId] = useState<string | null | undefined>(
    undefined
  );
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [detailSelection, setDetailSelection] = useState<{ category: ContentCategory; item: ResultItem } | null>(null);
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const activeOwnerId = useRef<string | null | undefined>(undefined);
  const detailRequest = useRef(0);
  const savedRefreshSequence = useRef(0);
  const discovery = useDiscoveryController({
    onSavedItemsChange: setSavedItems,
    ownerId: authSession?.user.id ?? null,
  });
  const { selected } = discovery.state;
  const { activeItem } = discovery;
  const activeSession = selected ? discovery.state.sessions[selected] : null;
  const nextItem = activeSession?.deck.queue[1] ?? null;

  // The deck's follow-up bar. A save offers a direction; a skip offers the way
  // back. Neither existed on web before — the keyboard hint promised "U TO
  // UNDO" against nothing.
  const { lastSave, lastSkip, actionError } = discovery.state;
  const deckNotice = actionError
    ? { message: actionError }
    : lastSave
    ? {
        message: `Saved ${lastSave.item.title}`,
        onUndo: () => void discovery.undo(),
        actions: (["more-like-this", "something-different"] as const).map(
          (intent) => ({
            label: SAVE_INTENT_LABELS[intent],
            onPress: () => void discovery.followSave(lastSave.item, intent),
          })
        ),
      }
    : lastSkip
    ? {
        message: `Not for me: ${lastSkip.item.title}`,
        onUndo: () => void discovery.undoSkip(),
      }
    : null;

  useEffect(() => {
    let authEventObserved = false;
    const refreshSavedForSession = (next: Session | null) => {
      const ownerId = next?.user.id ?? null;
      const refreshSequence = ++savedRefreshSequence.current;
      if (activeOwnerId.current !== ownerId) {
        activeOwnerId.current = ownerId;
        setSavedItems([]);
        setDetailSelection(null);
      }
      setAuthSession(next);
      setSavedOwnerId((hydratedOwnerId) =>
        hydratedOwnerId === ownerId ? hydratedOwnerId : undefined
      );
      void runSavedMutation(() => listSavedForOwner(ownerId))
        .then((items) => {
          if (savedRefreshSequence.current !== refreshSequence) return;
          setSavedItems(items);
          setSavedOwnerId(ownerId);
        })
        .catch(() => undefined);
    };

    void listRecents().then(setRecentItems).catch(() => undefined);
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!authEventObserved) refreshSavedForSession(data.session);
      })
      .catch(() => undefined);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventObserved = true;
      refreshSavedForSession(next);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);


  useEffect(() => {
    if (!detailSelection) {
      setDetail(null);
      return;
    }
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    void loadDetail(detailSelection.category, detailSelection.item)
      .then((next) => { if (detailRequest.current === requestId) setDetail(next); })
      .catch(() => { if (detailRequest.current === requestId) setDetail(null); })
      .finally(() => { if (detailRequest.current === requestId) setDetailLoading(false); });
  }, [detailSelection?.category, detailSelection?.item.id]);

  const openDetail = (category: ContentCategory, item: ResultItem) => {
    if (selected !== category) discovery.selectCategory(category);
    setDetailSelection({ category, item });
    setSection("discover");
    void addRecent(category, item).then(setRecentItems).catch(() => undefined);
  };

  const selectCategory = (category: ContentCategory) => {
    discovery.selectCategory(category);
    setSection("discover");
    void discovery.submit("randomize");
  };

  const commit = (decision: "save" | "skip") => {
    if (!activeItem) return;
    void discovery.commit(activeItem, decision).catch(() => undefined);
  };

  const startSimilar = (category: ContentCategory, item: ResultItem) => {
    if (selected !== category) discovery.selectCategory(category);
    setSection("discover");
    void discovery.similar(item);
  };

  const toggleDetailSave = () => {
    if (!detailSelection) return;
    const operationOwnerId = authSession?.user.id ?? null;
    const operationIsCurrent = () => activeOwnerId.current === operationOwnerId;
    const isSaved = savedItems.some(
      (item) =>
        item.category === detailSelection.category &&
        item.id === detailSelection.item.id
    );
    if (!isSaved) {
      void runSavedMutation(() =>
        toggleSavedItem(
          detailSelection.category,
          detailSelection.item,
          savedMutationsForOwner(operationOwnerId)
        )
      )
        .then((items) => {
          if (operationIsCurrent()) setSavedItems(items);
        })
        .catch(() => undefined);
      return;
    }
    void removeSavedItem(
      detailSelection.category,
      detailSelection.item.id,
      savedMutationsForOwner(operationOwnerId)
    )
      .then((items) => {
        if (operationIsCurrent()) setSavedItems(items);
      })
      .catch(() => undefined);
  };

  const shareItem = async (category: ContentCategory, item: ResultItem) => {
    const label = getShareLabel(category);
    const text = `Check out this ${label} I found on GoDiscover: ${item.title}${item.subtitle ? ` — ${item.subtitle}` : ""}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await (navigator as Navigator & { share?: (data: { title: string; text: string }) => Promise<void> }).share?.({ title: item.title, text });
      return;
    }
    if (typeof window !== "undefined") {
      await window.navigator.clipboard?.writeText(text);
    }
  };

  const submitAuth = async () => {
    setAuthMessage(null);
    if (!authEmail.trim() || !authPassword) { setAuthMessage("Enter an email and password first."); return; }
    const result = authMode === "signin"
      ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
      : await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
    if (result.error) { setAuthMessage(authMode === "signin" ? "Couldn't sign in. Check your details." : "Couldn't create that account. Try again."); return; }
    setAuthMessage(authMode === "signin" ? "Signed in. Your map is ready." : "Check your inbox to confirm your account.");
    setAuthPassword("");
  };

  return (
    <WebShell section={section} onSectionChange={setSection} savedCount={savedItems.length}>
      {section === "archive" ? (
        <ArchiveAtlas recentItems={recentItems} onSelect={selectCategory} onOpenRecent={(item) => openDetail(item.category, item)} onSurprise={() => selectCategory("movies")} />
      ) : null}
      {section === "discover" ? (
        <View style={[styles.workspace, layout === "mobile" && styles.workspaceMobile]}>
          <View style={styles.workspaceMain}>
            <WebDiscoveryStage category={selected ?? "movies"} activeItem={activeItem} nextItem={nextItem} loading={activeSession?.status === "loading"} reducedMotion={reducedMotion} onSkip={() => commit("skip")} onSave={() => commit("save")} onSimilar={() => activeItem && startSimilar(selected ?? "movies", activeItem)} onOpen={() => activeItem && openDetail(selected ?? "movies", activeItem)} notice={deckNotice} similarContext={activeSession?.deck.similarContext ?? null} exhausted={discovery.deckExhausted} stalled={discovery.deckStalled} onRetry={() => void discovery.retry()} controls={activeSession && selected ? (
              <DiscoveryControls
                category={selected}
                activeAction={activeSession.activeAction}
                query={activeSession.searchQuery}
                filters={activeSession.selectedFilters}
                openSection={activeSession.openSection}
                loading={activeSession.status === "loading"}
                palette={darkPalette}
                onActionChange={discovery.setAction}
                onQueryChange={discovery.setQuery}
                onToggleFilter={discovery.toggleFilter}
                onOpenSection={discovery.setOpenSection}
                onClearFilters={discovery.clearFilters}
                onSubmit={discovery.submit}
              />
            ) : null} />
          </View>
          {detailSelection && layout !== "mobile" ? <WebDetailPanel item={detailSelection.item} category={detailSelection.category} detail={detail} saved={savedItems.some((item) => item.category === detailSelection.category && item.id === detailSelection.item.id)} loading={detailLoading} onClose={() => setDetailSelection(null)} onSave={toggleDetailSave} onSimilar={() => startSimilar(detailSelection.category, detailSelection.item)} onShare={() => void shareItem(detailSelection.category, detailSelection.item)} /> : null}
        </View>
      ) : null}
      {section === "saved" ? (
        <View style={styles.savedWorkspace}>
          {savedItems.length === 0 ? (
            <View style={styles.savedEmpty}>
              <Text style={styles.savedEmptyTitle}>Nothing saved yet</Text>
              <Text style={styles.savedEmptyBody}>
                Save anything from the deck and it will be waiting here.
              </Text>
              {/* An empty page with no way off it is a dead end, and this is
                  the only route to saved items on web. */}
              <Pressable
                accessibilityLabel="Start exploring the archive"
                accessibilityRole="button"
                onPress={() => setSection("archive")}
                style={({ pressed }) => [
                  styles.savedEmptyAction,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.savedEmptyActionText}>Start exploring</Text>
              </Pressable>
            </View>
          ) : (
            <SavedList
              items={savedItems}
              palette={darkPalette}
              onOpen={(item) => openDetail(item.category, item)}
              onSimilar={(item) => startSimilar(item.category, item)}
              onRemove={(item) => {
                const ownerId = authSession?.user.id ?? null;
                void removeSavedItem(
                  item.category,
                  item.id,
                  savedMutationsForOwner(ownerId)
                )
                  .then((items) => {
                    if (activeOwnerId.current === ownerId) setSavedItems(items);
                  })
                  .catch(() => undefined);
              }}
            />
          )}
        </View>
      ) : null}
      {section === "account" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.accountView,
            layout === "mobile" && styles.accountViewMobile,
          ]}
        >
          <Text style={styles.accountKicker}>YOUR CONTROL ROOM</Text>
          <Text style={[styles.accountTitle, layout === "mobile" && styles.accountTitleMobile]}>{authSession ? "Your map is synced." : "Keep your constellation."}</Text>
          {authSession ? <><Text style={styles.accountBody}>{authSession.user.email}</Text><Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={styles.authButton}><Text style={styles.authButtonText}>Sign out</Text></Pressable></> : <View style={styles.authCard}><Text style={styles.accountBody}>Sign in to keep your saved discoveries available across devices.</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={webPalette.muted} value={authEmail} onChangeText={setAuthEmail} style={styles.authInput} /><TextInput accessibilityLabel="Password" secureTextEntry placeholder="Password" placeholderTextColor={webPalette.muted} value={authPassword} onChangeText={setAuthPassword} style={styles.authInput} /><Pressable accessibilityRole="button" onPress={() => void submitAuth()} style={styles.authButton}><Text style={styles.authButtonText}>{authMode === "signin" ? "Sign in" : "Create account"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setAuthMode((mode) => mode === "signin" ? "signup" : "signin")}><Text style={styles.authSwitch}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</Text></Pressable>{authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}</View>}
        </ScrollView>
      ) : null}
      {detailSelection && layout === "mobile" ? <View style={styles.mobileDetail}><WebDetailPanel item={detailSelection.item} category={detailSelection.category} detail={detail} saved={savedItems.some((item) => item.category === detailSelection.category && item.id === detailSelection.item.id)} loading={detailLoading} presentation="sheet" onClose={() => setDetailSelection(null)} onSave={toggleDetailSave} onSimilar={() => startSimilar(detailSelection.category, detailSelection.item)} onShare={() => void shareItem(detailSelection.category, detailSelection.item)} /></View> : null}
    </WebShell>
  );
}


function getShareLabel(category: ContentCategory): string {
  if (category === "movies") return "movie";
  if (category === "books") return "book";
  if (category === "albums") return "album";
  return "artist";
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: "row" }, workspaceMobile: { flexDirection: "column" }, workspaceMain: { flex: 1 }, savedWorkspace: { alignSelf: "center", flex: 1, maxWidth: 980, paddingHorizontal: 28, width: "100%" }, savedEmpty: { alignItems: "center", gap: 10, paddingTop: 72 }, savedEmptyTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 24, fontWeight: "800" }, savedEmptyBody: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 15, textAlign: "center" }, savedEmptyAction: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, justifyContent: "center", marginTop: 8, minHeight: 46, paddingHorizontal: 22 }, savedEmptyActionText: { color: webPalette.bg, fontFamily: bodyFont, fontSize: 15, fontWeight: "900" },accountView: { alignSelf: "center", maxWidth: 720, padding: 48, width: "100%" }, accountViewMobile: { paddingHorizontal: 20, paddingVertical: 28 }, accountKicker: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.7 }, accountTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 48, fontWeight: "900", marginTop: 10 }, accountTitleMobile: { fontSize: 32, lineHeight: 36 }, accountBody: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 16, lineHeight: 24, marginTop: 12 }, authCard: { backgroundColor: "#241B35", borderRadius: 24, gap: 12, marginTop: 28, maxWidth: 460, padding: 24 }, authInput: { backgroundColor: "#34264A", borderColor: webPalette.border, borderRadius: 12, borderWidth: 1, color: webPalette.text, fontFamily: bodyFont, fontSize: 16, minHeight: 48, paddingHorizontal: 14 }, authButton: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, minHeight: 46, justifyContent: "center", marginTop: 4, paddingHorizontal: 20 }, authButtonText: { color: webPalette.bg, fontFamily: bodyFont, fontWeight: "900" }, authSwitch: { color: webPalette.mint, fontFamily: bodyFont, fontSize: 13, lineHeight: 44, minHeight: 44, textAlign: "center" }, authMessage: { color: webPalette.tangerine, fontFamily: bodyFont, fontSize: 13, marginTop: 5 }, mobileDetail: { bottom: 0, left: 0, maxHeight: "80%", paddingBottom: "env(safe-area-inset-bottom)" as any, position: "absolute", right: 0 },
});
