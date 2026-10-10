import { supabase } from '../supabase';

/**
 * Ownership plumbing shared by every per-account store.
 *
 * Extracted from `saved.ts` so rejections and anything added later reuse the
 * same revalidation discipline rather than reimplementing it. The rule these
 * helpers exist to enforce: an operation belongs to the account that was signed
 * in when the user acted, and every await afterwards is a window for that to
 * change.
 */

export async function getActiveOwnerId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Raised when the signed-in account changed while an operation was in flight.
 * The operation is abandoned rather than completed against whoever is now
 * active.
 */
export class OwnerChangedError extends Error {
  readonly name = 'SavedOwnerChangedError';

  constructor(
    readonly expectedOwnerId: string | null,
    readonly activeOwnerId: string | null
  ) {
    super('Owner changed while the operation was in flight');
  }
}

/**
 * Revalidates the owner an operation was started for. Call after every awaited
 * storage or network boundary and before any write — checking once on entry
 * leaves every later await unguarded.
 */
export async function assertOwnerUnchanged(
  expectedOwnerId: string | null
): Promise<void> {
  const activeOwnerId = await getActiveOwnerId();
  if (activeOwnerId !== expectedOwnerId) {
    throw new OwnerChangedError(expectedOwnerId, activeOwnerId);
  }
}

/** Owner-partitioned storage key. Signed-out data lives under `:anonymous`. */
export function ownerScopedKey(prefix: string, ownerId: string | null): string {
  return ownerId
    ? `${prefix}:owner:${encodeURIComponent(ownerId)}`
    : `${prefix}:anonymous`;
}

/**
 * Serializes access to a shared resource so two owners cannot claim it at once.
 * Used for the anonymous buckets, which any sign-in wants to take over.
 */
export function createClaimQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function claim<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}
