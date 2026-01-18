/**
 * Streaming Manga Search Service
 *
 * Wraps the manga search logic to emit progress events via a callback.
 * Used by the SSE endpoint to stream search progress to clients.
 */

import {
  getSeries as getWikipediaSeries,
  type WikiSeries,
} from './wikipedia-client.js';

import {
  searchCatalog,
  getDetailedAvailabilitySummary,
  type CatalogRecord,
} from './opensearch-client.js';

import {
  parseQuery,
  fetchBookcoverUrl,
  fetchGoogleBooksCoverUrl,
  buildRelatedSeriesResult,
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

function getCoverImageUrl(isbn?: string, bookcoverUrl?: string, googleBooksUrl?: string): string | undefined {
  // Priority 1: Bookcover API
  if (bookcoverUrl) return bookcoverUrl;
  // Priority 2: Google Books (with placeholder detection)
  if (googleBooksUrl) return googleBooksUrl;
  // Priority 3: OpenLibrary fallback (frontend handles placeholder detection)
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
  
  let wikiSeries: WikiSeries | null = null;
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
        ncCardinalFallbackSeries = await buildMultipleSeriesFromRecords(
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
    
    // First pass: Bookcover API
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
    
    // Second pass: Google Books for missing covers
    const missingCoverIsbns = isbnsToCheck.filter(isbn => !bookcoverUrls.has(isbn));
    const googleBooksUrls = new Map<string, string>();
    
    if (missingCoverIsbns.length > 0) {
      for (let i = 0; i < missingCoverIsbns.length; i += COVER_BATCH_SIZE) {
        const batch = missingCoverIsbns.slice(i, i + COVER_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (isbn) => {
            const url = await fetchGoogleBooksCoverUrl(isbn);
            return { isbn, url };
          })
        );
        for (const { isbn, url } of batchResults) {
          if (url) googleBooksUrls.set(isbn, url);
        }
      }
    }
    
    onProgress({ type: 'covers:complete' });
    
    // Build final results with Wikipedia data
    if (wikiSeries && wikiSeries.volumes.length > 0) {
      const seriesResult = await buildSeriesResultFromWikipedia(wikiSeries, availability, bookcoverUrls, googleBooksUrls);
      result.series.push(seriesResult);
      
      // Build volume results (use seriesResult.volumes which have IDs)
      for (const vol of seriesResult.volumes ?? []) {
        result.volumes.push({
          id: vol.id,
          title: `${wikiSeries.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
          volumeNumber: vol.volumeNumber,
          seriesTitle: wikiSeries.title,
          isbn: vol.primaryIsbn,
          coverImage: vol.coverImage,
          availability: vol.availability,
          source: 'wikipedia',
        });
      }
      
      // Process related series (adaptations, spin-offs, etc.)
      if (wikiSeries.relatedSeries && wikiSeries.relatedSeries.length > 0) {
        for (const related of wikiSeries.relatedSeries) {
          // Get availability for related series volumes
          const relatedIsbns = related.volumes
            .map(v => v.englishISBN)
            .filter((isbn): isbn is string => !!isbn);
          
          // Fetch availability for related series ISBNs not already fetched
          for (const isbn of relatedIsbns) {
            if (!availability.has(isbn)) {
              const record = await searchByISBNSingle(isbn);
              if (record) {
                const volAvail = getDetailedAvailabilitySummary(record, homeLibrary);
                availability.set(isbn, volAvail);
              }
            }
          }
          
          // Build series result using title-based entity ID (not Wikipedia ID)
          const relatedSeriesResult = await buildRelatedSeriesResult(
            related,
            wikiSeries.title,
            wikiSeries.author,
            availability, 
            bookcoverUrls,
            googleBooksUrls
          );
          result.series.push(relatedSeriesResult);
          
          // Build volume results for related series (use relatedSeriesResult.volumes which have IDs)
          for (const vol of relatedSeriesResult.volumes ?? []) {
            result.volumes.push({
              id: vol.id,
              title: `${relatedSeriesResult.title}, Vol. ${vol.volumeNumber}${vol.title ? `: ${vol.title}` : ''}`,
              volumeNumber: vol.volumeNumber,
              seriesTitle: relatedSeriesResult.title,
              isbn: vol.primaryIsbn,
              coverImage: vol.coverImage,
              availability: vol.availability,
              source: 'wikipedia',
            });
          }
        }
      }
    }
  } else if (ncCardinalFallbackSeries.length > 0) {
    // Use NC Cardinal fallback
    const allIsbns = ncCardinalFallbackSeries.flatMap(s => 
      s.volumes?.map(v => v.primaryIsbn).filter((isbn): isbn is string => !!isbn) ?? []
    );
    
    if (allIsbns.length > 0) {
      onProgress({ type: 'covers:start', total: allIsbns.length });
      
      const bookcoverUrls = new Map<string, string>();
      let coversCompleted = 0;
      
      // First pass: Bookcover API
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
      
      // Second pass: Google Books for missing covers
      const missingIsbns = allIsbns.filter(isbn => !bookcoverUrls.has(isbn));
      const googleBooksUrls = new Map<string, string>();
      if (missingIsbns.length > 0) {
        for (let i = 0; i < missingIsbns.length; i += 5) {
          const batch = missingIsbns.slice(i, i + 5);
          const batchResults = await Promise.all(
            batch.map(async (isbn) => {
              const url = await fetchGoogleBooksCoverUrl(isbn);
              return { isbn, url };
            })
          );
          for (const { isbn, url } of batchResults) {
            if (url) googleBooksUrls.set(isbn, url);
          }
        }
      }
      
      onProgress({ type: 'covers:complete' });
      
      // Add NC Cardinal series with covers - create entities first
      for (const ncSeries of ncCardinalFallbackSeries) {
        // Determine media type from title
        const ncMediaType: MediaType = ncSeries.title.toLowerCase().includes('light novel') 
          ? 'light_novel' 
          : ncSeries.title.toLowerCase().includes('manga') ? 'manga' : 'unknown';
        
        // Create entity to get stable ID
        const { series: entity } = await createEntitiesFromNCCardinal(
          ncSeries.title,
          ncSeries.volumes?.map(v => ({
            volumeNumber: v.volumeNumber,
            isbn: v.primaryIsbn,
            title: v.title,
          })) ?? [],
          ncMediaType
        );
        
        const firstIsbn = ncSeries.volumes?.[0]?.primaryIsbn ?? '';
        
        // Build volumes with cover images
        const volumesWithCovers: VolumeInfo[] = (ncSeries.volumes ?? []).map(vol => {
          const bookcoverCover = vol.primaryIsbn ? bookcoverUrls.get(vol.primaryIsbn) : undefined;
          const googleBooksCover = vol.primaryIsbn ? googleBooksUrls.get(vol.primaryIsbn) : undefined;
          return {
            ...vol,
            coverImage: getCoverImageUrl(vol.primaryIsbn, bookcoverCover, googleBooksCover),
          };
        });
        
        result.series.push({
          ...ncSeries,
          id: entity.id, // Use entity ID
          coverImage: getCoverImageUrl(firstIsbn, bookcoverUrls.get(firstIsbn), googleBooksUrls.get(firstIsbn)),
          volumes: volumesWithCovers,
        });
        
        for (const vol of volumesWithCovers) {
          result.volumes.push({
            id: vol.id,
            title: vol.title ?? `${ncSeries.title}, Vol. ${vol.volumeNumber}`,
            volumeNumber: vol.volumeNumber,
            seriesTitle: ncSeries.title,
            isbn: vol.primaryIsbn,
            coverImage: vol.coverImage,
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
          ? 'light_novel' 
          : ncSeries.title.toLowerCase().includes('manga') ? 'manga' : 'unknown';
        
        // Create entity to get stable ID
        const { series: entity } = await createEntitiesFromNCCardinal(
          ncSeries.title,
          ncSeries.volumes?.map(v => ({
            volumeNumber: v.volumeNumber,
            isbn: v.primaryIsbn,
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
            id: vol.id,
            title: vol.title ?? `${ncSeries.title}, Vol. ${vol.volumeNumber}`,
            volumeNumber: vol.volumeNumber,
            seriesTitle: ncSeries.title,
            isbn: vol.primaryIsbn,
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
  wiki: WikiSeries,
  availability: Map<string, VolumeAvailability>,
  bookcoverUrls: Map<string, string>,
  googleBooksUrls: Map<string, string> = new Map()
): Promise<SeriesResult> {
  // Create or update entities to get stable ID
  const { series: entity, volumes: entityVolumes } = await createEntitiesFromWikipedia(wiki);
  
  let availableVolumes = 0;
  
  const firstVolumeIsbn = wiki.volumes[0]?.englishISBN;
  const firstVolBookcover = firstVolumeIsbn ? bookcoverUrls.get(firstVolumeIsbn) : undefined;
  const firstVolGoogleBooks = firstVolumeIsbn ? googleBooksUrls.get(firstVolumeIsbn) : undefined;

  const volumes: VolumeInfo[] = entityVolumes.map(vol => {
    const primaryIsbn = vol.editions.find(e => e.language === 'en' && e.format === 'physical')?.isbn;
    const volAvail = primaryIsbn ? availability.get(primaryIsbn) : undefined;
    if (volAvail?.available) {
      availableVolumes++;
    }
    const bookcoverCover = primaryIsbn ? bookcoverUrls.get(primaryIsbn) : undefined;
    const googleBooksCover = primaryIsbn ? googleBooksUrls.get(primaryIsbn) : undefined;
    return {
      id: vol.id,
      volumeNumber: vol.volumeNumber,
      title: vol.title,
      editions: vol.editions,
      primaryIsbn,
      coverImage: getCoverImageUrl(primaryIsbn, bookcoverCover, googleBooksCover),
      availability: volAvail,
    };
  });

  return {
    id: entity.id,
    title: wiki.title,
    totalVolumes: entityVolumes.length,
    availableVolumes,
    isComplete: wiki.isComplete,
    author: wiki.author,
    coverImage: getCoverImageUrl(firstVolumeIsbn, firstVolBookcover, firstVolGoogleBooks),
    source: 'wikipedia',
    volumes,
    mediaType: wiki.mediaType,
  };
}

function detectMediaTypeFromTitle(title: string): 'manga' | 'light_novel' | 'unknown' {
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
    return 'light_novel';
  }
  
  return 'unknown';
}

async function buildSingleSeriesFromRecords(
  seriesTitle: string,
  records: CatalogRecord[],
  mediaType: 'manga' | 'light_novel' | 'mixed',
  homeLibrary?: string | undefined
): Promise<SeriesResult | null> {
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
  } else if (mediaType === 'light_novel' && !cleanTitle.toLowerCase().includes('novel')) {
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
  
  // Build preliminary volume data
  interface PreliminaryVolume {
    volumeNumber: number;
    title: string;
    editions: Array<{ isbn: string; format: 'physical'; language: 'en' }>;
    primaryIsbn: string | undefined;
    availability: VolumeAvailability | undefined;
  }
  const volumeNums = Array.from(volumeRecords.keys()).sort((a, b) => a - b);
  const preliminaryVolumes: PreliminaryVolume[] = [];
  let availableCount = 0;
  
  for (const volNum of volumeNums) {
    const record = volumeRecords.get(volNum);
    if (!record) continue;
    
    const isbn = record.isbns.find(i => i.startsWith('978')) ?? record.isbns[0];
    const volAvail = isbn ? availabilityMap.get(isbn) : undefined;
    
    if (volAvail?.available) availableCount++;
    
    // Build editions array (NC Cardinal only knows about English physical)
    const editions: Array<{ isbn: string; format: 'physical'; language: 'en' }> = isbn ? [{
      isbn,
      format: 'physical',
      language: 'en',
    }] : [];
    
    preliminaryVolumes.push({
      volumeNumber: volNum,
      title: `${cleanTitle}, Vol. ${volNum}`,
      editions,
      primaryIsbn: isbn,
      availability: volAvail,
    });
  }
  
  // Create entities in the store to get proper IDs
  const entityMediaType = mediaType === 'mixed' ? 'unknown' as MediaType : mediaType as MediaType;
  const { series: entity, volumes: entityVolumes } = await createEntitiesFromNCCardinal(
    cleanTitle,
    preliminaryVolumes.map(v => ({
      volumeNumber: v.volumeNumber,
      isbn: v.primaryIsbn,
      title: v.title,
    })),
    entityMediaType
  );
  
  // Map entity IDs to volume info
  const volumes: VolumeInfo[] = preliminaryVolumes.map(vol => {
    const entityVolume = entityVolumes.find(ev => ev.volumeNumber === vol.volumeNumber);
    return {
      ...vol,
      id: entityVolume?.id ?? `tmp-${vol.volumeNumber}`,
    };
  });
  
  return {
    id: entity.id,
    title: cleanTitle,
    totalVolumes: volumes.length,
    availableVolumes: availableCount,
    isComplete: false,
    volumes,
    source: 'nc-cardinal',
  };
}

async function buildMultipleSeriesFromRecords(
  seriesTitle: string,
  records: CatalogRecord[],
  homeLibrary?: string | undefined
): Promise<SeriesResult[]> {
  const mangaRecords: CatalogRecord[] = [];
  const lightNovelRecords: CatalogRecord[] = [];
  const unknownRecords: CatalogRecord[] = [];
  
  for (const record of records) {
    const mediaType = detectMediaTypeFromTitle(record.title);
    if (mediaType === 'manga') {
      mangaRecords.push(record);
    } else if (mediaType === 'light_novel') {
      lightNovelRecords.push(record);
    } else {
      unknownRecords.push(record);
    }
  }
  
  const results: SeriesResult[] = [];
  
  if (mangaRecords.length > 0) {
    const mangaSeries = await buildSingleSeriesFromRecords(seriesTitle, mangaRecords, 'manga', homeLibrary);
    if (mangaSeries && mangaSeries.totalVolumes > 0) {
      results.push(mangaSeries);
    }
  }
  
  if (lightNovelRecords.length > 0) {
    const lnSeries = await buildSingleSeriesFromRecords(seriesTitle, lightNovelRecords, 'light_novel', homeLibrary);
    if (lnSeries && lnSeries.totalVolumes > 0) {
      results.push(lnSeries);
    }
  }
  
  if (results.length === 0 && unknownRecords.length > 0) {
    const mixedSeries = await buildSingleSeriesFromRecords(seriesTitle, unknownRecords, 'mixed', homeLibrary);
    if (mixedSeries && mixedSeries.totalVolumes > 0) {
      results.push(mixedSeries);
    }
  }
  
  return results;
}
