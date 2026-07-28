module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|d3-force|d3-quadtree|d3-dispatch|d3-timer))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
  moduleNameMapper: {
    "^d3-timer$": "<rootDir>/test/d3TimerSync.js",
  },
  setupFiles: ["<rootDir>/test/setup.js", "<rootDir>/test/liveApiEnv.js"],
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.ts",
    "<rootDir>/**/__tests__/**/*.test.tsx",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
};
