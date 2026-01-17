/**
 * Streaming Manga Search Service
 *
 * Wraps the manga search logic to emit progress events via a callback.
 * Used by the SSE endpoint to stream search progress to clients.
 */

import {
  getMangaSeries as getWikipediaSeries,
  type WikiMangaSeries,
} from './wikipedia-client.js';

import {
  searchCatalog,
  getDetailedAvailabilitySummary,
  type CatalogRecord,
} from './opensearch-client.js';

import {
  parseQuery,
  fetchBookcoverUrl,
  type SearchResult,
  type SeriesResult,
  type VolumeResult,
  type VolumeInfo,
  type VolumeAvailability,
  type ParsedQuery,
} from './manga-search.js';

import {
  createEntitiesFromWikipedia,
  createEntitiesFromNCCardinal,
} from '../entities/integration.js';
import type { MediaType } from '../entities/types.js';

// ============================================================================
// Types
// ============================================================================

export type SearchProgressEvent =
  | { type: 'started'; query: string; parsedQuery: ParsedQuery }
  | { type: 'wikipedia:searching' }
  | { type: 'wikipedia:found'; seriesTitle: string; volumeCount: number }
  | { type: 'wikipedia:not-found'; fallback: 'nc-cardinal' }
  | { type: 'wikipedia:error'; message: string }
  | { type: 'nc-cardinal:searching' }
  | { type: 'nc-cardinal:found'; recordCount: number }
  | { type: 'availability:start'; total: number }
  | { type: 'availability:progress'; completed: number; total: number; foundInCatalog: number }
  | { type: 'availability:complete'; foundInCatalog: number; total: number }
  | { type: 'covers:start'; total: number }
  | { type: 'covers:progress'; completed: number; total: number }
  | { type: 'covers:complete' }
  | { type: 'complete'; result: SearchResult }
  | { type: 'error'; message: string };

export type ProgressCallback = (event: SearchProgressEvent) => void;

export interface StreamingSearchOptions {
  homeLibrary?: string | undefined;
  includeDebug?: boolean | undefined;
  onProgress: ProgressCallback;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getCoverImageUrl(isbn?: string, bookcoverUrl?: string): string | undefined {
  if (bookcoverUrl) return bookcoverUrl;
  if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  return undefined;
}

// ============================================================================
// Streaming Search Implementation
// ============================================================================

/**
 * Search for manga with streaming progress updates.
 * Emits progress events via the onProgress callback.
 */
export async function searchWithProgress(
  query: string,
  options: StreamingSearchOptions
): Promise<SearchResult> {
  const { homeLibrary, onProgress } = options;
  
  const parsedQuery = parseQuery(query);
  
  // Emit start event
  onProgress({ type: 'started', query, parsedQuery });
  
  const result: SearchResult = {
    query,
    parsedQuery,
    series: [],
    volumes: [],
  };
  
  // Step 1: Try Wikipedia
  onProgress({ type: 'wikipedia:searching' });
  
  let wikiSeries: WikiMangaSeries | null = null;
  let ncCardinalFallbackSeries: SeriesResult[] = [];
  
  try {
    wikiSeries = await getWikipediaSeries(parsedQuery.title);
    
    if (wikiSeries && wikiSeries.volumes.length > 0) {
      onProgress({
        type: 'wikipedia:found',
        seriesTitle: wikiSeries.title,
        volumeCount: wikiSeries.volumes.length,
      });
    } else {
      onProgress({ type: 'wikipedia:not-found', fallback: 'nc-cardinal' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    onProgress({ type: 'wikipedia:error', message });
    onProgress({ type: 'wikipedia:not-found', fallback: 'nc-cardinal' });
  }
  
  // Step 2: If Wikipedia failed, try NC Cardinal directly
  if (!wikiSeries || wikiSeries.volumes.length === 0) {
    onProgress({ type: 'nc-cardinal:searching' });
    
    try {
      const fallbackResults = await searchCatalog(parsedQuery.title, {
        searchClass: 'title',
        count: 60,
      });
      
      if (fallbackResults.records.length > 0) {
        onProgress({ type: 'nc-cardinal:found', recordCount: fallbackResults.records.length });
        ncCardinalFallbackSeries = buildMultipleSeriesFromRecords(
          parsedQuery.title,
          fallbackResults.records,
          homeLibrary
        );
      }
    } catch (error) {
      console.warn('[StreamingSearch] NC Cardinal fallback failed:', error);
    }
  }
  
  // Step 3: Get ISBNs for availability lookup
  const isbnsToCheck: string[] = [];
  
  if (wikiSeries && wikiSeries.volumes.length > 0) {
    for (const vol of wikiSeries.volumes) {
      if (vol.englishISBN) {
        isbnsToCheck.push(vol.englishISBN);
      }
    }
  }
  
  // Step 4: Check availability with progress
  const availability = new Map<string, VolumeAvailability>();
  
  if (isbnsToCheck.length > 0) {
    onProgress({ type: 'availability:start', total: isbnsToCheck.length });
    
    const BATCH_SIZE = 5;
    let completed = 0;
    let foundInCatalog = 0;
    
    for (let i = 0; i < isbnsToCheck.length; i += BATCH_SIZE) {
      const batch = isbnsToCheck.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (isbn) => {
          try {
            const record = await searchByISBNSingle(isbn);
            return { isbn, record };
          } catch {
            return { isbn, record: null };
          }
        })
      );
      
      // Process results
      for (const { isbn, record } of batchResults) {
        if (record) {
          foundInCatalog++;
          availability.set(isbn, getDetailedAvailabilitySummary(record, homeLibrary));
        } else {
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
        }
      }
      
      completed += batch.length;
      onProgress({
        type: 'availability:progress',
        completed,
        total: isbnsToCheck.length,
        foundInCatalog,
      });
    }
    
    onProgress({
      type: 'availability:complete',
      foundInCatalog,
      total: isbnsToCheck.length,
    });
  }
  
  // Step 5: Fetch cover images with progress
  if (isbnsToCheck.length > 0) {
    onProgress({ type: 'covers:start', total: isbnsToCheck.length });
    
    const bookcoverUrls = new Map<string, string>();
    const COVER_BATCH_SIZE = 5;
    let coversCompleted = 0;
    
    for (let i = 0; i < isbnsToCheck.length; i += COVER_BATCH_SIZE) {
      const batch = isbnsToCheck.slice(i, i + COVER_BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async (isbn) => {
          const url = await fetchBookcoverUrl(isbn);
          return { isbn, url };
        })
      );
      
      for (const { isbn, url } of batchResults) {
        if (url) {
          bookcoverUrls.set(isbn, url);
        }
      }
      
      coversCompleted += batch.length;
      onProgress({
        type: 'covers:progress',
        completed: coversCompleted,
        total: isbnsToCheck.length,
      });
    }
    
    onProgress({ type: 'covers:complete' });
    
    // Build final results with Wikipedia data
    if (wikiSeries && wikiSeries.volumes.length > 0) {
      const seriesResult = await buildSeriesResultFromWikipedia(wikiSeries, availability, bookcoverUrls);
      result.series.push(seriesResult);
      
      // Build volume results
      for (const vol of wikiSeries.volumes) {
        const volAvail = vol.englishISBN ? availability.get(vol.englishISBN) : undefined;
        const bookcoverCover = vol.englishISBN ? bookcoverUrls.get(vol.englishISBN) : undefined;
        result.volumes.push({
          title: `${wikiSeries.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
          volumeNumber: vol.volumeNumber,
          seriesTitle: wikiSeries.title,
          isbn: vol.englishISBN,
          coverImage: getCoverImageUrl(vol.englishISBN, bookcoverCover),
          availability: volAvail,
          source: 'wikipedia',
        });
      }
    }
  } else if (ncCardinalFallbackSeries.length > 0) {
    // Use NC Cardinal fallback
    const allIsbns = ncCardinalFallbackSeries.flatMap(s => 
      s.volumes?.map(v => v.isbn).filter((isbn): isbn is string => !!isbn) ?? []
    );
    
    if (allIsbns.length > 0) {
      onProgress({ type: 'covers:start', total: allIsbns.length });
      
      const bookcoverUrls = new Map<string, string>();
      let coversCompleted = 0;
      
      for (let i = 0; i < allIsbns.length; i += 5) {
        const batch = allIsbns.slice(i, i + 5);
        const batchResults = await Promise.all(
          batch.map(async (isbn) => {
            const url = await fetchBookcoverUrl(isbn);
            return { isbn, url };
          })
        );
        
        for (const { isbn, url } of batchResults) {
          if (url) bookcoverUrls.set(isbn, url);
        }
        
        coversCompleted += batch.length;
        onProgress({ type: 'covers:progress', completed: coversCompleted, total: allIsbns.length });
      }
      
      onProgress({ type: 'covers:complete' });
      
      // Add NC Cardinal series with covers - create entities first
      for (const ncSeries of ncCardinalFallbackSeries) {
        // Determine media type from title
        const ncMediaType: MediaType = ncSeries.title.toLowerCase().includes('light novel') 
          ? 'light-novel' 
          : ncSeries.title.toLowerCase().includes('manga') ? 'manga' : 'unknown';
        
        // Create entity to get stable ID
        const { series: entity } = await createEntitiesFromNCCardinal(
          ncSeries.title,
          ncSeries.volumes?.map(v => ({
            volumeNumber: v.volumeNumber,
            isbn: v.isbn,
            title: v.title,
          })) ?? [],
          ncMediaType
        );
        
        result.series.push({
          ...ncSeries,
          id: entity.id, // Use entity ID
          coverImage: bookcoverUrls.get(ncSeries.volumes?.[0]?.isbn ?? ''),
        });
        
        for (const vol of ncSeries.volumes ?? []) {
          const bookcoverCover = vol.isbn ? bookcoverUrls.get(vol.isbn) : undefined;
          result.volumes.push({
            title: vol.title ?? `${ncSeries.title}, Vol. ${vol.volumeNumber}`,
            volumeNumber: vol.volumeNumber,
            seriesTitle: ncSeries.title,
            isbn: vol.isbn,
            coverImage: getCoverImageUrl(vol.isbn, bookcoverCover),
            availability: vol.availability,
            source: 'nc-cardinal',
          });
        }
      }
    } else {
      onProgress({ type: 'covers:complete' });
      
      // No ISBNs to fetch covers for - still create entities
      for (const ncSeries of ncCardinalFallbackSeries) {
        // Determine media type from title
        const ncMediaType: MediaType = ncSeries.title.toLowerCase().includes('light novel') 
          ? 'light-novel' 
          : ncSeries.title.toLowerCase().includes('manga') ? 'manga' : 'unknown';
        
        // Create entity to get stable ID
        const { series: entity } = await createEntitiesFromNCCardinal(
          ncSeries.title,
          ncSeries.volumes?.map(v => ({
            volumeNumber: v.volumeNumber,
            isbn: v.isbn,
            title: v.title,
          })) ?? [],
          ncMediaType
        );
        
        result.series.push({
          ...ncSeries,
          id: entity.id, // Use entity ID
        });
        for (const vol of ncSeries.volumes ?? []) {
          result.volumes.push({
            title: vol.title ?? `${ncSeries.title}, Vol. ${vol.volumeNumber}`,
            volumeNumber: vol.volumeNumber,
            seriesTitle: ncSeries.title,
            isbn: vol.isbn,
            availability: vol.availability,
            source: 'nc-cardinal',
          });
        }
      }
    }
  }
  
  // Determine best match
  if (parsedQuery.volumeNumber) {
    const matchingVolume = result.volumes.find(v => v.volumeNumber === parsedQuery.volumeNumber);
    if (matchingVolume) {
      result.bestMatch = { type: 'volume', volume: matchingVolume };
    }
  } else if (result.series.length > 0) {
    result.bestMatch = { type: 'series', series: result.series[0] };
  }
  
  // Emit completion
  onProgress({ type: 'complete', result });
  
  return result;
}

// ============================================================================
// Helper functions (copied/adapted from manga-search.ts)
// ============================================================================

import { searchByISBN } from './opensearch-client.js';

async function searchByISBNSingle(isbn: string): Promise<CatalogRecord | null> {
  return searchByISBN(isbn);
}

async function buildSeriesResultFromWikipedia(
  wiki: WikiMangaSeries,
  availability: Map<string, VolumeAvailability>,
  bookcoverUrls: Map<string, string>
): Promise<SeriesResult> {
  // Create or update entities to get stable ID
  const { series: entity } = await createEntitiesFromWikipedia(wiki);
  
  let availableVolumes = 0;
  
  const firstVolumeIsbn = wiki.volumes[0]?.englishISBN;
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;

  const volumes: VolumeInfo[] = wiki.volumes.map(vol => {
    const volAvail = vol.englishISBN ? availability.get(vol.englishISBN) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    const bookcoverCover = vol.englishISBN ? bookcoverUrls.get(vol.englishISBN) : undefined;
    return {
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      isbn: vol.englishISBN,
      coverImage: getCoverImageUrl(vol.englishISBN, bookcoverCover),
      availability: volAvail,
    };
  });

  return {
    id: entity.id,
    title: wiki.title,
    totalVolumes: wiki.totalVolumes,
    availableVolumes,
    isComplete: wiki.isComplete,
    author: wiki.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover),
    source: 'wikipedia',
    volumes,
  };
}

function detectMediaType(title: string): 'manga' | 'light-novel' | 'unknown' {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('(manga)') || 
      titleLower.includes('[manga]') ||
      titleLower.includes('manga version') ||
      titleLower.includes('comic version')) {
    return 'manga';
  }
  
  if (titleLower.includes('light novel') ||
      titleLower.includes('(novel)') ||
      titleLower.includes('[novel]') ||
      titleLower.includes('(ln)')) {
    return 'light-novel';
  }
  
  return 'unknown';
}

function buildSingleSeriesFromRecords(
  seriesTitle: string,
  records: CatalogRecord[],
  mediaType: 'manga' | 'light-novel' | 'mixed',
  homeLibrary?: string | undefined
): SeriesResult | null {
  let cleanTitle = seriesTitle
    .replace(/\[manga\]/gi, '')
    .replace(/\(manga\)/gi, '')
    .replace(/\s+\/\s*$/, '')
    .replace(/\.$/, '')
    .trim();
  
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
  cleanTitle = cleanTitle.split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0 || !smallWords.has(lower)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return lower;
    })
    .join(' ');
  
  if (mediaType === 'manga' && !cleanTitle.toLowerCase().includes('manga')) {
    cleanTitle = `${cleanTitle} (Manga)`;
  } else if (mediaType === 'light-novel' && !cleanTitle.toLowerCase().includes('novel')) {
    cleanTitle = `${cleanTitle} (Light Novel)`;
  }
  
  const volumeRecords = new Map<number, CatalogRecord>();
  const isbnToRecord = new Map<string, CatalogRecord>();
  const recordsWithoutVolumeNumber: CatalogRecord[] = [];
  
  for (const record of records) {
    const titleLower = record.title.toLowerCase();
    const firstWord = seriesTitle.toLowerCase().split(' ')[0];
    if (!firstWord || !titleLower.includes(firstWord)) continue;
    
    const volMatch = record.volumeNumber 
      || record.title.match(/(?:vol\.?|v\.?|#)\s*(\d+)/i)?.[1]
      || record.title.match(/\.\s*(\d+)\s*$/)?.[1]
      || record.title.match(/part\s*(\d+)/i)?.[1];
    
    const volNum = volMatch ? parseInt(String(volMatch), 10) : undefined;
    
    if (volNum && volNum > 0 && volNum < 1000) {
      if (!volumeRecords.has(volNum) || record.isbns.length > (volumeRecords.get(volNum)?.isbns.length ?? 0)) {
        volumeRecords.set(volNum, record);
      }
    } else {
      recordsWithoutVolumeNumber.push(record);
      for (const isbn of record.isbns) {
        if (!isbnToRecord.has(isbn)) {
          isbnToRecord.set(isbn, record);
        }
      }
    }
  }
  
  if (volumeRecords.size === 0 && isbnToRecord.size > 0) {
    const uniqueRecords: CatalogRecord[] = [];
    const seenIsbns = new Set<string>();
    
    for (const record of recordsWithoutVolumeNumber) {
      const isbn13 = record.isbns.find(i => i.startsWith('978'));
      const isbn = isbn13 ?? record.isbns[0];
      if (isbn && !seenIsbns.has(isbn)) {
        seenIsbns.add(isbn);
        uniqueRecords.push(record);
      }
    }
    
    for (let i = 0; i < uniqueRecords.length; i++) {
      const record = uniqueRecords[i];
      if (record) {
        volumeRecords.set(i + 1, record);
      }
    }
  }
  
  if (volumeRecords.size === 0) return null;
  
  const availabilityMap = new Map<string, VolumeAvailability>();
  for (const [, record] of volumeRecords) {
    const isbn = record.isbns.find(i => i.startsWith('978')) ?? record.isbns[0];
    if (isbn) {
      availabilityMap.set(isbn, getDetailedAvailabilitySummary(record, homeLibrary));
    }
  }
  
  const volumeNums = Array.from(volumeRecords.keys()).sort((a, b) => a - b);
  const volumes: VolumeInfo[] = [];
  let availableCount = 0;
  
  for (const volNum of volumeNums) {
    const record = volumeRecords.get(volNum);
    if (!record) continue;
    
    const isbn = record.isbns.find(i => i.startsWith('978')) ?? record.isbns[0];
    const volAvail = isbn ? availabilityMap.get(isbn) : undefined;
    
    if (volAvail?.available) availableCount++;
    
    volumes.push({
      volumeNumber: volNum,
      title: `${cleanTitle}, Vol. ${volNum}`,
      isbn,
      availability: volAvail,
    });
  }
  
  // Return with temporary ID - will be replaced with entity ID by caller
  return {
    id: `temp-nc-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: cleanTitle,
    totalVolumes: volumes.length,
    availableVolumes: availableCount,
    isComplete: false,
    volumes,
    source: 'nc-cardinal',
  };
}

function buildMultipleSeriesFromRecords(
  seriesTitle: string,
  records: CatalogRecord[],
  homeLibrary?: string | undefined
): SeriesResult[] {
  const mangaRecords: CatalogRecord[] = [];
  const lightNovelRecords: CatalogRecord[] = [];
  const unknownRecords: CatalogRecord[] = [];
  
  for (const record of records) {
    const mediaType = detectMediaType(record.title);
    if (mediaType === 'manga') {
      mangaRecords.push(record);
    } else if (mediaType === 'light-novel') {
      lightNovelRecords.push(record);
    } else {
      unknownRecords.push(record);
    }
  }
  
  const results: SeriesResult[] = [];
  
  if (mangaRecords.length > 0) {
    const mangaSeries = buildSingleSeriesFromRecords(seriesTitle, mangaRecords, 'manga', homeLibrary);
    if (mangaSeries && mangaSeries.totalVolumes > 0) {
      results.push(mangaSeries);
    }
  }
  
  if (lightNovelRecords.length > 0) {
    const lnSeries = buildSingleSeriesFromRecords(seriesTitle, lightNovelRecords, 'light-novel', homeLibrary);
    if (lnSeries && lnSeries.totalVolumes > 0) {
      results.push(lnSeries);
    }
  }
  
  if (results.length === 0 && unknownRecords.length > 0) {
    const mixedSeries = buildSingleSeriesFromRecords(seriesTitle, unknownRecords, 'mixed', homeLibrary);
    if (mixedSeries && mixedSeries.totalVolumes > 0) {
      results.push(mixedSeries);
    }
  }
  
  return results;
}
