/**
 * Investigation script: Explore LibraryThing series/works pages
 *
 * Useful for debugging and discovering new data sources.
 * Run with: pnpm tsx src/scripts/investigate-series-works.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { type Browser, chromium, type Page } from 'playwright';

const DEBUG_DIR = path.join(process.cwd(), '.cache', 'librarything-browser', 'debug');

async function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  }
}

async function createStealthBrowser(headed = false): Promise<Browser> {
  return chromium.launch({
    headless: !headed,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
}

async function createStealthPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return page;
}

async function waitForCloudflare(page: Page): Promise<void> {
  const title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('  ⏳ Waiting for Cloudflare challenge...');
    await page.waitForFunction(() => !document.title.includes('Just a moment'), {
      timeout: 30000,
    });
    console.log('  ✓ Cloudflare challenge passed');
    await page.waitForTimeout(2000);
  }
}

async function investigateSeriesPage() {
  await ensureDebugDir();

  console.log('='.repeat(60));
  console.log('LibraryThing Series Works Investigation');
  console.log('='.repeat(60));

  const browser = await createStealthBrowser(true); // headed mode for observation
  const page = await createStealthPage(browser);

  // Capture all network requests to find AJAX endpoints
  const ajaxRequests: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (
      url.includes('ajax') ||
      url.includes('api') ||
      url.includes('.php') ||
      url.includes('work')
    ) {
      ajaxRequests.push(`${request.method()} ${url}`);
    }
  });

  try {
    // Load series page
    const seriesUrl = 'https://www.librarything.com/nseries/12662/My-Hero-Academia';
    console.log(`\n📄 Loading series page: ${seriesUrl}`);
    await page.goto(seriesUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForCloudflare(page);
    await page.waitForTimeout(3000);

    // Check the page title
    const title = await page.title();
    console.log(`  Page title: ${title}`);

    // Look for clickable elements that might load the works list
    console.log('\n🔍 Looking for works-related elements...');

    const elements = await page.evaluate(() => {
      const results: string[] = [];

      // Find all elements that mention "works" or could be clickable lists
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el) => {
        const text = el.textContent?.toLowerCase() ?? '';
        const classList = el.className?.toString() ?? '';
        const id = el.id ?? '';

        if (
          (text.includes('work') && text.length < 100) ||
          classList.includes('work') ||
          id.includes('work') ||
          classList.includes('shelf') ||
          id.includes('shelf')
        ) {
          const tag = el.tagName.toLowerCase();
          const snippet = el.textContent?.slice(0, 80)?.trim() ?? '';
          if (snippet !== '' && !results.some((r) => r.includes(snippet))) {
            results.push(`<${tag} class="${classList}" id="${id}"> ${snippet}`);
          }
        }
      });

      return results.slice(0, 30);
    });

    console.log('  Found elements:');
    elements.forEach((el) => console.log(`    ${el}`));

    // Try to find and click on the works section
    console.log('\n🖱️ Looking for works section to click...');

    // Try clicking on "52 Works" or similar
    const worksLink = await page.$('text=/\\d+ Works/i');
    if (worksLink) {
      console.log('  Found works count element, clicking...');
      await worksLink.click();
      await page.waitForTimeout(3000);
    }

    // Check for shelf/grid of works
    const shelfContent = await page.evaluate(() => {
      const shelf = document.querySelector('.lt_shelf, .shelf, .covers');
      if (shelf) {
        return {
          html: shelf.innerHTML.slice(0, 2000),
          childCount: shelf.children.length,
        };
      }
      return null;
    });

    if (shelfContent) {
      console.log(`\n📚 Found shelf element with ${shelfContent.childCount} children`);
      console.log('  Content preview:', shelfContent.html.slice(0, 500));
    }

    // Look for links to individual works
    const workLinks = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/work/"]');
      return Array.from(links).map((a) => ({
        href: a.getAttribute('href'),
        text: a.textContent?.trim().slice(0, 50),
      }));
    });

    console.log(`\n📖 Found ${workLinks.length} work links:`);
    workLinks.slice(0, 10).forEach((link) => {
      console.log(`    ${link.href} - ${link.text}`);
    });

    // Save final state
    console.log('\n💾 Saving debug files...');
    const html = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, 'series_works_investigation.html'), html);
    await page.screenshot({
      path: path.join(DEBUG_DIR, 'series_works_investigation.png'),
      fullPage: true,
    });

    // Print captured AJAX requests
    console.log(`\n🌐 Captured ${ajaxRequests.length} relevant network requests:`);
    ajaxRequests.forEach((req) => console.log(`    ${req}`));

    // Now investigate a single work page to find ISBNs
    console.log('\n📖 Investigating single work page for ISBNs...');
    const workUrl = 'https://www.librarything.com/work/16126295';
    console.log(`  Loading: ${workUrl}`);

    await page.goto(workUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForCloudflare(page);
    await page.waitForTimeout(3000);

    const workTitle = await page.title();
    console.log(`  Work page title: ${workTitle}`);

    // Look for ISBN data
    const isbnData = await page.evaluate(() => {
      const results: { selector: string; content: string }[] = [];

      // Check all text content for ISBN patterns
      const allText = document.body.textContent ?? '';
      const isbnMatches = allText.match(/\b(97[89]\d{10}|\d{10})\b/g);
      if (isbnMatches) {
        results.push({
          selector: 'body text',
          content: `Found ISBNs: ${isbnMatches.slice(0, 10).join(', ')}`,
        });
      }

      // Look for specific elements
      const selectors = [
        '#workISBN',
        '.isbn',
        '[class*="isbn"]',
        '[id*="isbn"]',
        '.editions',
        '#editions',
        '.bookdata',
        'table.worksbyauthor',
        '.editiontable',
      ];

      selectors.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          results.push({
            selector: sel,
            content: el.textContent?.slice(0, 200) ?? '',
          });
        }
      });

      // Look for edition links
      const editionLinks = document.querySelectorAll('a[href*="/isbn/"], a[href*="/edition/"]');
      if (editionLinks.length > 0) {
        results.push({
          selector: 'edition links',
          content: Array.from(editionLinks)
            .slice(0, 5)
            .map((a) => a.getAttribute('href'))
            .join(', '),
        });
      }

      return results;
    });

    console.log('  ISBN-related data found:');
    isbnData.forEach((item) => {
      console.log(`    [${item.selector}]: ${item.content.slice(0, 100)}`);
    });

    // Save work page for analysis
    const workHtml = await page.content();
    fs.writeFileSync(path.join(DEBUG_DIR, 'work_page_investigation.html'), workHtml);
    await page.screenshot({
      path: path.join(DEBUG_DIR, 'work_page_investigation.png'),
      fullPage: true,
    });
    console.log('  Saved work page HTML and screenshot');

    // Try the editions page - the best source for ISBNs
    console.log('\n📚 Trying editions page for direct ISBN access...');
    const editionsUrl = 'https://www.librarything.com/work/16126295/editions';
    try {
      await page.goto(editionsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForCloudflare(page);
      await page.waitForTimeout(3000);

      const editionsTitle = await page.title();
      console.log(`  Editions page title: ${editionsTitle}`);

      // Look for ISBN data
      const editionsData = await page.evaluate(() => {
        const results: { type: string; content: string }[] = [];

        // Find all ISBN patterns
        const text = document.body.textContent ?? '';
        const isbns = text.match(/\b(97[89]\d{10}|\d{10}|\d{9}X?)\b/g);
        if (isbns && isbns.length > 0) {
          results.push({
            type: 'Found ISBNs',
            content: [...new Set(isbns)].slice(0, 15).join(', '),
          });
        }

        // Look for edition entries/rows
        const tables = document.querySelectorAll('table');
        tables.forEach((table, idx) => {
          const rows = table.querySelectorAll('tr');
          if (rows.length > 0) {
            results.push({
              type: `Table ${idx}`,
              content: `${rows.length} rows`,
            });
          }
        });

        // Look for edition links
        const editionLinks = document.querySelectorAll('a[href*="isbn"], a[href*="edition"]');
        if (editionLinks.length > 0) {
          results.push({
            type: 'Edition links',
            content: Array.from(editionLinks)
              .slice(0, 5)
              .map((a) => a.getAttribute('href'))
              .join(', '),
          });
        }

        // Check for .ed_isbn cells (the good stuff!)
        const isbnCells = document.querySelectorAll('.ed_isbn');
        if (isbnCells.length > 0) {
          const samples = Array.from(isbnCells)
            .slice(0, 5)
            .map((c) => c.textContent?.trim());
          results.push({
            type: '.ed_isbn cells',
            content: samples.join(' | '),
          });
        }

        return results;
      });

      console.log('  Editions page data:');
      editionsData.forEach((item) => {
        console.log(`    [${item.type}]: ${item.content}`);
      });

      // Save editions page
      const editionsHtml = await page.content();
      fs.writeFileSync(path.join(DEBUG_DIR, 'editions_page_investigation.html'), editionsHtml);
      await page.screenshot({
        path: path.join(DEBUG_DIR, 'editions_page_investigation.png'),
        fullPage: true,
      });
      console.log('  Saved editions page HTML and screenshot');
    } catch (e) {
      console.log(`  Failed to load editions page: ${String(e)}`);
    }

    console.log('\n⏳ Keeping browser open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Investigation complete!');
  console.log(`Debug files saved to: ${DEBUG_DIR}`);
  console.log('='.repeat(60));
}

investigateSeriesPage().catch(console.error);
