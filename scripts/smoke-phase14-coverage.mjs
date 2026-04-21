// scripts/smoke-phase14-coverage.mjs
// Offline regression gate for COV-01, COV-02, COV-03 and the no-sitemap fallback.
// Monkey-patches globalThis.fetch before importing the module under test so all
// network calls are intercepted — no actual HTTP requests are made.

import { checkMarkdownMirrors } from '../dist/audit/dimensions/markdown.js';

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`[PASS] ${label}`);
  passed++;
}

function fail(label, reason) {
  console.error(`[FAIL] ${label}: ${reason}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal <urlset> with n <url><loc> entries. */
function buildUrlset(count, base = 'https://example.com/page-') {
  const locs = Array.from({ length: count }, (_, i) =>
    `  <url><loc>${base}${i + 1}</loc></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs}
</urlset>`;
}

/** Build a minimal <sitemapindex> with one child sitemap. */
function buildSitemapIndex(childUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${childUrl}</loc></sitemap>
</sitemapindex>`;
}

/** Build a minimal <urlset> with n entries for Scenario 2's child sitemap. */
function buildChildUrlset(count, base = 'https://example.com/post-') {
  return buildUrlset(count, base);
}

// ---------------------------------------------------------------------------
// Scenario 1: Regular sitemap, 40 URLs, partial mirror coverage (COV-01)
// 8 HEAD probes return 200, rest 404 → 8/20 = 40% → status 'warning'
// ---------------------------------------------------------------------------
try {
  let headCount = 0;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/sitemap.xml')) {
      return { status: 200, text: async () => buildUrlset(40) };
    }
    // HEAD probes for /index.md mirrors
    if (opts && opts.method === 'HEAD') {
      headCount++;
      // First 8 probes → 200, rest → 404
      return { status: headCount <= 8 ? 200 : 404 };
    }
    return { status: 404, text: async () => '' };
  };

  const finding = await checkMarkdownMirrors('https://example.com');

  if (finding.status !== 'warning') {
    fail('Scenario 1: Regular sitemap partial coverage', `expected status 'warning', got '${finding.status}'`);
  } else if (!finding.message.includes('estimated')) {
    fail('Scenario 1: Regular sitemap partial coverage', `message should include 'estimated': ${finding.message}`);
  } else if (!finding.message.includes('/')) {
    fail('Scenario 1: Regular sitemap partial coverage', `message should include '/' (N/M format): ${finding.message}`);
  } else if (finding.message.includes('index.md')) {
    fail('Scenario 1: Regular sitemap partial coverage', `message should NOT include 'index.md': ${finding.message}`);
  } else {
    pass('Scenario 1: Regular sitemap, partial coverage reports estimated percentage');
  }
} catch (err) {
  fail('Scenario 1: Regular sitemap partial coverage', `unexpected throw: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Scenario 2: Sitemap index file, child sitemap has 5 URLs (COV-02)
// All HEAD probes 404 → 0% coverage → status 'fail'
// Message must mention the count (5 or 0/5) and 'estimated'
// ---------------------------------------------------------------------------
try {
  const childUrl = 'https://example.com/sitemap-posts.xml';
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/sitemap.xml')) {
      return { status: 200, text: async () => buildSitemapIndex(childUrl) };
    }
    if (urlStr === childUrl) {
      return { status: 200, text: async () => buildChildUrlset(5) };
    }
    // HEAD probes: all 404
    if (opts && opts.method === 'HEAD') {
      return { status: 404 };
    }
    return { status: 404, text: async () => '' };
  };

  const finding = await checkMarkdownMirrors('https://example.com');

  if (finding.status !== 'fail') {
    fail('Scenario 2: Sitemap index → child sitemap', `expected status 'fail', got '${finding.status}' — ${finding.message}`);
  } else if (!finding.message.includes('estimated')) {
    fail('Scenario 2: Sitemap index → child sitemap', `message should include 'estimated': ${finding.message}`);
  } else if (!finding.message.includes('5') && !finding.message.includes('0/5')) {
    fail('Scenario 2: Sitemap index → child sitemap', `message should reference 5 URLs: ${finding.message}`);
  } else {
    pass('Scenario 2: Sitemap index → child sitemap URLs counted correctly (not 0)');
  }
} catch (err) {
  fail('Scenario 2: Sitemap index → child sitemap', `unexpected throw: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Scenario 3: Large sitemap (100 URLs), sample cap enforced (COV-03)
// HEAD probe count must be ≤ 20; message must mention '20' or denominator ≤ 20
// ---------------------------------------------------------------------------
try {
  let headProbeCount = 0;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/sitemap.xml')) {
      return { status: 200, text: async () => buildUrlset(100) };
    }
    if (opts && opts.method === 'HEAD') {
      headProbeCount++;
      return { status: 404 };
    }
    return { status: 404, text: async () => '' };
  };

  const finding = await checkMarkdownMirrors('https://example.com');

  if (headProbeCount > 20) {
    fail('Scenario 3: Sample cap enforced', `expected ≤ 20 HEAD probes, got ${headProbeCount}`);
  } else if (!finding.message.includes('20') && !/\d+\/(\d+)/.test(finding.message)) {
    fail('Scenario 3: Sample cap enforced', `message should show denominator ≤ 20: ${finding.message}`);
  } else {
    // Extract denominator from N/M pattern and verify it's ≤ 20
    const match = finding.message.match(/(\d+)\/(\d+)/);
    const denominator = match ? parseInt(match[2], 10) : null;
    if (denominator !== null && denominator > 20) {
      fail('Scenario 3: Sample cap enforced', `denominator in message is ${denominator} — expected ≤ 20`);
    } else {
      pass('Scenario 3: Sample cap enforced — at most 20 HEAD probes');
    }
  }
} catch (err) {
  fail('Scenario 3: Sample cap enforced', `unexpected throw: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Scenario 4: No sitemap (404 on /sitemap.xml), graceful fallback
// Must return status 'warning' with sitemap-related message, no throw
// ---------------------------------------------------------------------------
try {
  globalThis.fetch = async (url, _opts) => {
    return { status: 404, text: async () => '' };
  };

  const finding = await checkMarkdownMirrors('https://example.com');

  if (finding.status !== 'warning') {
    fail('Scenario 4: No sitemap graceful fallback', `expected status 'warning', got '${finding.status}'`);
  } else if (!finding.message.toLowerCase().includes('sitemap')) {
    fail('Scenario 4: No sitemap graceful fallback', `message should mention 'sitemap': ${finding.message}`);
  } else {
    pass('Scenario 4: No sitemap → graceful warning, no throw');
  }
} catch (err) {
  fail('Scenario 4: No sitemap graceful fallback', `unexpected throw: ${err.message}`);
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Phase 14 smoke FAILED — COV-01/COV-02/COV-03 regression detected');
  process.exit(1);
}
console.log('All Phase 14 smoke scenarios passed. COV-01, COV-02, COV-03 closed.');
process.exit(0);
