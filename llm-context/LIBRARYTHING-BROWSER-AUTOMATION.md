# LibraryThing Browser Automation - Knowledge Transfer

This document captures all findings from investigating LibraryThing's website for browser automation to extract manga/light novel series data and ISBNs.

## Why Browser Automation?

LibraryThing has:

- **No public API** for series/works data
- **Talpa API** exists but limited to 50 queries/day and doesn't provide ISBN data
- **Cloudflare protection** on web pages requiring browser-based access
- **JavaScript-rendered content** that requires waiting for page load

## Tool Choice: Playwright

We chose Playwright over Puppeteer because:

- Better Cloudflare bypass capabilities
- Built-in auto-wait for elements
- Modern async/await API
- Cross-browser support (Chromium, Firefox, WebKit)

**Installation:**

```bash
cd apps/api
pnpm add -D playwright
```

**Script location:** `apps/api/src/scripts/librarything-browser.ts`

---

## URL Patterns & Page Types

### 1. Search Page

**URL:** `https://www.librarything.com/newsearch.php?search={query}&searchtype=55&sortchoice=0`

- `searchtype=55` = Series search
- Returns list of series matching query
- Results in `#ajaxcontent` container after JS loads

**Data available:**

- Series links: `/nseries/{id}/{name-slug}`
- Series type indicators in title: `[Manga]`, `{light novel}`, `{anime}`

### 2. Series Page

**URL:** `https://www.librarything.com/nseries/{id}/{name-slug}`

**Example:** `https://www.librarything.com/nseries/12662/My-Hero-Academia`

**Data available:**

- Series title and original Japanese name
- Author name and link
- Stats: Works count, Popularity rank, Members, Rating
- **Work shelf** with all volumes

**Work links found in shelf:**

```html
<a
  href="/work/16126295/t/My-Hero-Academia-Vol-01"
  data-workid="16126295"
  data-title="My-Hero-Academia-Vol-01"
></a>
```

**Cover images (contain ISBNs - see "Simple Approach" below):**

```html
<img src="https://images-na.ssl-images-amazon.com/images/P/1421582694.01._SX40_SCLZZZZZZZ_.jpg" />
```

### 3. Work Page (Main)

**URL:** `https://www.librarything.com/work/{workId}`

**Example:** `https://www.librarything.com/work/16126295`

**Data available:**

- Work title
- Author
- Cover image (Amazon URL with ISBN)
- Tags, reviews, recommendations
- Hidden input: `<input type="hidden" name="work" value="16126295">`

**ISBN extraction (from cover):**

- Found in Amazon image URL: `/P/1421582694.01._SX180_SCLZZZZZZZ_.jpg`
- Also in onclick handler: `lt.newwork.cover_info_popup(event,'am','am:1421582694',16126295)`

### 4. Editions Page (RECOMMENDED FOR ISBNs)

**URL:** `https://www.librarything.com/work/{workId}/editions`

**Example:** `https://www.librarything.com/work/16126295/editions`

**This is the best source for ISBN data!**

**HTML Structure:**

```html
<table>
  <tr>
    <td class="ed_title">My Hero Academia, Vol. 1 (1)</td>
    <td class="ed_author">Horikoshi, Kohei</td>
    <td class="ed_isbn">1421582694 | <span class="tinytext note">9781421582696</span></td>
    <td class="ed_copies" data-sort="1004">1,004</td>
  </tr>
</table>
```

**CSS Selectors:**

- `.ed_title` - Edition title
- `.ed_author` - Author name
- `.ed_isbn` - ISBN-10 and ISBN-13 (in span)
- `.ed_copies` - Number of LibraryThing members with this edition

**ISBN parsing from `.ed_isbn`:**

```typescript
// Cell content: "1421582694 | <span class="tinytext note">9781421582696</span>"
const isbn10 = cell.textContent.match(/(\d{10})/)?.[1];
const isbn13 = cell.querySelector('.tinytext')?.textContent;
```

---

## Two Approaches for ISBN Extraction

### Approach 1: Simple (Cover Image URL Parsing)

**Flow:**

1. Navigate to series page
2. Extract work IDs + ISBNs from cover image URLs

**Regex to extract data:**

```typescript
const matches = html.matchAll(/data-workid="(\d+)".*?images-na.*?\/P\/(\d{10})/g);
// Returns: [workId, isbn10] pairs
```

**Pros:**

- One page load = all volumes with ISBNs
- Very fast

**Cons:**

- Relies on Amazon URL format (fragile)
- Only gets ISBN-10, not ISBN-13
- If Amazon changes URL structure, breaks

### Approach 2: Reliable (Editions Page Scraping)

**Flow:**

1. Navigate to series page → get work IDs
2. For each work, navigate to `/work/{id}/editions`
3. Scrape `.ed_isbn` cells

**Pros:**

- Uses semantic HTML classes (`.ed_isbn`)
- Gets both ISBN-10 and ISBN-13
- Can filter by popularity (`ed_copies`)
- More stable (LibraryThing's own markup)

**Cons:**

- One page load per volume
- 50-volume series = 50 requests
- Slower, potential rate limiting

---

## Sample Data Found

### My Hero Academia Vol. 1 - Editions Page

**26 unique ISBNs** found across all editions:

- `1421582694` / `9781421582696` - English (VIZ Media) - **1,004 copies** ← Most popular
- `4088802640` - Japanese
- `8417292853` - Spanish
- `9863824976` - Chinese/Taiwan
- `3551794626` - German
- `8545701950` - Portuguese/Brazilian
- `9791032702` - French
- `8822637755` - Italian
- ...and more

**Key insight:** The English VIZ Media edition has by far the most copies (1,004 vs single digits for others). Sorting by `ed_copies` gives the "main" English release.

### Series Page - Work IDs + ISBNs (Simple Approach)

```
Work ID      → ISBN-10        → Title
16126295     → 1421582694     → Vol. 01
16372629     → 1421582708     → Vol. 02
16372631     → 1421585103     → Vol. 03
16372632     → 1421585111     → Vol. 04
16902261     → 1421587025     → Vol. 05
17922822     → 1421588668     → Vol. 06
18321086     → 1421590409     → Vol. 07
18321087     → 1421591677     → Vol. 08
18694304     → 1421593408     → Vol. 09
19365032     → 1421594374     → Vol. 10
```

---

## Cloudflare Handling

LibraryThing uses Cloudflare protection. Detection and handling:

```typescript
async function waitForCloudflare(page: Page): Promise<void> {
  const title = await page.title();
  if (title.includes('Just a moment')) {
    console.log('Waiting for Cloudflare challenge...');
    await page.waitForFunction(() => !document.title.includes('Just a moment'), { timeout: 30000 });
    console.log('Cloudflare challenge passed');
    await page.waitForTimeout(2000); // Extra buffer
  }
}
```

---

## Browser Setup for Stealth

```typescript
import { chromium, Browser, Page } from 'playwright';

async function createStealthBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true, // Set false for debugging
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

  // Hide webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return page;
}
```

---

## Rate Limiting Recommendations

- Add 2-3 second delays between page loads
- Use caching aggressively (series data doesn't change often)
- Consider running in headed mode if getting blocked

---

## Existing Code

### Current Implementation

- `apps/api/src/scripts/librarything-browser.ts` - Search functionality
- `apps/api/src/scripts/investigate-series-works.ts` - Investigation script (can be deleted)

### npm Script

```bash
pnpm script:librarything-browser  # Runs the browser automation
```

---

## Proposed Data Flow (Full Implementation)

```
1. searchLibraryThing("my hero academia")
   → Navigate to /newsearch.php?search=...&searchtype=55
   → Parse #ajaxcontent for series links
   → Return: [{ seriesId: 12662, name: "My Hero Academia", type: "manga" }, ...]

2. getSeriesWorks(12662)
   → Navigate to /nseries/12662/My-Hero-Academia
   → Parse work shelf for work links
   → Return: [{ workId: 16126295, title: "Vol. 01" }, ...]

3. getWorkISBN(16126295) - Two options:

   Option A (Simple): Extract from series page cover images
   → Already have from step 2 if using image URL parsing

   Option B (Reliable): Navigate to /work/16126295/editions
   → Parse .ed_isbn cells
   → Return: { isbn10: "1421582694", isbn13: "9781421582696" }
```

---

## Key Selectors Reference

| Page     | Selector                                                | Data                    |
| -------- | ------------------------------------------------------- | ----------------------- |
| Search   | `#ajaxcontent a[href*="/nseries/"]`                     | Series links            |
| Series   | `a[href*="/work/"][data-workid]`                        | Work links with IDs     |
| Series   | `img[src*="images-na.ssl-images-amazon.com/images/P/"]` | Cover images with ISBNs |
| Editions | `.ed_isbn`                                              | ISBN-10 and ISBN-13     |
| Editions | `.ed_copies`                                            | Popularity count        |
| Editions | `.ed_title`                                             | Edition title           |

---

## Debug Files Location

Investigation scripts save debug files to:

```
apps/api/.cache/librarything-browser/debug/
├── series_works_investigation.html
├── series_works_investigation.png
├── work_page_investigation.html
├── work_page_investigation.png
├── editions_page_investigation.html
└── editions_page_investigation.png
```

---

## Next Steps

1. Decide on approach (Simple vs Reliable)
2. Implement full `LibraryThingBrowserClient` class with:
   - `search(query)` - Search for series
   - `getSeriesWorks(seriesId)` - Get all works in a series
   - `getWorkISBN(workId)` - Get ISBN for a work (if using Reliable approach)
3. Add caching layer
4. Integrate with existing manga search service
