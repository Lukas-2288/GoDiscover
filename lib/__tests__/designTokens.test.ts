import { darkPalette, lightPalette, type Palette } from "../theme";
import { bodyFont, displayFont, monoFont } from "../typography";
import { webPalette } from "../../components/web/WebHomeScreen";

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("shared design tokens", () => {
  // The point of Phase 1: the site used to declare its own colour literals, so
  // the two could drift by editing one file and forgetting the other.
  it("derives the web palette from the shared dark palette", () => {
    expect(webPalette.bg).toBe(darkPalette.bg);
    expect(webPalette.text).toBe(darkPalette.text);
    expect(webPalette.muted).toBe(darkPalette.textMuted);
    expect(webPalette.lime).toBe(darkPalette.lime);
    expect(webPalette.mint).toBe(darkPalette.mint);
    expect(webPalette.tangerine).toBe(darkPalette.tangerine);
    expect(webPalette.border).toBe(darkPalette.border);
  });

  // The one field that does not map by name, and the one most likely to be
  // "fixed" wrongly by a future reader.
  it("maps the web card face to cream, not to the dark panel", () => {
    expect(webPalette.surface).toBe(darkPalette.cream);
    expect(webPalette.surface).not.toBe(darkPalette.surface);
  });

  describe.each([
    ["dark", darkPalette],
    ["light", lightPalette],
  ])("%s palette", (_name, palette: Palette) => {
    // `accent` is used two ways: as a fill with `onAccent` written on it, and
    // as a foreground for icons and links. It has to be legible either way.
    // Lime is the trap here — it is 14.95:1 on the violet ground and 1.4:1 on
    // cream, so it cannot be the accent in both schemes.
    it("keeps the accent legible as a foreground on the page", () => {
      expect(contrast(palette.accent, palette.bg)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps label text legible on the accent fill", () => {
      expect(contrast(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(
        4.5
      );
    });

    it("keeps body and muted text legible on the page", () => {
      expect(contrast(palette.text, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.textMuted, palette.bg)).toBeGreaterThanOrEqual(
        4.5
      );
    });

    it("keeps the tangerine and danger accents legible on the page", () => {
      expect(contrast(palette.tangerine, palette.bg)).toBeGreaterThanOrEqual(
        4.5
      );
      expect(contrast(palette.danger, palette.bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe("typography", () => {
  // The three names the styles used to ask for were never loaded anywhere, so
  // they silently fell back to system sans. Nothing should reintroduce them.
  it("resolves every role to a real stack rather than a phantom family", () => {
    for (const font of [displayFont, bodyFont, monoFont]) {
      expect(typeof font).toBe("string");
      expect(font.length).toBeGreaterThan(0);
      expect(font).not.toMatch(/Bricolage Grotesque|IBM Plex Mono|DM Sans/);
    }
  });
});
