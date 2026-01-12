/**
 * Series detail screen component for React Native.
 */

import { useState } from 'react';
import {
  View,
  Text,
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
import { getAvailabilityPercent } from '../../search/utils/availability';
import type { VolumeInfo } from '../../search/types';
import { colors, spacing, type ThemeColors } from '../../search/native/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Series'>;

export function SeriesScreen({ navigation, route }: Props): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const { slug } = route.params;
  const { homeLibrary } = useHomeLibrary();

  const { series, isLoading, error } = useSeriesDetails({
    seriesSlug: slug,
    homeLibrary,
  });

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSelectBook = (isbn: string) => {
    navigation.navigate('Book', { isbn });
  };

  // Loading State
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
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
          <Text style={[styles.backButtonText, { color: theme.accent }]}>← Back to search</Text>
        </TouchableOpacity>
        <View style={[styles.errorContainer, { backgroundColor: theme.errorBg }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>⚠ {error ?? 'Series not found'}</Text>
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
          <Text style={[styles.backButtonText, { color: theme.accent }]}>← Back to search</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          {series.coverImage && (
            <SeriesCoverImage uri={series.coverImage} theme={theme} />
          )}
          <View style={styles.headerContent}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{series.title}</Text>
            {series.author && (
              <Text style={[styles.author, { color: theme.textSecondary }]}>by {series.author}</Text>
            )}
            <View style={styles.badges}>
              {series.isComplete && (
                <View style={[styles.badge, { backgroundColor: theme.successBg }]}>
                  <Text style={[styles.badgeText, { color: theme.success }]}>✓ Complete Series</Text>
                </View>
              )}
              <View style={[styles.badge, { backgroundColor: theme.bgSecondary }]}>
                <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                  {series.totalVolumes} volumes
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Availability Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Library Availability</Text>
          <View style={[styles.availabilityCard, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}>
            <View style={styles.availabilityStats}>
              <Text style={[styles.statLarge, { color: theme.textPrimary }]}>
                {series.availableCount}
                <Text style={styles.statSmall}> of {series.totalVolumes} available</Text>
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
            <Text style={[styles.availabilityPercent, { color: theme.textMuted }]}>
              {availabilityPercent}% in NC Cardinal
            </Text>

            {/* Missing Volumes */}
            {series.missingVolumes.length > 0 && series.missingVolumes.length <= 10 && (
              <View style={styles.missingVolumes}>
                <Text style={[styles.missingTitle, { color: theme.textSecondary }]}>
                  Missing from library:
                </Text>
                <View style={styles.missingList}>
                  {series.missingVolumes.map((vol) => (
                    <View key={vol} style={[styles.missingVolume, { backgroundColor: theme.bgTertiary }]}>
                      <Text style={[styles.missingVolumeText, { color: theme.textMuted }]}>
                        Vol. {vol}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {series.missingVolumes.length > 10 && (
              <Text style={[styles.missingNote, { color: theme.textMuted }]}>
                {series.missingVolumes.length} volumes not available in the library
              </Text>
            )}
          </View>
        </View>

        {/* All Volumes Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>All Volumes</Text>
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
            <Text>📖</Text>
          </View>
        )}
      </View>

      {/* Volume Number */}
      <View style={styles.volumeNumberContainer}>
        <Text style={[styles.volLabel, { color: theme.textMuted }]}>Vol.</Text>
        <Text style={[styles.volNum, { color: theme.textPrimary }]}>{volume.volumeNumber}</Text>
      </View>

      {/* Info */}
      <View style={styles.volumeInfo}>
        {volume.title && (
          <Text style={[styles.volumeTitle, { color: theme.textPrimary }]} numberOfLines={1}>
            {volume.title}
          </Text>
        )}
        {volume.isbn && (
          <Text style={[styles.volumeIsbn, { color: theme.textMuted }]}>ISBN: {volume.isbn}</Text>
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
        <Text style={[styles.statusText, { color: theme.textMuted }]}>
          {isAvailable
            ? `${volume.availability?.totalCopies} ${volume.availability?.totalCopies === 1 ? 'copy' : 'copies'}`
            : 'Not available'}
        </Text>
      </View>

      {/* View Arrow */}
      {hasISBN && <Text style={[styles.viewArrow, { color: theme.accent }]}>→</Text>}
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
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  author: {
    fontSize: 14,
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
  badgeText: {
    fontSize: 12,
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
  availabilityCard: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  availabilityStats: {
    marginBottom: spacing.sm,
  },
  statLarge: {
    fontSize: 24,
    fontWeight: '700',
  },
  statSmall: {
    fontSize: 14,
    fontWeight: '400',
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
  availabilityPercent: {
    fontSize: 12,
  },
  missingVolumes: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  missingTitle: {
    fontSize: 13,
    fontWeight: '500',
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
  missingVolumeText: {
    fontSize: 12,
  },
  missingNote: {
    marginTop: spacing.md,
    fontSize: 13,
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
  volLabel: {
    fontSize: 10,
  },
  volNum: {
    fontSize: 18,
    fontWeight: '700',
  },
  volumeInfo: {
    flex: 1,
  },
  volumeTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  volumeIsbn: {
    fontSize: 11,
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
  statusText: {
    fontSize: 11,
  },
  viewArrow: {
    fontSize: 16,
    fontWeight: '600',
  },
});
