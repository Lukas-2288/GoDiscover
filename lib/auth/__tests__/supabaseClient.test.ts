import { authenticatedFetch, createSupabaseClient } from "../supabaseClient";
import { createSupabaseAuthOptions } from "../storage";

const ANON_KEY = "anon-key";
const PROJECT_URL = "https://abcdefgh.supabase.co";

const memoryStorage = () => {
  const entries = new Map<string, string>();
  return {
    getItem: async (key: string) => entries.get(key) ?? null,
    setItem: async (key: string, value: string) => void entries.set(key, value),
    removeItem: async (key: string) => void entries.delete(key),
  };
};

const authOptions = () =>
  createSupabaseAuthOptions(
    { platform: "web", hasWindow: true },
    memoryStorage()
  );

// Typed so `mock.calls[n][1]` is a RequestInit rather than an empty tuple.
const recordingFetch = (body: string | null = null) =>
  jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body, { status: 200 })
  );

const headersOf = (
  call: [RequestInfo | URL, RequestInit?] | undefined
): Headers => new Headers(call?.[1]?.headers);

const sessionWith = (token: string) => ({
  data: { session: { access_token: token } },
});

describe("authenticatedFetch", () => {
  // The whole reason this wrapper exists. Binding the token once means the
  // saved-items upserts start failing with an RLS rejection an hour into a
  // session, which is the kind of bug that only shows up in production.
  it("resolves the access token on every request, not once", async () => {
    const getSession = jest
      .fn()
      .mockResolvedValueOnce(sessionWith("first-token"))
      .mockResolvedValueOnce(sessionWith("refreshed-token"));
    const baseFetch = recordingFetch();

    const wrapped = authenticatedFetch(
      ANON_KEY,
      { getSession } as never,
      baseFetch as never
    );
    await wrapped("https://example.test/rest/v1/saved_items");
    await wrapped("https://example.test/rest/v1/saved_items");

    const tokens = baseFetch.mock.calls.map((call) =>
      headersOf(call).get("Authorization")
    );
    expect(tokens).toEqual([
      "Bearer first-token",
      "Bearer refreshed-token",
    ]);
  });

  it("sends the anon key when nobody is signed in", async () => {
    const getSession = jest.fn().mockResolvedValue({ data: { session: null } });
    const baseFetch = recordingFetch();

    const wrapped = authenticatedFetch(
      ANON_KEY,
      { getSession } as never,
      baseFetch as never
    );
    await wrapped("https://example.test/rest/v1/saved_items");

    const headers = headersOf(baseFetch.mock.calls[0]);
    expect(headers.get("Authorization")).toBe(`Bearer ${ANON_KEY}`);
    expect(headers.get("apikey")).toBe(ANON_KEY);
  });

  it("keeps an explicitly supplied Authorization header", async () => {
    const getSession = jest.fn().mockResolvedValue(sessionWith("session-token"));
    const baseFetch = recordingFetch();

    const wrapped = authenticatedFetch(
      ANON_KEY,
      { getSession } as never,
      baseFetch as never
    );
    await wrapped("https://example.test/rest/v1/saved_items", {
      headers: { Authorization: "Bearer caller-token" },
    });

    expect(headersOf(baseFetch.mock.calls[0]).get("Authorization")).toBe(
      "Bearer caller-token"
    );
  });

  it("preserves the rest of the request init", async () => {
    const getSession = jest.fn().mockResolvedValue(sessionWith("token"));
    const baseFetch = recordingFetch();

    const wrapped = authenticatedFetch(
      ANON_KEY,
      { getSession } as never,
      baseFetch as never
    );
    await wrapped("https://example.test/rest/v1/saved_items", {
      method: "POST",
      body: '{"id":"1"}',
    });

    const init = baseFetch.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"id":"1"}');
  });
});

describe("createSupabaseClient", () => {
  // supabase-js stores the session under a key derived from the project ref.
  // Deriving it any other way signs every already-signed-in user out.
  it("keeps the storage key supabase-js used", () => {
    const client = createSupabaseClient(PROJECT_URL, ANON_KEY, {
      auth: authOptions(),
    });
    expect((client.auth as unknown as { storageKey: string }).storageKey).toBe(
      "sb-abcdefgh-auth-token"
    );
  });

  it("points auth at the project's auth endpoint", () => {
    const client = createSupabaseClient(PROJECT_URL, ANON_KEY, {
      auth: authOptions(),
    });
    expect((client.auth as unknown as { url: string }).url).toBe(
      `${PROJECT_URL}/auth/v1`
    );
  });

  it("tolerates a project URL with a trailing slash", () => {
    const client = createSupabaseClient(`${PROJECT_URL}/`, ANON_KEY, {
      auth: authOptions(),
    });
    expect((client.auth as unknown as { storageKey: string }).storageKey).toBe(
      "sb-abcdefgh-auth-token"
    );
  });

  it("applies the app's auth options rather than the library defaults", () => {
    const client = createSupabaseClient(PROJECT_URL, ANON_KEY, {
      auth: createSupabaseAuthOptions(
        { platform: "web", hasWindow: false },
        memoryStorage()
      ),
    });
    const auth = client.auth as unknown as {
      autoRefreshToken: boolean;
      persistSession: boolean;
      flowType: string;
    };
    // Server-side rendering must not try to persist or refresh a session.
    expect(auth.autoRefreshToken).toBe(false);
    expect(auth.persistSession).toBe(false);
    expect(auth.flowType).toBe("pkce");
  });

  it("exposes a working PostgREST query builder", () => {
    const client = createSupabaseClient(PROJECT_URL, ANON_KEY, {
      auth: authOptions(),
    });
    expect(typeof client.from("saved_items").upsert).toBe("function");
  });

  it("sends the live session token on a PostgREST request", async () => {
    const baseFetch = recordingFetch('[]');
    const client = createSupabaseClient(PROJECT_URL, ANON_KEY, {
      auth: authOptions(),
      fetch: baseFetch as never,
    });
    jest
      .spyOn(client.auth, "getSession")
      .mockResolvedValue(sessionWith("live-token") as never);

    await client.from("saved_items").select("id");

    const call = baseFetch.mock.calls[0];
    expect(String(call[0])).toContain(`${PROJECT_URL}/rest/v1/saved_items`);
    expect(headersOf(call).get("Authorization")).toBe("Bearer live-token");
  });
});
