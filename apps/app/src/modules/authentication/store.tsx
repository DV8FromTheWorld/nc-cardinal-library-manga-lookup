/**
 * Authentication store.
 *
 * State-only store with exported action functions.
 *
 * Usage in React:
 *   const session = useAuthStore((s) => s.session);
 *   const isLoggedIn = useAuthStore(selectIsLoggedIn);
 *
 * Usage outside React:
 *   const session = useAuthStore.getState().session;
 *   await login('card', 'pin');
 */

import { createPersistentStore } from '../store/createStore';
import * as authApi from './services/authApi';
import type { UserSession, LoginResult } from './types';

// ============================================================================
// State
// ============================================================================

interface AuthState {
  session: UserSession | null;
  isLoading: boolean;
  isInitialized: boolean;
}

export const useAuthStore = createPersistentStore<AuthState>()(
  () => ({
    session: null,
    isLoading: false,
    isInitialized: false,
  }),
  {
    name: 'nc-cardinal-auth',
    partialize: (state) => ({ session: state.session }),
  }
);

// ============================================================================
// Actions
// ============================================================================

/**
 * Login with library card number and PIN.
 */
export async function login(cardNumber: string, pin: string): Promise<LoginResult> {
  useAuthStore.setState({ isLoading: true });

  try {
    const response = await authApi.login(cardNumber, pin);

    if (response.success && response.sessionId != null) {
      const session: UserSession = {
        sessionId: response.sessionId,
        cardNumber,
        displayName: response.displayName,
        loggedInAt: Date.now(),
      };

      useAuthStore.setState({ session, isLoading: false });
      return { success: true };
    }

    useAuthStore.setState({ isLoading: false });
    return { success: false, error: response.error ?? 'Login failed' };
  } catch (error) {
    useAuthStore.setState({ isLoading: false });

    if (error instanceof authApi.AuthApiError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Network error' };
  }
}

/**
 * Logout and clear session.
 */
export async function logout(): Promise<void> {
  const { session } = useAuthStore.getState();

  if (session) {
    try {
      await authApi.logout(session.sessionId);
    } catch {
      // Ignore errors - clear session anyway
    }
  }

  useAuthStore.setState({ session: null });
}

/**
 * Initialize auth state on app start.
 * Validates any persisted session with the server.
 */
export async function initialize(): Promise<void> {
  const { session, isInitialized } = useAuthStore.getState();

  if (isInitialized) return;

  if (session) {
    try {
      const status = await authApi.checkSession(session.sessionId);

      if (status.valid) {
        useAuthStore.setState({
          session: {
            ...session,
            displayName: status.displayName ?? session.displayName,
          },
          isInitialized: true,
        });
      } else {
        useAuthStore.setState({ session: null, isInitialized: true });
      }
    } catch {
      useAuthStore.setState({ session: null, isInitialized: true });
    }
  } else {
    useAuthStore.setState({ isInitialized: true });
  }
}

// ============================================================================
// Selectors
// ============================================================================

export const selectIsLoggedIn = (state: AuthState): boolean =>
  state.session !== null;

export const selectDisplayName = (state: AuthState): string | null =>
  state.session?.displayName ?? state.session?.cardNumber ?? null;
