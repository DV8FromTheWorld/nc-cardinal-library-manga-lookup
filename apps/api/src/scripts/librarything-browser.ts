/**
 * LibraryThing Browser Automation Script
 *
 * Uses Playwright to scrape LibraryThing search results, bypassing their
 * Cloudflare/JS protections that block simple HTTP requests.
 *
 * Usage:
 *   pnpm --filter @repo/api script:librarything-browser
 *   pnpm --filter @repo/api script:librarything-browser -- --headed
 *
 * Features:
 * - Headless browser automation with Chromium
 * - Caching to .cache/librarything-browser/ (24h TTL)
 * - Rate limiting between requests
 * - Extracts series/volume data from search results
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Browser, chromium, type Page } from 'playwright';

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = 'https://www.librarything.com';
const NEWSEARCH_URL = `${BASE_URL}/newsearch.php`;

// Cache settings
const CACHE_DIR = path.join(process.cwd(), '.cache', 'librarything-browser');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Request settings
const REQUEST_DELAY_MS = 3000; // Delay between requests to avoid rate limiting
const PAGE_TIMEOUT_MS = 30000; // 30 second timeout for page loads

// ============================================================================
// Types
// ============================================================================

export interface LibraryThingSearchResult {
  workId: string;
  title: string;
  subtitle?: string | undefined;
  authors: string[];
  seriesName?: string | undefined;
  seriesPosition?: string | undefined;
  coverUrl?: string | undefined;
  memberCount?: number | undefined;
  rating?: number | undefined;
  publicationYear?: string | undefined;
  workUrl: string;
}

export interface LibraryThingSearchResponse {
  query: string;
  totalResults: number;
  results: LibraryThingSearchResult[];
  scrapedAt: string;
}

interface CachedResponse {
  data: LibraryThingSearchResponse;
  timestamp: number;
}

// ============================================================================
// Cache Functions
// ============================================================================

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(query: string): string {
  const sanitized = query.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `search_${sanitized}.json`;
}

function loadFromCache(cacheKey: string): LibraryThingSearchResponse | null {
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(cachePath, 'utf-8');
    const cached = JSON.parse(data) as CachedResponse;

    // Check if cache is still valid
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      console.log(`  ⏰ Cache expired: ${cacheKey}`);
      return null;
    }

    console.log(`  📁 Loaded from cache: ${cacheKey}`);
    return cached.data;
  } catch {
    return null;
  }
}

function saveToCache(cacheKey: string, data: LibraryThingSearchResponse): void {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, cacheKey);
  const cached: CachedResponse = {
    data,
    timestamp: Date.now(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  console.log(`  💾 Saved to cache: ${cacheKey}`);
}

// ============================================================================
// Browser Automation
// ============================================================================

let browserInstance: Browser | null = null;

async function getBrowser(headed: boolean = false): Promise<Browser> {
  if (browserInstance) {
    return browserInstance;
  }

  console.log(`🚀 Launching browser (${headed ? 'headed' : 'headless'} mode)...`);

  browserInstance = await chromium.launch({
    headless: !headed,
    // Stealth settings to avoid detection
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  return browserInstance;
}

async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function createStealthPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();

  // Remove webdriver detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override the plugins length
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override the languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  return page;
}

// ============================================================================
// Scraping Functions
// ============================================================================

async function scrapeSearchResults(page: Page): Promise<LibraryThingSearchResult[]> {
  const results: LibraryThingSearchResult[] = [];

  // Wait for search results to load - look for the ajaxcontent div
  try {
    await page.waitForSelector('#ajaxcontent, #newsearchdiv', {
      timeout: PAGE_TIMEOUT_MS,
    });
  } catch {
    console.log('  ⚠️ Could not find results container...');
  }

  // Give extra time for dynamic content
  await page.waitForTimeout(1000);

  // Extract results from the page
  const extractedResults = await page.evaluate(() => {
    const items: Array<{
      workId: string;
      title: string;
      subtitle?: string;
      authors: string[];
      seriesName?: string;
      seriesPosition?: string;
      coverUrl?: string;
      memberCount?: number;
      rating?: number;
      publicationYear?: string;
      workUrl: string;
    }> = [];

    // For Series search (searchtype=55), results are simple <p><a> elements with /nseries/ links
    const seriesLinks = document.querySelectorAll('#ajaxcontent a[href*="/nseries/"]');
    if (seriesLinks.length > 0) {
      console.log(`Found ${seriesLinks.length} series links`);
      seriesLinks.forEach((link) => {
        const href = link.getAttribute('href') ?? '';
        const seriesMatch = href.match(/\/nseries\/(\d+)/);
        const seriesId = seriesMatch?.[1] ?? '';

        if (seriesId === '') return;

        const title = link.textContent?.trim() ?? 'Unknown';

        items.push({
          workId: `series_${seriesId}`,
          title,
          authors: [],
          seriesName: title,
          workUrl: `https://www.librarything.com${href}`,
        });
      });
      return items;
    }

    // For Works search, look for work links
    const workLinks = document.querySelectorAll('#ajaxcontent a[href*="/work/"]');
    if (workLinks.length > 0) {
      console.log(`Found ${workLinks.length} work links`);
      workLinks.forEach((link) => {
        const href = link.getAttribute('href') ?? '';
        const workMatch = href.match(/\/work\/(\d+)/);
        const workId = workMatch?.[1] ?? '';

        if (workId === '') return;

        // Avoid duplicates
        if (items.some((item) => item.workId === workId)) return;

        const title = link.textContent?.trim() ?? 'Unknown';

        // Try to find author - often in parent or sibling elements
        const authors: string[] = [];
        const parent = link.closest('p, div, li, tr');
        if (parent) {
          const authorLink = parent.querySelector('a[href*="/author/"]');
          if (authorLink !== null) {
            const authorName = authorLink.textContent?.trim();
            if (authorName !== undefined && authorName !== '') authors.push(authorName);
          }
        }

        items.push({
          workId,
          title,
          authors,
          workUrl: `https://www.librarything.com/work/${workId}`,
        });
      });
      return items;
    }

    // Fallback: look for any content links in the ajax content area
    const contentArea = document.querySelector('#ajaxcontent');
    if (contentArea) {
      const allLinks = contentArea.querySelectorAll('a[href^="/"]');
      console.log(`Fallback: Found ${allLinks.length} links in content area`);
      allLinks.forEach((link) => {
        const href = link.getAttribute('href') ?? '';
        // Skip navigation/utility links
        if (
          href.includes('/search') ||
          href.includes('/newsearch') ||
          href.includes('javascript:') ||
          href === '#'
        ) {
          return;
        }

        const title = link.textContent?.trim() ?? '';
        if (title === '' || title.length < 2) return;

        // Extract ID from various URL patterns
        const idMatch = href.match(/\/(?:work|nseries|author)\/(\d+)/);
        const id = idMatch?.[1] ?? href.replace(/[^a-z0-9]/gi, '_');

        if (items.some((item) => item.workId === id)) return;

        items.push({
          workId: id,
          title,
          authors: [],
          workUrl: `https://www.librarything.com${href}`,
        });
      });
    }

    return items;
  });

  // Filter and clean results
  for (const result of extractedResults) {
    if (result.workId !== '' && result.title !== '') {
      results.push({
        ...result,
        subtitle: result.subtitle,
        seriesName: result.seriesName,
        seriesPosition: result.seriesPosition,
        coverUrl: result.coverUrl,
        memberCount: result.memberCount,
        rating: result.rating,
        publicationYear: result.publicationYear,
      });
    }
  }

  return results;
}

async function extractTotalResults(page: Page): Promise<number> {
  try {
    const totalText = await page.evaluate(() => {
      // Look for result count text
      const countSelectors = [
        '.resultCount',
        '.totalResults',
        '#resultCount',
        '.search-results-count',
        'h2:has-text("results")',
      ];

      for (const selector of countSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          return el.textContent ?? '';
        }
      }

      // Try to find text like "X results" or "Showing X of Y"
      const body = document.body.textContent ?? '';
      const match = body.match(/(\d+)\s+results?/i) ?? body.match(/of\s+(\d+)/i);
      return match?.[1] ?? '0';
    });

    const match = totalText.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Main Search Function
// ============================================================================

export interface SearchOptions {
  headed?: boolean | undefined;
  skipCache?: boolean | undefined;
}

export async function searchLibraryThing(
  query: string,
  options: SearchOptions = {}
): Promise<LibraryThingSearchResponse> {
  const { headed = false, skipCache = false } = options;

  // Check cache first
  const cacheKey = getCacheKey(query);
  if (!skipCache) {
    const cached = loadFromCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  console.log(`\n🔍 Searching LibraryThing for: "${query}"`);

  const browser = await getBrowser(headed);
  const page = await createStealthPage(browser);

  try {
    // Try the newsearch.php URL directly which should return results
    // searchtype=55 is for "Works" search
    const searchParams = new URLSearchParams({
      search: query,
      searchtype: '55',
      sortchoice: '0',
    });
    const url = `${NEWSEARCH_URL}?${searchParams}`;

    console.log(`  📄 Loading: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Don't wait for networkidle - let dynamic content load
      timeout: PAGE_TIMEOUT_MS,
    });

    // Wait for page to settle and JS to execute
    console.log(`  ⏳ Waiting for results to load...`);

    // First wait for the ajaxcontent container to appear
    try {
      await page.waitForSelector('#ajaxcontent', { timeout: 20000 });
      console.log(`  ✓ Found ajaxcontent container`);
    } catch {
      console.log(`  ⚠️ No ajaxcontent found, page may not have loaded results`);
    }

    // Then wait for actual result links
    try {
      await page.waitForSelector(
        '#ajaxcontent a[href*="/nseries/"], #ajaxcontent a[href*="/work/"]',
        {
          timeout: 10000,
        }
      );
      console.log(`  ✓ Found result elements`);
    } catch {
      console.log(`  ⚠️ Result selector timeout, trying to scrape anyway...`);
    }

    // Extra wait for any lazy-loaded content
    await page.waitForTimeout(1000);

    // Debug: Save screenshot and HTML for inspection
    const debugDir = path.join(CACHE_DIR, 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const debugName = query.replace(/[^a-z0-9]+/gi, '_');
    await page.screenshot({ path: path.join(debugDir, `${debugName}.png`), fullPage: true });
    const html = await page.content();
    fs.writeFileSync(path.join(debugDir, `${debugName}.html`), html);
    console.log(`  🐛 Debug files saved to ${debugDir}`);

    // Check for Cloudflare challenge
    const isChallenge = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      const body = document.body.textContent?.toLowerCase() ?? '';
      return (
        title.includes('just a moment') ||
        title.includes('cloudflare') ||
        body.includes('checking your browser') ||
        body.includes('please wait')
      );
    });

    if (isChallenge) {
      console.log('  ⚠️ Cloudflare challenge detected, waiting for resolution...');
      // Wait for challenge to resolve (up to 30 seconds)
      await page.waitForFunction(
        () => {
          const title = document.title.toLowerCase();
          return !title.includes('just a moment') && !title.includes('cloudflare');
        },
        { timeout: 30000 }
      );
      // Wait a bit more for the actual page to load
      await page.waitForTimeout(3000);
    }

    // Extract results
    const results = await scrapeSearchResults(page);
    const totalResults = await extractTotalResults(page);

    console.log(`  ✅ Found ${results.length} results (${totalResults} total)`);

    const response: LibraryThingSearchResponse = {
      query,
      totalResults: totalResults > 0 ? totalResults : results.length,
      results,
      scrapedAt: new Date().toISOString(),
    };

    // Save to cache
    if (!skipCache) {
      saveToCache(cacheKey, response);
    }

    return response;
  } finally {
    await page.close();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Search with rate limiting for multiple queries
 */
export async function searchMultiple(
  queries: string[],
  options: SearchOptions = {}
): Promise<Map<string, LibraryThingSearchResponse>> {
  const results = new Map<string, LibraryThingSearchResponse>();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    if (query === undefined || query === '') continue;

    const response = await searchLibraryThing(query, options);
    results.set(query, response);

    // Rate limiting between requests
    if (i < queries.length - 1) {
      console.log(`  ⏳ Waiting ${REQUEST_DELAY_MS}ms before next request...`);
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }

  return results;
}

/**
 * Extract volume number from a title
 */
export function extractVolumeNumber(title: string): string | null {
  const patterns = [
    /Vol(?:ume)?\.?\s*(\d+)/i,
    /,\s*(\d+)(?:\s|$|:)/,
    /#(\d+)/,
    /Book\s+(\d+)/i,
    /Part\s+(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }

  return null;
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true });
    console.log('🗑️ Cache cleared');
  }
}

// ============================================================================
// CLI / Test
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('LibraryThing Browser Automation Test');
  console.log('='.repeat(60));

  // Parse CLI args
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');
  const skipCache = args.includes('--skip-cache');

  if (headed) {
    console.log('Running in headed mode (browser visible)');
  }
  if (skipCache) {
    console.log('Skipping cache');
  }

  try {
    // Test searches
    // Use command line arg if provided, otherwise use default test queries
    const customQuery = args.find((a) => !a.startsWith('--'));
    const testQueries =
      customQuery !== undefined ? [customQuery] : ['my hero academia', 'one piece', 'demon slayer'];

    for (const query of testQueries) {
      console.log('\n' + '-'.repeat(50));

      const response = await searchLibraryThing(query, { headed, skipCache });

      console.log(`\n📊 Results for "${query}":`);
      console.log(`   Total: ${response.totalResults}`);
      console.log(`   Retrieved: ${response.results.length}`);
      console.log(`   Scraped at: ${response.scrapedAt}`);

      if (response.results.length > 0) {
        console.log('\n   Top results:');
        response.results.slice(0, 5).forEach((r, i) => {
          const volume = extractVolumeNumber(r.title);
          console.log(`   ${i + 1}. [${r.workId}] ${r.title}`);
          if (r.authors.length > 0) {
            console.log(`      Author(s): ${r.authors.join(', ')}`);
          }
          if (r.seriesName !== undefined && r.seriesName !== '') {
            const positionSuffix = r.seriesPosition !== undefined ? ` #${r.seriesPosition}` : '';
            console.log(`      Series: ${r.seriesName}${positionSuffix}`);
          }
          if (volume !== null) {
            console.log(`      Volume: ${volume}`);
          }
          if (r.memberCount !== undefined && r.memberCount > 0) {
            console.log(`      Members: ${r.memberCount}`);
          }
        });
      }

      // Rate limit between searches
      if (testQueries.indexOf(query) < testQueries.length - 1) {
        console.log(`\n⏳ Waiting ${REQUEST_DELAY_MS}ms before next search...`);
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await closeBrowser();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test complete!');
  console.log('='.repeat(60));
}

// Run if executed directly
// Note: On Windows, import.meta.url uses forward slashes while process.argv[1] uses backslashes
const scriptPath = process.argv[1]?.replace(/\\/g, '/') ?? '';
const isMainModule =
  import.meta.url === `file://${scriptPath}` || import.meta.url === `file:///${scriptPath}`;
if (isMainModule) {
  main().catch(console.error);
}
