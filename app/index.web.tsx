import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { Session } from "@supabase/auth-js";

import { WebShell, ArchiveAtlas, WebDetailPanel, WebDiscoveryStage, resolveWebLayout, webPalette, type WebSection } from "../components/web/WebHomeScreen";
import { SavedAtlasLoader } from "../components/web/map/SavedAtlasLoader.web";
import { useDiscoveryController } from "../components/discovery/useDiscoveryController";
import { useReducedMotion } from "../components/discovery/useReducedMotion";
import { useClientOnlyValue } from "../components/useClientOnlyValue";
import { listRecents, addRecent, type RecentItem } from "../lib/storage/recents";
import { listSavedForOwner, type SavedItem } from "../lib/storage/saved";
import { removeSavedItem, runSavedMutation, savedMutationsForOwner, saveSavedItem, toggleSavedItem } from "../lib/storage/savedMutations";
import { loadDetail, type ContentDetail } from "../lib/discovery/loadDetail";
import { loadMapSnapshot, recordMapTrailEvent, type MapNode, type MapSnapshot } from "../lib/storage/discoveryMap";
import { disconnectSavedItemTrails, syncDiscoveryTrailEvents } from "../lib/storage/discoveryTrailSync";
import { buildCulturalProfile } from "../lib/discovery/culturalProfile";
import { loadMapRecommendationSeed } from "../lib/discovery/mapRecommendationAdapters";
import { findMapRecommendations } from "../lib/discovery/mapRecommendations";
import {
  DEFAULT_SAVE_INTENT,
  SAVE_INTENT_LABELS,
  applySaveIntent,
  type SaveIntent,
} from "../lib/discovery/saveIntent";
import { defaultDiscoveryProviders } from "../lib/discovery/loadDiscovery";
import type { OrbitSeed } from "../components/web/map/SavedAtlas.web";
import type { OrbitRecommendation } from "../components/web/map/orbitGraph";
import type { ContentCategory, ResultItem } from "../types/content";
import { supabase } from "../lib/supabase";
import { bodyFont, displayFont, monoFont } from "../lib/typography";
import { DiscoveryControls } from "../components/discovery/DiscoveryControls";
import { darkPalette } from "../lib/theme";

const EMPTY_MAP_SNAPSHOT: MapSnapshot = {
  version: 1,
  nodes: [],
  edges: [],
};

type ResponsiveOrbitState = {
  seedId: string | null;
  orbitSeed: OrbitSeed | null;
  previewId: string | null;
  loading: boolean;
  error: boolean;
  recommendations: OrbitRecommendation[];
};

const EMPTY_ORBIT_STATE: ResponsiveOrbitState = {
  seedId: null,
  orbitSeed: null,
  previewId: null,
  loading: false,
  error: false,
  recommendations: [],
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
  const [responsiveOrbit, setResponsiveOrbit] =
    useState<ResponsiveOrbitState>(EMPTY_ORBIT_STATE);
  const responsiveOrbitRef = useRef(responsiveOrbit);
  responsiveOrbitRef.current = responsiveOrbit;
  const [restoreOverviewVersion, setRestoreOverviewVersion] = useState(0);
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
  const culturalProfileCache = useRef(
    new Map<string, ReturnType<typeof buildCulturalProfile>>()
  );
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
        mapLoadSequence.current += 1;
        setSavedItems([]);
        setMapSnapshot(EMPTY_MAP_SNAPSHOT);
        setSelectedNodeId(null);
        responsiveOrbitRequest.current += 1;
        culturalProfileCache.current.clear();
        setResponsiveOrbit(EMPTY_ORBIT_STATE);
        responsiveOrbitRef.current = EMPTY_ORBIT_STATE;
        setRestoreOverviewVersion((version) => version + 1);
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
      mapLoadSequence.current += 1;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const ownerId = authSession?.user.id ?? null;
    if (savedOwnerId !== ownerId) return;
    const loadSequence = ++mapLoadSequence.current;
    let cancelled = false;
    const synchronize = ownerId
      ? syncDiscoveryTrailEvents(ownerId)
      : Promise.resolve([]);
    void synchronize
      .then(() => loadMapSnapshot(savedItems, authSession?.user.id))
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
    if (Platform.OS !== "web") return;
    const retry = () => {
      const ownerId = authSession?.user.id ?? null;
      if (savedOwnerId !== ownerId) return;
      const loadSequence = ++mapLoadSequence.current;
      const synchronize = ownerId
        ? syncDiscoveryTrailEvents(ownerId)
        : Promise.resolve([]);
      void synchronize
        .then(() => loadMapSnapshot(savedItems, ownerId ?? undefined))
        .then((snapshot) => {
          if (
            mapLoadSequence.current === loadSequence &&
            activeOwnerId.current === ownerId
          ) {
            setMapSnapshot(snapshot);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
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
    void discovery.commit(committed, decision).then(async (result) => {
      if (
        decision !== "save" ||
        !result.confirmed ||
        result.decision !== "save" ||
        !operationCategory ||
        !operationTrailSeed ||
        !operationIsCurrent()
      ) {
        return;
      }
      const savedTarget = result.items.find(
        (item) =>
          item.category === operationCategory && item.id === committed.id
      );
      if (!savedTarget) return;
      await recordMapTrailEvent(
        {
          source: operationTrailSeed,
          target: { category: operationCategory, id: committed.id },
          occurredAt: Date.now(),
        },
        result.items,
        operationOwnerId ?? undefined
      );
      if (!operationIsCurrent()) return;
      if (operationOwnerId) {
        await syncDiscoveryTrailEvents(operationOwnerId);
      }
      if (!operationIsCurrent()) return;
      const snapshot = await loadMapSnapshot(
        result.items,
        operationOwnerId ?? undefined
      );
      if (operationIsCurrent()) setMapSnapshot(snapshot);
    }).catch(() => undefined);
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
    const nextOrbit: ResponsiveOrbitState = {
      seedId: node.id,
      orbitSeed: seed,
      previewId: node.id,
      loading: false,
      error: false,
      recommendations: [],
    };
    responsiveOrbitRef.current = nextOrbit;
    setResponsiveOrbit(nextOrbit);
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
      void runSavedMutation(() =>
        toggleSavedItem(
          detailSelection.category,
          detailSelection.item,
          savedMutationsForOwner(operationOwnerId)
        )
      )
        .then((items) => { if (operationIsCurrent()) setSavedItems(items); })
        .catch(() => undefined);
      return;
    }
    void removeSavedItem(
      detailSelection.category,
      detailSelection.item.id,
      savedMutationsForOwner(operationOwnerId)
    )
      .then(async (items) => {
        if (!operationIsCurrent()) return;
        if (
          items.some(
            (item) =>
              item.category === detailSelection.category &&
              item.id === detailSelection.item.id
          )
        ) {
          return;
        }
        setSavedItems(items);
        await disconnectSavedItemTrails(
          { category: detailSelection.category, id: detailSelection.item.id },
          { occurredAt: Date.now(), reason: "Removed from saved atlas", userId: operationOwnerId ?? undefined }
        );
        if (!operationIsCurrent()) return;
        if (operationOwnerId) {
          await syncDiscoveryTrailEvents(operationOwnerId);
        }
        if (!operationIsCurrent()) return;
        const snapshot = await loadMapSnapshot(items, operationOwnerId ?? undefined);
        if (operationIsCurrent()) setMapSnapshot(snapshot);
      })
      .catch(() => undefined);
  };

  const findOrbitRecommendations = async (
    seed: OrbitSeed,
    intent: SaveIntent = DEFAULT_SAVE_INTENT
  ): Promise<OrbitRecommendation[]> => {
    const operationOwnerId = authSession?.user.id ?? null;
    const operationMapSequence = mapLoadSequence.current;
    const operationIsCurrent = () =>
      mapLoadSequence.current === operationMapSequence &&
      activeOwnerId.current === operationOwnerId;
    const savedSeed = mapSnapshot.nodes.find((node) => node.id === seed.id);
    let profile =
      savedSeed?.culturalProfile ?? culturalProfileCache.current.get(seed.id);
    if (!profile) {
      try {
        const enrichedSeed = await loadMapRecommendationSeed(
          seed.category,
          seed.item
        );
        if (!operationIsCurrent()) {
          throw new Error(
            "The atlas changed while recommendation detail was loading."
          );
        }
        profile = enrichedSeed.profile;
        culturalProfileCache.current.set(seed.id, profile);
        setMapSnapshot((current) => ({
          ...current,
          nodes: current.nodes.map((node) =>
            node.id === seed.id ? { ...node, culturalProfile: profile } : node
          ),
        }));
      } catch {
        profile = buildCulturalProfile(seed.category, seed.item);
      }
    }
    const result = await findMapRecommendations(
      { category: seed.category, item: seed.item, profile },
      { providers: defaultDiscoveryProviders }
    );
    // "Something different" drops the provider-native near-clones that would
    // otherwise take every slot and leads with other media instead.
    const intended = {
      ...result,
      recommendations: applySaveIntent(
        result.recommendations,
        seed.category,
        intent
      ),
    };
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
    return intended.recommendations.slice(0, 8).map(({ category, item, reason }) => ({
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
      : await saveSavedItem(
          recommendation.category,
          recommendation.item,
          savedMutationsForOwner(operationOwnerId)
        ).then((result) => {
          if (!result.confirmed) throw new Error("The recommendation was not saved.");
          return result.items;
        });
    if (!operationIsCurrent()) return;
    if (!alreadySaved) setSavedItems(nextItems);
    await recordMapTrailEvent(
      {
        source: { category: seed.category, id: seed.item.id },
        target: { category: recommendation.category, id: recommendation.item.id },
        occurredAt: Date.now(),
        reason: recommendation.reason.label,
      },
      nextItems,
      operationOwnerId ?? undefined
    );
    if (!operationIsCurrent()) return;
    if (operationOwnerId) {
      await syncDiscoveryTrailEvents(operationOwnerId);
    }
    if (!operationIsCurrent()) return;
    const snapshot = await loadMapSnapshot(
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
  const selectedNodeRef = useRef<MapNode | null>(selectedNode);
  selectedNodeRef.current = selectedNode;
  const panelSelection = detailSelection ?? (selectedNode ? { category: selectedNode.category, item: selectedNodeToItem(selectedNode) } : null);
  const findOrbitRecommendationsRef = useRef(findOrbitRecommendations);
  findOrbitRecommendationsRef.current = findOrbitRecommendations;
  const saveOrbitRecommendationRef = useRef(saveOrbitRecommendation);
  saveOrbitRecommendationRef.current = saveOrbitRecommendation;
  const updateResponsiveOrbit = useCallback(
    (
      update:
        | ResponsiveOrbitState
        | ((current: ResponsiveOrbitState) => ResponsiveOrbitState)
    ) => {
      setResponsiveOrbit((current) => {
        const next =
          typeof update === "function" ? update(current) : update;
        responsiveOrbitRef.current = next;
        return next;
      });
    },
    []
  );
  const restoreAtlasOverview = useCallback(() => {
    responsiveOrbitRequest.current += 1;
    responsiveOrbitRef.current = EMPTY_ORBIT_STATE;
    setResponsiveOrbit(EMPTY_ORBIT_STATE);
    setSelectedNodeId(null);
    setDetailSelection(null);
    setAtlasDrawerExpanded(false);
    setRestoreOverviewVersion((version) => version + 1);
  }, []);
  const requestResponsiveOrbit = useCallback(async (
    requestedSeed?: OrbitSeed,
    {
      reseeding = false,
      intent = DEFAULT_SAVE_INTENT,
    }: { reseeding?: boolean; intent?: SaveIntent } = {}
  ) => {
    const selectedNode = selectedNodeRef.current;
    if (!selectedNode) return;
    const requestId = ++responsiveOrbitRequest.current;
    const rootSeedId = selectedNode.id;
    const currentOrbit = responsiveOrbitRef.current;
    const seed: OrbitSeed = requestedSeed ?? currentOrbit.orbitSeed ?? {
      id: selectedNode.id,
      category: selectedNode.category,
      item: selectedNodeToItem(selectedNode),
    };
    updateResponsiveOrbit((current) => ({
      seedId: rootSeedId,
      orbitSeed: current.seedId === rootSeedId ? current.orbitSeed : seed,
      previewId: current.seedId === rootSeedId ? current.previewId : seed.id,
      loading: true,
      error: false,
      recommendations: current.seedId === rootSeedId ? current.recommendations : [],
    }));
    try {
      const recommendations = await findOrbitRecommendationsRef.current(
        seed,
        intent
      );
      if (responsiveOrbitRequest.current !== requestId) return;
      updateResponsiveOrbit((current) => ({
        seedId: rootSeedId,
        orbitSeed: seed,
        previewId: reseeding ? seed.id : current.previewId,
        loading: false,
        error: false,
        recommendations: recommendations.slice(0, 8),
      }));
    } catch {
      if (responsiveOrbitRequest.current !== requestId) return;
      updateResponsiveOrbit((current) => ({
        seedId: rootSeedId,
        orbitSeed: current.seedId === rootSeedId ? current.orbitSeed : seed,
        previewId: current.seedId === rootSeedId ? current.previewId : seed.id,
        loading: false,
        error: true,
        recommendations: current.seedId === rootSeedId ? current.recommendations : [],
      }));
    }
  }, [updateResponsiveOrbit]);
  const findResponsiveRecommendation = useCallback((recommendationId: string) =>
    responsiveOrbitRef.current.recommendations.find(
      (recommendation) => `${recommendation.category}:${recommendation.item.id}` === recommendationId
    ), []);
  const previewResponsiveRecommendation = useCallback((recommendationId: string) => {
    if (!findResponsiveRecommendation(recommendationId)) return;
    updateResponsiveOrbit((current) => ({ ...current, previewId: recommendationId }));
  }, [findResponsiveRecommendation, updateResponsiveOrbit]);
  const skipResponsiveRecommendation = useCallback((recommendationId: string) => {
    updateResponsiveOrbit((current) => ({
      ...current,
      previewId: current.previewId === recommendationId
        ? current.orbitSeed?.id ?? current.seedId
        : current.previewId,
      recommendations: current.recommendations.filter(
        (recommendation) => `${recommendation.category}:${recommendation.item.id}` !== recommendationId
      ),
    }));
  }, [updateResponsiveOrbit]);
  const saveResponsiveRecommendation = useCallback(async (recommendationId: string) => {
    const recommendation = findResponsiveRecommendation(recommendationId);
    const seed = responsiveOrbitRef.current.orbitSeed;
    if (!recommendation || !seed) return;
    const actionRequest = responsiveOrbitRequest.current;
    try {
      await saveOrbitRecommendationRef.current(seed, recommendation);
      if (responsiveOrbitRequest.current !== actionRequest) return;
      skipResponsiveRecommendation(recommendationId);
    } catch {
      if (responsiveOrbitRequest.current !== actionRequest) return;
      updateResponsiveOrbit((current) => ({ ...current, error: true }));
    }
  }, [findResponsiveRecommendation, skipResponsiveRecommendation, updateResponsiveOrbit]);
  const reseedResponsiveRecommendation = useCallback((recommendationId: string) => {
    const recommendation = findResponsiveRecommendation(recommendationId);
    if (!recommendation) return;
    void requestResponsiveOrbit({
      id: recommendationId,
      category: recommendation.category,
      item: recommendation.item,
    }, { reseeding: true });
  }, [findResponsiveRecommendation, requestResponsiveOrbit]);
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
            <WebDiscoveryStage category={selected ?? "movies"} activeItem={activeItem} nextItem={nextItem} loading={activeSession?.status === "loading"} reducedMotion={reducedMotion} onSkip={() => commit("skip")} onSave={() => commit("save")} onSimilar={() => activeItem && startSimilar(selected ?? "movies", activeItem)} onOpen={() => activeItem && openDetail(selected ?? "movies", activeItem)} notice={deckNotice} similarContext={activeSession?.deck.similarContext ?? null} exhausted={discovery.deckExhausted} controls={activeSession && selected ? (
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
          {panelSelection && layout !== "mobile" ? <WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} onClose={() => { setDetailSelection(null); setSelectedNodeId(null); }} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} onShare={() => void shareItem(panelSelection.category, panelSelection.item)} /> : null}
        </View>
      ) : null}
      {section === "atlas" ? (
        <View style={styles.mapWorkspace}>
          <SavedAtlasLoader
            nodes={mapSnapshot.nodes}
            edges={mapSnapshot.edges}
            selectedId={selectedNodeId}
            onSelect={selectMapNode}
            onClearSelection={restoreAtlasOverview}
            onRestoreOverview={restoreAtlasOverview}
            restoreOverviewVersion={restoreOverviewVersion}
            onStart={() => setSection("archive")}
            onRequestOrbit={requestResponsiveOrbit}
            onPreviewOrbitRecommendation={previewResponsiveRecommendation}
            onSaveOrbitRecommendation={saveResponsiveRecommendation}
            onSkipOrbitRecommendation={skipResponsiveRecommendation}
            onReseedOrbitRecommendation={reseedResponsiveRecommendation}
            layout={layout}
            reducedMotion={reducedMotion}
            responsiveRecommendations={responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.recommendations : []}
            responsiveOrbitSeed={responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.orbitSeed ?? undefined : undefined}
            responsivePreviewId={responsiveOrbit.seedId === selectedNodeId ? responsiveOrbit.previewId ?? undefined : undefined}
            responsiveRecommendationsLoading={responsiveOrbit.seedId === selectedNodeId && responsiveOrbit.loading}
            responsiveRecommendationError={responsiveOrbit.seedId === selectedNodeId && responsiveOrbit.error}
          />
          {panelSelection && (layout === "tabletLandscape" || layout === "desktop") ? <WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} presentation="rail" onClose={restoreAtlasOverview} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} similarLabel="Open discovery deck" onShare={() => void shareItem(panelSelection.category, panelSelection.item)} {...responsiveOrbitProps} /> : null}
          {panelSelection && layout === "tabletPortrait" ? <View style={styles.atlasPortraitDrawer}><WebDetailPanel item={panelSelection.item} category={panelSelection.category} detail={detail} saved={savedItems.some((item) => item.category === panelSelection.category && item.id === panelSelection.item.id)} loading={detailLoading} presentation="drawer" expanded={atlasDrawerExpanded} onToggleExpanded={() => setAtlasDrawerExpanded((expanded) => !expanded)} onClose={restoreAtlasOverview} onSave={toggleDetailSave} onSimilar={() => startSimilar(panelSelection.category, panelSelection.item)} similarLabel="Open discovery deck" onShare={() => void shareItem(panelSelection.category, panelSelection.item)} {...responsiveOrbitProps} /></View> : null}
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
      {detailSelection && layout === "mobile" ? <View style={styles.mobileDetail}><WebDetailPanel item={detailSelection.item} category={detailSelection.category} detail={detail} saved={savedItems.some((item) => item.category === detailSelection.category && item.id === detailSelection.item.id)} loading={detailLoading} presentation="sheet" onClose={section === "atlas" ? restoreAtlasOverview : () => setDetailSelection(null)} onSave={toggleDetailSave} onSimilar={() => startSimilar(detailSelection.category, detailSelection.item)} onShare={() => void shareItem(detailSelection.category, detailSelection.item)} {...responsiveOrbitProps} /></View> : null}
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
  workspace: { flex: 1, flexDirection: "row" }, workspaceMobile: { flexDirection: "column" }, workspaceMain: { flex: 1 }, mapWorkspace: { flex: 1, flexDirection: "row", position: "relative" }, atlasPortraitDrawer: { bottom: 0, left: 0, maxHeight: "80%", paddingBottom: "env(safe-area-inset-bottom)" as any, position: "absolute", right: 0, zIndex: 2 }, accountView: { alignSelf: "center", maxWidth: 720, padding: 48, width: "100%" }, accountViewMobile: { paddingHorizontal: 20, paddingVertical: 28 }, accountKicker: { color: webPalette.tangerine, fontFamily: monoFont, fontSize: 10, letterSpacing: 1.7 }, accountTitle: { color: webPalette.text, fontFamily: displayFont, fontSize: 48, fontWeight: "900", marginTop: 10 }, accountTitleMobile: { fontSize: 32, lineHeight: 36 }, accountBody: { color: webPalette.muted, fontFamily: bodyFont, fontSize: 16, lineHeight: 24, marginTop: 12 }, authCard: { backgroundColor: "#241B35", borderRadius: 24, gap: 12, marginTop: 28, maxWidth: 460, padding: 24 }, authInput: { backgroundColor: "#34264A", borderColor: webPalette.border, borderRadius: 12, borderWidth: 1, color: webPalette.text, fontFamily: bodyFont, fontSize: 16, minHeight: 48, paddingHorizontal: 14 }, authButton: { alignItems: "center", backgroundColor: webPalette.lime, borderRadius: 999, minHeight: 46, justifyContent: "center", marginTop: 4, paddingHorizontal: 20 }, authButtonText: { color: webPalette.bg, fontFamily: bodyFont, fontWeight: "900" }, authSwitch: { color: webPalette.mint, fontFamily: bodyFont, fontSize: 13, lineHeight: 44, minHeight: 44, textAlign: "center" }, authMessage: { color: webPalette.tangerine, fontFamily: bodyFont, fontSize: 13, marginTop: 5 }, mobileDetail: { bottom: 0, left: 0, maxHeight: "80%", paddingBottom: "env(safe-area-inset-bottom)" as any, position: "absolute", right: 0 },
});
