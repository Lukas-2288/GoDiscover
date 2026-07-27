/**
 * Turns provider prose into something safe to drop into a `<Text>`.
 *
 * Two of the four providers hand back marked-up strings and the app rendered
 * them raw, so a book description arrived on screen as literal
 * `<p><i>King Solomon's Mines</i> was published…`:
 *
 * - **Open Library** returns real HTML — `<p>`, `<i>`, `<abbr>`, and `<a href>`
 *   links to standardebooks.org.
 * - **Discogs** returns its own bracket markup — `[b]bold[/b]`, `[a=Artist]`,
 *   `[l=Label]`, `[url=https://…]label[/url]`.
 *
 * Cleaning happens at the adapter boundary rather than at each render site, so
 * both platforms get it from one place and the rules are tested once.
 */

/** The entities Open Library actually emits, plus the numeric forms. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  '#8217': "’",
  '#8216': "‘",
  '#8220': "“",
  '#8221': "”",
  '#8212': "—",
  '#8230': "…",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    if (named !== undefined) return named;
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    // An entity we do not know is likelier to be literal text than a mistake.
    return whole;
  });
}

/**
 * Discogs bracket markup. Link-ish tags carry the label worth keeping after the
 * `=`, so `[a=Brian Eno]` becomes "Brian Eno" rather than disappearing.
 */
function stripDiscogsMarkup(value: string): string {
  return (
    value
      // [url=https://…]Label[/url] — keep the label, drop the target.
      .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, "$1")
      // Bare [url]https://…[/url] has no label; the address is all there is.
      .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1")
      // [a=Name], [l=Label], [m=123], [r=456] — keep a name, drop a bare id.
      .replace(/\[[almr]=([^\]]+)\]/gi, "$1")
      .replace(/\[[almr]\d+\]/gi, "")
      // Formatting pairs: [b], [i], [u], [s] and their closers.
      .replace(/\[\/?[biusq](?:=[^\]]*)?\]/gi, "")
  );
}

function stripHtml(value: string): string {
  return (
    value
      // Block boundaries become paragraph breaks so the prose keeps its shape.
      .replace(/<\/(?:p|div|li|h[1-6]|blockquote)\s*>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Never keep the contents of these — they are not prose.
      .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
  );
}

/**
 * Open Library often appends a source credit as a markdown-style link
 * reference, e.g. "…([source][1])\n\n[1]: https://…". It is metadata about the
 * text rather than part of it.
 */
function stripSourceFootnotes(value: string): string {
  return value
    .replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, "")
    .replace(/\(\[[^\]]*\]\[\d+\]\)/g, "");
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    // Spaces and tabs collapse; newlines are meaningful and handled next.
    .replace(/[^\S\n]+/g, " ")
    // Three or more newlines is never intentional paragraphing.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
    .trim();
}

/**
 * Safe on text that has no markup at all — TMDB overviews pass through
 * unchanged apart from whitespace tidying.
 */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return "";
  const withoutMarkup = stripDiscogsMarkup(stripHtml(value));
  return collapseWhitespace(decodeEntities(stripSourceFootnotes(withoutMarkup)));
}
