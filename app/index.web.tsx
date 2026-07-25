import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { Session } from "@supabase/supabase-js";

import { WebShell, ArchiveAtlas, WebDetailPanel, WebDiscoveryStage, resolveWebLayout, webPalette, type WebSection } from "../components/web/WebHomeScreen";
import { SavedAtlas } from "../components/web/map/SavedAtlas.web";
import { useDiscoveryController } from "../components/discovery/useDiscoveryController";
import { useReducedMotion } from "../components/discovery/useReducedMotion";
import { useClientOnlyValue } from "../components/useClientOnlyValue";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { listSaved, type SavedItem } from "../lib/storage/saved";
import { removeSavedItem, runSavedMutation, saveSavedItem, toggleSavedItem } from "../lib/storage/savedMutations";
import { loadDetail, type ContentDetail } from "../lib/discovery/loadDetail";
import { loadMapSnapshot, recordMapTrailEvent, type MapNode, type MapSnapshot } from "../lib/storage/discoveryMap";
import { disconnectSavedItemTrails } from "../lib/storage/discoveryTrailSync";
import { buildCulturalProfile } from "../lib/discovery/culturalProfile";
import { findMapRecommendations } from "../lib/discovery/mapRecommendations";
import { defaultDiscoveryProviders } from "../lib/discovery/loadDiscovery";
import type { OrbitSeed } from "../components/web/map/SavedAtlas.web";
import type { OrbitRecommendation } from "../components/web/map/orbitGraph";
import type { ContentCategory, ResultItem } from "../types/content";
import { supabase } from "../lib/supabase";

const EMPTY_MAP_SNAPSHOT: MapSnapshot = {
  version: 1,
  nodes: [],
  edges: [],
};

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
  const [mapSnapshot, setMapSnapshot] = useState<MapSnapshot>(EMPTY_MAP_SNAPSHOT);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [atlasDrawerExpanded, setAtlasDrawerExpanded] = useState(false);
  const [responsiveOrbit, setResponsiveOrbit] = useState<{
    seedId: string | null;
    orbitSeed: OrbitSeed | null;
    previewId: string | null;
    loading: boolean;
    error: boolean;
    recommendations: OrbitRecommendation[];
  }>({ seedId: null, orbitSeed: null, previewId: null, loading: false, error: false, recommendations: [] });
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
  const mapLoadSequence = useRef(0);
  const savedRefreshSequence = useRef(0);
  const trailSeed = useRef<{ category: ContentCategory; id: string } | null>(null);
  const responsiveOrbitRequest = useRef(0);
  const discovery = useDiscoveryController({ onSavedItemsChange: setSavedItems });
  const { selected } = discovery.state;
  const { activeItem } = discovery;
  const activeSession = selected ? discovery.state.sessions[selected] : null;
  const nextItem = activeSession?.deck.queue[1] ?? null;

  useEffect(() => {
    let authEventObserved = false;
    const refreshSavedForSession = (next: Session | null) => {
      const ownerId = next?.user.id ?? null;
      const refreshSequence = ++savedRefreshSequence.current;
      if (activeOwnerId.current !== ownerId) {
        activeOwnerId.current = ownerId;
        mapLoadSequence.current += 1;
        setMapSnapshot(EMPTY_MAP_SNAPSHOT);
        setSelectedNodeId(null);
        responsiveOrbitRequest.current += 1;
        setResponsiveOrbit({ seedId: null, orbitSeed: null, previewId: null, loading: false, error: false, recommendations: [] });
        setDetailSelection(null);
      }
      setAuthSession(next);
      setSavedOwnerId((hydratedOwnerId) =>
        hydratedOwnerId === ownerId ? hydratedOwnerId : undefined
      );
      void runSavedMutation(() => listSaved())
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
      mapLoadSequence.current += 1;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const ownerId = authSession?.user.id ?? null;
    if (savedOwnerId !== ownerId) return;
    const loadSequence = ++mapLoadSequence.current;
    let cancelled = false;
    void loadMapSnapshot(savedItems, authSession?.user.id)
      .then((snapshot) => {
        if (
          cancelled ||
          mapLoadSequence.current !== loadSequence ||
          activeOwnerId.current !== ownerId
        ) {
          return;
        }
        setMapSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authSession?.user.id, savedItems, savedOwnerId]);

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
    const operationOwnerId = authSession?.user.id ?? null;
    const operationMapSequence = mapLoadSequence.current;
    const operationCategory = selected;
    const operationTrailSeed = trailSeed.current;
    const operationIsCurrent = () =>
      mapLoadSequence.current === operationMapSequence &&
      activeOwnerId.current === operationOwnerId;
    void discovery.commit(committed, decision).then(() => {
      if (
        decision !== "save" ||
        !operationCategory ||
        !operationTrailSeed ||
        !operationIsCurrent()
      ) {
        return;
      }
      const savedTarget: SavedItem = {
        ...committed,
        category: operationCategory,
        savedAt: Date.now(),
      };
      void recordMapTrailEvent(
        {
          source: operationTrailSeed,
          target: { category: operationCategory, id: committed.id },
          occurredAt: Date.now(),
        },
        [...savedItems, savedTarget],
        operationOwnerId ?? undefined
      ).then((snapshot) => {
        if (!operationIsCurrent()) return;
        setMapSnapshot(snapshot);
      }).catch(() => undefined);
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
    const seed: OrbitSeed = {
      id: node.id,
      category: node.category,
      item: selectedNodeToItem(node),
    };
    responsiveOrbitRequest.current += 1;
    setResponsiveOrbit({ seedId: node.id, orbitSeed: seed, previewId: node.id, loading: false, error: false, recommendations: [] });
    setSelectedNodeId(node.id);
    setAtlasDrawerExpanded(false);
    setDetailSelection({ category: node.category, item: selectedNodeToItem(node) });
    void addRecent(node.category, selectedNodeToItem(node)).then(setRecentItems).catch(() => undefined);
  };

  const toggleDetailSave = () => {
    if (!detailSelection) return;
    const operationOwnerId = authSession?.user.id ?? null;
    const operationMapSequence = mapLoadSequence.current;
    const operationIsCurrent = () =>
      mapLoadSequence.current === operationMapSequence &&
      activeOwnerId.current === operationOwnerId;
    const isSaved = savedItems.some(
      (item) => item.category === detailSelection.category && item.id === detailSelection.item.id
    );
    if (!isSaved) {
      void runSavedMutation(() => toggleSavedItem(detailSelection.category, detailSelection.item))
        .then((items) => { if (operationIsCurrent()) setSavedItems(items); })
        .catch(() => undefined);
      return;
    }
    void disconnectSavedItemTrails(
      { category: detailSelection.category, id: detailSelection.item.id },
      { occurredAt: Date.now(), reason: "Removed from saved atlas", userId: operationOwnerId ?? undefined }
    )
      .then(async () => {
        if (!operationIsCurrent()) return;
        const items = await removeSavedItem(detailSelection.category, detailSelection.item.id);
        if (!operationIsCurrent()) return;
        setSavedItems(items);
        const snapshot = await loadMapSnapshot(items, operationOwnerId ?? undefined);
        if (operationIsCurrent()) setMapSnapshot(snapshot);
      })
      .catch(() => undefined);
  };

  const findOrbitRecommendations = async (seed: OrbitSeed): Promise<OrbitRecommendation[]> => {
    const operationOwnerId = authSession?.user.id ?? null;
    const operationMapSequence = mapLoadSequence.current;
    const operationIsCurrent = () =>
      mapLoadSequence.current === operationMapSequence &&
      activeOwnerId.current === operationOwnerId;
    const savedSeed = mapSnapshot.nodes.find((node) => node.id === seed.id);
    const profile = savedSeed?.culturalProfile ?? buildCulturalProfile(seed.category, seed.item);
    const result = await findMapRecommendations(
      { category: seed.category, item: seed.item, profile },
      { providers: defaultDiscoveryProviders }
    );
    if (!operationIsCurrent()) throw new Error("The atlas changed while recommendations were loading.");
    const attemptedSources = result.sourceStatuses.filter(
      (status) => status.status !== "not-applicable"
    );
    if (
      result.recommendations.length === 0 &&
      attemptedSources.length > 0 &&
      attemptedSources.every((status) => status.status === "failed")
    ) {
      throw new Error("Every recommendation source is unavailable.");
    }
    return result.recommendations.slice(0, 8).map(({ category, item, reason }) => ({
      category,
      item,
      reason: { label: reason.label },
    }));
  };

  const saveOrbitRecommendation = async (
    seed: OrbitSeed,
    recommendation: OrbitRecommendation
  ): Promise<void> => {
    const operationOwnerId = authSession?.user.id ?? null;
    const operationMapSequence = mapLoadSequence.current;
    const operationIsCurrent = () =>
      mapLoadSequence.current === operationMapSequence &&
      activeOwnerId.current === operationOwnerId;
    const alreadySaved = savedItems.some(
      (item) => item.category === recommendation.category && item.id === recommendation.item.id
    );
    const nextItems = alreadySaved
      ? savedItems
      : await saveSavedItem(recommendation.category, recommendation.item).then((result) => {
        if (!result.confirmed) throw new Error("The recommendation was not saved.");
        return result.items;
      });
    if (!operationIsCurrent()) return;
    if (!alreadySaved) setSavedItems(nextItems);
    const snapshot = await recordMapTrailEvent(
      {
        source: { category: seed.category, id: seed.item.id },
        target: { category: recommendation.category, id: recommendation.item.id },
        occurredAt: Date.now(),
        reason: recommendation.reason.label,
      },
      nextItems,
      operationOwnerId ?? undefined
    );
    if (operationIsCurrent()) setMapSnapshot(snapshot);
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
  const requestResponsiveOrbit = async (
    requestedSeed?: OrbitSeed,
    { reseeding = false }: { reseeding?: boolean } = {}
  ) => {
    if (!selectedNode) return;
    const requestId = ++responsiveOrbitRequest.current;
    const rootSeedId = selectedNode.id;
    const seed: OrbitSeed = requestedSeed ?? responsiveOrbit.orbitSeed ?? {
      id: selectedNode.id,
      category: selectedNode.category,
      item: selectedNodeToItem(selectedNode),
    };
    setResponsiveOrbit((current) => ({
      seedId: rootSeedId,
      orbitSeed: current.seedId === rootSeedId ? current.orbitSeed : seed,
      previewId: current.seedId === rootSeedId ? current.previewId : seed.id,
      loading: true,
      error: false,
      recommendations: current.seedId === rootSeedId ? current.recommendations : [],
    }));
    try {
      const recommendations = await findOrbitRecommendations(seed);
      if (responsiveOrbitRequest.current !== requestId) return;
      setResponsiveOrbit((current) => ({
        seedId: rootSeedId,
        orbitSeed: seed,
        previewId: reseeding ? seed.id : current.previewId,
        loading: false,
        error: false,
        recommendations: recommendations.slice(0, 8),
      }));
    } catch {
      if (responsiveOrbitRequest.current !== requestId) return;
      setResponsiveOrbit((current) => ({
        seedId: rootSeedId,
        orbitSeed: current.seedId === rootSeedId ? current.orbitSeed : seed,
        previewId: current.seedId === rootSeedId ? current.previewId : seed.id,
        loading: false,
        error: true,
        recommendations: current.seedId === rootSeedId ? current.recommendations : [],
      }));
    }
  };
  const findResponsiveRecommendation = (recommendationId: string) =>
    responsiveOrbit.recommendations.find(
      (recommendation) => `${recommendation.category}:${recommendation.item.id}` === recommendationId
    );
  const previewResponsiveRecommendation = (recommendationId: string) => {
    if (!findResponsiveRecommendation(recommendationId)) return;
    setResponsiveOrbit((current) => ({ ...current, previewId: recommendationId }));
  };
  const skipResponsiveRecommendation = (recommendationId: string) => {
    setResponsiveOrbit((current) => ({
      ...current,
      previewId: current.previewId === recommendationId
        ? current.orbitSeed?.id ?? current.seedId
        : current.previewId,
      recommendations: current.recommendations.filter(
        (recommendation) => `${recommendation.category}:${recommendation.item.id}` !== recommendationId
      ),
    }));
  };
  const saveResponsiveRecommendation = async (recommendationId: string) => {
    const recommendation = findResponsiveRecommendation(recommendationId);
    const seed = responsiveOrbit.orbitSeed;
    if (!recommendation || !seed) return;
    const actionRequest = responsiveOrbitRequest.current;
    try {
      await saveOrbitRecommendation(seed, recommendation);
      if (responsiveOrbitRequest.current !== actionRequest) return;
      skipResponsiveRecommendation(recommendationId);
    } catch {
      if (responsiveOrbitRequest.current !== actionRequest) return;
      setResponsiveOrbit((current) => ({ ...current, error: true }));
    }
  };
  const reseedResponsiveRecommendation = (recommendationId: string) => {
    const recommendation = findResponsiveRecommendation(recommendationId);
    if (!recommendation) return;
    void requestResponsiveOrbit({
      id: recommendationId,
      category: recommendation.category,
      item: recommendation.item,
    }, { reseeding: true });
  };
  const responsiveOrbitProps = selectedNode && responsiveOrbit.seedId === selectedNode.id ? {
    atlasRecommendations: responsiveOrbit.recommendations.map((recommendation) => ({
      id: `${recommendation.category}:${recommendation.item.id}`,
      title: recommendation.item.title,
      reason: recommendation.reason.label,
    })),
    atlasRecommendationsLoading: responsiveOrbit.loading,
    atlasRecommendationsError: responsiveOrbit.error,
    onFindSimilarInAtlas: () => void requestResponsiveOrbit(),
    onPreviewAtlasRecommendation: previewResponsiveRecommendation,
    onSaveAtlasRecommendation: (recommendationId: string) => void saveResponsiveRecommendation(recommendationId),
    onSkipAtlasRecommendation: skipResponsiveRecommendation,
    onReseedAtlasRecommendation: reseedResponsiveRecommendation,
  } : {};

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
              responsiveOrbitRequest.current += 1;
              setResponsiveOrbit({ seedId: null, orbitSeed: null, previewId: null, loading: false, error: false, recommendations: [] });
              setSelectedNodeId(null);
              setDetailSelection(null);
            }}
            onStart={() => setSection("archive")}
            onFindSimilar={findOrbitRecommendations}
            onSaveRecommendation={saveOrbitRecommendation}
            layout={layout}
            reducedMotion={reducedMotion}
            responsiveRecommendations={(layout === "mobile" || layout === "tabletPortrait") && responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.recommendations : undefined}
            responsiveOrbitSeed={(layout === "mobile" || layout === "tabletPortrait") && responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.orbitSeed ?? undefined : undefined}
            responsivePreviewId={(layout === "mobile" || layout === "tabletPortrait") && responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.previewId ?? undefined : undefined}
          />
          {panelSelection && (layout === "tabletLandscape" || layout === "desktop") ? <WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} presentation="rail" onClose={() => { setDetailSelection(null); setSelectedNodeId(null); }} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} similarLabel="Open discovery deck" onShare={() => void shareItem(panelSelection.category, panelSelection.item)} /> : null}
          {panelSelection && layout === "tabletPortrait" ? <View style={styles.atlasPortraitDrawer}><WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} presentation="drawer" expanded={atlasDrawerExpanded} onToggleExpanded={() => setAtlasDrawerExpanded((expanded) => !expanded)} onClose={() => { responsiveOrbitRequest.current += 1; setDetailSelection(null); setSelectedNodeId(null); }} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} similarLabel="Open discovery deck" onShare={() => void shareItem(panelSelection.category, panelSelection.item)} {...responsiveOrbitProps} /></View> : null}
        </View>
      ) : null}
      {section === "account" ? (
        <View style={styles.accountView}>
          <Text style={styles.accountKicker}>YOUR CONTROL ROOM</Text>
          <Text style={styles.accountTitle}>{authSession ? "Your map is synced." : "Keep your constellation."}</Text>
          {authSession ? <><Text style={styles.accountBody}>{authSession.user.email}</Text><Pressable accessibilityRole="button" onPress={() => void supabase.auth.signOut()} style={styles.authButton}><Text style={styles.authButtonText}>Sign out</Text></Pressable></> : <View style={styles.authCard}><Text style={styles.accountBody}>Sign in to keep your saved discoveries available across devices.</Text><TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={webPalette.muted} value={authEmail} onChangeText={setAuthEmail} style={styles.authInput} /><TextInput accessibilityLabel="Password" secureTextEntry placeholder="Password" placeholderTextColor={webPalette.muted} value={authPassword} onChangeText={setAuthPassword} style={styles.authInput} /><Pressable accessibilityRole="button" onPress={() => void submitAuth()} style={styles.authButton}><Text style={styles.authButtonText}>{authMode === "signin" ? "Sign in" : "Create account"}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setAuthMode((mode) => mode === "signin" ? "signup" : "signin")}><Text style={styles.authSwitch}>{authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}</Text></Pressable>{authMessage ? <Text style={styles.authMessage}>{authMessage}</Text> : null}</View>}
        </View>
      ) : null}
      {detailSelection && layout === "mobile" ? <View style={styles.mobileDetail}><WebDetailPanel item={detailSelection.item} category={detailSelection.category} detail={detail} saved={savedItems.some((item) => item.category === detailSelection.category && item.id === detailSelection.item.id)} loading={detailLoading} presentation="sheet" onClose={() => setDetailSelection(null)} onSave={toggleDetailSave} onSimilar={() => startSimilar(detailSelection.category, detailSelection.item)} onShare={() => void shareItem(detailSelection.category, detailSelection.item)} {...responsiveOrbitProps} /></View> : null}
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
  workspace: { flex: 1, flexDirection: "row" }, workspaceMobile: { flexDirection: "column" }, workspaceMain: { flex: 1 }, mapWorkspace: { flex: 1, flexDirection: "row", position: "relative" }, atlasPortraitDrawer: { bottom: 0, left: 0, position: "absolute", right: 0, zIndex: 2 }, accountView: { alignSelf: "center", maxWidth: 720, padding: 48, width: "100%" }, accountKicker: { color: webPalette.tangerine, fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 1.7 }, accountTitle: { color: webPalette.text, fontFamily: "Bricolage Grotesque", fontSize: 48, fontWeight: "900", marginTop: 10 }, accountBody: { color: webPalette.muted, fontFamily: "DM Sans", fontSize: 16, lineHeight: 24, marginTop: 12 }, authCard: { backgroundColor: "#241B35", borderRadius: 24, gap: 12, marginTop: 28, maxWidth: 460, padding: 24 }, authInput: { backgroundColor: "#34264A", borderColor: webPalette.border, borderRadius: 12, borderWidth: 1, color: webPalette.text, fontFamily: "DM Sans", minHeight: 48, paddingHorizontal: 14 }, authButton: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, minHeight: 46, justifyContent: "center", marginTop: 4, paddingHorizontal: 20 }, authButtonText: { color: webPalette.bg, fontFamily: "DM Sans", fontWeight: "900" }, authSwitch: { color: webPalette.mint, fontFamily: "DM Sans", fontSize: 13, paddingVertical: 8, textAlign: "center" }, authMessage: { color: webPalette.tangerine, fontFamily: "DM Sans", fontSize: 13, marginTop: 5 }, mobileDetail: { bottom: 0, left: 0, position: "absolute", right: 0 },
});
