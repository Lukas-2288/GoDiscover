/**
 * @jest-environment jsdom
 */

import React, { act } from "react";
// @ts-expect-error React DOM is a runtime dependency; this project does not ship its optional test-only declarations.
import { createRoot } from "react-dom/client";

jest.mock("@expo/vector-icons/FontAwesome", () => () => null);
jest.mock("react-native", () => {
  const React = require("react");
  const mapProps = ({
    accessibilityLabel,
    accessibilityRole,
    accessibilityViewIsModal,
    onPress,
    style,
    ...props
  }: Record<string, unknown>) => {
    const normalizedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : typeof style === "function"
        ? undefined
        : style;
    return {
      ...props,
      ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
      ...(accessibilityRole ? { role: accessibilityRole } : {}),
      ...(accessibilityViewIsModal ? { "aria-modal": true } : {}),
      ...(onPress ? { onClick: onPress } : {}),
      style: normalizedStyle,
    };
  };
  const primitive = (tag: string) => React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(tag, { ...mapProps(props), ref })
  );
  return {
    Pressable: primitive("button"),
    ScrollView: primitive("div"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: primitive("span"),
    View: primitive("div"),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

import { WebDetailPanel } from "../WebHomeScreen";

describe("WebDetailPanel sheet semantics", () => {
  it("isolates focus in a named dialog, closes with Escape, and restores its trigger", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open atlas detail";
    document.body.appendChild(trigger);
    trigger.focus();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onClose = jest.fn();

    act(() => {
      root.render(
        <WebDetailPanel
          item={{ id: "arrival", title: "Arrival", subtitle: "Denis Villeneuve", meta: "2016" }}
          category="movies"
          detail={null}
          saved
          loading={false}
          presentation="sheet"
          onClose={onClose}
          onSave={jest.fn()}
          onSimilar={jest.fn()}
        />
      );
    });

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Arrival details");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close details");

    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    host.remove();
  });

  it("wraps Tab focus inside the sheet", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <WebDetailPanel
          item={{ id: "arrival", title: "Arrival", subtitle: "Denis Villeneuve", meta: "2016" }}
          category="movies"
          detail={null}
          saved
          loading={false}
          presentation="sheet"
          onClose={jest.fn()}
          onSave={jest.fn()}
          onSimilar={jest.fn()}
          onShare={jest.fn()}
        />
      );
    });

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>("button") ?? []);
    focusable.at(-1)?.focus();
    act(() => {
      focusable.at(-1)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(focusable[0]);

    focusable[0]?.focus();
    act(() => {
      focusable[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(focusable.at(-1));

    act(() => root.unmount());
    host.remove();
  });

  it("exposes 44px Preview, Save, Skip, and Reseed controls for each responsive result", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onPreview = jest.fn();
    const onSave = jest.fn();
    const onSkip = jest.fn();
    const onReseed = jest.fn();
    act(() => {
      root.render(
        <WebDetailPanel
          item={{ id: "arrival", title: "Arrival", subtitle: "Denis Villeneuve", meta: "2016" }}
          category="movies"
          detail={null}
          saved
          loading={false}
          presentation="sheet"
          onClose={jest.fn()}
          onSave={jest.fn()}
          onSimilar={jest.fn()}
          atlasRecommendations={[{
            id: "books:story",
            title: "Story of Your Life",
            reason: "Shared speculative language",
          }]}
          onPreviewAtlasRecommendation={onPreview}
          onSaveAtlasRecommendation={onSave}
          onSkipAtlasRecommendation={onSkip}
          onReseedAtlasRecommendation={onReseed}
        />
      );
    });

    const actions = [
      ["Preview Story of Your Life in atlas", onPreview],
      ["Save Story of Your Life to map", onSave],
      ["Skip Story of Your Life", onSkip],
      ["Reseed from Story of Your Life", onReseed],
    ] as const;
    actions.forEach(([label, callback]) => {
      const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button?.style.minHeight).toBe("44px");
      act(() => button?.click());
      expect(callback).toHaveBeenCalledWith("books:story");
    });

    act(() => root.unmount());
    host.remove();
  });
});
