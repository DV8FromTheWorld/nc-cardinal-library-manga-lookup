/**
 * Types for the account-detail module.
 */

export interface CheckedOutItem {
  recordId: string;
  title: string;
  author?: string | undefined;
  dueDate: string;
  barcode: string;
  callNumber?: string | undefined;
  renewals?: number | undefined;
  renewalsRemaining?: number | undefined;
  overdue: boolean;
  catalogUrl: string;
}

export interface HistoryItem {
  recordId: string;
  title: string;
  author?: string | undefined;
  checkoutDate: string;
  dueDate: string;
  returnDate?: string | undefined;
  barcode?: string | undefined;
  callNumber?: string | undefined;
  catalogUrl: string;
}

export interface HoldItem {
  recordId: string;
  title: string;
  author?: string | undefined;
  holdDate: string;
  status: string;
  position?: number | undefined;
  pickupLibrary?: string | undefined;
  expiresAt?: string | undefined;
  catalogUrl: string;
}

export interface CheckoutsResponse {
  items: CheckedOutItem[];
  totalCount: number;
}

export interface HistoryResponse {
  items: HistoryItem[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  historyEnabled: boolean;
}

export interface HoldsResponse {
  items: HoldItem[];
  totalCount: number;
}

export interface HistorySettings {
  historyEnabled: boolean;
}
