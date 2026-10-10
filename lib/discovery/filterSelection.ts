export const ERA_ANY_FILTER = "era:any";
export const RATING_ANY_FILTER = "rating:any";

export function isEraFilter(value: string): boolean {
  return /^\d{2}s$/.test(value);
}

export function isRatingFilter(value: string): boolean {
  return /^\d(?:\.\d)?\+$/.test(value);
}

function replaceSingleSelection(
  filters: readonly string[],
  value: string,
  matches: (candidate: string) => boolean
): string[] {
  const remaining = filters.filter((candidate) => !matches(candidate));
  return [...remaining, value];
}

export function toggleDiscoveryFilter(
  filters: readonly string[],
  value: string
): string[] {
  if (value === ERA_ANY_FILTER) {
    return filters.filter((candidate) => !isEraFilter(candidate));
  }
  if (value === RATING_ANY_FILTER) {
    return filters.filter((candidate) => !isRatingFilter(candidate));
  }
  if (isEraFilter(value)) {
    return replaceSingleSelection(filters, value, isEraFilter);
  }
  if (isRatingFilter(value)) {
    return replaceSingleSelection(filters, value, isRatingFilter);
  }
  return filters.includes(value)
    ? filters.filter((candidate) => candidate !== value)
    : [...filters, value];
}
