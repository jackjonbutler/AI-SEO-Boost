# Phase 12: Framework Detection - Research

**Researched:** 2026-04-21
**Domain:** TypeScript — heuristic HTML signal analysis, new file creation, AuditReport extension, fix-suggestion copy variation
**Confidence:** HIGH (based on direct codebase inspection; framework signal data verified against official source docs and authoritative tool survey)

---

## Summary

Phase 12 adds framework detection to the audit pipeline. Every `AuditReport` will carry a `framework` field describing the detected web framework (e.g. Next.js, WordPress, Nuxt) at a confidence level ("high", "medium", "low", or "none"). Detection works entirely from HTML the audit already fetches — no new HTTP round-trips are required beyond what Phase 11 already does for dimension checks. A single new file, `src/audit/framework.ts`, implements the detection function; `src/audit/types.ts` gains the `FrameworkDetection` type and the `AuditReport.framework` optional field.

The three dimension files (`llms-txt.ts`, `robots-txt.ts`, `markdown.ts`) and the wizard in `src/tools/index.ts` each gain a small string-interpolation change that conditionally mentions the detected framework in fix-suggestion text. The requirement that two independent signals must both be present before confidence reaches "high" is the core algorithmic constraint — it prevents false positives from single-signal matches (e.g. a page that incidentally links to a Next.js CDN resource).

Phase 12 has zero risk of breaking the existing wizard because `AuditReport.framework` is a new optional field and `AuditFinding` shape is unchanged. The schema-type-map mentioned in the architecture notes (`src/audit/schema-type-map.ts`) is out of scope for this phase — that file is for Phase 13 (schema inference). Do not create it here.

**Primary recommendation:** Implement `detectFramework()` as a pure function over an HTML string plus HTTP headers, run it in `runAudit()` in parallel with the five dimension checks, and pass `report.framework` to dimension fix-suggestion generators as a context string.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.9.3 (project) | All new types, optional field additions | Already in use; `strict: true` enforces null safety |
| Node.js built-in `fetch` | Node 18+ built-in | One HTTP GET of site root for framework HTML | Already used throughout codebase |
| `cheerio` | Already installed (used in `schema.ts`, `crawl.ts`) | HTML parsing for framework signal detection | Already in the dependency graph — zero new installs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AbortSignal.timeout()` | Node 18+ built-in | Per-request timeout on framework detection fetch | Same pattern used everywhere in codebase |
| Regex / string `includes()` | Built-in | HTML string signal matching | Sufficient for all framework fingerprints; no XML/DOM parser needed for most signals |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex on raw HTML string | Cheerio DOM query | Cheerio is already imported in `schema.ts` and `crawl.ts`, so either works — raw string matching (`includes()` / `/pattern/.test()`) is faster and has no parse overhead for simple asset-path signals; use Cheerio only for `<meta name="generator">` extraction |
| Custom fetch in `framework.ts` | Reuse HTML from schema.ts fetch | `schema.ts` already GETs the root HTML; however, dimension checks run in parallel and don't share state — `detectFramework()` must fetch independently or receive the HTML string as a parameter (see Architecture Pattern 1) |
| npm package (e.g. `whatruns`, `wappalyzer`) | Hand-rolled signal map | External packages add a dependency, have their own update cycles, and do far more than needed; the 6 framework signals required here are stable and fully describable in ~80 lines of TypeScript |

**Installation:** No new packages. `cheerio` is already a project dependency.

---

## Architecture Patterns

### Recommended File Touch List

```
src/audit/types.ts                ADD: FrameworkDetection type, AuditReport.framework? field
src/audit/framework.ts            NEW: detectFramework(html, headers) → FrameworkDetection
src/audit/index.ts                MODIFY: call detectFramework in parallel; pass to report
src/audit/dimensions/llms-txt.ts  MODIFY: accept optional framework param; vary fix-suggestion message
src/audit/dimensions/robots-txt.ts MODIFY: accept optional framework param; vary fix-suggestion message
src/audit/dimensions/markdown.ts  MODIFY: accept optional framework param; vary fix-suggestion message
src/tools/index.ts                MODIFY: pass report.framework into wizard gap-fill messages (optional string interp only)
```

**Not touched:**
- `src/audit/dimensions/schema.ts` — schema suggestions don't vary by framework
- `src/audit/dimensions/faq.ts` — FAQ suggestions don't vary by framework
- `src/types/index.ts` — no changes needed
- `src/acquisition/crawl.ts` — no changes needed

### Pattern 1: detectFramework() — Pure Function Over HTML + Headers

**What:** `detectFramework()` is a pure function that takes the raw HTML string and HTTP response headers of the site's root page and returns a `FrameworkDetection` struct. It does NOT do I/O. The caller (`runAudit()`) is responsible for fetching the HTML and passing it in.

**Why this signature:** It keeps `framework.ts` unit-testable without network mocking. The caller already has the HTML from `schema.ts`'s `getHtml()` — but since dimension checks run in parallel and don't share output, `runAudit()` will do its own fetch of `probe` for framework detection. This is one additional root fetch beyond the five dimension fetches, but it's in parallel and is the architecture's intended design (see ARCHITECTURE.md Question 2, Option b).

**Example:**

```typescript
// src/audit/framework.ts

export type FrameworkConfidence = 'high' | 'medium' | 'low' | 'none';

export interface FrameworkDetection {
  name: string | null;   // e.g. "Next.js", "WordPress", null for unknown
  confidence: FrameworkConfidence;
}

/**
 * Detect the web framework from raw HTML + HTTP headers.
 * Pure function — no I/O. Caller fetches the HTML.
 *
 * Confidence rules (FWK-03):
 *  - 'high'   → 2+ independent signals matched
 *  - 'medium' → exactly 1 strong signal matched
 *  - 'low'    → exactly 1 weak signal matched
 *  - 'none'   → no signals matched (null name)
 */
export function detectFramework(html: string, headers: Headers): FrameworkDetection {
  // ... (see Code Examples section)
}

/** I/O wrapper — used by runAudit(). Returns null for local targets. */
export async function fetchAndDetectFramework(target: string): Promise<FrameworkDetection | null> {
  if (!isUrl(target)) return null;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    return detectFramework(html, res.headers);
  } catch {
    return null;
  }
}
```

### Pattern 2: AuditReport.framework Type Addition

**What:** Add `FrameworkDetection` type and `framework?` optional field to `src/audit/types.ts`.

**Constraint:** Phase 12 adds a structured object (`{ name, confidence }`) not a bare string, because FWK-03 requires a confidence level. The architecture notes show `framework?: string | null` — the phase requirements override this with the structured form.

```typescript
// src/audit/types.ts — ADD

export type FrameworkConfidence = 'high' | 'medium' | 'low' | 'none';

export interface FrameworkDetection {
  /** Detected framework name, e.g. "Next.js", "WordPress", "Nuxt". Null if unknown. */
  name: string | null;
  /** Confidence level: 'high' requires 2+ independent signals (FWK-03). */
  confidence: FrameworkConfidence;
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
  pagesAudited?: string[];     // from Phase 11
  framework?: FrameworkDetection | null;  // NEW: Phase 12 — null when undetectable (local target)
}
```

### Pattern 3: runAudit() Integration — Framework Detection in Parallel

**What:** `runAudit()` calls `fetchAndDetectFramework(probe)` concurrently with the five dimension checks using `Promise.all`. The `FrameworkDetection` result flows into `AuditReport.framework` and is also passed to fix-suggestion generators.

```typescript
// src/audit/index.ts — modified runAudit()

import { fetchAndDetectFramework } from './framework.js';

export async function runAudit(target: string): Promise<AuditReport> {
  // ... existing validation and probe setup ...

  const [findingsRaw, frameworkDetection] = await Promise.all([
    Promise.all([
      checkLlmsTxt(probe),
      checkRobotsTxtAiAccess(probe),
      checkSchemaMarkup(probe),
      checkFaq(probe),
      checkMarkdownMirrors(probe),
    ]),
    fetchAndDetectFramework(probe),
  ]);

  const findings = findingsRaw;

  // ... existing pagesAudited and sort logic ...

  return {
    target: trimmed,
    generatedAt: new Date().toISOString(),
    findings,
    pagesAudited,
    framework: frameworkDetection,
  };
}
```

### Pattern 4: Framework-Aware Fix Suggestions

**What:** The three actionable dimensions (`llms-txt`, `robots-txt`, `markdown`) vary their `message` (or `suggestedToolCall` description) based on the detected framework. This is a string-interpolation-only change — no type changes, no structural changes to `AuditFinding`.

**Design decision:** The `message` field on the `AuditFinding` carries the framework-aware text rather than a separate field. This keeps the wizard's rendering logic unchanged while still surfacing the context-specific instruction.

**Approach A — pass framework into dimension check functions (preferred):**

```typescript
// Dimension function signature change
export async function checkLlmsTxt(
  target: string,
  framework?: FrameworkDetection | null
): Promise<AuditFinding>

// Inside checkLlmsTxt, on 404 fail path:
const frameworkNote = buildLlmsTxtNote(framework);
return {
  dimension,
  status: 'fail',
  severity: 'critical',
  message: `llms.txt missing at site root. ${frameworkNote}`,
  suggestedToolCall: 'generate_llms_txt',
  diagnostics,
};
```

**Framework note helper:**

```typescript
// Framework-specific placement instructions (FWK-02)
function buildLlmsTxtNote(fw: FrameworkDetection | null | undefined): string {
  if (!fw || !fw.name) return 'Place llms.txt in your site root.';
  switch (fw.name) {
    case 'Next.js':
    case 'Nuxt':
      return 'Place llms.txt in the /public/ directory and redeploy.';
    case 'WordPress':
      return 'Upload llms.txt to your site root via FTP or your file manager (e.g. /wp-content/../llms.txt is wrong — it must be at the root, e.g. /var/www/html/llms.txt).';
    case 'Shopify':
      return 'For Shopify: serve llms.txt via a page template or a custom route — direct root file placement is not supported.';
    case 'Astro':
      return 'Place llms.txt in the /public/ directory and rebuild.';
    case 'Hugo':
    case 'Jekyll':
      return 'Place llms.txt in the site root (static files folder) and rebuild.';
    default:
      return 'Place llms.txt in your site root.';
  }
}
```

**Approach B — pass framework from runAudit() via a context object (alternative):**
Not recommended. It requires a new context type and changes all five dimension signatures. Only three dimensions need framework context. Approach A is surgical.

### Anti-Patterns to Avoid

- **Framework detection as a 6th AuditDimension:** Framework is descriptive context, not a pass/fail issue. Forcing it into `AuditFinding` with `status: 'pass'` pollutes the issue checklist. The architecture explicitly documented this anti-pattern (ARCHITECTURE.md Anti-Pattern 4).
- **Calling `detectFramework()` inside individual dimension checks:** This causes 3+ independent fetches of the root URL. Detect once in `runAudit()`, pass result to dimensions.
- **Asserting framework from one signal alone at "high" confidence:** FWK-03 requires two independent signals for "high". A site that has a single `_next/` path mention gets "medium" at best.
- **Creating `src/audit/schema-type-map.ts` in this phase:** That file is for Phase 13 (schema type inference). The phase context mentions it as a separate new file for `inferSchemaType()` — do not create it here.
- **Changing `AuditFinding.message` to a structured object:** The wizard renders `f.message` as a plain string in issue checklist titles (tools/index.ts line 188). Keep `message` as a string.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML string parsing | Custom tokenizer | `html.includes('/_next/')` + `/pattern/.test(html)` | Asset-path signals are string-level; no parse tree needed |
| Meta generator extraction | Custom regex | `cheerio` already in project — `$('meta[name="generator"]').attr('content')` | One line; handles edge cases (attribute quoting, case) |
| Framework confidence scoring | Weighted scoring system | Simple signal counter: `signals >= 2 → high, === 1 strong → medium, === 1 weak → low` | FWK-03 requires "two independent signals" — a threshold count satisfies the requirement cleanly |
| HTTP header parsing | String split/parse | `headers.get('x-powered-by')` | Fetch `Headers` API already handles header lookup |

**Key insight:** Framework detection in this codebase is a classification problem with ~6 output classes. The signal space (asset paths, meta tags, script globals, HTTP headers) maps to simple string predicates. No ML, no scoring model, no external API — pure string matching with a 2-signal threshold for "high" confidence is the correct level of complexity.

---

## Common Pitfalls

### Pitfall 1: Single Signal Produces "high" Confidence

**What goes wrong:** A site that links to a Next.js CDN chunk (e.g., from an embedded widget) triggers `/_next/` detection and gets `confidence: 'high'`. The site is not built with Next.js.

**Why it happens:** Only one signal was checked before returning "high".

**How to avoid:** Count matched signals per framework. Return "high" only when `signalCount >= 2`. Different signal *types* are stronger evidence than the same signal appearing twice (e.g., `/_next/` in both a `<link>` and a `<script>` is still one signal type — count it once).

**Warning signs:** Any code path that sets `confidence: 'high'` without checking a second signal category is incorrect.

### Pitfall 2: Regex Against Minified HTML Attributes

**What goes wrong:** Checking for `__NEXT_DATA__` with an exact string match fails because some renderers add extra attributes or whitespace around the `id` value.

**Why it happens:** HTML minifiers or server renderers may produce `<script id= "__NEXT_DATA__"` with varied spacing.

**How to avoid:** Use `html.includes('__NEXT_DATA__')` (substring match) rather than an exact attribute regex. For `<meta name="generator">`, use Cheerio's attribute selector which handles quoting variations.

**Warning signs:** Unit tests that pass on formatted HTML but fail on minified HTML from real sites.

### Pitfall 3: detectFramework() Returns Wrong Framework for CDN-Heavy Pages

**What goes wrong:** A Shopify page also embeds a Wix widget, producing signals for both. The function returns the first match rather than the strongest match.

**Why it happens:** Framework checks are evaluated independently. The first one that fires wins.

**How to avoid:** Score all frameworks, take the one with the most signals. If two frameworks tie with equal signal counts, return "low" for both — or the most-specific one (Shopify signals are more distinctive than generic JS framework signals). In practice, ties are rare. Document the tie-breaking rule in code.

**Warning signs:** The function returns without checking all framework candidates.

### Pitfall 4: Framework Fetch Failure Silently Breaks runAudit()

**What goes wrong:** `fetchAndDetectFramework()` throws (network error, timeout), causing the entire `runAudit()` `Promise.all` to reject.

**Why it happens:** Error not caught inside the framework fetch wrapper.

**How to avoid:** `fetchAndDetectFramework()` must catch all errors and return `null` on any failure. The `AuditReport.framework` field is optional — `null` (undetectable) is the correct result when the root page is unreachable. This matches the requirement: "returns `null` or `{ name: 'unknown', confidence: 'none' }` rather than a guessed value" (Success Criterion 2).

**Warning signs:** Any `fetchAndDetectFramework` implementation with an unguarded `await` or a catch block that re-throws.

### Pitfall 5: Framework-Aware Messages Break When framework is null

**What goes wrong:** `buildLlmsTxtNote(framework)` throws because `framework` is `null` (local target audit or network failure).

**Why it happens:** Missing null guard before accessing `framework.name`.

**How to avoid:** The helper must accept `FrameworkDetection | null | undefined` and treat null/undefined as "unknown framework" — fall back to the generic message.

**Warning signs:** `framework.name` accessed without a null check; TypeScript strict mode should catch this at compile time.

### Pitfall 6: Dimension Signature Change Breaks runAudit() Call Sites

**What goes wrong:** Changing `checkLlmsTxt(probe)` to `checkLlmsTxt(probe, framework)` without updating the `Promise.all` in `runAudit()` causes TypeScript to compile but pass `undefined` as framework where a non-optional argument was expected.

**How to avoid:** The framework parameter must be `optional` (`framework?: FrameworkDetection | null`). Then the existing call sites (`checkLlmsTxt(probe)`) continue to compile. The `runAudit()` update changes these to `checkLlmsTxt(probe, frameworkDetection)`.

**Warning signs:** `tsc --noEmit` reveals this immediately; treat any TypeScript error as a hard stop.

---

## Code Examples

Verified from codebase inspection and signal data from authoritative sources (webreveal.io, official framework docs):

### Framework Signal Map

```typescript
// src/audit/framework.ts — signal definitions

interface FrameworkSignals {
  /** 'strong' signals are distinctive enough that one alone gives 'medium' confidence. */
  strong: Array<(html: string, headers: Headers) => boolean>;
  /** 'weak' signals require pairing with at least one other to reach 'medium'. */
  weak: Array<(html: string, headers: Headers) => boolean>;
}

const FRAMEWORK_SIGNALS: Record<string, FrameworkSignals> = {
  'Next.js': {
    strong: [
      (html) => html.includes('__NEXT_DATA__'),           // Script tag: <script id="__NEXT_DATA__">
      (html) => html.includes('/_next/static/'),          // Asset path in <link> or <script src>
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('next'),
      (html) => html.includes('__next_f'),                // React Server Components build artifact
    ],
  },
  'Nuxt': {
    strong: [
      (html) => html.includes('/_nuxt/'),                 // Asset path in <link> or <script src>
      (html) => html.includes('window.__nuxt'),           // Nuxt hydration payload
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('nuxt'),
      (html) => html.includes('$nuxt'),
    ],
  },
  'Astro': {
    strong: [
      (html) => html.includes('/_astro/'),                // Asset path (Astro's dedicated CDN prefix)
      (html) => html.includes('astro-island'),            // Astro island component custom element
    ],
    weak: [
      (_, h) => (h.get('x-powered-by') ?? '').toLowerCase().includes('astro'),
    ],
  },
  'WordPress': {
    strong: [
      (html) => html.includes('/wp-content/'),            // Plugin/theme asset paths
      (html) => html.includes('/wp-json/'),               // REST API links in HTML
    ],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('wordpress');
      },
      (html) => html.includes('/wp-includes/'),           // Core WordPress script paths
    ],
  },
  'Shopify': {
    strong: [
      (html) => html.includes('cdn.shopify.com'),         // Shopify CDN
      (html) => html.includes('Shopify.theme'),           // Shopify.theme JS object
    ],
    weak: [
      (html) => html.includes('shopify-digital-wallet'), // Shopify meta tag
      (_, h) => (h.get('x-sorting-hat-shopid') ?? '') !== '', // Shopify infra header
    ],
  },
  'Hugo': {
    strong: [],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('hugo');
      },
    ],
  },
  'Jekyll': {
    strong: [],
    weak: [
      (html) => {
        const $ = cheerio.load(html);
        const gen = $('meta[name="generator"]').attr('content') ?? '';
        return gen.toLowerCase().startsWith('jekyll');
      },
    ],
  },
};
```

### detectFramework() Core Logic

```typescript
// src/audit/framework.ts

import * as cheerio from 'cheerio';

export function detectFramework(html: string, headers: Headers): FrameworkDetection {
  // Score each framework: { strongCount, weakCount }
  const scores: Record<string, { strong: number; weak: number }> = {};

  for (const [name, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
    const strongMatches = signals.strong.filter(fn => fn(html, headers)).length;
    const weakMatches = signals.weak.filter(fn => fn(html, headers)).length;
    if (strongMatches > 0 || weakMatches > 0) {
      scores[name] = { strong: strongMatches, weak: weakMatches };
    }
  }

  if (Object.keys(scores).length === 0) {
    return { name: null, confidence: 'none' };
  }

  // Pick the framework with the most signals (strong weighted 2x weak for tie-breaking)
  const ranked = Object.entries(scores).sort(([, a], [, b]) => {
    const aScore = a.strong * 2 + a.weak;
    const bScore = b.strong * 2 + b.weak;
    return bScore - aScore;
  });

  const [topName, topScore] = ranked[0];
  const totalSignals = topScore.strong + topScore.weak;

  // FWK-03: 'high' requires 2+ independent signals
  let confidence: FrameworkConfidence;
  if (totalSignals >= 2) {
    confidence = 'high';
  } else if (topScore.strong >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { name: topName, confidence };
}
```

### AuditReport Output Shape (Success Criterion 1)

```json
{
  "target": "https://example.com",
  "generatedAt": "2026-04-21T12:00:00.000Z",
  "framework": {
    "name": "Next.js",
    "confidence": "high"
  },
  "findings": [...]
}
```

### Unknown Framework Output (Success Criterion 2)

```json
{
  "target": "https://example.com",
  "generatedAt": "2026-04-21T12:00:00.000Z",
  "framework": null,
  "findings": [...]
}
```

OR (for a local target):

```json
{
  "target": "/Users/me/my-site",
  "generatedAt": "2026-04-21T12:00:00.000Z",
  "findings": [...]
}
```

(When `framework` field is absent: the target was local; when `framework: null`: the target was a URL but detection returned no signals.)

### Framework-Aware Fix Note for robots.txt (Success Criterion 3)

```typescript
// src/audit/dimensions/robots-txt.ts

function buildRobotsTxtNote(fw: FrameworkDetection | null | undefined): string {
  if (!fw || !fw.name) return '';
  switch (fw.name) {
    case 'WordPress':
      return ' For WordPress: place at /wp-content/../robots.txt — actually at your web root, not inside wp-content.';
    case 'Next.js':
    case 'Nuxt':
    case 'Astro':
      return ' For this framework: place robots.txt in /public/ and redeploy.';
    case 'Shopify':
      return ' For Shopify: robots.txt is managed via the Shopify admin (Online Store > Preferences > robots.txt).';
    default:
      return '';
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AuditReport` has no framework field | `AuditReport.framework?: FrameworkDetection` | Phase 12 | Callers know the CMS/framework; fix suggestions become context-specific |
| Fix messages are generic ("Place llms.txt in site root") | Fix messages include framework-specific placement path | Phase 12 | Reduces implementation friction for users — they see exactly where to put the file |
| Detection requires external APIs or browser automation | HTML string analysis + HTTP headers only | Phase 12 | Zero new dependencies; works in MCP server context without browser |

**Not deprecated:** No existing behavior changes. All Phase 11 fields (`diagnostics`, `pagesAudited`) are unchanged.

---

## Open Questions

1. **Should `framework` be `null` or `{ name: null, confidence: 'none' }` when no framework is detected?**
   - What we know: Success Criterion 2 says "returns `null` or `{ name: 'unknown', confidence: 'none' }` rather than a guessed value." Both forms are acceptable per the requirement.
   - What's unclear: Which form is better for the wizard and callers?
   - Recommendation: Use `{ name: null, confidence: 'none' }` for a URL target that produced no signals (structured, consistent shape for callers). Use `null` for a local file-system target (no detection attempted). TypeScript: `framework?: FrameworkDetection | null` on `AuditReport` covers both.

2. **Should dimension functions accept `framework` as a parameter, or should `runAudit()` post-process findings to inject framework-specific messages?**
   - What we know: Approach A (parameter) requires changing all three dimension function signatures. Approach B (post-processing in `runAudit()`) centralizes the framework-message logic but `runAudit()` would need to know per-dimension message templates.
   - Recommendation: Approach A (parameter). It keeps each dimension's fix-suggestion logic self-contained and makes the framework dependency explicit in the type signature. The parameter is optional (`framework?: FrameworkDetection | null`) so existing call sites in tests continue to compile without change.

3. **Hugo and Jekyll have only weak signals. Should they be in scope?**
   - What we know: The phase requirements list `/_astro/` as a named path signal. Hugo and Jekyll are static site generators — their HTML has no distinctive asset-path prefix (they serve flat static files). The only signal is `<meta name="generator">` which is frequently stripped for security reasons.
   - Recommendation: Include Hugo and Jekyll in the signal map but document that confidence will only reach 'low' or 'medium' (generator meta is one weak signal at best). This is honest about the limitation and satisfies FWK-03.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/audit/types.ts` (current `AuditReport` shape; `framework` field absent post-Phase-11)
- Direct codebase inspection — `src/audit/index.ts` (current `runAudit()` structure; where framework detection integrates)
- Direct codebase inspection — `src/audit/dimensions/llms-txt.ts`, `robots-txt.ts`, `markdown.ts` (fix-suggestion message patterns to extend)
- Direct codebase inspection — `src/tools/index.ts` (wizard reads `f.message` at line 188; `AuditFinding` shape constraints)
- `.planning/research/ARCHITECTURE.md` — Question 2 (Framework Detection Placement), Anti-Pattern 3 & 4, Component Boundary Map, Build Order Steps 3 & 4 — authoritative project architecture decisions
- Phase 11 verification confirms `AuditReport.framework` NOT yet added; Phase 12 owns this field

### Secondary (MEDIUM confidence)

- [WebReveal: How to Detect JavaScript Frameworks (2026)](https://webreveal.io/blog/how-to-detect-javascript-framework.html) — verified signal list for Next.js (`__NEXT_DATA__`, `/_next/static/`), Nuxt (`/_nuxt/`, `window.__nuxt`), Astro (`/_astro/`, `astro-island`), SvelteKit (`/_app/`, `data-svelte-h`), Vue (`data-v-*`), Angular (`ng-version`)
- [Next.js official docs — assetPrefix](https://nextjs.org/docs/app/api-reference/config/next-config-js/assetPrefix) — confirms `/_next/` as the standard built asset path prefix
- Shopify theme detector tools consensus — `cdn.shopify.com`, `Shopify.theme` JS object, `x-sorting-hat-shopid` header as identifying signals; verified across multiple independent tools
- WordPress fingerprinting ecosystem — `wp-content/`, `wp-json/`, `wp-includes/` well-established signals; documented in WPScan, Plecost, and multiple passive detection tools

### Tertiary (LOW confidence)

- Hugo `<meta name="generator">` signal — documented pattern but frequently stripped; confidence ceiling is 'medium' at best

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new dependencies; `cheerio` already installed; all APIs in use
- Architecture: HIGH — directly from ARCHITECTURE.md Question 2 which explicitly designed Phase 12's approach
- Framework signal accuracy: MEDIUM — signals verified from authoritative tools and official docs; real-world sites may override asset prefixes or strip meta tags
- Pitfalls: HIGH — derived from FWK-03 requirement wording and codebase-specific failure modes (dimension signature changes, null guards)

**Research date:** 2026-04-21
**Valid until:** 60 days — framework fingerprint signals are stable (asset prefix conventions change only on major framework versions); TypeScript patterns are stable
