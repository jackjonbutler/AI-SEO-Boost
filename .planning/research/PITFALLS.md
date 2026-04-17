# Domain Pitfalls

**Domain:** TypeScript MCP Server + AI SEO Tooling (HTML crawling, markdown conversion, schema markup, sitemaps, llms.txt)
**Researched:** 2026-04-17
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

**Key sources to verify before implementation:**
- MCP SDK official docs: `https://modelcontextprotocol.io/docs`
- llms.txt spec: `https://llmstxt.org`
- schema.org validator: `https://validator.schema.org`
- Sitemap protocol: `https://www.sitemaps.org/protocol.html`
- Google Rich Results Test: `https://search.google.com/test/rich-results`
