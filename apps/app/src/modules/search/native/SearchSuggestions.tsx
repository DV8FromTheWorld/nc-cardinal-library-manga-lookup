/**
 * Search suggestions component for React Native.
 *
 * Features:
 * - Shows suggestions with cover thumbnails
 * - Recent searches section
 * - Format badge (Manga/Novel)
 * - Touch feedback with Pressable
 */

import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useColorScheme,
  View,
} from 'react-native';

import { Text } from '../../../design/components/Text/native/Text';
import type { SuggestionItem } from '../types';
import { colors, spacing, type ThemeColors } from './theme';

export interface SearchSuggestionsProps {
  /** Suggestions to display */
  suggestions: SuggestionItem[];
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Recent searches to display when query is empty */
  recentSearches: string[];
  /** Current query (empty shows recent searches) */
  query: string;
  /** Called when a suggestion is selected */
  onSelect: (title: string) => void;
  /** Called when a recent search is selected */
  onSelectRecent: (query: string) => void;
  /** Called when a recent search is removed */
  onRemoveRecent: (query: string) => void;
}

// Types for flattened list items
type SectionHeaderItem = { type: 'header'; id: string; title: string };
type RecentItem = { type: 'recent'; id: string; query: string };
type SuggestionListItem = { type: 'suggestion'; id: string; item: SuggestionItem };
type LoadingItem = { type: 'loading'; id: string };

type ListItem = SectionHeaderItem | RecentItem | SuggestionListItem | LoadingItem;

export function SearchSuggestions({
  suggestions,
  isLoading,
  recentSearches,
  query,
  onSelect,
  onSelectRecent,
  onRemoveRecent,
}: SearchSuggestionsProps): JSX.Element | null {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  // Determine what to show
  const showRecent = query.trim() === '' && recentSearches.length > 0;
  const showSuggestions = query.trim().length > 0 && (suggestions.length > 0 || isLoading);

  if (!showRecent && !showSuggestions) {
    return null;
  }

  // Build flat list data
  const data: ListItem[] = [];

  if (showRecent) {
    data.push({ type: 'header', id: 'header-recent', title: 'Recent Searches' });
    for (const search of recentSearches) {
      data.push({ type: 'recent', id: `recent-${search}`, query: search });
    }
  }

  if (showSuggestions) {
    for (const item of suggestions) {
      data.push({ type: 'suggestion', id: `suggestion-${item.anilistId}`, item });
    }
    if (isLoading && suggestions.length === 0) {
      data.push({ type: 'loading', id: 'loading' });
    }
  }

  const renderItem = (item: ListItem) => {
    switch (item.type) {
      case 'header':
        return <SectionHeader key={item.id} title={item.title} theme={theme} />;
      case 'recent':
        return (
          <RecentSearchItem
            key={item.id}
            query={item.query}
            onPress={() => onSelectRecent(item.query)}
            onRemove={() => onRemoveRecent(item.query)}
            theme={theme}
          />
        );
      case 'suggestion':
        return (
          <SuggestionItemRow
            key={item.id}
            suggestion={item.item}
            onPress={() => onSelect(item.item.title)}
            theme={theme}
          />
        );
      case 'loading':
        return <LoadingIndicator key={item.id} theme={theme} />;
      default:
        return null;
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.bgPrimary, borderColor: theme.border }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.list}
        nestedScrollEnabled
      >
        {data.map(renderItem)}
      </ScrollView>
      {isLoading && suggestions.length > 0 && (
        <View style={[styles.loadingMore, { borderTopColor: theme.border }]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SectionHeaderProps {
  title: string;
  theme: ThemeColors;
}

function SectionHeader({ title, theme }: SectionHeaderProps): JSX.Element {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.bgSecondary }]}>
      <Text variant="text-xs/semibold" color="text-muted" style={styles.sectionHeaderText}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

interface RecentSearchItemProps {
  query: string;
  onPress: () => void;
  onRemove: () => void;
  theme: ThemeColors;
}

function RecentSearchItem({ query, onPress, onRemove, theme }: RecentSearchItemProps): JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.recentItem,
        pressed && { backgroundColor: theme.bgSecondary },
      ]}
      onPress={onPress}
    >
      <RNText style={styles.recentIcon}>🕐</RNText>
      <Text
        variant="text-sm/normal"
        color="text-primary"
        style={styles.recentText}
        numberOfLines={1}
      >
        {query}
      </Text>
      <Pressable
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.removeButton}
      >
        <Text variant="text-md/normal" color="text-muted">
          ×
        </Text>
      </Pressable>
    </Pressable>
  );
}

interface SuggestionItemRowProps {
  suggestion: SuggestionItem;
  onPress: () => void;
  theme: ThemeColors;
}

function SuggestionItemRow({ suggestion, onPress, theme }: SuggestionItemRowProps): JSX.Element {
  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'NOVEL':
        return 'Novel';
      case 'ONE_SHOT':
        return 'One-Shot';
      default:
        return 'Manga';
    }
  };

  const getFormatColor = (format: string) => {
    switch (format) {
      case 'NOVEL':
        return '#3b82f6';
      case 'ONE_SHOT':
        return '#8b5cf6';
      default:
        return theme.accent;
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.suggestionItem,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.bgSecondary },
      ]}
      onPress={onPress}
    >
      <View style={[styles.coverContainer, { backgroundColor: theme.bgSecondary }]}>
        {suggestion.coverUrl != null ? (
          <Image source={{ uri: suggestion.coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: theme.bgTertiary }]}>
            <RNText style={styles.coverPlaceholderText}>📚</RNText>
          </View>
        )}
      </View>
      <View style={styles.suggestionInfo}>
        <Text variant="text-sm/semibold" color="text-primary" numberOfLines={1}>
          {suggestion.title}
        </Text>
        {suggestion.title !== suggestion.titleRomaji && (
          <Text
            variant="text-xs/normal"
            color="text-muted"
            numberOfLines={1}
            style={styles.romajiText}
          >
            {suggestion.titleRomaji}
          </Text>
        )}
        <View style={styles.metaRow}>
          <View
            style={[
              styles.formatBadge,
              { backgroundColor: `${getFormatColor(suggestion.format)}15` },
            ]}
          >
            <RNText style={[styles.formatBadgeText, { color: getFormatColor(suggestion.format) }]}>
              {getFormatLabel(suggestion.format)}
            </RNText>
          </View>
          {suggestion.volumes != null && suggestion.volumes > 0 && (
            <Text variant="text-xs/normal" color="text-muted">
              {suggestion.volumes} vol{suggestion.volumes !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

interface LoadingIndicatorProps {
  theme: ThemeColors;
}

function LoadingIndicator({ theme }: LoadingIndicatorProps): JSX.Element {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color={theme.accent} />
      <Text variant="text-sm/normal" color="text-muted" style={styles.loadingText}>
        Searching...
      </Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    maxHeight: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  list: {
    maxHeight: 350,
  },
  sectionHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sectionHeaderText: {
    letterSpacing: 0.5,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  recentIcon: {
    fontSize: 14,
    opacity: 0.6,
  },
  recentText: {
    flex: 1,
  },
  removeButton: {
    paddingHorizontal: spacing.xs,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  coverContainer: {
    width: 36,
    height: 50,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 18,
  },
  suggestionInfo: {
    flex: 1,
    gap: 2,
  },
  romajiText: {
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    marginLeft: spacing.xs,
  },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
});
