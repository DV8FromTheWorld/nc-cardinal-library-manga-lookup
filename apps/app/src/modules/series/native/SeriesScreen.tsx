/**
 * Series detail screen component for React Native.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../routing/native/Router';
import { useSeriesDetails } from '../hooks/useSeriesDetails';
import { useHomeLibrary } from '../../settings/hooks/useHomeLibrary';
import { DebugPanel } from '../../debug/native/DebugPanel';
import { clearCacheForSeries } from '../../search/services/mangaApi';
import { getAvailabilityPercent } from '../../search/utils/availability';
import type { VolumeInfo } from '../../search/types';
import { Text } from '../../../design/components/Text/native/Text';
import { Heading } from '../../../design/components/Heading/native/Heading';
import { colors, spacing, type ThemeColors } from '../../search/native/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Series'>;

export function SeriesScreen({ navigation, route }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const { slug } = route.params;
  const { homeLibrary } = useHomeLibrary();

  const { series, isLoading, error, refreshWithDebug } = useSeriesDetails({
    seriesSlug: slug,
    homeLibrary,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSelectBook = (isbn: string) => {
    navigation.navigate('Book', { isbn });
  };

  const handleClearCache = useCallback(async () => {
    if (slug) {
      await clearCacheForSeries(slug);
      // Reload the screen with fresh data
      navigation.replace('Series', { slug });
    }
  }, [slug, navigation]);

  // Loading State
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text variant="text-md/normal" color="text-secondary" style={styles.loadingText}>
            Loading series details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error State
  if (error || !series) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text variant="text-md/medium" color="accent">← Back to search</Text>
        </TouchableOpacity>
        <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
          <Text variant="text-sm/normal" color="error">⚠ {error ?? 'Series not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const availabilityPercent = getAvailabilityPercent(series.availableCount, series.totalVolumes);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text variant="text-md/medium" color="accent">← Back to search</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          {series.coverImage && (
            <SeriesCoverImage uri={series.coverImage} theme={theme} />
          )}
          <View style={styles.headerContent}>
            <Heading level={1} variant="header-lg/bold" style={styles.title}>{series.title}</Heading>
            {series.author && (
              <Text variant="text-sm/normal" color="text-secondary" style={styles.author}>by {series.author}</Text>
            )}
            <View style={styles.badges}>
              {series.isComplete && (
                <View style={[styles.badge, { backgroundColor: theme.successBg }]}>
                  <Text variant="text-xs/medium" color="success">✓ Complete Series</Text>
                </View>
              )}
              <View style={[styles.badge, { backgroundColor: theme.bgSecondary }]}>
                <Text variant="text-xs/medium" color="text-secondary">
                  {series.totalVolumes} volumes
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Availability Section */}
        <View style={styles.section}>
          <Heading level={2} variant="header-sm/semibold" style={styles.sectionTitle}>Library Availability</Heading>
          <View style={[styles.availabilityCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            <View style={styles.availabilityStats}>
              <Text variant="header-md/bold" color="text-primary">
                {series.availableCount}
                <Text variant="text-sm/normal" color="text-primary"> of {series.totalVolumes} available</Text>
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
              {availabilityPercent}% in NC Cardinal
            </Text>

            {/* Missing Volumes */}
            {series.missingVolumes.length > 0 && series.missingVolumes.length <= 10 && (
              <View style={styles.missingVolumes}>
                <Text variant="text-sm/medium" color="text-secondary" style={styles.missingTitle}>
                  Missing from library:
                </Text>
                <View style={styles.missingList}>
                  {series.missingVolumes.map((vol) => (
                    <View key={vol} style={[styles.missingVolume, { backgroundColor: theme.bgTertiary }]}>
                      <Text variant="text-xs/normal" color="text-muted">
                        Vol. {vol}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {series.missingVolumes.length > 10 && (
              <Text variant="text-sm/normal" color="text-muted" style={styles.missingNote}>
                {series.missingVolumes.length} volumes not available in the library
              </Text>
            )}
          </View>
        </View>

        {/* All Volumes Section */}
        <View style={styles.section}>
          <Heading level={2} variant="header-sm/semibold" style={styles.sectionTitle}>All Volumes</Heading>
          {series.volumes.map((volume) => (
            <VolumeRow
              key={volume.volumeNumber}
              volume={volume}
              seriesTitle={series.title}
              seriesSlug={series.slug}
              onPress={() => volume.isbn && handleSelectBook(volume.isbn)}
              theme={theme}
            />
          ))}
        </View>

        {/* Debug Panel */}
        <DebugPanel
          debug={series._debug}
          onRefreshWithDebug={!series._debug ? refreshWithDebug : undefined}
          cacheContext={slug ? { type: 'series', identifier: slug } : undefined}
          onClearCache={handleClearCache}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SeriesCoverImageProps {
  uri: string;
  theme: ThemeColors;
}

function SeriesCoverImage({ uri, theme }: SeriesCoverImageProps): JSX.Element {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return <View />;
  }

  return (
    <View style={styles.headerCover}>
      <Image
        source={{ uri }}
        style={styles.headerCoverImage}
        onError={() => setImageError(true)}
      />
    </View>
  );
}

interface VolumeRowProps {
  volume: VolumeInfo;
  seriesTitle: string;
  seriesSlug: string;
  onPress: () => void;
  theme: ThemeColors;
}

function VolumeRow({ volume, seriesTitle, seriesSlug, onPress, theme }: VolumeRowProps): JSX.Element {
  const isAvailable = volume.availability?.available ?? false;
  const hasISBN = !!volume.isbn;
  const [imageError, setImageError] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.volumeRow,
        { backgroundColor: theme.bgSecondary, borderColor: theme.border },
        !hasISBN && styles.volumeRowDisabled,
      ]}
      onPress={onPress}
      activeOpacity={hasISBN ? 0.7 : 1}
      disabled={!hasISBN}
    >
      {/* Cover */}
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

      {/* Volume Number */}
      <View style={styles.volumeNumberContainer}>
        <Text variant="text-xs/normal" color="text-muted">Vol.</Text>
        <Text variant="header-sm/bold" color="text-primary">{volume.volumeNumber}</Text>
      </View>

      {/* Info */}
      <View style={styles.volumeInfo}>
        {volume.title && (
          <Text variant="text-sm/medium" color="text-primary" numberOfLines={1}>
            {volume.title}
          </Text>
        )}
        {volume.isbn && (
          <Text variant="text-xs/normal" color="text-muted" style={styles.volumeIsbn}>ISBN: {volume.isbn}</Text>
        )}
      </View>

      {/* Status */}
      <View style={styles.volumeStatus}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isAvailable ? theme.success : theme.textMuted },
          ]}
        />
        <Text variant="text-xs/normal" color="text-muted">
          {isAvailable
            ? `${volume.availability?.totalCopies} ${volume.availability?.totalCopies === 1 ? 'copy' : 'copies'}`
            : 'Not available'}
        </Text>
      </View>

      {/* View Arrow */}
      {hasISBN && <Text variant="text-md/semibold" color="accent">→</Text>}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorContainer: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerCover: {
    width: 100,
  },
  headerCoverImage: {
    width: 100,
    height: 150,
    borderRadius: 8,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    marginBottom: spacing.xs,
  },
  author: {
    marginBottom: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  availabilityCard: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  availabilityStats: {
    marginBottom: spacing.sm,
  },
  availabilityBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: spacing.xs,
  },
  availabilityFill: {
    height: '100%',
    borderRadius: 4,
  },
  missingVolumes: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  missingTitle: {
    marginBottom: spacing.sm,
  },
  missingList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  missingVolume: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  missingNote: {
    marginTop: spacing.md,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  volumeRowDisabled: {
    opacity: 0.5,
  },
  volumeCover: {
    width: 40,
  },
  volumeCoverImage: {
    width: 40,
    height: 60,
    borderRadius: 4,
  },
  volumeCoverPlaceholder: {
    width: 40,
    height: 60,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeNumberContainer: {
    alignItems: 'center',
    width: 40,
  },
  volumeInfo: {
    flex: 1,
  },
  volumeIsbn: {
    marginTop: 2,
  },
  volumeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
