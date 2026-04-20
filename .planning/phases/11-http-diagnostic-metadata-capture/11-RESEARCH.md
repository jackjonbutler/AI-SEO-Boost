# Phase 11: HTTP Diagnostic Metadata Capture - Research

**Researched:** 2026-04-20
**Domain:** TypeScript type extension — audit diagnostics, HTTP metadata capture, backward-compatible interface additions
**Confidence:** HIGH (based on direct codebase inspection; no external libraries required)

---

## Summary

Phase 11 is a pure TypeScript types-and-wiring phase. No new dependencies are introduced. The goal is to add optional diagnostic fields to existing interfaces so that every audit finding carries verifiable HTTP evidence (URL checked, status code, byte count) and the `AuditReport` exposes the list of crawled URLs. All other v1.2 phases (12–15) depend on these types being declared first.

The codebase is already clean and compiles with zero errors (`tsc --noEmit`). The existing `AuditFinding` and `AuditReport` interfaces live in `src/audit/types.ts`; `MarkdownDocument` lives in `src/types/index.ts`. All new fields must be optional (`?`) to preserve backward compatibility with the wizard and the five dimension checks that already return `AuditFinding` objects. The wizard in `src/tools/index.ts` reads exactly five fields of `AuditFinding` — none of which change in this phase.

The deepest complexity in this phase is in `src/acquisition/crawl.ts`, where `fetchPage()` currently discards `res.status`, `res.headers`, and timing data immediately after calling `res.text()`. Phase 11 captures those values and populates `MarkdownDocument.httpMetadata` before returning. Separately, the two dimension checks that make targeted `HEAD`/`GET` fetches (`checkLlmsTxt` and `checkRobotsTxtAiAccess`) need their fetch paths refactored to capture the same metadata into `AuditFinding.diagnostics`.

**Primary recommendation:** Declare all new interfaces and optional fields first (zero risk, compile-time verification), then wire them bottom-up: acquisition layer, then dimension checks, then `runAudit()` for `pagesAudited`. Every step is independently verifiable with `tsc --noEmit`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.9.3 (project) | All types, optional field additions | Already in use; `strict: true` enforces null safety |
| Node.js `fetch` | Node 18 built-in | HTTP requests in dimension checks and crawlUrl | Already used throughout; no new imports needed |
| `AbortSignal.timeout()` | Node 18 built-in | Per-request timeouts | Already used in every dimension check and crawl.ts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Date.now()` | Built-in | Response timing (ms) | Wrap around `fetch()` call: `startMs` before, `responseTimeMs = Date.now() - startMs` after |
| `res.headers.get('content-length')` | Fetch API | Byte count of response body | Only available if server sends the header; must be `null`-safe |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Date.now()` timing | `performance.now()` | `performance.now()` has sub-ms precision but requires `import { performance } from 'node:perf_hooks'`; `Date.now()` is zero-import and ms precision is sufficient for diagnostic display |
| `content-length` header | Read body bytes | `res.text()` then `.length` measures string length, not byte count; `content-length` is the correct HTTP signal and requires no body re-read |
| Optional fields `?` | Non-optional with defaults | Non-optional would break all 5 dimension checks simultaneously; optional fields let each dimension adopt diagnostics incrementally |

**Installation:** No new packages. All needed APIs are Node 18 built-ins already in use.

---

## Architecture Patterns

### Recommended File Touch List

```
src/audit/types.ts          MODIFY — add AuditFindingDiagnostics, extend AuditFinding, extend AuditReport
src/types/index.ts          MODIFY — add HttpMetadata interface, extend MarkdownDocument
src/acquisition/crawl.ts    MODIFY — capture timing + status in fetchPage(), populate httpMetadata
src/audit/dimensions/
  llms-txt.ts               MODIFY — capture diagnostics in fetch call, populate finding.diagnostics
  robots-txt.ts             MODIFY — capture diagnostics in fetch call, populate finding.diagnostics
  schema.ts                 UNCHANGED
  faq.ts                    UNCHANGED
src/audit/index.ts          MODIFY — populate pagesAudited on AuditReport after Promise.all
```

No new files. No new MCP tools. No changes to `src/tools/index.ts` in this phase.

### Pattern 1: Optional Field Addition (Zero-Risk Type Extension)

**What:** Add new interfaces and optional fields to existing interfaces. All callers continue to compile without changes because TypeScript structural typing permits additional optional fields.

**When to use:** Every new field in Phase 11 follows this pattern.

```typescript
// src/audit/types.ts — BEFORE
export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
}

// src/audit/types.ts — AFTER
export interface AuditFindingDiagnostics {
  checkedUrl: string;          // the exact URL probed (e.g. "https://example.com/llms.txt")
  httpStatus: number;          // HTTP status code received (e.g. 403, 404, 200)
  contentLength: number | null; // bytes in response body; null if Content-Length header absent
  responseTimeMs: number;      // wall-clock ms from request start to response headers received
}

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;           // UNCHANGED — wizard reads this at line 253
  suggestedToolCallArgs?: Record<string, unknown>; // NEW — pre-seeded args for wizard (Phase 15 consumes)
  diagnostics?: AuditFindingDiagnostics;           // NEW — optional evidence block
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
  pagesAudited?: string[];    // NEW — URLs visited by the crawler (DIAG-03)
}
```

### Pattern 2: HttpMetadata on MarkdownDocument

**What:** Extend the acquisition-layer document type to carry the HTTP metadata captured at fetch time. Field is optional because local-source documents (`source: 'local'`) have no HTTP response.

```typescript
// src/types/index.ts — add before MarkdownDocument

export interface HttpMetadata {
  httpStatus: number;
  contentLength: number | null;  // null if Content-Length header absent
  responseTimeMs: number;
  userAgent: string;             // the UA string sent in the request
}

// src/types/index.ts — extend MarkdownDocument
export interface MarkdownDocument {
  url: string;
  title: string;
  description: string;
  markdown: string;
  frontmatter: Record<string, string>;
  source: 'local' | 'crawl';
  httpMetadata?: HttpMetadata;   // NEW — present only when source === 'crawl'
}
```

### Pattern 3: Timing Capture in fetchPage()

**What:** Wrap the `fetch()` call with `Date.now()` before and after to get wall-clock response time. Read `res.status` and `res.headers.get('content-length')` before `res.text()` (headers are already available at response start).

**When to use:** `src/acquisition/crawl.ts` `fetchPage()` — and replicated in each dimension check that does its own targeted fetch.

```typescript
// src/acquisition/crawl.ts — modified fetchPage() body

const CRAWL_USER_AGENT = 'ai-seo-boost/1.2 (+https://github.com/jackjonbutler/ai-seo-boost)';

async function fetchPage(url: string, baseDomain: string, timeoutMs: number): Promise<FetchPageResult> {
  try {
    const startMs = Date.now();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': CRAWL_USER_AGENT },
    });
    const responseTimeMs = Date.now() - startMs;

    if (!res.ok) {
      const error: AcquisitionError = { url, error: `HTTP ${res.status}`, source: 'crawl' };
      return { result: error, discoveredLinks: [] };
    }

    const contentLengthHeader = res.headers.get('content-length');
    const raw = await res.text();

    // ... existing HTML processing ...

    const doc: MarkdownDocument = {
      url,
      title,
      description,
      markdown,
      frontmatter: { title, url, description },
      source: 'crawl',
      httpMetadata: {
        httpStatus: res.status,
        contentLength: contentLengthHeader ? parseInt(contentLengthHeader, 10) : null,
        responseTimeMs,
        userAgent: CRAWL_USER_AGENT,
      },
    };

    return { result: doc, discoveredLinks };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const error: AcquisitionError = { url, error: errorMsg, source: 'crawl' };
    return { result: error, discoveredLinks: [] };
  }
}
```

### Pattern 4: Diagnostics Capture in Dimension Checks

**What:** For dimension checks that do targeted HTTP fetches (`checkLlmsTxt` uses `HEAD`, `checkRobotsTxtAiAccess` uses `GET`), capture timing and status after the fetch resolves and populate `finding.diagnostics` on every returned finding that has a status from the request.

**When to use:** `src/audit/dimensions/llms-txt.ts` and `src/audit/dimensions/robots-txt.ts`.

```typescript
// src/audit/dimensions/llms-txt.ts — modified URL probe block

if (isUrl(target)) {
  const url = new URL('/llms.txt', target).href;
  let res: Response;
  let responseTimeMs: number;
  try {
    const startMs = Date.now();
    res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    responseTimeMs = Date.now() - startMs;
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return { dimension, status: 'warning', severity: 'medium', message: `Could not reach ${url}: ${msg}` };
    // No diagnostics on network error — no HTTP response received
  }

  const diagnostics: AuditFindingDiagnostics = {
    checkedUrl: url,
    httpStatus: res.status,
    contentLength: res.headers.get('content-length')
      ? parseInt(res.headers.get('content-length')!, 10)
      : null,
    responseTimeMs,
  };

  if (res.status === 200) {
    return { dimension, status: 'pass', severity: 'low', message: 'llms.txt found at site root', diagnostics };
  }
  if (res.status === 404) {
    return {
      dimension, status: 'fail', severity: 'critical',
      message: 'llms.txt missing at site root',
      suggestedToolCall: 'generate_llms_txt',
      diagnostics,
    };
  }
  // DIAG-02: 403, 500, etc. surface explicitly rather than being silently treated as absent
  return {
    dimension, status: 'warning', severity: 'medium',
    message: `Unexpected HTTP status ${res.status} when probing ${url}`,
    diagnostics,
  };
}
```

### Pattern 5: pagesAudited Population in runAudit()

**What:** After `Promise.all` resolves in `runAudit()`, populate `pagesAudited` on the returned `AuditReport`. For URL targets, the crawler visits pages via `crawlUrl()` — but note that `runAudit()` does not call `crawlUrl()` directly (dimension checks make their own targeted fetches). The `pagesAudited` field lists the URLs that dimension checks probed.

**IMPORTANT:** `runAudit()` currently passes `probe` (the origin) to each dimension, which each dimension fetches independently. There is no single crawl list maintained by `runAudit()`. The correct implementation for DIAG-03 is to collect the `checkedUrl` values from each `finding.diagnostics` block after dimensions resolve — this gives an honest `pagesAudited` list of what was actually fetched during the audit.

```typescript
// src/audit/index.ts — after Promise.all resolves and before return

const findings = await Promise.all([
  checkLlmsTxt(probe),
  checkRobotsTxtAiAccess(probe),
  checkSchemaMarkup(probe),
  checkFaq(probe),
  checkMarkdownMirrors(probe),
]);

// Collect pagesAudited from diagnostics blocks
const pagesAudited = findings
  .flatMap(f => f.diagnostics?.checkedUrl ? [f.diagnostics.checkedUrl] : []);

const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);

return {
  target: trimmed,
  generatedAt: new Date().toISOString(),
  findings,
  pagesAudited: pagesAudited.length > 0 ? pagesAudited : undefined,
};
```

### Anti-Patterns to Avoid

- **Adding non-optional `diagnostics` field:** If `diagnostics` is required (not `?`), all five dimension checks must be updated simultaneously or TypeScript compilation fails. Phase 11 only touches `llms-txt.ts` and `robots-txt.ts`. `schema.ts`, `faq.ts`, and `markdown.ts` get diagnostics in later phases or remain without them. Keep it `diagnostics?: AuditFindingDiagnostics`.

- **Reading `res.headers` after `res.text()`:** The `content-length` header is available as soon as response headers arrive, before the body is consumed. Capture it immediately after `await fetch()` — the variable binding must happen before `await res.text()`.

- **Setting `pagesAudited` to empty array when no diagnostics exist:** DIAG-03 says "listing all URLs actually crawled." If no dimension has diagnostics (e.g., all are local-path checks), set `pagesAudited: undefined` — omit the field rather than returning `[]`. Callers expecting absence vs. empty array can be confused by `[]`.

- **Changing the `suggestedToolCall` field type or values:** The wizard's `TOOL_FIELD_MAP` keys and `switch` dispatch in `src/tools/index.ts` are keyed on exact string values of `suggestedToolCall`. Phase 11 does not change these values. Type narrowing to a union is Phase 15's job.

- **Populating `suggestedToolCallArgs` in this phase:** The field is declared in Phase 11 (DIAG requirement coverage), but the seeding logic belongs to Phase 15. Declaring the field as `Record<string, unknown> | undefined` is sufficient here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Response timing | Custom clock wrapper class | `const startMs = Date.now(); ... const ms = Date.now() - startMs;` | Two lines; no abstraction needed |
| Content-Length parsing | Body byte counting via `Buffer.byteLength(text, 'utf-8')` | `res.headers.get('content-length')` then `parseInt` | Body byte count != Content-Length (which is the wire size, possibly compressed); header is authoritative |
| Type guard for diagnostics presence | Runtime `instanceof` or duck-type | TypeScript optional chaining `finding.diagnostics?.checkedUrl` | Null-safe, no runtime overhead |

**Key insight:** This phase is almost entirely type declarations and two-line wiring changes. There is no algorithmic complexity to solve — the complexity is in understanding which files to touch and in what order to avoid compilation failures.

---

## Common Pitfalls

### Pitfall 1: Reading Content-Length After Body Consumed

**What goes wrong:** `res.text()` is called first, then `res.headers.get('content-length')` — still works (headers are accessible throughout), but the order implies body-first thinking and the pattern may confuse future readers.

**Why it happens:** Natural ordering: fetch → get body → inspect. But body consumption is a one-way door; headers are not.

**How to avoid:** Capture all header values immediately after the `await fetch()` line, before `await res.text()`.

**Warning signs:** The pattern `const body = await res.text(); const len = res.headers.get('content-length');` is not broken, but is misleading.

### Pitfall 2: HEAD Requests Have No Body — Content-Length Behavior

**What goes wrong:** `checkLlmsTxt` uses `method: 'HEAD'`. HEAD responses have no body by definition. `res.headers.get('content-length')` may return the would-be body size (servers may include it) or `null`. Either is valid — the null-safe path handles both.

**Why it happens:** HEAD is used for existence checks (fast), but diagnostics need byte count. The byte count from a HEAD response is the server's declared body size, not the received bytes.

**How to avoid:** Accept `null` as a valid `contentLength` value. The `AuditFindingDiagnostics.contentLength` type is `number | null` precisely for this case.

**Warning signs:** Code that calls `parseInt(res.headers.get('content-length')!, 10)` without the null check will throw when the header is absent. Use: `contentLength: contentLengthHeader ? parseInt(contentLengthHeader, 10) : null`.

### Pitfall 3: DIAG-02 Requires Explicit Status in Message, Not Just in diagnostics

**What goes wrong:** The 403 case is handled by adding it to `diagnostics.httpStatus` but the `message` field still says "Unexpected status" without the number. Success criterion 2 says the finding "explicitly states 403 (Forbidden)."

**Why it happens:** The diagnostic block has the status, but `message` is what callers and the wizard display to users.

**How to avoid:** For non-200/non-404 HTTP statuses, include the status code in the `message` string: `message: \`HTTP ${res.status} when probing ${url}\``. The `diagnostics.httpStatus` carries the machine-readable value; `message` carries the human-readable one.

**Warning signs:** Check both `finding.message` and `finding.diagnostics.httpStatus` in the acceptance test for criterion 2.

### Pitfall 4: Sorting Mutations Finding Reference After diagnostics Assignment

**What goes wrong:** `findings.sort(...)` in `runAudit()` mutates the array in-place. If `pagesAudited` is derived by iterating findings after the sort (correct), the `checkedUrl` values are still present. But if the derivation happens before sort and sort removes elements (it doesn't), data could be lost.

**Why it happens:** Confusion about whether sort affects element identity. It does not — sort reorders, not filters.

**How to avoid:** Derive `pagesAudited` before or after sort — both are safe. For readability, derive after `Promise.all`, before sort. The example in Pattern 5 is correct.

**Warning signs:** This is a non-issue for correctness but a potential source of confusion in code review.

### Pitfall 5: robots-txt dimension uses GET (not HEAD) — response body is available

**What goes wrong:** `checkRobotsTxtAiAccess` calls `await res.text()` to read the robots.txt content for bot-rule analysis. `contentLength` can therefore be measured from `rawText.length` as a fallback if the header is absent — but `rawText.length` is character count (UTF-16 code units in JS strings), not byte count.

**Why it happens:** robots.txt is almost always ASCII, so character count ≈ byte count — but this breaks for multibyte content.

**How to avoid:** Use `res.headers.get('content-length')` as primary. If null, leave `contentLength: null` rather than substituting string length. Consistency across all dimensions matters more than filling in the value.

**Warning signs:** Code like `contentLength: parseInt(res.headers.get('content-length') ?? String(text.length), 10)` should be rejected.

---

## Code Examples

### Full AuditFinding with diagnostics (JSON output shape)

```json
{
  "dimension": "llms-txt",
  "status": "fail",
  "severity": "critical",
  "message": "llms.txt missing at site root",
  "suggestedToolCall": "generate_llms_txt",
  "diagnostics": {
    "checkedUrl": "https://example.com/llms.txt",
    "httpStatus": 404,
    "contentLength": null,
    "responseTimeMs": 142
  }
}
```

### 403 case (DIAG-02 acceptance test shape)

```json
{
  "dimension": "llms-txt",
  "status": "warning",
  "severity": "medium",
  "message": "HTTP 403 when probing https://example.com/llms.txt",
  "diagnostics": {
    "checkedUrl": "https://example.com/llms.txt",
    "httpStatus": 403,
    "contentLength": 0,
    "responseTimeMs": 89
  }
}
```

### AuditReport with pagesAudited (DIAG-03 acceptance test shape)

```json
{
  "target": "https://example.com",
  "generatedAt": "2026-04-20T12:00:00.000Z",
  "pagesAudited": [
    "https://example.com/llms.txt",
    "https://example.com/robots.txt"
  ],
  "findings": [...]
}
```

### TypeScript: null-safe contentLength extraction

```typescript
// Source: Fetch API spec — Content-Length header
const contentLengthHeader = res.headers.get('content-length');
const contentLength: number | null = contentLengthHeader !== null
  ? parseInt(contentLengthHeader, 10)
  : null;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dimension checks discard HTTP status silently | Dimension checks capture status in `diagnostics` | Phase 11 | Callers can verify findings; 403 vs 404 distinction surface |
| `AuditReport` has no crawl scope info | `AuditReport.pagesAudited` lists probed URLs | Phase 11 | Callers can audit the auditor |
| `MarkdownDocument` has no HTTP provenance | `MarkdownDocument.httpMetadata` captures acquisition context | Phase 11 | Future coverage phases can use timing data |
| `suggestedToolCallArgs` not declared | Field declared as optional on `AuditFinding` | Phase 11 | Phase 15 can start populating without type errors |

**Not deprecated/removed:** Everything that exists continues to work unchanged.

---

## Open Questions

1. **Should `pagesAudited` include URLs from the crawl acquisition layer or only from dimension check probes?**
   - What we know: `runAudit()` does not call `crawlUrl()` — crawl is only used by the `generate_markdown_mirrors` wizard path. Dimension checks each issue their own targeted fetches.
   - What's unclear: DIAG-03 says "every URL the crawler visited" — but in the current audit flow, there is no BFS crawler. There are 2–3 targeted HEAD/GET probes per dimension.
   - Recommendation: Populate `pagesAudited` from `finding.diagnostics.checkedUrl` values — this is the honest answer to what `audit_ai_seo` actually fetches. If a future phase integrates `crawlUrl()` into the audit flow, `pagesAudited` will naturally expand. Document the current implementation in a code comment.

2. **`suggestedToolCallArgs` — should Phase 11 seed any values, or only declare the field?**
   - What we know: The field is declared for use by Phase 15 (WIZ-02). Phase 13 (schema inference) will also populate `recommendedType`. Phase 11's architecture says seed `target`-derivable args in `runAudit()`.
   - What's unclear: Seeding in Phase 11 vs. leaving it to Phase 15 is a planning decision. Seeding here creates a testable behavior immediately.
   - Recommendation: Declare the field in types (required for Phase 11). Seeding is optional — if included, populate `{ target: trimmed }` for any finding that has a `suggestedToolCall`. This is safe and gives Phase 15 something to build on.

3. **`robots-txt.ts` currently calls `res.text()` to get the full body for bot-rule analysis. Should `diagnostics.contentLength` reflect the actual body size?**
   - What we know: After `await res.text()`, string `.length` is available but is character count, not byte count. `Content-Length` header is authoritative but may be absent.
   - Recommendation: Use `Content-Length` header value if present; `null` otherwise. Do not attempt to compute byte length from string. This is consistent with the `llms-txt.ts` (HEAD) behavior.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/audit/types.ts` (current `AuditFinding`, `AuditReport` shapes)
- Direct codebase inspection — `src/types/index.ts` (current `MarkdownDocument`, `AcquisitionResult` shapes)
- Direct codebase inspection — `src/acquisition/crawl.ts` `fetchPage()` (where metadata is discarded)
- Direct codebase inspection — `src/audit/dimensions/llms-txt.ts` (current HEAD probe, silent status handling)
- Direct codebase inspection — `src/audit/dimensions/robots-txt.ts` (current GET, text parsing)
- Direct codebase inspection — `src/tools/index.ts` lines 189, 234, 253, 369 (wizard field reads — none of which change)
- Direct codebase inspection — `src/audit/index.ts` (runAudit flow, Promise.all, return shape)
- `.planning/research/ARCHITECTURE.md` — v1.2 architecture decisions (HIGH confidence — project-authored)
- `tsc --noEmit` passes clean on current codebase (verified 2026-04-20)

### Secondary (MEDIUM confidence)

- Fetch API specification — `Content-Length` header behavior for HEAD requests (verified: servers MAY include it to indicate body size, not guaranteed)
- TypeScript structural typing rules — optional field additions do not break existing assignees (well-established language behavior)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; all used APIs are already in the codebase
- Architecture: HIGH — directly derived from codebase inspection + existing `.planning/research/ARCHITECTURE.md`
- Pitfalls: HIGH — derived from actual code reading (null-unsafe patterns identified in current fetch paths)
- Type design: HIGH — verified against TypeScript 5.x optional field behavior

**Research date:** 2026-04-20
**Valid until:** 90 days — TypeScript interfaces and Node fetch API are stable; no fast-moving ecosystem involved
