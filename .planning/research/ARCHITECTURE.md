# Architecture Research

**Domain:** TypeScript MCP Server — v1.2 Audit Observability and Framework Awareness
**Researched:** 2026-04-20
**Confidence:** HIGH (based on direct codebase inspection of all relevant files)

---

## Context: Existing Pipeline (Verified from Source)

Before recommending changes, these are the actual types and call chains in production code:

**`src/audit/types.ts` — current contract:**
```typescript
interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;          // used by wizard switch dispatch
}

interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
}
```

**`src/audit/index.ts` — runAudit() signature:**
```typescript
export async function runAudit(target: string): Promise<AuditReport>
```
Five dimension checks run in `Promise.all([ ... ])`, each receiving `probe: string` (origin URL or local path). No shared context passes between them.

**`src/acquisition/crawl.ts` — fetchPage() internal:**
```typescript
const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
// res.status, res.headers discarded after res.text() call
// Returns AcquisitionResult (MarkdownDocument | AcquisitionError)
```

**`src/tools/index.ts` — wizard dependency on AuditFinding:**
The wizard reads `finding.suggestedToolCall` (line 253) and `finding.dimension` (lines 189, 234, 369). It builds issue keys as `` `${f.dimension}:${f.status}` `` (line 189). TOOL_FIELD_MAP is keyed on `suggestedToolCall` string values. No other fields of `AuditFinding` are read by the wizard.

---

## Question 1: Diagnostic Metadata Flow

**Recommendation: Option (a) — extend `AcquisitionResult` / add `HttpMetadata` to `MarkdownDocument`.**

**Rationale:**

The three alternatives fail for these concrete reasons:

- **(b) separate metadata map**: `crawlUrl()` returns `AcquisitionResult[]` with no stable index. Callers would need to zip by URL, introducing ordering bugs and requiring two parallel data structures. The existing `MarkdownDocument.url` field is the natural key — keeping metadata co-located with the document is cleaner.
- **(c) re-fetch inside dimension checks**: Each dimension already makes its own `fetch()` call (`checkLlmsTxt`, `checkRobotsTxtAiAccess`, `checkSchemaMarkup`, `checkFaq` all fetch independently). A third fetch of the same URL purely for headers adds latency and contradicts the purpose of the acquisition layer.
- **(a) extend MarkdownDocument**: The acquisition layer already produces `MarkdownDocument`. Adding optional metadata fields there keeps the data with its source and requires zero changes to the dimension check signatures — dimensions that don't need metadata ignore it.

**Concrete change — `src/types/index.ts`:**

```typescript
export interface HttpMetadata {
  httpStatus: number;
  contentLength: number | null;   // null if header absent
  responseTimeMs: number;
  userAgent: string;              // the agent string sent in the request
}

export interface MarkdownDocument {
  url: string;
  title: string;
  description: string;
  markdown: string;
  frontmatter: Record<string, string>;
  source: 'local' | 'crawl';
  httpMetadata?: HttpMetadata;    // present only for source: 'crawl'
}
```

**Concrete change — `src/acquisition/crawl.ts` `fetchPage()`:**

```typescript
const startMs = Date.now();
const res = await fetch(url, {
  signal: AbortSignal.timeout(timeoutMs),
  headers: { 'User-Agent': CRAWL_USER_AGENT },
});
const responseTimeMs = Date.now() - startMs;

// After: const doc: MarkdownDocument = { ... }
doc.httpMetadata = {
  httpStatus: res.status,
  contentLength: res.headers.get('content-length')
    ? parseInt(res.headers.get('content-length')!, 10)
    : null,
  responseTimeMs,
  userAgent: CRAWL_USER_AGENT,
};
```

`CRAWL_USER_AGENT` is a module-level constant in `crawl.ts` — one place to update, visible in diagnostic output.

**Data flow after this change:**

```
crawlUrl() → MarkdownDocument[].httpMetadata (captured in fetchPage)
    ↓
runAudit() passes probe string to dimensions
    ↓
Dimensions that need HTTP diagnostics: fetch their own targeted URLs
(llms-txt, robots-txt, markdown dimensions already do HEAD/GET of specific paths)
    ↓
Diagnostics for those targeted fetches captured inline in each dimension's fetch call
    ↓
AuditFinding.diagnostics carries the metadata (see Question 3)
```

Note: `crawlUrl()` is used by the `generate_markdown_mirrors` wizard path (tools/index.ts line 491), not by dimension checks. Dimension checks all issue their own targeted fetches. So `httpMetadata` on `MarkdownDocument` is useful for the **coverage check** (Question 5) — dimension checks need their own inline timing/status capture.

---

## Question 2: Framework Detection Placement

**Recommendation: Option (b) — a preprocessing step in `runAudit()` that enriches `AuditReport`.**

**Rationale:**

- **(a) 6th audit dimension**: Framework is not a pass/fail finding. There is nothing to fix — it is descriptive context. Forcing it into the `AuditFinding` shape (`status`, `severity`, `suggestedToolCall`) is a category error. The dimension union type (`AuditDimension`) would need a new member just for informational data.
- **(c) computed inside each dimension**: Robots.txt, llms.txt, and markdown checks don't actually need framework to do their jobs. If they did, each would fetch `/` independently just to detect framework — three redundant fetches. Only fix-suggestion copy benefits from knowing the framework.
- **(d) utility called from wherever**: Works but produces duplicate fetches and inconsistent results if the same page is fetched at different times.
- **(b) preprocessing in runAudit()**: One fetch of `target` (already available as `probe`), framework detected once, stored on `AuditReport`, available to any caller including the wizard.

**Framework detection logic — `src/audit/framework.ts` (new file):**

```typescript
export type DetectedFramework =
  | 'WordPress'
  | 'Shopify'
  | 'Webflow'
  | 'Squarespace'
  | 'Wix'
  | 'Next.js'
  | 'Nuxt'
  | 'Hugo'
  | 'Jekyll'
  | null;

export async function detectFramework(target: string): Promise<DetectedFramework> {
  if (!isUrl(target)) return null;   // local folders: no framework detection
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    return inferFromHtml(html, res.headers);
  } catch {
    return null;
  }
}
```

Signal heuristics (HTML pattern matching, no external APIs needed):
- WordPress: `wp-content/`, `wp-json` in links or generator meta
- Shopify: `cdn.shopify.com`, `Shopify.theme` in scripts
- Webflow: `webflow.com` in scripts, `data-wf-page` attributes
- Next.js: `__NEXT_DATA__` script tag or `_next/static` paths
- Hugo: `<meta name="generator" content="Hugo`
- Jekyll: `<meta name="generator" content="Jekyll`

Framework flows to fix suggestions: the wizard can include framework-specific notes in elicitation messages (e.g., "For WordPress, the llms.txt goes in your web root, typically `/var/www/html/llms.txt`"). This is done in the wizard's gap-fill switch by reading `report.framework` passed through as context — no change to `AuditFinding` shape required.

---

## Question 3: AuditReport Shape Changes

**Recommendation: Add optional fields only. No existing field renamed or removed.**

**Concrete change — `src/audit/types.ts`:**

```typescript
export interface AuditFindingDiagnostics {
  httpStatus?: number;
  responseTimeMs?: number;
  contentLength?: number | null;
  checkedUrl?: string;           // the exact URL that was probed
}

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;         // UNCHANGED — wizard reads this
  diagnostics?: AuditFindingDiagnostics;  // NEW — optional, wizard ignores
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
  pagesAudited?: string[];            // NEW — optional URL[]
  framework?: string | null;          // NEW — optional
}
```

**Wizard impact assessment:**

The wizard reads exactly these fields of `AuditFinding`:
- `f.suggestedToolCall` — unchanged
- `f.dimension` — unchanged
- `f.status` — unchanged
- `f.severity` — unchanged (used in issue checklist title)
- `f.message` — unchanged (used in issue checklist title)

Adding `diagnostics?: AuditFindingDiagnostics` is invisible to the wizard. TypeScript `optional` fields are safe additions — the wizard's `AccumulatedContext` accumulator and `TOOL_FIELD_MAP` dispatch are untouched.

The wizard also reads `report.findings` — adding `pagesAudited` and `framework` to `AuditReport` does not affect `report.findings` iteration.

**Detailed-report path impact:**

The non-wizard path (`!useWizard`) does `JSON.stringify(report, null, 2)`. New optional fields appear in the JSON automatically — beneficial, not breaking.

**Minimal wizard change (only if framework-aware suggestions are wanted):**

Pass `report.framework` into the wizard's issue messages. The only place to thread it is as a local variable after `runAudit()` returns:

```typescript
const report = await runAudit(target.trim());
const detectedFramework = report.framework ?? null;
// Later, in gap-fill message construction:
// `To fix "${finding.dimension}" on your ${detectedFramework ?? 'site'}...`
```

This is a string interpolation change only — no type changes, no structural changes.

---

## Question 4: `suggestedToolCallArgs` Pre-population

**Recommendation: Populate in `runAudit()` after findings are collected, not in dimension checks and not in the tool handler.**

**Rationale:**

- **(in dimension checks)**: Dimension checks receive only `probe: string`. They don't know `businessContext`, `outputPath`, or other wizard fields. They can only populate `target`-derived args. Having dimension checks build partial args creates an inconsistency — some args come from dimensions, others from the wizard. Two sources of truth for the same object.
- **(in tool handler)**: The handler already delegates to `runAudit()`. Duplicating the mapping logic there means the handler must know which tool needs which args, which is already encoded in `TOOL_FIELD_MAP`. This is the right data, but it lives in the handler — cross-layer reach.
- **(in `runAudit()` after collection)**: `runAudit()` knows `target`. After collecting findings, it can walk findings and set args derived from `target` alone (e.g., the `target` URL/path itself). Args requiring business context (businessName, outputPath) cannot be pre-populated here — they are genuinely unknown until the wizard elicits them. But `target` can be seeded.

**Concrete change — `src/audit/types.ts`:**

```typescript
export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;
  suggestedToolCallArgs?: Record<string, unknown>;  // NEW — pre-seeded args
  diagnostics?: AuditFindingDiagnostics;
}
```

**In `runAudit()`, after `Promise.all` resolves:**

```typescript
// Seed target-derivable args into each finding
for (const finding of findings) {
  if (!finding.suggestedToolCall) continue;
  finding.suggestedToolCallArgs = { target: trimmed };
  // Tool-specific seeds:
  if (finding.suggestedToolCall === 'configure_robots_txt') {
    // Can infer robotsPath if target is local: path.join(target, 'robots.txt')
    if (!isUrl(trimmed)) {
      finding.suggestedToolCallArgs.robotsPath = path.join(trimmed, 'robots.txt');
    }
  }
}
```

**Wizard consumption:** The `AccumulatedContext` accumulator in `tools/index.ts` is seeded from `businessContext` (line 247). Adding a step that also merges `finding.suggestedToolCallArgs` into `acc` before the gap-fill check reduces the number of fields elicited. The merge happens before `allMissing` computation (line 264):

```typescript
// Seed from finding's pre-populated args (reduces gap-fill questions)
if (finding.suggestedToolCallArgs) {
  Object.assign(acc, finding.suggestedToolCallArgs);
}
```

This is additive — existing gap-fill logic is unchanged. Fields pre-seeded this way are simply not in `allMissing` anymore.

---

## Question 5: Mirror Coverage Check

**Recommendation: Fetch and parse sitemap XML inline within `checkMarkdownMirrors()`. Do not reuse the existing sitemap audit logic.**

**Rationale:**

The existing `checkSchemaMarkup` and `checkFaq` dimension checks already contain a local `getHtml()` helper (duplicated in both files). The audit dimensions are designed as independent, standalone checks — they do not share state or call each other. This is intentional: `Promise.all` parallelism would break if dimensions depended on each other's results.

Parsing sitemap XML is ~15 lines of code. Fetching `/sitemap.xml`, counting `<loc>` entries, then HEAD-probing each `.md` equivalent is self-contained. The alternative — extracting sitemap logic into a shared module that dimensions can import — is worthwhile if multiple dimensions need sitemaps, but currently only `checkMarkdownMirrors` needs this.

**Concrete change — `src/audit/dimensions/markdown.ts`:**

```typescript
async function fetchSitemapUrls(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const xml = await res.text();
    // Extract <loc> values — no XML parser needed, regex sufficient for well-formed sitemaps
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m => m[1].trim());
    return locs.filter(u => u.startsWith(origin));   // same-domain only
  } catch {
    return [];
  }
}

async function checkMirrorExists(pageUrl: string): Promise<boolean> {
  const mdUrl = pageUrl.replace(/\/?$/, '/index.md').replace('//', '/').replace(':/', '://');
  // Cleaner: derive md URL from page URL
  const u = new URL(pageUrl);
  u.pathname = u.pathname.replace(/\/?$/, '/') + 'index.md';
  try {
    const res = await fetch(u.href, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}
```

Coverage calculation:
```typescript
const urls = await fetchSitemapUrls(origin);
if (urls.length === 0) {
  // Fall back to current /index.md probe
}
const checks = await Promise.all(urls.slice(0, 20).map(checkMirrorExists)); // cap at 20
const covered = checks.filter(Boolean).length;
const pct = Math.round((covered / urls.length) * 100);
```

Cap sitemap URL probing at 20 to avoid timeout. Return `pagesAudited` as the sitemap URLs list for `AuditReport.pagesAudited`.

**If sitemap logic grows:** Extract to `src/audit/sitemap.ts` shared utility. But for v1.2, inline is appropriate.

---

## Build Order (Wizard-Safe Sequence)

Changes are ordered by dependency and risk. The wizard is the highest-risk consumer — any breaking change to `AuditFinding` or `AuditReport` breaks the wizard at runtime (type errors caught at compile time, but shape assumptions in the wizard's logic are runtime).

```
Step 1 — Types only (no runtime changes, compile-time verification)
  File: src/audit/types.ts
  Add: AuditFindingDiagnostics interface
  Add: diagnostics?: AuditFindingDiagnostics to AuditFinding
  Add: suggestedToolCallArgs?: Record<string, unknown> to AuditFinding
  Add: pagesAudited?: string[] to AuditReport
  Add: framework?: string | null to AuditReport
  Risk: ZERO — optional fields, existing code compiles unchanged
  Verify: tsc --noEmit passes

Step 2 — HttpMetadata on MarkdownDocument (acquisition layer)
  File: src/types/index.ts
  Add: HttpMetadata interface
  Add: httpMetadata?: HttpMetadata to MarkdownDocument
  File: src/acquisition/crawl.ts
  Modify: fetchPage() to capture timing and capture response metadata
  Add: CRAWL_USER_AGENT constant
  Risk: LOW — additive only; crawlUrl() callers receive richer objects, no existing field removed
  Verify: tsc --noEmit passes; crawl still returns AcquisitionResult[]

Step 3 — Framework detection (new file, isolated)
  File: src/audit/framework.ts (NEW)
  Implement: detectFramework(target) → DetectedFramework
  Risk: ZERO — new file, nothing imports it yet
  Verify: unit test with fixture HTML strings

Step 4 — runAudit() enrichment (adds framework + pagesAudited + seeds args)
  File: src/audit/index.ts
  Add: call detectFramework(probe) in parallel with dimension checks
  Add: post-collection loop to populate suggestedToolCallArgs
  Add: pagesAudited from sitemap dimension result (see Step 5)
  Risk: LOW — AuditReport shape additions are backward-compatible; wizard reads report.findings, not new fields
  Verify: existing wizard flow tested end-to-end

Step 5 — Extended markdown mirror coverage check
  File: src/audit/dimensions/markdown.ts
  Add: fetchSitemapUrls() helper
  Add: checkMirrorExists() helper
  Modify: checkMarkdownMirrors() to use sitemap when available
  Risk: MEDIUM — changes existing dimension behavior (currently always one probe; now up to 21 probes)
  Mitigate: keep /index.md fallback if sitemap returns empty; cap probes at 20; existing pass/fail thresholds unchanged for zero-mirror case
  Verify: existing pass/fail/warning return paths preserved; new coverage-% path only active when sitemap found

Step 6 — Diagnostics on dimension checks (targeted, high-value checks first)
  Files: src/audit/dimensions/llms-txt.ts, robots-txt.ts
  Add: capture responseTimeMs, httpStatus, checkedUrl in fetch calls
  Add: populate finding.diagnostics before returning
  Risk: LOW — diagnostics is optional; wizard ignores it; detailed-report path shows it via JSON.stringify
  Verify: findings still include suggestedToolCall unchanged

Step 7 — Wizard seeding from suggestedToolCallArgs (optional for v1.2)
  File: src/tools/index.ts
  Add: Object.assign(acc, finding.suggestedToolCallArgs ?? {}) before allMissing computation
  Risk: LOW — acc already merges businessContext; adding pre-seeded args reduces elicitation only
  Verify: wizard still elicits missing required fields; pre-seeded fields not re-asked
```

---

## Component Boundary Map (v1.2 Changes)

```
src/types/index.ts          MODIFIED — adds HttpMetadata, extends MarkdownDocument
src/audit/types.ts          MODIFIED — extends AuditFinding (diagnostics, suggestedToolCallArgs)
                                       extends AuditReport (pagesAudited, framework)
src/audit/framework.ts      NEW       — detectFramework() pure utility
src/audit/index.ts          MODIFIED  — calls detectFramework(), seeds suggestedToolCallArgs
src/audit/dimensions/
  markdown.ts               MODIFIED  — coverage % via sitemap, fetchSitemapUrls helper
  llms-txt.ts               MODIFIED  — populates finding.diagnostics
  robots-txt.ts             MODIFIED  — populates finding.diagnostics
  schema.ts                 UNCHANGED (no HTTP probes to time)
  faq.ts                    UNCHANGED (no HTTP probes to time)
src/acquisition/crawl.ts    MODIFIED  — captures HttpMetadata in fetchPage()
src/tools/index.ts          MINIMAL CHANGE — one Object.assign line for arg seeding (Step 7 only)
```

No new files in `src/tools/` or `src/generators/`. No new MCP tools.

---

## Data Flow: Diagnostic Metadata (v1.2)

```
[crawlUrl() in crawl.ts]
  fetchPage(url)
    → startMs = Date.now()
    → fetch(url, { headers: { User-Agent: CRAWL_USER_AGENT } })
    → responseTimeMs = Date.now() - startMs
    → MarkdownDocument.httpMetadata = { httpStatus, contentLength, responseTimeMs, userAgent }
    → returned via AcquisitionResult[]

[dimension checks — their own targeted fetches]
  checkLlmsTxt(probe)
    → fetch('/llms.txt', { method: 'HEAD' })
    → capture: status, timing, checkedUrl
    → return AuditFinding { ..., diagnostics: { httpStatus, responseTimeMs, checkedUrl } }

  checkRobotsTxtAiAccess(probe)
    → fetch('/robots.txt')
    → capture: status, timing, checkedUrl
    → return AuditFinding { ..., diagnostics: { ... } }

  checkMarkdownMirrors(probe)
    → fetch('/sitemap.xml') → locs[]
    → HEAD probe each loc's .md equivalent (capped at 20)
    → return AuditFinding { ..., diagnostics: { ... }, pagesAudited: locs }

[runAudit() in audit/index.ts]
  → detectFramework(probe) [parallel with dimensions]
  → Promise.all([ checkLlmsTxt, checkRobotsTxt, checkSchema, checkFaq, checkMarkdown ])
  → post-collection: seed suggestedToolCallArgs on each finding
  → return AuditReport {
      findings: [ AuditFinding with diagnostics ],
      pagesAudited: [...from markdown dimension],
      framework: 'WordPress' | null | ...
    }

[tools/index.ts — audit_ai_seo handler]
  → report.findings → wizard issue selection (suggestedToolCall, dimension, status unchanged)
  → JSON.stringify(report) → detailed-report path (framework, pagesAudited, diagnostics visible)
```

---

## Breaking Change Risk Register

| Change | Breaking? | Reason | Mitigation |
|--------|-----------|--------|------------|
| Add `diagnostics?` to `AuditFinding` | No | Optional field, TypeScript structural typing | tsc --noEmit in CI |
| Add `suggestedToolCallArgs?` to `AuditFinding` | No | Optional field | tsc --noEmit in CI |
| Add `pagesAudited?` to `AuditReport` | No | Optional field | tsc --noEmit in CI |
| Add `framework?` to `AuditReport` | No | Optional field | tsc --noEmit in CI |
| Add `httpMetadata?` to `MarkdownDocument` | No | Optional field | tsc --noEmit in CI |
| `checkMarkdownMirrors` behavior change | Potential | Timing increases (up to 20 HEAD probes) | Cap at 20, keep /index.md fallback |
| Wizard `Object.assign(acc, suggestedToolCallArgs)` | Potential | Pre-seeded field could shadow user-provided value | Seed before gap-fill check, not after; acc already wins over pre-seeds |

**Non-risks:** `TOOL_FIELD_MAP` does not change. `suggestedToolCall` string values do not change. Wizard's `switch(toolName)` dispatch does not change. Issue checklist key format (`dimension:status`) does not change.

---

## Anti-Patterns to Avoid in v1.2

### Anti-Pattern 1: Framework Detection Inside Dimension Checks
**What:** Each dimension check that needs framework calls `detectFramework()` independently.
**Why bad:** 3+ fetches of the same root URL, inconsistent results if site state changes between calls, increases audit latency by 15+ seconds.
**Instead:** Detect once in `runAudit()`, store on `AuditReport.framework`, pass as context to wizard messages.

### Anti-Pattern 2: Adding a Non-Optional Field to AuditFinding
**What:** Adding `diagnostics: AuditFindingDiagnostics` (required, not optional).
**Why bad:** All 5 dimension checks must be updated simultaneously or TypeScript compilation fails. The smoke test must be updated. Any partial update breaks the build.
**Instead:** `diagnostics?: AuditFindingDiagnostics` — dimension checks that don't yet capture diagnostics return without setting it. Callers null-check before reading.

### Anti-Pattern 3: Probing All Sitemap URLs Without a Cap
**What:** `checkMarkdownMirrors` fetches HEAD for every URL in sitemap.xml.
**Why bad:** Enterprise sitemaps have 50,000+ URLs. This makes the audit hang indefinitely or time out the MCP host.
**Instead:** Cap at 20 URLs per audit run. Report `pagesAudited` as the full sitemap count, coverage % computed from the sampled subset with a note that sampling was used.

### Anti-Pattern 4: Storing Framework in AuditFinding
**What:** Adding a new `framework` dimension that returns an `AuditFinding` with `status: 'pass'` and `message: 'Detected WordPress'`.
**Why bad:** Framework is descriptive metadata, not a pass/fail diagnostic. Forcing it into `AuditFinding` pollutes the issue checklist with a non-actionable item. The wizard would need to filter it out.
**Instead:** `AuditReport.framework?: string | null` — a first-class property of the report, not a finding.

---

## Sources

- Direct inspection of `src/audit/types.ts`, `src/audit/index.ts`, `src/audit/dimensions/*.ts` (HIGH confidence — source code)
- Direct inspection of `src/tools/index.ts` lines 189, 234, 253, 369 for wizard field reads (HIGH confidence — source code)
- Direct inspection of `src/acquisition/crawl.ts` `fetchPage()` for metadata discard point (HIGH confidence — source code)
- Direct inspection of `src/types/index.ts` for `AcquisitionResult` and `MarkdownDocument` shape (HIGH confidence — source code)
- TypeScript structural typing rules for optional field additions (HIGH confidence)

---

*Architecture research for: AI SEO Boost v1.2 audit observability and framework awareness*
*Researched: 2026-04-20*
