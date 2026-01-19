/**
 * Manga Routes
 *
 * API endpoints for searching manga and checking library availability:
 * - GET /manga/search?q=query - Search for series and volumes
 * - GET /manga/series/:slug - Get detailed series info with all volumes
 * - GET /manga/volumes/:id - Get info about a specific volume by entity ID
 * - GET /manga/books/:isbn - Get info about a specific book by ISBN (legacy)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  search,
  getSeriesDetails,
  parseQuery,
  fetchBookcoverUrl,
  fetchGoogleBooksCoverUrl,
  type SearchResult,
  type SeriesDetails,
  type VolumeAvailability,
} from '../scripts/manga-search.js';

import {
  searchWithProgress,
  type SearchProgressEvent,
} from '../scripts/manga-search-streaming.js';

import {
  searchByISBN,
  NC_CARDINAL_LIBRARIES,
  getCatalogUrl,
  getDetailedAvailabilitySummary,
  type CatalogRecord,
} from '../scripts/opensearch-client.js';

// Google Books for descriptions
import { getDescriptionByISBN, extractUniqueVolumeDescription, findCommonPreamble } from '../scripts/google-books-client.js';

// Series description management
import { updateSeriesDescription } from '../entities/series.js';

import {
  getAllCacheStats,
  clearAllCaches,
  clearCacheType,
  clearCacheForISBN,
  clearCacheForSeries,
  clearCacheForSearch,
  type CacheType,
} from '../scripts/cache-utils.js';

import {
  getSeriesEntity,
  getVolumeEntity,
  getVolumeById,
  getSeriesById,
  getVolumesBySeriesId,
  getVolumeEditionData,
} from '../entities/index.js';

import {
  login,
  logout,
  getCheckouts,
  getHistory,
  getHolds,
  isSessionValid,
  isHistoryEnabled,
  getSession,
  type PatronSession,
  type CheckedOutItem,
  type HistoryItem,
  type HoldItem,
} from '../scripts/patron-client.js';

import {
  getPopularManga,
  getSuggestions,
  type SuggestionItem,
} from '../scripts/anilist-client.js';

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

const EditionSchema = z.object({
  isbn: z.string(),
  format: z.enum(['digital', 'physical']),
  language: z.enum(['ja', 'en']),
  releaseDate: z.string().optional(),
});

const VolumeInfoSchema = z.object({
  id: z.string(),  // Volume entity ID (required)
  volumeNumber: z.number(),
  title: z.string().optional(),
  editions: z.array(EditionSchema),
  primaryIsbn: z.string().optional(),  // First English physical ISBN for library lookups
  coverImage: z.string().optional(),
  availability: VolumeAvailabilitySchema.optional(),
});

const SourceSummarySchema = z.object({
  wikipedia: z.object({
    found: z.boolean(),
    volumeCount: z.number().optional(),
    seriesTitle: z.string().optional(),
    error: z.string().optional(),
  }).optional(),
  googleBooks: z.object({
    found: z.boolean(),
    totalItems: z.number().optional(),
    volumesReturned: z.number().optional(),
    volumesWithSeriesId: z.number().optional(),
    seriesCount: z.number().optional(),
    error: z.string().optional(),
  }).optional(),
  ncCardinal: z.object({
    found: z.boolean(),
    recordCount: z.number().optional(),
    volumesExtracted: z.number().optional(),
    error: z.string().optional(),
  }).optional(),
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
  log: z.array(z.string()),
  dataIssues: z.array(z.string()),
  sourceSummary: SourceSummarySchema,
});

const MediaTypeSchema = z.enum(['manga', 'light_novel', 'unknown']);
const SeriesRelationshipSchema = z.enum(['adaptation', 'spinoff', 'sequel', 'side_story', 'anthology', 'prequel']);

const SeriesResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  totalVolumes: z.number(),
  availableVolumes: z.number(),
  isComplete: z.boolean(),
  author: z.string().optional(),
  coverImage: z.string().optional(),
  source: z.enum(['wikipedia', 'google-books', 'nc-cardinal']),
  volumes: z.array(VolumeInfoSchema).optional(),
  mediaType: MediaTypeSchema.optional(),
  relationship: SeriesRelationshipSchema.optional(),
});

const VolumeResultSchema = z.object({
  id: z.string(),  // Volume entity ID (required)
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
  title: z.string(),
  description: z.string().nullish(),  // Series description/preamble from Vol 1
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
  // Series info from entity store or extracted from title
  seriesInfo: z.object({
    id: z.string().optional(), // Entity ID for navigation
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

// Cache-related schemas
const CacheStatsSchema = z.object({
  type: z.string(),
  entryCount: z.number(),
  totalSizeBytes: z.number(),
});

const AllCacheStatsSchema = z.object({
  caches: z.array(CacheStatsSchema),
  totalEntries: z.number(),
  totalSizeBytes: z.number(),
});

const CacheClearResultSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number(),
  deletedFiles: z.array(z.string()).optional(),
  message: z.string().optional(),
});

// ============================================================================
// Suggestion/Autocomplete Schemas
// ============================================================================

const SuggestionFormatSchema = z.enum(['MANGA', 'NOVEL', 'ONE_SHOT']);

const SuggestionItemSchema = z.object({
  anilistId: z.number(),
  title: z.string(),
  titleRomaji: z.string(),
  format: SuggestionFormatSchema,
  volumes: z.number().nullable(),
  status: z.string(),
  coverUrl: z.string().nullable(),
});

const SuggestionsResponseSchema = z.object({
  items: z.array(SuggestionItemSchema),
});

// ============================================================================
// User/Patron Schemas
// ============================================================================

const LoginRequestSchema = z.object({
  cardNumber: z.string().min(1).describe('Library card number'),
  pin: z.string().min(1).describe('PIN or password'),
});

const LoginResponseSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().optional(),
  displayName: z.string().optional(),
  error: z.string().optional(),
});

const CheckedOutItemSchema = z.object({
  recordId: z.string(),
  title: z.string(),
  author: z.string().optional(),
  dueDate: z.string(),
  barcode: z.string(),
  callNumber: z.string().optional(),
  renewals: z.number().optional(),
  renewalsRemaining: z.number().optional(),
  overdue: z.boolean(),
  catalogUrl: z.string(),
});

const CheckoutsResponseSchema = z.object({
  items: z.array(CheckedOutItemSchema),
  totalCount: z.number(),
});

const HistoryItemSchema = z.object({
  recordId: z.string(),
  title: z.string(),
  author: z.string().optional(),
  checkoutDate: z.string(),
  dueDate: z.string(),
  returnDate: z.string().optional(),
  barcode: z.string().optional(),
  callNumber: z.string().optional(),
  catalogUrl: z.string(),
});

const HistoryResponseSchema = z.object({
  items: z.array(HistoryItemSchema),
  totalCount: z.number(),
  hasMore: z.boolean(),
  offset: z.number(),
  limit: z.number(),
  historyEnabled: z.boolean(),
});

const HoldItemSchema = z.object({
  recordId: z.string(),
  title: z.string(),
  author: z.string().optional(),
  holdDate: z.string(),
  status: z.string(),
  position: z.number().optional(),
  pickupLibrary: z.string().optional(),
  expiresAt: z.string().optional(),
  catalogUrl: z.string(),
});

const HoldsResponseSchema = z.object({
  items: z.array(HoldItemSchema),
  totalCount: z.number(),
});

const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

const SessionStatusResponseSchema = z.object({
  valid: z.boolean(),
  sessionId: z.string().optional(),
  displayName: z.string().optional(),
});

const HistorySettingsResponseSchema = z.object({
  historyEnabled: z.boolean(),
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

  // ==========================================================================
  // Autocomplete/Suggestion Routes
  // ==========================================================================

  /**
   * GET /manga/popular
   *
   * Get popular manga for autocomplete suggestions.
   * Returns top titles by popularity + trending, deduplicated.
   * Cached for 24 hours on the backend.
   *
   * Query params:
   *   popularLimit: Number of popular titles to fetch (default: 150)
   *   trendingLimit: Number of trending titles to fetch (default: 50)
   */
  app.get(
    '/popular',
    {
      schema: {
        querystring: z.object({
          popularLimit: z.string().optional().transform(v => v ? parseInt(v, 10) : 150),
          trendingLimit: z.string().optional().transform(v => v ? parseInt(v, 10) : 50),
        }),
        response: {
          200: SuggestionsResponseSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { popularLimit, trendingLimit } = request.query;

      try {
        const items = await getPopularManga({ popularLimit, trendingLimit });
        return { items };
      } catch (error) {
        request.log.error(error, 'Failed to fetch popular manga');
        return reply.status(500).send({
          error: 'popular_fetch_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /manga/suggestions
   *
   * Search for manga suggestions for autocomplete.
   * Uses AniList search API.
   *
   * Query params:
   *   q: Search query (required, min 1 char)
   *   limit: Max results to return (default: 10)
   */
  app.get(
    '/suggestions',
    {
      schema: {
        querystring: z.object({
          q: z.string().min(1).describe('Search query'),
          limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 10),
        }),
        response: {
          200: SuggestionsResponseSchema,
          400: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { q, limit } = request.query;

      try {
        const items = await getSuggestions(q, { limit });
        return { items };
      } catch (error) {
        request.log.error(error, 'Failed to fetch suggestions');
        return reply.status(500).send({
          error: 'suggestions_fetch_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ==========================================================================
  // Cache Management Routes
  // ==========================================================================

  /**
   * GET /manga/cache/stats
   *
   * Get statistics about all cache types.
   */
  app.get(
    '/cache/stats',
    {
      schema: {
        response: {
          200: AllCacheStatsSchema,
        },
      },
    },
    async () => {
      return getAllCacheStats();
    }
  );

  /**
   * DELETE /manga/cache
   *
   * Clear all caches.
   */
  app.delete(
    '/cache',
    {
      schema: {
        response: {
          200: CacheClearResultSchema,
        },
      },
    },
    async () => {
      const result = clearAllCaches();
      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `Cleared ${result.deletedCount} cache entries`,
      };
    }
  );

  /**
   * DELETE /manga/cache/type/:type
   *
   * Clear a specific cache type.
   */
  app.delete(
    '/cache/type/:type',
    {
      schema: {
        params: z.object({
          type: z.enum(['wikipedia', 'google-books', 'bookcover', 'nc-cardinal']),
        }),
        response: {
          200: CacheClearResultSchema,
          400: ErrorSchema,
        },
      },
    },
    async (request) => {
      const { type } = request.params;
      const result = clearCacheType(type as CacheType);
      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `Cleared ${result.deletedCount} entries from ${type} cache`,
      };
    }
  );

  /**
   * DELETE /manga/cache/book/:isbn
   *
   * Clear all cache entries related to a specific ISBN.
   */
  app.delete(
    '/cache/book/:isbn',
    {
      schema: {
        params: z.object({
          isbn: z.string().min(10).max(17),
        }),
        response: {
          200: CacheClearResultSchema,
        },
      },
    },
    async (request) => {
      const { isbn } = request.params;
      const result = clearCacheForISBN(isbn);
      return {
        success: true,
        deletedCount: result.deletedCount,
        deletedFiles: result.deletedFiles,
        message: `Cleared ${result.deletedCount} cache entries for ISBN ${isbn}`,
      };
    }
  );

  /**
   * DELETE /manga/cache/series/:slug
   *
   * Clear Wikipedia cache entries for a specific series.
   */
  app.delete(
    '/cache/series/:slug',
    {
      schema: {
        params: z.object({
          slug: z.string().min(1),
        }),
        response: {
          200: CacheClearResultSchema,
        },
      },
    },
    async (request) => {
      const { slug } = request.params;
      const result = clearCacheForSeries(slug);
      return {
        success: true,
        deletedCount: result.deletedCount,
        deletedFiles: result.deletedFiles,
        message: `Cleared ${result.deletedCount} cache entries for series "${slug}"`,
      };
    }
  );

  /**
   * DELETE /manga/cache/search/:query
   *
   * Clear Wikipedia search cache for a specific query.
   */
  app.delete(
    '/cache/search/:query',
    {
      schema: {
        params: z.object({
          query: z.string().min(1),
        }),
        response: {
          200: CacheClearResultSchema,
        },
      },
    },
    async (request) => {
      const { query } = request.params;
      const result = clearCacheForSearch(query);
      return {
        success: true,
        deletedCount: result.deletedCount,
        deletedFiles: result.deletedFiles,
        message: `Cleared ${result.deletedCount} cache entries for search "${query}"`,
      };
    }
  );

  // ==========================================================================
  // User/Patron Routes
  // ==========================================================================

  /**
   * POST /manga/user/login
   *
   * Login to NC Cardinal with library card and PIN.
   * Returns a session ID for subsequent authenticated requests.
   */
  app.post(
    '/user/login',
    {
      schema: {
        body: LoginRequestSchema,
        response: {
          200: LoginResponseSchema,
          401: LoginResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { cardNumber, pin } = request.body;

      try {
        const result = await login(cardNumber, pin);

        if (!result.success || !result.session) {
          return reply.status(401).send({
            success: false,
            error: result.error ?? 'Login failed',
          });
        }

        return {
          success: true,
          sessionId: result.session.sessionToken, // This is our session ID, not the raw token
          displayName: result.session.displayName,
        };
      } catch (error) {
        request.log.error(error, 'Login error');
        return reply.status(401).send({
          success: false,
          error: error instanceof Error ? error.message : 'Login failed',
        });
      }
    }
  );

  /**
   * POST /manga/user/logout
   *
   * Logout and invalidate the session.
   */
  app.post(
    '/user/logout',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string().optional(),
        }),
        response: {
          200: LogoutResponseSchema,
        },
      },
    },
    async (request) => {
      const sessionId = request.headers['x-session-id'];

      if (sessionId) {
        await logout(sessionId);
      }

      return { success: true };
    }
  );

  /**
   * GET /manga/user/session
   *
   * Check if the current session is valid and return user info.
   */
  app.get(
    '/user/session',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string().optional(),
        }),
        response: {
          200: SessionStatusResponseSchema,
        },
      },
    },
    async (request) => {
      const sessionId = request.headers['x-session-id'];

      if (!sessionId) {
        return { valid: false };
      }

      const valid = isSessionValid(sessionId);
      if (!valid) {
        return { valid: false };
      }

      const session = getSession(sessionId);
      return {
        valid: true,
        sessionId,
        displayName: session?.displayName,
      };
    }
  );

  /**
   * GET /manga/user/checkouts
   *
   * Get currently checked out items for the logged-in user.
   * Requires X-Session-Id header from login.
   */
  app.get(
    '/user/checkouts',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string(),
        }),
        response: {
          200: CheckoutsResponseSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers['x-session-id'];

      if (!sessionId || !isSessionValid(sessionId)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid or expired session',
        });
      }

      try {
        const checkouts = await getCheckouts(sessionId);
        return checkouts;
      } catch (error) {
        request.log.error(error, 'Failed to fetch checkouts');
        
        if (error instanceof Error && error.message.includes('Session expired')) {
          return reply.status(401).send({
            error: 'session_expired',
            message: 'Your session has expired. Please log in again.',
          });
        }

        return reply.status(500).send({
          error: 'fetch_failed',
          message: error instanceof Error ? error.message : 'Failed to fetch checkouts',
        });
      }
    }
  );

  /**
   * GET /manga/user/history
   *
   * Get checkout history for the logged-in user.
   * Note: History must be enabled in the user's NC Cardinal account settings.
   */
  app.get(
    '/user/history',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string(),
        }),
        querystring: z.object({
          limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 15),
          offset: z.string().optional().transform(v => v ? parseInt(v, 10) : 0),
        }),
        response: {
          200: HistoryResponseSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers['x-session-id'];
      const { limit, offset } = request.query;

      if (!sessionId || !isSessionValid(sessionId)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid or expired session',
        });
      }

      try {
        const history = await getHistory(sessionId, { limit, offset });
        return history;
      } catch (error) {
        request.log.error(error, 'Failed to fetch history');

        if (error instanceof Error && error.message.includes('Session expired')) {
          return reply.status(401).send({
            error: 'session_expired',
            message: 'Your session has expired. Please log in again.',
          });
        }

        return reply.status(500).send({
          error: 'fetch_failed',
          message: error instanceof Error ? error.message : 'Failed to fetch history',
        });
      }
    }
  );

  /**
   * GET /manga/user/holds
   *
   * Get current holds for the logged-in user.
   */
  app.get(
    '/user/holds',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string(),
        }),
        response: {
          200: HoldsResponseSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers['x-session-id'];

      if (!sessionId || !isSessionValid(sessionId)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid or expired session',
        });
      }

      try {
        const holds = await getHolds(sessionId);
        return holds;
      } catch (error) {
        request.log.error(error, 'Failed to fetch holds');

        if (error instanceof Error && error.message.includes('Session expired')) {
          return reply.status(401).send({
            error: 'session_expired',
            message: 'Your session has expired. Please log in again.',
          });
        }

        return reply.status(500).send({
          error: 'fetch_failed',
          message: error instanceof Error ? error.message : 'Failed to fetch holds',
        });
      }
    }
  );

  /**
   * GET /manga/user/settings/history
   *
   * Check if checkout history tracking is enabled for the user.
   */
  app.get(
    '/user/settings/history',
    {
      schema: {
        headers: z.object({
          'x-session-id': z.string(),
        }),
        response: {
          200: HistorySettingsResponseSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionId = request.headers['x-session-id'];

      if (!sessionId || !isSessionValid(sessionId)) {
        return reply.status(401).send({
          error: 'unauthorized',
          message: 'Invalid or expired session',
        });
      }

      try {
        const historyEnabled = await isHistoryEnabled(sessionId);
        return { historyEnabled };
      } catch (error) {
        request.log.error(error, 'Failed to check history settings');
        return reply.status(500).send({
          error: 'fetch_failed',
          message: error instanceof Error ? error.message : 'Failed to check settings',
        });
      }
    }
  );

  // ==========================================================================
  // Search Routes
  // ==========================================================================

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
   * GET /manga/search/stream?q=query&homeLibrary=HIGH_POINT_MAIN
   *
   * Streaming search endpoint using Server-Sent Events (SSE).
   * Streams progress updates as the search progresses through:
   * - Wikipedia lookup
   * - NC Cardinal availability checks
   * - Cover image fetching
   *
   * Query params:
   *   q: Search query (required)
   *   homeLibrary: Library code for local/remote availability breakdown (optional)
   *
   * Event types:
   *   started, wikipedia:searching, wikipedia:found, wikipedia:not-found,
   *   availability:start, availability:progress, availability:complete,
   *   covers:start, covers:progress, covers:complete, complete, error
   */
  app.get(
    '/search/stream',
    {
      schema: {
        querystring: z.object({
          q: z.string().min(1).describe('Search query'),
          homeLibrary: z.string().optional().describe('Home library code'),
        }),
      },
    },
    async (request, reply) => {
      const { q, homeLibrary } = request.query;

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Helper to send SSE events
      const sendEvent = (event: SearchProgressEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        await searchWithProgress(q, {
          homeLibrary,
          onProgress: sendEvent,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendEvent({ type: 'error', message });
      }

      // End the stream
      reply.raw.end();
    }
  );

  /**
   * GET /manga/series/:id?debug=true
   *
   * Get detailed series information with all volumes and availability.
   * Requires an entity ID (e.g., "s_V1StGXR8Z").
   *
   * Query params:
   *   debug: Include debug info (optional, default: false)
   *   homeLibrary: Library code for local/remote availability breakdown (optional)
   *
   * Examples:
   *   /manga/series/s_V1StGXR8Z
   *   /manga/series/s_V1StGXR8Z?homeLibrary=HIGH_POINT_MAIN&debug=true
   */
  app.get(
    '/series/:id',
    {
      schema: {
        params: z.object({
          id: z.string().min(1).describe('Series entity ID'),
        }),
        querystring: z.object({
          debug: z.enum(['true', 'false']).optional().describe('Include debug info'),
          homeLibrary: z.string().optional().describe('Home library code'),
        }),
        response: {
          200: SeriesDetailsSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { debug, homeLibrary } = request.query;
      const includeDebug = debug === 'true';
      
      try {
        // Look up by entity ID only
        const entity = await getSeriesEntity(id);
        
        if (!entity) {
          return reply.status(404).send({
            error: 'series_not_found',
            message: `Series with ID "${id}" not found`,
          });
        }
        
        // Found entity - fetch full details using the stored title
        // Pass entityId as fallback for related series without Wikipedia pages
        request.log.info(`Found entity: ${entity.id} - "${entity.title}"`);
        const details = await getSeriesDetails(entity.title, { 
          includeDebug, 
          homeLibrary,
          entityId: entity.id,
        });
        
        if (!details) {
          return reply.status(404).send({
            error: 'series_not_found',
            message: `Series data for "${entity.title}" could not be loaded`,
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
   * GET /manga/volumes/:id
   *
   * Get detailed information about a specific volume by entity ID.
   * Looks up the volume entity, then fetches NC Cardinal data using the primary ISBN.
   *
   * Query params:
   *   homeLibrary: Library code for local/remote availability breakdown (optional)
   *
   * Examples:
   *   /manga/volumes/v_abc123
   *   /manga/volumes/v_abc123?homeLibrary=HIGH_POINT_MAIN
   */
  app.get(
    '/volumes/:id',
    {
      schema: {
        params: z.object({
          id: z.string().min(1).describe('Volume entity ID (e.g., v_abc123)'),
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
      const { id } = request.params;
      const { homeLibrary } = request.query;

      try {
        // Look up the volume entity
        const volume = await getVolumeById(id);
        if (!volume) {
          return reply.status(404).send({
            error: 'volume_not_found',
            message: `Volume with ID "${id}" not found`,
          });
        }

        // Get the series for this volume
        const series = await getSeriesById(volume.seriesId);
        if (!series) {
          return reply.status(404).send({
            error: 'series_not_found',
            message: `Series for volume "${id}" not found`,
          });
        }

        // Resolve editions for this volume
        const editions = await getVolumeEditionData(volume.id);

        // Find the primary ISBN (first English physical edition)
        const englishPhysical = editions.find(e => e.language === 'en' && e.format === 'physical');
        const englishDigital = editions.find(e => e.language === 'en' && e.format === 'digital');
        const primaryIsbn = englishPhysical?.isbn ?? englishDigital?.isbn;

        // Build the volume title
        const volumeTitle = volume.title 
          ? `${series.title}, Vol. ${volume.volumeNumber}: ${volume.title}`
          : `${series.title}, Vol. ${volume.volumeNumber}`;

        // If no ISBN, return minimal info (Japan-only volume)
        if (!primaryIsbn) {
          return {
            id: volume.id,
            title: volumeTitle,
            authors: series.author ? [series.author] : [],
            isbns: editions.map(e => e.isbn),
            subjects: [],
            coverImage: undefined,
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
            seriesInfo: {
              id: series.id,
              title: series.title,
              volumeNumber: volume.volumeNumber,
            },
            catalogUrl: undefined,
          };
        }

        // Fetch NC Cardinal record, cover, and Google Books description in parallel
        const [record, bookcoverUrl, googleBooksDescription] = await Promise.all([
          searchByISBN(primaryIsbn),
          fetchBookcoverUrl(primaryIsbn).catch(() => null),
          getDescriptionByISBN(primaryIsbn),
        ]);
        
        // Cover image priority: Bookcover API > Google Books > OpenLibrary
        let coverImage: string;
        if (bookcoverUrl) {
          coverImage = bookcoverUrl;
        } else {
          const googleBooksUrl = await fetchGoogleBooksCoverUrl(primaryIsbn).catch(() => null);
          coverImage = googleBooksUrl ?? `https://covers.openlibrary.org/b/isbn/${primaryIsbn}-M.jpg`;
        }

        // Description handling:
        // 1. Use Google Books description, falling back to NC Cardinal summary
        // 2. If series has no description, compare with another volume to find common preamble
        // 3. Extract unique portion by stripping series preamble
        const fullDescription = googleBooksDescription ?? record?.summary;
        let volumeDescription: string | undefined;
        
        if (fullDescription) {
          // If series doesn't have a description yet, we need to find the true preamble
          // by comparing with another volume's description
          if (!series.description) {
            // Get all volumes for this series to find another one to compare
            const allVolumes = await getVolumesBySeriesId(series.id);
            
            // Find a different volume (prefer Vol 1 or Vol 2 for consistency)
            const compareVolume = volume.volumeNumber === 1
              ? allVolumes.find(v => v.volumeNumber === 2)
              : allVolumes.find(v => v.volumeNumber === 1);
            
            // Try to get the comparison volume's description
            let compareDescription: string | null = null;
            if (compareVolume) {
              const compareEditions = await getVolumeEditionData(compareVolume.id);
              const compareIsbn = compareEditions.find(e => e.language === 'en' && e.format === 'physical')?.isbn
                ?? compareEditions.find(e => e.language === 'en' && e.format === 'digital')?.isbn;
              
              if (compareIsbn) {
                compareDescription = await getDescriptionByISBN(compareIsbn);
              }
            }
            
            if (compareDescription) {
              // Found another volume's description - extract the common preamble
              const preamble = findCommonPreamble(fullDescription, compareDescription);
              
              if (preamble) {
                // Save the common preamble as series description
                await updateSeriesDescription(series.id, preamble);
                // Extract unique part from this volume
                volumeDescription = extractUniqueVolumeDescription(fullDescription, preamble);
              } else {
                // No common preamble found - use full description
                volumeDescription = fullDescription;
              }
            } else {
              // Couldn't get comparison description - save full as preamble for now
              // (will be updated when another volume is fetched and compared)
              await updateSeriesDescription(series.id, fullDescription);
              volumeDescription = fullDescription;
            }
          } else {
            // Series has a preamble - extract the unique volume-specific part
            volumeDescription = extractUniqueVolumeDescription(fullDescription, series.description);
          }
        }

        const seriesInfo = {
          id: series.id,
          title: series.title,
          volumeNumber: volume.volumeNumber,
        };

        if (!record) {
          // Book not in NC Cardinal catalog - still include Google Books description
          return {
            id: volume.id,
            title: volumeTitle,
            authors: series.author ? [series.author] : [],
            isbns: editions.map(e => e.isbn),
            subjects: [],
            summary: volumeDescription,
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
            seriesInfo,
            catalogUrl: undefined,
          };
        }

        // Calculate detailed availability with local/remote breakdown
        const availability = getDetailedAvailabilitySummary(record, homeLibrary);

        return {
          id: volume.id,
          title: volumeTitle,
          authors: record.authors,
          isbns: [...new Set([...editions.map(e => e.isbn), ...record.isbns])],
          subjects: record.subjects,
          summary: volumeDescription,
          coverImage,
          holdings: record.holdings,
          availability,
          seriesInfo,
          catalogUrl: getCatalogUrl(record.id),
        };
      } catch (error) {
        request.log.error(error, 'Volume lookup failed');
        return reply.status(500).send({
          error: 'volume_lookup_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /manga/books/:isbn/:slug? (LEGACY - prefer /manga/volumes/:id)
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
        // Fetch NC Cardinal record, Bookcover API, and volume entity in parallel
        const [record, bookcoverUrl, volumeEntity] = await Promise.all([
          searchByISBN(cleanISBN),
          fetchBookcoverUrl(cleanISBN).catch(() => null),
          getVolumeEntity(cleanISBN).catch(() => null),
        ]);
        
        // Cover image priority: Bookcover API > Google Books > OpenLibrary
        let coverImage: string;
        if (bookcoverUrl) {
          coverImage = bookcoverUrl;
        } else {
          // Try Google Books as fallback (with placeholder detection)
          const googleBooksUrl = await fetchGoogleBooksCoverUrl(cleanISBN).catch(() => null);
          coverImage = googleBooksUrl ?? `https://covers.openlibrary.org/b/isbn/${cleanISBN}-M.jpg`;
        }

        // Build series info from entity (if available) or extract from title
        let seriesInfo: { id?: string; title: string; volumeNumber?: number } | undefined;
        
        // Build volume title from entity
        let volumeTitle: string | undefined;
        
        if (volumeEntity) {
          // We have entity data - use it for series info
          seriesInfo = {
            id: volumeEntity.series.id,
            title: volumeEntity.series.title,
            volumeNumber: volumeEntity.volume.volumeNumber,
          };
          // Build full title: "Series, Vol. N" or "Series, Vol. N: Subtitle"
          volumeTitle = volumeEntity.volume.title 
            ? `${volumeEntity.series.title}, Vol. ${volumeEntity.volume.volumeNumber}: ${volumeEntity.volume.title}`
            : `${volumeEntity.series.title}, Vol. ${volumeEntity.volume.volumeNumber}`;
        }

        if (!record) {
          // Book not in NC Cardinal catalog - return minimal info with entity data if available
          return {
            id: `isbn-${cleanISBN}`,
            title: volumeTitle ?? `Book (ISBN: ${cleanISBN})`,
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
            seriesInfo,
            catalogUrl: undefined,
          };
        }

        // Calculate detailed availability summary with local/remote breakdown
        const availability = getDetailedAvailabilitySummary(record, homeLibrary);

        // If we don't have entity data, try to extract series info from title
        if (!seriesInfo) {
          const extracted = extractSeriesInfo(record.title);
          if (extracted) {
            seriesInfo = extracted;
          }
        }

        return {
          id: record.id,
          title: volumeTitle ?? record.title,
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
          title: cleanSeriesTitle(match[1]),
          volumeNumber,
        };
      }
    }
  }

  // No volume number found, return just the title cleaned up
  const cleanTitle = cleanSeriesTitle(title);
  if (cleanTitle.length > 0) {
    return { title: cleanTitle };
  }

  return undefined;
}

/**
 * Clean up series title by removing common artifacts from library catalog titles
 * Removes: [manga] tags, trailing slashes, trailing periods/colons, extra whitespace
 */
function cleanSeriesTitle(title: string): string {
  return title
    .replace(/\[manga\]/gi, '')      // Remove [manga] tags
    .replace(/\s*\/\s*$/, '')         // Remove trailing slashes
    .replace(/[.,:;/\\]+$/, '')       // Remove trailing punctuation
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .trim();
}
