export type AuthStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

export type AuthRuntimeFacts = {
  platform: string;
  hasWindow: boolean;
};

export type SupabaseAuthOptions = {
  storage: AuthStorage;
  autoRefreshToken: boolean;
  persistSession: boolean;
  detectSessionInUrl: false;
  flowType: "pkce";
};

export const serverAuthStorage: AuthStorage = {
  async getItem() {
    return null;
  },
  async setItem() {},
  async removeItem() {},
};

export function isWebServerRuntime(runtime: AuthRuntimeFacts): boolean {
  return runtime.platform === "web" && !runtime.hasWindow;
}

export function createSupabaseAuthOptions(
  runtime: AuthRuntimeFacts,
  persistentStorage: AuthStorage
): SupabaseAuthOptions {
  const isWebServer = isWebServerRuntime(runtime);

  return {
    storage: isWebServer ? serverAuthStorage : persistentStorage,
    autoRefreshToken: !isWebServer,
    persistSession: !isWebServer,
    detectSessionInUrl: false,
    flowType: "pkce",
  };
}
