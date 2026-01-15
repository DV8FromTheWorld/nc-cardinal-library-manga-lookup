/**
 * Authentication API client for login/logout/session operations.
 */

import { env } from '../../../config/env';

// ============================================================================
// Types
// ============================================================================

export interface LoginResponse {
  success: boolean;
  sessionId?: string | undefined;
  displayName?: string | undefined;
  error?: string | undefined;
}

export interface SessionStatus {
  valid: boolean;
  sessionId?: string | undefined;
  displayName?: string | undefined;
}

export class AuthApiError extends Error {
  constructor(
    public status: number,
    public apiError: { error: string; message?: string | undefined }
  ) {
    super(apiError.message ?? apiError.error);
    this.name = 'AuthApiError';
  }
}

// ============================================================================
// API Client
// ============================================================================

async function fetchAuthApi<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    sessionId?: string | undefined;
  } = {}
): Promise<T> {
  const url = `${env.apiUrl}${endpoint}`;
  const { method = 'GET', body, sessionId } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (sessionId) {
    headers['X-Session-Id'] = sessionId;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  const data = await response.json();

  if (!response.ok) {
    throw new AuthApiError(response.status, data);
  }

  return data as T;
}

/**
 * Login to NC Cardinal
 */
export async function login(
  cardNumber: string,
  pin: string
): Promise<LoginResponse> {
  return fetchAuthApi<LoginResponse>('/manga/user/login', {
    method: 'POST',
    body: { cardNumber, pin },
  });
}

/**
 * Logout and invalidate session
 */
export async function logout(sessionId: string): Promise<{ success: boolean }> {
  return fetchAuthApi<{ success: boolean }>('/manga/user/logout', {
    method: 'POST',
    sessionId,
  });
}

/**
 * Check if session is still valid
 */
export async function checkSession(sessionId: string): Promise<SessionStatus> {
  return fetchAuthApi<SessionStatus>('/manga/user/session', {
    sessionId,
  });
}
