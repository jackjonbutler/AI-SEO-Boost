# Phase 10: Tool Execution Engine — Research

**Researched:** 2026-04-20
**Domain:** In-handler sequential tool dispatch, generator function invocation, MCP elicitation confirmation/summary, TypeScript type narrowing
**Confidence:** HIGH

---

## Summary

Phase 10 replaces the Phase 9 final `return` inside the `if (useWizard)` branch of `audit_ai_seo` in `src/tools/index.ts`. At that point, the code has `selectedFindings: AuditFinding[]`, `skippedFindings: string[]`, and `accumulatedContext: AccumulatedContext` all in scope. Phase 10 iterates `selectedFindings` in order (already severity-sorted from Phase 8) and, for each finding not in `skippedFindings`, calls the underlying generator function directly — never via MCP `callTool` round-trip — then persists output to disk and elicits a per-tool confirmation (EXEC-04). After all findings are processed, a single summary of every fix applied is shown (EXEC-05).

No new npm packages are needed. The implementation is entirely in-process logic inside the existing `src/tools/index.ts` handler, calling the same generator functions already used by the standalone MCP tools. The calling signature for each generator is already defined and tested. The only new I/O patterns are `writeFile` (already imported) and `server.server.elicitInput` (already used in Phases 7-9), used here in a novel "display-only confirmation" mode where the elicitation is one-way acknowledgement rather than a question.

The smoke test at `scripts/smoke-audit-wizard-fork.mjs` must be extended to a Scenario J that exercises the complete Phase 10 path end-to-end, asserting the final response contains a session summary with all tools listed as applied. Scenario A (which currently terminates at Phase 9 marker) must be updated to expect the final summary envelope, not the Phase 9 marker.

**Primary recommendation:** Implement Phase 10 as a sequential `for...of` loop over `selectedFindings`, dispatch each tool via a `switch` on `finding.suggestedToolCall`, write outputs via the already-imported `writeFile`, show a per-tool confirmation via `elicitInput` in read-only/acknowledge mode, then return a single summary text block. No new types, no new files.

---

## Standard Stack

### Core (no new dependencies — all already in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | `server.server.elicitInput()` for per-tool confirmation | Already used Phases 7-9 |
| TypeScript built-ins | — | `switch`, type narrowing, `Array.prototype.join` | No extra library |
| `node:fs/promises` `writeFile` | Node 18+ | Write generated files to disk | Already imported at top of `src/tools/index.ts` |
| `node:path` `path` | Node 18+ | Construct output file paths for markdown mirrors | Already imported |
| `node:fs/promises` `mkdir` | Node 18+ | Create parent directories before writing markdown mirrors | Already imported |

### Generator Functions (already implemented, no changes needed)

| Function | Import | What it produces | Required inputs from accumulatedContext |
|----------|--------|-----------------|----------------------------------------|
| `buildLlmsTxt(ctx)` | `../generators/files/llms-txt.js` | `string` (file content) | `businessName`, `businessType`; writes to `outputPath` |
| `patchRobotsTxt(path, sitemapUrl?)` | `../generators/files/robots-txt.js` | `{ botsAdded, sitemapAdded }` (handles its own I/O internally) | `robotsPath`; optional `sitemapUrl` |
| `buildSchemaMarkup(ctx, types, faqs?)` | `../generators/files/schema-markup.js` | `string[]` (JSON-LD blocks, one per type) | `businessName`, `businessType`, `schemaTypes` |
| `buildFaqContent(ctx, count?)` | `../generators/content/faq.js` | `FaqPair[]` (JSON array) | `businessName`, `businessType` |
| `buildMarkdownMirror(doc)` + acquire | `../generators/files/markdown-mirrors.js` | `{ slug, content }` per page; needs full crawl | `outputDir`; `target` from original call |

### No New Installs Required

Phase 10 is entirely in-process logic inside `src/tools/index.ts`. All imports are already present.

---

## Architecture Patterns

### Where Phase 10 Lives

```
src/
└── tools/
    └── index.ts    ← Only file modified
                       Replace Phase 9 final return (lines ~364-376)
                       with Phase 10 execution loop + confirmation + summary return
```

### Pattern 1: Sequential Execution Loop with Skip Guard

**What:** Iterate `selectedFindings` in order (already severity-sorted). For each finding, check if `finding.dimension` is in `skippedFindings`. If so, skip. Otherwise dispatch via `switch` on `finding.suggestedToolCall`.

**Why severity-sorted order is already correct:** `runAudit` sorts by `critical → high → medium → low`. `selectedFindings` from Phase 8 preserves that sort. Phase 10 inherits correct execution order at zero cost.

**Skip guard:** Check `skippedFindings.includes(finding.dimension)` — Phase 9 stores dimension names (not tool names) in `skippedFindings`.

```typescript
// Source: derived from Phase 9 contract in 09-01-SUMMARY.md
const fixResults: string[] = [];
const fixErrors: string[] = [];

for (const finding of selectedFindings) {
  if (skippedFindings.includes(finding.dimension)) continue;
  const toolName = finding.suggestedToolCall;
  if (!toolName || !TOOL_FIELD_MAP[toolName]) continue;

  switch (toolName) {
    case 'generate_llms_txt': {
      // ... call buildLlmsTxt, writeFile, push to fixResults
      break;
    }
    // ... other cases
  }
}
```

### Pattern 2: Direct Generator Invocation (Not MCP callTool)

**What:** Call generator functions directly — e.g., `buildLlmsTxt(accumulatedContext as BusinessContext)` — rather than going through MCP tool dispatch.

**Why:** Per the v1.0 decision, generator functions are pure build<Name>() functions with no I/O, kept separate from the MCP handler. Calling via MCP `callTool` would add unnecessary round-trip overhead, require a second client connection, and duplicate input validation. The handler already imports all generators.

**Type cast pattern:** `accumulatedContext` is `Partial<BusinessContext> & WizardToolFields`. When calling a generator that needs `BusinessContext`, cast: `accumulatedContext as BusinessContext`. This is safe because Phase 9 guarantees all `contextRequired` fields for that tool are present (they were gathered in gap-fill or provided upfront). The generator's own guard (`if (!ctx.businessName)`) provides runtime safety.

### Pattern 3: Per-Tool Confirmation via elicitInput (Acknowledge Mode)

**What:** After each tool completes successfully, show the user what was done via an `elicitInput` with a read-only summary. The confirmation is informational — the user just acknowledges (or the elicit is fire-and-forget if the client doesn't support it).

**Design:** Use a simple acknowledge schema with one required field that acts as a continue button. If `elicitInput` throws (non-elicitation client), catch and continue silently — the summary at the end covers EXEC-04's intent.

```typescript
// Pattern: non-blocking per-tool confirmation
try {
  await server.server.elicitInput({
    mode: 'form',
    message: `Fix applied: llms.txt written to ${outputPath} (${content.length} bytes).`,
    requestedSchema: {
      type: 'object',
      properties: {
        acknowledged: { type: 'string', title: 'Continue', oneOf: [{ const: 'yes', title: 'OK' }] },
      },
      required: ['acknowledged'],
    },
  });
} catch {
  // Non-elicitation client — silently continue
}
```

**Alternative considered:** Skip per-tool elicitation entirely and just accumulate confirmation messages for the final summary. This satisfies EXEC-04 if the summary is shown immediately after each tool. However, using elicitation preserves the wizard UX. The planner should decide; this research flags both options.

### Pattern 4: generate_markdown_mirrors in Wizard Context

**What:** The wizard-path execution of `generate_markdown_mirrors` requires re-crawling `target` — the same target passed to `audit_ai_seo`. This is in scope in the handler closure.

**Implementation:** Call `acquireLocal(target)` or `crawlUrl(target)` (already imported), filter to `MarkdownDocument`, then iterate with `pLimit(5)`, `buildMarkdownMirror`, `mkdir`, `writeFile` — identical logic to the standalone `generate_markdown_mirrors` handler already in the file.

**Confirmation message:** `${written.length} markdown mirror(s) written under ${acc.outputDir}`

### Pattern 5: generate_faq_content — No File Output

**What:** `buildFaqContent` returns `FaqPair[]` — JSON pairs, not a file. In wizard context, there is no `outputPath` for FAQ content. The confirmation message must describe what was returned (the pairs), not a file write.

**Decision needed (planner):** What does Phase 10 do with FAQ pairs in wizard mode?
- Option A: Return the JSON pairs in the confirmation message (user copies them)
- Option B: Write the pairs to a JSON file at a path gathered during gap-fill (would require adding `faqOutputPath` to TOOL_FIELD_MAP — a scope change)
- Option C: Silently generate the pairs and include them in the session summary

The simplest approach aligned with v1.0 scope: Option A — confirm with the stringified JSON in the elicitation message. No new fields needed.

### Pattern 6: Session Summary Return (EXEC-05)

**What:** After the execution loop, return a single text block listing every fix applied and every tool skipped. This replaces the Phase 9 `return` entirely.

```typescript
// Source: derived from Phase 9 SUMMARY + requirements EXEC-05
const summaryLines: string[] = [
  `Wizard complete. ${fixResults.length} fix(es) applied, ${skippedFindings.length + fixErrors.length} skipped.`,
  '',
  ...fixResults.map((r) => `- ${r}`),
];
if (fixErrors.length > 0) {
  summaryLines.push('', 'Errors:');
  summaryLines.push(...fixErrors.map((e) => `  - ${e}`));
}
if (skippedFindings.length > 0) {
  summaryLines.push('', 'Skipped (user cancelled gap-fill):');
  summaryLines.push(...skippedFindings.map((d) => `  - ${d}`));
}

return {
  content: [{ type: 'text' as const, text: summaryLines.join('\n') }],
};
```

### Anti-Patterns to Avoid

- **Calling tools via MCP `callTool` round-trip:** Adds unnecessary complexity. Call generator functions directly — they're already imported.
- **Re-running Phase 9 gap-fill for missing fields:** Phase 10 trusts the accumulator. If a required field is still undefined (gap-fill was cancelled), skip that tool and record in fixErrors.
- **Separate confirmation return per tool:** Each tool result must be accumulated into the final summary, not returned early. MCP tool handlers must return exactly once.
- **Ignoring patchRobotsTxt's own I/O:** Unlike other generators, `patchRobotsTxt` performs its own `readFile`/`writeFile` internally. Phase 10 calls it and reads its return value — no separate `writeFile` needed for robots.txt.
- **Crashing the loop on a single tool error:** Wrap each tool dispatch in try/catch. A failure in one tool should record an error message and continue to the next tool.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File generation | Custom string builders | `buildLlmsTxt`, `buildSchemaMarkup`, `buildFaqContent`, `buildMarkdownMirror` | Already implemented, tested, spec-compliant |
| robots.txt patching | Custom regex + write | `patchRobotsTxt` | Already handles ENOENT, idempotency, case-insensitive matching |
| Page acquisition for markdown mirrors | Custom fs walker | `acquireLocal` / `crawlUrl` | Already imported in `src/tools/index.ts` |
| Concurrency for mirror writes | Custom promise queue | `pLimit(5)` | Already imported — same pattern as standalone handler |
| Severity ordering | Custom sort | Trust `selectedFindings` order from Phase 8 | `runAudit` already sorted; Phase 9 preserved that sort |

**Key insight:** Every tool Phase 10 needs to call already has a pure generator function implemented and tested. Phase 10 is dispatch + I/O wrapping, not new content generation.

---

## Common Pitfalls

### Pitfall 1: generate_faq_content Produces No File
**What goes wrong:** Developer tries to write FAQ pairs to disk at an unknown path, or returns early with FAQ content, breaking the wizard flow.
**Why it happens:** All other wizard tools write a file; FAQ content is different — it returns structured data.
**How to avoid:** In wizard mode, stringify the pairs in the confirmation message. Do not attempt a file write unless a gap-fill field for `faqOutputPath` was added (it was not added in Phase 9).
**Warning signs:** Adding `faqOutputPath` to TOOL_FIELD_MAP — that's a scope change requiring a separate decision.

### Pitfall 2: patchRobotsTxt Already Performs I/O
**What goes wrong:** Developer calls `patchRobotsTxt` then also calls `writeFile` — resulting in double-write or incorrect content.
**Why it happens:** Other generators (buildLlmsTxt, buildSchemaMarkup) return content for the caller to write. patchRobotsTxt is different — it reads and writes itself.
**How to avoid:** For `configure_robots_txt`, call `await patchRobotsTxt(acc.robotsPath!, acc.sitemapUrl)` and use the returned `{ botsAdded, sitemapAdded }` to build the confirmation message. No separate writeFile.
**Warning signs:** Seeing `writeFile(acc.robotsPath!, ...)` in the Phase 10 switch case for `configure_robots_txt`.

### Pitfall 3: accumulatedContext Typed as Partial — Required Field Guards
**What goes wrong:** TypeScript error when passing `acc` to a generator that requires `BusinessContext` (non-optional `businessName`, `businessType`).
**Why it happens:** `AccumulatedContext = Partial<BusinessContext> & WizardToolFields` — all BusinessContext fields are optional at the type level.
**How to avoid:** Use `as BusinessContext` cast inside each switch case. Runtime safety comes from the generator's own guard (`if (!ctx.businessName) throw ...`). Wrap each case in try/catch and push to `fixErrors` on throw.
**Warning signs:** TypeScript `TS2345: Argument of type 'AccumulatedContext' is not assignable to parameter of type 'BusinessContext'`.

### Pitfall 4: schemaTypes in accumulatedContext is string[], Not SchemaType[]
**What goes wrong:** `buildSchemaMarkup` expects `SchemaType[]` (`'LocalBusiness' | 'FAQPage' | 'Service'`), but `acc.schemaTypes` is `string[]`.
**Why it happens:** Phase 9 stores schemaTypes as `string[]` in the accumulator (the gap-fill schema uses `{ const: 'LocalBusiness' }` items but the accumulator type is `string[]`).
**How to avoid:** Cast: `acc.schemaTypes as SchemaType[]`. This is safe because the gap-fill schema constrains values to the three valid schema.org types (Phase 9 design).
**Warning signs:** TypeScript error on `buildSchemaMarkup(acc as BusinessContext, acc.schemaTypes, ...)`.

### Pitfall 5: Markdown Mirrors Require Re-Crawling target
**What goes wrong:** Developer assumes Phase 10 has a pre-acquired document list, but the wizard does not pass documents forward — only `target` string is available.
**Why it happens:** The audit phase acquires pages only for detection (checking presence), not for storage. The documents are not in the Phase 9 envelope.
**How to avoid:** In the `generate_markdown_mirrors` case, call `acquireLocal(target)` or `crawlUrl(target)` (same as the standalone handler). This is a second crawl — acceptable because this is the fix-application step, not the detection step.
**Warning signs:** Referencing `selectedFindings` or `accumulatedContext` for page content — there is none there.

### Pitfall 6: Returning Early on First Tool Error
**What goes wrong:** A try/catch inside the loop has a `return` statement, ending the wizard before other tools execute.
**Why it happens:** Copy-paste from standalone handlers where returning on error is correct.
**How to avoid:** Inside the loop, push errors to `fixErrors` and `continue`. Only `return` once, at the end, with the full summary.

### Pitfall 7: Scenario A Smoke Test Still Expects Phase 9 Marker
**What goes wrong:** Scenario A asserts `text.includes('Context accumulation complete — tool execution lands in Phase 10')` — this marker was in the Phase 9 return, which Phase 10 replaces.
**Why it happens:** Scenario A was written to test Phase 9 output; Phase 10 changes the final return.
**How to avoid:** Update Scenario A's assertion to expect the Phase 10 summary text (e.g., `'Wizard complete'`). Keep Phase 9 envelope shape assertions (selectedFindings, accumulatedContext) only if they appear in the Phase 10 summary — they likely won't.

### Pitfall 8: Per-Tool elicitInput Blocking on Non-Elicitation Clients
**What goes wrong:** Per-tool confirmation `elicitInput` throws on clients without elicitation support, crashing the loop.
**Why it happens:** Phase 7's mode fork elicitInput is wrapped in try/catch, but the loop confirmations may not be.
**How to avoid:** Wrap each per-tool confirmation `elicitInput` in its own try/catch. On throw, skip the confirmation and continue — the final summary still satisfies EXEC-04 and EXEC-05.

---

## Code Examples

Verified patterns from existing codebase:

### generate_llms_txt invocation (wizard context)

```typescript
// Source: src/tools/index.ts generate_llms_txt handler + generators/files/llms-txt.ts
case 'generate_llms_txt': {
  try {
    const ctx = acc as BusinessContext;           // safe: Phase 9 ensured businessName+businessType
    const content = buildLlmsTxt(ctx);            // pure, no I/O
    await writeFile(acc.outputPath!, content, 'utf-8');
    fixResults.push(`llms.txt written to ${acc.outputPath!} (${content.length} bytes)`);
  } catch (err) {
    fixErrors.push(`generate_llms_txt: ${err instanceof Error ? err.message : String(err)}`);
  }
  break;
}
```

### configure_robots_txt invocation (wizard context)

```typescript
// Source: src/tools/index.ts configure_robots_txt handler + generators/files/robots-txt.ts
// patchRobotsTxt performs its own readFile/writeFile — no separate writeFile needed
case 'configure_robots_txt': {
  try {
    const result = await patchRobotsTxt(acc.robotsPath!, acc.sitemapUrl);
    const parts: string[] = [];
    if (result.botsAdded.length > 0) {
      parts.push(`Added ${result.botsAdded.length} bot allow-rule(s): ${result.botsAdded.join(', ')}`);
    } else {
      parts.push('All AI bot allow-rules already present');
    }
    if (result.sitemapAdded) parts.push(`Added Sitemap: ${acc.sitemapUrl}`);
    fixResults.push(`robots.txt — ${parts.join('; ')}`);
  } catch (err) {
    fixErrors.push(`configure_robots_txt: ${err instanceof Error ? err.message : String(err)}`);
  }
  break;
}
```

### generate_schema_markup invocation (wizard context)

```typescript
// Source: src/tools/index.ts generate_schema_markup handler + generators/files/schema-markup.ts
case 'generate_schema_markup': {
  try {
    const ctx = acc as BusinessContext;
    const blocks = buildSchemaMarkup(ctx, acc.schemaTypes as SchemaType[]);
    // Schema markup is returned as text (no output path in wizard mode — user sees JSON-LD)
    fixResults.push(`schema markup generated (${blocks.length} block(s) — copy into <head>)`);
  } catch (err) {
    fixErrors.push(`generate_schema_markup: ${err instanceof Error ? err.message : String(err)}`);
  }
  break;
}
```

### generate_markdown_mirrors invocation (wizard context)

```typescript
// Source: src/tools/index.ts generate_markdown_mirrors handler
// NOTE: requires re-acquiring target — documents are not in the Phase 9 envelope
case 'generate_markdown_mirrors': {
  try {
    const t = target.trim();  // `target` from outer handler params — in scope
    const isUrl = t.startsWith('http://') || t.startsWith('https://');
    const results = isUrl ? await crawlUrl(t) : await acquireLocal(t);
    const docs: MarkdownDocument[] = results.filter(
      (r): r is MarkdownDocument => !isAcquisitionError(r),
    );
    if (docs.length === 0) {
      fixErrors.push(`generate_markdown_mirrors: no pages acquired from ${t}`);
      break;
    }
    const dir = acc.outputDir!;
    const writtenSlugs = new Set<string>();
    const disambiguate = (slug: string): string => { /* same logic as standalone handler */ };
    const limit = pLimit(5);
    const writes = docs.map((doc) => limit(async () => {
      const { slug, content } = buildMarkdownMirror(doc);
      const finalSlug = disambiguate(slug);
      const filePath = finalSlug === 'index'
        ? path.join(dir, 'index.md')
        : path.join(dir, finalSlug, 'index.md');
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');
      return filePath;
    }));
    const written = await Promise.all(writes);
    fixResults.push(`${written.length} markdown mirror(s) written under ${dir}`);
  } catch (err) {
    fixErrors.push(`generate_markdown_mirrors: ${err instanceof Error ? err.message : String(err)}`);
  }
  break;
}
```

### Session summary return (EXEC-05)

```typescript
// Source: requirements EXEC-05, pattern derived from Phase 9 final return shape
const summaryLines: string[] = [
  `Wizard complete. ${fixResults.length} fix(es) applied.`,
];
if (fixResults.length > 0) {
  summaryLines.push('', 'Applied:');
  summaryLines.push(...fixResults.map((r) => `  - ${r}`));
}
if (fixErrors.length > 0) {
  summaryLines.push('', 'Errors:');
  summaryLines.push(...fixErrors.map((e) => `  - ${e}`));
}
if (skippedFindings.length > 0) {
  summaryLines.push('', 'Skipped (gap-fill cancelled):');
  summaryLines.push(...skippedFindings.map((d) => `  - ${d}`));
}
return {
  content: [{ type: 'text' as const, text: summaryLines.join('\n') }],
};
```

### Smoke test Scenario J pattern (new scenario for Phase 10)

```javascript
// Source: scripts/smoke-audit-wizard-fork.mjs — Scenario A pattern extended
async function scenarioJ() {
  const label = 'Scenario J (Phase 10 — end-to-end execution, summary returned)';
  // Use tmp dir for any file writes
  // Handler: call 1 = wizard, call 2 = accept all, calls 3+ = gap-fills, calls N+ = confirmations
  // Assert: final text includes 'Wizard complete', does NOT include 'Context accumulation complete'
  // Assert: final text is NOT valid JSON (it's a plain text summary, not an envelope)
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 9 returned JSON envelope with `marker` | Phase 10 returns plain-text session summary | Phase 10 | Scenario A must be updated |
| Standalone tool handlers each have their own try/catch + writeFile | Wizard reuses same generator functions, centralised loop | Phase 10 | Simpler, no duplication |

**Deprecated/outdated in context of Phase 10:**
- Phase 9 marker string `'[wizard] Context accumulation complete — tool execution lands in Phase 10'` — this was in the `return` block Phase 10 replaces. It will no longer appear in the final output after Phase 10.

---

## Open Questions

1. **Per-tool elicitInput confirmation: use it or skip it?**
   - What we know: EXEC-04 requires "after each tool completes, the wizard shows a confirmation of what was written or changed". The final summary (EXEC-05) covers the complete list.
   - What's unclear: Does EXEC-04 mean the user must click through a per-tool confirmation, or is it sufficient to include each tool's result in the final summary?
   - Recommendation: Implement per-tool elicitation with try/catch (non-blocking). If the planner prefers simplicity, skip per-tool elicitation and satisfy EXEC-04 via the summary. Either is valid.

2. **generate_faq_content output in wizard mode**
   - What we know: `buildFaqContent` returns `FaqPair[]` — no file path, no disk write.
   - What's unclear: Where do the pairs go? The standalone tool returns them as JSON text for the user to use.
   - Recommendation: In wizard mode, include the pairs as JSON in the confirmation message. Do not add a new gap-fill field for an FAQ output path — that is scope creep beyond Phase 10.

3. **generate_schema_markup output in wizard mode**
   - What we know: `buildSchemaMarkup` returns `string[]` (JSON-LD blocks). The standalone tool returns them as text. No output path is gathered in Phase 9 TOOL_FIELD_MAP.
   - What's unclear: Should Phase 10 write schema markup to a file, or return it as text in the summary?
   - Recommendation: Return as text in the summary (same as standalone tool). Adding an output path would require TOOL_FIELD_MAP changes — out of scope for Phase 10.

4. **Smoke test tmp directory for file writes**
   - What we know: Scenario J will invoke tools that write to disk (`generate_llms_txt`, `configure_robots_txt`, `generate_markdown_mirrors`).
   - What's unclear: How should the smoke test provide safe tmp paths? `os.tmpdir()` is available in Node.
   - Recommendation: Synthesize gap-fill responses with `/tmp/` paths (already done in Scenarios A, G, H, I via `synthesizeGapFillResponse` which returns `'/tmp/smoke-placeholder'`). This is sufficient for path inputs.

---

## Sources

### Primary (HIGH confidence)
- `src/tools/index.ts` — Complete Phase 9 implementation read directly; TOOL_FIELD_MAP, AccumulatedContext, generator imports, handler closure scope all verified
- `src/generators/files/llms-txt.ts` — `buildLlmsTxt` signature and return type verified
- `src/generators/files/robots-txt.ts` — `patchRobotsTxt` signature, I/O behavior, and return type verified
- `src/generators/files/schema-markup.ts` — `buildSchemaMarkup` signature, `SchemaType` union verified
- `src/generators/content/faq.ts` — `buildFaqContent` signature, `FaqPair[]` return type verified
- `src/generators/files/markdown-mirrors.ts` — `buildMarkdownMirror` signature, re-crawl requirement verified
- `src/audit/types.ts` — `AuditFinding.suggestedToolCall` and `AuditFinding.dimension` field names verified
- `.planning/phases/09-context-accumulation/09-01-SUMMARY.md` — Phase 10 input contract verbatim
- `scripts/smoke-audit-wizard-fork.mjs` — Complete smoke test pattern read; Scenario A's Phase 9 assertion confirmed as needing update

### Secondary (MEDIUM confidence)
- Phase 9 decisions documented in 09-01-SUMMARY.md key-decisions — "No try/catch around individual gap-fill elicitInput" precedent; "Only contextRequired in gap-fill" rationale both directly relevant

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and imported; no new packages
- Architecture: HIGH — generator function signatures read directly from source; calling patterns match existing standalone handlers
- Pitfalls: HIGH — each pitfall derived from direct inspection of existing code (patchRobotsTxt I/O, Partial<BusinessContext> typing, schemaTypes string[] vs SchemaType[])
- Open questions: Genuine design decisions, not knowledge gaps

**Research date:** 2026-04-20
**Valid until:** Stable — Phase 10 targets stable code (no external API calls, no third-party library changes needed)
