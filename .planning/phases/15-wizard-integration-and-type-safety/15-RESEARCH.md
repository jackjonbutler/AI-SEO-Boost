# Phase 15: Wizard Integration and Type Safety - Research

**Researched:** 2026-04-21
**Domain:** TypeScript literal union types, discriminated dispatch tables, accumulator pre-seeding
**Confidence:** HIGH

---

## Summary

Phase 15 has two tightly coupled concerns. WIZ-01 narrows `suggestedToolCall` from `string` to a string literal union type and replaces the wizard's `switch` dispatch with a typed `Record<SuggestedToolCall, handler>` table. WIZ-02 pre-seeds `suggestedToolCallArgs` on audit findings so the wizard can populate `AccumulatedContext` before the gap-fill loop — eliminating re-prompts for data the audit already captured (the `target` URL, the missing-bots list from `robots-ai`, the `recommendedType` from `schema`).

Both changes are entirely within existing files. No new files are created. The surface area is: `src/audit/types.ts` (literal union definition and narrowed field type), `src/audit/dimensions/*.ts` (add `suggestedToolCallArgs` seeding to each dimension), and `src/tools/index.ts` (typed dispatch table replacing the `switch`, accumulator pre-seeding from `suggestedToolCallArgs`).

The `tsc --noEmit` baseline is clean (zero errors) going into Phase 15. All changes must preserve that state.

**Primary recommendation:** Define `SuggestedToolCall` as a `const`-typed string union in `src/audit/types.ts`, narrow `AuditFinding.suggestedToolCall` to that union, build a typed `Record<SuggestedToolCall, (finding: AuditFinding) => Promise<void>>` dispatch table at the top of the execution loop, and seed `suggestedToolCallArgs` in each dimension file with the data that dimension already has.

---

## Current State Audit (from codebase inspection)

### Exact `suggestedToolCall` values in use (all 5 unique strings)

| Value | Where emitted | Times emitted |
|-------|--------------|---------------|
| `'generate_llms_txt'` | `dimensions/llms-txt.ts` | 2 |
| `'configure_robots_txt'` | `dimensions/robots-txt.ts` | 4 |
| `'generate_schema_markup'` | `dimensions/schema.ts` | 2 |
| `'generate_faq_content'` | `dimensions/faq.ts` | 2 |
| `'generate_markdown_mirrors'` | `dimensions/markdown.ts` | 5 |

These 5 values are exactly the keys of `TOOL_FIELD_MAP` in `tools/index.ts`. The union type must cover all 5. No dimension emits any other value.

### Current `suggestedToolCallArgs` usage (Phase 15 starting point)

Only `dimensions/schema.ts` already populates `suggestedToolCallArgs`. It emits `{ recommendedType: expectedType }` (a `string` holding the inferred `schema.org` `@type`).

All other 4 dimensions do **not** set `suggestedToolCallArgs`. Phase 15 adds seeding to `robots-txt.ts`, `llms-txt.ts`, `faq.ts`, and `markdown.ts`.

### Current dispatch mechanism (Phase 10 switch)

`tools/index.ts` lines ~373–540: a `switch (toolName)` where `toolName` is `finding.suggestedToolCall` — typed as `string | undefined`. The switch has cases for all 5 tool names with a default fall-through (silent, no action). The guard `if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;` protects the switch.

### Current accumulator seeding (Phase 9)

`acc` is seeded from `businessContext ?? {}` only (line ~246). There is no seeding from `finding.suggestedToolCallArgs`. The gap-fill loop then computes missing required fields and elicits them. Phase 15 adds a pre-seed step: before the gap-fill, merge `finding.suggestedToolCallArgs` into `acc` for applicable fields.

### TypeScript compiler baseline

`tsc --noEmit` exits clean (zero errors) with `strict: true`, `module: Node16`, `target: ES2022`. All Phase 15 changes must maintain zero errors.

---

## Architecture Patterns

### Pattern 1: TypeScript String Literal Union for `SuggestedToolCall`

**What:** Extract the 5 known tool call string values into a `const`-typed union defined in `src/audit/types.ts`.

**TypeScript mechanics (HIGH confidence — core TypeScript feature):**
```typescript
// src/audit/types.ts

// Define the union once
export type SuggestedToolCall =
  | 'generate_llms_txt'
  | 'configure_robots_txt'
  | 'generate_schema_markup'
  | 'generate_faq_content'
  | 'generate_markdown_mirrors';

// Narrow the field on AuditFinding
export interface AuditFinding {
  // ... existing fields ...
  suggestedToolCall?: SuggestedToolCall;   // was: string
  suggestedToolCallArgs?: Record<string, unknown>;
}
```

**Effect:** Every dimension file that assigns `suggestedToolCall: 'some_string'` will produce a compile error if the string is not a member of `SuggestedToolCall`. Adding a new tool name without updating the union is a compile-time error.

**Why `src/audit/types.ts` and not `src/types/index.ts`:** `src/types/index.ts` is explicitly the leaf node with no imports. The `SuggestedToolCall` type depends on the audit domain; placing it in `src/audit/types.ts` keeps the dependency graph intact and avoids the "Cannot read properties of undefined" cycle documented in `src/types/index.ts` line 6.

**Why NOT an `enum`:** TypeScript `const enum` inlines values but requires explicit compilation configuration and can break with `isolatedModules`. A plain union of string literals produces identical compile-time enforcement without any runtime representation — simpler and consistent with the project's existing patterns (e.g. `Severity`, `AuditDimension` are unions not enums).

---

### Pattern 2: Typed Dispatch Table Replacing `switch`

**What:** Replace the `switch (toolName)` in the Phase 10 execution loop with a `Record<SuggestedToolCall, handler>`.

**TypeScript mechanics (HIGH confidence — core TypeScript feature):**
```typescript
// Inside registerAllTools, before the execution loop
type FixHandler = (finding: AuditFinding) => Promise<void>;

const dispatchTable: Record<SuggestedToolCall, FixHandler> = {
  generate_llms_txt: async (finding) => {
    // ... handler body moved from switch case ...
  },
  configure_robots_txt: async (finding) => { /* ... */ },
  generate_schema_markup: async (finding) => { /* ... */ },
  generate_faq_content: async (finding) => { /* ... */ },
  generate_markdown_mirrors: async (finding) => { /* ... */ },
};
```

**Compile-time enforcement:** `Record<SuggestedToolCall, FixHandler>` requires **every** key in the union to be present. Removing a key or misspelling one is a compile error. Adding a new value to `SuggestedToolCall` without adding a handler is a compile error. This is the core WIZ-01 guarantee.

**Calling the table:**
```typescript
for (const finding of selectedFindings) {
  if (skippedFindings.includes(finding.dimension)) continue;
  const toolName = finding.suggestedToolCall;
  if (!toolName) continue;  // undefined guard — narrow to SuggestedToolCall

  const handler = dispatchTable[toolName];  // typed: no 'any' needed
  try {
    await handler(finding);
  } catch (toolErr) {
    fixErrors.push(`${toolName}: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`);
  }
}
```

**Note on `TOOL_FIELD_MAP` guard:** The gap-fill loop at line ~252 has `if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;`. With `TOOL_FIELD_MAP` currently typed as `Record<string, ...>`, this works. Phase 15 can optionally narrow `TOOL_FIELD_MAP` to `Record<SuggestedToolCall, ...>` as well — but that is an optional tightening. The gap-fill guard can remain `if (!toolName) continue;` since all `SuggestedToolCall` values are keys of `TOOL_FIELD_MAP`.

---

### Pattern 3: Accumulator Pre-Seeding from `suggestedToolCallArgs`

**What:** Before the gap-fill loop (Phase 9), seed `acc` with fields from `finding.suggestedToolCallArgs` when those fields map to `AccumulatedContext` keys.

**Location:** `tools/index.ts` line ~246 (after `const acc: AccumulatedContext = { ...businessContext ?? {} };`)

**Implementation pattern:**
```typescript
// In the gap-fill loop, before computing missing fields:
// Pre-seed from suggestedToolCallArgs (WIZ-02)
if (finding.suggestedToolCallArgs) {
  const args = finding.suggestedToolCallArgs;
  // target is always available from the outer closure — seed it
  // (no field in AccumulatedContext named 'target', but tool handlers use it from closure)
  // Seed schemaTypes from recommendedType if not already set
  if (typeof args['recommendedType'] === 'string' && !acc.schemaTypes) {
    acc.schemaTypes = [args['recommendedType'] as string];
  }
  // robots-txt: seed missingBots if provided (informational — no AccumulatedContext field)
  // llms-txt: target already in outer closure; no new AccumulatedContext fields to seed
}
```

**Key insight on `target`:** The wizard's `target` value comes from the outer closure (`const report = await runAudit(target.trim(), ...)`). There is no `target` field in `AccumulatedContext` or `WizardToolFields`. The `generate_markdown_mirrors` case already uses `target` from the closure directly (line ~488). No change needed to seed `target` — it is already available.

**Key insight on `generate_llms_txt`:** The audit finding for `llms-txt` does not yet set `suggestedToolCallArgs`. The only audit data that could be seeded is `target` (used to construct the default `outputPath` hint), but `outputPath` must be user-supplied. The pre-seeding benefit here is minimal; no `suggestedToolCallArgs` fields map to `AccumulatedContext` for this dimension.

**Key insight on `configure_robots_txt`:** `robots-txt.ts` knows which bots are missing (`missing.join(', ')`). This could be added as `suggestedToolCallArgs: { missingBots: missing }`. This is informational context that could be displayed in the gap-fill prompt message but does NOT map to any `AccumulatedContext` field (`robotsPath` still requires user input). The planner should decide whether to seed this for message enrichment.

**Key insight on `generate_schema_markup`:** This is the richest seeding opportunity. `recommendedType` (e.g. `'Restaurant'`) is already set by `schema.ts`. In the accumulator pre-seed step, `acc.schemaTypes` can be pre-populated from `args.recommendedType` so the schema types gap-fill question is skipped entirely.

**Key insight on `generate_faq_content` and `generate_markdown_mirrors`:** No unique data from the audit beyond what's already in `businessContext` or the outer `target` closure. No `suggestedToolCallArgs` seeding provides accumulator benefit.

---

### Pattern 4: Dimension-side `suggestedToolCallArgs` Seeding

**What:** Add `suggestedToolCallArgs` to findings in dimension files where the audit already has data worth seeding.

**`dimensions/robots-txt.ts`:** Add `missingBots` array to failing/warning findings:
```typescript
// When missing.length > 0:
suggestedToolCallArgs: { missingBots: missing },  // string[]
```

**`dimensions/llms-txt.ts`:** The audit only knows `target` (available from closure in wizard). No useful `suggestedToolCallArgs` payload that maps to AccumulatedContext. The `target` URL could be seeded as a hint for constructing `outputPath`, but `outputPath` is always a user decision. Leave `suggestedToolCallArgs` absent unless the planner wants to add a `targetUrl` hint.

**`dimensions/faq.ts`:** No audit-captured data beyond the page HTML. Leave `suggestedToolCallArgs` absent.

**`dimensions/markdown.ts`:** The sitemap URL (`origin + '/sitemap.xml'`) is known when coverage runs. This does not map to any `AccumulatedContext` field. Leave `suggestedToolCallArgs` absent unless a `sitemapHint` field is desired for future use.

**`dimensions/schema.ts`:** Already sets `suggestedToolCallArgs: { recommendedType: expectedType }`. No change needed to the dimension file itself.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exhaustiveness checking for dispatch | Custom runtime registry or reflection | `Record<SuggestedToolCall, handler>` | TypeScript enforces completeness at compile time; no runtime cost |
| Enum for tool names | `enum SuggestedToolCall { ... }` | String literal union type | Enums add runtime objects, can break with `isolatedModules`, and are harder to iterate; string unions are zero-runtime and more composable |
| Type guard to narrow `string` to `SuggestedToolCall` | `function isSuggestedToolCall(s: string): s is SuggestedToolCall` | Direct structural narrowing via `if (!toolName) continue` after `suggestedToolCall?: SuggestedToolCall` | Once the field is typed as `SuggestedToolCall | undefined`, the `undefined` check is sufficient; no runtime set/array check needed |
| Centralized args schema | New `suggestedToolCallArgsSchema` per tool | Remain with `Record<string, unknown>` | The args are advisory hints only — downstream consumers cast what they need; a full schema would require coordination across audit and tools layers |

---

## Common Pitfalls

### Pitfall 1: Placing `SuggestedToolCall` in `src/types/index.ts`
**What goes wrong:** `src/types/index.ts` is explicitly documented as a leaf node with no imports. Placing `SuggestedToolCall` there is safe (it's just a type alias, no imports needed), BUT it would create a conceptual coupling between the general types layer and the audit domain's tool call concept.
**How to avoid:** Define `SuggestedToolCall` in `src/audit/types.ts` where `AuditFinding` lives. It is consumed by `tools/index.ts` which already imports from `audit/types.ts` implicitly (via the `AuditReport` type from `runAudit`).
**Import chain:** `tools/index.ts` imports `runAudit` from `audit/index.ts` which imports types from `audit/types.ts`. To use `SuggestedToolCall` in `tools/index.ts`, add `import type { SuggestedToolCall } from '../audit/types.js'`.

### Pitfall 2: `TOOL_FIELD_MAP` key type mismatch after union narrowing
**What goes wrong:** `TOOL_FIELD_MAP` is currently typed `Record<string, ...>`. After narrowing `suggestedToolCall` to `SuggestedToolCall`, the dispatch table guard `TOOL_FIELD_MAP[toolName]` still works (string indexing is valid). BUT if `TOOL_FIELD_MAP` is tightened to `Record<SuggestedToolCall, ...>`, the `TOOL_FIELD_MAP[toolName]` call is no longer needed as a guard (all union members are present). Choose one approach and be consistent.
**How to avoid:** Either (a) keep `TOOL_FIELD_MAP` as `Record<string, ...>` and remove the `!TOOL_FIELD_MAP[toolName]` guard from the execution loop (since all `SuggestedToolCall` values are always present), or (b) tighten to `Record<SuggestedToolCall, ...>` which enforces completeness there too. Option (b) is strictly better.

### Pitfall 3: `as any` cast in gap-fill is unaffected by union narrowing
**What goes wrong:** The Phase 9 decision to use `as any` for the gap-fill `properties` object (SDK PrimitiveSchemaDefinitionSchema incompatibility) remains necessary regardless of Phase 15 changes. The union narrowing does not change elicitation input shapes.
**How to avoid:** Keep the existing `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment on the `properties as any` cast. It is a known intentional cast, not a regression.

### Pitfall 4: Handler closures need access to `acc`, `fixResults`, `fixErrors` from outer scope
**What goes wrong:** Moving switch case bodies into dispatch table handlers requires those handlers to close over `acc`, `fixResults`, `fixErrors`, `target`, and `server`. If handlers are defined as standalone named functions, these values must be passed as parameters, making the signature complex.
**How to avoid:** Define the dispatch table as a `const` inside the wizard block (after `acc` is declared), not at module scope. This way each handler naturally closes over all wizard-local state. The table is created once per wizard invocation — not a performance concern.

### Pitfall 5: `recommendedType` seeding must not overwrite a user-supplied `schemaTypes`
**What goes wrong:** If `businessContext` already contains `schemaTypes` (not a `BusinessContext` field, but it might be in `acc` from a prior gap-fill), seeding from `recommendedType` would overwrite the user's explicit choice.
**How to avoid:** Guard with `if (!acc.schemaTypes)` before seeding. See Pattern 3 above.

### Pitfall 6: `suggestedToolCallArgs` shape for `robots-ai` dimension — `missingBots` is not an `AccumulatedContext` field
**What goes wrong:** Seeding `acc.missingBots` from `suggestedToolCallArgs` would require adding `missingBots` to `WizardToolFields`. This field has no use in the execution loop (the `configure_robots_txt` case calls `patchRobotsTxt(acc.robotsPath!, acc.sitemapUrl)` which re-detects missing bots itself).
**How to avoid:** If `missingBots` is added to `suggestedToolCallArgs` for the `robots-ai` dimension, it should be used only for message enrichment in the gap-fill prompt, not seeded into `acc`. No `WizardToolFields` change needed.

---

## Code Examples

### Defining the union and narrowing the interface

```typescript
// src/audit/types.ts — add above AuditFinding

/**
 * Exhaustive union of all tool call strings the wizard can dispatch.
 * Every value here must have a corresponding key in TOOL_FIELD_MAP (tools/index.ts)
 * and a handler in the dispatch table.
 * Adding a new tool name here forces a compile error in the dispatch table until a handler is added.
 */
export type SuggestedToolCall =
  | 'generate_llms_txt'
  | 'configure_robots_txt'
  | 'generate_schema_markup'
  | 'generate_faq_content'
  | 'generate_markdown_mirrors';

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: SuggestedToolCall;  // narrowed from string
  suggestedToolCallArgs?: Record<string, unknown>;
  diagnostics?: AuditFindingDiagnostics;
}
```

### Dispatch table pattern (tools/index.ts)

```typescript
// Inside the wizard block, after acc is declared (line ~246)
// Import: add to top-level imports: import type { SuggestedToolCall } from '../audit/types.js'

type FixHandler = (finding: AuditFinding) => Promise<void>;

const dispatchTable: Record<SuggestedToolCall, FixHandler> = {
  generate_llms_txt: async (_finding) => {
    const ctx = acc as BusinessContext;
    const content = buildLlmsTxt(ctx);
    await writeFile(acc.outputPath!, content, 'utf-8');
    fixResults.push('llms.txt written to ' + acc.outputPath + ' (' + content.length + ' bytes)');
    // ... acknowledgment elicit ...
  },
  configure_robots_txt: async (_finding) => { /* ... */ },
  generate_schema_markup: async (_finding) => { /* ... */ },
  generate_faq_content: async (_finding) => { /* ... */ },
  generate_markdown_mirrors: async (_finding) => { /* ... */ },
};

// Execution loop replaces switch:
for (const finding of selectedFindings) {
  if (skippedFindings.includes(finding.dimension)) continue;
  const toolName = finding.suggestedToolCall;
  if (!toolName) continue;
  try {
    await dispatchTable[toolName](finding);
  } catch (toolErr) {
    fixErrors.push(toolName + ': ' + (toolErr instanceof Error ? toolErr.message : String(toolErr)));
  }
}
```

### Accumulator pre-seeding from `suggestedToolCallArgs` (gap-fill loop, WIZ-02)

```typescript
// In the gap-fill loop, after: const toolName = finding.suggestedToolCall;

// Pre-seed acc from args the audit already captured (WIZ-02)
if (finding.suggestedToolCallArgs) {
  const args = finding.suggestedToolCallArgs;
  // schema dimension: seed schemaTypes from recommendedType if not yet set
  if (typeof args['recommendedType'] === 'string' && !acc.schemaTypes) {
    acc.schemaTypes = [args['recommendedType'] as string];
  }
  // Future: additional fields mapped here as new dimensions capture more data
}
```

### Dimension-side seeding for robots-txt (informational only)

```typescript
// dimensions/robots-txt.ts — when missing.length > 0
return {
  dimension,
  status: 'fail',
  severity: 'high',
  message: `Missing AI crawler rules for: ${missing.join(', ')}.`,
  suggestedToolCall: 'configure_robots_txt',
  suggestedToolCallArgs: { missingBots: missing },  // string[] — for prompt enrichment
};
```

### Import addition for tools/index.ts

```typescript
// Add to existing imports at top of tools/index.ts:
import type { SuggestedToolCall, AuditFinding } from '../audit/types.js';
// Note: AuditFinding is currently imported implicitly via AuditReport.findings[].
// If it is not already explicitly imported, add it here.
```

---

## Scope Boundaries (What Phase 15 Does NOT Touch)

- No changes to `businessContextSchema` (Zod schema stays in `tools/index.ts`)
- No changes to `TOOL_FIELD_MAP` key order or values (unless tightening to `Record<SuggestedToolCall, ...>` as optional improvement)
- No changes to the gap-fill elicitation schema builder (switch on field names stays)
- No changes to the Phase 8 issue-selection elicitation
- No changes to acknowledgment elicitation pattern
- No changes to `AccumulatedContext` or `WizardToolFields` type shapes (unless `missingBots` is added, which is optional)
- No new files created — all changes in-place in existing files

---

## File-Level Change Summary

| File | Change | Scope |
|------|--------|-------|
| `src/audit/types.ts` | Add `SuggestedToolCall` type; narrow `AuditFinding.suggestedToolCall` from `string` to `SuggestedToolCall` | ~4 lines added, 1 line changed |
| `src/audit/dimensions/robots-txt.ts` | Add `suggestedToolCallArgs: { missingBots: missing }` to findings where missing.length > 0 | ~4 lines added across 2 return sites |
| `src/audit/dimensions/llms-txt.ts` | Optional: add `suggestedToolCallArgs: { targetUrl: target }` as hint; likely no-op for v1 | Optional |
| `src/audit/dimensions/schema.ts` | No change — already sets `suggestedToolCallArgs: { recommendedType: expectedType }` | No change |
| `src/audit/dimensions/faq.ts` | No useful audit data to seed; no change | No change |
| `src/audit/dimensions/markdown.ts` | No AccumulatedContext-mapped data to seed; no change | No change |
| `src/tools/index.ts` | (1) Add `import type { SuggestedToolCall }` from audit/types; (2) Add `dispatchTable` const replacing `switch`; (3) Add pre-seeding block in gap-fill loop; (4) Optionally tighten `TOOL_FIELD_MAP` key type | ~20 lines net change |

---

## Open Questions

1. **Should `TOOL_FIELD_MAP` be tightened to `Record<SuggestedToolCall, ...>`?**
   - What we know: Currently `Record<string, ...>`. Tightening adds compile-time completeness enforcement.
   - What's unclear: Whether removing the `!TOOL_FIELD_MAP[toolName]` guard in the gap-fill loop is safe (it is, since all SuggestedToolCall values are present keys).
   - Recommendation: Tighten to `Record<SuggestedToolCall, ...>` and remove the `TOOL_FIELD_MAP[toolName]` guard. Makes both the gap-fill and dispatch loops symmetrically typed.

2. **Should `missingBots` from `robots-ai` enrich the gap-fill prompt message?**
   - What we know: `configure_robots_txt` gap-fill asks only for `robotsPath` (required) and `sitemapUrl` (optional). Displaying which bots are missing would improve UX.
   - What's unclear: The gap-fill prompt message is currently a fixed string per finding dimension/severity.
   - Recommendation: If adding `suggestedToolCallArgs: { missingBots: missing }` to robots findings, update the gap-fill loop to incorporate it in the `message` field of the elicitation call. This is a small UX improvement within WIZ-02 scope.

3. **Should `target` be seeded into `suggestedToolCallArgs` for `llms-txt` findings?**
   - What we know: The `generate_llms_txt` wizard case uses `acc.outputPath` (user-supplied) and `buildLlmsTxt(acc as BusinessContext)`. The `target` URL from the outer closure is not needed inside the case handler.
   - What's unclear: Whether a default `outputPath` hint could be derived from `target` (e.g., strip the protocol, compute a local path guess). This is speculative UX work.
   - Recommendation: Do not seed `target` in `suggestedToolCallArgs` for `llms-txt`. Keep the scope minimal for v1.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `src/audit/types.ts`, `src/audit/dimensions/*.ts`, `src/tools/index.ts`
- TypeScript Handbook: string literal union types and `Record<K, V>` exhaustiveness — core language feature, stable across all TS 4.x and 5.x

### Secondary (MEDIUM confidence)
- TypeScript `strict: true` + `module: Node16` configuration verified from `tsconfig.json`
- `tsc --noEmit` baseline: zero errors confirmed by direct run

### Tertiary (LOW confidence)
- None — all findings are from direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Current codebase state: HIGH — directly read every relevant file
- TypeScript union/Record pattern: HIGH — core language feature, stable
- Accumulator seeding logic: HIGH — all code paths directly inspected
- Scope of changes: HIGH — all affected files identified with line-level precision

**Research date:** 2026-04-21
**Valid until:** Stable — no external dependencies; valid as long as codebase structure holds
