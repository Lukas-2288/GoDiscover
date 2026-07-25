const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const zustandRoot = path.dirname(require.resolve("zustand/package.json"));
const zustandCommonJsEntries = new Map([
  ["zustand", "index.js"],
  ["zustand/vanilla", "vanilla.js"],
  ["zustand/middleware", "middleware.js"],
  ["zustand/middleware/immer", "middleware/immer.js"],
  ["zustand/shallow", "shallow.js"],
  ["zustand/vanilla/shallow", "vanilla/shallow.js"],
  ["zustand/react/shallow", "react/shallow.js"],
  ["zustand/traditional", "traditional.js"],
  ["zustand/context", "context.js"],
]);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const commonJsEntry = platform === "web"
    ? zustandCommonJsEntries.get(moduleName)
    : undefined;

  if (commonJsEntry) {
    return {
      filePath: path.join(zustandRoot, commonJsEntry),
      type: "sourceFile",
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
