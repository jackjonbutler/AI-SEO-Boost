---
phase: 02-acquisition-pipeline
verified: 2026-04-20T10:30:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Crawl pipeline against a multi-page real site"
    expected: "Returns multiple MarkdownDocuments up to pageCap, all on same hostname"
    why_human: "example.com has only one crawlable page; multi-page BFS path needs a site with internal links to exercise batch deduplication in practice"
---

# Phase 2: Acquisition Pipeline Verification Report

**Phase Goal:** Any tool can receive a local folder path or a live URL and get back an array of clean MarkdownDocuments
**Verified:** 2026-04-20T10:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Given a folder of HTML files, the pipeline returns one MarkdownDocument per page with YAML frontmatter and chrome stripped | VERIFIED | acquireLocal() returned 2 docs for 2 HTML files; nav/header/footer/script absent from output; frontmatter contains title, url, description keys |
| 2 | Given a live URL, the pipeline crawls up to the configured page cap, respects the timeout, and returns MarkdownDocuments | VERIFIED | crawlUrl('https://example.com', {pageCap:2}) returned 1 result (cap respected); AbortSignal.timeout(ms) used per-request in code |
| 3 | All URLs in returned documents are absolute (no relative hrefs) | VERIFIED | Local: /page2 absolutised to file:///C:/page2; Crawl: regex check for (/...) patterns returned false; all hrefs in markdown are https:// |
| 4 | A page that fails to fetch or parse returns an error entry instead of crashing the pipeline | VERIFIED | Local: directory named bad.html produced AcquisitionError with EISDIR message; Crawl: unreachable domain returned AcquisitionError entry, no throw |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/index.ts` | MarkdownDocument, AcquisitionError, AcquisitionResult, isAcquisitionError | VERIFIED | All 4 exports present; isAcquisitionError correctly discriminates at runtime; no imports from other src/ modules |
| `src/processing/strip.ts` | stripChrome(rawHtml, pageUrl?) returning StripResult | VERIFIED | 63 lines; exports stripChrome; removes nav/header/footer/script/style; absolutises hrefs before removal; prefers main > article > body |
| `src/processing/convert.ts` | convertToMarkdown(cleanHtml) using Turndown | VERIFIED | 19 lines; singleton TurndownService at module level; exports convertToMarkdown; returns non-empty Markdown for valid HTML |
| `src/acquisition/local.ts` | acquireLocal(folderPath) FS-walk pipeline | VERIFIED | 54 lines; exports acquireLocal; recursive readdir; per-file try/catch; pathToFileURL for file:// URIs |
| `src/acquisition/crawl.ts` | crawlUrl(seedUrl, opts) BFS crawler | VERIFIED | 154 lines; exports crawlUrl, CrawlOptions, DEFAULT_CRAWL_OPTIONS; BFS with p-limit; AbortSignal.timeout per-request; visited Set at enqueue time |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| local.ts | strip.ts | import { stripChrome } | WIRED | Import present and stripChrome called on every file's raw HTML |
| local.ts | convert.ts | import { convertToMarkdown } | WIRED | Import present and convertToMarkdown called with stripChrome result |
| crawl.ts | strip.ts | import { stripChrome } | WIRED | Import present and stripChrome called in fetchPage() |
| crawl.ts | convert.ts | import { convertToMarkdown } | WIRED | Import present and convertToMarkdown called with stripChrome result |
| strip.ts | cheerio | import * as cheerio | WIRED | cheerio.load() called in stripChrome body |
| convert.ts | turndown | import TurndownService | WIRED | TurndownService instantiated at module level; td.turndown() called in export |
| crawl.ts | p-limit | import pLimit | WIRED | pLimit(opts.concurrency) called; limit() wrapper used in batch.map() |
| crawl.ts | visited Set | visited.add() at enqueue | WIRED | visited.add(link) called before queue.push(link) — deduplication at enqueue time confirmed in code and at runtime |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| Local folder → MarkdownDocument per HTML file with frontmatter and chrome stripped | SATISFIED | Verified with 2-page folder; frontmatter keys title/url/description populated |
| Live URL → crawl up to pageCap, respect timeout | SATISFIED | pageCap enforced; AbortSignal.timeout() per-request in fetchPage() |
| All URLs in returned documents are absolute | SATISFIED | stripChrome absolutises hrefs before chrome removal; crawl uses same strip pipeline |
| Failed page → AcquisitionError entry, not crash | SATISFIED | Both local (EISDIR test) and crawl (invalid domain) return error entries without throwing |

### Anti-Patterns Found

No anti-patterns detected across any of the five source files:
- Zero TODO/FIXME/PLACEHOLDER/XXX comments
- No console.log() calls (debug uses console.error() per project convention)
- No empty return null / return {} implementations
- No stub patterns
- TurndownService correctly instantiated once at module level (not inside function)

### Human Verification Required

#### 1. Multi-page BFS crawl coverage

**Test:** Point crawlUrl at a real site with abundant internal links (e.g. a blog or docs site), set pageCap to 10, concurrency to 3
**Expected:** Returns up to 10 MarkdownDocuments, all with the same hostname, no URL duplicated, each with non-empty title and markdown
**Why human:** example.com has only one crawlable page; the BFS batch-deduplication loop and concurrency cap are correct by code inspection but have not been exercised against a site with multiple same-domain pages

### Notable Implementation Detail

`acquireLocal()` throws to the caller if `fs.readdir()` fails (e.g. the folder path does not exist). Only per-file errors inside the loop are converted to `AcquisitionError` entries. This is not a gap relative to the ROADMAP criteria — the success criteria specifies "a page that fails to fetch or parse" produces an error entry, which is satisfied. The folder-level throw is appropriate and will surface as an MCP tool error at the boundary where tools call acquireLocal. No action required.

### TypeScript Compilation

- `npx tsc --noEmit`: exits 0, zero errors
- `npm run build` (tsc): exits 0, all five modules emitted to dist/

---

_Verified: 2026-04-20T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
