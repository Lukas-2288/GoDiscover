import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
import { DiscoveryCard } from "./DiscoveryCard";

export type SwipeDeckProps = {
  category: ContentCategory;
  items: readonly ResultItem[];
  palette: Palette;
  reducedMotion: boolean;
  disabled?: boolean;
  onCommit(item: ResultItem, decision: CardDecision, source: "gesture" | "button"): void;
  onOpenDetail(item: ResultItem): void;
  onSimilar(item: ResultItem): void;
};

export function SwipeDeck({
  category,
  items,
  palette,
  reducedMotion,
  disabled = false,
  onCommit,
  onOpenDetail,
  onSimilar,
}: SwipeDeckProps) {
  const { width: windowWidth } = useWindowDimensions();
  const deckWidth = Math.min(Math.max(windowWidth - 32, 0), 440);
  const visibleItems = items.slice(0, 3);
  const activeItem = visibleItems[0];
  const theme = getCategoryTheme(category);
  const pan = useRef(new Animated.ValueXY()).current;
  const commitLocked = useRef(false);
  const [committing, setCommitting] = useState(false);
  const motion = getMotionSpec(reducedMotion);

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

      const finish = () => {
        pan.setValue({ x: 0, y: 0 });
        commitLocked.current = false;
        setCommitting(false);
        onCommit(item, decision, source);
      };

      if (reducedMotion) {
        finish();
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !disabled && !commitLocked.current && shouldClaimSwipe(gesture.dx, gesture.dy),
        onPanResponderMove: (_event, gesture) => {
          if (!commitLocked.current) {
            pan.setValue({ x: gesture.dx, y: gesture.dy });
          }
        },
        onPanResponderRelease: (_event, gesture) => {
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
        onPanResponderTerminate: resetPan,
        onPanResponderTerminationRequest: () => true,
      }),
    [deckWidth, disabled, pan, requestCommit, resetPan]
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
      <View style={[styles.deck, { width: deckWidth }]} testID="swipe-deck">
        <View
          accessibilityElementsHidden={false}
          style={[styles.cardLayer, styles.activeLayer]}
          testID="swipe-card"
        >
          <Animated.View
            {...panResponder.panHandlers}
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
}

const styles = StyleSheet.create({
  layout: {
    alignItems: "center",
    gap: 22,
    width: "100%",
  },
  deck: {
    alignSelf: "center",
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
    left: 0,
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
