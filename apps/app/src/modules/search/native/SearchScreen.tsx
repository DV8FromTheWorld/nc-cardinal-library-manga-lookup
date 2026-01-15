/**
 * Search screen component for React Native.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useSearch } from '../hooks/useSearch';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/native/DebugPanel';
import { clearCacheForSearch } from '../services/mangaApi';
import { getAvailabilityPercent, getAvailabilityDisplayInfo } from '../utils/availability';
import type { SeriesResult, VolumeResult } from '../types';
import { Text } from '../../../design/components/Text/native/Text';
import { Heading } from '../../../design/components/Heading/native/Heading';
import { LoginModal } from '../../login/native/LoginModal';
import { UserButton } from '../../login/native/UserButton';
import { colors, spacing, type ThemeColors } from './theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

export function SearchScreen({ navigation, route }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const initialQuery = route.params?.query;
  const { homeLibrary, setHomeLibrary, libraries, libraryName } = useHomeLibrary();
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showAllVolumes, setShowAllVolumes] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      navigation.setParams({ query: newQuery || undefined });
    },
    [navigation]
  );

  const { query, setQuery, results, isLoading, error, search, clearResults, refreshWithDebug } = useSearch({
    initialQuery,
    homeLibrary,
    onQueryChange: handleQueryChange,
  });

  const handleClearCache = useCallback(async () => {
    if (results?.query) {
      await clearCacheForSearch(results.query);
      // Re-run the search to get fresh data
      search(results.query);
    }
  }, [results?.query, search]);

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
      // Push a new search screen onto the stack for navigation history
      // Only push if this is a different query than what we came in with
      if (query.trim() !== initialQuery) {
        // Skip animation for search-to-search navigation
        navigation.push('Search', { query: query.trim(), skipAnimation: true });
      } else {
        // Same query, just execute the search
        search(query);
      }
    }
  }, [query, search, initialQuery, navigation]);

  const suggestions = ['Demon Slayer', 'One Piece', 'My Hero Academia', 'Spy x Family'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          {/* User button */}
          <View style={styles.userButtonContainer}>
            <UserButton
              onLoginPress={() => setShowLoginModal(true)}
              onAccountPress={() => navigation.navigate('Account')}
            />
          </View>
          {/* Back button when there's navigation history */}
          {navigation.canGoBack() && (
            <TouchableOpacity 
              onPress={() => navigation.goBack()} 
              style={[styles.backButton, { borderColor: theme.border }]}
            >
              <Text variant="text-sm/normal" color="text-secondary">← Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.popToTop()} style={styles.titleButton}>
            <RNText style={styles.titleIcon}>📚</RNText>
            <Heading level={1} variant="header-lg/bold" style={styles.titleText}>NC Cardinal Manga</Heading>
          </TouchableOpacity>
          <Text variant="text-md/normal" color="text-secondary" style={styles.subtitle}>
            Find manga series at your local NC library
          </Text>
          {/* Library Selector */}
          <TouchableOpacity
            style={[styles.librarySelector, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
            onPress={() => setShowLibraryPicker(true)}
          >
            <Text variant="text-sm/normal" color="text-muted">📍 My Library:</Text>
            <Text variant="text-sm/medium" color="text-primary" numberOfLines={1} style={styles.librarySelectorValue}>
              {libraryName ?? 'Select...'}
            </Text>
            <Text variant="text-xs/normal" color="text-muted">▼</Text>
          </TouchableOpacity>
        </View>

        {/* Library Picker Modal */}
        <Modal
          visible={showLibraryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowLibraryPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.bgPrimary }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Heading level={2} variant="header-sm/semibold">Select Your Library</Heading>
                <TouchableOpacity onPress={() => setShowLibraryPicker(false)}>
                  <Text variant="text-md/medium" color="accent">Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.libraryList}>
                {libraries.map((lib) => (
                  <TouchableOpacity
                    key={lib.code}
                    style={[
                      styles.libraryOption,
                      { borderBottomColor: theme.border },
                      homeLibrary === lib.code && { backgroundColor: theme.bgSecondary },
                    ]}
                    onPress={() => {
                      setHomeLibrary(lib.code);
                      setShowLibraryPicker(false);
                      // Re-run search with new library if we have results
                      if (results?.query) {
                        search(results.query);
                      }
                    }}
                  >
                    <Text
                      variant={homeLibrary === lib.code ? 'text-md/semibold' : 'text-md/normal'}
                      color="text-primary"
                      style={styles.libraryOptionText}
                    >
                      {lib.name}
                    </Text>
                    {homeLibrary === lib.code && (
                      <Text variant="text-md/semibold" color="accent">✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

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
                <RNText style={styles.searchButtonText}>→</RNText>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Error State */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
            <Text variant="text-sm/normal" color="error">⚠ {error}</Text>
          </View>
        )}

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
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
                <Heading level={2} variant="header-sm/semibold" style={styles.sectionTitle}>
                  Series ({results.series.length})
                </Heading>
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
                <Heading level={2} variant="header-sm/semibold" style={styles.sectionTitle}>
                  Volumes ({results.volumes.length})
                </Heading>
                {(showAllVolumes ? results.volumes : results.volumes.slice(0, 12)).map((volume, idx) => (
                  <VolumeCard
                    key={volume.isbn ?? idx}
                    volume={volume}
                    onPress={() => volume.isbn && handleSelectBook(volume.isbn)}
                    theme={theme}
                  />
                ))}
                {results.volumes.length > 12 && (
                  <TouchableOpacity
                    style={[styles.showMoreButton, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                    onPress={() => setShowAllVolumes(!showAllVolumes)}
                  >
                    <Text variant="text-sm/normal" color="text-secondary">
                      {showAllVolumes ? 'Show less' : `Show all ${results.volumes.length} volumes`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* No Results */}
            {results.series.length === 0 && results.volumes.length === 0 && (
              <View style={styles.noResults}>
                <RNText style={styles.noResultsIcon}>🔍</RNText>
                <Text variant="text-md/normal" color="text-secondary">
                  No results found for "{results.query}"
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Empty State */}
        {!results && !isLoading && !error && (
          <View style={styles.emptyState}>
            <Text variant="text-md/normal" color="text-secondary" style={styles.suggestionsTitle}>
              Try searching for:
            </Text>
            <View style={styles.suggestionChips}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={[styles.suggestionChip, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                  onPress={() => {
                    // Push a new search screen for this suggestion (no animation for search-to-search)
                    navigation.push('Search', { query: suggestion, skipAnimation: true });
                  }}
                >
                  <Text variant="text-sm/normal" color="text-primary">
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Debug Panel */}
        <DebugPanel
          debug={results?._debug}
          onRefreshWithDebug={results && !results._debug ? refreshWithDebug : undefined}
          cacheContext={results?.query ? { type: 'search', identifier: results.query } : undefined}
          onClearCache={handleClearCache}
        />

        {/* Login Modal */}
        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
        />
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
            <RNText style={styles.coverPlaceholderText}>📚</RNText>
          </View>
        )}
      </View>
      <View style={styles.seriesInfo}>
        <View style={styles.seriesHeader}>
          <Text variant="text-md/semibold" color="text-primary" numberOfLines={2} style={styles.seriesTitle}>
            {series.title}
          </Text>
          {series.isComplete && (
            <View style={[styles.completeBadge, { backgroundColor: theme.successBg }]}>
              <Text variant="text-xs/medium" color="success">Complete</Text>
            </View>
          )}
        </View>
        {series.author && (
          <Text variant="text-sm/normal" color="text-secondary" numberOfLines={1} style={styles.seriesAuthor}>
            {series.author}
          </Text>
        )}
        <View style={styles.seriesStats}>
          <Text variant="text-md/bold" color="text-primary">
            {series.totalVolumes} <Text variant="text-xs/normal" color="text-primary">volumes</Text>
          </Text>
          <Text variant="text-md/bold" color="text-primary">
            {series.availableVolumes} <Text variant="text-xs/normal" color="text-primary">in library</Text>
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
        <Text variant="text-xs/normal" color="text-muted">
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
            <RNText>📖</RNText>
          </View>
        )}
      </View>
      <View style={[styles.volumeNumber, { backgroundColor: theme.accent }]}>
        <RNText style={styles.volumeNumberText}>{volume.volumeNumber ?? '?'}</RNText>
      </View>
      <View style={styles.volumeInfo}>
        <Text variant="text-sm/medium" color="text-primary" numberOfLines={1}>
          {volume.title}
        </Text>
        {volume.seriesTitle && (
          <Text variant="text-xs/normal" color="text-secondary" numberOfLines={1} style={styles.volumeSeries}>
            {volume.seriesTitle}
          </Text>
        )}
        <View style={styles.volumeAvailability}>
          <View style={[styles.availabilityDot, { backgroundColor: dotColor }]} />
          <Text variant="text-xs/normal" color="text-muted">
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
  userButtonContainer: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
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
    // Styles handled by Heading component
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  librarySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.xs,
  },
  librarySelectorValue: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  libraryList: {
    maxHeight: 400,
  },
  libraryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  libraryOptionText: {
    flex: 1,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
  },
  results: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
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
    flex: 1,
  },
  completeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  seriesAuthor: {
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  seriesStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
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
  volumeSeries: {
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
  showMoreButton: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  noResultsIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  suggestionsTitle: {
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
});
