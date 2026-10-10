import {
  DEFAULT_TTL_MS,
  MAX_ENTRIES,
  cachedRequest,
  clearRequestCache,
  requestCacheSize,
} from "../requestCache";

beforeEach(() => {
  clearRequestCache();
});

describe("request cache", () => {
  it("serves a repeat request without hitting the network again", async () => {
    const load = jest.fn(async () => ({ title: "Arrival" }));

    await expect(cachedRequest("a", load)).resolves.toEqual({ title: "Arrival" });
    await expect(cachedRequest("a", load)).resolves.toEqual({ title: "Arrival" });

    expect(load).toHaveBeenCalledTimes(1);
  });

  // The map queries four categories at once and the deck tops up while a detail
  // loads, so overlapping identical requests happen even on a first visit.
  it("collapses concurrent identical requests into one", async () => {
    let resolve: (value: string) => void = () => undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((finish) => {
          resolve = finish;
        })
    );

    const first = cachedRequest("b", load);
    const second = cachedRequest("b", load);
    resolve("shared");

    expect(await first).toBe("shared");
    expect(await second).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys apart", async () => {
    const load = jest.fn(async (key: string) => key);
    await cachedRequest("x", () => load("x"));
    await cachedRequest("y", () => load("y"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("refetches once the entry has expired", async () => {
    const load = jest.fn(async () => "value");
    let clock = 1_000;
    const now = () => clock;

    await cachedRequest("c", load, { now });
    clock += DEFAULT_TTL_MS + 1;
    await cachedRequest("c", load, { now });

    expect(load).toHaveBeenCalledTimes(2);
  });

  // A remembered failure would turn a blip into a lasting outage.
  it("does not cache a rejection", async () => {
    const load = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("recovered");

    await expect(cachedRequest("d", load)).rejects.toThrow("offline");
    await expect(cachedRequest("d", load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops a long session growing the cache without limit", async () => {
    for (let index = 0; index < MAX_ENTRIES + 25; index += 1) {
      await cachedRequest(`key-${index}`, async () => index);
    }
    expect(requestCacheSize()).toBeLessThanOrEqual(MAX_ENTRIES);
  });
});
