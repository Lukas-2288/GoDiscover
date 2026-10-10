module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
  setupFiles: ["<rootDir>/test/setup.js", "<rootDir>/test/liveApiEnv.js"],
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.ts",
    "<rootDir>/**/__tests__/**/*.test.tsx",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
};
