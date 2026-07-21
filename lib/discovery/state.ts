import type { ContentCategory, ResultItem } from "../../types/content";

export type DiscoveryActionMode = "search" | "filter" | "randomize";

export type DiscoveryRequestIdentity = {
  id: number;
  category: ContentCategory;
};

export type DiscoveryResults = {
  category: ContentCategory;
  items: ResultItem[];
};

export type DiscoveryState = {
  selected: ContentCategory | null;
  activeAction: DiscoveryActionMode | null;
  searchQuery: string;
  openSection: string | null;
  selectedFilters: string[];
  results: DiscoveryResults | null;
  loading: boolean;
  requestError: string | null;
  activeRequest: DiscoveryRequestIdentity | null;
};

export const initialDiscoveryState: DiscoveryState = {
  selected: null,
  activeAction: null,
  searchQuery: "",
  openSection: null,
  selectedFilters: [],
  results: null,
  loading: false,
  requestError: null,
  activeRequest: null,
};

export type DiscoveryStateAction =
  | { type: "selectCategory"; category: ContentCategory }
  | { type: "setActiveAction"; action: DiscoveryActionMode }
  | { type: "setSearchQuery"; query: string }
  | { type: "setOpenSection"; section: string | null }
  | { type: "toggleFilter"; value: string }
  | { type: "clearFilters" }
  | { type: "clearResults" }
  | { type: "requestStarted"; request: DiscoveryRequestIdentity }
  | {
      type: "requestSucceeded";
      request: DiscoveryRequestIdentity;
      items: ResultItem[];
    }
  | {
      type: "requestFailed";
      request: DiscoveryRequestIdentity;
      message: string;
    };

function isActiveRequest(
  state: DiscoveryState,
  request: DiscoveryRequestIdentity
): boolean {
  return (
    state.activeRequest?.id === request.id &&
    state.activeRequest.category === request.category
  );
}

export function discoveryReducer(
  state: DiscoveryState,
  action: DiscoveryStateAction
): DiscoveryState {
  switch (action.type) {
    case "selectCategory":
      return { ...initialDiscoveryState, selected: action.category };
    case "setActiveAction":
      return { ...state, activeAction: action.action };
    case "setSearchQuery":
      return { ...state, searchQuery: action.query };
    case "setOpenSection":
      return { ...state, openSection: action.section };
    case "toggleFilter":
      return {
        ...state,
        selectedFilters: state.selectedFilters.includes(action.value)
          ? state.selectedFilters.filter((filter) => filter !== action.value)
          : [...state.selectedFilters, action.value],
      };
    case "clearFilters":
      return { ...state, selectedFilters: [] };
    case "clearResults":
      return { ...state, results: null };
    case "requestStarted":
      return {
        ...state,
        loading: true,
        requestError: null,
        activeRequest: action.request,
      };
    case "requestSucceeded":
      if (!isActiveRequest(state, action.request)) return state;
      return {
        ...state,
        results: { category: action.request.category, items: action.items },
        loading: false,
        requestError: null,
        activeRequest: null,
      };
    case "requestFailed":
      if (!isActiveRequest(state, action.request)) return state;
      return {
        ...state,
        results: null,
        loading: false,
        requestError: action.message,
        activeRequest: null,
      };
  }
}
