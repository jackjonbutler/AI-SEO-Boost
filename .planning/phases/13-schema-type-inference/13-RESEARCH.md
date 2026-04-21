# Phase 13: Schema Type Inference - Research

**Researched:** 2026-04-21
**Domain:** TypeScript — schema.org type mapping, audit dimension logic, `businessContext` threading, `suggestedToolCallArgs` seeding
**Confidence:** HIGH (based on direct codebase inspection + schema.org official docs)

---

## Summary

Phase 13 fixes a false-positive rate problem in the schema audit dimension. Today `checkSchemaMarkup()` hardcodes `LocalBusiness` as the only acceptable `@type`. Every SaaS, travel, or e-commerce site that has valid JSON-LD (e.g. `SoftwareApplication`) gets flagged as a warning/fail — which is wrong. The fix is a mapping function `inferSchemaType()` in a new file `src/audit/schema-type-map.ts` that converts `businessContext.businessType` free-text into the most appropriate schema.org `@type` string. The schema dimension check uses the inferred type to decide pass/fail.

The second change is seeding `suggestedToolCallArgs` on the schema `AuditFinding` so the wizard can pre-fill `generate_schema_markup` with a `recommendedType` field. This field is already typed on `AuditFinding` (added in Phase 11, declared as `suggestedToolCallArgs?: Record<string, unknown>`). The schema dimension just needs to populate it.

The critical architectural question for this phase is how `businessContext` reaches `checkSchemaMarkup()`. Currently `runAudit()` does not accept `businessContext` — it's only available in the wizard accumulator in `tools/index.ts`. Phase 13 must thread it through without breaking existing callers (the `businessContext` parameter on `runAudit()` must be optional, defaulting to undefined).

**Primary recommendation:** Add `inferSchemaType(businessType: string | undefined): string` as a module-scope pure function in `src/audit/schema-type-map.ts`; make `businessContext` an optional second argument to both `runAudit()` and `checkSchemaMarkup()`; seed `suggestedToolCallArgs.recommendedType` on schema findings.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.9.3 (project) | New file, type additions, optional param threading | Already in use; `strict: true` catches null safety issues |
| No new libraries | — | — | Phase is pure logic addition; no new dependencies needed |

### Supporting

No new supporting libraries. The only tooling involved is:

- `cheerio` (already installed) — already used in `schema.ts` for JSON-LD extraction; unchanged
- Node.js built-in `fetch` — already used in `schema.ts`; unchanged

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Touch List

```
src/audit/schema-type-map.ts          NEW: inferSchemaType() pure function + BUSINESS_TYPE_MAP constant
src/audit/dimensions/schema.ts        MODIFY: accept optional BusinessContext param; use inferSchemaType; seed suggestedToolCallArgs
src/audit/index.ts                    MODIFY: accept optional BusinessContext param; thread to checkSchemaMarkup
src/audit/types.ts                    NO CHANGE (suggestedToolCallArgs already declared in AuditFinding)
src/tools/index.ts                    MODIFY: pass businessContext to runAudit()
```

**Not touched:**
- `src/types/index.ts` — `BusinessContext` interface is already defined; no changes needed
- `src/generators/files/schema-markup.ts` — generator is unchanged
- `src/audit/dimensions/llms-txt.ts`, `robots-txt.ts`, `faq.ts`, `markdown.ts` — no changes

### Pattern 1: inferSchemaType() — Pure Function in schema-type-map.ts

**What:** Module-scope pure function that takes a free-text `businessType` string (e.g. `"saas"`, `"vehicle wrap shop"`, `"travel agency"`) and returns the best-fit schema.org `@type` string. Module-scope constant `BUSINESS_TYPE_MAP` holds the keyword→type entries.

**When to use:** Called inside `checkSchemaMarkup()` to determine which `@type` value is acceptable for a pass result.

**Design:** Use keyword-in-string matching (case-insensitive `includes()`) rather than an enum. The `businessType` field is a free-text user input; exact matches would be brittle.

```typescript
// src/audit/schema-type-map.ts

/**
 * Maps businessType free-text keywords to schema.org @type values.
 * Keys are lowercase keyword fragments; values are schema.org type strings.
 * Ordered from most-specific to least-specific — first match wins.
 */
const BUSINESS_TYPE_MAP: Array<{ keyword: string; schemaType: string }> = [
  // Software / SaaS
  { keyword: 'saas',              schemaType: 'SoftwareApplication' },
  { keyword: 'software',          schemaType: 'SoftwareApplication' },
  { keyword: 'app',               schemaType: 'SoftwareApplication' },

  // E-commerce / retail online
  { keyword: 'ecommerce',         schemaType: 'OnlineStore' },
  { keyword: 'e-commerce',        schemaType: 'OnlineStore' },
  { keyword: 'online store',      schemaType: 'OnlineStore' },
  { keyword: 'online shop',       schemaType: 'OnlineStore' },

  // Travel — physical travel agency
  { keyword: 'travel agenc',      schemaType: 'TravelAgency' },  // covers "agency"/"agencies"
  { keyword: 'tour operator',     schemaType: 'TravelAgency' },

  // Food / restaurant
  { keyword: 'restaurant',        schemaType: 'Restaurant' },
  { keyword: 'cafe',              schemaType: 'CafeOrCoffeeShop' },
  { keyword: 'coffee shop',       schemaType: 'CafeOrCoffeeShop' },
  { keyword: 'bakery',            schemaType: 'Bakery' },
  { keyword: 'food',              schemaType: 'FoodEstablishment' },

  // Professional / legal / accounting
  { keyword: 'law firm',          schemaType: 'LegalService' },
  { keyword: 'attorney',          schemaType: 'LegalService' },
  { keyword: 'lawyer',            schemaType: 'LegalService' },
  { keyword: 'accounting',        schemaType: 'AccountingService' },

  // Home services
  { keyword: 'electrician',       schemaType: 'Electrician' },
  { keyword: 'plumber',           schemaType: 'Plumber' },
  { keyword: 'contractor',        schemaType: 'GeneralContractor' },
  { keyword: 'roofing',           schemaType: 'RoofingContractor' },
  { keyword: 'house painter',     schemaType: 'HousePainter' },
  { keyword: 'locksmith',         schemaType: 'Locksmith' },

  // Automotive
  { keyword: 'auto',              schemaType: 'AutomotiveBusiness' },
  { keyword: 'car ',              schemaType: 'AutomotiveBusiness' },
  { keyword: 'vehicle',           schemaType: 'AutomotiveBusiness' },

  // Medical / health
  { keyword: 'dentist',           schemaType: 'Dentist' },
  { keyword: 'dental',            schemaType: 'Dentist' },
  { keyword: 'doctor',            schemaType: 'MedicalBusiness' },
  { keyword: 'medical',           schemaType: 'MedicalBusiness' },
  { keyword: 'health',            schemaType: 'MedicalBusiness' },

  // Real estate
  { keyword: 'real estate',       schemaType: 'RealEstateAgent' },
];

/**
 * Infer the most appropriate schema.org @type for a given businessType string.
 *
 * Returns 'LocalBusiness' when:
 *  - businessType is undefined/empty (SCH-02: no context provided)
 *  - no keyword matches (safe fallback for ambiguous local businesses)
 */
export function inferSchemaType(businessType: string | undefined): string {
  if (!businessType || businessType.trim().length === 0) {
    return 'LocalBusiness';
  }
  const lower = businessType.toLowerCase();
  for (const { keyword, schemaType } of BUSINESS_TYPE_MAP) {
    if (lower.includes(keyword)) {
      return schemaType;
    }
  }
  return 'LocalBusiness';  // safe fallback (SCH-01: ambiguous → LocalBusiness)
}
```

### Pattern 2: checkSchemaMarkup() — Optional BusinessContext Parameter

**What:** Add an optional second parameter `businessContext?: BusinessContext | null` to `checkSchemaMarkup()`. The function derives the expected type via `inferSchemaType(businessContext?.businessType)` and uses it for pass/fail logic.

**Key behaviour change:**

| Condition | Old behaviour | New behaviour |
|-----------|--------------|---------------|
| No businessContext, no JSON-LD | fail | fail (unchanged) |
| No businessContext, JSON-LD present (any `@type`) | warning (not LocalBusiness) | **pass** (SCH-02: any valid type is fine) |
| businessContext.businessType = "saas", JSON-LD has `SoftwareApplication` | warning | **pass** (SCH-01: inferred type matched) |
| businessContext.businessType = "restaurant", JSON-LD has `LocalBusiness` | pass | pass (LocalBusiness is a parent; acceptable) |
| businessContext.businessType = "saas", no JSON-LD | fail | fail (unchanged, with `suggestedToolCallArgs.recommendedType = "SoftwareApplication"`) |

**Pass logic:** A finding passes when the page's JSON-LD contains either the inferred type OR a recognized parent type. Since schema.org types form a hierarchy (e.g. `Restaurant` extends `FoodEstablishment` extends `LocalBusiness`), checking for exact type is correct — but a page with `LocalBusiness` when `TravelAgency` is expected should still pass (LocalBusiness is a valid ancestor).

Recommended approach: check if any extracted type `===` the inferred type, OR if the inferred type is a subtype of `LocalBusiness` and the page has `LocalBusiness`. This prevents false failures when a site uses a parent type correctly.

```typescript
// src/audit/dimensions/schema.ts — modified checkSchemaMarkup

import { inferSchemaType } from '../schema-type-map.js';
import type { BusinessContext } from '../../types/index.js';

export async function checkSchemaMarkup(
  target: string,
  businessContext?: BusinessContext | null,
): Promise<AuditFinding> {
  const expectedType = inferSchemaType(businessContext?.businessType);

  // ... existing HTML fetch and extractJsonLdTypes() ...

  if (types.length === 0) {
    return {
      dimension,
      status: 'fail',
      severity: 'high',
      message: 'No JSON-LD schema markup detected',
      suggestedToolCall: 'generate_schema_markup',
      suggestedToolCallArgs: { recommendedType: expectedType },  // SCH-03
    };
  }

  // SCH-01 / SCH-02: pass if any extracted type matches expected OR LocalBusiness is present
  // and expectedType is a LocalBusiness subtype
  const hasExpectedType = types.some(t => t === expectedType);
  const hasLocalBusiness = types.some(t => t === 'LocalBusiness');

  // LOCAL_BUSINESS_SUBTYPES lists types that are subtypes of LocalBusiness —
  // a page with just "LocalBusiness" is acceptable for any of them (parent is valid)
  const LOCAL_BUSINESS_SUBTYPES = new Set([
    'TravelAgency', 'Restaurant', 'CafeOrCoffeeShop', 'Bakery', 'FoodEstablishment',
    'LegalService', 'AccountingService', 'Electrician', 'Plumber', 'GeneralContractor',
    'RoofingContractor', 'HousePainter', 'Locksmith', 'AutomotiveBusiness', 'Dentist',
    'MedicalBusiness', 'RealEstateAgent',
  ]);
  const expectedIsLocalBusinessSubtype = LOCAL_BUSINESS_SUBTYPES.has(expectedType);

  if (hasExpectedType || (expectedIsLocalBusinessSubtype && hasLocalBusiness)) {
    return {
      dimension,
      status: 'pass',
      severity: 'low',
      message: `Schema markup found: ${types.join(', ')}`,
    };
  }

  // Present but doesn't match: warning with recommendation
  return {
    dimension,
    status: 'warning',
    severity: 'medium',
    message: `Schema markup present but expected type "${expectedType}" not found. Found: ${types.join(', ')}`,
    suggestedToolCall: 'generate_schema_markup',
    suggestedToolCallArgs: { recommendedType: expectedType },  // SCH-03
  };
}
```

### Pattern 3: Threading businessContext Through runAudit()

**What:** `runAudit()` accepts an optional second parameter `businessContext?: BusinessContext | null`. It passes this to `checkSchemaMarkup()` only. The other four dimension checks don't need it.

**Critical constraint:** The parameter must be optional (`?`) to avoid breaking `runAudit(target)` call sites in tests/scripts that pass only the target.

```typescript
// src/audit/index.ts — modified signature
import type { BusinessContext } from '../types/index.js';

export async function runAudit(
  target: string,
  businessContext?: BusinessContext | null,
): Promise<AuditReport> {
  // ... existing validation and probe setup ...

  const frameworkDetection = await fetchAndDetectFramework(probe);

  const findings = await Promise.all([
    checkLlmsTxt(probe, frameworkDetection),
    checkRobotsTxtAiAccess(probe, frameworkDetection),
    checkSchemaMarkup(probe, businessContext),   // <-- businessContext threaded here
    checkFaq(probe),
    checkMarkdownMirrors(probe, frameworkDetection),
  ]);

  // ... rest unchanged ...
}
```

**tools/index.ts update:** The `audit_ai_seo` handler already receives `businessContext` — just pass it to `runAudit()`:

```typescript
// src/tools/index.ts — line 132 (currently)
const report = await runAudit(target.trim());

// Change to:
const report = await runAudit(target.trim(), businessContext);
```

### Pattern 4: suggestedToolCallArgs.recommendedType Seeding (SCH-03)

**What:** Both the `fail` path (no JSON-LD) and the `warning` path (wrong type) seed `suggestedToolCallArgs` with `{ recommendedType: expectedType }` so the wizard can pre-fill the `generate_schema_markup` tool call without asking the user to choose a type.

**How it integrates with tools/index.ts wizard:** In the Phase 9 context accumulation loop (tools/index.ts ~line 309), when the wizard processes a schema finding with `suggestedToolCall: 'generate_schema_markup'`, it currently elicits `schemaTypes` from the user. Phase 13's `suggestedToolCallArgs.recommendedType` enables the wizard to use the inferred type as the default suggestion — but this integration is **out of scope for Phase 13**. Phase 13 only seeds the field. The wizard reads it in a later phase. The planner should note this scope boundary.

### Anti-Patterns to Avoid

- **Using `ProfessionalService` as a fallback type:** This type is deprecated on schema.org. The phase context mentions it as a safe fallback, but schema.org confirms it was deprecated due to confusion with `Service`. Use plain `LocalBusiness` as the fallback instead. This is a correction to the phase context — prioritize the official schema.org source.
- **Exact string matching on businessType:** `businessType` is free-text (e.g. "vehicle wrap shop", "Denver law firm"). Use `includes()` / `toLowerCase()` keyword matching, not equality checks.
- **Making businessContext required in runAudit():** Existing smoke tests and scripts call `runAudit(probe)` with one argument. Adding a required second parameter breaks all of them.
- **Checking only the inferred type for pass:** A site that uses `LocalBusiness` when `TravelAgency` is expected is not wrong — LocalBusiness is the valid parent type. Pass it. Only sites using entirely unrelated types (e.g. `SoftwareApplication` when `Restaurant` is expected) should warn.
- **Embedding the type map inline in schema.ts:** The architecture note explicitly calls for `src/audit/schema-type-map.ts` as its own file. Keep it separate so it's independently testable (module-scope pure function pattern from Phase 12).
- **Treating SoftwareApplication as a LocalBusiness subtype:** `SoftwareApplication` extends `CreativeWork`, not `LocalBusiness`. A page with only `SoftwareApplication` and no `LocalBusiness` should PASS for a SaaS business, not warn. The LOCAL_BUSINESS_SUBTYPES set in Pattern 2 must NOT include `SoftwareApplication`, `OnlineStore`, or `OnlineBusiness`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema.org type hierarchy traversal | Custom type-tree walker | Simple `Set` of known LocalBusiness subtypes | The full schema.org graph has 800+ types; this phase only needs ~20 relevant ones |
| businessType NLP classification | LLM call or ML model | Keyword `includes()` matching | Free-text businessType is intentionally short (1-5 words); keyword matching is sufficient and deterministic |
| Schema.org type validation | External validator API | Hardcoded known-types check | The set of types this tool generates is bounded and well-known |

**Key insight:** The mapping problem is a small finite set (20-30 common business categories). A hard-coded keyword map is the correct level of complexity — it's deterministic, testable, and readable.

---

## Common Pitfalls

### Pitfall 1: runAudit() Second Parameter Breaks Existing Call Sites

**What goes wrong:** Adding a required `businessContext` parameter to `runAudit()` causes TypeScript compile errors in smoke tests and anywhere else that calls `runAudit(target)` with one argument.

**Why it happens:** Not making the parameter optional.

**How to avoid:** Declare as `businessContext?: BusinessContext | null`. The `?` makes it genuinely optional — `undefined` is the value when not passed. TypeScript strict mode will enforce null safety inside `runAudit()`.

**Warning signs:** `tsc --noEmit` should be run after every signature change to catch this immediately.

### Pitfall 2: inferSchemaType Falls Through on All Keywords

**What goes wrong:** A business described as `"vehicle wrap shop"` returns `LocalBusiness` because the keyword map has no entry for "wrap" or "wrap shop".

**Why it happens:** Incomplete keyword map.

**How to avoid:** The map needs both generic category terms AND the specific example from the phase requirements: `businessType = "saas"` must map to `SoftwareApplication`. Check the examples in the phase requirements against the map.

**Warning signs:** Smoke test: `inferSchemaType('saas') === 'SoftwareApplication'` and `inferSchemaType('vehicle wrap shop') === 'LocalBusiness'` (correct fallback) must both pass.

### Pitfall 3: SCH-02 Regression — No-Context Audit Warns on Any Valid Schema

**What goes wrong:** When `businessContext` is undefined, the schema check still compares against a hardcoded type and warns when the page uses `Organization` or `SoftwareApplication`.

**Why it happens:** The `inferSchemaType(undefined)` return value (`LocalBusiness`) is used to evaluate pass/fail even when there's no context. With no context, any valid `@type` should pass.

**How to avoid:** When `businessContext` is `undefined` or `businessContext.businessType` is empty, and any JSON-LD `@type` is present, return `status: 'pass'`. The simplest implementation: treat `inferSchemaType(undefined) → 'LocalBusiness'` and then also pass when `types.length > 0` and `businessType` was not provided.

A clean implementation splits this into two paths:
1. `businessContext` provided → use inferred type for pass/fail
2. `businessContext` not provided → pass if any `@type` present, fail only if no JSON-LD at all

### Pitfall 4: Parent Type Not Accepted for LocalBusiness Subtypes

**What goes wrong:** A site uses `@type: "LocalBusiness"` (a valid catch-all) but the inferred type is `TravelAgency`. The check warns because `LocalBusiness !== TravelAgency`.

**Why it happens:** Strict equality check on extracted type.

**How to avoid:** For any inferred type that is a subtype of `LocalBusiness`, also accept plain `LocalBusiness` on the page as a pass. Use the `LOCAL_BUSINESS_SUBTYPES` set approach from Pattern 2. Note: this does NOT apply to `SoftwareApplication` or `OnlineStore` — these are not LocalBusiness subtypes.

### Pitfall 5: SoftwareApplication Schema.org Hierarchy Misunderstood

**What goes wrong:** Code treats `SoftwareApplication` as acceptable whenever `LocalBusiness` is inferred, or vice versa. A page with only `SoftwareApplication` warns for a `"vehicle wrap shop"`.

**Why it happens:** Confusing schema.org type hierarchies. `SoftwareApplication` extends `CreativeWork`, not `Organization` or `LocalBusiness`.

**How to avoid:** The inferred type check is one-directional for non-LocalBusiness types. If inferred = `SoftwareApplication`, only `SoftwareApplication` (or its subtypes: `WebApplication`, `MobileApplication`) should pass. `LocalBusiness` on the page for a SaaS should still be a warning (it's technically wrong, not absent).

**Warning signs:** A smoke test that checks `saas + SoftwareApplication → pass` and `saas + LocalBusiness → warning` must both pass.

### Pitfall 6: keyword Map Order Matters

**What goes wrong:** `"travel agency"` matches `"auto"` keyword because the map checks `"auto"` before `"travel agenc"` and the word "auto" appears in some travel-adjacent term.

**Why it happens:** The keyword map uses `includes()` — a substring match. Short keywords match more words.

**How to avoid:** Order the map from most-specific to least-specific. Put multi-word phrases before single words. Add spaces to keyword fragments where needed (e.g. `"car "` with trailing space to avoid matching "carpet cleaner"). Test against edge cases.

---

## Code Examples

Verified from codebase inspection and schema.org official docs:

### inferSchemaType() Smoke Test Cases

```typescript
// Expected values for test assertions:
inferSchemaType('saas')              // → 'SoftwareApplication'
inferSchemaType('SaaS')              // → 'SoftwareApplication' (case-insensitive)
inferSchemaType('software company')  // → 'SoftwareApplication'
inferSchemaType('travel agency')     // → 'TravelAgency'
inferSchemaType('restaurant')        // → 'Restaurant'
inferSchemaType('law firm')          // → 'LegalService'
inferSchemaType('vehicle wrap shop') // → 'LocalBusiness' (no match → fallback)
inferSchemaType(undefined)           // → 'LocalBusiness' (SCH-02)
inferSchemaType('')                  // → 'LocalBusiness' (SCH-02)
```

### checkSchemaMarkup() — SCH-02: No Context, Any Type Passes

```typescript
// No businessContext, page has SoftwareApplication JSON-LD → pass
await checkSchemaMarkup('https://example.com');
// types = ['SoftwareApplication']
// expectedType = 'LocalBusiness' (no context)
// BUT: businessContext was not provided → any type present = pass
// Result: { status: 'pass', message: 'Schema markup found: SoftwareApplication' }
```

### checkSchemaMarkup() — SCH-01: SaaS Site

```typescript
// businessContext.businessType = 'saas', page has SoftwareApplication → pass
await checkSchemaMarkup('https://my-saas.com', { businessName: 'MySaaS', businessType: 'saas' });
// inferSchemaType('saas') = 'SoftwareApplication'
// types = ['SoftwareApplication']
// hasExpectedType = true → pass
// Result: { status: 'pass', message: 'Schema markup found: SoftwareApplication' }
```

### suggestedToolCallArgs Shape (SCH-03)

```typescript
// When schema check fails for a SaaS site:
{
  dimension: 'schema',
  status: 'fail',
  severity: 'high',
  message: 'No JSON-LD schema markup detected',
  suggestedToolCall: 'generate_schema_markup',
  suggestedToolCallArgs: {
    recommendedType: 'SoftwareApplication'   // Pre-seeded from inferSchemaType
  }
}
```

### Schema.org Type Hierarchy Reference (Verified from schema.org)

```
Thing
├── CreativeWork
│   └── SoftwareApplication
│       ├── WebApplication
│       ├── MobileApplication
│       └── VideoGame
└── Organization
    ├── OnlineBusiness          (experimental — "new" area of schema.org)
    │   └── OnlineStore
    └── LocalBusiness           (also extends Place)
        ├── TravelAgency
        ├── Restaurant
        ├── CafeOrCoffeeShop
        ├── Bakery
        ├── FoodEstablishment
        ├── LegalService
        ├── AccountingService
        ├── AutomotiveBusiness
        ├── Dentist
        ├── MedicalBusiness
        ├── RealEstateAgent
        ├── HomeAndConstructionBusiness
        │   ├── Electrician
        │   ├── Plumber
        │   ├── GeneralContractor
        │   ├── RoofingContractor
        │   ├── HousePainter
        │   └── Locksmith
        └── ... (30 subtypes total)
```

**Note:** `ProfessionalService` is deprecated per schema.org — do not use it as a type in the map or as a fallback. Use `LocalBusiness` as the fallback instead.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `checkSchemaMarkup` hardcodes `LocalBusiness` as the only valid `@type` | `inferSchemaType()` derives expected type from `businessType` keyword | Phase 13 | Eliminates false positives on SaaS, travel, e-commerce sites |
| `AuditFinding.suggestedToolCallArgs` always undefined for schema findings | Seeded with `{ recommendedType }` on fail/warning | Phase 13 | Wizard can pre-fill schema type without prompting user |
| `runAudit()` takes only `target: string` | `runAudit(target, businessContext?)` optional second param | Phase 13 | Schema dimension receives user context; all other callers unaffected |

**Deprecated/outdated:**
- `ProfessionalService` schema.org type: deprecated by schema.org due to confusion with `Service` type. Phase context mentions it as a fallback — this is incorrect per the current schema.org spec. Use `LocalBusiness` instead.

---

## Open Questions

1. **Should a page using `LocalBusiness` pass when the inferred type is a specific subtype (e.g. `TravelAgency`)?**
   - What we know: `LocalBusiness` is the parent type of `TravelAgency`. A page using the parent is not wrong, just less specific. The phase success criteria say to pass when `SoftwareApplication` is present for a SaaS site — they don't directly address the parent-type case.
   - What's unclear: Is `LocalBusiness` on a travel site a `pass` or a `warning`?
   - Recommendation: Treat it as `pass`. The audit's purpose is to detect _absence_ of schema markup, not enforce maximum specificity. Using `LocalBusiness` for a `TravelAgency` is valid schema.org. Warn only when a non-LocalBusiness type (e.g. `SoftwareApplication`) is present for a local business context.

2. **Should `checkSchemaMarkup` import `BusinessContext` from `src/types/index.ts` directly?**
   - What we know: `src/audit/dimensions/schema.ts` currently imports only from `../types.js` (audit types). `BusinessContext` lives in `src/types/index.ts`.
   - What's unclear: Whether importing from a sibling `src/types/` module in a dimension file creates a dependency concern.
   - Recommendation: Yes, import directly. `src/types/index.ts` is documented as the leaf node with no circular dependencies — importing it from anywhere in `src/audit/` is safe per the codebase's own comment.

3. **What happens when `businessContext` is provided but `businessType` is empty string?**
   - What we know: `inferSchemaType('')` returns `'LocalBusiness'`.
   - Recommendation: This is the SCH-02 fallback behaviour — any type present passes. Handle by checking `businessType?.trim().length === 0` as equivalent to "no context".

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — `src/audit/dimensions/schema.ts` (current hardcoded `LocalBusiness` check; `checkSchemaMarkup()` signature)
- Direct codebase inspection — `src/audit/index.ts` (current `runAudit()` signature, `checkSchemaMarkup(probe)` call)
- Direct codebase inspection — `src/audit/types.ts` (`AuditFinding.suggestedToolCallArgs?: Record<string, unknown>` already declared)
- Direct codebase inspection — `src/tools/index.ts` (line 132: `runAudit(target.trim())` — businessContext NOT passed; line 124: `businessContext` available in handler scope)
- Direct codebase inspection — `src/types/index.ts` (`BusinessContext.businessType: string` — free-text, not enum)
- [schema.org/LocalBusiness](https://schema.org/LocalBusiness) — confirmed 30 subtypes including TravelAgency, Restaurant, Dentist; confirmed LocalBusiness hierarchy
- [schema.org/SoftwareApplication](https://schema.org/SoftwareApplication) — confirmed extends CreativeWork, NOT LocalBusiness; subtypes include WebApplication, MobileApplication
- [schema.org/OnlineBusiness](https://schema.org/OnlineBusiness) — confirmed extends Organization; subtype OnlineStore; marked as "new" (experimental)
- [schema.org/ProfessionalService](https://schema.org/ProfessionalService) — confirmed DEPRECATED; do not use as type

### Secondary (MEDIUM confidence)

- [Schema.org for e-commerce — OnlineStore type](https://schema.org/OnlineStore) — `OnlineStore` is the recommended type for e-commerce-only sites (extends `OnlineBusiness` extends `Organization`)
- [Organization vs LocalBusiness — Schema App guide](https://www.schemaapp.com/schema-markup/how-to-do-schema-markup-for-local-business/) — confirms: use `LocalBusiness` subtypes for physical businesses; `Organization` for online-only (verified against schema.org hierarchy)

### Tertiary (LOW confidence)

- WebSearch consensus on SaaS schema.org type — `SoftwareApplication` for SaaS apps, `Organization` for companies; multiple SEO sources agree (not verified against a single authoritative spec page, but consistent with schema.org hierarchy)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns derived from existing codebase
- Architecture (file structure, parameter threading): HIGH — derived from direct codebase inspection; optional param pattern matches Phase 12's framework parameter pattern
- Schema.org type hierarchy: HIGH — verified directly on schema.org official type pages
- Keyword map completeness: MEDIUM — covers the examples in phase requirements plus common cases; will not cover every possible businessType value (by design — fallback handles unknown types)
- ProfessionalService deprecation: HIGH — confirmed on schema.org/ProfessionalService; phase context's suggestion to use it is incorrect

**Research date:** 2026-04-21
**Valid until:** 90 days — schema.org type hierarchy changes very slowly; TypeScript patterns stable
