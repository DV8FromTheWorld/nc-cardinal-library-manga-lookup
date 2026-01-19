/**
 * Account API client for patron data (checkouts, history, holds).
 * Uses the auth store to get the session ID for authenticated requests.
 */

import { env } from '../../../config/env';
import { useAuthStore } from '../../authentication/store';
import type {
  CheckoutsResponse,
  HistoryResponse,
  HoldsResponse,
  HistorySettings,
} from '../types';

export class AccountApiError extends Error {
  constructor(
    public status: number,
    public apiError: { error: string; message?: string | undefined }
  ) {
    super(apiError.message ?? apiError.error);
    this.name = 'AccountApiError';
  }
}

/**
 * Get the current session ID from the auth store.
 * Throws if not authenticated.
 */
function getSessionId(): string {
  const session = useAuthStore.getState().session;
  if (!session) {
    throw new AccountApiError(401, { error: 'unauthenticated', message: 'Not logged in' });
  }
  return session.sessionId;
}

async function fetchAccountApi<T>(
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const sessionId = getSessionId();
  const { method = 'GET', params } = options;

  let url = `${env.apiUrl}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url = `${url}?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId,
    },
  });

  const data = await response.json() as T | { error: string; message?: string | undefined };

  if (!response.ok) {
    throw new AccountApiError(response.status, data as { error: string; message?: string | undefined });
  }

  return data as T;
}

/**
 * Get currently checked out items
 */
export async function getCheckouts(): Promise<CheckoutsResponse> {
  return fetchAccountApi<CheckoutsResponse>('/manga/user/checkouts');
}

/**
 * Get checkout history
 */
export async function getHistory(
  options: { limit?: number; offset?: number } = {}
): Promise<HistoryResponse> {
  const params: Record<string, string> = {};
  if (options.limit != null) params.limit = options.limit.toString();
  if (options.offset != null) params.offset = options.offset.toString();

  return fetchAccountApi<HistoryResponse>('/manga/user/history', { params });
}

/**
 * Get current holds
 */
export async function getHolds(): Promise<HoldsResponse> {
  return fetchAccountApi<HoldsResponse>('/manga/user/holds');
}

/**
 * Check if checkout history tracking is enabled
 */
export async function getHistorySettings(): Promise<HistorySettings> {
  return fetchAccountApi<HistorySettings>('/manga/user/settings/history');
}
