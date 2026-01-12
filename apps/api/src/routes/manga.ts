/**
 * Manga Routes
 *
 * API endpoints for searching manga and checking library availability:
 * - GET /manga/search?q=query - Search for series and volumes
 * - GET /manga/series/:slug - Get detailed series info with all volumes
 * - GET /manga/books/:isbn - Get info about a specific book by ISBN
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  search,
  getSeriesDetails,
  parseQuery,
  type SearchResult,
  type SeriesDetails,
  type VolumeAvailability,
} from '../scripts/manga-search.js';

import {
  searchByISBN,
  NC_CARDINAL_LIBRARIES,
  getCatalogUrl,
  getDetailedAvailabilitySummary,
  type CatalogRecord,
} from '../scripts/opensearch-client.js';

import {
  searchByISBN as searchGoogleBooksByISBN,
} from '../scripts/google-books-client.js';

// ============================================================================
// Zod Schemas
// ============================================================================

const VolumeAvailabilitySchema = z.object({
  available: z.boolean(),
  notInCatalog: z.boolean().optional(),
  totalCopies: z.number(),
  availableCopies: z.number(),
  checkedOutCopies: z.number(),
  inTransitCopies: z.number(),
  onOrderCopies: z.number(),
  onHoldCopies: z.number(),
  unavailableCopies: z.number(),
  libraries: z.array(z.string()),
  // Local vs remote breakdown
  localCopies: z.number().optional(),
  localAvailable: z.number().optional(),
  remoteCopies: z.number().optional(),
  remoteAvailable: z.number().optional(),
  catalogUrl: z.string().optional(),
});

const VolumeInfoSchema = z.object({
  volumeNumber: z.number(),
  title: z.string().optional(),
  isbn: z.string().optional(),
  coverImage: z.string().optional(),
  availability: VolumeAvailabilitySchema.optional(),
});

const DebugInfoSchema = z.object({
  sources: z.array(z.string()),
  timing: z.object({
    total: z.number(),
    wikipedia: z.number().optional(),
    googleBooks: z.number().optional(),
    ncCardinal: z.number().optional(),
  }),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  cacheHits: z.array(z.string()),
});

const SeriesResultSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  totalVolumes: z.number(),
  availableVolumes: z.number(),
  isComplete: z.boolean(),
  author: z.string().optional(),
  coverImage: z.string().optional(),
  source: z.enum(['wikipedia', 'google-books']),
  volumes: z.array(VolumeInfoSchema).optional(),
});

const VolumeResultSchema = z.object({
  title: z.string(),
  volumeNumber: z.number().optional(),
  seriesTitle: z.string().optional(),
  isbn: z.string().optional(),
  coverImage: z.string().optional(),
  availability: VolumeAvailabilitySchema.optional(),
  source: z.enum(['wikipedia', 'google-books', 'nc-cardinal']),
});

const ParsedQuerySchema = z.object({
  originalQuery: z.string(),
  title: z.string(),
  volumeNumber: z.number().optional(),
});

const BestMatchSchema = z.object({
  type: z.enum(['series', 'volume']),
  series: SeriesResultSchema.optional(),
  volume: VolumeResultSchema.optional(),
});

const SearchResultSchema = z.object({
  query: z.string(),
  parsedQuery: ParsedQuerySchema,
  series: z.array(SeriesResultSchema),
  volumes: z.array(VolumeResultSchema),
  bestMatch: BestMatchSchema.optional(),
  _debug: DebugInfoSchema.optional(),
});

const SeriesDetailsSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  totalVolumes: z.number(),
  coverImage: z.string().optional(),
  isComplete: z.boolean(),
  author: z.string().optional(),
  volumes: z.array(VolumeInfoSchema),
  availableCount: z.number(),
  missingVolumes: z.array(z.number()),
  relatedSeries: z.array(z.string()).optional(),
  _debug: DebugInfoSchema.optional(),
});

const CopyStatusCategorySchema = z.enum([
  'available',
  'checked_out',
  'in_transit',
  'on_order',
  'on_hold',
  'unavailable',
]);

const HoldingSchema = z.object({
  libraryCode: z.string(),
  libraryName: z.string(),
  location: z.string(),
  callNumber: z.string(),
  status: z.string(),
  statusCategory: CopyStatusCategorySchema,
  barcode: z.string().optional(),
  available: z.boolean(),
});

const BookAvailabilitySchema = z.object({
  // Overall status
  available: z.boolean(),
  notInCatalog: z.boolean().optional(),
  
  // Copy counts by status
  totalCopies: z.number(),
  availableCopies: z.number(),
  checkedOutCopies: z.number(),
  inTransitCopies: z.number(),
  onOrderCopies: z.number(),
  onHoldCopies: z.number(),
  unavailableCopies: z.number(),
  
  // Libraries with available copies
  libraries: z.array(z.string()),
  
  // Local vs remote breakdown
  localCopies: z.number().optional(),
  localAvailable: z.number().optional(),
  remoteCopies: z.number().optional(),
  remoteAvailable: z.number().optional(),
});

// Library info schema
const LibrarySchema = z.object({
  code: z.string(),
  name: z.string(),
});

const LibrariesResponseSchema = z.object({
  libraries: z.array(LibrarySchema),
  defaultLibrary: z.string(),
});

const BookDetailsSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  isbns: z.array(z.string()),
  subjects: z.array(z.string()),
  summary: z.string().optional(),
  coverImage: z.string().optional(),
  holdings: z.array(HoldingSchema),
  availability: BookAvailabilitySchema,
  // Series info if we can determine it
  seriesInfo: z.object({
    title: z.string(),
    volumeNumber: z.number().optional(),
  }).optional(),
  // Link to library catalog
  catalogUrl: z.string().optional(),
});

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export const mangaRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * GET /manga/libraries
   *
   * Get list of available libraries for home library selection.
   */
  app.get(
    '/libraries',
    {
      schema: {
        response: {
          200: LibrariesResponseSchema,
        },
      },
    },
    async () => {
      return {
        libraries: [...NC_CARDINAL_LIBRARIES],
        defaultLibrary: 'HIGH_POINT_MAIN',
      };
    }
  );

  /**
   * GET /manga/search?q=query&debug=true&homeLibrary=HIGH_POINT_MAIN
   *
   * Search for manga series and volumes.
   * Handles typos, romanized names, and volume-specific queries.
   *
   * Query params:
   *   q: Search query (required)
   *   debug: Include debug info (optional, default: false)
   *   homeLibrary: Library code for local/remote availability breakdown (optional)
   *
   * Examples:
   *   /manga/search?q=demon%20slayer
   *   /manga/search?q=demon%20slayer%2012&debug=true&homeLibrary=HIGH_POINT_MAIN
   */
  app.get(
    '/search',
    {
      schema: {
        querystring: z.object({
          q: z.string().min(1).describe('Search query'),
          debug: z.enum(['true', 'false']).optional().describe('Include debug info'),
          homeLibrary: z.string().optional().describe('Home library code for local/remote breakdown'),
        }),
        response: {
          200: SearchResultSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { q, debug, homeLibrary } = request.query;
      const includeDebug = debug === 'true';

      try {
        const result = await search(q, { includeDebug, homeLibrary });
        return result;
      } catch (error) {
        request.log.error(error, 'Search failed');
        return reply.status(500).send({
          error: 'search_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /manga/series/:slug?debug=true
   *
   * Get detailed series information with all volumes and availability.
   * The slug can be a URL-encoded series title or series ID (wiki-12345).
   *
   * Query params:
   *   debug: Include debug info (optional, default: false)
   *
   * Examples:
   *   /manga/series/demon%20slayer
   *   /manga/series/demon-slayer-kimetsu-no-yaiba?debug=true
   */
  app.get(
    '/series/:slug',
    {
      schema: {
        params: z.object({
          slug: z.string().min(1).describe('Series title or slug'),
        }),
        querystring: z.object({
          debug: z.enum(['true', 'false']).optional().describe('Include debug info'),
        }),
        response: {
          200: SeriesDetailsSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { debug } = request.query;
      const includeDebug = debug === 'true';
      
      // Decode the slug - it could be URL-encoded title or a slug
      const seriesTitle = decodeURIComponent(slug).replace(/-/g, ' ');

      try {
        const details = await getSeriesDetails(seriesTitle, { includeDebug });

        if (!details) {
          return reply.status(404).send({
            error: 'series_not_found',
            message: `Series "${seriesTitle}" not found`,
          });
        }

        return details;
      } catch (error) {
        request.log.error(error, 'Series lookup failed');
        return reply.status(500).send({
          error: 'series_lookup_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /manga/books/:isbn/:slug?
   *
   * Get detailed information about a specific book by ISBN.
   * The optional slug is for SEO-friendly URLs and is ignored.
   * Returns holdings across all NC Cardinal libraries.
   *
   * Query params:
   *   homeLibrary: Library code for local/remote availability breakdown (optional)
   *
   * Examples:
   *   /manga/books/9781974700523
   *   /manga/books/9781974700523?homeLibrary=HIGH_POINT_MAIN
   */
  app.get(
    '/books/:isbn',
    {
      schema: {
        params: z.object({
          isbn: z.string().min(10).max(17).describe('ISBN-10 or ISBN-13'),
        }),
        querystring: z.object({
          homeLibrary: z.string().optional().describe('Home library code for local/remote breakdown'),
        }),
        response: {
          200: BookDetailsSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { isbn } = request.params;
      const { homeLibrary } = request.query;
      const cleanISBN = isbn.replace(/[-\s]/g, '');

      try {
        // Fetch NC Cardinal record and Google Books cover in parallel
        const [record, googleBook] = await Promise.all([
          searchByISBN(cleanISBN),
          searchGoogleBooksByISBN(cleanISBN).catch(() => null),
        ]);
        
        // Prefer Google Books cover, fall back to OpenLibrary
        // (Bookcover API is used for series, but too slow for individual book lookups)
        const googleCover = googleBook?.thumbnail?.replace('zoom=1', 'zoom=2').replace('&edge=curl', '');
        const coverImage = googleCover ?? `https://covers.openlibrary.org/b/isbn/${cleanISBN}-M.jpg`;

        if (!record) {
          // Book not in NC Cardinal catalog - return minimal info
          // This allows the UI to still display something useful
          return {
            id: `isbn-${cleanISBN}`,
            title: `Book (ISBN: ${cleanISBN})`,
            authors: [],
            isbns: [cleanISBN],
            subjects: [],
            coverImage,
            holdings: [],
            availability: {
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
            },
            seriesInfo: undefined,
            catalogUrl: undefined,
          };
        }

        // Calculate detailed availability summary with local/remote breakdown
        const availability = getDetailedAvailabilitySummary(record, homeLibrary);

        // Try to extract series info from title
        const seriesInfo = extractSeriesInfo(record.title);

        return {
          id: record.id,
          title: record.title,
          authors: record.authors,
          isbns: record.isbns,
          subjects: record.subjects,
          summary: record.summary,
          coverImage,
          holdings: record.holdings,
          availability,
          seriesInfo,
          catalogUrl: getCatalogUrl(record.id),
        };
      } catch (error) {
        request.log.error(error, 'Book lookup failed');
        return reply.status(500).send({
          error: 'book_lookup_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
  
  /**
   * GET /manga/books/:isbn/:slug
   *
   * SEO-friendly URL format. Slug is ignored, only ISBN is used.
   * Redirects or returns same data as /manga/books/:isbn
   */
  app.get(
    '/books/:isbn/:slug',
    {
      schema: {
        params: z.object({
          isbn: z.string().min(10).max(17).describe('ISBN-10 or ISBN-13'),
          slug: z.string().describe('URL-friendly slug (ignored)'),
        }),
        querystring: z.object({
          homeLibrary: z.string().optional().describe('Home library code for local/remote breakdown'),
        }),
        response: {
          200: BookDetailsSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      // Forward to the main books handler by reusing the same logic
      const { isbn } = request.params;
      const { homeLibrary } = request.query;
      const cleanISBN = isbn.replace(/[-\s]/g, '');

      try {
        // Fetch NC Cardinal record and Google Books cover in parallel
        const [record, googleBook] = await Promise.all([
          searchByISBN(cleanISBN),
          searchGoogleBooksByISBN(cleanISBN).catch(() => null),
        ]);
        
        // Prefer Google Books cover, fall back to OpenLibrary
        // (Bookcover API is used for series, but too slow for individual book lookups)
        const googleCover = googleBook?.thumbnail?.replace('zoom=1', 'zoom=2').replace('&edge=curl', '');
        const coverImage = googleCover ?? `https://covers.openlibrary.org/b/isbn/${cleanISBN}-M.jpg`;

        if (!record) {
          // Book not in NC Cardinal catalog - return minimal info
          return {
            id: `isbn-${cleanISBN}`,
            title: `Book (ISBN: ${cleanISBN})`,
            authors: [],
            isbns: [cleanISBN],
            subjects: [],
            coverImage,
            holdings: [],
            availability: {
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
            },
            seriesInfo: undefined,
            catalogUrl: undefined,
          };
        }

        // Calculate detailed availability summary with local/remote breakdown
        const availability = getDetailedAvailabilitySummary(record, homeLibrary);
        const seriesInfo = extractSeriesInfo(record.title);

        return {
          id: record.id,
          title: record.title,
          authors: record.authors,
          isbns: record.isbns,
          subjects: record.subjects,
          summary: record.summary,
          coverImage,
          holdings: record.holdings,
          availability,
          seriesInfo,
          catalogUrl: getCatalogUrl(record.id),
        };
      } catch (error) {
        request.log.error(error, 'Book lookup failed');
        return reply.status(500).send({
          error: 'book_lookup_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
};

// ============================================================================
// Helper Functions
// ============================================================================

import type { HoldingInfo } from '../scripts/opensearch-client.js';

/**
 * Calculate detailed availability counts from holdings
 */
function calculateAvailability(holdings: HoldingInfo[]): {
  available: boolean;
  totalCopies: number;
  availableCopies: number;
  checkedOutCopies: number;
  inTransitCopies: number;
  onOrderCopies: number;
  onHoldCopies: number;
  unavailableCopies: number;
  libraries: string[];
} {
  const counts = {
    available: 0,
    checked_out: 0,
    in_transit: 0,
    on_order: 0,
    on_hold: 0,
    unavailable: 0,
  };
  
  const availableLibraries = new Set<string>();
  
  for (const holding of holdings) {
    counts[holding.statusCategory]++;
    if (holding.statusCategory === 'available') {
      availableLibraries.add(holding.libraryName);
    }
  }
  
  return {
    available: counts.available > 0,
    totalCopies: holdings.length,
    availableCopies: counts.available,
    checkedOutCopies: counts.checked_out,
    inTransitCopies: counts.in_transit,
    onOrderCopies: counts.on_order,
    onHoldCopies: counts.on_hold,
    unavailableCopies: counts.unavailable,
    libraries: [...availableLibraries],
  };
}

/**
 * Extract series info from a book title
 * Examples:
 *   "Demon slayer: kimetsu no yaiba. 12" -> { title: "Demon slayer: kimetsu no yaiba", volumeNumber: 12 }
 *   "One Piece, Vol. 100" -> { title: "One Piece", volumeNumber: 100 }
 */
function extractSeriesInfo(title: string): { title: string; volumeNumber?: number } | undefined {
  // Common patterns for manga volume titles
  const patterns = [
    // "Title, Vol. 12" or "Title Vol 12"
    /^(.+?),?\s*(?:vol\.?|volume)\s*(\d+)/i,
    // "Title. 12" (common in library records)
    /^(.+?)\.\s*(\d+)\s*$/,
    // "Title #12"
    /^(.+?)\s*#(\d+)/i,
    // "Title v12"
    /^(.+?)\s*v(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1] && match?.[2]) {
      const volumeNumber = parseInt(match[2], 10);
      if (volumeNumber > 0 && volumeNumber < 1000) {
        return {
          title: match[1].trim().replace(/[.,:]$/, '').trim(),
          volumeNumber,
        };
      }
    }
  }

  // No volume number found, return just the title cleaned up
  const cleanTitle = title.replace(/\[manga\]/gi, '').replace(/\s+/g, ' ').trim();
  if (cleanTitle.length > 0) {
    return { title: cleanTitle };
  }

  return undefined;
}
