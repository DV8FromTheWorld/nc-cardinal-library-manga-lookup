/**
 * Evergreen ILS SuperCat Client
 *
 * Explores NC Cardinal's public API endpoints powered by Evergreen ILS.
 * SuperCat provides XML/MARC data feeds without authentication.
 *
 * Endpoints discovered:
 * - /opac/extras/supercat/retrieve/{format}/record/{id}
 * - /opac/extras/browse/
 * - /eg/opac/results (OPAC search, returns HTML)
 */

import * as cheerio from 'cheerio';

const BASE_URL = process.env.NC_CARDINAL_BASE_URL ?? 'https://highpoint.nccardinal.org';

// Known library organization IDs (locg parameter)
// These will need to be discovered/verified
export const LIBRARY_ORGS = {
  NC_CARDINAL_ALL: 1, // Root org - all libraries
  HIGH_POINT: 265, // High Point Public Library (approximate, needs verification)
} as const;

export interface SearchResult {
  id: string;
  title: string;
  author?: string | undefined;
  format?: string | undefined;
  isbn?: string | undefined;
  publicationYear?: string | undefined;
  availability?: AvailabilityInfo[] | undefined;
}

export interface AvailabilityInfo {
  library: string;
  location: string;
  callNumber?: string | undefined;
  status: string;
  copies?: number | undefined;
}

export interface MARCRecord {
  id: string;
  title?: string | undefined;
  author?: string | undefined;
  isbn?: string[] | undefined;
  series?: string | undefined;
  publicationInfo?: string | undefined;
  subjects?: string[] | undefined;
  rawXml: string;
}

/**
 * SuperCat formats available for record retrieval
 */
export type SuperCatFormat = 'marcxml' | 'mods' | 'mods3' | 'atom' | 'atom-full' | 'rss2' | 'html';

/**
 * Fetch a record from SuperCat by record ID
 */
export async function getRecordBySuperCat(
  recordId: string,
  format: SuperCatFormat = 'marcxml'
): Promise<string> {
  const url = `${BASE_URL}/opac/extras/supercat/retrieve/${format}/record/${recordId}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SuperCat request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Parse MARCXML response to extract useful fields
 * MARC field reference: https://www.loc.gov/marc/bibliographic/
 */
export function parseMARCXML(xml: string): MARCRecord | null {
  const $ = cheerio.load(xml, { xmlMode: true });

  const record = $('record').first();
  if (record.length === 0) {
    return null;
  }

  // Extract control number (record ID)
  const id = record.find('controlfield[tag="001"]').text().trim();

  // 245 - Title Statement
  const title = record.find('datafield[tag="245"] subfield[code="a"]').text().trim();

  // 100 - Main Entry - Personal Name (Author)
  const author = record.find('datafield[tag="100"] subfield[code="a"]').text().trim();

  // 020 - ISBN
  const isbns: string[] = [];
  record.find('datafield[tag="020"] subfield[code="a"]').each((_, el) => {
    const isbn = $(el).text().trim().split(' ')[0]; // Often has qualifiers after ISBN
    if (isbn !== '' && isbn != null) isbns.push(isbn);
  });

  // 490 - Series Statement
  const series = record.find('datafield[tag="490"] subfield[code="a"]').text().trim();

  // 260/264 - Publication info
  const pub264 = record.find('datafield[tag="264"] subfield[code="c"]').text().trim();
  const pub260 = record.find('datafield[tag="260"] subfield[code="c"]').text().trim();
  const publicationInfo = pub264 !== '' ? pub264 : pub260;

  // 650 - Subject headings
  const subjects: string[] = [];
  record.find('datafield[tag="650"]').each((_, el) => {
    const subject = $(el).find('subfield[code="a"]').text().trim();
    if (subject !== '') subjects.push(subject);
  });

  return {
    id: id !== '' ? id : 'unknown',
    title: title !== '' ? title : undefined,
    author: author !== '' ? author : undefined,
    isbn: isbns.length > 0 ? isbns : undefined,
    series: series !== '' ? series : undefined,
    publicationInfo: publicationInfo !== '' ? publicationInfo : undefined,
    subjects: subjects.length > 0 ? subjects : undefined,
    rawXml: xml,
  };
}

/**
 * Search the OPAC and parse results
 * This scrapes the public OPAC search results page
 */
export async function searchOPAC(
  query: string,
  options: {
    searchType?: 'keyword' | 'title' | 'author' | 'subject' | 'series' | 'identifier';
    libraryOrg?: number;
    format?: string;
    limit?: number;
  } = {}
): Promise<SearchResult[]> {
  const { searchType = 'keyword', libraryOrg = LIBRARY_ORGS.NC_CARDINAL_ALL, limit = 20 } = options;

  // Map search types to qtype parameter
  const qtypeMap: Record<string, string> = {
    keyword: 'keyword',
    title: 'title',
    author: 'author',
    subject: 'subject',
    series: 'series',
    identifier: 'identifier', // For ISBN searches
  };

  const params = new URLSearchParams({
    query: query,
    qtype: qtypeMap[searchType] ?? 'keyword',
    locg: libraryOrg.toString(),
    limit: limit.toString(),
  });

  const url = `${BASE_URL}/eg/opac/results?${params}`;
  console.log(`Searching OPAC: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OPAC search failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return parseOPACResults(html);
}

/**
 * Parse OPAC search results HTML
 */
function parseOPACResults(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // Parse each search result - the structure uses result_table_title_cell divs
  $('.result_table_title_cell').each((_, el) => {
    const $el = $(el);

    // Find the main title link which contains the record ID
    const titleLink = $el.find('a.search_link[id^="record_"]').first();
    const href = titleLink.attr('href') ?? '';
    const recordMatch = href.match(/\/record\/(\d+)/);
    const id = recordMatch != null ? recordMatch[1] : '';

    if (id === '' || id == null) return;

    // Extract title from the link's text content or title attribute
    const titleAttr = titleLink.attr('title') ?? '';
    const titleMatch = titleAttr.match(/Display record details for "(.+)"/);
    const title =
      titleMatch?.[1] != null
        ? titleMatch[1].replace(/"/g, '')
        : titleLink.text().trim().replace(/\s+/g, ' ');

    // Extract author from record_author class
    const authorLink = $el.find('a.record_author').first();
    const author = authorLink.text().trim();

    // Extract format from record_format span
    const format = $el.find('.record_format').text().trim();

    results.push({
      id,
      title,
      author: author !== '' ? author : undefined,
      format: format !== '' ? format : undefined,
    });
  });

  return results;
}

/**
 * Search by ISBN using the identifier search type
 */
export async function searchByISBN(
  isbn: string,
  libraryOrg: number = LIBRARY_ORGS.NC_CARDINAL_ALL
): Promise<SearchResult[]> {
  // Clean ISBN - remove hyphens and spaces
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  return searchOPAC(cleanISBN, {
    searchType: 'identifier',
    libraryOrg,
  });
}

/**
 * Get holdings/availability info for a record
 * Uses the atom-full format which includes holdings data
 */
export async function getRecordHoldings(recordId: string): Promise<AvailabilityInfo[]> {
  const atomXml = await getRecordBySuperCat(recordId, 'atom-full');
  return parseAtomHoldings(atomXml);
}

/**
 * Parse Atom feed for holdings information
 */
function parseAtomHoldings(xml: string): AvailabilityInfo[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const holdings: AvailabilityInfo[] = [];

  // Atom holdings are in specific elements - structure varies by Evergreen version
  $('holdings volume, holding').each((_, el) => {
    const $el = $(el);

    const libraryText = $el.find('owning_lib, library').text().trim();
    const locationText = $el.find('location').text().trim();
    const callNumberText = $el.find('call_number, callnumber').text().trim();
    const statusText = $el.find('status').text().trim();
    const copiesNum = parseInt($el.find('copies, count').text());
    holdings.push({
      library: libraryText !== '' ? libraryText : 'Unknown',
      location: locationText !== '' ? locationText : 'Unknown',
      callNumber: callNumberText !== '' ? callNumberText : undefined,
      status: statusText !== '' ? statusText : 'Unknown',
      copies: !Number.isNaN(copiesNum) ? copiesNum : undefined,
    });
  });

  return holdings;
}

/**
 * Get full record details including holdings
 */
export async function getFullRecordDetails(
  recordId: string
): Promise<{ record: MARCRecord | null; holdings: AvailabilityInfo[] }> {
  const [marcXml, holdings] = await Promise.all([
    getRecordBySuperCat(recordId, 'marcxml'),
    getRecordHoldings(recordId),
  ]);

  return {
    record: parseMARCXML(marcXml),
    holdings,
  };
}

// ============================================================================
// Test/Demo execution
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Evergreen ILS / NC Cardinal SuperCat Client Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  try {
    // Test 1: Search OPAC for manga
    console.log('\n--- Test 1: OPAC Search for "One Piece manga" ---');
    const searchResults = await searchOPAC('One Piece manga', {
      searchType: 'keyword',
      libraryOrg: LIBRARY_ORGS.NC_CARDINAL_ALL,
      limit: 5,
    });
    console.log(`Found ${searchResults.length} results:`);
    searchResults.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.id}] ${r.title} ${r.author != null ? `by ${r.author}` : ''}`);
    });

    // Test 2: If we found results, get details for the first one
    const firstResult = searchResults[0];
    if (firstResult != null) {
      console.log(`\n--- Test 2: Get full record details for ID ${firstResult.id} ---`);

      try {
        const details = await getFullRecordDetails(firstResult.id);

        if (details.record) {
          console.log('Record Info:');
          console.log(`  Title: ${details.record.title ?? 'N/A'}`);
          console.log(`  Author: ${details.record.author ?? 'N/A'}`);
          console.log(`  ISBNs: ${details.record.isbn?.join(', ') ?? 'N/A'}`);
          console.log(`  Series: ${details.record.series ?? 'N/A'}`);
          console.log(`  Publication: ${details.record.publicationInfo ?? 'N/A'}`);
          console.log(`  Subjects: ${details.record.subjects?.join(', ') ?? 'N/A'}`);
        }

        console.log(`\nHoldings (${details.holdings.length} locations):`);
        details.holdings.forEach((h) => {
          console.log(`  - ${h.library} / ${h.location}: ${h.status}`);
        });
      } catch (err: unknown) {
        console.log(`  Could not fetch details: ${String(err)}`);
      }
    }

    // Test 3: Search by ISBN
    console.log('\n--- Test 3: Search by ISBN (One Piece Vol 1: 978-1569319017) ---');
    const isbnResults = await searchByISBN('978-1569319017');
    console.log(`Found ${isbnResults.length} results for ISBN search`);
    isbnResults.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.id}] ${r.title}`);
    });

    // Test 4: Try SuperCat directly with a known record ID (if we have one)
    console.log('\n--- Test 4: Direct SuperCat MARCXML fetch ---');
    console.log('(Skipping - need a known record ID from previous search)');
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
