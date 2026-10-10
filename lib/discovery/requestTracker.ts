import type { ContentCategory } from "../../types/content";
import type { DiscoveryRequestIdentity } from "./state";

export type DiscoveryRequestTracker = {
  start: (category: ContentCategory) => DiscoveryRequestIdentity;
  invalidate: () => void;
  isCurrent: (request: DiscoveryRequestIdentity) => boolean;
};

export function createDiscoveryRequestTracker(): DiscoveryRequestTracker {
  let sequence = 0;
  let current: DiscoveryRequestIdentity | null = null;

  return {
    start(category) {
      current = { id: ++sequence, category };
      return current;
    },
    invalidate() {
      sequence += 1;
      current = null;
    },
    isCurrent(request) {
      return current?.id === request.id && current.category === request.category;
    },
  };
}
