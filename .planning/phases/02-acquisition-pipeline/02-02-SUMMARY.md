---
phase: 02-acquisition-pipeline
plan: 02
subsystem: api
tags: [crawl, fetch, bfs, p-limit, cheerio, acquisition, typescript, url-crawling]

# Dependency graph
requires:
  - phase: 02-01
    provides: stripChrome, convertToMarkdown, AcquisitionResult types, MarkdownDocument, AcquisitionError
  - package: p-limit@6 (installed in 02-01)
  - package: cheerio (installed in 02-01)

provides:
  - crawlUrl(seedUrl, opts) in src/acquisition/crawl.ts — BFS crawler returning AcquisitionResult[]
  - CrawlOptions interface (pageCap, concurrency, timeoutMs)
  - DEFAULT_CRAWL_OPTIONS (pageCap:50, concurrency:3, timeoutMs:10000)

affects:
  - 03-content-generators (all URL-based tools will call crawlUrl to acquire page data)
  - Phase 2 complete — both acquisition branches (local + crawl) are now implemented

# Tech tracking
tech-stack:
  added: []
  patterns:
    - BFS crawl with p-limit concurrency (not Promise.all directly) — honors concurrency cap per batch
    - AbortSignal.timeout(ms) per-request — each fetch is independent; slow pages don't cancel others
    - visited Set updated at enqueue time — prevents duplicate fetches across concurrent batches
    - extractSameDomainLinks runs on raw HTML before stripChrome — nav/header have the most links
    - Same-domain check uses hostname comparison (not string prefix) — prevents subdomain spoofing
    - Fragment stripping on discovered links (abs.hash = '') — same page with different anchors counted once
    - Error-safe: every fetch path ends in AcquisitionError or MarkdownDocument — never throws to caller

key-files:
  created:
    - src/acquisition/crawl.ts
  modified: []

key-decisions:
  - "crawlUrl uses BFS batch processing: take up to concurrency URLs per batch, await Promise.all, then enqueue discovered links — maintains breadth-first order"
  - "Link discovery on raw HTML (before stripChrome): nav, header, and footer contain the richest internal link sets; stripping first would lose them"
  - "Hostname comparison for same-domain: prevents 'example.com.evil.com' passing a naive startsWith check"
  - "No iconv-lite for v1: UTF-8 only — documented limitation, not a bug"

patterns-established:
  - "Acquisition pipeline complete: acquireLocal() for file:// paths, crawlUrl() for https:// URLs"
  - "Both branches return AcquisitionResult[] with identical MarkdownDocument shape — tools are branch-agnostic"

# Metrics
duration: ~4 min
completed: 2026-04-20
---

# Phase 2 Plan 2: URL Crawl Acquisition Summary

**BFS web crawler with p-limit concurrency, per-request AbortSignal.timeout(), same-domain filtering, and hard page cap — completing the acquisition pipeline so all MCP tools can accept live URLs**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-20T09:44:48Z
- **Completed:** 2026-04-20T09:48:10Z
- **Tasks:** 2
- **Files modified:** 1 created (crawl.ts)

## Accomplishments

- Built `src/acquisition/crawl.ts` exporting `crawlUrl()`, `CrawlOptions`, and `DEFAULT_CRAWL_OPTIONS`
- BFS crawler: processes pages in concurrency-sized batches, discovers same-domain links from raw HTML before stripping, enqueues with deduplication via visited Set
- Each HTTP fetch uses its own `AbortSignal.timeout(timeoutMs)` — independent; a slow page does not cancel concurrent fetches
- Same-domain filtering uses `abs.hostname === baseDomain` (not string prefix) to prevent subdomain spoofing
- Fragment stripping on discovered links ensures the same page with different anchors is fetched once
- Error-safe: non-2xx responses and network failures both produce `AcquisitionError` entries; `crawlUrl` never throws
- Full integration verification: all 4 Phase 2 ROADMAP success criteria confirmed

## Task Commits

1. **Task 1: Build crawl acquisition — crawl.ts** - `157bd7c` (feat)
2. **Task 2: Verify full acquisition pipeline end-to-end** - no new files (verification only)

## Files Created/Modified

- `src/acquisition/crawl.ts` — BFS crawler with p-limit, AbortSignal, same-domain filtering

## Decisions Made

- Link discovery runs on raw HTML before `stripChrome`: nav/header elements contain the richest internal link sets; stripping first would lose them
- `hostname` comparison for same-domain check: prevents a subdomain like `example.com.evil.com` passing a naive string-prefix test
- BFS batching: each batch is `Math.min(concurrency, queue.length, pageCap - results.length)` — never overfetches beyond cap even in final batch

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Environment] Windows /tmp path resolution**
- **Found during:** Task 2
- **Issue:** Plan specifies `/tmp/phase2-test` for local acquisition smoke test; Node on Windows resolves `/tmp` as `C:\tmp` which does not exist
- **Fix:** Used `./test-tmp-phase2/` within project root for test files; deleted after verification
- **Files modified:** None (temp files only, deleted post-test)
- **Commit:** n/a (no source changes)

## Phase 2 ROADMAP Success Criteria — All Verified

1. **Local:** `acquireLocal('./test-tmp-phase2')` returned 2 docs with title, markdown, `file://` URL — PASS
2. **Crawl:** `crawlUrl('https://example.com', { pageCap: 3, ... })` returned 1 doc respecting cap — PASS
3. **Absolute URLs:** No relative hrefs (`href="/"` pattern) in any returned `doc.markdown` — PASS
4. **Error safety:** Unreachable URL (`this-domain-does-not-exist-12345.invalid`) returned `AcquisitionError` entry without throwing — PASS

## Next Phase Readiness

- Phase 2 complete: both `acquireLocal()` (local HTML folders) and `crawlUrl()` (live URLs) are implemented
- All content-generating tools in Phase 3 can call either function and handle `AcquisitionResult[]` uniformly
- `isAcquisitionError` guard enables clean error filtering downstream
- Concern carried forward: iconv-lite for charset detection is deferred to v2; UTF-8 only for v1

---
*Phase: 02-acquisition-pipeline*
*Completed: 2026-04-20*
