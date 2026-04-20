# Phase 5: FAQ Content - Research

**Researched:** 2026-04-20
**Domain:** Pure content generation, FAQ Q&A pair construction from structured business data
**Confidence:** HIGH

## Summary

Phase 5 implements a single pure generator function — `buildFaqContent(ctx, count)` — that derives 8–10 AI-quotable Q&A pairs from `BusinessContext`. This is fundamentally a **deterministic text-assembly problem**, not an AI/LLM call problem. The function reads the same fields already present in `BusinessContext` (businessName, businessType, location, services, phoneNumber, website, description) and constructs factual Q&A pairs using those fields as the sole data source. No invented content, no external calls, no new dependencies.

The output type is `Array<{ question: string; answer: string }>` — which is identical to the `FaqPair[]` type already exported from `src/generators/files/schema-markup.ts`. The generator file lives in `src/generators/content/faq.ts` to distinguish it from file-output generators, but follows the identical pure-function pattern. The MCP handler in `src/tools/index.ts` replaces the existing stub, calls `buildFaqContent`, and returns the result as a JSON text response (no file I/O — this is a text-return tool like `generate_schema_markup`).

The critical constraint is that every answer must name the business, cite a specific number or fact, and avoid hedging language like "we aim to" or "may include." This is achievable deterministically because `BusinessContext` contains concrete facts: business name, location, service list with count, phone, website. Questions are templated around those facts; answers are assembled from the fields directly.

**Primary recommendation:** Build `buildFaqContent(ctx: BusinessContext, count?: number): FaqPair[]` as a pure deterministic function in `src/generators/content/faq.ts`, import `FaqPair` from the existing schema-markup module, and wire the handler to return `JSON.stringify(pairs, null, 2)` as text content.

## Standard Stack

### Core (already installed — no new installs needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript built-ins | — | String template assembly | Q&A pairs are template strings over ctx fields |
| `FaqPair` from schema-markup | local | Re-use existing pair type | Already defined: `{ question: string; answer: string }` — no new type needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No external libraries needed for string template generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deterministic template assembly | LLM API call (OpenAI, etc.) | LLM calls introduce network dependency, non-determinism, and cost; CONT-03 specifies "from BusinessContext" not "AI-generated" |
| Inline `{ question, answer }` type | Re-use `FaqPair` from schema-markup.ts | Re-using `FaqPair` keeps the schema-markup pipeline contract exact — no transformation on the consumer side |
| Single flat answer template | Multiple question categories | Category-based approach (identity, services, location, contact, etc.) yields diverse, non-repetitive Q&A set |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── generators/
│   ├── files/
│   │   ├── llms-txt.ts          # Phase 2 (done)
│   │   ├── robots-txt.ts        # Phase 2 (done)
│   │   ├── sitemap-xml.ts       # Phase 4 (done)
│   │   ├── markdown-mirrors.ts  # Phase 4 (done)
│   │   └── schema-markup.ts     # Phase 4 (done) — exports FaqPair
│   └── content/
│       └── faq.ts               # Phase 5 — buildFaqContent(ctx, count?): FaqPair[]
└── tools/
    └── index.ts                 # Phase 5 — replace generate_faq_content stub
```

### Pattern 1: Pure Build Function (established in Phases 2-4)
**What:** Generator file exports a pure function over `BusinessContext`. No imports from `node:fs`, no side effects, no I/O. Handler calls the pure function and returns text content directly.
**When to use:** This phase — `buildFaqContent` returns data, not a file path.
**Example:**
```typescript
// src/generators/content/faq.ts
import type { BusinessContext } from '../../types/index.js';
import type { FaqPair } from '../files/schema-markup.js';

export function buildFaqContent(ctx: BusinessContext, count?: number): FaqPair[] {
  // pure: takes ctx, returns FaqPair[]
  // no imports from node:fs, no network calls, no side effects
}
```

### Pattern 2: Category-Based Q&A Template Set
**What:** Define a pool of question/answer templates organized by category (identity, services, location, contact). Each template function receives `ctx` and returns a `FaqPair | null` (null when the required ctx field is absent). Collect all non-null pairs, slice to `count`.
**When to use:** The correct approach for this phase — ensures diversity, handles optional fields gracefully, is testable per category.
**Example:**
```typescript
// Category-based template approach
type QaTemplate = (ctx: BusinessContext) => FaqPair | null;

const TEMPLATES: QaTemplate[] = [
  // Identity questions — always available (businessName + businessType required)
  (ctx) => ({
    question: `What type of business is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}.`,
  }),
  // Service count — requires services array
  (ctx) => ctx.services && ctx.services.length > 0
    ? {
        question: `How many services does ${ctx.businessName} offer?`,
        answer: `${ctx.businessName} offers ${ctx.services.length} services: ${ctx.services.join(', ')}.`,
      }
    : null,
  // Location — requires location field
  (ctx) => ctx.location
    ? {
        question: `Where is ${ctx.businessName} located?`,
        answer: `${ctx.businessName} serves ${ctx.location}.`,
      }
    : null,
  // ... etc.
];
```

### Pattern 3: Handler Stub Replacement (established in Phase 4)
**What:** In `src/tools/index.ts`, replace `async () => stubResponse("generate_faq_content", "5")` with a real async handler that calls `buildFaqContent` and returns a text content response.
**When to use:** Exact same replacement pattern as generate_schema_markup, generate_sitemap, generate_markdown_mirrors.
**Example:**
```typescript
// In src/tools/index.ts — replace stub with:
server.registerTool(
  "generate_faq_content",
  { /* existing schema unchanged */ },
  async ({ businessContext, count }) => {
    try {
      if (!businessContext?.businessName?.trim()) {
        return { content: [{ type: 'text' as const, text: 'Error: businessContext.businessName is required' }], isError: true };
      }
      const pairs = buildFaqContent(businessContext, count);
      return { content: [{ type: 'text' as const, text: JSON.stringify(pairs, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);
```

### Anti-Patterns to Avoid
- **Returning a flat string instead of JSON array:** `generate_schema_markup` returns JSON strings and the stub registration shows `generate_faq_content` output should be directly consumable by `generate_schema_markup`'s `faqs` field. Return `JSON.stringify(pairs, null, 2)`.
- **Inventing details not in BusinessContext:** Every answer must derive exclusively from `ctx` fields. Do not hardcode numbers (e.g. "over 10 years") or facts (e.g. "24/7 service") that have no basis in the input. If a field is absent, skip that question category — do not fabricate.
- **Marketing hedging language:** Answers must not contain phrases like "we strive to", "our team aims to", "may include", "world-class", "best-in-class". These are explicitly excluded by CONT-03.
- **Creating a new `FaqPair`-equivalent type:** `FaqPair` is already exported from `src/generators/files/schema-markup.ts`. Import it rather than duplicating the type.
- **File I/O in the generator:** `buildFaqContent` must be a pure function. All callers (including `generate_schema_markup`) may call it in-process. No `writeFile`, no `fs` imports.
- **Placing the file in `src/generators/files/`:** FAQ content generation produces data, not a file artifact. Place it in `src/generators/content/` (new subdirectory) to distinguish the category.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FaqPair type definition | A new `interface FAQPair` | `FaqPair` from `../files/schema-markup.js` | Already defined, already matches `generate_schema_markup`'s `faqs` input shape exactly |
| Minimum pair count validation | Custom count-check logic | Simple `Math.max(8, Math.min(count ?? 10, available))` clamp | The pool of templates defines the hard ceiling; clamp at build time |

**Key insight:** This phase has no external library problem to solve. The complexity is in the content design (which questions to ask, how to phrase answers without hedging language) not in infrastructure.

## Common Pitfalls

### Pitfall 1: Fewer Than 8 Pairs When Context Is Sparse
**What goes wrong:** If only `businessName` and `businessType` are provided (all optional fields absent), the template pool collapses to ~2-3 pairs, failing the "8–10 pairs" success criterion.
**Why it happens:** Category templates that depend on `services`, `location`, `phoneNumber`, `website`, `description` all return null when those fields are absent.
**How to avoid:** Design the template pool with enough identity/type/service-derived questions that fire on required fields alone. With `businessName` (required) and `businessType` (required), you can generate: "What is X?", "What type of business is X?", "Is X a Y?", "What industry does X operate in?" etc. Have at minimum 8 templates that require only the two required fields.
**Warning signs:** Unit tests with minimal BusinessContext (only businessName + businessType) returning fewer than 8 pairs.

### Pitfall 2: Duplicate or Near-Duplicate Questions
**What goes wrong:** Multiple templates generate structurally identical questions (e.g., "What does X do?" and "What type of business is X?" both reduce to the same user intent).
**Why it happens:** Template pool grows without deduplication consideration.
**How to avoid:** Assign each template a unique `category` tag and enforce one template per category in the collection step.
**Warning signs:** Reviewing output and seeing two questions that could be answered identically.

### Pitfall 3: Answers That Reference Absent Fields
**What goes wrong:** An answer template uses `ctx.location` in string interpolation but `ctx.location` is undefined, producing "serves undefined" or "based in undefined".
**Why it happens:** Optional fields used without guard in template strings.
**How to avoid:** Every template that uses an optional field must be guarded: return `null` if the field is absent. The collector filters nulls.
**Warning signs:** TypeScript will not catch this if field is typed as `string | undefined` and you use `${ctx.location}` without nullish handling.

### Pitfall 4: Import Cycle Risk
**What goes wrong:** `src/generators/content/faq.ts` imports `FaqPair` from `src/generators/files/schema-markup.ts`, which might trigger unintended dependency loading.
**Why it happens:** TypeScript import of a type from a file that also has runtime logic.
**How to avoid:** Use `import type { FaqPair }` — type-only import, erased at compile time, no runtime dependency. Since `FaqPair` is a plain interface, `import type` is always safe here.
**Warning signs:** ESM circular dependency warnings at startup (unlikely here given the file hierarchy, but import type eliminates the risk entirely).

### Pitfall 5: Handler Input Validation Gap
**What goes wrong:** Handler passes `businessContext` directly to `buildFaqContent` without validating `businessName` is non-empty, producing error output from the generator rather than a clean `isError: true` response.
**Why it happens:** Forgetting that Zod validation in the input schema marks fields as required but doesn't guarantee non-empty strings (Zod `.string()` without `.min(1)` allows `""`).
**How to avoid:** Follow the same guard pattern as all existing handlers: check `businessContext?.businessName?.trim()` before calling the generator.
**Warning signs:** MCP client receives an exception stack trace in content text rather than a structured error response.

## Code Examples

Verified patterns from codebase analysis:

### Category-Based Template Pool (recommended structure)
```typescript
// src/generators/content/faq.ts
// Source: codebase pattern from src/generators/files/schema-markup.ts + llms-txt.ts

import type { BusinessContext } from '../../types/index.js';
import type { FaqPair } from '../files/schema-markup.js';

type QaTemplate = (ctx: BusinessContext) => FaqPair | null;

const TEMPLATES: QaTemplate[] = [
  // --- Identity (required fields only — always fire) ---
  (ctx) => ({
    question: `What is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}${ctx.location ? ' serving ' + ctx.location : ''}.`,
  }),
  (ctx) => ({
    question: `What type of business is ${ctx.businessName}?`,
    answer: `${ctx.businessName} is a ${ctx.businessType}.`,
  }),
  // --- Services (require ctx.services) ---
  (ctx) =>
    ctx.services && ctx.services.length > 0
      ? {
          question: `How many services does ${ctx.businessName} offer?`,
          answer: `${ctx.businessName} offers ${ctx.services.length} service${ctx.services.length === 1 ? '' : 's'}: ${ctx.services.join(', ')}.`,
        }
      : null,
  // --- Location (requires ctx.location) ---
  (ctx) =>
    ctx.location
      ? {
          question: `What area does ${ctx.businessName} serve?`,
          answer: `${ctx.businessName} serves ${ctx.location}.`,
        }
      : null,
  // ... more templates ...
];

export function buildFaqContent(ctx: BusinessContext, count?: number): FaqPair[] {
  const available = TEMPLATES.map((t) => t(ctx)).filter((p): p is FaqPair => p !== null);
  const target = Math.min(count ?? 10, available.length);
  return available.slice(0, target);
}
```

### Handler Replacement (in src/tools/index.ts)
```typescript
// Source: established pattern from generate_schema_markup handler (Phase 4)
// Add import at top of tools/index.ts:
import { buildFaqContent } from '../generators/content/faq.js';

// Replace stub:
server.registerTool(
  "generate_faq_content",
  { /* inputSchema unchanged from stub */ },
  async ({ businessContext, count }) => {
    try {
      if (!businessContext || typeof businessContext.businessName !== 'string' || businessContext.businessName.trim().length === 0) {
        return { content: [{ type: 'text' as const, text: 'Error: businessContext.businessName is required' }], isError: true };
      }
      const pairs = buildFaqContent(businessContext, count);
      if (pairs.length < 8) {
        // Soft warning — still return what we have, but surface the count
        return { content: [{ type: 'text' as const, text: JSON.stringify(pairs, null, 2) }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(pairs, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);
```

### Output Shape (what generate_schema_markup expects for faqs field)
```typescript
// The faqs field in generate_schema_markup's Zod schema:
// z.array(z.object({ question: z.string(), answer: z.string() }))
// FaqPair = { question: string; answer: string }
// buildFaqContent output is directly assignable — no transformation needed.

// Correct pipeline:
const faqs = buildFaqContent(ctx);           // FaqPair[]
const blocks = buildSchemaMarkup(ctx, ['FAQPage'], faqs);  // string[]
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| LLM-generated FAQs | Deterministic template assembly from structured data | CONT-03 spec requires "derived from BusinessContext input — no invented details"; deterministic is correct here |
| Separate FaqPair type per module | Re-use `FaqPair` from schema-markup.ts | Established in Phase 4; import type eliminates runtime coupling |

**Deprecated/outdated:**
- Stub implementation (`stubResponse("generate_faq_content", "5")`): This is the target replacement. The full stub signature in `tools/index.ts` (with inputSchema for `businessContext` and `count`) remains unchanged — only the async handler body is replaced.

## Open Questions

1. **Minimum pair count when context is very sparse**
   - What we know: `businessName` and `businessType` are the only required fields; all others are optional
   - What's unclear: How many distinct questions can be generated from only those two required fields without becoming repetitive?
   - Recommendation: Design the TEMPLATES pool with at least 10 identity/type questions derived exclusively from required fields (phrased differently). This guarantees 8–10 pairs even for minimal input. Review during implementation for semantic overlap.

2. **Whether to surface count-below-8 as an error or a warning**
   - What we know: Success criterion says "returns 8–10 Q&A pairs"; tool input schema has `count` with `min(3)`
   - What's unclear: Should fewer-than-8 pairs (due to sparse context) return `isError: true` or silently return what's available?
   - Recommendation: Return whatever pairs are available, do not treat sparse output as an error. The `count` param minimum is 3 — the tool must work for minimal invocations. Document the behavior.

3. **Whether `content/` subdirectory needs an index.ts barrel**
   - What we know: `src/generators/files/` has no barrel export; tools/index.ts imports each file directly
   - What's unclear: Whether the planner will want a barrel file for `content/`
   - Recommendation: No barrel. Import `buildFaqContent` directly in `tools/index.ts` the same way all other generators are imported.

## Sources

### Primary (HIGH confidence)
- Codebase: `src/types/index.ts` — `BusinessContext` interface, all fields and optionality
- Codebase: `src/generators/files/schema-markup.ts` — `FaqPair` type definition, `placeholderFaqs()` baseline pattern
- Codebase: `src/tools/index.ts` — stub registration, exact inputSchema, handler pattern from all Phase 2-4 tools
- Codebase: `src/generators/files/llms-txt.ts` — pure function pattern, optional field guarding

### Secondary (MEDIUM confidence)
- Phase 4 RESEARCH.md pattern: architecture patterns for pure generators, handler stub replacement

### Tertiary (LOW confidence)
- None — all findings are grounded in direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; verified by package.json and all existing generator files
- Architecture: HIGH — generator pattern is established across 5 existing files; `content/` subdirectory is the only new decision and is low-risk
- Pitfalls: HIGH — grounded in direct TypeScript/ESM codebase inspection; optional field guard pitfall verified against existing handler pattern
- Output contract: HIGH — `FaqPair` type verified in schema-markup.ts; `faqs` field Zod schema verified in tools/index.ts

**Research date:** 2026-04-20
**Valid until:** Stable — no external dependencies; valid until BusinessContext type changes
