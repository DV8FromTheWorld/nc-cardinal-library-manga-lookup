/**
 * Search progress indicator for React Native.
 * Shows step-by-step progress during streaming search.
 */

import { View, Text as RNText, StyleSheet, useColorScheme } from 'react-native';
import { Text } from '../../../design/components/Text/native/Text';
import type { StreamingSearchProgress } from '../types';
import { colors, spacing, type ThemeColors } from './theme';

interface SearchProgressIndicatorProps {
  progress: StreamingSearchProgress;
}

const STEPS = [
  { id: 'wikipedia', label: 'Wikipedia', icon: '📖' },
  { id: 'nc-cardinal', label: 'Library Catalog', icon: '🏛️' },
  { id: 'availability', label: 'Availability', icon: '📚' },
  { id: 'covers', label: 'Cover Images', icon: '🖼️' },
] as const;

type StepStatus = 'complete' | 'active' | 'pending';

function getStepStatus(stepId: string, currentStep: string | null): StepStatus {
  const stepOrder = ['wikipedia', 'nc-cardinal', 'availability', 'covers', 'done'];
  const currentIndex = stepOrder.indexOf(currentStep ?? '');
  const stepIndex = stepOrder.indexOf(stepId);

  if (currentIndex < 0) return 'pending';
  if (stepIndex < currentIndex) return 'complete';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

function getOverallProgress(progress: StreamingSearchProgress): number {
  if (progress.currentStep == null) return 0;

  const stepWeights: Record<string, number> = {
    'wikipedia': 10,
    'nc-cardinal': 20,
    'availability': 60,
    'covers': 90,
    'done': 100,
  };

  let baseProgress = stepWeights[progress.currentStep] ?? 0;

  // Add detail progress for availability and covers
  if (progress.currentStep === 'availability' && progress.availabilityProgress) {
    const { completed, total } = progress.availabilityProgress;
    const stepProgress = total > 0 ? (completed / total) : 0;
    baseProgress = 20 + (stepProgress * 40); // 20% to 60%
  }

  if (progress.currentStep === 'covers' && progress.coversProgress) {
    const { completed, total } = progress.coversProgress;
    const stepProgress = total > 0 ? (completed / total) : 0;
    baseProgress = 60 + (stepProgress * 30); // 60% to 90%
  }

  return Math.min(100, baseProgress);
}

export function SearchProgressIndicator({ progress }: SearchProgressIndicatorProps): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const overallProgress = getOverallProgress(progress);

  return (
    <View style={styles.container}>
      {/* Main progress bar */}
      <View style={[styles.progressBarContainer, { backgroundColor: theme.bgTertiary }]}>
        <View
          style={[
            styles.progressBarFill,
            { backgroundColor: theme.accent, width: `${overallProgress}%` },
          ]}
        />
      </View>

      {/* Current status message */}
      <Text variant="text-md/medium" color="text-primary" style={styles.progressMessage}>
        {progress.message}
      </Text>

      {/* Step indicators */}
      <View style={styles.stepsContainer}>
        {STEPS.map((step) => {
          const status = getStepStatus(step.id, progress.currentStep);
          return (
            <StepIndicator
              key={step.id}
              step={step}
              status={status}
              theme={theme}
            />
          );
        })}
      </View>

      {/* Detailed progress for availability/covers */}
      {progress.availabilityProgress && progress.currentStep === 'availability' && (
        <View style={styles.detailsContainer}>
          <Text variant="text-sm/normal" color="text-secondary">
            Checked {progress.availabilityProgress.completed} of {progress.availabilityProgress.total} volumes
            {progress.availabilityProgress.foundInCatalog > 0 && (
              <Text variant="text-sm/semibold" color="success">
                {' '}• {progress.availabilityProgress.foundInCatalog} found in library
              </Text>
            )}
          </Text>
        </View>
      )}

      {progress.coversProgress && progress.currentStep === 'covers' && (
        <View style={styles.detailsContainer}>
          <Text variant="text-sm/normal" color="text-secondary">
            Loading covers: {progress.coversProgress.completed} of {progress.coversProgress.total}
          </Text>
        </View>
      )}
    </View>
  );
}

interface StepIndicatorProps {
  step: typeof STEPS[number];
  status: StepStatus;
  theme: ThemeColors;
}

function StepIndicator({ step, status, theme }: StepIndicatorProps): JSX.Element {
  const getBackgroundColor = (): string => {
    switch (status) {
      case 'complete':
        return theme.success;
      case 'active':
        return theme.accent;
      case 'pending':
      default:
        return theme.bgTertiary;
    }
  };

  const getTextColor = (): string => {
    switch (status) {
      case 'complete':
      case 'active':
        return theme.textPrimary;
      case 'pending':
      default:
        return theme.textMuted;
    }
  };

  return (
    <View style={styles.stepContainer}>
      <View style={[styles.stepIcon, { backgroundColor: getBackgroundColor() }]}>
        <RNText style={styles.stepIconText}>
          {status === 'complete' ? '✓' : step.icon}
        </RNText>
      </View>
      <Text
        variant="text-xs/medium"
        style={[styles.stepLabel, { color: getTextColor() }]}
      >
        {step.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMessage: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  stepContainer: {
    alignItems: 'center',
    flex: 1,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  stepIconText: {
    fontSize: 18,
  },
  stepLabel: {
    textAlign: 'center',
  },
  detailsContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
