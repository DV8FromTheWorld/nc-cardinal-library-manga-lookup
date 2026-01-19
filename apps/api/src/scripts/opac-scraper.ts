/**
 * NC Cardinal OPAC Scraper
 *
 * Scrapes the public OPAC web interface when API endpoints don't provide
 * the data we need. This is a fallback approach.
 *
 * Main OPAC: https://highpoint.nccardinal.org/eg/opac/home
 *
 * Note: Web scraping is fragile and may break if the OPAC UI changes.
 * Always prefer API endpoints when available.
 */

import * as cheerio from 'cheerio';

const BASE_URL =
  process.env.NC_CARDINAL_BASE_URL ?? 'https://highpoint.nccardinal.org';

// User agent to identify our scraper
const USER_AGENT =
  'Mozilla/5.0 (compatible; NC-Cardinal-Manga/1.0; Educational Project)';

export interface OPACSearchResult {
  recordId: string;
  title: string;
  author?: string | undefined;
  format?: string | undefined;
  publicationYear?: string | undefined;
  isbn?: string | undefined;
  callNumber?: string | undefined;
  detailUrl: string;
}

export interface OPACRecordDetail {
  recordId: string;
  title: string;
  author?: string | undefined;
  publisher?: string | undefined;
  publicationYear?: string | undefined;
  isbn?: string[] | undefined;
  format?: string | undefined;
  series?: string | undefined;
  subjects?: string[] | undefined;
  summary?: string | undefined;
  holdings: OPACHolding[];
}

export interface OPACHolding {
  library: string;
  branch?: string | undefined;
  location: string;
  callNumber: string;
  status: string;
  dueDate?: string | undefined;
  copies?: {
    available: number;
    total: number;
  } | undefined;
}

export interface LibraryOrg {
  id: number;
  name: string;
  shortName?: string | undefined;
  parent?: number | undefined;
}

/**
 * Search the OPAC catalog
 */
export async function searchOPACCatalog(
  query: string,
  options: {
    searchType?: 'keyword' | 'title' | 'author' | 'subject' | 'series' | 'identifier';
    libraryId?: number;
    format?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ results: OPACSearchResult[]; totalResults: number }> {
  const { searchType = 'keyword', libraryId = 1, limit = 20, offset = 0 } = options;

  const params = new URLSearchParams({
    query: query,
    qtype: searchType,
    locg: libraryId.toString(),
    limit: limit.toString(),
    offset: offset.toString(),
  });

  if (options.format != null) {
    params.set('fi:item_type', options.format);
  }

  const url = `${BASE_URL}/eg/opac/results?${params}`;
  console.log(`Scraping OPAC search: ${url}`);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`OPAC search failed: ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResultsPage(html);
}

/**
 * Parse OPAC search results page
 */
function parseSearchResultsPage(html: string): {
  results: OPACSearchResult[];
  totalResults: number;
} {
  const $ = cheerio.load(html);
  const results: OPACSearchResult[] = [];

  // Try to find total results count from the "Select all on page" label or result counts
  let totalResults = 0;
  const selectAllLabel = $('label[for="select_all_records"]').text();
  const selectAllMatch = selectAllLabel.match(/\d+\s*-\s*(\d+)/);
  if (selectAllMatch?.[1] != null) {
    // This gives us the end range, but not total. Look for pagination or other indicators
    totalResults = parseInt(selectAllMatch[1], 10);
  }

  // Parse each search result - the structure uses result_table_title_cell divs
  // Each result has a record link like /eg/opac/record/14828720
  $('.result_table_title_cell').each((_, el) => {
    const $el = $(el);

    // Find the main title link which contains the record ID
    const titleLink = $el.find('a.search_link[id^="record_"]').first();
    const href = titleLink.attr('href') ?? '';
    const recordMatch = href.match(/\/record\/(\d+)/);
    const recordId = recordMatch?.[1] ?? '';

    if (recordId === '') return;

    // Extract title from the link's text content or title attribute
    const titleAttr = titleLink.attr('title') ?? '';
    const titleMatch = titleAttr.match(/Display record details for "(.+)"/);
    const title = titleMatch?.[1] != null
      ? titleMatch[1].replace(/"/g, '')
      : cleanText(titleLink.text());

    // Extract author from record_author class
    const authorLink = $el.find('a.record_author').first();
    const author = authorLink.text().trim();

    // Extract availability info from result_count
    const _availabilityText = $el.find('.result_count').text().trim();

    // Extract format/type from record_format span
    const format = $el.find('.record_format').text().trim();

    results.push({
      recordId,
      title: cleanText(title),
      author: author !== '' ? cleanText(author) : undefined,
      format: format !== '' ? cleanText(format) : undefined,
      publicationYear: undefined, // Not visible in search results
      isbn: undefined, // Not visible in search results
      callNumber: undefined, // Not visible in search results
      detailUrl: `${BASE_URL}/eg/opac/record/${recordId}`,
    });
  });

  // If we didn't find results with the new structure, try alternate selectors
  if (results.length === 0) {
    // Fallback: look for any links to record pages
    $('a[href*="/eg/opac/record/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') ?? '';
      const recordMatch = href.match(/\/record\/(\d+)/);
      const recordId = recordMatch?.[1] ?? '';

      // Skip if already found or if it's a duplicate
      if (recordId === '' || results.some((r) => r.recordId === recordId)) return;

      // Skip cover images and non-title links
      if ($a.hasClass('cover-image') || $a.find('img').length > 0) return;

      const title = $a.attr('title') ?? $a.text().trim();
      if (title === '' || title.length < 2) return;

      results.push({
        recordId,
        title: cleanText(title),
        detailUrl: `${BASE_URL}/eg/opac/record/${recordId}`,
      });
    });
  }

  // Update total results if we found any
  if (results.length > 0 && totalResults === 0) {
    totalResults = results.length;
  }

  return { results, totalResults };
}

/**
 * Get detailed record information including holdings
 */
export async function getRecordDetails(recordId: string): Promise<OPACRecordDetail | null> {
  const url = `${BASE_URL}/eg/opac/record/${recordId}`;
  console.log(`Scraping OPAC record: ${url}`);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`OPAC record fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseRecordDetailPage(html, recordId);
}

/**
 * Parse OPAC record detail page
 */
function parseRecordDetailPage(html: string, recordId: string): OPACRecordDetail | null {
  const $ = cheerio.load(html);

  // Extract title from h1#record_page_title
  const titleEl = $('#record_page_title').first();
  let title = titleEl.text().trim();

  // Clean up title - remove [manga] tag and extra info after main title
  title = title.split('[')[0]?.trim() ?? '';

  if (title === '') {
    return null; // Invalid page
  }

  // Extract author from rdetail_authors_div
  const authorEl = $('.rdetail_authors_div .rdetail-author-div').first();
  const authorName = authorEl.find('span[property="name"]').first().text().trim();

  // Publication info from #rdetail_publisher
  const pubValue = $('#rdetail_publisher .rdetail_value').text().trim();
  const pubParts = pubValue.split(':').map((p) => p.trim());
  const lastPubPart = pubParts[pubParts.length - 1];
  const publisher = pubParts.length > 1 && lastPubPart != null && lastPubPart !== '' ? lastPubPart.split(',')[0] : undefined;

  // Copyright year from #rdetail_copyright
  const copyrightText = $('#rdetail_copyright .rdetail_value').text();
  const yearMatch = copyrightText.match(/\d{4}/);
  const publicationYear = yearMatch ? yearMatch[0] : undefined;

  // ISBNs from .rdetail_isbns
  const isbns: string[] = [];
  $('.rdetail_isbns .rdetail_value').each((_, el) => {
    const isbn = $(el).text().trim();
    if (isbn !== '' && /^[\dX-]+$/i.test(isbn)) {
      isbns.push(isbn.replace(/-/g, ''));
    }
  });

  // Format from physical description or record type
  const physDesc = $('#rdetail_phys_desc .rdetail_value').text().trim();
  let format = '';
  if (physDesc.toLowerCase().includes('illustration')) {
    format = 'Book';
  }

  // Series from rdetail_series_value
  const seriesLinks = $('.rdetail_series_value a').first();
  const series = seriesLinks.text().trim();

  // Subjects
  const subjects: string[] = [];
  $('.rdetail_subject_value a').each((_, el) => {
    const subject = $(el).text().trim();
    if (subject !== '' && !subjects.includes(subject)) {
      subjects.push(subject);
    }
  });

  // Parse holdings/copy information from #rdetail_copy_counts
  const holdings = parseHoldingsFromCopyCounts($);

  return {
    recordId,
    title: cleanText(title),
    author: authorName !== '' ? cleanText(authorName.replace(/,$/, '')) : undefined,
    publisher: publisher !== '' ? publisher : undefined,
    publicationYear,
    isbn: isbns.length > 0 ? isbns : undefined,
    format: format !== '' ? format : undefined,
    series: series !== '' ? series : undefined,
    subjects: subjects.length > 0 ? subjects : undefined,
    summary: undefined,
    holdings,
  };
}

/**
 * Parse holdings/copies from the copy counts section
 */
function parseHoldingsFromCopyCounts($: cheerio.CheerioAPI): OPACHolding[] {
  const holdings: OPACHolding[] = [];

  // Parse the copy counts list items
  // Format: "8 of 8 copies available at NC Cardinal."
  // or "1 of 1 copy available at High Point Public Library."
  $('#rdetail_copy_counts li').each((_, el) => {
    const text = $(el).text().trim();

    // Parse "X of Y copies available at Library Name"
    const match = text.match(/(\d+)\s+of\s+(\d+)\s+cop(?:y|ies)\s+available\s+at\s+(.+?)\.?\s*(?:\(Show\))?$/i);
    if (match != null && match[1] != null && match[2] != null && match[3] != null) {
      const available = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      const library = match[3].trim();

      holdings.push({
        library,
        location: 'See catalog for details',
        callNumber: '',
        status: available > 0 ? 'Available' : 'Checked Out',
        copies: { available, total },
      });
    }
  });

  return holdings;
}

/**
 * Parse holdings/copies table from record detail page (legacy/alternate format)
 */
function _parseHoldingsTable($: cheerio.CheerioAPI): OPACHolding[] {
  const holdings: OPACHolding[] = [];

  // Holdings are typically in a table
  $(
    '#copy_info_table tbody tr, .copy_details tr, [class*="holdings"] tr, #rdetail_status tbody tr'
  ).each((_, el) => {
    const $row = $(el);

    // Skip header rows
    if ($row.find('th').length > 0) return;

    const cells = $row.find('td');
    if (cells.length < 2) return;

    // The exact structure varies, but typically:
    // Library | Location | Call Number | Status | Due Date
    const library = cells.eq(0).text().trim();
    const location = cells.eq(1).text().trim();
    const callNumber = cells.eq(2).text().trim();
    const status = cells.eq(3).text().trim();
    const dueDate = cells.eq(4).text().trim();

    if (library !== '') {
      holdings.push({
        library: cleanText(library),
        location: cleanText(location) !== '' ? cleanText(location) : 'Unknown',
        callNumber: cleanText(callNumber),
        status: status !== '' ? cleanText(status) : 'Unknown',
        dueDate: dueDate !== '' ? cleanText(dueDate) : undefined,
      });
    }
  });

  return holdings;
}

/**
 * Get list of library organizations from the OPAC
 */
export async function getLibraryOrganizations(): Promise<LibraryOrg[]> {
  const url = `${BASE_URL}/eg/opac/home`;
  console.log(`Scraping library organizations from: ${url}`);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`OPAC home page fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseLibraryOptions(html);
}

/**
 * Parse library organization options from OPAC home/search page
 */
function parseLibraryOptions(html: string): LibraryOrg[] {
  const $ = cheerio.load(html);
  const orgs: LibraryOrg[] = [];

  // Library select dropdown
  $('select[name="locg"] option, #search_org option').each((_, el) => {
    const $option = $(el);
    const value = $option.attr('value');
    const text = $option.text().trim();

    if (value == null || value === '') return;

    const id = parseInt(value, 10);
    if (isNaN(id)) return;

    // The text often has indentation to show hierarchy
    const indentMatch = text.match(/^(\s*)/);
    const _indent = indentMatch?.[1]?.length ?? 0;
    const name = text.trim();

    orgs.push({
      id,
      name,
      // Could derive parent from indentation level
    });
  });

  return orgs;
}

/**
 * Search by ISBN specifically
 */
export async function searchByISBN(
  isbn: string,
  libraryId: number = 1
): Promise<OPACSearchResult[]> {
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  const { results } = await searchOPACCatalog(cleanISBN, {
    searchType: 'identifier',
    libraryId,
  });
  return results;
}

/**
 * Search for series by name
 */
export async function searchSeries(
  seriesName: string,
  libraryId: number = 1
): Promise<OPACSearchResult[]> {
  const { results } = await searchOPACCatalog(seriesName, {
    searchType: 'series',
    libraryId,
  });
  return results;
}

/**
 * Check availability of multiple ISBNs at once
 */
export async function checkMultipleISBNs(
  isbns: string[],
  libraryId: number = 1
): Promise<Map<string, OPACSearchResult[]>> {
  const results = new Map<string, OPACSearchResult[]>();

  // Process in batches to avoid overwhelming the server
  const batchSize = 5;
  for (let i = 0; i < isbns.length; i += batchSize) {
    const batch = isbns.slice(i, i + batchSize);

    const promises = batch.map(async (isbn) => {
      const searchResults = await searchByISBN(isbn, libraryId);
      return { isbn, searchResults };
    });

    const batchResults = await Promise.all(promises);
    for (const { isbn, searchResults } of batchResults) {
      results.set(isbn, searchResults);
    }

    // Small delay between batches
    if (i + batchSize < isbns.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Clean up text extracted from HTML
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/^\s+|\s+$/g, '') // Trim
    .replace(/\n/g, ' '); // Remove newlines
}

// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('NC Cardinal OPAC Scraper Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // Test 1: Get library organizations
    console.log('\n--- Test 1: Get Library Organizations ---');
    const orgs = await getLibraryOrganizations();
    console.log(`Found ${orgs.length} library organizations:`);
    orgs.slice(0, 10).forEach((org) => {
      console.log(`  [${org.id}] ${org.name}`);
    });
    if (orgs.length > 10) {
      console.log(`  ... and ${orgs.length - 10} more`);
    }

    // Find High Point Library ID
    const highPointOrg = orgs.find(
      (o) => o.name.toLowerCase().includes('high point') && o.name.toLowerCase().includes('library')
    );
    if (highPointOrg) {
      console.log(`\n  ✓ Found High Point Library: ID ${highPointOrg.id}`);
    }

    // Test 2: Search for manga
    console.log('\n--- Test 2: Search OPAC for "One Piece manga" ---');
    const { results: searchResults, totalResults } = await searchOPACCatalog('One Piece manga', {
      searchType: 'keyword',
      libraryId: 1, // NC Cardinal (all)
      limit: 5,
    });
    console.log(`Found ${totalResults} total results, showing first ${searchResults.length}:`);
    searchResults.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.recordId}] ${r.title}`);
      console.log(`     Author: ${r.author ?? 'N/A'} | Format: ${r.format ?? 'N/A'}`);
    });

    // Test 3: Get record details for first result
    const firstResult = searchResults[0];
    if (firstResult) {
      console.log(`\n--- Test 3: Get record details for ID ${firstResult.recordId} ---`);
      const details = await getRecordDetails(firstResult.recordId);

      if (details) {
        console.log('Record Details:');
        console.log(`  Title: ${details.title}`);
        console.log(`  Author: ${details.author ?? 'N/A'}`);
        console.log(`  Publisher: ${details.publisher ?? 'N/A'}`);
        console.log(`  Year: ${details.publicationYear ?? 'N/A'}`);
        console.log(`  ISBNs: ${details.isbn?.join(', ') ?? 'N/A'}`);
        console.log(`  Series: ${details.series ?? 'N/A'}`);
        console.log(`  Format: ${details.format ?? 'N/A'}`);
        console.log(`  Subjects: ${details.subjects?.slice(0, 3).join(', ') ?? 'N/A'}`);

        console.log(`\n  Holdings (${details.holdings.length} locations):`);
        details.holdings.slice(0, 5).forEach((h) => {
          console.log(`    - ${h.library} / ${h.location}: ${h.status}`);
          console.log(`      Call#: ${h.callNumber !== '' ? h.callNumber : 'N/A'}`);
        });
        if (details.holdings.length > 5) {
          console.log(`    ... and ${details.holdings.length - 5} more locations`);
        }
      } else {
        console.log('  Could not parse record details');
      }
    }

    // Test 4: Search by ISBN
    console.log('\n--- Test 4: Search by ISBN (978-1569319017) ---');
    const isbnResults = await searchByISBN('978-1569319017');
    console.log(`Found ${isbnResults.length} results:`);
    isbnResults.forEach((r) => {
      console.log(`  [${r.recordId}] ${r.title}`);
    });

  } catch (error) {
    console.error('Error during testing:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
  console.log('='.repeat(60));
}

// Run if executed directly (not when imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
