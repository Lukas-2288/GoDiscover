import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ERA_FILTERS, GENRE_FILTERS, RATING_FILTERS } from "../../constants/Filters";
import { getCategoryTheme } from "../../lib/discovery/categoryThemes";
import type { DiscoveryActionMode } from "../../lib/discovery/types";
import type { Palette } from "../../lib/theme";
import type { ContentCategory } from "../../types/content";

export type DiscoveryControlsProps = {
  category: ContentCategory;
  activeAction: DiscoveryActionMode | null;
  query: string;
  filters: string[];
  openSection: string | null;
  loading: boolean;
  palette: Palette;
  onActionChange(action: DiscoveryActionMode): void;
  onQueryChange(query: string): void;
  onToggleFilter(value: string): void;
  onOpenSection(section: string | null): void;
  onClearFilters(): void;
  onSubmit(action: DiscoveryActionMode): void;
};

type FilterOption = {
  label: string;
  value: string;
};

type FilterSectionProps = {
  title: string;
  sectionKey: string;
  options: FilterOption[];
  openSection: string | null;
  filters: string[];
  palette: Palette;
  accent: string;
  onOpenSection(section: string | null): void;
  onToggleFilter(value: string): void;
};

function FilterSection({
  title,
  sectionKey,
  options,
  openSection,
  filters,
  palette,
  accent,
  onOpenSection,
  onToggleFilter,
}: FilterSectionProps) {
  const expanded = openSection === sectionKey;
  const activeCount = options.filter((option) =>
    filters.includes(option.value)
  ).length;

  return (
    <View style={[styles.filterSection, { borderColor: palette.border }]}>
      <Pressable
        accessibilityLabel={`${title} filters${
          activeCount > 0 ? `, ${activeCount} selected` : ""
        }`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => onOpenSection(expanded ? null : sectionKey)}
        style={({ pressed }) => [
          styles.filterHeader,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.filterTitle, { color: palette.text }]}>
          {title}
          {activeCount > 0 ? (
            <Text style={{ color: accent }}> ({activeCount})</Text>
          ) : null}
        </Text>
        <FontAwesome
          accessible={false}
          name={expanded ? "chevron-down" : "chevron-right"}
          size={12}
          color={palette.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.chipList}>
          {options.map((option) => {
            const selected = filters.includes(option.value);
            return (
              <Pressable
                key={option.value}
                accessibilityLabel={option.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggleFilter(option.value)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected
                      ? palette.surfaceAltStrong
                      : palette.surface,
                    borderColor: selected ? accent : palette.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? palette.text : palette.textMuted },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function DiscoveryControls({
  category,
  activeAction,
  query,
  filters,
  openSection,
  loading,
  palette,
  onActionChange,
  onQueryChange,
  onToggleFilter,
  onOpenSection,
  onClearFilters,
  onSubmit,
}: DiscoveryControlsProps) {
  const theme = getCategoryTheme(category);
  const categoryLabel = theme.label.toLowerCase();
  const genreOptions = GENRE_FILTERS[category].map((genre) => ({
    label: genre,
    value: genre,
  }));
  const eraOptions = [
    { label: "Any", value: "Any" },
    ...ERA_FILTERS.decades.map((era) => ({ label: era, value: era })),
  ];
  const ratingOptions =
    category === "movies" || category === "books"
      ? RATING_FILTERS[category].map((rating) => ({
          label: rating.label,
          value: rating.label,
        }))
      : null;
  const searchDisabled = loading || query.trim().length === 0;
  const surpriseArticle = category === "albums" ? "an" : "a";

  const submitSearch = () => {
    if (!searchDisabled) onSubmit("search");
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: activeAction === "search" }}
          onPress={() => onActionChange("search")}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor:
                activeAction === "search"
                  ? palette.surfaceAltStrong
                  : palette.surface,
              borderColor:
                activeAction === "search" ? theme.accent : palette.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <FontAwesome
            accessible={false}
            name="search"
            size={15}
            color={palette.text}
          />
          <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
            Search {categoryLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: activeAction === "filter" }}
          onPress={() => onActionChange("filter")}
          style={({ pressed }) => [
            styles.secondaryButton,
            {
              backgroundColor:
                activeAction === "filter"
                  ? palette.surfaceAltStrong
                  : palette.surface,
              borderColor:
                activeAction === "filter" ? theme.accent : palette.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <FontAwesome
            accessible={false}
            name="sliders"
            size={15}
            color={palette.text}
          />
          <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
            Filter {categoryLabel}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Surprise me with ${surpriseArticle} ${theme.singular}`}
          accessibilityState={{ disabled: loading }}
          disabled={loading}
          onPress={() => onSubmit("randomize")}
          style={({ pressed }) => [
            styles.surpriseButton,
            {
              backgroundColor: theme.accent,
              opacity: loading ? 0.5 : pressed ? 0.8 : 1,
            },
          ]}
        >
          <FontAwesome
            accessible={false}
            name="random"
            size={15}
            color={theme.onAccent}
          />
          <Text style={[styles.surpriseButtonText, { color: theme.onAccent }]}>
            Surprise Me
          </Text>
        </Pressable>
      </View>

      {activeAction === "search" ? (
        <View style={styles.panel}>
          <TextInput
            accessibilityLabel={`Search ${categoryLabel}`}
            multiline={false}
            onChangeText={onQueryChange}
            onSubmitEditing={submitSearch}
            placeholder={`Search ${categoryLabel}`}
            placeholderTextColor={palette.textFaint}
            returnKeyType="search"
            style={[
              styles.searchInput,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                color: palette.text,
              },
            ]}
            value={query}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Find ${categoryLabel}`}
            accessibilityState={{ disabled: searchDisabled }}
            disabled={searchDisabled}
            onPress={submitSearch}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: theme.accent,
                opacity: searchDisabled ? 0.45 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.submitButtonText, { color: theme.onAccent }]}>
              Find {categoryLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {activeAction === "filter" ? (
        <View style={styles.panel}>
          {filters.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear all filters"
              accessibilityRole="button"
              onPress={onClearFilters}
              style={({ pressed }) => [
                styles.clearButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.clearText, { color: theme.accent }]}>
                Clear all
              </Text>
            </Pressable>
          ) : null}

          <FilterSection
            title="Genre"
            sectionKey="genre"
            options={genreOptions}
            openSection={openSection}
            filters={filters}
            palette={palette}
            accent={theme.accent}
            onOpenSection={onOpenSection}
            onToggleFilter={onToggleFilter}
          />
          <FilterSection
            title="Era"
            sectionKey="era"
            options={eraOptions}
            openSection={openSection}
            filters={filters}
            palette={palette}
            accent={theme.accent}
            onOpenSection={onOpenSection}
            onToggleFilter={onToggleFilter}
          />
          {ratingOptions ? (
            <FilterSection
              title="Rating"
              sectionKey="rating"
              options={ratingOptions}
              openSection={openSection}
              filters={filters}
              palette={palette}
              accent={theme.accent}
              onOpenSection={onOpenSection}
              onToggleFilter={onToggleFilter}
            />
          ) : null}

          <Pressable
            accessibilityLabel="Apply filters"
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={() => onSubmit("filter")}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: theme.accent,
                opacity: loading ? 0.45 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.submitButtonText, { color: theme.onAccent }]}>
              Apply filters
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    gap: 14,
    maxWidth: 960,
    width: "100%",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  surpriseButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginLeft: "auto",
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 44,
  },
  surpriseButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  panel: {
    gap: 10,
  },
  searchInput: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
  },
  submitButton: {
    alignItems: "center",
    alignSelf: "flex-end",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  clearButton: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "700",
  },
  filterSection: {
    borderBottomWidth: 1,
  },
  filterHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 4,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  chipList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 44,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
