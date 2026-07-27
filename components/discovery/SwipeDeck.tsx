import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";

import { getCategoryTheme } from "../../lib/discovery/categoryThemes";
import { getMotionSpec } from "../../lib/discovery/motion";
import {
  resolveSwipeDecision,
  shouldClaimSwipe,
  type CardDecision,
} from "../../lib/discovery/swipeDecision";
import type { Palette } from "../../lib/theme";
import type { ContentCategory, ResultItem } from "../../types/content";
import { DiscoveryActions } from "./DiscoveryActions";
import { DiscoveryCard, type DiscoveryCardHandle } from "./DiscoveryCard";

export type SwipeDeckHandle = {
  focusActiveCard(): void;
};

export type SwipeDeckProps = {
  category: ContentCategory;
  items: readonly ResultItem[];
  palette: Palette;
  reducedMotion: boolean;
  disabled?: boolean;
  onCommit(item: ResultItem, decision: CardDecision, source: "gesture" | "button"): void;
  onOpenDetail(item: ResultItem): void;
  onSimilar(item: ResultItem): void;
  /**
   * Fires while a swipe owns the finger, so the screen can stop its ScrollView
   * scrolling underneath. Without it the page slides around mid-swipe.
   */
  onSwipeActiveChange?(active: boolean): void;
};

export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  {
    category,
    items,
    palette,
    reducedMotion,
    disabled = false,
    onCommit,
    onOpenDetail,
    onSimilar,
    onSwipeActiveChange,
  },
  forwardedRef
) {
  const { width: windowWidth } = useWindowDimensions();
  const deckWidth = Math.min(Math.max(windowWidth - 32, 0), 440);
  const visibleItems = items.slice(0, 3);
  const activeItem = visibleItems[0];
  const theme = getCategoryTheme(category);
  const pan = useRef(new Animated.ValueXY()).current;
  const activeCardRef = useRef<DiscoveryCardHandle>(null);
  const commitLocked = useRef(false);
  const swipeActive = useRef(false);
  // The deck takes the height of the card actually on top. Without this the
  // absolutely-positioned cards behind it — which can be taller, because a
  // longer title wraps to more lines — grew past the deck and painted over
  // the action row, reading as two cards stacked on screen at once.
  const [activeCardHeight, setActiveCardHeight] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);
  const motion = getMotionSpec(reducedMotion);

  useImperativeHandle(
    forwardedRef,
    () => ({
      focusActiveCard() {
        activeCardRef.current?.focus();
      },
    }),
    []
  );

  const resetPan = useCallback(() => {
    if (reducedMotion) {
      pan.setValue({ x: 0, y: 0 });
      return;
    }

    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      speed: Math.max(1, Math.round(3600 / motion.resetDurationMs)),
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [motion.resetDurationMs, pan, reducedMotion]);

  const requestCommit = useCallback(
    (decision: CardDecision, source: "gesture" | "button") => {
      if (!activeItem || disabled || commitLocked.current) return;

      commitLocked.current = true;
      setCommitting(true);
      const item = activeItem;

      const finish = ({ finished }: { finished: boolean }) => {
        pan.setValue({ x: 0, y: 0 });
        commitLocked.current = false;
        setCommitting(false);
        if (finished) onCommit(item, decision, source);
      };

      if (reducedMotion) {
        finish({ finished: true });
        return;
      }

      const direction = decision === "save" ? 1 : -1;
      Animated.timing(pan.x, {
        duration: motion.commitDurationMs,
        easing: undefined,
        toValue: direction * (deckWidth + 80),
        useNativeDriver: true,
      }).start(finish);
    },
    [activeItem, deckWidth, disabled, motion.commitDurationMs, onCommit, pan, reducedMotion]
  );

  const setSwipeActive = useCallback(
    (active: boolean) => {
      if (swipeActive.current === active) return;
      swipeActive.current = active;
      onSwipeActiveChange?.(active);
    },
    [onSwipeActiveChange]
  );

  const panResponder = useMemo(
    () => {
      const claim = (_event: GestureResponderEvent, gesture: PanResponderGestureState) =>
        !disabled &&
        !commitLocked.current &&
        shouldClaimSwipe(gesture.dx, gesture.dy);

      return PanResponder.create({
        // Claim on the *capture* phase. On the bubble phase the enclosing
        // vertical ScrollView regularly won the gesture first, which is why the
        // swipe only worked if you happened to move almost perfectly sideways.
        onMoveShouldSetPanResponderCapture: claim,
        onMoveShouldSetPanResponder: claim,
        onPanResponderGrant: () => setSwipeActive(true),
        onPanResponderMove: (_event, gesture) => {
          if (!commitLocked.current) {
            pan.setValue({ x: gesture.dx, y: gesture.dy });
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          setSwipeActive(false);
          const decision = resolveSwipeDecision({
            translationX: gesture.dx,
            velocityX: gesture.vx,
            cardWidth: deckWidth,
          });

          if (decision) {
            requestCommit(decision, "gesture");
          } else {
            resetPan();
          }
        },
        onPanResponderTerminate: () => {
          setSwipeActive(false);
          resetPan();
        },
        // The whole bug: agreeing to this let the ScrollView take the swipe
        // away part-way through, so the card stopped following the finger.
        // Once a swipe has started it belongs to the card until it ends.
        onPanResponderTerminationRequest: () => false,
      });
    },
    [deckWidth, disabled, pan, requestCommit, resetPan, setSwipeActive]
  );

  if (!activeItem) return null;

  const rotate = pan.x.interpolate({
    inputRange: [-deckWidth, 0, deckWidth],
    outputRange: [
      `${-motion.rotateDegrees}deg`,
      "0deg",
      `${motion.rotateDegrees}deg`,
    ],
    extrapolate: "clamp",
  });
  const scale = pan.x.interpolate({
    inputRange: [-deckWidth, 0, deckWidth],
    outputRange: [1 + motion.scaleDelta, 1, 1 + motion.scaleDelta],
    extrapolate: "clamp",
  });
  const saveCueOpacity = pan.x.interpolate({
    inputRange: [0, Math.max(deckWidth * 0.2, 1)],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const skipCueOpacity = pan.x.interpolate({
    inputRange: [-Math.max(deckWidth * 0.2, 1), 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const interactionsDisabled = disabled || committing;

  return (
    <View style={styles.layout}>
      <View
        style={[
          styles.deck,
          { width: deckWidth },
          activeCardHeight === null ? null : { height: activeCardHeight },
        ]}
        testID="swipe-deck"
      >
        <View
          accessibilityElementsHidden={false}
          style={[styles.cardLayer, styles.activeLayer]}
          testID="swipe-card"
        >
          <Animated.View
            {...panResponder.panHandlers}
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              // Ignore the sub-pixel jitter a re-layout produces; only a real
              // change of card should resize the deck.
              setActiveCardHeight((current) =>
                current !== null && Math.abs(current - height) < 1 ? current : height
              );
            }}
            style={[
              styles.activeCard,
              reducedMotion
                ? undefined
                : {
                    transform: [
                      { translateX: pan.x },
                      { translateY: pan.y },
                      { rotate },
                      { scale },
                    ],
                  },
            ]}
            testID="active-swipe-card"
          >
            <DiscoveryCard
              ref={activeCardRef}
              category={category}
              item={activeItem}
              palette={palette}
              active={!interactionsDisabled}
              swipeCue={null}
              onPress={() => {
                if (!commitLocked.current && !disabled) onOpenDetail(activeItem);
              }}
            />

            {!reducedMotion ? (
              <>
                <Animated.View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={[
                    styles.cue,
                    styles.saveCue,
                    { borderColor: palette.success, opacity: saveCueOpacity },
                  ]}
                >
                  <Text style={[styles.cueText, { color: palette.success }]}>SAVE</Text>
                </Animated.View>
                <Animated.View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={[
                    styles.cue,
                    styles.skipCue,
                    { borderColor: palette.danger, opacity: skipCueOpacity },
                  ]}
                >
                  <Text style={[styles.cueText, { color: palette.danger }]}>NOT FOR ME</Text>
                </Animated.View>
              </>
            ) : null}
          </Animated.View>
        </View>

        {visibleItems.slice(1).map((item, index) => (
          <View
            key={item.id}
            accessible={false}
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.cardLayer,
              styles.behindLayer,
              {
                top: (index + 1) * 10,
                transform: [{ scale: 1 - (index + 1) * 0.035 }],
                zIndex: 2 - index,
              },
            ]}
            testID="swipe-card"
          >
            <DiscoveryCard
              category={category}
              item={item}
              palette={palette}
              active={false}
              swipeCue={null}
              onPress={() => {}}
            />
          </View>
        ))}
      </View>

      <DiscoveryActions
        disabled={interactionsDisabled}
        palette={palette}
        accent={theme.accent}
        onAccent={theme.onAccent}
        onSave={() => requestCommit("save", "button")}
        onSkip={() => requestCommit("skip", "button")}
        onSimilar={() => {
          if (!commitLocked.current && !disabled) onSimilar(activeItem);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  layout: {
    alignItems: "center",
    gap: 22,
    width: "100%",
  },
  deck: {
    alignSelf: "center",
    overflow: "hidden",
    position: "relative",
  },
  cardLayer: {
    width: "100%",
  },
  activeLayer: {
    zIndex: 3,
  },
  activeCard: {
    width: "100%",
  },
  behindLayer: {
    bottom: 0,
    left: 0,
    // `bottom: 0` alongside the `top` offset each card sets pins the behind
    // cards inside the deck rather than letting them size themselves.
    overflow: "hidden",
    position: "absolute",
    width: "100%",
  },
  cue: {
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 12,
    borderWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: "absolute",
    top: 104,
  },
  saveCue: {
    left: 22,
    transform: [{ rotate: "-8deg" }],
  },
  skipCue: {
    right: 22,
    transform: [{ rotate: "8deg" }],
  },
  cueText: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
});
