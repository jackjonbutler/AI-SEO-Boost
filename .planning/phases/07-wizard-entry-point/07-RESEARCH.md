# Phase 7: Wizard Entry Point — Research

**Researched:** 2026-04-20
**Domain:** MCP SDK elicitation, tool handler modification, schema extension
**Confidence:** HIGH

---

## Summary

Phase 7 has one plan (07-01) that does two things: (1) make `businessContext` optional in `audit_ai_seo`'s inputSchema, and (2) add a post-audit fork using MCP elicitation that asks the user to choose between "Detailed report" or "Fix with wizard."

The previously flagged BLOCKER — "confirm MCP SDK supports incremental output or streaming before Phase 7 planning begins" — is **resolved**. MCP elicitation was introduced in Claude Code 2.1.76 (March 14, 2026). The SDK already includes the full elicitation API (`elicitInput` on the low-level `Server` object). The stdio transport used in this project is fully compatible because it is a bidirectional JSON-RPC channel.

The canonical pattern, confirmed from the installed SDK's own example file (`dist/cjs/examples/server/elicitationFormExample.js`), is: capture `mcpServer` (the `McpServer` instance) in the tool handler's closure and call `mcpServer.server.elicitInput(params)`. No new dependencies or transport changes are required. No server-side capability advertisement is needed — the server only checks whether the *client* advertises elicitation capability.

**Primary recommendation:** Use `mcpServer.server.elicitInput()` inside the existing `audit_ai_seo` tool handler, wrapping it in a try/catch that falls back to returning the detailed report if the client does not support elicitation.

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 (already installed) | Provides `Server.elicitInput()` | Official SDK; elicitation API is built in |
| `zod` | 3.25.76 (already installed) | Schema validation | Already used for all tool inputSchemas |

### No New Installs Required

All capabilities needed for Phase 7 are available in the existing `@modelcontextprotocol/sdk@1.29.0` package. The `elicitInput` method is on `Server` (the low-level class exposed as `mcpServer.server`).

---

## Architecture Patterns

### Existing Structure (no new files needed)

```
src/
├── tools/
│   └── index.ts     ← ONLY file to modify in Phase 7
├── audit/
│   └── index.ts     ← runAudit() — no changes needed
└── index.ts         ← server entry point — no changes needed
```

### Pattern 1: Elicitation via McpServer Closure

**What:** The `registerAllTools(server: McpServer)` function already has `server` in scope. Tool handlers are closures over `server`. Call `server.server.elicitInput()` to trigger a client-side dialog.

**When to use:** After `runAudit()` completes, before deciding what to return.

**Example (from installed SDK — `dist/cjs/examples/server/elicitationFormExample.js`):**

```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/examples/server/elicitationFormExample.js
const mcpServer = new McpServer({ name: '...', version: '...' });

mcpServer.registerTool('some_tool', { ... }, async () => {
  const result = await mcpServer.server.elicitInput({
    mode: 'form',
    message: 'Choose an option:',
    requestedSchema: {
      type: 'object',
      properties: {
        choice: {
          type: 'string',
          title: 'Action',
          oneOf: [
            { const: 'report', title: 'Detailed report' },
            { const: 'wizard', title: 'Fix with wizard' },
          ],
        },
      },
      required: ['choice'],
    },
  });

  if (result.action === 'accept' && result.content?.choice === 'wizard') {
    // proceed to wizard
  } else {
    // return detailed report
  }
});
```

**Key detail:** `mcpServer` is the outer `McpServer` instance; `mcpServer.server` is the inner `Server` (low-level). The tool handler captures `mcpServer` (or `server` as it's named in `registerAllTools`) from the closure automatically.

### Pattern 2: Elicitation Fallback for Unsupported Clients

**What:** `elicitInput` throws if the client has not advertised elicitation capability. Wrap in try/catch and fall back to the pre-v1.1 detailed report output.

**Why:** Preserves backward compatibility — callers on older Claude Code versions get the same report they received before.

```typescript
// Source: inferred from SDK error-handling pattern in server/index.js
try {
  const result = await server.server.elicitInput({ ... });
  // handle wizard vs report fork
} catch (_elicitErr) {
  // Client does not support elicitation — return detailed report unchanged
  return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
}
```

### Pattern 3: Making businessContext Optional

`businessContext` is currently a required field (no `.optional()`) in the `audit_ai_seo` inputSchema. WIZ-02 requires it to be optional.

```typescript
// Before (current)
inputSchema: {
  target: z.string().describe('...'),
  businessContext: businessContextSchema,   // required
}

// After (Phase 7)
inputSchema: {
  target: z.string().describe('...'),
  businessContext: businessContextSchema.optional(),  // optional
}
```

**Impact on handler:** Change destructuring from `{ target, businessContext: _businessContext }` to `{ target, businessContext }` and start threading `businessContext` into the wizard path (it will be used by later phases for context-aware fixes, but Phase 7 only needs to store/pass it through).

### Anti-Patterns to Avoid

- **Elicitation at top level (outside the tool handler closure):** `elicitInput` is instance-bound and requires an active connection. It must be called inside the async handler function, not at module load time.
- **Using `extra.sendRequest` directly:** While the `extra` parameter has a `sendRequest` method, it requires constructing the raw `elicitation/create` JSON-RPC payload. Use `server.server.elicitInput()` instead — it handles schema validation, capability checking, and the protocol details.
- **Making `businessContext` required:** WIZ-02 explicitly says "optional alongside the existing `target` parameter without breaking existing behavior." Making it required is a breaking change for any caller that omits it.
- **Blocking the fork on wizard readiness:** Phase 7's success criterion 4 says "choosing 'Fix with wizard' proceeds to the issue selection step." Phases 8+ implement that step. Phase 7 only needs to surface the fork and return a stub/placeholder for the wizard path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mid-tool user input | Custom stdin readline loop | `server.server.elicitInput()` | SDK handles JSON-RPC round-trip, schema validation, action/cancel states |
| Schema enumeration for the fork | Custom string-parsing | `oneOf` in `requestedSchema` | Client renders as a dropdown; validated before returning |
| Capability detection | `server._clientCapabilities` inspection | Let `elicitInput` throw on unsupported client | SDK already checks `_clientCapabilities.elicitation.form` and throws a clear error |

**Key insight:** `elicitInput` is a complete human-in-the-loop primitive — it handles the entire request/response cycle, JSON Schema validation of the user's answer, and the three action outcomes (accept/decline/cancel). There is nothing to build.

---

## Common Pitfalls

### Pitfall 1: Elicitation Not Supported by Client — Unhandled Throw

**What goes wrong:** `elicitInput` throws `Error: 'Client does not support form elicitation.'` if the Claude Code version is older than 2.1.76 or is a non-elicitation-capable client.

**Why it happens:** The SDK checks `this._clientCapabilities?.elicitation?.form` and throws if absent (confirmed in `server/index.js` line 365).

**How to avoid:** Wrap all `elicitInput` calls in try/catch. On failure, return the existing detailed report response unchanged. This satisfies WIZ-01's success criterion 3 ("Choosing 'Detailed report' returns the same prioritized fix list as before v1.1").

**Warning signs:** Tool returns an unhandled error response instead of the audit report.

### Pitfall 2: businessContext Becomes Required for Wizard Path

**What goes wrong:** Later wizard phases might assume `businessContext` is always present because it's useful for fix generation. If the schema made it required, callers without it break.

**Why it happens:** Convenience — the wizard phases want the context. But audit itself doesn't need it.

**How to avoid:** Keep `businessContext` optional in the schema. Handle `undefined` businessContext gracefully in all wizard phases. Phase 7 should pass it through as `businessContext | undefined`.

**Warning signs:** TypeScript error `Object is possibly 'undefined'` in wizard handler code being suppressed with `!` instead of handled.

### Pitfall 3: Tool Description Not Updated

**What goes wrong:** The `audit_ai_seo` description still says "Returns a prioritized fix list with suggested tool calls" — it no longer accurately describes the post-v1.1 behavior (which now forks to either report or wizard).

**Why it happens:** Forgetting to update the description when the behavior changes.

**How to avoid:** Update the `description` field in `registerTool` as part of 07-01 to reflect the fork.

### Pitfall 4: Elicitation `requestedSchema` Uses Number Type for Integer

**What goes wrong:** The `requestedSchema` in `ElicitRequestFormParamsSchema` supports `integer` type as a distinct JSON Schema type but the TypeScript type definitions show specific supported field shapes. Using unsupported field types causes SDK schema validation errors.

**How to avoid:** For the wizard fork, use `type: 'string'` with `oneOf` — this is the simplest, most compatible pattern for a two-option choice, confirmed directly in the SDK example.

---

## Code Examples

### Verified: Complete wizard-fork pattern for `audit_ai_seo`

```typescript
// Source: Pattern derived from installed SDK example at
// node_modules/@modelcontextprotocol/sdk/dist/cjs/examples/server/elicitationFormExample.js

// In registerAllTools(server: McpServer):
server.registerTool(
  'audit_ai_seo',
  {
    description:
      'Audit a website or local folder across 5 AI SEO dimensions. After auditing, choose between a detailed report or the interactive fix wizard.',
    inputSchema: {
      target: z.string().describe('URL to crawl (https://...) or absolute local folder path to walk'),
      businessContext: businessContextSchema.optional(),  // WIZ-02: optional
    },
  },
  async ({ target, businessContext }) => {
    try {
      if (!target || typeof target !== 'string' || target.trim().length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'Error: target must be a non-empty string' }],
          isError: true,
        };
      }
      const report = await runAudit(target.trim());

      // WIZ-01: Present fork after audit completes
      let useWizard = false;
      try {
        const fork = await server.server.elicitInput({
          mode: 'form',
          message: 'Audit complete. How would you like to proceed?',
          requestedSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                title: 'Next step',
                oneOf: [
                  { const: 'report', title: 'Detailed report' },
                  { const: 'wizard', title: 'Fix with wizard' },
                ],
              },
            },
            required: ['mode'],
          },
        });
        useWizard = fork.action === 'accept' && fork.content?.mode === 'wizard';
      } catch (_elicitErr) {
        // Client does not support elicitation — fall through to detailed report
      }

      if (!useWizard) {
        // WIZ-01 criterion 3: same output as pre-v1.1
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
        };
      }

      // WIZ-01 criterion 4: wizard path — Phase 8+ implements issue selection
      // Phase 7 stub: return a placeholder indicating wizard mode was entered
      return {
        content: [{ type: 'text' as const, text: '[wizard] Issue selection step — Phase 8' }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${msg}` }],
        isError: true,
      };
    }
  },
);
```

### Verified: ElicitResult structure

```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/types.d.ts — ElicitResultSchema
type ElicitResult = {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
};
```

### Verified: Supported JSON Schema property types in requestedSchema

Confirmed from `ElicitRequestFormParamsSchema` in `types.d.ts`:
- `type: 'string'` with optional `enum`, `oneOf` (array of `{ const, title }`), `minLength`, `maxLength`
- `type: 'boolean'` with optional `default`
- `type: 'integer'` or `type: 'number'` with optional `minimum`, `maximum`
- `type: 'array'` with `items.enum` for multi-select

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Return JSON report directly | Fork via elicitation then return | Phase 7 (v1.1) | audit_ai_seo becomes interactive |
| `businessContext` required in audit_ai_seo | `businessContext` optional | Phase 7 (v1.1) | No breaking change for existing callers |
| Multi-turn requires separate tool calls | MCP elicitation (single tool call, mid-execution pause) | Claude Code 2.1.76, March 2026 | Enables wizard flow without new tool registrations |

**Not deprecated — just extended:** The existing `runAudit()` function and `AuditReport` type are unchanged. The pre-v1.1 output path is preserved as the "Detailed report" fork.

---

## Open Questions

1. **Wizard stub response content**
   - What we know: Phase 7 success criterion 4 says "Choosing 'Fix with wizard' proceeds to the issue selection step." Phase 8 implements that step.
   - What's unclear: Should the Phase 7 wizard stub return the `AuditReport` JSON (so Phase 8 can use it), or a human-readable message, or something else?
   - Recommendation: Return the audit report as context + a placeholder marker. Phase 8 can replace this. The planner should decide what "proceeds to" means in Phase 7 terms — it cannot literally proceed until Phase 8 exists. A plain text stub is fine for Phase 7.

2. **Elicitation timeout behavior**
   - What we know: The SDK `elicitInput` call waits indefinitely for user response (confirmed by claudelab.net article). No timeout parameter is exposed in the current API.
   - What's unclear: Whether long-running audit + indefinite elicitation wait causes any client-side timeout in Claude Code.
   - Recommendation: Not a blocker. Audits complete in seconds and Claude Code UI does not impose a hard elicitation timeout. Flag as LOW risk, no action needed in Phase 7.

---

## Sources

### Primary (HIGH confidence)

- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/examples/server/elicitationFormExample.js` — canonical elicitation pattern confirmed from vendor example
- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js` — `elicitInput` implementation, capability checking logic
- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/types.d.ts` — `ElicitRequestFormParamsSchema`, `ElicitResultSchema` type definitions
- Installed SDK source: `node_modules/@modelcontextprotocol/sdk/dist/cjs/shared/protocol.js` — `RequestHandlerExtra` assembly; confirms `requestId`, `sendRequest` in extra
- Project source: `src/tools/index.ts` — current `audit_ai_seo` handler; confirms `businessContext` is currently non-optional, handler ignores it

### Secondary (MEDIUM confidence)

- [claudelab.net: MCP Elicitation Support in Claude Code](https://claudelab.net/en/articles/claude-code/mcp-elicitation-support) — confirms Claude Code 2.1.76 ships form elicitation over stdio; describes accept/decline/cancel outcomes
- WebSearch cross-verification: multiple sources agree Claude Code 2.1.74-2.1.76 added MCP elicitation support (March 2026)

### Tertiary (LOW confidence)

- [GitHub issue #7108 (closed "not planned")](https://github.com/anthropics/claude-code/issues/7108) — older duplicate issue; marked not planned; superseded by actual shipping in 2.1.76
- [nickperkins.au: Building Interactive MCP Tools](https://nickperkins.au/code/mcp-elicitations-interactive-tools/) — confirms pattern but API details differ slightly from SDK types; use SDK source as ground truth

---

## Metadata

**Confidence breakdown:**
- Elicitation API and pattern: HIGH — confirmed from installed SDK source code and vendor-provided example
- Claude Code elicitation support: MEDIUM — confirmed via WebSearch (multiple sources, consistent) + issue tracking
- Architecture (no new files needed): HIGH — direct inspection of existing codebase
- businessContext optionality change: HIGH — confirmed from existing source code and requirements text

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (SDK elicitation API is stable; Claude Code 2.1.76+ is current)
