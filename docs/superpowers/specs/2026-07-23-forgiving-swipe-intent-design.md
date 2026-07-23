# Forgiving Swipe Intent Design

## Goal

Make left and right card swipes register reliably when a thumb moves on a
natural diagonal, without turning mostly vertical page movement into a card
decision.

## Current behavior and root cause

`SwipeDeck` asks `shouldClaimSwipe` whether the card should take ownership of a
touch gesture. The current rule requires at least eight points of horizontal
movement and requires that movement to be 20 percent greater than the vertical
movement. A moderate diagonal therefore never reaches the card's release
handler, even when the user's final horizontal distance or velocity clearly
means Save or Skip.

## Considered approaches

1. Remove the direction check and claim every gesture after eight horizontal
   points. This is simple, but it would frequently steal vertical scrolling.
2. Loosen the direction lock while retaining a vertical-intent guard. This
   accepts ordinary diagonal swipes and preserves strongly vertical movement.
   This is the selected approach because it directly addresses the failed
   gesture-ownership decision without changing the rest of the deck.
3. Replace `PanResponder` with a different gesture library. That could provide
   richer gesture composition, but it would add dependency and integration
   risk that this focused bug does not justify.

## Design

Keep the existing eight-point activation floor. Claim the gesture when the
horizontal component is at least 80 percent of the vertical component. This
accepts moderate diagonals such as 12 horizontal points by 14 vertical points,
while rejecting strongly vertical movement such as 12 by 20.

Once the gesture is claimed, keep the existing decision rules:

- Commit by horizontal distance at 24 percent of card width.
- Commit by horizontal velocity at 0.75.
- Use the final horizontal translation, or velocity for a short flick, to
  choose Save versus Skip.
- Reset below-threshold drags to the center.

No API, data, accessibility, animation, or saved-item semantics change.

## Testing

Add focused unit cases proving that `12, 14` and `-12, 14` movement are claimed
and that `12, 20` remains unclaimed. Keep the existing boundary, distance,
velocity, component, route, and full-suite tests. Perform a focused gesture
test followed by full branch verification.

## Success criteria

- Moderate diagonal swipes can reach the existing left/right release decision.
- Clearly vertical movement does not claim the deck gesture.
- Buttons remain a complete non-gesture alternative.
- Existing Save, Skip, Undo, animation, and accessibility behavior remains
  unchanged.
