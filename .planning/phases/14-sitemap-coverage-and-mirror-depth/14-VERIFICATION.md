---
phase: 14-sitemap-coverage-and-mirror-depth
verified: 2026-04-21T09:34:17Z
status: passed
score: 4/4 must-haves verified
---

# Phase 14: Sitemap Coverage and Mirror Depth Verification Report

**Phase Goal:** The markdown mirrors audit finding reports a meaningful coverage percentage derived from the site's actual sitemap rather than a binary home-page pass/fail — giving users an honest picture of how much of their site is mirrored.
**Verified:** 2026-04-21T09:34:17Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 40-URL sitemap → estimated N/M coverage percentage, not pass/fail | VERIFIED | `coverageLabel` on line 147 of markdown.ts: `${mirrored}/${total} sampled URLs have a mirror — estimated ${pct}% coverage`; Scenario 1 of smoke gate confirms status `warning` with `estimated` and N/M in message |
| 2 | Sitemap index (`<sitemapindex>`) → child sitemap URL count used, not 0 | VERIFIED | Lines 64–67 detect `$('sitemapindex').length > 0`, extract first `sitemap loc`, call `fetchUrlsFromSitemap`; Scenario 2 confirms `5` URLs counted from child sitemap |
| 3 | At most 20 probes regardless of sitemap size; label reads "estimated coverage" | VERIFIED | `MAX_SAMPLE = 20` (line 115), `sampleUrls(allSitemapUrls, MAX_SAMPLE)` (line 130); Scenario 3 with 100-URL sitemap confirmed headProbeCount <= 20; message always contains `estimated` |
| 4 | No sitemap → graceful warning mentioning sitemap, no throw | VERIFIED | Lines 56–58 return `null` on network error or non-200; lines 119–127 convert `null` to `status: 'warning'` with message `No sitemap found at …`; Scenario 4 confirmed |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/audit/dimensions/markdown.ts` | Sitemap-driven coverage estimator replacing binary check | VERIFIED | 193 lines, no stubs, exports `checkMarkdownMirrors`; five helpers: `fetchUrlsFromSitemap`, `fetchSitemapUrls`, `sampleUrls`, `toMdUrl`, `hasMdMirror` |
| `scripts/smoke-phase14-coverage.mjs` | Offline regression gate for all four success criteria | VERIFIED | 192 lines, four scenarios covering COV-01, COV-02, COV-03, and no-sitemap fallback; imports from `dist/` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `checkMarkdownMirrors` | `fetchSitemapUrls` | direct call line 117 | WIRED | Result assigned to `allSitemapUrls`, null-checked, then used in sample/probe path |
| `fetchSitemapUrls` | `fetchUrlsFromSitemap` (child sitemap) | call on line 67 when sitemapindex detected | WIRED | Conditional branch after `$('sitemapindex').length > 0`; result returned directly |
| `sampleUrls` | `hasMdMirror` | `Promise.all(sampled.map(...hasMdMirror))` line 131 | WIRED | Results stored in `mirrorResults`, filtered to count `mirrored` |
| `mirrored / total` | `coverageLabel` string | lines 146–147 | WIRED | `pct` computed, embedded in message returned in all three coverage-present branches |
| `smoke-phase14-coverage.mjs` | `checkMarkdownMirrors` in dist | `import` line 6 | WIRED | globalThis.fetch monkey-patched before each call; all four scenarios execute live |

### Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub patterns found in `src/audit/dimensions/markdown.ts` or `scripts/smoke-phase14-coverage.mjs`.

### Regression Check

Prior phase smoke gates run after phase 14 changes:

- `smoke-phase12-framework.mjs` — all 4 scenarios PASS, no regression
- `smoke-phase13-schema.mjs` — all 6 scenarios PASS, no regression
- `smoke-phase14-coverage.mjs` — all 4 scenarios PASS
- `tsc --noEmit` — exits 0, zero type errors

### Human Verification Required

None. All four success criteria are fully exercisable offline via the smoke gate, which monkey-patches `globalThis.fetch` and makes no real HTTP calls. The smoke gate directly asserts all message-content and status requirements.

### Gaps Summary

No gaps. All four must-haves are implemented substantively and wired end-to-end in `src/audit/dimensions/markdown.ts`. The offline regression gate (`scripts/smoke-phase14-coverage.mjs`) confirms each scenario at runtime, and TypeScript compiles clean.

---

_Verified: 2026-04-21T09:34:17Z_
_Verifier: Claude (gsd-verifier)_
