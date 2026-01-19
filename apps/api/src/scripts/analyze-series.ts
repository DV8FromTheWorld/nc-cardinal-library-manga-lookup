/**
 * Analyze a manga series in NC Cardinal
 *
 * This script searches NC Cardinal directly (no LibraryThing API calls)
 * and extracts volume information from MARC records.
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://highpoint.nccardinal.org';
const CACHE_DIR = path.join(process.cwd(), '.cache', 'nc-cardinal');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

interface VolumeInfo {
  recordId: string;
  volumeNumber: string | null;
  volumeTitle: string | null;
  fullTitle: string;
  isbns: string[];
  totalCopies: number;
  availableCopies: number;
}

interface SeriesAnalysis {
  searchTerm: string;
  totalRecords: number;
  volumes: VolumeInfo[];
  volumeNumbers: string[];
  missingVolumes: string[];
}

/**
 * Fetch MARC record and extract volume info
 */
async function getVolumeInfo(recordId: string): Promise<VolumeInfo> {
  const url = `${BASE_URL}/opac/extras/supercat/retrieve/marcxml/record/${recordId}`;

  const response = await fetch(url);
  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  // Extract from MARC 245 field
  const titleField = $('datafield[tag="245"]');
  const mainTitle = titleField.find('subfield[code="a"]').text().trim();
  const rawVolumeNumber = titleField.find('subfield[code="n"]').text().trim();
  const volumeTitleRaw = titleField.find('subfield[code="p"]').text().trim();
  const volumeTitle = volumeTitleRaw !== '' ? volumeTitleRaw : null;

  // Normalize volume number: "06 /" -> "6", "Vol. 6" -> "6", "Volume 5" -> "5"
  let volumeNumber: string | null = null;
  if (rawVolumeNumber !== '') {
    const match = rawVolumeNumber.match(/(\d+)/);
    if (match?.[1] != null) {
      // Remove leading zeros: "01" -> "1"
      volumeNumber = parseInt(match[1], 10).toString();
    }
  }

  // Extract ISBNs from MARC 020
  const isbns: string[] = [];
  $('datafield[tag="020"] subfield[code="a"]').each((_, el) => {
    const isbn = $(el).text().trim().split(' ')[0]; // Remove qualifiers like "(paperback)"
    if (isbn != null && isbn !== '') isbns.push(isbn);
  });

  // Get holdings info from OpenSearch
  const holdingsUrl = `${BASE_URL}/opac/extras/opensearch/1.1/CARDINAL/atom-full/keyword/?searchTerms=${recordId}&count=1`;
  const holdingsResponse = await fetch(holdingsUrl);
  const holdingsXml = await holdingsResponse.text();
  const $holdings = cheerio.load(holdingsXml, { xmlMode: true });

  let totalCopies = 0;
  let availableCopies = 0;

  $holdings('copy').each((_, copy) => {
    totalCopies++;
    const status = $holdings(copy).find('status').attr('ident');
    if (status === '0') availableCopies++;
  });

  let fullTitle = mainTitle;
  if (volumeNumber != null) fullTitle += ` Vol. ${volumeNumber}`;
  if (volumeTitle != null) fullTitle += `: ${volumeTitle}`;

  return {
    recordId,
    volumeNumber,
    volumeTitle,
    fullTitle,
    isbns,
    totalCopies,
    availableCopies,
  };
}

/**
 * Search NC Cardinal and analyze a manga series
 */
async function analyzeSeriesInNCCardinal(
  searchTerm: string,
  options: { maxRecords?: number; expectedVolumes?: number } = {}
): Promise<SeriesAnalysis> {
  const { maxRecords = 50, expectedVolumes = 0 } = options;

  console.log(`\n📚 Analyzing series: "${searchTerm}" in NC Cardinal`);
  console.log('='.repeat(60));

  // Check cache first
  const cacheKey = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.json';
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (fs.existsSync(cachePath)) {
    console.log(`📁 Loading from cache: ${cacheKey}`);
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as SeriesAnalysis;
    return cached;
  }

  // Search NC Cardinal with pagination
  const recordIds: string[] = [];
  let totalResults = 0;
  let startIndex = 1;
  const pageSize = 25;

  while (true) {
    const searchUrl = `${BASE_URL}/opac/extras/opensearch/1.1/CARDINAL/atom-full/title/?searchTerms=${encodeURIComponent(searchTerm)}&count=${pageSize}&startIndex=${startIndex}`;

    if (startIndex === 1) {
      console.log(`🔍 Searching: ${searchUrl}`);
    }

    const response = await fetch(searchUrl);
    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    if (startIndex === 1) {
      const totalResultsNum = parseInt($('totalResults').text());
      totalResults = !Number.isNaN(totalResultsNum) ? totalResultsNum : 0;
      console.log(`Found ${totalResults} total records`);
    }

    // Extract record IDs from this page
    let foundOnPage = 0;
    $('id').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/urn:tcn:(\d+)/);
      if (match?.[1] != null && !recordIds.includes(match[1])) {
        recordIds.push(match[1]);
        foundOnPage++;
      }
    });

    // Check if we need more pages
    if (foundOnPage === 0 || recordIds.length >= maxRecords || recordIds.length >= totalResults) {
      break;
    }

    startIndex += pageSize;
    console.log(`  Fetching more records (${recordIds.length}/${totalResults})...`);
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`Processing ${recordIds.length} records...`);

  // Get volume info for each record
  const volumes: VolumeInfo[] = [];
  for (let i = 0; i < recordIds.length; i++) {
    const id = recordIds[i];
    if (id == null) continue;
    process.stdout.write(`  ${i + 1}/${recordIds.length}: ${id}...`);

    try {
      const vol = await getVolumeInfo(id);
      volumes.push(vol);
      console.log(` Vol ${vol.volumeNumber ?? '?'} ✅`);
    } catch {
      console.log(` Error ❌`);
    }

    // Small delay
    await new Promise((r) => setTimeout(r, 50));
  }

  // Sort by volume number
  volumes.sort((a, b) => {
    const numA = parseInt(a.volumeNumber ?? '999');
    const numB = parseInt(b.volumeNumber ?? '999');
    return numA - numB;
  });

  // Extract unique volume numbers
  const volumeNumbers = [
    ...new Set(volumes.map((v) => v.volumeNumber).filter((n): n is string => n !== null)),
  ].sort((a, b) => parseInt(a) - parseInt(b));

  // Find missing volumes if expected count provided
  const missingVolumes: string[] = [];
  if (expectedVolumes !== 0) {
    for (let i = 1; i <= expectedVolumes; i++) {
      if (!volumeNumbers.includes(i.toString())) {
        missingVolumes.push(i.toString());
      }
    }
  }

  const result: SeriesAnalysis = {
    searchTerm,
    totalRecords: totalResults,
    volumes,
    volumeNumbers,
    missingVolumes,
  };

  // Save to cache
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
  console.log(`💾 Saved to cache: ${cacheKey}`);

  return result;
}

/**
 * Display analysis results
 */
function displayResults(analysis: SeriesAnalysis): void {
  console.log('\n' + '═'.repeat(60));
  console.log(`📚 SERIES ANALYSIS: ${analysis.searchTerm}`);
  console.log('═'.repeat(60));

  console.log(`\nTotal Records: ${analysis.totalRecords}`);
  console.log(`Unique Volumes: ${analysis.volumeNumbers.length}`);
  console.log(`Volume Numbers Found: ${analysis.volumeNumbers.join(', ')}`);

  if (analysis.missingVolumes.length > 0) {
    console.log(`\n⚠️  Missing Volumes: ${analysis.missingVolumes.join(', ')}`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('VOLUME DETAILS:');
  console.log('─'.repeat(60));

  for (const vol of analysis.volumes) {
    const status = vol.availableCopies > 0 ? '✅' : '📕';
    const volNum = vol.volumeNumber != null ? `Vol ${vol.volumeNumber.padStart(2)}` : 'Vol ??';
    console.log(`\n${status} ${volNum}: ${vol.volumeTitle ?? vol.fullTitle}`);
    console.log(`   Record: ${vol.recordId}`);
    console.log(`   Availability: ${vol.availableCopies}/${vol.totalCopies}`);
    if (vol.isbns.length > 0) {
      console.log(`   ISBN: ${vol.isbns[0]}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const searchTerm = process.argv[2] ?? 'Demon Slayer Kimetsu no Yaiba manga';
  const expectedVolumes = parseInt(process.argv[3] ?? '23');

  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + '  NC Cardinal Series Analyzer  '.padStart(44).padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  try {
    const analysis = await analyzeSeriesInNCCardinal(searchTerm, {
      maxRecords: 50,
      expectedVolumes,
    });
    displayResults(analysis);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
