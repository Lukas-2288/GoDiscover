import {
  createSupabaseAuthOptions,
  serverAuthStorage,
  type AuthStorage,
} from "../storage";

function createPersistentStorage(): AuthStorage {
  return {
    getItem: jest.fn(async () => "persisted-session"),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  };
}

describe("createSupabaseAuthOptions", () => {
  it("uses stateless storage and disables persistence during web SSR", async () => {
    const persistentStorage = createPersistentStorage();

    const options = createSupabaseAuthOptions(
      { platform: "web", hasWindow: false },
      persistentStorage
    );

    expect(options.storage).toBe(serverAuthStorage);
    expect(options.persistSession).toBe(false);
    expect(options.autoRefreshToken).toBe(false);
    await expect(options.storage.getItem("session")).resolves.toBeNull();
    await expect(options.storage.setItem("session", "secret")).resolves.toBeUndefined();
    await expect(options.storage.removeItem("session")).resolves.toBeUndefined();
    expect(persistentStorage.getItem).not.toHaveBeenCalled();
  });

  it.each([
    ["ios", false],
    ["android", false],
    ["web", true],
  ])("uses persistent storage on %s when hasWindow=%s", (platform, hasWindow) => {
    const persistentStorage = createPersistentStorage();

    const options = createSupabaseAuthOptions(
      { platform, hasWindow },
      persistentStorage
    );

    expect(options.storage).toBe(persistentStorage);
    expect(options.persistSession).toBe(true);
    expect(options.autoRefreshToken).toBe(true);
    expect(options.detectSessionInUrl).toBe(false);
    expect(options.flowType).toBe("pkce");
  });
});
