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
  }: Record<string, unknown>) => ({
    ...props,
    ...(accessibilityLabel ? { "aria-label": accessibilityLabel } : {}),
    ...(accessibilityRole ? { role: accessibilityRole } : {}),
    ...(accessibilityViewIsModal ? { "aria-modal": true } : {}),
    ...(onPress ? { onClick: onPress } : {}),
    style: typeof style === "function" ? undefined : style,
  });
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
});
