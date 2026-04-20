# Phase 8: Issue Selection — Research

**Researched:** 2026-04-20
**Domain:** MCP SDK elicitation (multi-select), audit output structure, wizard pipeline
**Confidence:** HIGH

---

## Summary

Phase 8 replaces the Phase 7 stub `if (useWizard)` return block in `src/tools/index.ts` with a real issue-selection elicitation step. The user sees every audit finding as a multi-select checklist, deselects issues they want to skip, and submits — after which the wizard can proceed to Phase 9 (fix generation).

The MCP SDK's `elicitInput` API supports multi-select checkbox fields natively via `type: 'array'` with `items.anyOf` (titled) or `items.enum` (untitled). This is documented in `ElicitRequestFormParamsSchema` and `TitledMultiSelectEnumSchemaSchema` in the installed SDK source. The `ElicitResult.content` value for an array field is `string[]`, accessible as `(result.content?.selectedIssues as string[])`. No new dependencies or transport changes are required.

The audit engine produces `AuditReport.findings: AuditFinding[]` where each finding has `dimension`, `status`, `severity`, `message`, and optional `suggestedToolCall`. Phase 8 must filter findings to only `fail` and `warning` statuses (passing issues need no fix), build a `{ const, title }` array from those findings, dynamically construct the `requestedSchema`, present all as selected by default via the `default` array, and then pass the confirmed selection forward as the input to Phase 9.

The critical structural constraint is that `requestedSchema.properties` only allows flat (no nesting) `PrimitiveSchemaDefinitionSchema` fields. Multi-select is a single flat property of `type: 'array'`. The Phase 7 wizard envelope `{marker, report, businessContext}` is available in the handler closure at the point Phase 8 takes over — no re-running the audit is needed.

**Primary recommendation:** Use a single `type: 'array'` multi-select field named `selectedIssues` with `TitledMultiSelectEnumSchemaSchema` shape (items.anyOf). Encode each issue as a stable string key derived from `dimension + ':' + status` (e.g., `"llms-txt:fail"`). Default the entire list to all selectable issues. After selection, filter `report.findings` by the returned keys and pass the filtered findings array forward to Phase 9.

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 (already installed) | `Server.elicitInput()` with array multi-select | Official SDK; `TitledMultiSelectEnumSchemaSchema` is built in |
| `zod` | 3.25.76 (already installed) | Schema validation | Already used for all tool inputSchemas |

### No New Installs Required

Phase 8 is a pure control-flow change inside `src/tools/index.ts`. No additional packages needed.

---

## Architecture Patterns

### Existing Structure (only one file changes)

```
src/
├── tools/
│   └── index.ts     ← Only file modified in Phase 8
├── audit/
│   └── types.ts     ← AuditFinding/AuditReport types (read only, no changes)
└── index.ts         ← No changes
```

### Pattern 1: Multi-Select Checklist via elicitInput

**What:** Use `type: 'array'` with `items.anyOf` (titled multi-select) as the requestedSchema property type. Each checkable item is a `{ const, title }` object. The `default` array pre-selects all items.

**When to use:** When the user must choose a subset from a known list.

**SDK type reference (from `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` lines 1740-1753):**

```typescript
// TitledMultiSelectEnumSchemaSchema shape:
{
  type: 'array',
  title: string,          // optional — label shown above checkboxes
  description: string,    // optional
  minItems: number,       // optional
  maxItems: number,       // optional
  items: {
    anyOf: Array<{ const: string; title: string }>
  },
  default: string[]       // optional — pre-checked values
}
```

**Return value:** `result.content?.selectedIssues` is typed as `string | number | boolean | string[]` in the SDK. For an array field, it will be `string[]` when action === 'accept'. Cast to `string[]`.

**Example — issue selection elicitation:**

```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js
// TitledMultiSelectEnumSchemaSchema confirmed from lines 1740-1753

// Inside the audit_ai_seo handler, after useWizard === true:

// 1. Filter findings to only actionable issues (fail + warning)
const actionableFindings = report.findings.filter(
  (f) => f.status === 'fail' || f.status === 'warning'
);

// 2. Build stable keys and titles
const issueItems = actionableFindings.map((f) => ({
  const: `${f.dimension}:${f.status}`,   // e.g. "llms-txt:fail"
  title: `[${f.severity.toUpperCase()}] ${f.dimension} — ${f.message}`,
}));

// 3. All issues pre-selected by default (ISEL-02)
const allKeys = issueItems.map((i) => i.const);

// 4. Elicit (empty selection guard: minItems not set, handled post-elicit)
if (issueItems.length === 0) {
  return {
    content: [{ type: 'text' as const, text: 'Audit found no issues to fix. All dimensions are passing.' }],
  };
}

const selectionResult = await server.server.elicitInput({
  mode: 'form',
  message: 'Select the issues to fix. All issues are selected by default — deselect any you want to skip.',
  requestedSchema: {
    type: 'object',
    properties: {
      selectedIssues: {
        type: 'array',
        title: 'Issues to fix',
        items: { anyOf: issueItems },
        default: allKeys,
      },
    },
    required: ['selectedIssues'],
  },
});

// 5. Handle decline/cancel
if (selectionResult.action !== 'accept') {
  return {
    content: [{ type: 'text' as const, text: 'Issue selection cancelled.' }],
  };
}

// 6. Handle empty selection (ISEL-03 / success criterion 4)
const selectedKeys = (selectionResult.content?.selectedIssues ?? []) as string[];
if (selectedKeys.length === 0) {
  return {
    content: [{ type: 'text' as const, text: 'No issues selected. Nothing to fix.' }],
  };
}

// 7. Filter findings to selected keys
const selectedFindings = actionableFindings.filter(
  (f) => selectedKeys.includes(`${f.dimension}:${f.status}`)
);

// 8. Return confirmation envelope for Phase 9
return {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      marker: '[wizard] Issue selection complete — fix generation lands in Phase 9',
      selectedFindings,
      businessContext: businessContext ?? null,
    }, null, 2),
  }],
};
```

### Pattern 2: Key Stability — Dimension + Status Composite

**What:** Each `AuditFinding` is uniquely identified by `dimension + ':' + status`. Since there is exactly one finding per dimension (5 dimensions total, one finding each), this is always unique.

**Why:** The `const` value in the multi-select form must be a stable string that can be matched back to the original finding after the user submits. Using `dimension:status` avoids index-based fragility (e.g., if sorting changes) and is human-readable in client logs.

**Caveat:** If future audit versions emit multiple findings per dimension, a tiebreaker (e.g., array index) would be needed. For v1, one finding per dimension is guaranteed by the current `Promise.all([...5 checks...])` structure.

### Pattern 3: Pre-selecting All Issues (ISEL-02)

**What:** Pass `default: allKeys` in the schema. The MCP client renders all checkboxes pre-checked. The user only deselects to exclude.

**SDK support:** `TitledMultiSelectEnumSchemaSchema.default` is `z.array(z.string()).optional()`. Pass the complete list of `const` values to satisfy ISEL-02.

### Pattern 4: Empty-Selection Guard (Success Criterion 4)

**What:** After the user submits, check `selectedKeys.length === 0`. Return a clear message without proceeding.

**Why it needs an explicit check:** The SDK does not enforce `minItems` in the form UI — the user can deselect everything. The schema-level `minItems` field exists in `UntitledMultiSelectEnumSchemaSchema` but even with it set the validation is on the SDK server side post-submit. An explicit code-level check is simpler and more readable.

### Anti-Patterns to Avoid

- **Showing pass findings in the checklist:** Including `status === 'pass'` items gives the user nothing to act on and adds confusion. Filter to `fail` and `warning` only.
- **Using index-based keys (e.g., `"issue_0"`):** Fragile if findings are reordered. Use `dimension:status` composite keys.
- **Calling elicitInput twice (once for mode fork, once for issue selection) in the same handler invocation:** This is fine — the SDK supports sequential elicitation calls in one tool handler. Phase 7 already does one call; Phase 8 adds a second. Each call is independent.
- **Not handling `action === 'decline'` and `action === 'cancel'` separately from `action === 'accept'`:** Both non-accept actions should return a graceful cancellation message.
- **Assuming `result.content.selectedIssues` is always `string[]`:** The SDK types `content` as `Record<string, string | number | boolean | string[]>`. Always cast explicitly and guard against `undefined`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-select checklist UI | Custom stringified list with parsing logic | `type: 'array'` with `items.anyOf` in `requestedSchema` | SDK handles rendering, submission, and content parsing |
| Issue ordering/priority | Custom sort | Rely on `runAudit()` which already sorts by severity (critical→high→medium→low) | Sort is already done in `audit/index.ts` |
| Unique issue keys | UUID or hash | `dimension:status` composite string | Stable, readable, and sufficient for v1 (1 finding per dimension) |

---

## Common Pitfalls

### Pitfall 1: Forgetting to filter pass findings

**What goes wrong:** All 5 findings (including pass findings) appear in the checklist. The user sees "pass" items as things to fix, which is confusing and incorrect.

**Why it happens:** Copying all `report.findings` without filtering by status.

**How to avoid:** `report.findings.filter(f => f.status === 'fail' || f.status === 'warning')` before building `issueItems`.

**Warning signs:** Checklist shows items like `[LOW] llms-txt — llms.txt found at site root` — passing items appearing as fixable.

### Pitfall 2: Type mismatch — content.selectedIssues is not string[]

**What goes wrong:** TypeScript error or runtime crash when accessing `result.content.selectedIssues` as `string[]`.

**Why it happens:** `ElicitResult.content` is typed as `Record<string, string | number | boolean | string[]> | undefined`. TypeScript does not know which union member applies to a given key.

**How to avoid:** Use explicit cast: `const selectedKeys = (selectionResult.content?.selectedIssues ?? []) as string[]`. Guard against `undefined` with `?? []`.

**Warning signs:** TypeScript reports `Type 'string | number | boolean | string[] | undefined' is not assignable to type 'string[]'`.

### Pitfall 3: Nested requestedSchema is rejected by the SDK

**What goes wrong:** Runtime `McpError: Invalid params` when the requestedSchema contains nested objects (e.g., a property that is itself an object with sub-properties).

**Why it happens:** `ElicitRequestFormParamsSchema` spec says "Only top-level properties are allowed, without nesting." The `properties` record only accepts `PrimitiveSchemaDefinitionSchema` values (string, number, boolean, or the enum/array union). No nested `type: 'object'` is allowed.

**How to avoid:** Keep the schema flat. Phase 8 uses a single `type: 'array'` property for all issue selections — this is flat. Do not add nested objects for issue metadata.

**Warning signs:** Error during `elicitInput` call at runtime; TypeScript may not catch this because the SDK typing allows `z.record(z.string(), PrimitiveSchemaDefinitionSchema)` but the validator enforces flatness.

### Pitfall 4: Empty actionableFindings before calling elicitInput

**What goes wrong:** `issueItems.length === 0`, leading to an empty `items.anyOf: []` in the schema. The SDK or client may reject an empty multi-select.

**Why it happens:** The audited site has no failing or warning issues — all 5 dimensions pass.

**How to avoid:** Check `if (actionableFindings.length === 0)` before constructing the schema and return a success message instead of calling `elicitInput`.

**Warning signs:** All-pass audit (happy path) causes the wizard to fail with a schema error.

### Pitfall 5: Sequential elicitations within one tool invocation

**What goes wrong:** Concern that calling `elicitInput` twice (Phase 7's mode fork + Phase 8's issue selection) in one handler is unsupported.

**Why it doesn't happen:** The SDK allows sequential `elicitInput` calls. Each call is an independent `elicitation/create` JSON-RPC round-trip. The Phase 7 smoke test uses one call; Phase 8 will add a second. This is fine.

**Warning signs:** None — this is a non-issue, but worth documenting to avoid unnecessary refactoring.

---

## Code Examples

### Full Phase 8 wizard block (replaces Phase 7 stub)

```typescript
// Source: Derived from TitledMultiSelectEnumSchemaSchema in
// node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js (lines 1740-1753)
// and ElicitResultSchema (line 1848-1863)

// This block replaces the Phase 7 stub starting at "Wizard path — Phase 7 stub"
// in src/tools/index.ts (currently ~lines 111-120).

// Available in scope: report (AuditReport), businessContext (BusinessContext | undefined)

// Step 1: filter to actionable findings
const actionableFindings = report.findings.filter(
  (f) => f.status === 'fail' || f.status === 'warning',
);

// Step 2: guard empty (all-pass audit)
if (actionableFindings.length === 0) {
  return {
    content: [{
      type: 'text' as const,
      text: 'Great news — the audit found no issues to fix. All 5 dimensions are passing.',
    }],
  };
}

// Step 3: build items array for multi-select
const issueItems = actionableFindings.map((f) => ({
  const: `${f.dimension}:${f.status}`,
  title: `[${f.severity.toUpperCase()}] ${f.dimension} — ${f.message}`,
}));

// Step 4: present checklist (all pre-selected per ISEL-02)
const selectionResult = await server.server.elicitInput({
  mode: 'form',
  message: 'Select the issues you want to fix. All issues are selected by default — deselect any you want to skip.',
  requestedSchema: {
    type: 'object',
    properties: {
      selectedIssues: {
        type: 'array',
        title: 'Issues to fix',
        items: { anyOf: issueItems },
        default: issueItems.map((i) => i.const),
      },
    },
    required: ['selectedIssues'],
  },
});

// Step 5: handle cancel/decline
if (selectionResult.action !== 'accept') {
  return {
    content: [{ type: 'text' as const, text: 'Issue selection cancelled. No fixes will be applied.' }],
  };
}

// Step 6: handle empty selection (success criterion 4)
const selectedKeys = (selectionResult.content?.selectedIssues ?? []) as string[];
if (selectedKeys.length === 0) {
  return {
    content: [{ type: 'text' as const, text: 'No issues selected. Exiting wizard without applying fixes.' }],
  };
}

// Step 7: filter findings to selected keys
const selectedFindings = actionableFindings.filter(
  (f) => selectedKeys.includes(`${f.dimension}:${f.status}`),
);

// Step 8: confirm and hand off to Phase 9
return {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      marker: '[wizard] Issue selection complete — fix generation lands in Phase 9',
      selectedFindings,
      businessContext: businessContext ?? null,
    }, null, 2),
  }],
};
```

### AuditFinding shape (from src/audit/types.ts)

```typescript
// Source: src/audit/types.ts
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type AuditDimension = 'llms-txt' | 'schema' | 'robots-ai' | 'faq' | 'markdown-mirrors';

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;  // present on fail/warning findings
}
```

### Phase 7 wizard envelope shape (from src/tools/index.ts + 07-01-SUMMARY.md)

```typescript
// The Phase 7 stub returns this JSON envelope; Phase 8 receives it via the
// handler closure (report and businessContext are local variables, not parsed
// from a return value — Phase 8 replaces the stub in-place).
{
  marker: '[wizard] Phase 7 stub — issue selection lands in Phase 8',
  report: {
    target: string,
    generatedAt: string,  // ISO 8601
    findings: AuditFinding[]  // sorted by severity: critical→high→medium→low
  },
  businessContext: BusinessContext | null
}
```

### Phase 8 output envelope shape (for Phase 9 consumption)

```typescript
// Phase 8 returns this envelope when the user accepts a non-empty selection.
// Phase 9 will receive selectedFindings + businessContext from this.
{
  marker: '[wizard] Issue selection complete — fix generation lands in Phase 9',
  selectedFindings: AuditFinding[],  // subset of report.findings the user chose
  businessContext: BusinessContext | null
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wizard stub — always returns full report in wizard envelope | Filtered issue selection — user picks a subset | Phase 8 | Enables targeted fix generation in Phase 9 |
| Single elicitation call (mode fork) | Two sequential elicitation calls (fork + selection) | Phase 8 | Same handler, second `elicitInput` call |

---

## Open Questions

1. **Should pass findings be excluded silently, or mentioned in the message?**
   - What we know: ISEL-01 says "all audit issues as a named, selectable item with its severity/priority visible." "Issues" in context means problems (fail/warning), not passing checks.
   - What's unclear: Whether the user benefits from seeing "3 of 5 dimensions pass" before the checklist.
   - Recommendation: Include a count in the `message` string (e.g., `"2 of 5 dimensions have issues. Select which to fix."`). Easy to add, improves UX without changing schema structure.

2. **Key uniqueness if a dimension can have multiple findings in a future version**
   - What we know: Current `runAudit()` returns exactly one `AuditFinding` per dimension via `Promise.all([...5 checks...])`. `dimension:status` composite key is unique.
   - What's unclear: Future phases may extend the audit engine. If a dimension emits `fail` AND `warning`, the composite key would collide.
   - Recommendation: For Phase 8 / v1, `dimension:status` is safe. Document the assumption; add a tiebreaker index if the audit engine ever emits multiple findings per dimension.

3. **What happens if the client supports form elicitation for the mode fork but then disconnects before the second elicitation?**
   - What we know: The outer `try/catch` in the Phase 7 handler catches `runAudit()` errors. The inner `try/catch` catches elicitation errors for the mode fork. Phase 8's second `elicitInput` call is NOT in a try/catch in the current stub.
   - What's unclear: Whether the second elicitation call needs its own try/catch or whether it is safe to let errors propagate to the outer handler catch.
   - Recommendation: Let Phase 8's `selectionResult = await server.server.elicitInput(...)` throw on error; the outer `catch(err)` will handle it and return `isError: true`. No extra try/catch needed for the selection call — it's a different error class than the capability check.

---

## Sources

### Primary (HIGH confidence)

- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` lines 1740-1757 — `TitledMultiSelectEnumSchemaSchema`, `UntitledMultiSelectEnumSchemaSchema`, `MultiSelectEnumSchemaSchema` confirmed
- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` lines 1848-1863 — `ElicitResultSchema` content type confirmed as `Record<string, string | number | boolean | string[]>`
- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js` lines 354-388 — `elicitInput` implementation, form capability check at line 365
- Project source: `src/audit/types.ts` — `AuditFinding`, `AuditReport`, `Severity`, `AuditDimension` types
- Project source: `src/audit/index.ts` — `runAudit()` returns exactly one finding per dimension, sorted by severity
- Project source: `src/tools/index.ts` (current) — Phase 7 wizard stub location confirmed (~lines 111-120); `server` variable available in closure
- Project source: `.planning/phases/07-wizard-entry-point/07-01-SUMMARY.md` — handoff contract: Phase 8 starts in the `if (useWizard)` branch; `report` and `businessContext` are local variables in scope

### Secondary (MEDIUM confidence)

- Phase 7 RESEARCH.md `## Code Examples` — confirmed `ElicitResult` structure and property type documentation matches installed SDK source; cross-verified

---

## Metadata

**Confidence breakdown:**
- Multi-select schema shape: HIGH — confirmed from installed SDK source (`TitledMultiSelectEnumSchemaSchema` and `UntitledMultiSelectEnumSchemaSchema`)
- ElicitResult.content array handling: HIGH — confirmed from `ElicitResultSchema` in types.js line 1862
- Audit finding structure: HIGH — direct inspection of `src/audit/types.ts` and all 5 dimension files
- Phase 7 handoff location and variable scope: HIGH — direct inspection of `src/tools/index.ts` and `07-01-SUMMARY.md`
- Key uniqueness assumption (1 finding per dimension): HIGH for v1 — confirmed by `Promise.all([5 checks])` structure in `runAudit()`

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (SDK elicitation API is stable; audit structure is project-internal)
