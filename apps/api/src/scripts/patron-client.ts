/**
 * NC Cardinal Patron Client
 *
 * Provides authenticated access to patron account data via cookie-based sessions.
 * This is necessary because NC Cardinal's OpenSRF gateway lacks patron permissions
 * for circulation queries - the web OPAC uses server-side rendering with staff connections.
 *
 * Features:
 * - Cookie-based session authentication
 * - Current checkouts parsing
 * - Checkout history parsing (requires user opt-in in account settings)
 * - Session management and refresh
 */

import * as cheerio from 'cheerio';

const BASE_URL =
  process.env.NC_CARDINAL_BASE_URL ?? 'https://nccardinal.org';

// ============================================================================
// Types
// ============================================================================

export interface PatronSession {
  sessionToken: string;
  loggedIn: boolean;
  userId?: string | undefined;
  barcode?: string | undefined;
  displayName?: string | undefined;
  expiresAt?: number | undefined; // Unix timestamp
}

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

export interface PatronCheckouts {
  items: CheckedOutItem[];
  totalCount: number;
}

export interface PatronHistory {
  items: HistoryItem[];
  totalCount: number;
  hasMore: boolean;
  offset: number;
  limit: number;
  historyEnabled: boolean;
}

export interface LoginResult {
  success: boolean;
  session?: PatronSession | undefined;
  error?: string | undefined;
}

// ============================================================================
// Session Store (in-memory for now, could be upgraded to Redis)
// ============================================================================

const sessionStore = new Map<string, PatronSession>();

/**
 * Generate a session ID for our API to track patron sessions
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Store a session
 */
function storeSession(sessionId: string, session: PatronSession): void {
  sessionStore.set(sessionId, session);
}

/**
 * Get a session
 */
export function getSession(sessionId: string): PatronSession | null {
  return sessionStore.get(sessionId) ?? null;
}

/**
 * Delete a session
 */
function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

// ============================================================================
// Cookie Management
// ============================================================================

interface CookieJar {
  cookies: Map<string, string>;
}

function createCookieJar(): CookieJar {
  return { cookies: new Map() };
}

function parseCookiesFromHeaders(headers: Headers, jar: CookieJar): void {
  const setCookies = headers.getSetCookie();
  for (const cookie of setCookies) {
    const [nameValue] = cookie.split(';');
    const [name, value] = nameValue?.split('=') ?? [];
    if (name != null && name !== '' && value != null && value !== '') {
      jar.cookies.set(name.trim(), value.trim());
    }
  }
}

function _getCookieHeader(jar: CookieJar): string {
  return Array.from(jar.cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Fetch the user's display name from the account page
 */
async function fetchDisplayName(sessionToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/eg/opac/myopac/main`, {
      headers: {
        Cookie: `ses=${sessionToken}; eg_loggedin=1`,
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // The user's name is typically in the account header or welcome message
    // Look for patterns like "Welcome, John Doe" or the name in the account nav
    
    // Try to find the name in the patron summary section
    const patronName = $('#patron_name').text().trim();
    if (patronName !== '') return patronName;

    // Try the welcome text pattern
    const welcomeText = $('*:contains("Welcome,")').last().text();
    const welcomeMatch = welcomeText.match(/Welcome,?\s+([^!.\n]+)/i);
    if (welcomeMatch?.[1] != null) return welcomeMatch[1].trim();

    // Try the account header
    const headerName = $('.patron-name, .account-name, #acct_name').first().text().trim();
    if (headerName !== '') return headerName;

    // Try looking in dash_user or patron info sections
    const dashUser = $('#dash_user').text().trim();
    if (dashUser !== '') return dashUser;

    return null;
  } catch {
    return null;
  }
}

/**
 * Login to NC Cardinal OPAC
 */
export async function login(
  cardNumber: string,
  pin: string
): Promise<LoginResult> {
  const jar = createCookieJar();

  try {
    // Step 1: POST to login endpoint
    const loginUrl = `${BASE_URL}/eg/opac/login`;
    const formData = new URLSearchParams({
      username: cardNumber,
      password: pin,
      redirect_to: '/eg/opac/myopac/main',
    });

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects automatically
    });

    // Parse cookies from response
    parseCookiesFromHeaders(response.headers, jar);

    // Check for session cookie
    const sessionToken = jar.cookies.get('ses');
    const loggedIn = jar.cookies.get('eg_loggedin') === '1';

    if (sessionToken == null || loggedIn !== true) {
      // Try to detect error message from response
      const text = await response.text();
      if (text.includes('Login failed') || text.includes('Invalid')) {
        return {
          success: false,
          error: 'Invalid card number or PIN',
        };
      }
      return {
        success: false,
        error: 'Login failed - no session token received',
      };
    }

    // Create our session
    const sessionId = generateSessionId();
    const session: PatronSession = {
      sessionToken,
      loggedIn: true,
      barcode: cardNumber,
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes (conservative estimate)
    };

    storeSession(sessionId, session);

    // Fetch user's display name from account page
    try {
      const displayName = await fetchDisplayName(sessionToken);
      if (displayName != null) {
        session.displayName = displayName;
        storeSession(sessionId, session);
      }
    } catch {
      // Non-critical - continue without display name
      console.warn('[Patron Client] Failed to fetch display name');
    }

    return {
      success: true,
      session: { ...session, sessionToken: sessionId }, // Return our session ID, not the raw token
    };
  } catch (error) {
    console.error('[Patron Client] Login error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/**
 * Logout and clear session
 */
export async function logout(sessionId: string): Promise<boolean> {
  const session = getSession(sessionId);
  if (!session) {
    return false;
  }

  try {
    // Call the OPAC logout endpoint
    const logoutUrl = `${BASE_URL}/eg/opac/logout`;
    await fetch(logoutUrl, {
      headers: {
        Cookie: `ses=${session.sessionToken}; eg_loggedin=1`,
      },
    });
  } catch {
    // Ignore errors - we'll delete the session anyway
  }

  deleteSession(sessionId);
  return true;
}

/**
 * Check if a session is still valid
 */
export function isSessionValid(sessionId: string): boolean {
  const session = getSession(sessionId);
  if (session == null) return false;
  if (session.loggedIn !== true) return false;
  if (session.expiresAt != null && Date.now() > session.expiresAt) return false;
  return true;
}

// ============================================================================
// Fetch with Session
// ============================================================================

async function fetchWithSession(
  sessionId: string,
  url: string
): Promise<{ ok: boolean; text: string; status: number }> {
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, text: 'Session not found', status: 401 };
  }

  const response = await fetch(url, {
    headers: {
      Cookie: `ses=${session.sessionToken}; eg_loggedin=1`,
    },
  });

  const text = await response.text();

  // Check if we were redirected to login page
  if (text.includes('Account Login') && text.includes('username')) {
    // Session expired
    deleteSession(sessionId);
    return { ok: false, text: 'Session expired', status: 401 };
  }

  return { ok: response.ok, text, status: response.status };
}

// ============================================================================
// Current Checkouts
// ============================================================================

/**
 * Get currently checked out items for a patron
 */
export async function getCheckouts(sessionId: string): Promise<PatronCheckouts> {
  const url = `${BASE_URL}/eg/opac/myopac/circs`;
  const result = await fetchWithSession(sessionId, url);

  if (!result.ok) {
    throw new Error(`Failed to fetch checkouts: ${result.text}`);
  }

  return parseCheckoutsPage(result.text);
}

/**
 * Parse the checkouts HTML page
 */
function parseCheckoutsPage(html: string): PatronCheckouts {
  const $ = cheerio.load(html);
  const items: CheckedOutItem[] = [];

  // Find the checkouts table rows
  // The page has a table with class 'table_no_border_space'
  $('table.table_no_border_space tbody tr').each((_, row) => {
    const $row = $(row);

    // Skip header rows
    if ($row.find('th').length > 0) return;

    // Extract record link and ID
    const recordLink = $row.find('a[href*="/eg/opac/record/"]').first();
    const recordHref = recordLink.attr('href') ?? '';
    const recordMatch = recordHref.match(/\/eg\/opac\/record\/(\d+)/);
    const recordId = recordMatch?.[1] ?? '';

    if (recordId === '') return;

    // Extract title - it's in the record link
    const title = recordLink.text().trim();

    // Extract author - typically in a separate link with author query
    const authorLink = $row.find('a[href*="qtype=author"]').first();
    const authorText = authorLink.text().trim();
    const author = authorText !== '' ? authorText : undefined;

    // Extract due date - look for date pattern
    let dueDate = '';
    let overdue = false;
    $row.find('td').each((_, td) => {
      const text = $(td).text().trim();
      // Match date patterns like "01/15/2026" or "January 15, 2026"
      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch != null && dateMatch[1] != null) {
        dueDate = dateMatch[1];
        // Check if overdue
        overdue = $(td).hasClass('overdue') || text.toLowerCase().includes('overdue');
      }
    });

    // Extract barcode - usually a numeric string
    let barcode = '';
    $row.find('td').each((_, td) => {
      const text = $(td).text().trim();
      // Barcodes are typically long numeric strings
      if (/^\d{10,14}$/.test(text)) {
        barcode = text;
      }
    });

    // Extract call number
    let callNumber: string | undefined;
    $row.find('td').each((_, td) => {
      const text = $(td).text().trim();
      // Call numbers often contain letters and numbers like "FIC Braun" or "GN/YA/Demon"
      if (text.match(/^[A-Z]{2,}[\s/]/) != null || text.match(/^[\d.]+\s+[A-Z]/) != null) {
        callNumber = text;
      }
    });

    items.push({
      recordId,
      title,
      author,
      dueDate,
      barcode,
      callNumber,
      overdue,
      catalogUrl: `${BASE_URL}/eg/opac/record/${recordId}`,
    });
  });

  // Get total count from the dashboard if available
  let totalCount = items.length;
  const dashText = $('#dash_checked').text().trim();
  if (dashText !== '') {
    const dashCount = parseInt(dashText, 10);
    if (!Number.isNaN(dashCount)) {
      totalCount = dashCount;
    }
  }

  return { items, totalCount };
}

// ============================================================================
// Checkout History
// ============================================================================

/**
 * Get checkout history for a patron
 */
export async function getHistory(
  sessionId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PatronHistory> {
  const { limit = 15, offset = 0 } = options;
  const url = `${BASE_URL}/eg/opac/myopac/circ_history?limit=${limit}&offset=${offset}`;
  const result = await fetchWithSession(sessionId, url);

  if (!result.ok) {
    throw new Error(`Failed to fetch history: ${result.text}`);
  }

  return parseHistoryPage(result.text, limit, offset);
}

/**
 * Parse the checkout history HTML page
 */
function parseHistoryPage(
  html: string,
  limit: number,
  offset: number
): PatronHistory {
  const $ = cheerio.load(html);
  const items: HistoryItem[] = [];

  // Check if history is enabled - look for the warning message
  const warningBox = $('.warning_box').text();
  const historyEnabled = !warningBox.includes('no items in your circulation history');

  if (!historyEnabled) {
    return {
      items: [],
      totalCount: 0,
      hasMore: false,
      offset,
      limit,
      historyEnabled: false,
    };
  }

  // Parse history table
  $('table.table_no_border_space tbody tr').each((_, row) => {
    const $row = $(row);

    // Skip header rows
    if ($row.find('th').length > 0) return;

    // Extract record link and ID
    const recordLink = $row.find('a[href*="/eg/opac/record/"]').first();
    const recordHref = recordLink.attr('href') ?? '';
    const recordMatch = recordHref.match(/\/eg\/opac\/record\/(\d+)/);
    const recordId = recordMatch?.[1] ?? '';

    if (recordId === '') return;

    // Extract title
    const title = recordLink.text().trim();

    // Extract author
    const authorLink = $row.find('a[href*="qtype=author"]').first();
    const histAuthorText = authorLink.text().trim();
    const author = histAuthorText !== '' ? histAuthorText : undefined;

    // Extract dates from cells
    const tds = $row.find('td');
    let checkoutDate = '';
    let dueDate = '';
    let returnDate: string | undefined;

    tds.each((_i, td) => {
      const text = $(td).text().trim();
      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch != null && dateMatch[1] != null) {
        // Dates are typically in order: checkout, due, return
        if (checkoutDate === '') {
          checkoutDate = dateMatch[1];
        } else if (dueDate === '') {
          dueDate = dateMatch[1];
        } else if (returnDate == null) {
          returnDate = dateMatch[1];
        }
      }
    });

    // Extract barcode
    let barcode: string | undefined;
    tds.each((_, td) => {
      const text = $(td).text().trim();
      if (/^\d{10,14}$/.test(text)) {
        barcode = text;
      }
    });

    // Extract call number
    let callNumber: string | undefined;
    tds.each((_, td) => {
      const text = $(td).text().trim();
      if (text.match(/^[A-Z]{2,}[\s/]/) != null || text.match(/^[\d.]+\s+[A-Z]/) != null) {
        callNumber = text;
      }
    });

    items.push({
      recordId,
      title,
      author,
      checkoutDate,
      dueDate,
      returnDate,
      barcode,
      callNumber,
      catalogUrl: `${BASE_URL}/eg/opac/record/${recordId}`,
    });
  });

  // Check for pagination - look for next page link
  const hasMore = $('a[href*="circ_history?"]')
    .filter((_, el) => $(el).text().includes('Next') || ($(el).attr('href')?.includes(`offset=${offset + limit}`) === true))
    .length > 0;

  return {
    items,
    totalCount: items.length + (hasMore ? 1 : 0), // Approximate - we don't have exact count
    hasMore,
    offset,
    limit,
    historyEnabled: true,
  };
}

// ============================================================================
// Check History Settings
// ============================================================================

/**
 * Check if checkout history tracking is enabled for the patron
 */
export async function isHistoryEnabled(sessionId: string): Promise<boolean> {
  const url = `${BASE_URL}/eg/opac/myopac/prefs_settings`;
  const result = await fetchWithSession(sessionId, url);

  if (!result.ok) {
    throw new Error(`Failed to fetch settings: ${result.text}`);
  }

  const $ = cheerio.load(result.text);
  const checkbox = $('input#history\\.circ\\.retention_start');
  
  // Check if the checkbox has a 'checked' attribute
  const checkedAttr = checkbox.attr('checked');
  const checkedProp = checkbox.prop('checked');
  // Cheerio's .prop() returns string | undefined for attributes like 'checked'
  return checkedAttr !== undefined || checkedProp === 'checked' || checkedProp === '';
}

// ============================================================================
// Holds (future implementation)
// ============================================================================

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

/**
 * Get current holds for a patron
 */
export async function getHolds(sessionId: string): Promise<{
  items: HoldItem[];
  totalCount: number;
}> {
  const url = `${BASE_URL}/eg/opac/myopac/holds`;
  const result = await fetchWithSession(sessionId, url);

  if (!result.ok) {
    throw new Error(`Failed to fetch holds: ${result.text}`);
  }

  return parseHoldsPage(result.text);
}

/**
 * Parse the holds HTML page
 */
function parseHoldsPage(html: string): { items: HoldItem[]; totalCount: number } {
  const $ = cheerio.load(html);
  const items: HoldItem[] = [];

  $('table.table_no_border_space tbody tr').each((_, row) => {
    const $row = $(row);
    if ($row.find('th').length > 0) return;

    const recordLink = $row.find('a[href*="/eg/opac/record/"]').first();
    const recordHref = recordLink.attr('href') ?? '';
    const recordMatch = recordHref.match(/\/eg\/opac\/record\/(\d+)/);
    const recordId = recordMatch?.[1] ?? '';

    if (recordId === '') return;

    const title = recordLink.text().trim();
    const authorLink = $row.find('a[href*="qtype=author"]').first();
    const holdAuthorText = authorLink.text().trim();
    const author = holdAuthorText !== '' ? holdAuthorText : undefined;

    // Extract status and other details
    let status = '';
    let holdDate = '';
    let position: number | undefined;
    let pickupLibrary: string | undefined;

    $row.find('td').each((_, td) => {
      const text = $(td).text().trim();
      
      // Hold date
      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch != null && dateMatch[1] != null && holdDate === '') {
        holdDate = dateMatch[1];
      }

      // Position in queue
      const posMatch = text.match(/Position:\s*(\d+)/i);
      if (posMatch != null && posMatch[1] != null) {
        position = parseInt(posMatch[1], 10);
      }

      // Status (e.g., "Waiting", "Ready for Pickup", "In Transit")
      if (text.match(/^(Waiting|Ready|In Transit|Suspended)/i) != null) {
        status = text;
      }
    });

    items.push({
      recordId,
      title,
      author,
      holdDate,
      status,
      position,
      pickupLibrary,
      catalogUrl: `${BASE_URL}/eg/opac/record/${recordId}`,
    });
  });

  let totalCount = items.length;
  const dashText = $('#dash_holds').text().trim();
  if (dashText !== '') {
    const dashCount = parseInt(dashText, 10);
    if (!Number.isNaN(dashCount)) {
      totalCount = dashCount;
    }
  }

  return { items, totalCount };
}

// ============================================================================
// Enrich with ISBNs
// ============================================================================

/**
 * Enrich checkout items with ISBN data by fetching record details
 * This is useful for matching checkouts to manga volumes
 */
export async function enrichCheckoutsWithISBNs(
  sessionId: string,
  items: CheckedOutItem[]
): Promise<Array<CheckedOutItem & { isbns: string[] }>> {
  const enriched: Array<CheckedOutItem & { isbns: string[] }> = [];

  for (const item of items) {
    try {
      // Fetch the record page to get ISBNs
      const recordUrl = `${BASE_URL}/eg/opac/record/${item.recordId}`;
      const result = await fetchWithSession(sessionId, recordUrl);

      if (!result.ok) {
        enriched.push({ ...item, isbns: [] });
        continue;
      }

      const $ = cheerio.load(result.text);
      const isbns: string[] = [];

      // Look for ISBNs in the record details
      $('td').each((_, td) => {
        const text = $(td).text();
        // Match ISBN-10 or ISBN-13 patterns
        const isbnMatches = text.match(/(?:ISBN[:\s]*)?(\d{10}|\d{13})/gi);
        if (isbnMatches != null) {
          for (const match of isbnMatches) {
            const isbn = match.replace(/ISBN[:\s]*/i, '').trim();
            if (isbn !== '' && !isbns.includes(isbn)) {
              isbns.push(isbn);
            }
          }
        }
      });

      enriched.push({ ...item, isbns });

      // Small delay to be nice to the server
      await new Promise(r => setTimeout(r, 100));
    } catch {
      enriched.push({ ...item, isbns: [] });
    }
  }

  return enriched;
}
