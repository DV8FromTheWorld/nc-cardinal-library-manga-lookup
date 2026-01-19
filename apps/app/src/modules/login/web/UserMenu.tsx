/**
 * User menu button with dropdown for web.
 * Shows sign-in button when logged out, or user menu when logged in.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Text } from '../../../design/components/Text/web/Text';
import { logout, selectDisplayName, useAuthStore } from '../../authentication/store';
import styles from './LoginModal.module.css';

interface UserMenuProps {
  onLoginClick: () => void;
}

export function UserMenu({ onLoginClick }: UserMenuProps): JSX.Element {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const displayName = useAuthStore(selectDisplayName);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoggedIn = session !== null;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = useCallback(async () => {
    setIsMenuOpen(false);
    await logout();
  }, []);

  // Show loading spinner while initializing
  if (!isInitialized || isLoading) {
    return (
      <button type="button" className={styles.userMenuButton} disabled>
        <span className={styles.spinner} />
      </button>
    );
  }

  if (!isLoggedIn) {
    return (
      <button type="button" className={styles.userMenuButton} onClick={onLoginClick}>
        <span className={styles.userIcon}>👤</span>
        <Text variant="text-sm/medium">Sign In</Text>
      </button>
    );
  }

  // Truncate long names
  const shortName =
    displayName != null && displayName.length > 20
      ? displayName.slice(0, 17) + '...'
      : (displayName ?? 'Account');

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={styles.userMenuButton}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        title={displayName ?? undefined}
      >
        <span className={styles.userIcon}>👤</span>
        <Text variant="text-sm/medium">{shortName}</Text>
      </button>

      {isMenuOpen && (
        <div className={styles.userMenu}>
          {session?.displayName != null && (
            <>
              <div className={styles.userMenuHeader}>
                <Text variant="text-sm/semibold">{session.displayName}</Text>
                {session.cardNumber != null && (
                  <Text variant="text-xs/normal" color="text-muted">
                    Card: {session.cardNumber}
                  </Text>
                )}
              </div>
              <div className={styles.userMenuDivider} />
            </>
          )}
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setIsMenuOpen(false);
              window.location.href = '/account/checkouts';
            }}
          >
            <Text variant="text-sm/normal">Checked Out</Text>
          </button>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setIsMenuOpen(false);
              window.location.href = '/account/history';
            }}
          >
            <Text variant="text-sm/normal">History</Text>
          </button>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setIsMenuOpen(false);
              window.location.href = '/account/holds';
            }}
          >
            <Text variant="text-sm/normal">Holds</Text>
          </button>
          <div className={styles.userMenuDivider} />
          <button type="button" className={styles.userMenuItem} onClick={handleLogout}>
            <Text variant="text-sm/normal" color="error">
              Sign Out
            </Text>
          </button>
        </div>
      )}
    </div>
  );
}
