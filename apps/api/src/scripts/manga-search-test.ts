/**
 * Manga Search Service - Test Suite
 *
 * Comprehensive tests for the manga search functionality including:
 * - Fuzzy search (typos, romanized names)
 * - Volume number parsing
 * - Edge cases
 * - NC Cardinal availability integration
 */

import {
  search,
  getSeriesDetails,
  parseQuery,
  type SearchResult,
  type SeriesDetails,
} from './manga-search.js';

// ============================================================================
// Test Helpers
// ============================================================================

interface TestCase {
  name: string;
  query: string;
  expected: {
    seriesFound?: boolean;
    seriesTitle?: string;
    volumeNumber?: number;
    minVolumes?: number;
    hasAvailability?: boolean;
  };
}

async function runTest(test: TestCase): Promise<{ passed: boolean; message: string }> {
  try {
    const result = await search(test.query);
    
    const checks: string[] = [];
    let passed = true;

    // Check if series was found
    if (test.expected.seriesFound !== undefined) {
      const found = result.series.length > 0;
      if (found !== test.expected.seriesFound) {
        checks.push(`Expected seriesFound=${test.expected.seriesFound}, got ${found}`);
        passed = false;
      }
    }

    // Check series title
    if (test.expected.seriesTitle) {
      const title = result.series[0]?.title?.toLowerCase() ?? '';
      const expectedTitle = test.expected.seriesTitle.toLowerCase();
      if (!title.includes(expectedTitle)) {
        checks.push(`Expected title containing "${test.expected.seriesTitle}", got "${result.series[0]?.title}"`);
        passed = false;
      }
    }

    // Check parsed volume number
    if (test.expected.volumeNumber !== undefined) {
      if (result.parsedQuery.volumeNumber !== test.expected.volumeNumber) {
        checks.push(`Expected volumeNumber=${test.expected.volumeNumber}, got ${result.parsedQuery.volumeNumber}`);
        passed = false;
      }
    }

    // Check minimum volumes found
    if (test.expected.minVolumes !== undefined) {
      if (result.volumes.length < test.expected.minVolumes) {
        checks.push(`Expected at least ${test.expected.minVolumes} volumes, got ${result.volumes.length}`);
        passed = false;
      }
    }

    // Check if availability data was returned
    if (test.expected.hasAvailability) {
      const hasAvail = result.volumes.some(v => v.availability !== undefined);
      if (!hasAvail) {
        checks.push('Expected availability data but none found');
        passed = false;
      }
    }

    return {
      passed,
      message: passed ? 'OK' : checks.join('; '),
    };
  } catch (error) {
    return {
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Test Cases
// ============================================================================

const testCases: TestCase[] = [
  // Basic searches
  {
    name: 'Basic search - Demon Slayer',
    query: 'demon slayer',
    expected: {
      seriesFound: true,
      seriesTitle: 'Demon Slayer',
      minVolumes: 20,
      hasAvailability: true,
    },
  },
  {
    name: 'Basic search - Hirayasumi',
    query: 'Hirayasumi',
    expected: {
      seriesFound: true,
      seriesTitle: 'Hirayasumi',
      minVolumes: 5,
      hasAvailability: true,
    },
  },
  {
    name: 'Basic search - Given',
    query: 'Given manga',
    expected: {
      seriesFound: true,
      seriesTitle: 'Given',
      minVolumes: 5,
      hasAvailability: true,
    },
  },

  // Fuzzy search - typos
  {
    name: 'Typo - demonslayer (no space)',
    query: 'demonslayer',
    expected: {
      seriesFound: true,
      seriesTitle: 'Demon Slayer',
    },
  },
  {
    name: 'Typo - myheroacademia',
    query: 'myheroacademia',
    expected: {
      seriesFound: true,
      seriesTitle: 'My Hero Academia',
    },
  },

  // Romanized names
  {
    name: 'Romanized - Kimetsu no Yaiba',
    query: 'Kimetsu no Yaiba',
    expected: {
      seriesFound: true,
      seriesTitle: 'Demon Slayer',
    },
  },
  {
    name: 'Romanized - Boku no Hero Academia',
    query: 'Boku no Hero Academia',
    expected: {
      seriesFound: true,
      seriesTitle: 'My Hero Academia',
    },
  },

  // Volume number parsing
  {
    name: 'Volume number - demon slayer 12',
    query: 'demon slayer 12',
    expected: {
      seriesFound: true,
      volumeNumber: 12,
    },
  },
  {
    name: 'Volume number - demon slayer vol 5',
    query: 'demon slayer vol 5',
    expected: {
      seriesFound: true,
      volumeNumber: 5,
    },
  },
  {
    name: 'Volume number - demon slayer volume 23',
    query: 'demon slayer volume 23',
    expected: {
      seriesFound: true,
      volumeNumber: 23,
    },
  },
  {
    name: 'Volume number - demon slayer #1',
    query: 'demon slayer #1',
    expected: {
      seriesFound: true,
      volumeNumber: 1,
    },
  },
];

// ============================================================================
// Query Parsing Tests
// ============================================================================

function testQueryParsing(): void {
  console.log('\n--- Query Parsing Tests ---\n');

  const parsingTests = [
    { input: 'demon slayer', expected: { title: 'demon slayer', volumeNumber: undefined } },
    { input: 'demon slayer 12', expected: { title: 'demon slayer', volumeNumber: 12 } },
    { input: 'demon slayer vol 5', expected: { title: 'demon slayer', volumeNumber: 5 } },
    { input: 'demon slayer vol. 5', expected: { title: 'demon slayer', volumeNumber: 5 } },
    { input: 'demon slayer volume 23', expected: { title: 'demon slayer', volumeNumber: 23 } },
    { input: 'demon slayer v1', expected: { title: 'demon slayer', volumeNumber: 1 } },
    { input: 'demon slayer #7', expected: { title: 'demon slayer', volumeNumber: 7 } },
    { input: 'one piece 100', expected: { title: 'one piece', volumeNumber: 100 } },
    { input: 'given', expected: { title: 'given', volumeNumber: undefined } },
    { input: '   demon slayer 12   ', expected: { title: 'demon slayer', volumeNumber: 12 } },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of parsingTests) {
    const result = parseQuery(test.input);
    const titleMatch = result.title === test.expected.title;
    const volMatch = result.volumeNumber === test.expected.volumeNumber;

    if (titleMatch && volMatch) {
      console.log(`  ✅ "${test.input}" -> title="${result.title}", vol=${result.volumeNumber ?? 'N/A'}`);
      passed++;
    } else {
      console.log(`  ❌ "${test.input}"`);
      console.log(`     Expected: title="${test.expected.title}", vol=${test.expected.volumeNumber ?? 'N/A'}`);
      console.log(`     Got:      title="${result.title}", vol=${result.volumeNumber ?? 'N/A'}`);
      failed++;
    }
  }

  console.log(`\nQuery Parsing: ${passed} passed, ${failed} failed`);
}

// ============================================================================
// Series Details Test
// ============================================================================

async function testSeriesDetails(): Promise<void> {
  console.log('\n--- Series Details Test ---\n');

  const seriesTests = [
    { title: 'Demon Slayer', expectedVolumes: 23, shouldBeComplete: true },
    { title: 'Hirayasumi', minVolumes: 5, shouldBeComplete: false },
    { title: 'Given manga', minVolumes: 5, shouldBeComplete: false },
  ];

  for (const test of seriesTests) {
    console.log(`  Testing: ${test.title}`);
    
    try {
      const details = await getSeriesDetails(test.title);
      
      if (!details) {
        console.log(`    ❌ Not found`);
        continue;
      }

      const checks: string[] = [];
      
      if (test.expectedVolumes && details.totalVolumes !== test.expectedVolumes) {
        checks.push(`volumes: expected ${test.expectedVolumes}, got ${details.totalVolumes}`);
      }
      
      if (test.minVolumes && details.totalVolumes < test.minVolumes) {
        checks.push(`volumes: expected >= ${test.minVolumes}, got ${details.totalVolumes}`);
      }

      if (test.shouldBeComplete !== undefined && details.isComplete !== test.shouldBeComplete) {
        checks.push(`complete: expected ${test.shouldBeComplete}, got ${details.isComplete}`);
      }

      if (checks.length === 0) {
        console.log(`    ✅ ${details.title}: ${details.totalVolumes} vols, ${details.availableCount} available`);
        if (details.missingVolumes.length > 0) {
          console.log(`       Missing: ${details.missingVolumes.slice(0, 5).join(', ')}${details.missingVolumes.length > 5 ? '...' : ''}`);
        }
      } else {
        console.log(`    ❌ ${checks.join(', ')}`);
      }
    } catch (error) {
      console.log(`    ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Manga Search Service - Test Suite');
  console.log('='.repeat(60));

  // Run query parsing tests (synchronous)
  testQueryParsing();

  // Run search tests
  console.log('\n--- Search Tests ---\n');

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    process.stdout.write(`  ${test.name}... `);
    const result = await runTest(test);
    
    if (result.passed) {
      console.log('✅');
      passed++;
    } else {
      console.log(`❌ ${result.message}`);
      failed++;
    }
  }

  console.log(`\nSearch Tests: ${passed} passed, ${failed} failed`);

  // Run series details tests
  await testSeriesDetails();

  console.log('\n' + '='.repeat(60));
  console.log('Test Suite Complete');
  console.log('='.repeat(60));
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
