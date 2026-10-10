import { toPlainText } from "../richText";

describe("toPlainText", () => {
  // Verbatim from the Open Library record that shipped to a real phone reading
  // "<p><i>King Solomon's Mines</i> was published in September 1885…".
  it("cleans the Open Library HTML that reached a real device", () => {
    const raw =
      "<p><i>King Solomon's Mines</i> was published in September 1885, becoming " +
      "an immediate best seller.</p>\n            <p><a href=\"https://" +
      'standardebooks.org/ebooks/h-rider-haggard">Haggard</a> wrote the novel ' +
      'on a bet with his brother to match <a href="https://standardebooks.org/' +
      'ebooks/robert-louis-stevenson"><i>Treasure Island</i></a>. It influenced ' +
      '<a href="https://standardebooks.org/ebooks/h-p-lovecraft"><abbr>H. P.' +
      "</abbr> Lovecraft</a>.</p>";

    const cleaned = toPlainText(raw);

    expect(cleaned).not.toMatch(/[<>]/);
    expect(cleaned).not.toContain("href");
    expect(cleaned).not.toContain("standardebooks.org");
    expect(cleaned).toContain("King Solomon's Mines was published");
    // The link text survives; only the markup around it goes.
    expect(cleaned).toContain("Haggard wrote the novel");
    expect(cleaned).toContain("H. P. Lovecraft");
  });

  it("keeps paragraph breaks so long prose stays readable", () => {
    expect(toPlainText("<p>First.</p><p>Second.</p>")).toBe("First.\n\nSecond.");
    expect(toPlainText("One<br>Two")).toBe("One\nTwo");
  });

  it("strips Discogs bracket markup, keeping the words", () => {
    const raw =
      "[b]Brian Eno[/b] is an English musician. Worked with [a=David Bowie] " +
      "and [l=Virgin Records]. See [url=https://example.com/eno]his site[/url].";

    const cleaned = toPlainText(raw);

    expect(cleaned).toBe(
      "Brian Eno is an English musician. Worked with David Bowie and Virgin Records. See his site."
    );
  });

  it("drops bare Discogs id references, which have no readable label", () => {
    expect(toPlainText("Produced by [a123] for [l456].")).toBe(
      "Produced by for ."
    );
  });

  it("keeps the address when a Discogs link has no label", () => {
    expect(toPlainText("[url]https://example.com[/url]")).toBe(
      "https://example.com"
    );
  });

  it("decodes the entities these providers actually emit", () => {
    expect(toPlainText("Rock &amp; Roll")).toBe("Rock & Roll");
    expect(toPlainText("&quot;Heroes&quot;")).toBe('"Heroes"');
    expect(toPlainText("It&#39;s here")).toBe("It's here");
    expect(toPlainText("caf&#xe9;")).toBe("café");
  });

  // Better to show a stray ampersand than to mangle real prose.
  it("leaves an unrecognised entity alone rather than guessing", () => {
    expect(toPlainText("Look &weird; here")).toBe("Look &weird; here");
  });

  it("removes Open Library's source-credit footnote", () => {
    const raw =
      "A novel about a lighthouse.\n\n([source][1])\n\n[1]: https://example.com/x";
    expect(toPlainText(raw)).toBe("A novel about a lighthouse.");
  });

  // TMDB overviews are already clean and must survive untouched.
  it("passes plain prose through unchanged", () => {
    const plain =
      "A linguist is recruited by the military to communicate with alien lifeforms.";
    expect(toPlainText(plain)).toBe(plain);
  });

  it("handles the empty cases a missing description produces", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText("   \n\n  ")).toBe("");
  });

  it("never keeps the contents of a script or style block", () => {
    expect(toPlainText("Hi<script>alert(1)</script>there")).toBe("Hithere");
  });

  it("collapses the runaway whitespace HTML indentation leaves behind", () => {
    expect(toPlainText("<p>One.</p>\n            <p>Two.</p>")).toBe(
      "One.\n\nTwo."
    );
  });
});
