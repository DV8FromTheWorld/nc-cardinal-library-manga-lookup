/**
 * Home screen component for React Native - shows search input and recommendations.
 * The entire screen scrolls as one unit.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  useColorScheme,
  SafeAreaView,
  ScrollView,
  Modal,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useAutocomplete } from '../hooks/useAutocomplete';
import { useRecommendations } from '../hooks/useRecommendations';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { SearchSuggestions } from './SearchSuggestions';
import type { SuggestionItem } from '../types';
import { Text } from '../../../design/components/Text/native/Text';
import { Heading } from '../../../design/components/Heading/native/Heading';
import { LoginModal } from '../../login/native/LoginModal';
import { UserButton } from '../../login/native/UserButton';
import { colors, spacing, type ThemeColors } from './theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const { homeLibrary, setHomeLibrary, libraries, libraryName } = useHomeLibrary();
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [query, setQuery] = useState('');

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

  // Popular manga recommendations
  const {
    items: recommendedItems,
    isLoading: isRecommendationsLoading,
    fallbackSuggestions,
  } = useRecommendations();

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    setAutocompleteQuery(value);
    setShowSuggestions(true);
  }, [setAutocompleteQuery]);

  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay hiding to allow tap on suggestions
    setTimeout(() => setShowSuggestions(false), 200);
  }, []);

  const handleSearch = useCallback(() => {
    if (query.trim() !== '') {
      addRecentSearch(query.trim());
      clearSuggestions();
      setShowSuggestions(false);
      navigation.push('Search', { query: query.trim() });
    }
  }, [query, addRecentSearch, clearSuggestions, navigation]);

  const handleSelectSuggestion = useCallback((title: string) => {
    addRecentSearch(title);
    clearSuggestions();
    setShowSuggestions(false);
    navigation.push('Search', { query: title });
  }, [addRecentSearch, clearSuggestions, navigation]);

  const handleSelectRecent = useCallback((recentQuery: string) => {
    clearSuggestions();
    setShowSuggestions(false);
    navigation.push('Search', { query: recentQuery });
  }, [clearSuggestions, navigation]);

  const handleSelectRecommendation = useCallback((title: string) => {
    addRecentSearch(title);
    navigation.push('Search', { query: title });
  }, [addRecentSearch, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          <TouchableOpacity style={styles.titleButton}>
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
                disabled={query.trim() === ''}
              >
                <RNText style={styles.searchButtonText}>→</RNText>
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

        {/* Recommendations Section */}
        <View style={styles.recommendationsSection}>
          <Heading level={2} variant="header-sm/semibold" style={styles.recommendationsTitle}>
            Popular Manga
          </Heading>
          <Text variant="text-sm/normal" color="text-muted" style={styles.recommendationsSubtitle}>
            Discover trending series available at NC Cardinal
          </Text>
          
          {isRecommendationsLoading ? (
            <View style={styles.recommendationsGrid}>
              {Array.from({ length: 8 }).map((_, idx) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- Skeleton placeholders have no identity; index is appropriate
                <View key={idx} style={[styles.skeletonCard, { backgroundColor: theme.bgSecondary }]}>
                  <View style={[styles.skeletonCover, { backgroundColor: theme.bgTertiary }]} />
                  <View style={styles.skeletonInfo}>
                    <View style={[styles.skeletonTitle, { backgroundColor: theme.bgTertiary }]} />
                    <View style={[styles.skeletonBadge, { backgroundColor: theme.bgTertiary }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : recommendedItems.length > 0 ? (
            <View style={styles.recommendationsGrid}>
              {recommendedItems.map((item) => (
                <RecommendationCard
                  key={item.anilistId}
                  item={item}
                  theme={theme}
                  onPress={() => handleSelectRecommendation(item.title)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.fallbackSuggestions}>
              <Text variant="text-md/normal" color="text-secondary" style={styles.fallbackTitle}>
                Try searching for:
              </Text>
              <View style={styles.fallbackChips}>
                {fallbackSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    style={[styles.fallbackChip, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
                    onPress={() => handleSelectRecommendation(suggestion)}
                  >
                    <Text variant="text-sm/normal" color="text-primary">
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Login Modal */}
        <LoginModal
          visible={showLoginModal}
          onClose={() => setShowLoginModal(false)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Recommendation Card Component
// ============================================================================

interface RecommendationCardProps {
  item: SuggestionItem;
  theme: ThemeColors;
  onPress: () => void;
}

function RecommendationCard({ item, theme, onPress }: RecommendationCardProps): JSX.Element {
  const [imageError, setImageError] = useState(false);

  const getBadgeInfo = () => {
    if (item.status === 'RELEASING') {
      return { text: 'Ongoing', isOngoing: true };
    }
    if (item.volumes != null && item.volumes > 0) {
      return { text: `${item.volumes} vol`, isOngoing: false };
    }
    return { text: 'Complete', isOngoing: false };
  };

  const badge = getBadgeInfo();

  return (
    <TouchableOpacity
      style={[styles.recommendationCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.recommendationCover, { backgroundColor: theme.bgTertiary }]}>
        {item.coverUrl != null && !imageError ? (
          <Image
            source={{ uri: item.coverUrl }}
            style={styles.recommendationCoverImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.recommendationCoverPlaceholder}>
            <RNText style={styles.placeholderEmoji}>📚</RNText>
          </View>
        )}
      </View>
      <View style={styles.recommendationInfo}>
        <Text variant="text-sm/medium" color="text-primary" numberOfLines={2} style={styles.recommendationCardTitle}>
          {item.title}
        </Text>
        <View style={[
          styles.recommendationBadge,
          badge.isOngoing === true ? { backgroundColor: theme.accentAlpha } : null,
        ]}>
          <Text
            variant="text-xs/normal"
            color={badge.isOngoing ? 'accent' : 'text-muted'}
          >
            {badge.text}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  // Header - matches SearchScreen for visual consistency
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
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleIcon: {
    fontSize: 32,
  },
  titleText: {
    fontFamily: 'System',
  },
  subtitle: {
    marginTop: spacing.xs,
    textAlign: 'center',
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  libraryList: {
    paddingHorizontal: spacing.md,
  },
  libraryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  libraryOptionText: {
    flex: 1,
  },
  // Search
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
  // Recommendations
  recommendationsSection: {
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
    marginBottom: spacing.sm,
  },
  recommendationCover: {
    aspectRatio: 2 / 3,
    width: '100%',
  },
  recommendationCoverImage: {
    width: '100%',
    height: '100%',
  },
  recommendationCoverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  recommendationInfo: {
    padding: spacing.sm,
  },
  recommendationCardTitle: {
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  recommendationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  // Skeleton
  skeletonCard: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  skeletonCover: {
    aspectRatio: 2 / 3,
    width: '100%',
  },
  skeletonInfo: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  skeletonTitle: {
    height: 14,
    borderRadius: 4,
    width: '80%',
  },
  skeletonBadge: {
    height: 12,
    borderRadius: 4,
    width: '40%',
  },
  // Fallback
  fallbackSuggestions: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  fallbackTitle: {
    marginBottom: spacing.md,
  },
  fallbackChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  fallbackChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
});
