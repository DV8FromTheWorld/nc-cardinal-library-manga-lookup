/**
 * Volume detail screen component for React Native.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { Text } from '../../../design/components/Text/native/Text';
import { DebugPanel } from '../../debug/native/DebugPanel';
import type { RootStackParamList } from '../../routing/native/Router';
import { colors, spacing } from '../../search/native/theme';
import { clearCacheForBook } from '../../search/services/mangaApi';
import { getAvailableCount, groupHoldingsByLibrary } from '../../search/utils/availability';
import {
  cleanDisplayTitle,
  formatAuthorName,
  getAmazonUrl,
  getBestIsbnForAmazon,
} from '../../search/utils/formatters';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { useVolumeDetails } from '../hooks/useVolumeDetails';

type Props = NativeStackScreenProps<RootStackParamList, 'Volume'>;

export function VolumeScreen({ navigation, route }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const { id } = route.params;
  const { homeLibrary, libraryName: homeLibraryName } = useHomeLibrary();
  const [expandedLibraries, setExpandedLibraries] = useState(false);
  const [imageError, setImageError] = useState(false);

  const { volume, isLoading, error } = useVolumeDetails({
    volumeId: id,
    homeLibrary,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSelectSeries = (seriesId: string) => {
    navigation.navigate('Series', { id: seriesId });
  };

  const handleOpenCatalog = () => {
    if (volume?.catalogUrl != null) {
      void Linking.openURL(volume.catalogUrl);
    }
  };

  // Get the primary ISBN from the volume for cache clearing
  // Use first ISBN for cache, but prefer English ISBN for Amazon
  const primaryIsbn = volume?.isbns?.[0];
  const amazonIsbn = volume?.isbns ? getBestIsbnForAmazon(volume.isbns) : undefined;

  const handleClearCache = useCallback(async () => {
    if (primaryIsbn != null) {
      await clearCacheForBook(primaryIsbn);
      // Navigation will reload the screen with fresh data
      navigation.replace('Volume', { id });
    }
  }, [primaryIsbn, navigation, id]);

  // Loading State
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
            Loading volume details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error State
  if (error != null || volume == null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text variant="text-md/medium" color="interactive-primary" style={styles.backButtonText}>
            ← Back
          </Text>
        </TouchableOpacity>
        <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
          <Text variant="text-md/normal" color="error" style={styles.errorText}>
            ⚠ {error ?? 'Volume not found'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Group holdings by library
  const holdingsByLibrary = groupHoldingsByLibrary(volume.holdings);
  const libraryNames = Object.keys(holdingsByLibrary).sort();
  const displayLibraries = expandedLibraries ? libraryNames : libraryNames.slice(0, 5);

  // Clean up title and author names for display
  const displayTitle = cleanDisplayTitle(volume.title);
  const displayAuthors = volume.authors.map(formatAuthorName);

  // Get series ID for navigation (if available from entity store)
  const seriesId = volume.seriesInfo?.id;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text variant="text-md/medium" color="interactive-primary" style={styles.backButtonText}>
            ← Back
          </Text>
        </TouchableOpacity>

        {/* Volume Layout */}
        <View style={styles.bookLayout}>
          {/* Cover */}
          <View style={styles.bookCover}>
            {volume.coverImage != null && imageError === false ? (
              <Image
                source={{ uri: volume.coverImage }}
                style={styles.coverImage}
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: theme.bgSecondary }]}>
                <RNText style={styles.coverPlaceholderText}>📖</RNText>
              </View>
            )}
          </View>

          {/* Header Info */}
          <View style={styles.bookMain}>
            <Text variant="header-md/bold" style={styles.title}>
              {displayTitle}
            </Text>

            {displayAuthors.length > 0 && (
              <Text variant="text-sm/normal" color="text-secondary" style={styles.authors}>
                {displayAuthors.slice(0, 2).join(' • ')}
              </Text>
            )}

            {volume.seriesInfo != null && seriesId != null && (
              <TouchableOpacity
                style={[styles.seriesLink, { backgroundColor: theme.bgSecondary }]}
                onPress={() => handleSelectSeries(seriesId)}
              >
                <Text
                  variant="text-sm/medium"
                  color="interactive-primary"
                  style={styles.seriesLinkText}
                >
                  📚 Part of: {volume.seriesInfo.title}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Description Section */}
        {volume.summary != null && (
          <View style={styles.section}>
            <Text variant="header-sm/semibold" style={styles.sectionTitle}>
              Description
            </Text>
            <Text variant="text-md/normal" color="text-secondary" style={styles.descriptionText}>
              {volume.summary}
            </Text>
          </View>
        )}

        {/* Availability Section */}
        <View style={styles.section}>
          <Text variant="header-sm/semibold" style={styles.sectionTitle}>
            Availability
          </Text>
          <View
            style={[
              styles.availabilityCard,
              { backgroundColor: theme.bgSecondary, borderColor: theme.border },
            ]}
          >
            {/* Status */}
            <View style={styles.availabilitySummary}>
              <View
                style={[
                  styles.availabilityStatus,
                  {
                    backgroundColor: volume.availability.available
                      ? theme.successBg
                      : theme.errorBg,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusIndicator,
                    {
                      backgroundColor: volume.availability.available ? theme.success : theme.error,
                    },
                  ]}
                />
                <Text
                  variant="text-sm/semibold"
                  color={volume.availability.available ? 'success' : 'error'}
                  style={styles.statusLabel}
                >
                  {volume.availability.available ? 'Available Now' : 'Not Currently Available'}
                </Text>
              </View>

              <View style={styles.copyCount}>
                <Text variant="header-lg/bold">{volume.availability.availableCopies}</Text>
                <Text variant="text-sm/normal" color="text-secondary">
                  {' '}
                  of {volume.availability.totalCopies} copies available
                </Text>
              </View>

              {/* Local vs Remote */}
              {volume.availability.localCopies !== undefined && (
                <View style={styles.localRemote}>
                  <View style={styles.localStatus}>
                    <View
                      style={[
                        styles.localDot,
                        {
                          backgroundColor:
                            (volume.availability.localAvailable ?? 0) > 0
                              ? theme.success
                              : theme.textMuted,
                        },
                      ]}
                    />
                    <Text variant="text-sm/normal" color="text-secondary" style={styles.localText}>
                      {homeLibraryName ?? 'Your Library'}:{' '}
                      {(volume.availability.localAvailable ?? 0) > 0
                        ? `${volume.availability.localAvailable} available`
                        : volume.availability.localCopies > 0
                          ? 'All checked out'
                          : 'None'}
                    </Text>
                  </View>
                  {(volume.availability.remoteCopies ?? 0) > 0 && (
                    <Text variant="text-sm/normal" color="text-muted" style={styles.remoteText}>
                      Other libraries: {volume.availability.remoteAvailable ?? 0} available
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Catalog Link */}
            {volume.catalogUrl != null && (
              <TouchableOpacity
                style={[styles.catalogLink, { borderTopColor: theme.border }]}
                onPress={handleOpenCatalog}
              >
                <Text
                  variant="text-sm/medium"
                  color="interactive-primary"
                  style={styles.catalogLinkText}
                >
                  🔗 View in NC Cardinal Catalog
                </Text>
              </TouchableOpacity>
            )}

            {/* External Links */}
            <View style={[styles.externalLinks, { borderTopColor: theme.border }]}>
              {amazonIsbn != null && (
                <TouchableOpacity
                  style={[styles.externalLink, { backgroundColor: theme.bgTertiary }]}
                  onPress={() => Linking.openURL(getAmazonUrl(amazonIsbn))}
                >
                  <Text variant="text-sm/medium" style={styles.externalLinkText}>
                    🛒 Amazon
                  </Text>
                </TouchableOpacity>
              )}
              {volume.seriesInfo != null && (
                <TouchableOpacity
                  style={[styles.externalLink, { backgroundColor: theme.bgTertiary }]}
                  onPress={() =>
                    Linking.openURL(
                      `https://myanimelist.net/manga.php?q=${encodeURIComponent(volume.seriesInfo?.title ?? '')}`
                    )
                  }
                >
                  <Text variant="text-sm/medium" style={styles.externalLinkText}>
                    📊 MyAnimeList
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Library List */}
            <View style={[styles.libraryList, { borderTopColor: theme.border }]}>
              <Text variant="text-sm/medium" color="text-secondary" style={styles.libraryListTitle}>
                Available at {volume.availability.libraries.length}{' '}
                {volume.availability.libraries.length === 1 ? 'library' : 'libraries'}
              </Text>

              {displayLibraries.map((libraryName) => {
                const holdings = holdingsByLibrary[libraryName];
                const firstHolding = holdings?.[0];
                if (!holdings || !firstHolding) return null;

                const availableCount = getAvailableCount(holdings);

                return (
                  <View
                    key={libraryName}
                    style={[styles.libraryItem, { borderBottomColor: theme.border }]}
                  >
                    <View style={styles.libraryInfo}>
                      <Text variant="text-sm/medium" style={styles.libraryName}>
                        {libraryName}
                      </Text>
                      <Text
                        variant="text-xs/normal"
                        color="text-muted"
                        style={styles.libraryLocation}
                      >
                        {firstHolding.location} • {firstHolding.callNumber}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.copyBadge,
                        {
                          backgroundColor: availableCount > 0 ? theme.successBg : theme.bgTertiary,
                        },
                      ]}
                    >
                      <Text
                        variant="text-xs/medium"
                        color={availableCount > 0 ? 'success' : 'text-muted'}
                        style={styles.copyBadgeText}
                      >
                        {availableCount > 0 ? `${availableCount} available` : 'Checked out'}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {libraryNames.length > 5 && (
                <TouchableOpacity
                  style={styles.expandButton}
                  onPress={() => setExpandedLibraries(!expandedLibraries)}
                >
                  <Text
                    variant="text-sm/medium"
                    color="interactive-primary"
                    style={styles.expandButtonText}
                  >
                    {expandedLibraries
                      ? 'Show fewer libraries'
                      : `Show ${libraryNames.length - 5} more libraries`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Subjects */}
        {volume.subjects.length > 0 && (
          <View style={styles.section}>
            <Text variant="header-sm/semibold" style={styles.sectionTitle}>
              Subjects
            </Text>
            <View style={styles.subjectTags}>
              {[...new Set(volume.subjects)].slice(0, 10).map((subject) => (
                <View
                  key={subject}
                  style={[styles.subjectTag, { backgroundColor: theme.bgSecondary }]}
                >
                  <Text
                    variant="text-xs/normal"
                    color="text-secondary"
                    style={styles.subjectTagText}
                  >
                    {subject.replace(/\.$/, '')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Identifiers */}
        <View style={styles.section}>
          <Text variant="header-sm/semibold" style={styles.sectionTitle}>
            Identifiers
          </Text>
          <View
            style={[
              styles.identifiers,
              { backgroundColor: theme.bgSecondary, borderColor: theme.border },
            ]}
          >
            {volume.isbns.map((isbn) => (
              <View key={isbn} style={styles.identifier}>
                <Text variant="text-sm/normal" color="text-muted" style={styles.identifierLabel}>
                  ISBN
                </Text>
                <Text variant="code" style={styles.identifierValue}>
                  {isbn}
                </Text>
              </View>
            ))}
            <View style={styles.identifier}>
              <Text variant="text-sm/normal" color="text-muted" style={styles.identifierLabel}>
                Volume ID
              </Text>
              <Text variant="code" style={styles.identifierValue}>
                {volume.id}
              </Text>
            </View>
          </View>
        </View>

        {/* Debug Panel */}
        <DebugPanel
          debug={undefined}
          cacheContext={
            primaryIsbn != null && primaryIsbn !== ''
              ? { type: 'book', identifier: primaryIsbn }
              : undefined
          }
          onClearCache={handleClearCache}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
  },
  bookLayout: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  bookCover: {
    width: 100,
  },
  coverImage: {
    width: 100,
    height: 150,
    borderRadius: 8,
  },
  coverPlaceholder: {
    width: 100,
    height: 150,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholderText: {
    fontSize: 32,
  },
  bookMain: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  authors: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  seriesLink: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  seriesLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 24,
  },
  availabilityCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  availabilitySummary: {
    padding: spacing.md,
  },
  availabilityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  copyCount: {
    marginBottom: spacing.sm,
  },
  copyNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  copyLabel: {
    fontSize: 14,
    fontWeight: '400',
  },
  localRemote: {
    gap: spacing.xs,
  },
  localStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  localDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  localText: {
    fontSize: 13,
  },
  remoteText: {
    fontSize: 13,
    marginLeft: spacing.md + spacing.xs,
  },
  catalogLink: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  catalogLinkText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  externalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  externalLink: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  externalLinkText: {
    fontSize: 13,
    fontWeight: '500',
  },
  libraryList: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  libraryListTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  libraryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  libraryInfo: {
    flex: 1,
  },
  libraryName: {
    fontSize: 14,
    fontWeight: '500',
  },
  libraryLocation: {
    fontSize: 12,
    marginTop: 2,
  },
  copyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  copyBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  expandButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  subjectTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subjectTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  subjectTagText: {
    fontSize: 12,
  },
  identifiers: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
  },
  identifier: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  identifierLabel: {
    fontSize: 13,
  },
  identifierValue: {
    fontSize: 13,
    fontWeight: '500',
  },
});
