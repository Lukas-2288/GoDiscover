const mockMakeRedirectUri = jest.fn(() => "godiscover://auth");
const mockOpenAuthSessionAsync = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockExchangeCodeForSession = jest.fn();
const mockSetSession = jest.fn();

jest.mock("expo-auth-session", () => ({
  makeRedirectUri: () => mockMakeRedirectUri(),
}));

jest.mock("expo-web-browser", () => ({
  // Runs at oauth.ts module load, before the mock consts below initialize.
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: (url: string, redirectTo: string) =>
    mockOpenAuthSessionAsync(url, redirectTo),
}));

jest.mock("../../supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (options: unknown) => mockSignInWithOAuth(options),
      exchangeCodeForSession: (code: string) => mockExchangeCodeForSession(code),
      setSession: (tokens: unknown) => mockSetSession(tokens),
    },
  },
}));

import { signInWithGoogle } from "../oauth";

// The OAuth callback URL carries the credentials themselves: a PKCE `code`, or
// `access_token`/`refresh_token` in the fragment. Logging the redirect target or
// the WebBrowser result writes those into the browser console, where any script
// on the page — or anyone the user sends a screenshot to — can read them.
describe("signInWithGoogle", () => {
  const consoleMethods = ["log", "warn", "error", "info", "debug"] as const;
  let spies: jest.SpyInstance[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    spies = consoleMethods.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined)
    );
    mockSignInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/authorize?state=xyz" },
      error: null,
    });
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockSetSession.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
  });

  function expectNoConsoleOutput() {
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  }

  it("never logs the callback URL during a PKCE code exchange", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "godiscover://auth?code=super-secret-authorization-code",
    });

    await signInWithGoogle();

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith(
      "super-secret-authorization-code"
    );
    expectNoConsoleOutput();
  });

  it("never logs the callback URL during an implicit token grant", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "godiscover://auth#access_token=secret-access&refresh_token=secret-refresh",
    });

    await signInWithGoogle();

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: "secret-access",
      refresh_token: "secret-refresh",
    });
    expectNoConsoleOutput();
  });

  it("stays silent when the user cancels", async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "dismiss" });

    await expect(signInWithGoogle()).rejects.toThrow("Sign-in cancelled");

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expectNoConsoleOutput();
  });
});
