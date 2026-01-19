/**
 * Login modal component for React Native.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { login } from '../../authentication/store';
import { Text } from '../../../design/components/Text/native/Text';
import { Heading } from '../../../design/components/Heading/native/Heading';
import { colors, spacing } from '../../search/native/theme';

interface LoginModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LoginModal({ visible, onClose }: LoginModalProps): JSX.Element {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? colors.dark : colors.light;

  const [cardNumber, setCardNumber] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setCardNumber('');
      setPin('');
      setError(null);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    if (cardNumber.trim() === '' || pin.trim() === '') return;

    setError(null);
    setIsLoading(true);

    try {
      const result = await login(cardNumber, pin);
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? 'Login failed');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [cardNumber, pin, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.overlayBackground}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.modal, { backgroundColor: theme.bgPrimary }]}>
          <View style={styles.header}>
            <View>
              <Heading level={2} variant="header-md/bold">Sign In</Heading>
              <Text variant="text-sm/normal" color="text-secondary" style={styles.subtitle}>
                Use your NC Cardinal library card
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text variant="header-md/normal" color="text-muted">×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text variant="text-sm/semibold" color="text-primary" style={styles.label}>
                Library Card Number
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.bgSecondary,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                placeholder="Enter your card number"
                placeholderTextColor={theme.textMuted}
                value={cardNumber}
                onChangeText={setCardNumber}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text variant="text-sm/semibold" color="text-primary" style={styles.label}>
                PIN
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.bgSecondary,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                placeholder="Enter your PIN"
                placeholderTextColor={theme.textMuted}
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error != null && (
              <View style={[styles.errorBox, { backgroundColor: theme.errorBg }]}>
                <Text variant="text-sm/normal" color="error">⚠ {error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: theme.accent },
                (isLoading || cardNumber.trim() === '' || pin.trim() === '') && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isLoading || cardNumber.trim() === '' || pin.trim() === ''}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text variant="text-md/semibold" style={styles.submitButtonText}>
                  Sign In
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text variant="text-xs/normal" color="text-muted" style={styles.hint}>
            Don't have a card? Visit nccardinal.org to register
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modal: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  closeButton: {
    padding: spacing.xs,
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    // handled by Text component
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 10,
    borderWidth: 2,
    fontSize: 16,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: 8,
  },
  submitButton: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
  },
  hint: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
