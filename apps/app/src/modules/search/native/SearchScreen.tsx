/**
 * Search screen component for React Native.
 */

import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useSearch } from '../hooks/useSearch';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { getAvailabilityPercent, getAvailabilityDisplayInfo } from '../utils/availability';
import type { SeriesResult, VolumeResult } from '../types';
import { colors, spacing, type ThemeColors } from './theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

export function SearchScreen({ navigation, route }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const initialQuery = route.params?.query;
  const { homeLibrary } = useHomeLibrary();

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      navigation.setParams({ query: newQuery || undefined });
    },
    [navigation]
  );

  const { query, setQuery, results, isLoading, error, search, clearResults } = useSearch({
    initialQuery,
    homeLibrary,
    onQueryChange: handleQueryChange,
  });

  const handleSelectSeries = useCallback(
    (slug: string) => {
      navigation.navigate('Series', { slug });
    },
    [navigation]
  );

  const handleSelectBook = useCallback(
    (isbn: string) => {
      navigation.navigate('Book', { isbn });
    },
    [navigation]
  );

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      search(query);
    }
  }, [query, search]);

  const suggestions = ['Demon Slayer', 'One Piece', 'My Hero Academia', 'Spy x Family'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={clearResults} style={styles.titleButton}>
            <Text style={styles.titleIcon}>📚</Text>
            <Text style={[styles.titleText, { color: theme.textPrimary }]}>NC Cardinal Manga</Text>
          </TouchableOpacity>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Find manga series at your local NC library
          </Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchInputWrapper, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search for manga..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: theme.accent }]}
              onPress={handleSearch}
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.searchButtonText}>→</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Error State */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>⚠ {error}</Text>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Searching libraries...
            </Text>
          </View>
        )}

        {/* Results */}
        {results && !isLoading && (
          <ScrollView style={styles.results} showsVerticalScrollIndicator={false}>
            {/* Series Results */}
            {results.series.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  Series ({results.series.length})
                </Text>
                {results.series.map((series) => (
                  <SeriesCard
                    key={series.id}
                    series={series}
                    onPress={() => handleSelectSeries(series.slug)}
                    theme={theme}
                  />
                ))}
              </View>
            )}

            {/* Volume Results */}
            {results.volumes.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                  Volumes ({results.volumes.length})
                </Text>
                {results.volumes.slice(0, 12).map((volume, idx) => (
                  <VolumeCard
                    key={volume.isbn ?? idx}
                    volume={volume}
                    onPress={() => volume.isbn && handleSelectBook(volume.isbn)}
                    theme={theme}
                  />
                ))}
                {results.volumes.length > 12 && (
                  <Text style={[styles.moreResults, { color: theme.textMuted }]}>
                    +{results.volumes.length - 12} more volumes
                  </Text>
                )}
              </View>
            )}

            {/* No Results */}
            {results.series.length === 0 && results.volumes.length === 0 && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsIcon}>🔍</Text>
                <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                  No results found for "{results.query}"
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Empty State */}
        {!results && !isLoading && !error && (
          <View style={styles.emptyState}>
            <Text style={[styles.suggestionsTitle, { color: theme.textSecondary }]}>
              Try searching for:
            </Text>
            <View style={styles.suggestionChips}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={[styles.suggestionChip, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                  onPress={() => {
                    setQuery(suggestion);
                    search(suggestion);
                  }}
                >
                  <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SeriesCardProps {
  series: SeriesResult;
  onPress: () => void;
  theme: ThemeColors;
}

function SeriesCard({ series, onPress, theme }: SeriesCardProps): JSX.Element {
  const availabilityPercent = getAvailabilityPercent(series.availableVolumes, series.totalVolumes);
  const [imageError, setImageError] = useState(false);

  return (
    <TouchableOpacity
      style={[styles.seriesCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.seriesCover}>
        {series.coverImage && !imageError ? (
          <Image
            source={{ uri: series.coverImage }}
            style={styles.coverImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: theme.bgTertiary }]}>
            <Text style={styles.coverPlaceholderText}>📚</Text>
          </View>
        )}
      </View>
      <View style={styles.seriesInfo}>
        <View style={styles.seriesHeader}>
          <Text style={[styles.seriesTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {series.title}
          </Text>
          {series.isComplete && (
            <View style={[styles.completeBadge, { backgroundColor: theme.successBg }]}>
              <Text style={[styles.completeBadgeText, { color: theme.success }]}>Complete</Text>
            </View>
          )}
        </View>
        {series.author && (
          <Text style={[styles.seriesAuthor, { color: theme.textSecondary }]} numberOfLines={1}>
            {series.author}
          </Text>
        )}
        <View style={styles.seriesStats}>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {series.totalVolumes} <Text style={styles.statLabel}>volumes</Text>
          </Text>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>
            {series.availableVolumes} <Text style={styles.statLabel}>in library</Text>
          </Text>
        </View>
        <View style={[styles.availabilityBar, { backgroundColor: theme.bgTertiary }]}>
          <View
            style={[
              styles.availabilityFill,
              { width: `${availabilityPercent}%`, backgroundColor: theme.accent },
            ]}
          />
        </View>
        <Text style={[styles.availabilityText, { color: theme.textMuted }]}>
          {availabilityPercent}% available in NC Cardinal
        </Text>
      </View>
    </TouchableOpacity>
  );
}

interface VolumeCardProps {
  volume: VolumeResult;
  onPress: () => void;
  theme: ThemeColors;
}

function VolumeCard({ volume, onPress, theme }: VolumeCardProps): JSX.Element {
  const { statusType, statusText } = getAvailabilityDisplayInfo(volume.availability);
  const [imageError, setImageError] = useState(false);

  const dotColor =
    statusType === 'local'
      ? theme.accent
      : statusType === 'available'
        ? theme.success
        : theme.textMuted;

  return (
    <TouchableOpacity
      style={[styles.volumeCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!volume.isbn}
    >
      <View style={styles.volumeCover}>
        {volume.coverImage && !imageError ? (
          <Image
            source={{ uri: volume.coverImage }}
            style={styles.volumeCoverImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={[styles.volumeCoverPlaceholder, { backgroundColor: theme.bgTertiary }]}>
            <Text>📖</Text>
          </View>
        )}
      </View>
      <View style={[styles.volumeNumber, { backgroundColor: theme.accent }]}>
        <Text style={styles.volumeNumberText}>{volume.volumeNumber ?? '?'}</Text>
      </View>
      <View style={styles.volumeInfo}>
        <Text style={[styles.volumeTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {volume.title}
        </Text>
        {volume.seriesTitle && (
          <Text style={[styles.volumeSeries, { color: theme.textSecondary }]} numberOfLines={1}>
            {volume.seriesTitle}
          </Text>
        )}
        <View style={styles.volumeAvailability}>
          <View style={[styles.availabilityDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.availabilityStatusText, { color: theme.textMuted }]}>
            {statusText}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Theme
// ============================================================================

export { colors, spacing };

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleIcon: {
    fontSize: 32,
  },
  titleText: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    marginTop: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  searchButton: {
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  errorContainer: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 16,
  },
  results: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  seriesCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  seriesCover: {
    width: 70,
    marginRight: spacing.md,
  },
  coverImage: {
    width: 70,
    height: 105,
    borderRadius: 6,
  },
  coverPlaceholder: {
    width: 70,
    height: 105,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 24,
  },
  seriesInfo: {
    flex: 1,
  },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  seriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  completeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  completeBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  seriesAuthor: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  seriesStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  availabilityBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: spacing.xs,
  },
  availabilityFill: {
    height: '100%',
    borderRadius: 3,
  },
  availabilityText: {
    fontSize: 11,
  },
  volumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  volumeCover: {
    width: 45,
  },
  volumeCoverImage: {
    width: 45,
    height: 68,
    borderRadius: 4,
  },
  volumeCoverPlaceholder: {
    width: 45,
    height: 68,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeNumber: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  volumeInfo: {
    flex: 1,
  },
  volumeTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  volumeSeries: {
    fontSize: 12,
    marginTop: 1,
  },
  volumeAvailability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  availabilityStatusText: {
    fontSize: 12,
  },
  moreResults: {
    textAlign: 'center',
    marginTop: spacing.sm,
    fontSize: 14,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  noResultsIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  noResultsText: {
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  suggestionsTitle: {
    fontSize: 16,
    marginBottom: spacing.md,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 14,
  },
});
