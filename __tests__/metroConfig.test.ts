jest.mock("expo/metro-config", () => ({
  getDefaultConfig: () => ({ resolver: {} }),
}));

const metroConfig = require("../metro.config.js") as {
  resolver: {
    resolveRequest(
      context: {
        resolveRequest(
          context: unknown,
          moduleName: string,
          platform: string | null
        ): unknown;
      },
      moduleName: string,
      platform: string | null
    ): { filePath: string; type: string } | unknown;
  };
};

describe("Metro web dependency resolution", () => {
  it.each([
    ["zustand", "/zustand/index.js"],
    ["zustand/vanilla", "/zustand/vanilla.js"],
    ["zustand/shallow", "/zustand/shallow.js"],
    ["zustand/traditional", "/zustand/traditional.js"],
  ])("routes %s to its CommonJS entry on web", (request, suffix) => {
    const fallback = jest.fn();

    const result = metroConfig.resolver.resolveRequest(
      { resolveRequest: fallback },
      request,
      "web"
    );

    expect(result).toEqual({
      filePath: expect.stringMatching(
        new RegExp(`${suffix.replaceAll("/", "\\/")}$`)
      ),
      type: "sourceFile",
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("leaves native and unrelated resolution on Metro's default path", () => {
    const fallback = jest.fn(() => ({ filePath: "default", type: "sourceFile" }));
    const context = { resolveRequest: fallback };

    expect(
      metroConfig.resolver.resolveRequest(context, "zustand/traditional", "ios")
    ).toEqual({ filePath: "default", type: "sourceFile" });
    expect(
      metroConfig.resolver.resolveRequest(context, "react", "web")
    ).toEqual({ filePath: "default", type: "sourceFile" });
    expect(fallback).toHaveBeenCalledTimes(2);
  });
});
