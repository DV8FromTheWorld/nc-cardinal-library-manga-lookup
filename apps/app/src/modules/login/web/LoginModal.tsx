/**
 * Login modal component for web.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { login } from '../../authentication/store';
import { Text } from '../../../design/components/Text/web/Text';
import styles from './LoginModal.module.css';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps): JSX.Element | null {
  const [cardNumber, setCardNumber] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cardInputRef = useRef<HTMLInputElement>(null);

  // Focus card input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => cardInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCardNumber('');
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
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

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className={styles.header}>
          <div>
            <Text variant="header-md/bold" id="login-title" className={styles.title}>
              Sign In
            </Text>
            <Text variant="text-sm/normal" color="text-secondary" tag="p" className={styles.subtitle}>
              Use your NC Cardinal library card
            </Text>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <Text variant="text-sm/semibold" tag="label" htmlFor="cardNumber" className={styles.label}>
              Library Card Number
            </Text>
            <input
              ref={cardInputRef}
              id="cardNumber"
              type="text"
              className={styles.input}
              placeholder="Enter your card number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.field}>
            <Text variant="text-sm/semibold" tag="label" htmlFor="pin" className={styles.label}>
              PIN
            </Text>
            <input
              id="pin"
              type="password"
              className={styles.input}
              placeholder="Enter your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className={styles.error}>
              <span>⚠</span>
              <Text variant="text-sm/normal">{error}</Text>
            </div>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || !cardNumber.trim() || !pin.trim()}
          >
            {isLoading ? <span className={styles.spinner} /> : 'Sign In'}
          </button>
        </form>

        <Text variant="text-xs/normal" color="text-muted" tag="p" className={styles.hint}>
          Don't have a card?{' '}
          <a href="https://nccardinal.org/eg/opac/register" target="_blank" rel="noopener noreferrer">
            Register online
          </a>
        </Text>
      </div>
    </div>
  );
}
