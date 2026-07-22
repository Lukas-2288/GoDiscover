import {
  activeDeckItem,
  createInitialDiscoveryDeckState,
  discoveryDeckReducer,
} from "../state";

describe("discovery state compatibility export", () => {
  it("exposes the deck state API from the stable state path", () => {
    expect(createInitialDiscoveryDeckState).toBeDefined();
    expect(discoveryDeckReducer).toBeDefined();
    expect(activeDeckItem).toBeDefined();
  });
});
