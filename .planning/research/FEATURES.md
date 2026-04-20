# Feature Research: v1.2 Audit Observability and Framework Awareness

**Domain:** AI-visibility SEO audit tooling — MCP server whose UI is Claude Code
**Researched:** 2026-04-20
**Confidence:** MEDIUM-HIGH (WebSearch available; WebFetch denied; framework fingerprint signals are MEDIUM confidence from indirect sources; audit evidence patterns are HIGH confidence from Lighthouse/axe-core documentation)

---

## Context

This research covers five NEW feature areas for v1.2. The existing audit infrastructure (5 dimensions, `AuditFinding` shape, wizard mode) is already built and is NOT re-researched here. The target user is a developer who just asked "why does audit say no schema when I know my site has schema?" — someone who needs to debug the audit result, not just act on it.

---

## Feature Area 1: Audit Finding Diagnostics (Evidence Alongside Findings)

### What the problem is

Current `AuditFinding` has `message: string`. A message like "Missing AI crawler rules for: GPTBot, ClaudeBot" tells the developer what is wrong but provides no evidence of what the tool actually found. The developer cannot distinguish "robots.txt was fetched and parsed successfully, these bots were absent" from "robots.txt couldn't be fetched at all."

### How Lighthouse and axe-core handle this (HIGH confidence)

**Lighthouse** structures audit details as a typed `details` object attached to each audit result. When an audit fails, `details.items` is an array of evidence rows. Each row contains: `nodeLabel` (human-readable description of the element), `snippet` (outerHTML of the offending element), `selector` (CSS selector to locate it), and `boundingRect` (optional, for visual). The key design principle: evidence is scoped to what caused the failure, not a dump of all page data. For a "missing alt text" failure, Lighthouse shows only the specific `<img>` tags that lacked alt text — not all images on the page.

**axe-core** uses a similar model: each violation result contains `nodes`, where each node has `target` (CSS selector path), `html` (outerHTML snippet), and `failureSummary` (plain-language description of why it failed). Every violation also links to a `helpUrl` for remediation context. The critical design choice: axe-core separates `violations` (definite failures), `incomplete` (needs human review), `passes`, and `inapplicable`. This prevents noisy conflation of "failed" and "couldn't determine."

**The evidence principle both tools share:** Show the minimum data needed to locate and understand the failure. A CSS selector + snippet is enough for a developer to open DevTools and find the element. A full page dump is noise.

### Applied to this MCP audit context

The "UI" is a chat interface showing tool call results. Over-verbose evidence creates scroll fatigue; under-specified evidence creates debugging blind spots. The right level: enough to answer "what did the tool actually find?" without requiring the developer to re-run the audit mentally.

**For robots.txt findings:** Show the actual User-agent blocks that WERE found (truncated to relevant lines) alongside the list of missing bots. If robots.txt couldn't be fetched, show the HTTP status code and error. This directly addresses the "audit says fail but I know my robots.txt has GPTBot" debugging scenario.

**For schema findings:** Show the JSON-LD `@type` values that were found (or "no JSON-LD blocks found") and the count of `<script type="application/ld+json">` tags parsed. If the page returned HTML, show a confirmation that parsing ran. If schema is present but wrong type, show exactly which types were found vs which were expected.

**For llms.txt findings:** Show the HTTP status code from the HEAD request, not just "missing." A 403 is different from a 404 is different from a timeout.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| HTTP status code in network-fetch findings | Distinguishes "not found" from "forbidden" from "server error" — affects fix approach | LOW | Already available from `res.status` — just needs to surface in `message` |
| What-was-found vs what-was-missing split | "GPTBot was missing" implies we did find and parse the file — currently conflated with fetch errors | LOW | Restructure message to separate "fetched OK" from "parsed, missing these bots" |
| Explicit confirmation when fetch/parse succeeded | Developer debugging a false-negative needs to know: "Yes, the tool did reach and parse your file" | LOW | Add `evidence` sub-field or prefix message with "Parsed robots.txt at [url]: ..." |
| Schema types actually found, not just pass/fail | "Schema present but LocalBusiness not detected. Found: WebSite, Organization" — already partially there, keep this pattern | LOW | Already implemented in schema dimension — preserve and expand |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Truncated evidence snippet in finding | Show first 3–5 relevant lines of robots.txt (the User-agent blocks found) so developer can visually confirm parse was correct | MEDIUM | Requires storing snippet during parse, not just boolean result |
| `evidence` structured field alongside `message` | Separate `evidence: { found: string[], missing: string[], rawSnippet?: string }` makes findings machine-parseable by Claude for wizard mode | MEDIUM | Needs `AuditFinding` type extension |
| Source URL shown in warning findings | "Could not fetch https://example.com/robots.txt" instead of "Could not fetch robots.txt" — enables copy-paste verification in browser | LOW | URL is already computed during fetch — pass it through |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full robots.txt content in finding | Developer wants to "see everything" | Creates scroll fatigue in chat UI; 50-line robots.txt dumps as tool result is noise | Show only the relevant User-agent blocks — 3–8 lines max |
| Full HTML dump when schema fails | Developer wants to debug cheerio parsing | Massive noise; HTML can be megabytes | Show count of `<script type="application/ld+json">` tags found + their @type values only |
| Stack trace in error findings | Feels like more information | Exposes internals; not actionable for the developer | Surface the actionable part: HTTP status, network error message, or file path |

---

## Feature Area 2: Framework Detection from HTML

### Research findings (MEDIUM confidence — verified via OWASP, Wappalyzer docs, Astro source)

Framework detection from rendered HTML is a fingerprinting problem with two signal tiers: **high-reliability** (asset path prefixes that are hard-coded by the framework build system) and **lower-reliability** (meta tags and comments that are often stripped or configurable).

**Asset path prefixes — high reliability, hard to suppress:**

| Framework | Asset Path Signal | Reliability | Notes |
|-----------|-------------------|-------------|-------|
| Next.js | `/_next/static/` in `<script src>` or `<link href>` | HIGH | Hard-coded in Next.js webpack config; can be overridden with `assetPrefix` but rarely is |
| Nuxt | `/_nuxt/` in script/link tags | HIGH | Nuxt's default public path; configurable via `router.base` but unusual |
| WordPress | `/wp-content/` and `/wp-includes/` in script/link/img tags | HIGH | Core WP file structure; only CDN configs suppress this |
| Astro | `/_astro/` in script/link tags | HIGH | Astro build output; not configurable in standard config |
| Gatsby | `/static/` + content-hashed filenames (`filename.abc123.js`) | MEDIUM | `/static/` path is shared with other tools; hash pattern is distinctive but not unique |
| SvelteKit | `/_app/immutable/` in script/link tags | HIGH | SvelteKit's default output path for immutable assets |
| Remix | `/build/` directory pattern | MEDIUM | Remix convention but easily customized; less distinctive |

**HTML comment and element signals — medium reliability, often configurable:**

| Framework | Signal | Reliability | Notes |
|-----------|--------|-------------|-------|
| Astro | `<astro-island>` custom element present in DOM | HIGH (when client directives used) | Only present if interactive islands are used; static Astro sites won't have this |
| Astro | `data-astro-transition-scope` attributes | MEDIUM | Only present when View Transitions API is used |
| WordPress | `<!-- wp:paragraph -->` Gutenberg block comments in HTML | HIGH | Present on pages using Gutenberg editor; classic editor has no comments |
| WordPress | `<meta name="generator" content="WordPress X.X.X">` | HIGH | Default; theme can suppress it but rarely does |
| Next.js | `<meta name="generator">` — NOT a reliable signal | LOW | Next.js does not emit a generator meta tag by default |
| Nuxt | `nuxt-link` class on anchor elements | MEDIUM | Present in Nuxt 2; Nuxt 3 switched to standard elements |
| SvelteKit | `__sveltekit` JavaScript variable in inline script | HIGH (when SSR used) | Svelte uses CSS class prefixes (`svelte-[hash]`) as secondary signal |

**HTTP header signals (bonus, not HTML):**

- `X-Powered-By: Next.js` — present if not suppressed
- `X-Generator: Nuxt` — Nuxt default response header

**Key finding:** Asset path prefixes are more reliable than meta tags because they are structural output of the build system, not configurable metadata. A developer who suppresses `<meta name="generator">` rarely reconfigures `assetPrefix`. For this tool's use case (inferring which deploy tools or fix patterns apply), asset paths are the right primary signal.

**Detection confidence model:**

- One asset path match → "likely [framework]" — report as `detected: true`, `confidence: 'high'`
- Meta tag only → "possibly [framework]" — report as `detected: true`, `confidence: 'medium'`
- No signals → `detected: false`; do not guess

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Detect Next.js, Nuxt, WordPress from asset paths | These three dominate market share; most audited sites will be one of these | LOW | Regex match on `/_next/`, `/_nuxt/`, `/wp-content/` in HTML link/script hrefs |
| Return detected framework in audit metadata | Developer needs to know "my site was identified as Next.js" to understand why certain suggestions appear | LOW | Add `detectedFramework?: string` to `AuditReport` |
| Confidence level on detection | Asset path match is different from meta tag guess — communicate this | LOW | `frameworkConfidence: 'high' \| 'medium' \| 'unknown'` |
| No detection when no signals found | False positives are worse than no detection for trust reasons | LOW | Default to `detectedFramework: null` when no signals match |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Detect Astro via `<astro-island>` and `/_astro/` | Astro is rapidly growing for content sites; schema fix patterns differ for Astro | LOW | Check both signals; either one is sufficient |
| Detect SvelteKit via `/_app/immutable/` | SvelteKit sites are an increasing portion of the developer target audience | LOW | Simple path prefix check |
| Use framework to tailor `suggestedToolCall` message | "Your Next.js site uses App Router — place schema in `app/layout.tsx`" is more actionable than "add JSON-LD to your HTML" | MEDIUM | Requires framework-to-implementation-guide mapping |
| Multi-framework safety (monorepos) | Some sites mix WP backend + React frontend; detect multiple signals without asserting a single winner | MEDIUM | Return array of candidates ranked by confidence |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Detect framework version number | "You're on Next.js 13.4" seems useful | Requires content-hash fingerprinting against version databases — fragile, high maintenance, low accuracy for this use case | Report "Next.js detected" without version; version matters for security, not for AI SEO fixes |
| Detect hosting provider (Vercel, Netlify) | Useful for docs links | HTTP header parsing adds latency; hosting detection is scope creep relative to AI SEO | Out of scope for v1.2; document as future |
| Attempt framework detection on local folder targets | Developer knows their own framework | Parsing local HTML for framework signals is redundant — developer is the expert | Only run framework detection on URL targets |

---

## Feature Area 3: Schema Type Inference

### Research findings (HIGH confidence — schema.org is authoritative, Google's structured data docs are definitive)

The current schema dimension checks for `LocalBusiness` as the expected type for all sites, which is wrong for SaaS tools, travel apps, and content sites. Schema type selection should be driven by business category.

**Business type to schema @type mapping (authoritative from schema.org + Google Search Central):**

| Business Category | Primary @type | Secondary @type | When to add both |
|-------------------|---------------|-----------------|-----------------|
| Local service business (plumber, dentist, restaurant) | `LocalBusiness` (or subtype) | `Organization` | When physical location matters |
| SaaS / software tool | `SoftwareApplication` | `WebApplication` | `WebApplication` when browser-only (no install); `SoftwareApplication` for downloadable |
| Travel / booking app | `TravelAgency` or `LodgingBusiness` | `OnlineBusiness` | Use most specific subtype available |
| E-commerce store | `OnlineStore` | `Organization` | Google recommends `OnlineStore` over generic `OnlineBusiness` for products |
| Agency / consultancy | `ProfessionalService` | `Organization` | `ProfessionalService` is a subtype of `LocalBusiness` |
| Content site / blog | `WebSite` | `Organization` | `WebSite` with `SearchAction` for sitelinks searchbox |
| News / media | `NewsMediaOrganization` | `WebSite` | Use `Article` on article pages separately |

**Schema.org subtypes of `LocalBusiness` (most specific wins):**
- `Restaurant`, `CafeOrCoffeeShop`, `FastFoodRestaurant`
- `MedicalBusiness` → `Dentist`, `Physician`, `Optician`
- `LegalService` → `Attorney`
- `FinancialService` → `AccountingService`, `InsuranceAgency`
- `HomeAndConstructionBusiness` → `Plumber`, `Electrician`, `RoofingContractor`
- `TravelAgency`
- `LodgingBusiness` → `Hotel`, `BedAndBreakfast`
- `ProfessionalService`

**Recommended fallback hierarchy when business type is ambiguous:**
1. If physical address provided → try `LocalBusiness` subtype
2. If no address but provides software/app → `SoftwareApplication` or `WebApplication`
3. If services listed but no clear category → `ProfessionalService` (safe subtype of `LocalBusiness`)
4. If no signals → `Organization` (always valid, but weakest signal value)

**Critical finding:** Google explicitly states "use the most specific subtype." Auditing for `LocalBusiness` when the site is a SaaS tool and producing a warning is both a false positive AND misleading — it suggests the developer add wrong schema.

**`applicationCategory` for SoftwareApplication:** schema.org defines this as a free-text field. Google does not enforce controlled vocabulary, but common values are: `"BusinessApplication"`, `"SEOApplication"`, `"UtilitiesApplication"`, `"WebApplication"`. For this MCP server itself, `"SEOApplication"` is the correct value.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Business-type-aware schema validation | Validating a SaaS for `LocalBusiness` is a false positive; breaks trust in the audit | MEDIUM | Requires `businessType` field in audit input (or inferred from business context) |
| Report found schema types with "appropriate for your business type" judgment | Developer needs to know: "Organization found — this is a reasonable fallback but add SoftwareApplication for better AI signals" | LOW | Extend existing `types.join(', ')` message with judgment |
| Do not flag SoftwareApplication as a warning | Currently schema dimension warns on anything non-LocalBusiness — wrong for SaaS | LOW | Update `checkSchemaMarkup` pass condition to accept multiple valid type families |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Accept `businessType` in `audit_ai_seo` input | Allows informed schema type validation instead of hardcoded LocalBusiness check | LOW | Add optional `businessType: 'local' \| 'saas' \| 'ecommerce' \| 'travel' \| 'agency' \| 'content'` to audit input |
| Suggest specific @type in `generate_schema_markup` call | Instead of "run generate_schema_markup", suggest "run generate_schema_markup with type: SoftwareApplication" | MEDIUM | `suggestedToolCall` becomes structured with pre-filled args |
| Infer business type from business context fields | If `businessType` not given but context has `siteUrl` with no address → lean toward SoftwareApplication; if address provided → LocalBusiness | MEDIUM | Heuristic: presence of `address` fields → local business; presence of `pricing` → SaaS or e-commerce |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Validate all schema.org properties exhaustively | "Complete schema validation" sounds thorough | Schema.org has 900+ types and thousands of properties; full validation is a separate product (use Google's Rich Results Test) | Validate only the presence and type — not property completeness. Link to Rich Results Test for full validation. |
| Force-suggest the "most specific" subtype | Automated specificity maximization sounds correct | Suggesting `Dentist` when business said `healthcare` requires confident classification — hallucination risk | Suggest at the category level (`LocalBusiness`) and let developer choose subtype from a documented list |

---

## Feature Area 4: Sitemap-Based Coverage Assessment

### Research findings (MEDIUM confidence — Screaming Frog docs, sitemap spec, crawl tool conventions)

**The coverage problem for this tool:** The audit currently checks if `llms.txt`, `robots.txt`, schema, FAQ, and markdown mirrors exist — but does not assess whether the sitemap covers the site's actual pages. A sitemap with 5 URLs on a 500-page site is a different failure than a missing sitemap.

**How professional crawl tools handle coverage:**

Screaming Frog's sitemap audit approach: fetch the XML sitemap, extract all URLs, then cross-reference against crawled URLs to find: (a) URLs in sitemap but not crawled (blocked or broken), (b) URLs crawled but not in sitemap (orphan pages). Coverage % = (sitemap URLs that resolve successfully) / (total sitemap URLs).

For this MCP tool, re-crawling the entire site is not practical — the existing crawl fetches only what's needed for the 5 audit dimensions. The pragmatic approach used by lightweight audit tools: **fetch the sitemap, count URLs, sample N URLs to verify they return 200**.

**Sample size convention for coverage verification:**
- Under 10 URLs: check all
- 10–50 URLs: check all (fast enough)
- 50–200 URLs: sample 20 URLs (stratified — pick first, last, and random middle)
- 200+ URLs: sample 25–30 URLs (diminishing returns beyond this)
- Hard cap: 30 HTTP requests for coverage verification to stay under a 15-second timeout budget

**Coverage % reporting convention:**
- Coverage % = (sampled URLs returning 200) / (sampled URLs checked) × 100
- Report as: `sitemapUrlCount: 50, sampleChecked: 20, samplePass: 18, coverageEstimate: '90%'`
- Always label it "estimated" — it is a sample, not a full crawl
- If sitemap is missing: `sitemapFound: false, coverageEstimate: null`

**Dependency:** Coverage assessment requires sitemap discovery first (fetch `/sitemap.xml`, follow `Sitemap:` directive in `robots.txt`, or check `/sitemap_index.xml`). This is a new network operation not in current audit.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sitemap presence check (pass/fail) | Does a sitemap exist at `/sitemap.xml` or as declared in robots.txt? | LOW | Already partly implied by robots-ai dimension; make it explicit |
| Sitemap URL count | How many pages does the site declare? 5 vs 500 is critical context | LOW | Parse XML, count `<url>` elements |
| Sample coverage % with explicit "estimated" label | Developers expect a coverage number; "estimated" prevents over-interpretation | MEDIUM | Fetch N URLs from sitemap, check HTTP 200, compute ratio |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Detect sitemap index (multiple sitemaps) | Large sites use sitemap index files; detecting this shows the tool handles enterprise sites | MEDIUM | Check if root element is `<sitemapindex>` vs `<urlset>`; report child sitemap count |
| Flag URLs returning non-200 in sample | Coverage 85% with "3 URLs returned 404" is actionable; 85% alone is not | MEDIUM | Track status codes per sampled URL |
| Compare sitemap URL count to markdown mirror count | If sitemap has 50 URLs but only 10 markdown mirrors exist, flag the gap | LOW | Requires markdown mirror dimension to also report count (coordination between dimensions) |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full sitemap crawl (all URLs) | "Check everything" sounds thorough | A 500-URL sitemap × 5s timeout = 40+ minutes; completely impractical for an interactive MCP tool | Sample with stated sample size and "estimated" label |
| Validate sitemap XML against W3C schema | Correctness seems important | XML schema validation catches edge cases but adds library dependency and latency for rare failures; most sitemap failures are missing file or wrong URL format | Check for required elements (`<urlset>`, `<url>`, `<loc>`) only; link to sitemap validator for full validation |
| Re-crawl to find orphan pages | "Find pages not in sitemap" is valuable | Requires spidering the whole site — completely out of scope for an on-demand MCP audit | Out of scope; document as a feature Screaming Frog covers well |

**Dependencies:**
```
sitemap coverage assessment
  → requires: sitemap URL (from /sitemap.xml or robots.txt Sitemap: directive)
  → feeds: markdown mirror coverage comparison (needs sitemapUrlCount)
  → feeds: AuditReport metadata (pagesAudited, sitemapFound fields)
```

---

## Feature Area 5: Tool Argument Pre-Population

### Research findings (MEDIUM confidence — MCP docs, ESLint patterns, axe-core conventions)

**The pattern:** When an audit tool identifies a fixable problem, it should provide the exact invocation needed to fix it — not just name the fix tool. This is the difference between "run generate_schema_markup" and "run generate_schema_markup with these arguments pre-filled from what we know about your site."

**How audit-to-fix handoff works in well-designed tools:**

ESLint's `--fix` flag applies fixes in-place when a rule has a `fixable` property defined. The "handoff" is implicit — the same process that found the problem applies the fix. This is the ideal case (single tool) but inapplicable here because the audit and fix tools are separate MCP tools with different responsibilities.

Lighthouse's approach (more analogous): Lighthouse audit results include `details.items` with structured data that downstream tools (like PageSpeed Insights) use to pre-populate fix recommendations. The audit output is structured data, not prose — this is what enables programmatic handoff.

**For MCP tool chains specifically (from MCP best practices research):** Tools in MCP work best when they pass structured context forward. The current `suggestedToolCall: string` is a tool name only. The upgrade is: `suggestedToolCall: { tool: string, args: Record<string, unknown> }` — a structured object containing the tool name AND the arguments that can be pre-filled from what the audit already knows.

**What the audit already knows that downstream tools need:**
- `target` URL → `siteUrl` arg for all generator tools
- Detected framework → can set `outputFormat` hints
- Found schema types → can set `existingTypes` to avoid duplication
- Missing bot names → can set `botsToAdd` for `configure_robots_txt`
- Sitemap URL (if found in robots.txt) → can set `sitemapUrl` arg

**The key constraint:** Pre-populated args must only include data the audit actually fetched and verified. Never invent values. Unprovided required args should be flagged as "needed from user" rather than guessed.

**Pattern from axe-core:** Each violation includes `helpUrl` pointing to the specific remediation guide for that rule. For this MCP context, the equivalent is: each finding includes a `suggestedToolCall` structured object that Claude can use to construct the next tool invocation with confidence.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `suggestedToolCall` includes tool name (already exists) | Developer or Claude needs to know which tool to call | ALREADY BUILT | Exists in current `AuditFinding` |
| `suggestedArgs` with pre-fillable arguments | The audit knows `siteUrl` and which bots are missing — robots fix should pre-populate these | LOW | Extend `AuditFinding` with `suggestedArgs?: Record<string, unknown>` |
| Pass `target` URL as `siteUrl` in all suggestions | Every fix tool needs to know where to write; audit already has target | LOW | Mechanical — audit knows target, always include it |
| Mark which args still need user input | Pre-filled args + "also needs: businessName, address" is more useful than silently omitting | LOW | Add `requiresUserInput?: string[]` alongside `suggestedArgs` |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured `suggestedToolCall` object instead of string | Enables Claude to call the suggested tool directly without re-parsing a prose instruction | MEDIUM | Change type from `string` to `{ tool: string, args: Partial<ToolInputs>, requiresUserInput: string[] }` |
| Include missing bot list in robots.txt fix args | `configure_robots_txt` with `botsToAdd: ['GPTBot', 'ClaudeBot']` pre-filled from audit finding | LOW | Already computed as `missing` array during audit — pass it through |
| Include found schema types in schema fix args | `generate_schema_markup` with `existingTypes: ['Organization']` so it doesn't duplicate | LOW | Already extracted during audit — pass through |
| Schema type recommendation based on business context | If `businessType` was provided to audit, include `recommendedType: 'SoftwareApplication'` in schema fix args | MEDIUM | Depends on Feature Area 3 (schema inference) being implemented |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-execute the suggested fix after audit | "Just fix it automatically" is appealing | Audit is a read-only diagnostic; auto-executing writes to user's files without explicit consent is dangerous. The wizard mode already handles opt-in execution. | Keep audit as diagnostic only; wizard mode handles execution with user confirmation |
| Pre-fill content fields (businessName, description) from crawled HTML | "The audit fetched the homepage — use its title tag as businessName" | Scraping content for business facts is unreliable and risks hallucination in generated files. Title tags are not canonical business names. | Require business context input explicitly; never infer content from scraped HTML |
| Generate complete tool invocation as a CLI string | `audit_ai_seo returns: "run configure_robots_txt siteUrl=https://example.com botsToAdd=GPTBot"` | String CLI format is fragile for machine parsing; MCP tools use JSON input schemas | Use structured `suggestedArgs` object, not serialized CLI strings |

**Dependencies:**
```
suggestedArgs pre-population
  → requires: audit dimensions return structured findings (not just message strings)
  → requires: AuditFinding type extended with suggestedArgs field
  → enables: wizard mode to construct tool calls without user re-entering target URL
  → enables: Claude to propose exact tool invocations in chat

structured suggestedToolCall (feature 5)
  ← depends on: framework detection (feature 2) for framework-specific args
  ← depends on: schema inference (feature 3) for recommendedType arg
```

---

## Feature Dependencies (Cross-Area)

```
detectedFramework (Feature 2)
  └──enhances──> suggestedToolCall args (Feature 5)
                    [framework-specific fix instructions]

businessType / schema inference (Feature 3)
  └──requires──> businessType in audit input
  └──enhances──> suggestedToolCall args (Feature 5)
                    [recommendedType pre-filled]

sitemapUrlCount (Feature 4)
  └──enables──> markdownMirrorCoverage comparison
  └──feeds──> AuditReport pagesAudited metadata

evidence field in AuditFinding (Feature 1)
  └──feeds──> suggestedArgs construction (Feature 5)
                    [evidence.missing → botsToAdd, evidence.found → existingTypes]

AuditFinding type extension (needed for Features 1 and 5)
  └──must ship together: evidence + suggestedArgs
  └──breaking change: suggestedToolCall string → object requires migration
```

### Dependency notes

- **Feature 1 (evidence) and Feature 5 (pre-population) share a type extension:** Both require changes to `AuditFinding`. They should be designed together to avoid two separate migrations.
- **Feature 3 (schema inference) requires a new audit input field:** `businessType` must be added to `audit_ai_seo` tool input schema. This is a non-breaking addition (optional field with default behavior).
- **Feature 4 (sitemap coverage) is a new audit dimension:** Adding sitemap as a 6th dimension or as metadata on the existing `AuditReport`. If added as metadata, no change to `AuditFinding` type; if added as a finding, it fits naturally but adds complexity.
- **Feature 2 (framework detection) has no upstream dependencies:** It is additive — fetches HTML already fetched by schema dimension, runs pattern matching, adds `detectedFramework` to `AuditReport`. Can ship independently.

---

## Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Structured evidence in findings (Feature 1, table stakes) | HIGH — unblocks debugging | LOW — data already computed, just not surfaced | P1 |
| `suggestedArgs` pre-population (Feature 5, table stakes) | HIGH — enables wizard mode quality | LOW — mechanical pass-through of existing data | P1 |
| Schema type inference / businessType input (Feature 3) | HIGH — fixes false positives on SaaS sites | MEDIUM — new input field + type mapping logic | P1 |
| Framework detection (Feature 2, table stakes) | MEDIUM — directional for fix instructions | LOW — regex on already-fetched HTML | P2 |
| Sitemap coverage (Feature 4, table stakes) | MEDIUM — new signal not currently measured | MEDIUM — new HTTP requests, XML parsing, sampling logic | P2 |
| Structured `suggestedToolCall` object (Feature 5, differentiator) | HIGH — enables machine-readable handoff | MEDIUM — type change + migration of all 5 dimension modules | P1 (ship with evidence field extension) |
| Framework-tailored fix messages (Feature 2, differentiator) | MEDIUM — better developer experience | MEDIUM — framework-to-guide mapping | P3 |
| Sitemap index detection (Feature 4, differentiator) | LOW — rare in this tool's target market | MEDIUM | P3 |

---

## Implementation Sequence Recommendation

1. **Extend `AuditFinding` type** — add `evidence` and `suggestedArgs` together (single breaking change)
2. **Update all 5 dimension modules** to populate `evidence` and `suggestedArgs`
3. **Add `businessType` to audit input** — enables correct schema validation
4. **Add framework detection** — additive, no dimension changes needed
5. **Add sitemap coverage** — new dimension or metadata; implement after core type changes stabilize

---

## Sources

| Source | Confidence | Used For |
|--------|------------|----------|
| Lighthouse understanding-results.md (GitHub) | HIGH | Evidence format: `details.items`, `nodeLabel`, `snippet`, `selector` structure |
| axe-core API documentation (Deque) | HIGH | `nodes[].html`, `nodes[].target`, `failureSummary`, result categories pattern |
| OWASP Web Security Testing Guide — Fingerprint Web Application Framework | MEDIUM | Asset path signals per framework; WordPress HTTP response codes for path probing |
| Wappalyzer documentation | MEDIUM | Multi-signal detection approach; HTML + headers + JS variables |
| Astro GitHub source (astro-island.ts) | MEDIUM | `<astro-island>` custom element, `data-astro-*` attributes, `astro:end` comment marker |
| schema.org/Organization, /SoftwareApplication, /LocalBusiness | HIGH | Type hierarchy and subtype recommendations |
| Google Search Central — Organization structured data | HIGH | "Use most specific subtype" recommendation; `OnlineStore` over `OnlineBusiness` |
| Dan Taylor SEO — Schema for SaaS | MEDIUM | SoftwareApplication + WebApplication mapping for SaaS category |
| Screaming Frog — How to Audit XML Sitemaps | MEDIUM | Sitemap audit approach: URL count, cross-reference, coverage assessment |
| MCP tool design best practices (DEV Community) | MEDIUM | Fewer tools, better descriptions, outcome-oriented design principle |
| ESLint auto-fix documentation | HIGH | `fixable` property pattern; audit-finding-to-fix handoff model |

---

*Feature research for: AI SEO Boost MCP Server v1.2 — audit observability and framework awareness*
*Researched: 2026-04-20*
