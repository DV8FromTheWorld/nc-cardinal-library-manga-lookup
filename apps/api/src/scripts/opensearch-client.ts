/**
 * NC Cardinal OpenSearch API Client
 *
 * Uses the Evergreen ILS OpenSearch API for catalog searches.
 * This is a proper machine-readable API - no HTML scraping needed!
 *
 * Endpoint: /opac/extras/opensearch/1.1/{org}/{format}/{searchClass}/
 *
 * Formats available:
 * - atom-full: Atom feed with full holdings data (recommended)
 * - rss2-full: RSS feed with full holdings
 * - marcxml: MARC21 XML records
 * - mods/mods3: MODS format
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL =
  process.env.NC_CARDINAL_BASE_URL || 'https://highpoint.nccardinal.org';

// ============================================================================
// Two-Tier Caching:
// 1. ISBN -> RecordID mapping (long-lived, never changes)
// 2. RecordID -> Full CatalogRecord (short-lived, availability changes)
// ============================================================================

const CACHE_DIR = path.join(process.cwd(), '.cache', 'nc-cardinal');
const ISBN_MAP_DIR = path.join(CACHE_DIR, 'isbn-map');     // ISBN -> RecordID (permanent)
const RECORD_CACHE_DIR = path.join(CACHE_DIR, 'records');  // RecordID -> Full record (1 hour)
const SEARCH_CACHE_DIR = path.join(CACHE_DIR, 'searches'); // Search query -> Results (1 hour)

const RECORD_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (availability changes frequently)
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Ensure cache directories exist
for (const dir of [ISBN_MAP_DIR, RECORD_CACHE_DIR, SEARCH_CACHE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- ISBN -> RecordID mapping (permanent cache) ---

function readISBNToRecordId(isbn: string): string | null {
  const clean = isbn.replace(/[-\s]/g, '');
  const cachePath = path.join(ISBN_MAP_DIR, `${clean}.txt`);
  
  try {
    if (!fs.existsSync(cachePath)) return null;
    return fs.readFileSync(cachePath, 'utf-8').trim();
  } catch {
    return null;
  }
}

function writeISBNToRecordId(isbn: string, recordId: string): void {
  const clean = isbn.replace(/[-\s]/g, '');
  const cachePath = path.join(ISBN_MAP_DIR, `${clean}.txt`);
  fs.writeFileSync(cachePath, recordId);
}

// --- RecordID -> Full CatalogRecord (TTL cache) ---

function readRecordCache(recordId: string): CatalogRecord | null | 'miss' {
  const cachePath = path.join(RECORD_CACHE_DIR, `${recordId}.json`);
  
  try {
    if (!fs.existsSync(cachePath)) return 'miss';
    
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs > RECORD_CACHE_TTL_MS) {
      // Expired - delete and return miss
      fs.unlinkSync(cachePath);
      return 'miss';
    }
    
    const data = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as CatalogRecord;
  } catch {
    return 'miss';
  }
}

function writeRecordCache(record: CatalogRecord): void {
  const cachePath = path.join(RECORD_CACHE_DIR, `${record.id}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(record, null, 2));
}

// --- Search query -> Results (TTL cache) ---

function getSearchCacheKey(query: string, searchClass: string, count: number): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80);
  return `${searchClass}_${sanitized}_${count}.json`;
}

function readSearchCache(cacheKey: string): OpenSearchResult | null {
  const cachePath = path.join(SEARCH_CACHE_DIR, cacheKey);
  
  try {
    if (!fs.existsSync(cachePath)) return null;
    
    const stat = fs.statSync(cachePath);
    if (Date.now() - stat.mtimeMs > SEARCH_CACHE_TTL_MS) {
      // Expired - delete and return null
      fs.unlinkSync(cachePath);
      return null;
    }
    
    const data = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as OpenSearchResult;
  } catch {
    return null;
  }
}

function writeSearchCache(cacheKey: string, result: OpenSearchResult): void {
  const cachePath = path.join(SEARCH_CACHE_DIR, cacheKey);
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
}

// --- Direct fetch by record ID using SuperCat (faster than search) ---

async function fetchRecordById(recordId: string): Promise<CatalogRecord | null> {
  const url = `${BASE_URL}/opac/extras/supercat/retrieve/atom-full/record/${recordId}`;
  console.log(`[NC Cardinal] SuperCat fetch: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`SuperCat request failed: ${response.status}`);
      return null;
    }
    
    const xml = await response.text();
    const result = parseAtomFullResponse(xml);
    return result.records[0] ?? null;
  } catch (error) {
    console.warn(`Failed to fetch record ${recordId}:`, error);
    return null;
  }
}

// Organization codes
export const ORG_CODES = {
  CARDINAL: 'CARDINAL', // All NC Cardinal libraries (org ID 1)
  HIGH_POINT: 'HIGH_POINT_MAIN', // High Point Library shortname
} as const;

// NC Cardinal library list (for home library selection)
// This is a curated list of major libraries - the full system has 200+ branches
export const NC_CARDINAL_LIBRARIES = [
  { code: 'HIGH_POINT_MAIN', name: 'High Point Library' },
  { code: 'FORSYTH_CENTRAL', name: 'Forsyth Central' },
  { code: 'PACK', name: 'Pack Memorial Library (Asheville)' },
  { code: 'CUMBERLAND_HQ', name: 'Cumberland Headquarters (Fayetteville)' },
  { code: 'BRASWELL_MAIN', name: 'Braswell Memorial Main Library (Rocky Mount)' },
  { code: 'CLEVELAND_MAIN', name: 'Cleveland County Main Library' },
  { code: 'GOLDSBORO', name: 'Goldsboro Library' },
  { code: 'KINSTON', name: 'Kinston-Lenoir County Public Library' },
  { code: 'LEE_MAIN', name: 'Lee County Main Library (Sanford)' },
  { code: 'MOORE', name: 'Moore County Library' },
  { code: 'PERSON_MAIN', name: 'Person County Library' },
  { code: 'ROBESON_MAIN', name: 'Robeson County Public Library' },
  { code: 'STATESVILLE', name: 'Statesville Main Library' },
  { code: 'THORNTON', name: 'Richard H. Thornton Main Library (Oxford)' },
  { code: 'WILKES', name: 'Wilkes County Public Library' },
  { code: 'ALEXANDER_MAIN', name: 'Alexander Main Library' },
  { code: 'ALLEGHANY', name: 'Alleghany Public Library' },
  { code: 'HAYWOOD_MAIN', name: 'Haywood County Main Library' },
  { code: 'HENDERSON_MAIN', name: 'Henderson Main Branch' },
  { code: 'HOKE', name: 'Hoke County Public Library' },
  { code: 'MONTGOMERY', name: 'Montgomery County Public Library' },
  { code: 'MT_AIRY', name: 'Mt. Airy Public Library' },
  { code: 'RUTHERFORD_MAIN', name: 'Rutherford County Library' },
  { code: 'WARREN_MAIN', name: 'Warren County Memorial Library' },
] as const;

export type LibraryCode = typeof NC_CARDINAL_LIBRARIES[number]['code'];

// Generate catalog URL for a record
export function getCatalogUrl(recordId: string): string {
  return `https://nccardinal.org/eg/opac/record/${recordId}`;
}

export type OpenSearchFormat = 'atom-full' | 'rss2-full' | 'marcxml' | 'mods' | 'mods3';
export type SearchClass = 'keyword' | 'title' | 'author' | 'subject' | 'series';

export interface OpenSearchResult {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  records: CatalogRecord[];
  nextPageUrl?: string | undefined;
}

export interface CatalogRecord {
  id: string;
  title: string;
  authors: string[];
  isbns: string[];
  subjects: string[];
  holdings: HoldingInfo[];
  summary?: string | undefined;
  updatedDate?: string | undefined;
  // Volume/series info (populated from MARC record)
  volumeNumber?: string | undefined;
  volumeTitle?: string | undefined;
  seriesName?: string | undefined;
}

/**
 * Categorized copy status for clearer availability display
 */
export type CopyStatusCategory = 
  | 'available'      // On shelf, ready to borrow
  | 'checked_out'    // Borrowed by someone
  | 'in_transit'     // Moving between libraries
  | 'on_order'       // Ordered but not yet received
  | 'on_hold'        // Reserved/held for someone
  | 'unavailable';   // Lost, missing, repair, withdrawn, etc.

/**
 * Categorize a raw status string into a simplified category
 */
export function categorizeStatus(status: string): CopyStatusCategory {
  const lower = status.toLowerCase().trim();
  
  // Available
  if (lower === 'available' || lower === 'reshelving') {
    return 'available';
  }
  
  // Checked out
  if (lower === 'checked out' || lower.includes('checked out') || lower === 'overdue') {
    return 'checked_out';
  }
  
  // In transit
  if (lower === 'in transit' || lower.includes('transit') || lower === 'in process') {
    return 'in_transit';
  }
  
  // On order
  if (lower === 'on order' || lower.includes('order') || lower === 'cataloging' || lower === 'acquisitions') {
    return 'on_order';
  }
  
  // On hold
  if (lower === 'on holds shelf' || lower.includes('hold')) {
    return 'on_hold';
  }
  
  // Everything else is unavailable (lost, missing, repair, withdrawn, discard, etc.)
  return 'unavailable';
}

export interface HoldingInfo {
  libraryCode: string;
  libraryName: string;
  location: string;
  callNumber: string;
  status: string;
  statusCategory: CopyStatusCategory;
  barcode?: string | undefined;
  available: boolean;
}

/**
 * Search the NC Cardinal catalog using OpenSearch API
 */
export async function searchCatalog(
  query: string,
  options: {
    searchClass?: SearchClass;
    format?: OpenSearchFormat;
    org?: string;
    count?: number;
    startIndex?: number;
    skipCache?: boolean;
  } = {}
): Promise<OpenSearchResult> {
  const {
    searchClass = 'keyword',
    format = 'atom-full',
    org = ORG_CODES.CARDINAL,
    count = 20,
    startIndex = 1,
    skipCache = false,
  } = options;

  // Check cache first (only for first page requests)
  const cacheKey = getSearchCacheKey(query, searchClass, count);
  if (!skipCache && startIndex === 1) {
    const cached = readSearchCache(cacheKey);
    if (cached) {
      console.log(`[NC Cardinal] Search cache hit for: "${query}" (${searchClass})`);
      return cached;
    }
  }

  const params = new URLSearchParams({
    searchTerms: query,
    count: count.toString(),
    startIndex: startIndex.toString(),
  });

  const url = `${BASE_URL}/opac/extras/opensearch/1.1/${org}/${format}/${searchClass}/?${params}`;
  console.log(`[NC Cardinal] OpenSearch: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenSearch request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const result = parseAtomFullResponse(xml);
  
  // Cache the result (only for first page requests)
  if (startIndex === 1) {
    writeSearchCache(cacheKey, result);
  }
  
  return result;
}

/**
 * Search by ISBN (with two-tier caching)
 * 
 * Cache strategy:
 * 1. ISBN -> RecordID mapping (permanent, never changes)
 * 2. RecordID -> Full record (1 hour TTL, availability changes)
 * 
 * When record cache expires, we use SuperCat direct lookup by recordId
 * which is faster than re-searching by ISBN.
 */
export async function searchByISBN(
  isbn: string,
  org: string = ORG_CODES.CARDINAL
): Promise<CatalogRecord | null> {
  // Clean ISBN
  const cleanISBN = isbn.replace(/[-\s]/g, '');

  // Tier 1: Check if we have a cached ISBN -> RecordID mapping
  const cachedRecordId = readISBNToRecordId(cleanISBN);
  
  if (cachedRecordId) {
    // Tier 2: Check if we have a fresh record cache
    const cachedRecord = readRecordCache(cachedRecordId);
    
    if (cachedRecord !== 'miss' && cachedRecord !== null) {
      console.log(`[NC Cardinal] Full cache hit for ISBN: ${cleanISBN} -> record ${cachedRecordId}`);
      return cachedRecord;
    }
    
    // Record cache expired/missing, but we have the recordId - use SuperCat direct fetch
    console.log(`[NC Cardinal] Using cached recordId ${cachedRecordId} for ISBN: ${cleanISBN}`);
    const record = await fetchRecordById(cachedRecordId);
    
    if (record) {
      writeRecordCache(record);
      return record;
    }
    // If direct fetch failed, fall through to full search
  }

  // No cached mapping - do full OpenSearch
  console.log(`[NC Cardinal] Full search for ISBN: ${cleanISBN}`);
  const results = await searchCatalog(cleanISBN, {
    searchClass: 'keyword',
    org,
    count: 5,
  });

  // Find the record that matches the ISBN
  const match = results.records.find((r) =>
    r.isbns.some((i) => i.replace(/[-\s]/g, '') === cleanISBN)
  );

  const result = match ?? results.records[0] ?? null;
  
  // Cache both tiers
  if (result) {
    writeISBNToRecordId(cleanISBN, result.id);
    writeRecordCache(result);
  }
  
  return result;
}

/**
 * Batch ISBN lookup - search for multiple ISBNs in PARALLEL
 * Returns a map of ISBN to CatalogRecord (or null if not found)
 * 
 * Uses parallel batches to avoid 23 * 5s = 115s sequential nightmare
 */
export async function searchByISBNs(
  isbns: string[],
  options: { org?: string; concurrency?: number } = {}
): Promise<Map<string, CatalogRecord | null>> {
  const { org = ORG_CODES.CARDINAL, concurrency = 10 } = options;
  
  const results = new Map<string, CatalogRecord | null>();
  
  // Clean and dedupe ISBNs
  const cleanISBNs = [...new Set(isbns.map(isbn => isbn.replace(/[-\s]/g, '')))];
  
  // First pass: check what's already cached (instant)
  const uncachedISBNs: string[] = [];
  for (const isbn of cleanISBNs) {
    const cachedRecordId = readISBNToRecordId(isbn);
    if (cachedRecordId) {
      const cachedRecord = readRecordCache(cachedRecordId);
      if (cachedRecord !== 'miss' && cachedRecord !== null) {
        results.set(isbn, cachedRecord);
        continue;
      }
    }
    uncachedISBNs.push(isbn);
  }
  
  if (uncachedISBNs.length === 0) {
    console.log(`[NC Cardinal] All ${cleanISBNs.length} ISBNs served from cache`);
    return results;
  }
  
  console.log(`[NC Cardinal] ${results.size} cached, ${uncachedISBNs.length} need fetching (parallel, concurrency=${concurrency})`);
  
  // Process in parallel batches
  for (let i = 0; i < uncachedISBNs.length; i += concurrency) {
    const batch = uncachedISBNs.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(uncachedISBNs.length / concurrency);
    
    console.log(`[NC Cardinal] Batch ${batchNum}/${totalBatches}: fetching ${batch.length} ISBNs in parallel...`);
    
    const batchResults = await Promise.all(
      batch.map(async (isbn) => {
        try {
          const record = await searchByISBN(isbn, org);
          return { isbn, record };
        } catch (error) {
          console.warn(`Failed to search for ISBN ${isbn}:`, error);
          return { isbn, record: null };
        }
      })
    );
    
    for (const { isbn, record } of batchResults) {
      results.set(isbn, record);
    }
  }
  
  return results;
}

/**
 * Get availability summary for multiple ISBNs
 * More efficient than individual lookups - returns just availability info
 */
export interface AvailabilitySummary {
  available: boolean;
  notInCatalog?: boolean | undefined;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies: number;
  inTransitCopies: number;
  onOrderCopies: number;
  onHoldCopies: number;
  unavailableCopies: number;
  libraries: string[];
  // Local vs remote breakdown (based on home library)
  localCopies?: number | undefined;
  localAvailable?: number | undefined;
  remoteCopies?: number | undefined;
  remoteAvailable?: number | undefined;
  // Catalog link
  catalogUrl?: string | undefined;
}

export async function getAvailabilityByISBNs(
  isbns: string[],
  options: { org?: string; homeLibrary?: string | undefined } = {}
): Promise<Map<string, AvailabilitySummary>> {
  const { homeLibrary, ...searchOptions } = options;
  const records = await searchByISBNs(isbns, searchOptions);
  
  const availability = new Map<string, AvailabilitySummary>();
  
  for (const [isbn, record] of records) {
    if (!record) {
      availability.set(isbn, {
        available: false,
        notInCatalog: true,
        totalCopies: 0,
        availableCopies: 0,
        checkedOutCopies: 0,
        inTransitCopies: 0,
        onOrderCopies: 0,
        onHoldCopies: 0,
        unavailableCopies: 0,
        libraries: [],
      });
      continue;
    }
    
    const summary = getDetailedAvailabilitySummary(record, homeLibrary);
    availability.set(isbn, summary);
  }
  
  return availability;
}

/**
 * Search by series name
 */
export async function searchBySeries(
  seriesName: string,
  options: { org?: string; count?: number } = {}
): Promise<OpenSearchResult> {
  return searchCatalog(seriesName, {
    searchClass: 'series',
    ...options,
  });
}

/**
 * Search by title
 */
export async function searchByTitle(
  title: string,
  options: { org?: string; count?: number } = {}
): Promise<OpenSearchResult> {
  return searchCatalog(title, {
    searchClass: 'title',
    ...options,
  });
}

/**
 * Search by author
 */
export async function searchByAuthor(
  author: string,
  options: { org?: string; count?: number } = {}
): Promise<OpenSearchResult> {
  return searchCatalog(author, {
    searchClass: 'author',
    ...options,
  });
}

/**
 * Parse Atom-full format response
 */
function parseAtomFullResponse(xml: string): OpenSearchResult {
  const $ = cheerio.load(xml, { xmlMode: true });

  // Parse OpenSearch metadata
  const totalResults = parseInt($('totalResults').text()) || 0;
  const startIndex = parseInt($('startIndex').text()) || 1;
  const itemsPerPage = parseInt($('itemsPerPage').text()) || 0;

  // Find next page link
  const nextLink = $('link[rel="next"]').attr('href');

  // Parse each entry/record - handle both namespaced and non-namespaced selectors
  const records: CatalogRecord[] = [];
  $('atom\\:entry, entry').each((_, entry) => {
    const $entry = $(entry);

    // Extract record ID from the id element (format: urn:tcn:XXXXXXXX)
    const idText = $entry.find('id').text();
    const idMatch = idText.match(/urn:tcn:(\d+)/);
    const id = idMatch?.[1] ?? '';

    if (!id) return;

    // Title
    const title = $entry.find('title').first().text().trim();

    // Authors
    const authors: string[] = [];
    $entry.find('author name').each((_, el) => {
      const authorText = $(el).text().trim();
      // Clean up author text - remove role info and IDs
      const cleanAuthor = authorText.split('(CARDINAL)')[0]?.trim() ?? authorText;
      if (cleanAuthor) {
        authors.push(cleanAuthor);
      }
    });

    // ISBNs from dc:identifier
    const isbns: string[] = [];
    $entry.find('dc\\:identifier, identifier').each((_, el) => {
      const text = $(el).text();
      const isbnMatch = text.match(/URN:ISBN:(.+)/);
      if (isbnMatch?.[1]) {
        isbns.push(isbnMatch[1]);
      }
    });

    // Subjects from category elements
    const subjects: string[] = [];
    $entry.find('category').each((_, el) => {
      const term = $(el).attr('term');
      if (term) {
        subjects.push(term);
      }
    });

    // Summary
    const summary = $entry.find('summary').text().trim() || undefined;

    // Updated date
    const updatedDate = $entry.find('updated').text().trim() || undefined;

    // Parse holdings
    const holdings = parseHoldings($entry, $);

    // Try to extract volume number from call number suffixes
    let volumeNumber: string | undefined;
    $entry.find('suffix').each((_: number, el: unknown) => {
      const $suffix = $(el as string);
      const label = $suffix.text().trim();
      const sortKey = $suffix.attr('label_sortkey') || '';
      
      // Common patterns: V.1, Vol.1, BK.1, #1
      const volMatch = label.match(/^(?:V\.?|Vol\.?|BK\.?)\s*(\d+)/i) ||
                       sortKey.match(/^(?:v|bk)0*(\d+)/i);
      if (volMatch && !volumeNumber) {
        volumeNumber = volMatch[1];
      }
    });

    // Also check call numbers for volume info (e.g., "GN/YA/Demon Slayer #1")
    if (!volumeNumber) {
      for (const h of holdings) {
        const callMatch = h.callNumber.match(/#(\d+)|(?:Vol\.?|V\.?)\s*(\d+)/i);
        if (callMatch) {
          volumeNumber = callMatch[1] || callMatch[2];
          break;
        }
      }
    }

    records.push({
      id,
      title,
      authors,
      isbns,
      subjects,
      holdings,
      summary,
      updatedDate,
      volumeNumber,
    });
  });

  return {
    totalResults,
    startIndex,
    itemsPerPage,
    records,
    nextPageUrl: nextLink,
  };
}

/**
 * Parse holdings/copy information from an entry
 */
function parseHoldings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $entry: any,
  $: cheerio.CheerioAPI
): HoldingInfo[] {
  const holdings: HoldingInfo[] = [];

  // Holdings are in <holdings><volumes><volume><copies><copy> structure
  $entry.find('volume').each((_: number, volume: unknown) => {
    const $volume = $(volume as string);
    const callNumber = $volume.attr('label') ?? '';
    const owningLib = $volume.find('owning_lib').attr('name') ?? '';
    const owningLibCode = $volume.find('owning_lib').attr('shortname') ?? '';

    $volume.find('copy').each((_idx: number, copy: unknown) => {
      const $copy = $(copy as string);

      const status = $copy.find('status').text().trim();
      const location = $copy.find('location').text().trim();
      const circLib = $copy.find('circlib').text().trim() || owningLib;
      const circLibCode = $copy.find('circ_lib').attr('shortname') ?? owningLibCode;
      const barcode = $copy.attr('barcode');

      // Determine availability and categorize status
      const statusIdent = $copy.find('status').attr('ident');
      const available = statusIdent === '0' || status.toLowerCase() === 'available';
      const statusCategory = categorizeStatus(status);

      holdings.push({
        libraryCode: circLibCode,
        libraryName: circLib,
        location,
        callNumber,
        status,
        statusCategory,
        barcode,
        available,
      });
    });
  });

  return holdings;
}

/**
 * Get availability summary for a record
 */
export function getAvailabilitySummary(record: CatalogRecord): {
  totalCopies: number;
  availableCopies: number;
  libraries: { name: string; available: number; total: number }[];
} {
  const libraryMap = new Map<string, { available: number; total: number }>();

  for (const holding of record.holdings) {
    const existing = libraryMap.get(holding.libraryName) ?? { available: 0, total: 0 };
    existing.total++;
    if (holding.available) {
      existing.available++;
    }
    libraryMap.set(holding.libraryName, existing);
  }

  const libraries = Array.from(libraryMap.entries()).map(([name, counts]) => ({
    name,
    ...counts,
  }));

  return {
    totalCopies: record.holdings.length,
    availableCopies: record.holdings.filter((h) => h.available).length,
    libraries,
  };
}

/**
 * Get detailed availability summary with status breakdown
 */
export function getDetailedAvailabilitySummary(
  record: CatalogRecord,
  homeLibraryCode?: string | undefined
): AvailabilitySummary {
  const counts = {
    available: 0,
    checked_out: 0,
    in_transit: 0,
    on_order: 0,
    on_hold: 0,
    unavailable: 0,
  };
  
  const availableLibraries = new Set<string>();
  
  // Local vs remote tracking
  let localCopies = 0;
  let localAvailable = 0;
  let remoteCopies = 0;
  let remoteAvailable = 0;
  
  for (const holding of record.holdings) {
    counts[holding.statusCategory]++;
    if (holding.statusCategory === 'available') {
      availableLibraries.add(holding.libraryName);
    }
    
    // Track local vs remote if home library is specified
    if (homeLibraryCode) {
      const isLocal = holding.libraryCode.toUpperCase() === homeLibraryCode.toUpperCase();
      if (isLocal) {
        localCopies++;
        if (holding.statusCategory === 'available') {
          localAvailable++;
        }
      } else {
        remoteCopies++;
        if (holding.statusCategory === 'available') {
          remoteAvailable++;
        }
      }
    }
  }
  
  return {
    available: counts.available > 0,
    totalCopies: record.holdings.length,
    availableCopies: counts.available,
    checkedOutCopies: counts.checked_out,
    inTransitCopies: counts.in_transit,
    onOrderCopies: counts.on_order,
    onHoldCopies: counts.on_hold,
    unavailableCopies: counts.unavailable,
    libraries: [...availableLibraries],
    // Include local/remote only if home library was specified
    localCopies: homeLibraryCode ? localCopies : undefined,
    localAvailable: homeLibraryCode ? localAvailable : undefined,
    remoteCopies: homeLibraryCode ? remoteCopies : undefined,
    remoteAvailable: homeLibraryCode ? remoteAvailable : undefined,
    catalogUrl: getCatalogUrl(record.id),
  };
}

/**
 * Filter holdings to a specific library
 */
export function filterHoldingsByLibrary(
  record: CatalogRecord,
  libraryCode: string
): HoldingInfo[] {
  return record.holdings.filter(
    (h) => h.libraryCode.toLowerCase() === libraryCode.toLowerCase()
  );
}

/**
 * Fetch MARC record and extract volume/series info
 * Uses SuperCat API to get full MARC21 XML
 */
export async function getVolumeInfo(recordId: string): Promise<{
  volumeNumber?: string | undefined;
  volumeTitle?: string | undefined;
  seriesName?: string | undefined;
  fullTitle?: string | undefined;
}> {
  const url = `${BASE_URL}/opac/extras/supercat/retrieve/marcxml/record/${recordId}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SuperCat request failed: ${response.status}`);
  }
  
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  
  // MARC 245 = Title statement
  // $a = Title, $n = Number/part, $p = Name of part
  const titleField = $('datafield[tag="245"]');
  const titleA = titleField.find('subfield[code="a"]').text().trim(); // Main title
  const titleN = titleField.find('subfield[code="n"]').text().trim(); // Volume number
  const titleP = titleField.find('subfield[code="p"]').text().trim(); // Part name/subtitle
  
  // MARC 490 = Series statement
  const seriesField = $('datafield[tag="490"]');
  const seriesName = seriesField.find('subfield[code="a"]').text().trim();
  
  // Full title reconstruction
  let fullTitle = titleA;
  if (titleN) fullTitle += ` Vol. ${titleN}`;
  if (titleP) fullTitle += `: ${titleP}`;
  
  return {
    volumeNumber: titleN || undefined,
    volumeTitle: titleP || undefined,
    seriesName: seriesName || undefined,
    fullTitle: fullTitle || undefined,
  };
}

/**
 * Enrich a catalog record with volume information from MARC
 */
export async function enrichWithVolumeInfo(record: CatalogRecord): Promise<CatalogRecord> {
  try {
    const volumeInfo = await getVolumeInfo(record.id);
    return {
      ...record,
      volumeNumber: volumeInfo.volumeNumber,
      volumeTitle: volumeInfo.volumeTitle,
      seriesName: volumeInfo.seriesName,
      title: volumeInfo.fullTitle ?? record.title,
    };
  } catch (error) {
    console.warn(`Failed to enrich record ${record.id}:`, error);
    return record;
  }
}

/**
 * Search for all volumes in a manga series
 * Returns records with volume numbers extracted
 */
export async function searchMangaSeriesVolumes(
  seriesTitle: string,
  options: { maxVolumes?: number } = {}
): Promise<CatalogRecord[]> {
  const { maxVolumes = 50 } = options;
  
  // Search with "manga" to filter to manga editions
  const results = await searchCatalog(`${seriesTitle} manga`, {
    searchClass: 'title',
    count: maxVolumes,
  });
  
  // Filter to records that look like individual volumes (not box sets, etc.)
  const volumeRecords = results.records.filter(r => {
    const title = r.title.toLowerCase();
    // Exclude box sets, omnibus, complete, etc.
    return !title.includes('box set') && 
           !title.includes('omnibus') && 
           !title.includes('complete');
  });
  
  // Enrich with volume info (in batches to avoid rate limiting)
  const enriched: CatalogRecord[] = [];
  for (const record of volumeRecords.slice(0, 20)) { // Limit to 20 for performance
    const enrichedRecord = await enrichWithVolumeInfo(record);
    enriched.push(enrichedRecord);
    // Small delay to be nice to the server
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Sort by volume number
  enriched.sort((a, b) => {
    const numA = parseInt(a.volumeNumber ?? '999');
    const numB = parseInt(b.volumeNumber ?? '999');
    return numA - numB;
  });
  
  return enriched;
}

// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('NC Cardinal OpenSearch API Client Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // Test 1: Keyword search
    console.log('\n--- Test 1: Keyword search for "One Piece manga" ---');
    const keywordResults = await searchCatalog('One Piece manga', {
      count: 3,
    });
    console.log(`Total results: ${keywordResults.totalResults}`);
    console.log(`Showing ${keywordResults.records.length} records:\n`);

    for (const record of keywordResults.records) {
      console.log(`  📚 [${record.id}] ${record.title}`);
      console.log(`     Authors: ${record.authors.slice(0, 2).join(', ') || 'N/A'}`);
      console.log(`     ISBNs: ${record.isbns.join(', ') || 'N/A'}`);

      const availability = getAvailabilitySummary(record);
      console.log(`     Copies: ${availability.availableCopies}/${availability.totalCopies} available`);

      // Show High Point availability
      const highPointHoldings = filterHoldingsByLibrary(record, 'HIGH_POINT_MAIN');
      if (highPointHoldings.length > 0) {
        const hpAvailable = highPointHoldings.filter((h) => h.available).length;
        console.log(`     High Point: ${hpAvailable}/${highPointHoldings.length} available`);
      }
      console.log();
    }

    // Test 2: ISBN search
    console.log('\n--- Test 2: ISBN search for One Piece Vol 1 ---');
    const isbnRecord = await searchByISBN('9781569319017');
    if (isbnRecord) {
      console.log(`  Found: ${isbnRecord.title}`);
      console.log(`  ID: ${isbnRecord.id}`);
      console.log(`  ISBNs: ${isbnRecord.isbns.join(', ')}`);
      const availability = getAvailabilitySummary(isbnRecord);
      console.log(`  Availability: ${availability.availableCopies}/${availability.totalCopies}`);
      console.log(`  Libraries with copies:`);
      for (const lib of availability.libraries.slice(0, 5)) {
        console.log(`    - ${lib.name}: ${lib.available}/${lib.total} available`);
      }
    } else {
      console.log('  No results found');
    }

    // Test 3: Series search
    console.log('\n--- Test 3: Series search for "Naruto" ---');
    const seriesResults = await searchBySeries('Naruto', { count: 5 });
    console.log(`Total results: ${seriesResults.totalResults}`);
    console.log(`First ${seriesResults.records.length} results:`);
    for (const record of seriesResults.records) {
      const availability = getAvailabilitySummary(record);
      console.log(`  - [${record.id}] ${record.title} (${availability.availableCopies}/${availability.totalCopies} available)`);
    }

    // Test 4: Title search
    console.log('\n--- Test 4: Title search for "Demon Slayer" ---');
    const titleResults = await searchByTitle('Demon Slayer', { count: 5 });
    console.log(`Total results: ${titleResults.totalResults}`);
    for (const record of titleResults.records) {
      console.log(`  - [${record.id}] ${record.title}`);
    }

    // Test 5: Volume info extraction
    console.log('\n--- Test 5: Extracting volume info from MARC ---');
    const volumeInfo = await getVolumeInfo('14396210'); // One Piece Vol 107
    console.log('One Piece record 14396210:');
    console.log(`  Volume Number: ${volumeInfo.volumeNumber}`);
    console.log(`  Volume Title: ${volumeInfo.volumeTitle}`);
    console.log(`  Series: ${volumeInfo.seriesName}`);
    console.log(`  Full Title: ${volumeInfo.fullTitle}`);

    // Test 6: Search manga series volumes
    console.log('\n--- Test 6: Search for Demon Slayer volumes ---');
    console.log('(This may take a moment - fetching MARC data for each volume...)');
    const demonSlayerVolumes = await searchMangaSeriesVolumes('Demon Slayer', { maxVolumes: 10 });
    console.log(`Found ${demonSlayerVolumes.length} individual volumes:`);
    for (const vol of demonSlayerVolumes) {
      const avail = getAvailabilitySummary(vol);
      const volNum = vol.volumeNumber ? `Vol. ${vol.volumeNumber}` : '(no vol#)';
      console.log(`  - ${volNum}: ${vol.title} - ${avail.availableCopies}/${avail.totalCopies} available`);
    }

  } catch (error) {
    console.error('Error during testing:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
  console.log('='.repeat(60));
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
