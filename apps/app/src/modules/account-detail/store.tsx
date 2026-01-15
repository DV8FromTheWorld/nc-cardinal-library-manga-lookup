/**
 * Account detail store.
 *
 * State-only store with exported action functions for
 * managing checkouts, history, and holds data.
 *
 * Usage in React:
 *   const checkouts = useAccountStore((s) => s.checkouts);
 *   const isFetching = useAccountStore((s) => s.isFetchingCheckouts);
 *
 * Usage outside React:
 *   await fetchCheckouts();
 *   const checkouts = useAccountStore.getState().checkouts;
 */

import { createStore } from '../store/createStore';
import * as accountApi from './services/accountApi';
import type { CheckedOutItem, HistoryItem, HoldItem } from './types';

// ============================================================================
// State
// ============================================================================

interface AccountState {
  // Data
  checkouts: CheckedOutItem[];
  history: HistoryItem[];
  holds: HoldItem[];

  // Loading states
  isFetchingCheckouts: boolean;
  isFetchingHistory: boolean;
  isFetchingHolds: boolean;

  // History pagination
  historyEnabled: boolean;
  hasMoreHistory: boolean;
  historyOffset: number;

  // Error
  error: string | null;
}

export const useAccountStore = createStore<AccountState>()(() => ({
  checkouts: [],
  history: [],
  holds: [],

  isFetchingCheckouts: false,
  isFetchingHistory: false,
  isFetchingHolds: false,

  historyEnabled: true,
  hasMoreHistory: false,
  historyOffset: 0,

  error: null,
}));

// ============================================================================
// Actions
// ============================================================================

/**
 * Fetch currently checked out items.
 */
export async function fetchCheckouts(): Promise<void> {
  useAccountStore.setState({ isFetchingCheckouts: true, error: null });

  try {
    const data = await accountApi.getCheckouts();
    useAccountStore.setState({
      checkouts: data.items,
      isFetchingCheckouts: false,
    });
  } catch (err) {
    useAccountStore.setState({
      isFetchingCheckouts: false,
      error: err instanceof Error ? err.message : 'Failed to fetch checkouts',
    });
  }
}

/**
 * Fetch checkout history.
 */
export async function fetchHistory(offset = 0): Promise<void> {
  useAccountStore.setState({ isFetchingHistory: true, error: null });

  try {
    const data = await accountApi.getHistory({ offset, limit: 15 });

    useAccountStore.setState((state) => ({
      history: offset === 0 ? data.items : [...state.history, ...data.items],
      historyEnabled: data.historyEnabled,
      hasMoreHistory: data.hasMore,
      historyOffset: offset,
      isFetchingHistory: false,
    }));
  } catch (err) {
    useAccountStore.setState({
      isFetchingHistory: false,
      error: err instanceof Error ? err.message : 'Failed to fetch history',
    });
  }
}

/**
 * Fetch more history (pagination).
 */
export async function fetchMoreHistory(): Promise<void> {
  const { historyOffset } = useAccountStore.getState();
  await fetchHistory(historyOffset + 15);
}

/**
 * Fetch current holds.
 */
export async function fetchHolds(): Promise<void> {
  useAccountStore.setState({ isFetchingHolds: true, error: null });

  try {
    const data = await accountApi.getHolds();
    useAccountStore.setState({
      holds: data.items,
      isFetchingHolds: false,
    });
  } catch (err) {
    useAccountStore.setState({
      isFetchingHolds: false,
      error: err instanceof Error ? err.message : 'Failed to fetch holds',
    });
  }
}

/**
 * Clear all account data (e.g., on logout).
 */
export function clearAccountData(): void {
  useAccountStore.setState({
    checkouts: [],
    history: [],
    holds: [],
    historyOffset: 0,
    hasMoreHistory: false,
    error: null,
  });
}

/**
 * Clear error state.
 */
export function clearError(): void {
  useAccountStore.setState({ error: null });
}
