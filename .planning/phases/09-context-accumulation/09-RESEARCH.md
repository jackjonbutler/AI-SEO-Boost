# Phase 9: Context Accumulation — Research

**Researched:** 2026-04-20
**Domain:** In-handler state accumulation, MCP elicitation field-by-field gathering, tool-to-field mapping
**Confidence:** HIGH

---

## Summary

Phase 9 replaces the final `return` inside the `if (useWizard)` branch of `audit_ai_seo` in `src/tools/index.ts`. The Phase 8 return value — a JSON envelope `{marker, selectedFindings, businessContext}` — is currently the terminal output. Phase 9 replaces that `return` with a context accumulator loop that iterates over `selectedFindings`, determines what each fixing tool needs, merges what is already known, elicits only the missing fields, accumulates them, and returns a fully-populated context object that Phase 10 will use to fire each fix tool.

Phase 9's implementation is pure JavaScript/TypeScript logic inside the existing `audit_ai_seo` handler. No new files, no new npm packages. The key pattern is an **accumulator object** — a mutable `Partial<BusinessContext>` plus a separate bag for tool-specific non-context fields (e.g., `outputPath`, `robotsPath`) — that grows as the user answers questions. Each finding is checked against the accumulator; only fields that are still `undefined` and required by that tool are presented via `elicitInput`. After the loop, Phase 10 can fire each tool with a complete, merged input set.

Phase 9 does NOT fire the tools itself — that is Phase 10's responsibility. Phase 9 ends by returning a Phase 9 envelope containing the accumulated context and any tool-specific fields collected mid-wizard, confirming to the user what was gathered and that fixes are ready to apply.

**Primary recommendation:** Use a single mutable `accumulatedContext` object (`Partial<BusinessContext & WizardToolFields>`) grown by merging initial `businessContext` and then each `elicitInput` response. A static `TOOL_FIELD_MAP` (compile-time constant in the file) maps each `suggestedToolCall` to the exact fields it needs, split into required and optional lists. This drives the gap-fill loop without any dynamic introspection.

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 (installed) | `server.server.elicitInput()` for field gathering | Already used in Phases 7 and 8 |
| `zod` | 3.x (installed) | Reuse `businessContextSchema` for type checking | Already at module scope in tools/index.ts |
| TypeScript built-ins | — | `Partial<T>`, type narrowing, `Object.assign` | No extra library needed for merging |

### No New Installs Required

Phase 9 is entirely in-process logic inside `src/tools/index.ts`. No additional packages.

---

## Architecture Patterns

### Existing Structure (only one file changes)

```
src/
├── tools/
│   └── index.ts     ← Only file modified in Phase 9
│                       (replaces final return in if(useWizard) branch)
└── types/
    └── index.ts     ← BusinessContext interface (read only, no changes)
```

### Pattern 1: Static Tool-to-Field Map (TOOL_FIELD_MAP)

**What:** A compile-time constant mapping each `suggestedToolCall` string to the exact fields that tool requires. Kept in module scope near `businessContextSchema`.

**When to use:** Whenever Phase 9 needs to know what fields a fixing tool needs.

**Why static:** Avoids runtime introspection of registered tool schemas. All 5 fixing tools have stable, known schemas that will not change within v1.1. The map is a single source of truth — easy to audit, easy for Phase 10 to extend.

**Dimension → tool → fields mapping (derived from `src/tools/index.ts` inputSchemas):**

| Dimension | suggestedToolCall | businessContext fields required | businessContext fields optional | tool-specific required | tool-specific optional |
|-----------|------------------|---------------------------------|----------------------------------|------------------------|------------------------|
| `llms-txt` | `generate_llms_txt` | `businessName`, `businessType` | `location`, `services`, `website`, `phoneNumber`, `description` | `outputPath` | — |
| `robots-ai` | `configure_robots_txt` | — | — | `robotsPath` | `sitemapUrl` |
| `schema` | `generate_schema_markup` | `businessName`, `businessType` | `location`, `services`, `website`, `phoneNumber`, `description` | `schemaTypes` | `faqs` |
| `faq` | `generate_faq_content` | `businessName`, `businessType` | `location`, `services`, `website`, `phoneNumber`, `description` | — | `count` |
| `markdown-mirrors` | `generate_markdown_mirrors` | — | — | `outputDir` | — |

Note: `configure_robots_txt` and `generate_markdown_mirrors` need NO businessContext fields — only file path fields. `generate_schema_markup` also needs `schemaTypes` (a string array), which is not part of `BusinessContext` and must be gathered separately.

**Warning case:** `AuditFinding.suggestedToolCall` is typed as `string | undefined`. Findings with `status === 'warning'` may have a `suggestedToolCall` (see faq.ts, schema.ts) or may not (see llms-txt.ts warning cases). Phase 9 must guard against `suggestedToolCall === undefined` — skip those findings since no tool can be invoked for them.

**Example map structure (TypeScript):**

```typescript
// Source: derived from src/tools/index.ts inputSchemas + src/audit/dimensions/*
// Place at module scope near businessContextSchema

type WizardToolFields = {
  outputPath?: string;       // generate_llms_txt
  robotsPath?: string;       // configure_robots_txt
  sitemapUrl?: string;       // configure_robots_txt (optional)
  schemaTypes?: string[];    // generate_schema_markup
  outputDir?: string;        // generate_markdown_mirrors
};

type AccumulatedContext = Partial<BusinessContext> & WizardToolFields;

const TOOL_FIELD_MAP: Record<string, {
  contextRequired: (keyof BusinessContext)[];
  contextOptional: (keyof BusinessContext)[];
  toolRequired: (keyof WizardToolFields)[];
  toolOptional: (keyof WizardToolFields)[];
}> = {
  generate_llms_txt: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['outputPath'],
    toolOptional: [],
  },
  configure_robots_txt: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['robotsPath'],
    toolOptional: ['sitemapUrl'],
  },
  generate_schema_markup: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['schemaTypes'],
    toolOptional: [],
  },
  generate_faq_content: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: [],
    toolOptional: [],
  },
  generate_markdown_mirrors: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['outputDir'],
    toolOptional: [],
  },
};
```

### Pattern 2: Accumulator Merge Strategy

**What:** Initialize `accumulatedContext` from the Phase 8 `businessContext` (if non-null). Then, for each finding with a `suggestedToolCall`, compute the set of required fields not yet in `accumulatedContext`. If any are missing, call `elicitInput` with a schema containing only those fields. Merge the response into `accumulatedContext`.

**Merge order:**
1. Seed: `const acc: AccumulatedContext = { ...businessContext ?? {} }`
2. For each finding (in `selectedFindings` order, which is already severity-sorted):
   a. Look up `TOOL_FIELD_MAP[finding.suggestedToolCall]`
   b. Check required fields against `acc` — find gaps
   c. If gaps exist, call `elicitInput` with only the gap fields
   d. Merge response into `acc`: `Object.assign(acc, result.content)`
3. After loop: return Phase 9 envelope

**Key insight:** Because `selectedFindings` is sorted by severity (critical → high → medium → low), the most important tool's required fields will be asked first. If `generate_llms_txt` (critical) asks for `businessName` and `businessType`, `generate_schema_markup` (high) will find those already in `acc` and ask nothing for them.

**Schema constraint:** `elicitInput` `requestedSchema.properties` only accepts flat `PrimitiveSchemaDefinitionSchema` values (string, number, boolean, single-select, multi-select). This is already understood from Phase 8 research.

- `businessName`, `businessType`, `location`, `website`, `phoneNumber`, `description`, `outputPath`, `robotsPath`, `sitemapUrl`, `outputDir` → all `type: 'string'` — fits cleanly
- `services` → `type: 'array'` with `items.enum` — this is `UntitledMultiSelectEnumSchemaSchema` shape BUT requires knowing the services list upfront. For Phase 9, gather `services` as a free-text comma-separated string and split into array before passing to the tool. OR ask for it as a string field with the description "comma-separated list of services". This avoids the enum-options-upfront problem.
- `schemaTypes` → a required array for `generate_schema_markup`. Use multi-select with the known options: `LocalBusiness`, `FAQPage`, `Service`. These are fixed enum values.

**`services` field approach (HIGH confidence):** Gather as `type: 'string'` with description `"Comma-separated list of services (e.g. 'Vehicle wraps, Fleet graphics, Window tinting')"`. Split on comma after receipt. This is simpler than building an open-ended multi-select and fits the flat-schema constraint.

### Pattern 3: elicitInput for Context Gap-Fill

**What:** For each gap-fill call, build a `requestedSchema` that contains only the missing required fields for that tool. Keep it flat — one property per field, all `type: 'string'` (or multi-select for `schemaTypes`).

**When to use:** Once per tool that has missing required fields after the accumulator is checked.

**SDK constraint (confirmed from installed source):**
- `ElicitRequestFormParamsSchema.requestedSchema.properties` is `z.record(z.string(), PrimitiveSchemaDefinitionSchema)`
- `PrimitiveSchemaDefinitionSchema` is `union([EnumSchema, BooleanSchema, StringSchema, NumberSchema])`
- `StringSchemaSchema` supports `title`, `description`, `minLength`, `maxLength`, `format`, `default`
- No nested objects — all gap-fill fields must be top-level string/number/boolean/enum properties

**Example gap-fill elicitation (businessContext fields missing):**

```typescript
// Source: confirmed from installed SDK node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js
// StringSchemaSchema at line 1665, ElicitRequestFormParamsSchema at line 1767

const gapResult = await server.server.elicitInput({
  mode: 'form',
  message: `To fix "${finding.dimension}", I need a few business details:`,
  requestedSchema: {
    type: 'object',
    properties: {
      // Only include fields missing from acc:
      ...(acc.businessName === undefined ? {
        businessName: {
          type: 'string' as const,
          title: 'Business name',
          description: 'Your business name as it should appear in generated files',
        }
      } : {}),
      ...(acc.businessType === undefined ? {
        businessType: {
          type: 'string' as const,
          title: 'Business type',
          description: "Type of business (e.g. 'vehicle wrap shop', 'law firm')",
        }
      } : {}),
      // ... other missing fields
    },
    required: missingRequiredFields,
  },
});

if (gapResult.action !== 'accept') {
  // User cancelled gap-fill — skip this tool
  continue;
}
Object.assign(acc, gapResult.content);
```

**`schemaTypes` multi-select approach:**

```typescript
// For generate_schema_markup: acc.schemaTypes is missing
// Use TitledMultiSelectEnumSchemaSchema (known from Phase 8)
{
  schemaTypes: {
    type: 'array' as const,
    title: 'Schema types to generate',
    items: {
      anyOf: [
        { const: 'LocalBusiness', title: 'LocalBusiness (recommended)' },
        { const: 'FAQPage', title: 'FAQPage' },
        { const: 'Service', title: 'Service' },
      ],
    },
    default: ['LocalBusiness'],
  }
}
```

### Pattern 4: Phase 9 Return Envelope (for Phase 10)

**What:** After the accumulator loop completes, Phase 9 returns a JSON envelope containing:
- `marker`: a Phase 9 marker string
- `selectedFindings`: the same array from Phase 8 (unchanged)
- `accumulatedContext`: the fully-merged `AccumulatedContext` object
- A human-readable running summary of what was gathered

**Phase 10 input contract:**

```typescript
{
  marker: '[wizard] Context accumulation complete — tool execution lands in Phase 10',
  selectedFindings: AuditFinding[],  // from Phase 8, unchanged
  accumulatedContext: {
    // BusinessContext fields (all optional at this type level):
    businessName?: string;
    businessType?: string;
    location?: string;
    services?: string[];
    website?: string;
    phoneNumber?: string;
    description?: string;
    // Tool-specific fields:
    outputPath?: string;       // for generate_llms_txt
    robotsPath?: string;       // for configure_robots_txt
    sitemapUrl?: string;       // for configure_robots_txt
    schemaTypes?: string[];    // for generate_schema_markup
    outputDir?: string;        // for generate_markdown_mirrors
  },
  contextSummary: string;   // human-readable "what we know" (success criterion 4)
}
```

**contextSummary (CTX-03 / success criterion 4):** Build as a bullet list string of all non-undefined fields in `acc`. Example:

```
Context gathered:
- businessName: Acme Wraps
- businessType: vehicle wrap shop
- outputPath: /home/user/site/llms.txt
- robotsPath: /home/user/site/robots.txt
```

This satisfies success criterion 4: "The accumulated context state is visible/traceable."

### Pattern 5: Handling tools without `suggestedToolCall`

**What:** Some `AuditFinding` entries may have no `suggestedToolCall` (e.g., warning findings for "Could not reach URL"). These have no corresponding fix tool.

**How to handle:** In the accumulator loop, `if (!finding.suggestedToolCall || !TOOL_FIELD_MAP[finding.suggestedToolCall]) { continue; }`. Skip unknown/missing tool calls silently. Phase 10 will also need this guard.

### Anti-Patterns to Avoid

- **Asking for optional context fields upfront:** Only ask for required fields. Optional fields (location, services, etc.) should only be asked if the tool specifically needs them for its required output. In v1.1, treat optional context fields as truly optional — don't ask for them if the tool can function without them. `generate_faq_content` and `generate_llms_txt` work with only `businessName` + `businessType`.

- **Re-asking a field that was gathered 2 findings ago:** Always check `acc` before building the elicitation schema. The check `acc.businessName !== undefined` must happen per-tool, not once globally.

- **Building a single giant elicitation with all fields for all tools:** This defeats the purpose of context accumulation and overwhelms users. Ask per-tool, per-gap.

- **Treating `services` as a string array in the elicitation schema:** The SDK's flat schema doesn't support open-ended arrays of strings. Gather as a comma-separated string, split after receipt.

- **Mutating `selectedFindings`:** The array from Phase 8 should be passed through to Phase 10 unchanged. The accumulator only modifies `acc`, not the findings.

- **Adding a try/catch around each individual `elicitInput` call:** Per Phase 8 decision, elicitation errors propagate to the outer `catch(err)` in the handler. Consistent with Phase 8, do not wrap individual gap-fill calls in try/catch. If a call fails (e.g., user disconnects mid-wizard), the outer catch returns `isError: true` with the error message.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context merge/accumulation | Redux-style state machine, event bus, external store | Plain `Object.assign(acc, result.content)` in-handler | The entire wizard is a single tool invocation — no cross-invocation state needed; plain object merge is sufficient |
| Field validation after elicitation | Re-parsing with Zod, throwing on empty strings | Trust the SDK's `required` enforcement + simple truthiness checks | `elicitInput` with `required: ['fieldName']` prevents empty submission at the UX layer; add a simple `if (!acc.businessName)` guard only for critical fields |
| Dynamic field requirement discovery | Introspecting registered tool inputSchemas at runtime | `TOOL_FIELD_MAP` static constant | All 5 fixing tools are known at compile time; static map is simpler, more readable, and easier to extend in Phase 10 |
| `services` as array elicitation | Open-ended string array input form | Comma-separated string → `split(',').map(s => s.trim())` | SDK flat schema cannot express open-ended string arrays; comma-split is conventional UX |

---

## Common Pitfalls

### Pitfall 1: Asking for the same field twice (accumulator not checked)

**What goes wrong:** User is asked for `businessName` twice — once for `generate_llms_txt` and again for `generate_schema_markup`.

**Why it happens:** The gap-fill check builds the schema from the TOOL_FIELD_MAP without consulting `acc`.

**How to avoid:** Always compute `const missingRequired = requiredFields.filter(f => acc[f] === undefined)` before building the elicitation schema. If `missingRequired.length === 0`, skip the elicitation call entirely for that tool.

**Warning signs:** The smoke test scenario that provides `businessContext` upfront should never trigger a gap-fill elicitation — if it does, the accumulator check is missing.

### Pitfall 2: `services` field type mismatch

**What goes wrong:** Phase 9 stores `services` as a string (`"wrap, graphics"`) in `acc`, then passes `acc` as `BusinessContext` to a tool that expects `services: string[]`. The tool receives a string instead of an array.

**Why it happens:** `elicitInput` returns `content` typed as `Record<string, string | number | boolean | string[]>`. A comma-separated `type: 'string'` field returns as a string. If Phase 9 does `Object.assign(acc, result.content)` directly, `acc.services` becomes a string.

**How to avoid:** After merging the elicitation response, post-process `services`: `if (typeof acc.services === 'string') { acc.services = acc.services.split(',').map(s => s.trim()).filter(Boolean); }`.

**Warning signs:** TypeScript may not catch this at compile time because `AccumulatedContext` has `services?: string[]` but `Object.assign` from the elicitation content is untyped.

### Pitfall 3: `schemaTypes` accepted but not cast to `string[]`

**What goes wrong:** `acc.schemaTypes` is returned from the multi-select elicitation as `string[]` (correct), but TypeScript's union type for `ElicitResult.content` values includes `string | number | boolean | string[]`. An explicit cast is needed.

**Why it happens:** Same as Phase 8 Pitfall 2 — `ElicitResult.content` values are all unioned.

**How to avoid:** `acc.schemaTypes = (result.content?.schemaTypes ?? ['LocalBusiness']) as string[];`

### Pitfall 4: Skipping tools with no `suggestedToolCall`

**What goes wrong:** Phase 9 crashes or behaves incorrectly when `finding.suggestedToolCall === undefined` (e.g., warning findings that have no associated tool, or findings that were already passing).

**Why it happens:** Not all `AuditFinding` values have `suggestedToolCall`. The field is typed `string | undefined`.

**How to avoid:** Guard at the start of the loop: `if (!finding.suggestedToolCall) continue;`. Also guard: `if (!TOOL_FIELD_MAP[finding.suggestedToolCall]) continue;` for unknown tool names.

### Pitfall 5: User cancels mid-wizard gap-fill

**What goes wrong:** User cancels the gap-fill elicitation for one tool (e.g., they don't want to provide `outputPath` for `generate_llms_txt`). If Phase 9 treats this as a hard abort, subsequent tools (that may not need any gap-fill) are also skipped.

**How to avoid:** Treat a cancel/decline on a gap-fill as "skip this specific tool" rather than "abort the entire wizard". Continue the loop for remaining findings. Mark the skipped finding so Phase 10 knows not to invoke that tool.

**Recommended approach:** Maintain a `skippedTools: string[]` array. When `gapResult.action !== 'accept'`, push the `finding.dimension` to `skippedTools` and `continue`. Include `skippedTools` in the Phase 9 envelope so Phase 10 can omit those tools.

**Warning signs:** If the smoke test for "cancel gap-fill" exits entirely instead of continuing to the next finding.

### Pitfall 6: `configure_robots_txt` needs `robotsPath`, not `businessContext`

**What goes wrong:** Phase 9 asks for `businessName` before processing the `robots-ai` finding, even though `configure_robots_txt` doesn't use `businessContext` at all.

**Why it happens:** A blanket "does this tool use businessContext?" check without consulting `TOOL_FIELD_MAP`.

**How to avoid:** Use `TOOL_FIELD_MAP[toolName].contextRequired` to determine whether any businessContext fields are needed for each specific tool. `configure_robots_txt` has `contextRequired: []`, so no businessContext gap-fill is triggered for it.

---

## Code Examples

### Full Phase 9 accumulator loop (replaces final return in if(useWizard) branch)

```typescript
// Source: derived from Phase 8 output contract + SDK StringSchemaSchema (line 1665)
// and TitledMultiSelectEnumSchemaSchema (line 1740) in installed SDK source

// Available in scope after Phase 8 issue-selection:
//   selectedFindings: AuditFinding[]  (from Phase 8 — already filtered/user-chosen)
//   businessContext: BusinessContext | undefined  (from audit_ai_seo input)

// Step 1: Seed accumulator from upfront businessContext (CTX-01)
const acc: AccumulatedContext = { ...businessContext ?? {} };
const skippedFindings: string[] = [];   // findings skipped due to user cancelling gap-fill

// Step 2: Loop over selected findings in severity order (already sorted by runAudit)
for (const finding of selectedFindings) {
  // Guard: findings without a known fixing tool are skipped silently
  const toolName = finding.suggestedToolCall;
  if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;

  const fieldSpec = TOOL_FIELD_MAP[toolName];

  // Compute which required fields are missing from acc
  const missingContextRequired = fieldSpec.contextRequired.filter(
    (f) => acc[f] === undefined,
  );
  const missingToolRequired = fieldSpec.toolRequired.filter(
    (f) => (acc as Record<string, unknown>)[f] === undefined,
  );
  const allMissing = [...missingContextRequired, ...missingToolRequired];

  // If all required fields are already present — no elicitation needed (CTX-01, CTX-03)
  if (allMissing.length === 0) continue;

  // Build the gap-fill elicitation schema for this tool's missing fields
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of allMissing) {
    required.push(field);
    switch (field) {
      case 'businessName':
        properties[field] = { type: 'string', title: 'Business name', description: 'Your business name as it should appear in generated files' };
        break;
      case 'businessType':
        properties[field] = { type: 'string', title: 'Business type', description: "Type of business (e.g. 'vehicle wrap shop', 'law firm')" };
        break;
      case 'location':
        properties[field] = { type: 'string', title: 'Location', description: "Primary service area (e.g. 'Denver, CO')" };
        break;
      case 'services':
        properties[field] = { type: 'string', title: 'Services', description: "Comma-separated list of services (e.g. 'Vehicle wraps, Fleet graphics')" };
        break;
      case 'website':
        properties[field] = { type: 'string', title: 'Website URL', description: "Your canonical website URL (e.g. 'https://example.com')" };
        break;
      case 'phoneNumber':
        properties[field] = { type: 'string', title: 'Phone number', description: 'Contact phone number' };
        break;
      case 'description':
        properties[field] = { type: 'string', title: 'Business description', description: '1-3 sentence description of your business' };
        break;
      case 'outputPath':
        properties[field] = { type: 'string', title: 'Output path for llms.txt', description: 'Absolute path where llms.txt should be written (e.g. /home/user/site/llms.txt)' };
        break;
      case 'robotsPath':
        properties[field] = { type: 'string', title: 'Path to robots.txt', description: 'Absolute path to robots.txt (will be created if missing)' };
        break;
      case 'sitemapUrl':
        properties[field] = { type: 'string', title: 'Sitemap URL (optional)', description: "Absolute URL to sitemap.xml (e.g. 'https://example.com/sitemap.xml')" };
        // Note: sitemapUrl is optional — don't add to required[]
        required.pop();
        break;
      case 'schemaTypes':
        properties[field] = {
          type: 'array',
          title: 'Schema types to generate',
          items: { anyOf: [
            { const: 'LocalBusiness', title: 'LocalBusiness (recommended)' },
            { const: 'FAQPage', title: 'FAQPage' },
            { const: 'Service', title: 'Service' },
          ]},
          default: ['LocalBusiness'],
        };
        break;
      case 'outputDir':
        properties[field] = { type: 'string', title: 'Output directory for markdown mirrors', description: 'Absolute path to the directory where per-page index.md files will be written' };
        break;
    }
  }

  const gapResult = await server.server.elicitInput({
    mode: 'form',
    message: `To fix "${finding.dimension}" (${finding.severity}), I need a few more details:`,
    requestedSchema: {
      type: 'object',
      properties: properties as Record<string, ReturnType<typeof String>>,
      required,
    },
  });

  // User cancelled gap-fill for this tool — skip it, continue to others (Pitfall 5)
  if (gapResult.action !== 'accept') {
    skippedFindings.push(finding.dimension);
    continue;
  }

  // Merge gap-fill response into accumulator
  Object.assign(acc, gapResult.content);

  // Post-process: split services string into array (Pitfall 2)
  if (typeof acc.services === 'string') {
    acc.services = (acc.services as string).split(',').map((s) => s.trim()).filter(Boolean);
  }
  // Post-process: cast schemaTypes to string[] (Pitfall 3)
  if (acc.schemaTypes !== undefined && !Array.isArray(acc.schemaTypes)) {
    acc.schemaTypes = [String(acc.schemaTypes)];
  }
}

// Step 3: Build contextSummary (success criterion 4 — visible/traceable state)
const contextLines = Object.entries(acc)
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
const contextSummary = contextLines.length > 0
  ? `Context gathered:\n${contextLines.join('\n')}`
  : 'No context gathered (all tools operate without business details)';

// Step 4: Return Phase 9 envelope for Phase 10
return {
  content: [{
    type: 'text' as const,
    text: JSON.stringify({
      marker: '[wizard] Context accumulation complete — tool execution lands in Phase 10',
      selectedFindings,
      skippedFindings,
      accumulatedContext: acc,
      contextSummary,
    }, null, 2),
  }],
};
```

### TOOL_FIELD_MAP declaration (module scope, near businessContextSchema)

```typescript
// Source: derived from src/tools/index.ts inputSchemas for all 5 fixing tools
// and src/audit/dimensions/* for dimension-to-tool mapping

type WizardToolFields = {
  outputPath?: string;
  robotsPath?: string;
  sitemapUrl?: string;
  schemaTypes?: string[];
  outputDir?: string;
};

type AccumulatedContext = Partial<BusinessContext> & WizardToolFields;

const TOOL_FIELD_MAP: Record<string, {
  contextRequired: (keyof BusinessContext)[];
  contextOptional: (keyof BusinessContext)[];
  toolRequired: (keyof WizardToolFields)[];
  toolOptional: (keyof WizardToolFields)[];
}> = {
  generate_llms_txt: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['outputPath'],
    toolOptional: [],
  },
  configure_robots_txt: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['robotsPath'],
    toolOptional: ['sitemapUrl'],
  },
  generate_schema_markup: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: ['schemaTypes'],
    toolOptional: [],
  },
  generate_faq_content: {
    contextRequired: ['businessName', 'businessType'],
    contextOptional: ['location', 'services', 'website', 'phoneNumber', 'description'],
    toolRequired: [],
    toolOptional: [],
  },
  generate_markdown_mirrors: {
    contextRequired: [],
    contextOptional: [],
    toolRequired: ['outputDir'],
    toolOptional: [],
  },
};
```

### Smoke test pattern for Phase 9 (multi-call stateful handler extension)

```javascript
// Extending scripts/smoke-audit-wizard-fork.mjs
// Scenario G — wizard with upfront businessContext: no gap-fill elicitation triggered
// The three elicit calls are: 1=mode-fork, 2=issue-selection, 3=SHOULD NOT HAPPEN (all context provided)

async function scenarioG() {
  const label = 'Scenario G (upfront context — no gap-fill)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-g', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) return { action: 'accept', content: { mode: 'wizard' } };
    if (callCount === 2) {
      // Issue selection — accept all
      const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
      return { action: 'accept', content: { selectedIssues: defaultSelection } };
    }
    // A third call here means Phase 9 asked for a field that was already in businessContext — FAIL
    assert(false, label, `Unexpected third elicitation call — context accumulation did not suppress re-asking`);
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: {
      target: process.cwd(),
      businessContext: {
        businessName: 'Acme Wraps',
        businessType: 'vehicle wrap shop',
        location: 'Denver, CO',
        services: ['Vehicle wraps', 'Fleet graphics'],
        website: 'https://acmewraps.com',
        phoneNumber: '303-555-0100',
        description: 'Acme Wraps is Denver\'s premier vehicle wrap studio.',
      },
    },
  });

  // Phase 9 result will still need outputPath, robotsPath, outputDir, schemaTypes
  // (tool-specific fields not in businessContext) — so callCount may reach 3+
  // This scenario proves that businessContext FIELDS are not re-asked, not that 0 calls happen
  // Adjust: the assertion should be that callCount === 2 OR that no businessContext field appears
  // in any elicitation schema after call 2. For simplicity:
  const text = result.content[0]?.text ?? '';
  assert(!result.isError, label, `tool returned isError`);
  assert(
    text.includes('Context accumulation complete'),
    label,
    `Phase 9 marker missing. Got: ${text.slice(0, 200)}`,
  );
}
```

**Note on smoke test complexity for Phase 9:** The multi-call elicitation sequence for Phase 9 is more complex than Phase 8 because the number of calls depends on what `acc` already contains and how many findings have missing required fields. The smoke test for CTX-01 (upfront context reuse) should assert that no elicitation call's `requestedSchema.properties` includes a key that was already provided in `businessContext`. This is achievable by inspecting `req.params.requestedSchema.properties` in the handler and asserting that known businessContext field names do not appear when those fields were provided upfront.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 8 stub — returns selectedFindings + businessContext as JSON terminal output | Phase 9 — accumulator loop, gap-fill elicitations, contextSummary, Phase 10 envelope | Phase 9 | Enables Phase 10 to fire tools without any additional user input |
| One-shot businessContext at tool call | Accumulated context across sequential elicitations | Phase 9 | Satisfies CTX-01 (no re-asking), CTX-02 (lazy field gather), CTX-03 (carry-forward) |

---

## Open Questions

1. **Should optional `businessContext` fields (location, services, etc.) be asked during gap-fill?**
   - What we know: These fields are optional in the tool schemas. The tools function without them. Asking for them adds friction.
   - What's unclear: Some tools (`generate_llms_txt`) produce better output with `location` and `services`. But Phase 9's job is context ACCUMULATION, not context OPTIMIZATION.
   - Recommendation: For Phase 9, only ask for `contextRequired` fields in gap-fill. Do not ask for `contextOptional` fields. Phase 10 may choose to ask for them if the tool result would be notably better — but that is Phase 10's decision. This keeps Phase 9 focused and minimal.

2. **What fields does `generate_schema_markup` need for `faqs`?**
   - What we know: `generate_schema_markup` has a `faqs` optional input. The audit finding for `faq` has `suggestedToolCall: 'generate_faq_content'`. Phase 10 may chain `generate_faq_content` → `generate_schema_markup`. This chaining is Phase 10 logic.
   - What's unclear: Whether Phase 9 should pre-gather `faqs` for `generate_schema_markup`.
   - Recommendation: Phase 9 should NOT gather `faqs` — this is an inter-tool dependency that Phase 10 must manage. Phase 9's job is field-level context, not tool chaining. Mark `faqs` as Phase 10 concern only.

3. **How many `elicitInput` calls can occur in one handler invocation?**
   - What we know: Phase 8 confirmed sequential elicitation is supported (SDK allows it, smoke test proves it with 2 calls). The Phase 9 accumulator could trigger up to 5 gap-fill calls (one per selected finding with missing fields) plus the 2 Phase 7/8 calls = up to 7 sequential `elicitInput` calls.
   - What's unclear: Whether there is a practical MCP client limit on sequential elicitations in one tool call. The SDK itself imposes no documented limit.
   - Recommendation: Proceed with the sequential accumulator pattern. If 7 calls becomes a UX problem, Phase 10 can batch fields from multiple tools into a single elicitation. For now, one gap-fill call per tool is cleaner and more debuggable.

4. **How does Phase 9's return value interact with Phase 10's actual tool invocations?**
   - What we know: Phase 9 returns a JSON envelope for Phase 10. Phase 10 replaces Phase 9's final `return` inside the `if (useWizard)` branch, exactly as Phase 9 replaces Phase 8's final `return`.
   - What's unclear: Whether Phase 10 fires tools via the tool handlers directly (in-process function calls), or via the MCP `callTool` round-trip through the server.
   - Recommendation: Phase 10 should call the underlying generator functions directly (e.g., `buildLlmsTxt(acc)`, `writeFile(...)`) rather than routing through MCP `callTool`. The tools are already pure functions — calling them directly is simpler and avoids a self-call cycle. This is consistent with the Phase 1 "pure build<Name>() functions" decision.

---

## Sources

### Primary (HIGH confidence)

- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js` lines 1656-1790 — `StringSchemaSchema`, `BooleanSchemaSchema`, `NumberSchemaSchema`, `TitledMultiSelectEnumSchemaSchema`, `PrimitiveSchemaDefinitionSchema`, `ElicitRequestFormParamsSchema` all confirmed
- Project source: `src/tools/index.ts` — all 5 fixing tool `inputSchema` definitions; `businessContextSchema` (lines 29-37); Phase 8 return envelope (lines 178-188); Phase 8 `if (useWizard)` branch (lines 111-195)
- Project source: `src/types/index.ts` — `BusinessContext` interface, all 7 fields with optionality confirmed
- Project source: `src/audit/types.ts` — `AuditFinding.suggestedToolCall: string | undefined` confirmed
- Project source: `src/audit/dimensions/llms-txt.ts` — `suggestedToolCall: 'generate_llms_txt'` on fail
- Project source: `src/audit/dimensions/robots-txt.ts` — `suggestedToolCall: 'configure_robots_txt'` on fail
- Project source: `src/audit/dimensions/schema.ts` — `suggestedToolCall: 'generate_schema_markup'` on fail/warning
- Project source: `src/audit/dimensions/faq.ts` — `suggestedToolCall: 'generate_faq_content'` on fail/warning
- Project source: `src/audit/dimensions/markdown.ts` — `suggestedToolCall: 'generate_markdown_mirrors'` on fail
- Project source: `.planning/phases/08-issue-selection/08-01-SUMMARY.md` — Phase 9 input contract confirmed: `{marker, selectedFindings, businessContext}`
- Project source: `scripts/smoke-audit-wizard-fork.mjs` — stateful two-call handler pattern confirmed; ElicitRequestSchema import pattern

### Secondary (MEDIUM confidence)

- Phase 8 RESEARCH.md `## Code Examples` — elicitInput API shape cross-verified with installed SDK source; consistent
- Phase 8 RESEARCH.md Open Question 3 — "no try/catch around sequential elicitInput calls" decision applies to Phase 9's gap-fill calls as well

---

## Metadata

**Confidence breakdown:**
- Tool-to-field mapping: HIGH — all 5 fixing tools' inputSchemas read directly from src/tools/index.ts; all audit dimensions' suggestedToolCall values read directly from source
- Accumulator pattern: HIGH — plain `Object.assign` / `Partial<T>` is TypeScript built-in; no library uncertainty
- elicitInput schema constraints: HIGH — StringSchemaSchema, TitledMultiSelectEnumSchemaSchema confirmed from installed SDK source at lines 1665 and 1740
- services/schemaTypes post-processing: HIGH — ElicitResult content type confirmed as `Record<string, string | number | boolean | string[]>` from Phase 8 research + SDK line 1862; comma-split for services is LOW risk
- Phase 10 invocation approach (call generators directly): MEDIUM — the "pure build<Name>()" decision is from v1.0 PROJECT.md key decisions; import paths not yet verified but consistent with existing codebase

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (SDK elicitation API is stable; all mapping data is from project source)
