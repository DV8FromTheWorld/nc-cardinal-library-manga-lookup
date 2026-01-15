/**
 * Types for the authentication module.
 */

export interface UserSession {
  sessionId: string;
  cardNumber?: string | undefined;
  displayName?: string | undefined;
  loggedInAt: number;
}

export interface LoginResult {
  success: boolean;
  error?: string | undefined;
}
