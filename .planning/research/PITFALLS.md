# Domain Pitfalls

**Domain:** TypeScript MCP Server + AI SEO Tooling (HTML crawling, markdown conversion, schema markup, sitemaps, llms.txt)
**Researched:** 2026-04-17 (original); 2026-04-20 (v1.2 addendum)
**Confidence Note:** WebSearch and external docs were unavailable during this session. All findings are based on training-data knowledge of the MCP SDK (@modelcontextprotocol/sdk), Cheerio/JSDOM, Turndown, JSON-LD spec, Sitemap protocol, and llms.txt spec. Confidence levels reflect this.

---

## Critical Pitfalls

Mistakes that cause rewrites, silent data corruption, or broken MCP tool behavior.

---

### Pitfall 1: Wrong MCP Transport for the Deployment Context

**What goes wrong:** Developer defaults to `StdioServerTransport` but ships the server in a context where stdio is not available (e.g., a long-running HTTP service, a container without a TTY). Alternatively, uses `SSEServerTransport` without proper CORS headers and the client silently fails to connect.

**Why it happens:** The MCP SDK ships with Stdio as the "hello world" example. SSE transport is less documented. HTTP Streamable transport (added in MCP spec 2025-03-26) is newer and easy to miss.

**Consequences:** The server appears to start but tools are never callable. No error is thrown — the connection just never establishes.

**Prevention:**
- Decide transport at project start: Stdio for Claude Desktop / local CLI use; SSE or HTTP Streamable for web/remote use.
- If building for Claude Desktop, commit to Stdio and never introduce HTTP-only logic into the same server entry point.
- If building for remote access, set `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers` explicitly on the SSE endpoint from day one.

**Detection:** Tool calls return "connection refused" or hang indefinitely. Check `netstat` / process list to confirm the server process is alive but not responding.

**Phase:** Foundation / MCP server setup (Phase 1).

---

### Pitfall 2: Tool Input Schema Mismatch Causes Silent Tool Failures

**What goes wrong:** The JSON Schema defined for a tool's `inputSchema` does not match what the tool handler actually reads. For example, schema says `url` is required but the handler reads `targetUrl`. The MCP client passes the schema-correct name; the handler receives `undefined` and either crashes or returns garbage output.

**Why it happens:** TypeScript types and JSON Schema are maintained separately. Refactoring one without the other is easy. The SDK validates inbound args against the schema — if the schema is loose (no `required`, `additionalProperties: true`), mismatches go undetected.

**Consequences:** Tools silently receive `undefined` for key parameters. SEO audits run against no URL, markdown conversion converts nothing, etc.

**Prevention:**
- Define a Zod schema for each tool's input and derive both the JSON Schema (`z.toJsonSchema()` or `zodToJsonSchema`) AND the TypeScript type from it. Single source of truth.
- Set `additionalProperties: false` on all tool input schemas to catch unexpected keys.
- Write at least one integration test per tool that passes the exact schema-described payload and asserts the handler receives it correctly.

**Detection:** Handler logs show `undefined` for expected parameters. Run the MCP Inspector (`npx @modelcontextprotocol/inspector`) against your server and manually invoke each tool.

**Phase:** Foundation / tool schema design (Phase 1). Schema discipline must be established before any tool is built.

---

### Pitfall 3: Relative URL Resolution Breaks Downstream SEO Artifacts

**What goes wrong:** When crawling a page, links and resource references (`href`, `src`, `action`) are extracted as-is. Relative URLs (`/about`, `../images/logo.png`, `?page=2`) are stored or emitted into sitemaps, llms.txt, and schema markup without being resolved to absolute URLs.

**Why it happens:** Cheerio extracts attribute values verbatim. Developers iterate `$('a').attr('href')` and collect whatever comes back without resolving against the base URL.

**Consequences:**
- Sitemap contains relative URLs → Google rejects the sitemap silently.
- Schema markup `url` fields contain relative paths → validators flag them as invalid.
- llms.txt links are unresolvable by LLM crawlers.
- Internal link audits are wrong because `/about` from `https://example.com/blog/` resolves to `https://example.com/about` but might be assumed to be `https://example.com/blog/about`.

**Prevention:**
- Resolve every extracted URL immediately at extraction time using `new URL(rawHref, pageBaseUrl).href`.
- Track `pageBaseUrl` as the resolved URL after following all redirects (not the originally requested URL).
- Respect `<base href="...">` tags — extract and apply them before resolving any relative URLs on the page.

**Detection:** Sitemap validator (Google Search Console or `xmllint`) rejects the sitemap. Any link starting with `/` or `../` in output artifacts.

**Phase:** HTML parsing / crawl engine (Phase 2).

---

### Pitfall 4: JS-Rendered Content Treated as Full Page Content

**What goes wrong:** The crawler fetches HTML with `fetch()` or `axios` and parses the raw server response. For SPAs (React, Vue, Next.js client-side routes) or any page that loads content via `fetch`/XHR after DOM ready, the raw HTML is an empty shell. The extracted text, links, and metadata reflect only the shell — not the actual content.

**Why it happens:** `fetch()` gets the initial HTTP response only. JavaScript execution is not part of HTTP.

**Consequences:**
- AI SEO audit reports "no content" for pages that are full of content in the browser.
- llms.txt and schema markup are generated from skeleton HTML.
- Markdown conversion produces only navigation and footer fragments.

**Prevention:**
- Accept this as a known limitation and surface it explicitly to users: "This tool analyzes server-rendered HTML. JavaScript-rendered content is not supported without a headless browser."
- For Phase 1, document the limitation in tool descriptions so Claude communicates it to users.
- For a later phase, optionally integrate Playwright or Puppeteer for headless rendering. But treat this as a separate tool/mode — don't try to auto-detect and switch, it adds enormous complexity.
- When the fetched body contains `<div id="root"></div>` or similar empty mount points, return a warning rather than silently analyzing an empty page.

**Detection:** Extracted text length is suspiciously short for a known content-heavy page. Body contains React/Vue root elements with no children.

**Phase:** Crawl engine (Phase 2); headless option deferred to later phase.

---

### Pitfall 5: Navigation / Chrome Bleeding Into Markdown Output

**What goes wrong:** The HTML-to-markdown converter receives the full `<body>` and faithfully converts `<nav>`, `<header>`, `<footer>`, cookie banners, social share widgets, and ad containers into markdown. The resulting markdown is cluttered with off-topic content that degrades AI SEO quality and LLM comprehension.

**Why it happens:** Turndown (the standard HTML-to-markdown library) converts whatever HTML it receives. It has no concept of "page chrome" vs "main content."

**Consequences:**
- llms.txt generated from this markdown contains navigation menus as content.
- AI reading the markdown gets confused by irrelevant link lists.
- Schema markup `description` fields are polluted with nav text.

**Prevention:**
- Before passing to Turndown, use Cheerio to remove chrome selectors: `nav`, `header`, `footer`, `[role="banner"]`, `[role="navigation"]`, `[role="complementary"]`, `.cookie-banner`, `#cookie-notice`, `[aria-hidden="true"]`, `script`, `style`, `noscript`, `iframe`.
- Prefer the `<main>` or `[role="main"]` element if it exists; fall back to `<body>` minus removed elements.
- Never generate llms.txt or schema descriptions from unfiltered body HTML.

**Detection:** Generated markdown contains repeated link lists that match the site navigation. Word count of markdown greatly exceeds visible article text.

**Phase:** HTML stripping / markdown conversion (Phase 2).

---

### Pitfall 6: Character Encoding Corruption in Crawled Content

**What goes wrong:** Page is fetched and decoded as UTF-8 by default, but the page is actually ISO-8859-1, Windows-1252, or another encoding. Special characters (em dashes, curly quotes, accented characters) become mojibake (`â€™` instead of `'`).

**Why it happens:** `fetch()` / `axios` don't always honor `Content-Type: text/html; charset=windows-1252` correctly. HTML `<meta charset>` declarations are ignored by the HTTP client.

**Consequences:**
- Markdown content contains garbled text.
- Schema markup descriptions contain invalid characters.
- Sitemap URLs with non-ASCII characters are not properly percent-encoded.

**Prevention:**
- After fetching, read `Content-Type` response header for `charset` parameter first.
- If absent or UTF-8, also check `<meta charset="...">` and `<meta http-equiv="Content-Type" content="...">` in the first 1024 bytes.
- Use `iconv-lite` to decode the raw buffer using the detected charset before parsing with Cheerio.
- In sitemaps, percent-encode all non-ASCII characters in URLs per RFC 3986.

**Detection:** Output contains multi-byte sequences like `Ã©` or `â€™`. Test against known non-UTF-8 pages (older government/news sites often use Windows-1252).

**Phase:** Crawl engine / fetch layer (Phase 2).

---

### Pitfall 7: Invalid JSON-LD (Schema Markup) That Passes Visual Inspection

**What goes wrong:** Generated JSON-LD looks correct to human eyes but fails Google Rich Results Test because:
- `@context` is wrong (`"http://schema.org"` instead of `"https://schema.org"`)
- Required properties for the type are missing (e.g., `Article` without `headline`, `datePublished`)
- `url` field is relative instead of absolute
- `image` is a string when an `ImageObject` is required
- Multiple `@type` values provided as a string instead of an array

**Why it happens:** Schema.org spec has many subtle required/recommended property distinctions. The JSON structure looks valid JSON but violates schema.org semantics.

**Consequences:**
- Rich results are not generated in Google Search.
- Google Search Console reports schema errors.
- The tool appears to work but produces no SEO benefit.

**Prevention:**
- Always use `"https://schema.org"` (HTTPS, no trailing slash) for `@context`.
- Build typed TypeScript interfaces for each supported `@type` (Article, WebPage, Organization, BreadcrumbList, FAQPage) that enforce required fields at compile time.
- Always embed generated JSON-LD in a `<script type="application/ld+json">` block (not inline attributes).
- Validate generated output against Google's Rich Results Test API or schema.org validator in integration tests.
- Use a library like `schema-dts` (TypeScript types for schema.org) to catch type errors at build time.

**Detection:** Run output through `https://validator.schema.org/` — do not rely on JSON.stringify formatting alone.

**Phase:** Schema markup generation (Phase 3).

---

### Pitfall 8: Sitemap Generation Encoding and URL Normalization Errors

**What goes wrong:** Generated sitemap.xml contains:
- Unescaped XML special characters in URLs (`&` instead of `&amp;`)
- Relative URLs
- Duplicate URLs with/without trailing slashes treated as distinct
- `lastmod` dates in wrong format (not W3C datetime: `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS+00:00`)
- URLs exceeding 2048 characters
- More than 50,000 URLs in a single sitemap file (spec limit)

**Why it happens:** String concatenation to build XML is error-prone. Date handling in JavaScript frequently produces locale-formatted strings rather than ISO 8601.

**Consequences:**
- Google rejects or partially processes the sitemap.
- Search Console reports "Sitemap could not be read."
- Duplicate content signals if trailing-slash inconsistency is not normalized.

**Prevention:**
- Use an XML builder library (not string templates) for sitemap generation. `xmlbuilder2` is a good choice.
- Normalize all URLs: pick a canonical form (trailing slash or no trailing slash) and apply consistently. Redirect or canonicalize the other.
- Always format `lastmod` with `new Date().toISOString().split('T')[0]` for date-only format, or full ISO 8601 for datetime.
- Enforce the 50,000 URL / 50MB limit and split into sitemap index files if exceeded.

**Detection:** Run output through `xmllint --noout sitemap.xml`. Submit to Google Search Console and check for processing errors.

**Phase:** Sitemap generation (Phase 3).

---

### Pitfall 9: robots.txt Generation That Blocks Legitimate Crawlers

**What goes wrong:** Generated `robots.txt` is overly restrictive:
- `Disallow: /` for all user-agents (accidentally blocks everything)
- Missing `Sitemap:` directive pointing to the generated sitemap
- Rules for specific bots (GPTBot, ClaudeBot, PerplexityBot) that user didn't intend to block
- Duplicate `User-agent` blocks that create ambiguous precedence

**Why it happens:** robots.txt is simple-looking but has subtle precedence rules. Generating it programmatically without understanding which rules override others is risky.

**Consequences:**
- Googlebot is blocked → site disappears from search.
- AI crawlers are blocked when user wants AI discoverability (contrary to the entire purpose of this tool).
- Sitemap is not discoverable by crawlers.

**Prevention:**
- Always include `Sitemap: https://[domain]/sitemap.xml` directive.
- Default generated robots.txt to permissive (`Allow: /` for all major bots).
- Explicitly allow AI crawlers by default: `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Googlebot-Extended`, `CCBot`.
- Provide a diff preview of generated robots.txt changes before writing to disk.
- Never overwrite an existing robots.txt without explicit user confirmation — append to existing rules instead.

**Detection:** Run `curl https://[domain]/robots.txt` and manually verify. Use Google Search Console's robots.txt tester.

**Phase:** robots.txt generation (Phase 3).

---

### Pitfall 10: llms.txt Non-Compliance With the Emerging Spec

**What goes wrong:** Generated llms.txt:
- Uses incorrect section headers (spec requires `# Title`, `## Section Name` — not arbitrary headings)
- Omits the required top-level `# [Site Name]` H1
- Lists URLs without descriptions (the spec expects `- [Description](url)` format in sections)
- Includes binary resource URLs (images, PDFs) without the `.md` variant where available
- Exceeds practical size limits (LLMs have context windows — a 500KB llms.txt defeats the purpose)

**Why it happens:** The llms.txt spec (llmstxt.org) was formalized in 2024 and is still evolving. Many implementations are based on informal descriptions rather than the actual spec.

**Consequences:**
- LLM crawlers cannot parse the file correctly.
- The tool's primary value proposition (AI discoverability) is undermined.
- Users who validate against spec-compliant checkers get errors.

**Prevention:**
- Read the canonical spec at `https://llmstxt.org` before implementing — do not rely on secondary sources.
- Required structure: `# Site Name` (H1), optional blockquote description, then `## Section` (H2) blocks, each containing markdown links with descriptions.
- Keep llms.txt under 100KB for a single file; offer llms-full.txt for complete content.
- Test generated output with the llmstxt.org validator if one exists.

**Detection:** Feed generated file to an LLM and ask it to parse the site structure — if it struggles, the format is wrong.

**Phase:** llms.txt generation (Phase 3). Needs phase-specific research to verify current spec before implementation.

---

### Pitfall 11: Rate Limiting and Timeout Handling in the Crawl Engine

**What goes wrong:** The crawler hammers a target site with concurrent requests, receives 429 or 503 responses, and either crashes or silently skips pages without reporting errors. Alternatively, a single hanging connection blocks the entire crawl with no timeout.

**Why it happens:** `fetch()` has no built-in concurrency limiting or timeout. Developers write `Promise.all(pages.map(fetch))` which fires all requests simultaneously.

**Consequences:**
- User's IP gets temporarily blocked by the target site.
- MCP tool call hangs indefinitely (Claude waits forever for a response).
- Partial crawl results returned without indication that pages were skipped.

**Prevention:**
- Use a concurrency limiter: `p-limit` with a default of 2-3 concurrent requests.
- Add `AbortSignal.timeout(10000)` (10s) to every `fetch()` call.
- Implement exponential backoff on 429/503: wait 1s, 2s, 4s before giving up.
- Return a structured result that includes `{ crawled: [], failed: [{ url, reason }] }` — never silently drop failures.
- Respect `Crawl-delay` directive in robots.txt.

**Detection:** Network tab shows requests fired simultaneously. A single slow URL causes the whole tool call to time out in Claude.

**Phase:** Crawl engine (Phase 2).

---

### Pitfall 12: MCP Tool Calls That Block for Too Long

**What goes wrong:** A tool that crawls 50 pages, generates a full sitemap, validates schema, and writes files all in one synchronous MCP tool call takes 60-120 seconds. Claude's MCP client times out (typically 30-60s) and the user gets an error, even though the work was actually completed on the server side.

**Why it happens:** MCP tools are designed for fast, discrete operations. Long-running workflows are not natively supported in the basic request/response model.

**Consequences:**
- User sees a timeout error after waiting a minute.
- Server may have completed the work, but result is lost.
- No progress feedback during the operation.

**Prevention:**
- Break large workflows into multiple discrete tool calls: `start_crawl` returns a `crawl_id`, `get_crawl_status` polls progress, `get_crawl_results` retrieves output.
- Alternatively, use MCP's progress notification mechanism (`server.sendNotification` with `notifications/progress`) if the client supports it.
- Set internal timeouts: if a crawl exceeds 45s, return partial results with a `partial: true` flag rather than hanging.
- Cap single-call crawl depth: max 10-20 pages per tool call, require pagination for larger sites.

**Detection:** Tool calls that involve crawling multiple pages reliably time out in testing.

**Phase:** MCP server architecture (Phase 1) — must be designed in before crawling is built.

---

## Moderate Pitfalls

---

### Pitfall 13: Cheerio Selector Brittleness on Real-World HTML

**What goes wrong:** Content extraction selectors (`article`, `main`, `.post-content`) work on the 5 sites tested during development and fail on the 95th percentile of real sites that use non-semantic div soup, custom class names, or framework-generated class hashes.

**Prevention:**
- Use a priority fallback chain: `main` → `[role="main"]` → `article` → `.content` / `.post-content` / `.entry-content` → `body` (minus nav/footer).
- Never hard-code site-specific selectors in the core library.
- Log which fallback level was used so users can understand extraction quality.

**Phase:** HTML parsing (Phase 2).

---

### Pitfall 14: Turndown Produces Broken Markdown Links

**What goes wrong:** Turndown converts `<a href="/page">Text</a>` to `[Text](/page)` — a relative markdown link. When this markdown is consumed by an LLM or embedded in llms.txt, the link is unresolvable.

**Prevention:**
- Pass HTML through the URL absolutization step (Pitfall 3) before sending to Turndown.
- Or use a Turndown plugin to absolutize links during conversion using the base URL.

**Phase:** Markdown conversion (Phase 2).

---

### Pitfall 15: `robots.txt` Fetch Errors Treated as "No robots.txt"

**What goes wrong:** If fetching `robots.txt` returns a network error or non-200 status, the crawler treats it as "no restrictions" and proceeds to crawl everything. If the server is temporarily down, this is correct. If the URL is wrong or the crawl is of a local file, this silently skips a protection mechanism.

**Prevention:**
- Distinguish between 404 (no robots.txt, crawl permitted) and 5xx/network error (server error, do not crawl).
- For local HTML file crawling, robots.txt checking is irrelevant — skip it explicitly rather than falling through.

**Phase:** Crawl engine (Phase 2).

---

### Pitfall 16: Schema Markup `datePublished` / `dateModified` Format

**What goes wrong:** Dates are passed as `new Date().toString()` (locale-specific, human-readable) instead of ISO 8601 (`2026-04-17T12:00:00+00:00`).

**Prevention:**
- Always use `new Date().toISOString()` for schema.org date properties.
- Never use `toLocaleDateString()` or `toString()` in any SEO artifact output.

**Phase:** Schema markup generation (Phase 3).

---

### Pitfall 17: MCP Tool Descriptions Too Vague for Claude to Use Correctly

**What goes wrong:** Tool `description` fields say things like "processes a website" or "generates SEO files." Claude cannot determine which tool to call, calls the wrong one, or passes incorrect arguments.

**Why it happens:** Developers write descriptions for human readers, not for LLM tool selection.

**Consequences:**
- Claude calls `audit_seo` when user wants `generate_sitemap`.
- Claude passes a local file path to a URL-crawling tool.

**Prevention:**
- Write tool descriptions as explicit contracts: "Fetches a URL, strips navigation HTML, and returns clean markdown text. Input: absolute URL. Output: markdown string. Does NOT write files."
- Include what the tool does NOT do, what format inputs must be in, and what the output format is.
- Test descriptions by asking Claude to pick the right tool from a description of the user's intent — without looking at argument names.

**Phase:** MCP server setup (Phase 1).

---

## Minor Pitfalls

---

### Pitfall 18: Sitemap `<loc>` URL Case Sensitivity

**What goes wrong:** URLs added to the sitemap have mixed case paths (`/Blog/Post-Title` vs `/blog/post-title`). Search engines may treat these as separate URLs.

**Prevention:** Normalize URL paths to lowercase before adding to sitemap. Preserve case only for query parameters and fragments that are case-sensitive by convention.

---

### Pitfall 19: XML Special Characters in Sitemap and Schema Markup

**What goes wrong:** Page titles, descriptions, and URLs containing `&`, `<`, `>`, `"`, `'` are inserted into XML/JSON without escaping. This produces malformed XML or JSON.

**Prevention:** Always use an XML builder library (not string concatenation) for sitemap generation. Use `JSON.stringify()` for JSON-LD output — never build JSON via string templates.

---

### Pitfall 20: Local File Path Handling on Windows vs Unix

**What goes wrong:** The tool accepts local HTML file paths. On Windows, paths use backslashes (`C:\Users\...`). `new URL('file:///C:\path')` does not parse correctly on all platforms.

**Prevention:**
- Normalize all local paths using `path.resolve()` then convert to `file://` URLs with `pathToFileURL()` from the Node.js `url` module.
- Test local file crawling on both Windows and Unix in CI.

**Phase:** Crawl engine (Phase 2) — especially relevant given the project runs on Windows.

---

### Pitfall 21: MCP Server Process Crashes on Unhandled Promise Rejections

**What goes wrong:** A crawl request fails with an unhandled promise rejection. Node.js exits. Claude sees a connection dropped error with no diagnostic information.

**Prevention:**
- Wrap all tool handlers in a top-level try/catch that returns a structured error response rather than throwing.
- Register `process.on('unhandledRejection', ...)` to log and recover rather than exit.
- Return `{ isError: true, content: [{ type: "text", text: "Error: [message]" }] }` from tool handlers on failure — this is the MCP SDK's error response contract.

**Phase:** Foundation (Phase 1).

---

## v1.2 Addendum: Audit Observability and Framework Awareness Pitfalls

*Added 2026-04-20. Based on direct codebase inspection. Confidence: HIGH.*

These pitfalls are specific to adding HTTP diagnostic metadata, framework detection, schema inference, sitemap coverage reporting, and wizard integration to the existing v1.1 system.

---

### Pitfall 22: 403 from UA-Blocking Hosts Silently Consumed as Generic AcquisitionError

**What goes wrong:**
`fetchPage()` in `crawl.ts` checks `!res.ok` and emits `AcquisitionError` with `error: "HTTP 403"`. The three audit dimensions that call `fetch()` directly (`llms-txt.ts`, `schema.ts`, `markdown.ts`) all do `if (!res.ok) return null` — discarding the status code. A 403 from a host blocking the Node.js user-agent is indistinguishable from a 403 from auth-gating. If diagnostic metadata is added only to `MarkdownDocument` success results and not to error results, the 403 signal disappears. Users see a vague "could not retrieve HTML" warning with no indication they need to check bot-blocking configuration.

**Why it happens:**
`AcquisitionError` has no `statusCode` field. The audit dimension helpers return bare `string | null` with no status slot. The type shape provides nowhere to attach the HTTP status code from an error response.

**How to avoid:**
Add `statusCode?: number` to `AcquisitionError`. In `fetchPage()`, populate it from `res.status` before returning the error result. In each audit dimension's fetch helper, return `{ html: string | null, statusCode: number | null }` instead of bare `string | null`. The dimension then distinguishes 403 ("bot-blocked" warning) from network failure (timeout, DNS — "unreachable" warning).

**Warning signs:**
- Audit returns a generic `warning` for a site that serves content fine in a browser
- Any audit dimension helper that returns `null` without also returning the HTTP status code

**Phase to address:** v1.2 Phase 1 (HTTP diagnostic metadata capture)

---

### Pitfall 23: Timing via Date.now() Reports Wall-Clock Drift, Not Request Duration

**What goes wrong:**
`Date.now()` is subject to system clock adjustments, NTP sync, and event loop scheduling delays. The time between `Date.now()` before `await fetch(...)` and after includes event loop wait time after the promise resolves. On a busy system, a 50ms actual round-trip may report as 80ms or 20ms. Presenting this as authoritative "response time" is misleading and produces noisy data.

**Why it happens:**
`Date.now()` is the obvious timing primitive. `performance.now()` is less discoverable but is correct: it uses a monotonic clock with sub-millisecond resolution unaffected by system clock changes.

**How to avoid:**
Use `performance.now()` from `node:perf_hooks` (available in Node 16+, which this project already requires). Record `const t0 = performance.now()` before fetch, `const durationMs = Math.round(performance.now() - t0)` after. Label the field `durationMs` in output and note it includes event-loop scheduling overhead.

**Warning signs:**
- Any timing path uses `Date.now()` — grep for it specifically in diagnostic capture code
- Timing values in CI (busy system) are consistently 2-3x higher than local runs on the same URL

**Phase to address:** v1.2 Phase 1 (HTTP diagnostic metadata capture)

---

### Pitfall 24: Content-Length Absent on Chunked Responses Causes Zero or NaN Size

**What goes wrong:**
`response.headers.get('content-length')` returns `null` for chunked transfer-encoded responses. HTTP/1.1 chunked encoding and HTTP/2 do not set `Content-Length`. Most CDNs (Cloudflare, Fastly, CloudFront) serve responses without `Content-Length`. Code doing `parseInt(res.headers.get('content-length') ?? '0')` silently reports 0. Code doing `parseInt(res.headers.get('content-length')!)` gets `NaN`, which serializes to `null` in JSON — the field disappears from the report entirely.

**Why it happens:**
`Content-Length` is present in simple HTTP/1.0 and local dev server scenarios. It is absent in nearly all production CDN-served responses. Developers test against localhost and do not observe the gap.

**How to avoid:**
Never use `Content-Length` as the primary size measure. After `await res.text()`, measure `Buffer.byteLength(rawText, 'utf-8')` for actual byte count. Report `Content-Length` only as an optional secondary field `declaredContentLength` when the header is present, so consumers can distinguish declared vs. measured size.

**Warning signs:**
- Size is reported as 0 for all live-site crawls but non-zero for local file targets
- `parseInt(res.headers.get('content-length'))` anywhere in diagnostic code

**Phase to address:** v1.2 Phase 1 (HTTP diagnostic metadata capture)

---

### Pitfall 25: Framework Detection False Positive When CDN Rewrites Asset Paths

**What goes wrong:**
Detecting `/_next/` in asset URLs is reliable on origin servers. CDN configurations (Cloudflare Pages, Netlify, custom proxies) may rewrite or proxy asset paths, stripping the framework-specific prefix. A Next.js site served through a custom CDN might expose assets at `/assets/chunks/` instead of `/_next/static/chunks/`. The detector returns no framework match (false negative). Conversely, a site that migrated away from Next.js may still have stale `/_next/` references in cached HTML — the detector fires a false positive for a framework no longer in use.

**Why it happens:**
Asset path detection reads HTML source, which reflects what the CDN serves — not what framework generated it. The path is a build artifact convention, not a protocol guarantee.

**How to avoid:**
Require multiple independent signals before asserting a framework. For Next.js: check `/_next/` path AND presence of `__NEXT_DATA__` script tag (injected by Next.js's renderer, survives CDN path rewriting). For WordPress: check `/wp-content/` path AND presence of `wp-json` API link in `<head>`. Require 2-of-N signals. When only 1 signal fires, set `confidence: 'low'` in the detection result rather than asserting the framework.

**Warning signs:**
- Detection logic has a single `html.includes('/_next/')` check with no secondary signal
- No `confidence` field in the framework detection result type

**Phase to address:** v1.2 Phase 2 (framework detection)

---

### Pitfall 26: False Positive is Worse Than False Negative for Framework Detection

**What goes wrong:**
A false positive (wrong framework detected) actively misleads the user with wrong framework-specific guidance. A false negative (no framework detected) produces generic recommendations — still correct. The business impact of a false positive is disproportionately higher. Optimizing for detection rate (reducing false negatives) at the expense of precision (increasing false positives) is the wrong tradeoff for an audit tool.

**How to avoid:**
Design detection to be conservative. A single ambiguous signal should produce `framework: null, signals: ['possible Next.js: /_next/ path found']`, not `framework: 'Next.js'`. Include a `confidence: 'high' | 'medium' | 'low'` field in the detection result type from the start — retrofitting this later requires changes across audit finding serialization, the report type, and potentially the wizard.

**Warning signs:**
- No `confidence` field in the framework detection result type
- A permissive single-signal detector passes all unit tests but is tested only against canonical examples

**Phase to address:** v1.2 Phase 2 (framework detection)

---

### Pitfall 27: businessType Free-Text Fuzzy Matching Produces Wrong Schema Type

**What goes wrong:**
`businessType` is `z.string()` — a free-text field designed for llms.txt generation, not as a structured classifier. A fuzzy matcher mapping it to schema.org types will encounter "SaaS tool", "saas", "software company", "B2B app" — all meaning the same thing — and may map "local restaurant" to the wrong subtype, or suggest `AutomotiveDealer` when `LocalBusiness` would validate fine. More critically, the inferred type may conflict with what the site already has (e.g. site has `Organization`, inference suggests `LocalBusiness`), writing a redundant block.

**How to avoid:**
Do not use `businessType` string matching as the primary schema type selector. In the wizard, elicit `schemaTypes` explicitly via the existing checklist (already in `TOOL_FIELD_MAP.generate_schema_markup.toolRequired`). Use `businessType` fuzzy matching only to pre-select the default in that checklist — never to bypass the elicitation. When inference is used at all, cap it at the most general applicable type: prefer `LocalBusiness` over `AutomotiveDealer`, and only suggest the specific subtype when multiple high-confidence signals agree.

**Warning signs:**
- Inference maps a value to a specific schema.org subtype without user confirmation
- No elicitation step between inference and calling `generate_schema_markup`

**Phase to address:** v1.2 Phase 3 (schema type inference)

---

### Pitfall 28: Schema Type Conflict When Site Already Has JSON-LD

**What goes wrong:**
`checkSchemaMarkup()` reads existing JSON-LD types from the page. If the site has `Organization` and the wizard adds `LocalBusiness` via `generate_schema_markup`, the page ends up with two root-level JSON-LD blocks with different `@type` values. Search engines and AI crawlers treat these as separate entities. This passes schema validators but is semantically incorrect and may produce inconsistent knowledge graph entries.

**How to avoid:**
When existing types are found by the audit, include them in a structured `details` sub-field of `AuditFinding` (not just the message string) so the wizard execution context can read them without re-fetching the page. When `suggestedToolCall` is `generate_schema_markup` and the accumulator has existing type information, the wizard must surface the conflict explicitly and require confirmation before writing: "Your site already has [Organization] — adding LocalBusiness alongside it may create duplicate entity entries."

**Warning signs:**
- The wizard's `generate_schema_markup` execution case does not check `acc` for pre-existing type information
- Audit finding message contains existing types as a string but not in a parseable structured field

**Phase to address:** v1.2 Phase 3 (schema type inference)

---

### Pitfall 29: Sitemap Index Files Silently Treated as Empty Sitemaps

**What goes wrong:**
`/sitemap.xml` frequently returns a sitemap index file (`<sitemapindex>` root element) instead of a URL set (`<urlset>`). A parser that only looks for `<url>` elements in the top-level file finds zero URLs and reports 0% coverage — a false negative for a well-covered site. Large sites (ecommerce, news, WordPress with Yoast) almost always use sitemap index files.

**How to avoid:**
After fetching `/sitemap.xml`, check the root element tag. If `<sitemapindex>`, extract all `<loc>` children, fetch each child sitemap, and aggregate URL sets. Cap child sitemap fetches at a reasonable limit (e.g. 10 child sitemaps, 10,000 total URLs) using the existing `p-limit` pattern from `crawl.ts`. Coverage calculation operates on the aggregated set.

**Warning signs:**
- Test site for sitemap parsing is a small static generator output (these always use `<urlset>`)
- Parser has a single `getElementsByTagName('url')` call with no check for `<sitemapindex>` root

**Phase to address:** v1.2 Phase 4 (mirror coverage via sitemap)

---

### Pitfall 30: Coverage Percentage Misleading When Sitemap Contains Archive/Tag Pages

**What goes wrong:**
A sitemap with 500 URLs on a blog-heavy site may include 450 tag/category/archive pages intentionally excluded from the markdown mirror crawl (pageCap=50 default). Coverage reports 10% (50/500) and fires a "low coverage" warning. The user has mirrored all the content pages that matter. The metric measures "did you mirror every URL in the sitemap" not "did you mirror the pages AI crawlers care about."

**How to avoid:**
Report raw counts (`mirrored: 50, sitemap: 500`) alongside the percentage. Add context to the finding message noting the pageCap effect. Flag low coverage as `warning` not `fail` unless coverage is below a very low threshold (e.g. <5%). Never emit `fail` severity based purely on percentage without acknowledging the pageCap.

**Warning signs:**
- Coverage check divides `mirrored / total sitemap URLs` without qualification
- "low coverage" finding fires at `fail` severity for any site with >50 sitemap URLs

**Phase to address:** v1.2 Phase 4 (mirror coverage via sitemap)

---

### Pitfall 31: Mirror Coverage Check Requires outputDir Which the Audit Does Not Know

**What goes wrong:**
`checkMarkdownMirrors()` currently does a HEAD request to `/index.md` for URL targets — it checks the live site, not a local output directory. A v1.2 coverage check against a local output directory requires knowing where `generate_markdown_mirrors` wrote files. The audit tool receives only `target`. Adding `outputDir` to `runAudit()` changes the function signature and breaks the existing call site in `tools/index.ts` (`runAudit(target.trim())` with no second arg).

**How to avoid:**
Do not add `outputDir` to `runAudit()` — it creates a hard dependency that breaks the local folder audit path. Keep the coverage check as a live-site probe: fetch `/index.md`, `/about/index.md`, and a sample of sitemap-listed URLs with `.md` equivalents to estimate coverage. This is consistent with the existing HEAD-check pattern and requires no new parameters. Document the limitation explicitly: local output directory coverage is not measurable without an explicit parameter.

**Warning signs:**
- Phase plan proposes adding `outputDir?: string` to `runAudit()` signature
- Coverage check reads from filesystem without a clear source for the directory path

**Phase to address:** v1.2 Phase 4 (mirror coverage via sitemap)

---

### Pitfall 32: www vs. non-www Origin Mismatch in Sitemap Coverage Check

**What goes wrong:**
A sitemap at `https://example.com/sitemap.xml` may contain URLs with `https://www.example.com/...`. Mirror files are written with paths derived from the crawled URL (`https://example.com`). A coverage check comparing sitemap URLs to mirrored file paths finds 0 matches if the origins differ, reporting 0% coverage on a fully-mirrored site.

**How to avoid:**
When comparing sitemap URLs against mirrored URLs, normalise both sides: strip `www.` prefix, lowercase hostname, strip trailing slash. Use path comparison only (strip the origin entirely) when both sides come from the same logical site. This is analogous to how `normaliseUrl()` in `crawl.ts` handles trailing slashes but needs to extend to www normalisation.

**Warning signs:**
- Coverage check returns 0% on a site that clearly has mirror files
- Sitemap `<loc>` values begin with a different hostname than the crawl target

**Phase to address:** v1.2 Phase 4 (mirror coverage via sitemap)

---

### Pitfall 33: suggestedToolCallArgs Pre-population Becomes Stale if Context Changes

**What goes wrong:**
If `AuditFinding` grows a `suggestedToolCallArgs` field pre-populated at audit time from `businessContext`, those args are captured at audit execution time. If the user corrects a misspelled business name between running the audit and running the wizard, the wizard reads stale args from the finding. The existing accumulator (`acc`) would be overridden by the pre-populated args rather than updated with the correction. The tool executes with wrong data and the user has no chance to correct it before files are written.

**Why it happens:**
Pre-populating args at audit time is appealing for UX (fewer questions) but creates temporal coupling: the audit output becomes a stale snapshot of context.

**How to avoid:**
Do not pre-populate `suggestedToolCallArgs` with values from mutable user context (`businessName`, `businessType`, `location`, etc.). Only pre-populate truly audit-derived, read-only values — for example, `detectedSchemaTypes: ['Organization']` captured by the schema dimension — that the wizard displays as informational context, not as execution input. For all mutable context fields, continue using the accumulator pattern: seed from `businessContext` passed at audit time, gap-fill via elicitation. If `suggestedToolCallArgs` is added at all, execution must read from `acc` (current accumulated context) at execution time, never from the finding directly.

**Warning signs:**
- `AuditFinding.suggestedToolCallArgs` is assigned inside `runAudit()` from the `businessContext` parameter
- The wizard's execution switch reads `finding.suggestedToolCallArgs` without merging with `acc`

**Phase to address:** v1.2 Phase 5 (suggestedToolCallArgs pre-population)

---

### Pitfall 34: AuditFinding Type Extension That Silently Breaks Wizard Switch Dispatch

**What goes wrong:**
The wizard execution loop dispatches on `toolName` with a switch statement. If a new audit dimension adds a new `suggestedToolCall` string value (e.g. `'update_framework_config'`), the switch falls through silently. No TypeScript error fires because `finding.suggestedToolCall` is typed as `string | undefined` — not a string literal union. The finding passes the `TOOL_FIELD_MAP` guard (if the map is updated), context is elicited, the user confirms — but nothing executes. The session summary reports no errors and no results for that finding with no explanation.

**Specific silent failure paths that TypeScript will not catch:**
1. New `suggestedToolCall` string value added to a finding, `TOOL_FIELD_MAP` updated, switch not updated — falls through default (which does not exist), finding silently skipped
2. `suggestedToolCall` value renamed in audit dimension (e.g. `generate_schema_markup` → `generate_schema`) — existing switch case becomes dead code, new value falls through silently
3. `suggestedToolCall` field removed from a finding type and made non-optional elsewhere — `if (!toolName)` guard fires, finding silently skipped

**How to avoid:**
Two defenses required together:
1. Make `suggestedToolCall` a string literal union in `audit/types.ts`: `type SuggestedToolCall = 'generate_llms_txt' | 'configure_robots_txt' | 'generate_schema_markup' | 'generate_faq_content' | 'generate_markdown_mirrors'`. Adding a new value to the union then produces TypeScript errors at every switch/record that is not exhaustive.
2. Replace the switch with a typed dispatch table: `const handlers: Record<SuggestedToolCall, (finding: AuditFinding, acc: AccumulatedContext) => Promise<void>> = { ... }`. TypeScript errors if the record is missing any `SuggestedToolCall` key. Eliminates the structural divergence between `TOOL_FIELD_MAP` and switch entirely.

**Warning signs:**
- `suggestedToolCall` field type in `AuditFinding` is `string` not a literal union
- Execution switch has no `default` case
- `TOOL_FIELD_MAP` is updated with a new key but the switch is not (or vice versa)

**Phase to address:** v1.2 Phase 6 (AuditReport type extension) — must be done before any new suggestedToolCall value is introduced

---

### Pitfall 35: TOOL_FIELD_MAP / Switch Structural Divergence Creates Silent Skip

**What goes wrong:**
`TOOL_FIELD_MAP` and the execution switch are separate registrations 300+ lines apart in `registerAllTools()`. If v1.2 adds a new tool name to `TOOL_FIELD_MAP` (so the gap-fill loop elicits context for it) but forgets to add a case to the switch, the following sequence occurs: context is gathered, user confirms, finding is not in `skippedFindings` (that list only captures gap-fill cancellations), but no tool executes. The session summary says "Wizard complete. N fix(es) applied" — where N excludes the silently skipped fix with no indication of omission.

**How to avoid:**
Replace the switch with a dispatch table typed on `SuggestedToolCall` (see Pitfall 34). A `Record<SuggestedToolCall, handler>` enforces at compile time that every `SuggestedToolCall` value has a handler. Structural divergence between registration and execution becomes a TypeScript error, not a runtime surprise.

**Warning signs:**
- Session summary shows 0 errors and 0 results for a finding the user selected
- A new tool appears in `TOOL_FIELD_MAP` but the switch does not have a corresponding case

**Phase to address:** v1.2 Phase 6 (AuditReport type extension) — refactor to dispatch table at same time as the type change

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| MCP server setup | Wrong transport choice locked in early | Decide Stdio vs SSE at day 1; document in README |
| Tool schema design | Zod/JSON Schema drift | Single source of truth via `zodToJsonSchema` |
| Tool descriptions | Too vague for Claude to route correctly | Test descriptions against Claude before shipping |
| Error handling architecture | Unhandled rejections crash server | Top-level try/catch + `process.on('unhandledRejection')` in Phase 1 |
| HTML fetch layer | Encoding corruption, hanging connections | `iconv-lite` + `AbortSignal.timeout` from first commit |
| Content extraction | JS-rendered pages produce empty output | Surface as explicit warning in tool output |
| Chrome stripping | Nav/footer bleeds into markdown | Remove chrome selectors before Turndown |
| URL handling | Relative URLs in all output artifacts | Absolutize at extraction time, not at output time |
| Crawl engine | Rate limiting / IP blocks | `p-limit(2)` + exponential backoff on 429 |
| Long crawls | MCP tool call timeout | Paginate via crawl_id pattern or cap at 10-20 pages |
| Schema markup | Invalid JSON-LD passes visual check | Validate with schema.org validator in tests |
| Sitemap generation | XML encoding errors, relative URLs | Use `xmlbuilder2`, not string templates |
| robots.txt generation | Accidentally blocks Googlebot or AI crawlers | Default permissive; diff preview before write |
| llms.txt generation | Non-compliant structure | Read canonical spec at llmstxt.org before implementing |
| Local file handling | Windows path parsing | Use `pathToFileURL()` from Node `url` module |
| v1.2 HTTP diagnostics | Content-Length absent on CDN; Date.now() drift; 403 not surfaced | Measure from body bytes; use performance.now(); add statusCode to AcquisitionError |
| v1.2 Framework detection | CDN path rewriting; false positive worse than miss | Multi-signal detection with confidence field; conservative assertion |
| v1.2 Schema inference | businessType free-text → wrong type; conflict with existing JSON-LD | Inference pre-selects only; elicitation still required; conflict warning before write |
| v1.2 Sitemap coverage | Sitemap index files; www mismatch; pageCap distortion; outputDir unknown | Recurse into index files; normalise origins; report raw counts; use live-site HEAD probes |
| v1.2 Type extension | suggestedToolCall string → silent dispatch failure; TOOL_FIELD_MAP/switch divergence | Narrow to literal union; replace switch with typed dispatch table |

---

## Sources

**Confidence Assessment:**

| Area | Confidence | Basis |
|---|---|---|
| MCP SDK transport / tool schema / error handling | MEDIUM | Training knowledge of @modelcontextprotocol/sdk; external docs unavailable for verification |
| HTML parsing (Cheerio, encoding, relative URLs) | HIGH | Well-established Node.js ecosystem; stable spec behavior |
| Turndown markdown conversion | HIGH | Stable, widely-used library; behavior is well-documented in training data |
| URL crawling (rate limiting, robots.txt) | HIGH | Stable HTTP/web standards |
| JSON-LD / schema.org | HIGH | W3C spec; schema.org requirements are well-established |
| Sitemap XML spec | HIGH | Sitemap protocol is stable (sitemaps.org spec) |
| llms.txt spec | LOW | Spec is new (2024), evolving; verify at llmstxt.org before implementing |
| MCP tool timeout / progress notifications | MEDIUM | Based on training; verify current SDK support for progress notifications |
| v1.2 pitfalls (Pitfalls 22-35) | HIGH | Based on direct inspection of existing src/ codebase; no external verification required |

**Key sources to verify before implementation:**
- MCP SDK official docs: `https://modelcontextprotocol.io/docs`
- llms.txt spec: `https://llmstxt.org`
- schema.org validator: `https://validator.schema.org`
- Sitemap protocol: `https://www.sitemaps.org/protocol.html`
- Google Rich Results Test: `https://search.google.com/test/rich-results`
- Node.js performance.now(): `https://nodejs.org/api/perf_hooks.html#performancenow`
