/**
 * Search screen component for React Native - shows search results.
 */

import { useCallback, useState, useMemo, useEffect } from 'react';
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
  FlatList,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useStreamingSearch } from '../hooks/useStreamingSearch';
import { useAutocomplete } from '../hooks/useAutocomplete';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/native/DebugPanel';
import { clearCacheForSearch } from '../services/mangaApi';
import { getAvailabilityPercent, getAvailabilityDisplayInfo } from '../utils/availability';
import { SearchProgressIndicator } from './SearchProgressIndicator';
import { SearchSuggestions } from './SearchSuggestions';
import type { SeriesResult, VolumeResult, SearchResult } from '../types';
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
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Redirect to Home if no query provided
  useEffect(() => {
    if (initialQuery == null || initialQuery === '') {
      navigation.replace('Home');
    }
  }, [initialQuery, navigation]);

  // Autocomplete for search suggestions
  const {
    suggestions,
    isLoading: isSuggestionsLoading,
    recentSearches,
    setQuery: setAutocompleteQuery,
    clearSuggestions,
    addRecentSearch,
    removeRecentSearch,
  } = useAutocomplete();

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      if (newQuery !== '') {
        navigation.setParams({ query: newQuery });
      }
    },
    [navigation]
  );

  const { query, setQuery, results, isLoading, error, progress, search, clearResults: _clearResults } = useStreamingSearch({
    initialQuery,
    homeLibrary,
    onQueryChange: handleQueryChange,
  });

  const handleClearCache = useCallback(async () => {
    if (results?.query != null && results.query !== '') {
      await clearCacheForSearch(results.query);
      // Re-run the search to get fresh data
      search(results.query);
    }
  }, [results?.query, search]);

  const handleSelectSeries = useCallback(
    (seriesId: string) => {
      navigation.navigate('Series', { id: seriesId });
    },
    [navigation]
  );

  const handleSelectVolume = useCallback(
    (volumeId: string) => {
      navigation.navigate('Volume', { id: volumeId });
    },
    [navigation]
  );

  const handleInputChange = useCallback((text: string) => {
    setQuery(text);
    setAutocompleteQuery(text);
    setShowSuggestions(true);
  }, [setQuery, setAutocompleteQuery]);

  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay hiding to allow tap on suggestion
    setTimeout(() => setShowSuggestions(false), 150);
  }, []);

  const handleSearch = useCallback(() => {
    if (query.trim() !== '') {
      addRecentSearch(query.trim());
      setShowSuggestions(false);
      clearSuggestions();
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
  }, [query, search, initialQuery, navigation, addRecentSearch, clearSuggestions]);

  const handleSelectSuggestion = useCallback((title: string) => {
    addRecentSearch(title);
    setShowSuggestions(false);
    clearSuggestions();
    // Push a new search screen with this title
    navigation.push('Search', { query: title, skipAnimation: true });
  }, [navigation, addRecentSearch, clearSuggestions]);

  const handleSelectRecent = useCallback((recentQuery: string) => {
    setShowSuggestions(false);
    clearSuggestions();
    navigation.push('Search', { query: recentQuery, skipAnimation: true });
  }, [navigation, clearSuggestions]);

  // Header component for the scrollable list
  const headerContent = (
    <View>
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
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.titleButton}>
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

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <View style={[styles.searchInputWrapper, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            <TextInput
              style={[styles.searchInput, { color: theme.textPrimary }]}
              placeholder="Search for manga..."
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: theme.accent }]}
              onPress={handleSearch}
              disabled={isLoading || query.trim() === ''}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <RNText style={styles.searchButtonText}>→</RNText>
              )}
            </TouchableOpacity>
          </View>
          {showSuggestions && (
            <SearchSuggestions
              suggestions={suggestions}
              isLoading={isSuggestionsLoading}
              recentSearches={recentSearches}
              query={query}
              onSelect={handleSelectSuggestion}
              onSelectRecent={handleSelectRecent}
              onRemoveRecent={removeRecentSearch}
            />
          )}
        </View>
      </View>

      {/* Debug Panel - moved to header so it scrolls with content */}
      <DebugPanel
        debug={results?._debug}
        cacheContext={results?.query != null && results.query !== '' ? { type: 'search', identifier: results.query } : undefined}
        onClearCache={handleClearCache}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
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
                      if (results?.query != null && results.query !== '') {
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

        {/* Login Modal */}
        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
        />

        {/* Results list with header - always rendered to enable scrolling */}
        <ResultsList
          results={results}
          theme={theme}
          showAllVolumes={showAllVolumes}
          onToggleShowAllVolumes={() => setShowAllVolumes(!showAllVolumes)}
          onSelectSeries={handleSelectSeries}
          onSelectVolume={handleSelectVolume}
          headerComponent={headerContent}
          isLoading={isLoading}
          error={error}
          progress={progress}
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
  highlighted?: boolean | undefined;
}

function SeriesCard({ series, onPress, theme, highlighted }: SeriesCardProps): JSX.Element {
  const availabilityPercent = getAvailabilityPercent(series.availableVolumes, series.totalVolumes);
  const [imageError, setImageError] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.seriesCard,
        { backgroundColor: theme.bgSecondary, borderColor: highlighted ? theme.accent : theme.border },
        highlighted && styles.seriesCardHighlighted,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.seriesCover}>
        {series.coverImage != null && !imageError ? (
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
        {series.author != null && (
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
              { width: `${availabilityPercent}%`, backgroundColor: theme.success },
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
  highlighted?: boolean | undefined;
}

function VolumeCard({ volume, onPress, theme, highlighted }: VolumeCardProps): JSX.Element {
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
      style={[
        styles.volumeCard,
        { backgroundColor: theme.bgSecondary, borderColor: highlighted ? theme.accent : theme.border },
        highlighted && styles.volumeCardHighlighted,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={volume.isbn == null}
    >
      <View style={styles.volumeCover}>
        {volume.coverImage != null && !imageError ? (
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
        {volume.seriesTitle != null && (
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
// ResultsList - Virtualized search results using FlashList
// ============================================================================

// Types for flattened list items (FlashList doesn't have native section support)
type SectionHeaderItem = { type: 'sectionHeader'; id: string; title: string };
type BestMatchItem = { type: 'bestMatch'; id: string };
type SeriesItem = { type: 'series'; id: string; series: SeriesResult };
type VolumeItem = { type: 'volume'; id: string; volume: VolumeResult };
type ShowMoreItem = { type: 'showMore'; id: string };
type NoResultsItem = { type: 'noResults'; id: string };

type ResultItem = SectionHeaderItem | BestMatchItem | SeriesItem | VolumeItem | ShowMoreItem | NoResultsItem;

// Estimated heights for different item types (used by FlashList)
const _ITEM_HEIGHTS = {
  sectionHeader: 48,
  bestMatch: 140, // SeriesCard or VolumeCard (variable, use larger estimate)
  series: 140,
  volume: 100,
  showMore: 48,
  noResults: 120,
};

interface ResultsListProps {
  results: SearchResult | null;
  theme: ThemeColors;
  showAllVolumes: boolean;
  onToggleShowAllVolumes: () => void;
  onSelectSeries: (seriesId: string) => void;
  onSelectVolume: (volumeId: string) => void;
  headerComponent: React.ReactElement;
  isLoading?: boolean | undefined;
  error?: string | null | undefined;
  progress?: ReturnType<typeof useStreamingSearch>['progress'] | undefined;
}

function ResultsList({
  results,
  theme,
  showAllVolumes,
  onToggleShowAllVolumes,
  onSelectSeries,
  onSelectVolume,
  headerComponent,
  isLoading,
  error,
  progress,
}: ResultsListProps): JSX.Element {
  // Build flattened list from results (including section headers as items)
  const items = useMemo((): ResultItem[] => {
    // If no results yet (loading or error), return empty array
    if (results == null) return [];
    
    const result: ResultItem[] = [];
    
    // Best Match section
    if (results.bestMatch != null) {
      result.push({ type: 'sectionHeader', id: 'header-best-match', title: 'Best Match' });
      result.push({ type: 'bestMatch', id: 'best-match' });
    }
    
    // Series section (excluding best match)
    const bestMatchSeriesId = results.bestMatch?.type === 'series' ? results.bestMatch.series?.id : undefined;
    const filteredSeries = bestMatchSeriesId != null
      ? results.series.filter((s) => s.id !== bestMatchSeriesId)
      : results.series;
    
    if (filteredSeries.length > 0) {
      const title = bestMatchSeriesId != null 
        ? `Other Series (${filteredSeries.length})` 
        : `Series (${filteredSeries.length})`;
      result.push({ type: 'sectionHeader', id: 'header-series', title });
      
      for (const series of filteredSeries) {
        result.push({ type: 'series', id: series.id, series });
      }
    }
    
    // Volumes section
    if (results.volumes.length > 0) {
      result.push({ 
        type: 'sectionHeader', 
        id: 'header-volumes', 
        title: `Volumes (${results.volumes.length})` 
      });
      
      const displayVolumes = showAllVolumes ? results.volumes : results.volumes.slice(0, 12);
      displayVolumes.forEach((volume, idx) => {
        result.push({ type: 'volume', id: volume.id ?? `vol-${idx}`, volume });
      });
      
      // Add "Show more" button if needed
      if (results.volumes.length > 12) {
        result.push({ type: 'showMore', id: 'show-more' });
      }
    }
    
    // No results
    if (results.series.length === 0 && results.volumes.length === 0) {
      result.push({ type: 'noResults', id: 'no-results' });
    }
    
    return result;
  }, [results, showAllVolumes]);
  
  // Combined header with loading/error states
  const ListHeader = useMemo(() => (
    <View>
      {headerComponent}
      {error != null && (
        <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
          <Text variant="text-sm/normal" color="error">⚠ {error}</Text>
        </View>
      )}
      {isLoading && progress != null && (
        <SearchProgressIndicator progress={progress} />
      )}
    </View>
  ), [headerComponent, error, isLoading, theme.errorBg]);

  const renderItem = useCallback(
    ({ item }: { item: ResultItem }) => {
      switch (item.type) {
        case 'sectionHeader':
          return (
            <View style={styles.sectionHeader}>
              <Heading level={2} variant="header-sm/semibold" style={styles.sectionTitle}>
                {item.title}
              </Heading>
            </View>
          );
        case 'bestMatch': {
          if (!results?.bestMatch) return null;
          if (results.bestMatch.type === 'series' && results.bestMatch.series) {
            return (
              <SeriesCard
                series={results.bestMatch.series}
                onPress={() => onSelectSeries(results.bestMatch!.series!.id)}
                theme={theme}
                highlighted
              />
            );
          }
          if (results.bestMatch.type === 'volume' && results.bestMatch.volume) {
            return (
              <VolumeCard
                volume={results.bestMatch.volume}
                onPress={() => {
                  if (results.bestMatch!.volume!.id != null && results.bestMatch!.volume!.id !== '') {
                    onSelectVolume(results.bestMatch!.volume!.id);
                  }
                }}
                theme={theme}
                highlighted
              />
            );
          }
          return null;
        }
        case 'series':
          return (
            <SeriesCard
              series={item.series}
              onPress={() => onSelectSeries(item.series.id)}
              theme={theme}
            />
          );
        case 'volume':
          return (
            <VolumeCard
              volume={item.volume}
              onPress={() => { if (item.volume.id != null && item.volume.id !== '') onSelectVolume(item.volume.id); }}
              theme={theme}
            />
          );
        case 'showMore':
          // Note: 'showMore' items are only added when results.volumes.length > 12
          return results != null ? (
            <TouchableOpacity
              style={[styles.showMoreButton, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
              onPress={onToggleShowAllVolumes}
            >
              <Text variant="text-sm/normal" color="text-secondary">
                {showAllVolumes ? 'Show less' : `Show all ${results.volumes.length} volumes`}
              </Text>
            </TouchableOpacity>
          ) : null;
        case 'noResults':
          return (
            <View style={styles.noResults}>
              <RNText style={styles.noResultsIcon}>🔍</RNText>
              <Text variant="text-md/normal" color="text-secondary">
                No results found for "{results?.query}"
              </Text>
            </View>
          );
        default:
          return null;
      }
    },
    [results, theme, showAllVolumes, onSelectSeries, onSelectVolume, onToggleShowAllVolumes]
  );

  const keyExtractor = useCallback((item: ResultItem) => item.id, []);

  return (
    <View style={styles.results}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.resultsContent}
        ListHeaderComponent={ListHeader}
      />
    </View>
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
    paddingHorizontal: spacing.lg, // Match search container padding
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
    alignSelf: 'stretch', // Take full width to respect header padding
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
    zIndex: 10,
  },
  searchInputContainer: {
    position: 'relative',
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
  results: {
    flex: 1,
    // No horizontal padding here - let individual components handle their own padding
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    paddingTop: spacing.md,
    marginHorizontal: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  resultsContent: {
    paddingBottom: spacing.xl,
  },
  seriesCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  seriesCardHighlighted: {
    borderWidth: 2,
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
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  volumeCardHighlighted: {
    borderWidth: 2,
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
    marginHorizontal: spacing.lg,
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  noResults: {
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  noResultsIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyStateScroll: {
    flex: 1,
  },
  emptyStateContent: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  fallbackSuggestions: {
    alignItems: 'center',
    paddingTop: spacing.lg,
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
  // Recommendations section
  recommendationsSection: {
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  recommendationsTitle: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  recommendationsSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  recommendationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recommendationCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  recommendationCover: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  recommendationCoverImage: {
    width: '100%',
    height: '100%',
  },
  recommendationCoverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationCoverPlaceholderText: {
    fontSize: 32,
  },
  recommendationInfo: {
    padding: spacing.sm,
  },
  recommendationTitle: {
    marginBottom: 4,
  },
  recommendationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  // Skeleton loading
  recommendationSkeleton: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  skeletonCover: {
    width: '100%',
    aspectRatio: 2 / 3,
  },
  skeletonInfo: {
    padding: spacing.sm,
  },
  skeletonTitle: {
    height: 14,
    borderRadius: 4,
    marginBottom: 8,
    width: '80%',
  },
  skeletonBadge: {
    height: 20,
    borderRadius: 4,
    width: '50%',
  },
});
