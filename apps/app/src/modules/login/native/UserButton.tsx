/**
 * User button component for React Native.
 * Shows sign-in button when logged out, or user name button when logged in.
 */

import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

import { Text } from '../../../design/components/Text/native/Text';
import { selectDisplayName, useAuthStore } from '../../authentication/store';
import { colors, spacing } from '../../search/native/theme';

interface UserButtonProps {
  onLoginPress: () => void;
  onAccountPress: () => void;
}

export function UserButton({ onLoginPress, onAccountPress }: UserButtonProps): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const displayName = useAuthStore(selectDisplayName);

  const isLoggedIn = session !== null;

  // Show loading spinner while initializing
  if (!isInitialized || isLoading) {
    return (
      <View
        style={[
          styles.userButton,
          { backgroundColor: theme.bgSecondary, borderColor: theme.border },
        ]}
      >
        <ActivityIndicator size="small" color={theme.textMuted} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <TouchableOpacity
        style={[
          styles.userButton,
          { backgroundColor: theme.bgSecondary, borderColor: theme.border },
        ]}
        onPress={onLoginPress}
      >
        <Text variant="text-md/normal">👤</Text>
        <Text variant="text-sm/medium" color="text-primary">
          Sign In
        </Text>
      </TouchableOpacity>
    );
  }

  // Get display name - truncate if too long
  const shortName =
    displayName != null && displayName.length > 15
      ? displayName.slice(0, 12) + '...'
      : (displayName ?? 'Account');

  return (
    <TouchableOpacity
      style={[styles.userButton, { backgroundColor: theme.bgSecondary, borderColor: theme.border }]}
      onPress={onAccountPress}
    >
      <Text variant="text-md/normal">👤</Text>
      <Text variant="text-sm/medium" color="text-primary">
        {shortName}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  userButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
});
