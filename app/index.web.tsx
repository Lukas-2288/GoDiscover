import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { WebShell, ArchiveAtlas, WebDetailPanel, WebDiscoveryStage, resolveWebLayout, webPalette, type WebSection } from "../components/web/WebHomeScreen";
import { SavedAtlas } from "../components/web/map/SavedAtlas.web";
import { useDiscoveryController } from "../components/discovery/useDiscoveryController";
import { useReducedMotion } from "../components/discovery/useReducedMotion";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { listSaved, type SavedItem } from "../lib/storage/saved";
import { runSavedMutation, toggleSavedItem, removeSavedItem } from "../lib/storage/savedMutations";
import { loadDetail, type ContentDetail } from "../lib/discovery/loadDetail";
import { loadMapSnapshot, recordMapTrailEvent, type MapNode, type MapSnapshot } from "../lib/storage/discoveryMap";
import type { ContentCategory, ResultItem } from "../types/content";
import { supabase } from "../lib/supabase";

export default function WebHomeScreen() {
  const { width, height } = useWindowDimensions();
  const layout = resolveWebLayout(width, height);
  const reducedMotion = useReducedMotion();
  const [section, setSection] = useState<WebSection>("archive");
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [mapSnapshot, setMapSnapshot] = useState<MapSnapshot>({ version: 1, nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailSelection, setDetailSelection] = useState<{ category: ContentCategory; item: ResultItem } | null>(null);
  const [detail, setDetail] = useState<ContentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const detailRequest = useRef(0);
  const trailSeed = useRef<{ category: ContentCategory; id: string } | null>(null);
  const discovery = useDiscoveryController({ onSavedItemsChange: setSavedItems });
  const { selected } = discovery.state;
  const { activeItem } = discovery;
  const activeSession = selected ? discovery.state.sessions[selected] : null;
  const nextItem = activeSession?.deck.queue[1] ?? null;

  useEffect(() => {
    void runSavedMutation(() => listSaved()).then(setSavedItems).catch(() => undefined);
    void listRecents().then(setRecentItems).catch(() => undefined);
    supabase.auth.getSession().then(({ data }) => setAuthSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setAuthSession(next);
      void runSavedMutation(() => listSaved()).then(setSavedItems).catch(() => undefined);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void loadMapSnapshot(savedItems, authSession?.user.id)
      .then(setMapSnapshot)
      .catch(() => undefined);
  }, [authSession?.user.id, savedItems]);

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
    const committed = activeItem;
    void discovery.commit(committed, decision).then(() => {
      if (decision !== "save" || !selected || !trailSeed.current) return;
      const savedTarget: SavedItem = { ...committed, category: selected, savedAt: Date.now() };
      void recordMapTrailEvent(
        { source: trailSeed.current, target: { category: selected, id: committed.id }, occurredAt: Date.now() },
        [...savedItems, savedTarget],
        authSession?.user.id
      ).then(setMapSnapshot).catch(() => undefined);
    });
  };

  const startSimilar = (category: ContentCategory, item: ResultItem) => {
    if (selected !== category) discovery.selectCategory(category);
    const seed = activeItem ?? item;
    trailSeed.current = { category, id: seed.id };
    setSection("discover");
    void discovery.similar(item);
  };

  const selectMapNode = (node: MapNode) => {
    setSelectedNodeId(node.id);
    setDetailSelection({ category: node.category, item: selectedNodeToItem(node) });
    void addRecent(node.category, selectedNodeToItem(node)).then(setRecentItems).catch(() => undefined);
  };

  const toggleDetailSave = () => {
    if (!detailSelection) return;
    void runSavedMutation(() => toggleSavedItem(detailSelection.category, detailSelection.item))
      .then(setSavedItems)
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

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (section !== "discover" || !activeItem) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); commit("skip"); }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "s") { event.preventDefault(); commit("save"); }
      if (event.key.toLowerCase() === "u") { event.preventDefault(); void discovery.undo(); }
      if (event.key === "Enter") { event.preventDefault(); openDetail(selected ?? "movies", activeItem); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [activeItem, discovery, section, selected]);

  const selectedNode = useMemo<MapNode | null>(() => mapSnapshot.nodes.find((node) => node.id === selectedNodeId) ?? null, [mapSnapshot.nodes, selectedNodeId]);
  const panelSelection = detailSelection ?? (selectedNode ? { category: selectedNode.category, item: selectedNodeToItem(selectedNode) } : null);

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
            <WebDiscoveryStage category={selected ?? "movies"} activeItem={activeItem} nextItem={nextItem} loading={activeSession?.status === "loading"} reducedMotion={reducedMotion} onSkip={() => commit("skip")} onSave={() => commit("save")} onSimilar={() => activeItem && startSimilar(selected ?? "movies", activeItem)} onOpen={() => activeItem && openDetail(selected ?? "movies", activeItem)} />
          </View>
          {panelSelection && layout !== "mobile" ? <WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} onClose={() => { setDetailSelection(null); setSelectedNodeId(null); }} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} onShare={() => void shareItem(panelSelection.category, panelSelection.item)} /> : null}
        </View>
      ) : null}
      {section === "atlas" ? (
        <View style={styles.mapWorkspace}>
          <SavedAtlas
            nodes={mapSnapshot.nodes}
            edges={mapSnapshot.edges}
            selectedId={selectedNodeId}
            onSelect={selectMapNode}
            onClearSelection={() => {
              setSelectedNodeId(null);
              setDetailSelection(null);
            }}
            onStart={() => setSection("archive")}
          />
          {panelSelection && layout !== "mobile" ? <WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} onClose={() => { setDetailSelection(null); setSelectedNodeId(null); }} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} onShare={() => void shareItem(panelSelection.category, panelSelection.item)} /> : null}
        </View>
      ) : null}
      {section === "account" ? (
        <View style={styles.accountView}>
          <Text style={styles.accountKicker}>YOUR CONTROL ROOM</Text>
          <Text style={styles.accountTitle}>{authSession ? "Your map is synced." : "Keep your constellation."}</Text>
          {authSession ? <><Text style={styles.accountBody}>{authSession.user.email}</Text><Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={styles.authButton}><Text style={styles.authButtonText}>Sign out</Text></Pressable></> : <View style={styles.authCard}><Text style={styles.accountBody}>Sign in to keep your saved discoveries available across devices.</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={webPalette.muted} value={authEmail} onChangeText={setAuthEmail} style={styles.authInput} /><TextInput accessibilityLabel="Password" secureTextEntry placeholder="Password" placeholderTextColor={webPalette.muted} value={authPassword} onChangeText={setAuthPassword} style={styles.authInput} /><Pressable accessibilityRole="button" onPress={() => void submitAuth()} style={styles.authButton}><Text style={styles.authButtonText}>{authMode === "signin" ? "Sign in" : "Create account"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setAuthMode((mode) => mode === "signin" ? "signup" : "signin")}><Text style={styles.authSwitch}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</Text></Pressable>{authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}</View>}
        </View>
      ) : null}
      {detailSelection && layout === "mobile" ? <View style={styles.mobileDetail}><WebDetailPanel item={detailSelection.item} category={detailSelection.category} detail={detail} saved={savedItems.some((item) => item.category === detailSelection.category && item.id === detailSelection.item.id)} loading={detailLoading} onClose={() => setDetailSelection(null)} onSave={toggleDetailSave} onSimilar={() => startSimilar(detailSelection.category, detailSelection.item)} onShare={() => void shareItem(detailSelection.category, detailSelection.item)} /></View> : null}
    </WebShell>
  );
}

function selectedNodeToItem(node: MapNode): ResultItem {
  return { id: node.itemId, title: node.title, subtitle: node.subtitle, meta: node.meta, imageUrl: node.imageUrl };
}

function getShareLabel(category: ContentCategory): string {
  if (category === "movies") return "movie";
  if (category === "books") return "book";
  if (category === "albums") return "album";
  return "artist";
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: "row" }, workspaceMobile: { flexDirection: "column" }, workspaceMain: { flex: 1 }, mapWorkspace: { flex: 1, flexDirection: "row" }, accountView: { alignSelf: "center", maxWidth: 720, padding: 48, width: "100%" }, accountKicker: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 1.7 }, accountTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 48, fontWeight: "900", marginTop: 10 }, accountBody: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 16, lineHeight: 24, marginTop: 12 }, authCard: { backgroundColor: "#241B35", borderRadius: 24, gap: 12, marginTop: 28, maxWidth: 460, padding: 24 }, authInput: { backgroundColor: "#34264A", borderColor: webPalette.border, borderRadius: 12, borderWidth: 1, color: webPalette.text, fontFamily: "DM Sans", minHeight: 48, paddingHorizontal: 14 }, authButton: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, minHeight: 46, justifyContent: "center", marginTop: 4, paddingHorizontal: 20 }, authButtonText: { color: webPalette.bg, fontFamily: "DM Sans", fontWeight: "900" }, authSwitch: { color: webPalette.mint, fontFamily: "DM Sans", fontSize: 13, paddingVertical: 8, textAlign: "center" }, authMessage: { color: webPalette.tangerine, fontFamily: "DM Sans", fontSize: 13, marginTop: 5 }, mobileDetail: { bottom: 0, left: 0, position: "absolute", right: 0 },
});
