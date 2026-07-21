module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/**/__tests__/**/*.test.ts",
    "<rootDir>/**/__tests__/**/*.test.tsx",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
};
