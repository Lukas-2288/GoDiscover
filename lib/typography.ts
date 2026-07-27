import { Platform } from 'react-native';

/**
 * One type scale for both platforms.
 *
 * The styles used to name "Bricolage Grotesque", "IBM Plex Mono" and "DM Sans"
 * directly, but none of those were ever loaded — there is no `@font-face`, no
 * webfont link and no font file for any of them, so every one of those names
 * silently fell back to the system sans. The look was coming entirely from
 * colour and layout.
 *
 * Rather than pay for three webfonts, the roles below name a deliberate system
 * stack per platform. At weight 900 the platform grotesques (SF Pro, Roboto)
 * carry the display voice perfectly well, and the cost is zero bytes.
 *
 * `mono` is the one place native does better for free: `SpaceMono` is already
 * bundled and loaded by `app/_layout.tsx`, so native uses it and the web uses
 * the system mono stack, which is close in character.
 *
 * To ship real webfonts later, this is the only file that needs to change:
 * add the `@font-face` (or `useFonts`) declarations and point these three
 * constants at the family names.
 */

export type FontRole = 'display' | 'body' | 'mono';

/** Headlines and anything set in the heavy grotesque voice. */
export const displayFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

/** Running text, labels, buttons. */
export const bodyFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

/** Kickers, badges, metadata — the small letterspaced voice. */
export const monoFont = Platform.select({
  // Already bundled and loaded, so this costs nothing extra on device.
  ios: 'SpaceMono',
  android: 'SpaceMono',
  default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}) as string;

export const fonts: Record<FontRole, string> = {
  display: displayFont,
  body: bodyFont,
  mono: monoFont,
};

/**
 * The display face only reads as a grotesque at the heavy end, and the two
 * platforms disagree about what `fontWeight: "900"` resolves to, so the weight
 * travels with the role rather than being repeated at every call site.
 */
export const displayWeight = '900' as const;

/** Kickers are uppercase, letterspaced and small — the same everywhere. */
export const kickerStyle = {
  fontFamily: monoFont,
  fontSize: 10,
  letterSpacing: 1.6,
  textTransform: 'uppercase',
} as const;
