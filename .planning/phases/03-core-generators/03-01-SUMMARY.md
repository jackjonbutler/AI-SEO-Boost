---
phase: 03-core-generators
plan: 01
subsystem: api
tags: [audit, mcp, typescript, cheerio, esm, node-fs, fetch]

# Dependency graph
requires:
  - phase: 03-03
    provides: AI_BOTS constant exported from src/generators/files/robots-txt.ts
  - phase: 01-02
    provides: tools/index.ts stub structure, registerAllTools pattern
affects: [04-sitemap-mirrors, 05-faq-schema, users calling audit_ai_seo]

provides:
  - AuditReport, AuditFinding, Severity, AuditDimension types in src/audit/types.ts
  - isUrl() and originFor() URL helpers in src/audit/types.ts
  - checkLlmsTxt — HEAD probe for URL, fs.access for local
  - checkRobotsTxtAiAccess — per-bot case-insensitive regex match + re-exports AI_BOTS
  - checkSchemaMarkup — Cheerio JSON-LD @type extraction, LocalBusiness detection
  - checkFaq — FAQPage JSON-LD detection + question-heading heuristic
  - checkMarkdownMirrors — HEAD probe /index.md for URL, root readdir for local
  - runAudit() orchestrator — Promise.all over 5 dims, severity-sorted AuditReport
  - audit_ai_seo MCP tool handler wired to real runAudit(), isError pattern

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throw dimension pattern: every dimension check wraps body in try/catch, returns warning finding on error"
    - "AbortSignal.timeout(5000) on every fetch — same as src/acquisition/crawl.ts"
    - "Re-export instead of duplicate: robots-txt dimension re-exports AI_BOTS from generators"
    - "Origin normalisation: URL targets probed at origin not deep path (new URL(target).origin)"

key-files:
  created:
    - src/audit/types.ts
    - src/audit/dimensions/llms-txt.ts
    - src/audit/dimensions/robots-txt.ts
    - src/audit/dimensions/schema.ts
    - src/audit/dimensions/faq.ts
    - src/audit/dimensions/markdown.ts
    - src/audit/index.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "AI_BOTS re-exported from src/generators/files/robots-txt.ts (not duplicated) — single source of truth"
  - "Origin normalisation in orchestrator: probe = new URL(target).origin for URL targets — all dimensions check root, not deep paths"
  - "Question-heading heuristic threshold: 3 or more headings containing '?' triggers warning (not fail)"
  - "businessContext renamed to _businessContext in handler destructuring — schema unchanged, TSC unused-var satisfied"
  - "Local markdown check: one-level readdir only (not recursive) — matches plan spec"

patterns-established:
  - "Dimension module shape: single async export, takes target: string, returns Promise<AuditFinding>, never throws"
  - "Audit orchestrator: validates + normalises target, Promise.all, sort by severity order record"

# Metrics
duration: 12min
completed: 2026-04-20
---

# Phase 3 Plan 01: audit_ai_seo Engine Summary

**Five-dimension audit engine (llms.txt, robots AI-access, JSON-LD schema, FAQPage, markdown mirrors) wired to the audit_ai_seo MCP tool, returning severity-sorted AuditReport with suggestedToolCall pointers**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-20T10:33:33Z
- **Completed:** 2026-04-20T10:45:00Z
- **Tasks:** 3
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments
- AuditReport type system established: AuditReport, AuditFinding, Severity, AuditDimension + isUrl/originFor helpers
- Five dimension modules each follow the never-throw contract — any network/fs failure becomes a 'warning' finding
- AI_BOTS re-exported from src/generators/files/robots-txt.ts (single source of truth, no duplication)
- runAudit() orchestrator: validates target, normalises to origin for URL targets, runs all 5 concurrently, sorts critical > high > medium > low
- audit_ai_seo stub replaced with real handler — isError:true pattern on invalid/missing targets, JSON.stringify(report, null, 2) on success
- All 5 suggestedToolCalls reference exact registered tool names: generate_llms_txt, configure_robots_txt, generate_schema_markup, generate_faq_content, generate_markdown_mirrors

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit types + all 5 dimension modules** - `c1fdb3e` (feat)
2. **Task 2: Audit orchestrator (runAudit)** - `6a13138` (feat)
3. **Task 3: Wire audit_ai_seo tool handler** - `f9fe4ca` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/audit/types.ts` - AuditReport, AuditFinding, Severity, AuditDimension types + isUrl/originFor helpers
- `src/audit/dimensions/llms-txt.ts` - HEAD probe for URL, fs.access for local, critical fail with suggestedToolCall
- `src/audit/dimensions/robots-txt.ts` - Re-exports AI_BOTS, per-bot case-insensitive regex, high fail for missing bots
- `src/audit/dimensions/schema.ts` - Cheerio JSON-LD @type extraction, LocalBusiness detection, high fail if no schema
- `src/audit/dimensions/faq.ts` - FAQPage JSON-LD check + question-heading heuristic (>=3 headings with '?')
- `src/audit/dimensions/markdown.ts` - HEAD probe /index.md for URL, root readdir for local
- `src/audit/index.ts` - runAudit() orchestrator: validation, origin normalisation, Promise.all, severity sort
- `src/tools/index.ts` - Added runAudit import; replaced audit_ai_seo stub with real handler

## Decisions Made
- **AI_BOTS re-export vs duplicate:** Re-exported from src/generators/files/robots-txt.ts (03-03 summary confirmed it exports `as const`). Keeps single source of truth — if bot list changes, both generator and audit see the update automatically.
- **Origin normalisation:** For URL targets, `probe = new URL(target).origin` so all 5 dimensions probe the root, not a deep path (e.g. `/blog/post` shouldn't affect llms.txt probe at `/`).
- **Question-heading threshold:** 3 headings with '?' triggers 'warning' (plan specified >= 3). Chose 'warning' not 'fail' because presence of questions without FAQPage JSON-LD is better than no FAQ at all.
- **businessContext in handler:** Renamed to `_businessContext` in destructuring only — input schema unchanged (public API stable). TSC unused-variable satisfied.

## Verification Results

### https://example.com audit output
```json
{
  "target": "https://example.com",
  "generatedAt": "2026-04-20T10:37:04.824Z",
  "findings": [
    { "dimension": "llms-txt", "status": "fail", "severity": "critical", "message": "llms.txt missing at site root", "suggestedToolCall": "generate_llms_txt" },
    { "dimension": "robots-ai", "status": "fail", "severity": "high", "message": "robots.txt not found (404) — no AI crawler rules defined", "suggestedToolCall": "configure_robots_txt" },
    { "dimension": "schema", "status": "fail", "severity": "high", "message": "No JSON-LD schema markup detected", "suggestedToolCall": "generate_schema_markup" },
    { "dimension": "faq", "status": "fail", "severity": "medium", "message": "No FAQ content detected", "suggestedToolCall": "generate_faq_content" },
    { "dimension": "markdown-mirrors", "status": "fail", "severity": "medium", "message": "No markdown mirror found for home page", "suggestedToolCall": "generate_markdown_mirrors" }
  ]
}
```

### Empty string target
Handler returns `isError: true`, text: `Error: target must be a non-empty string (URL or absolute local folder path)`. No exception escapes.

### Missing local path
runAudit throws descriptive Error; handler catches and returns `isError: true`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- audit_ai_seo MCP tool is fully operational for both URL and local folder targets
- All 5 dimensions return actionable suggestedToolCall values pointing at real Phase 3-4 tools
- Phase 3 complete: 03-01 (audit engine), 03-02 (llms.txt generator), 03-03 (robots.txt patcher) all done
- Phase 4 (sitemap + markdown mirrors) can begin — generate_sitemap and generate_markdown_mirrors handlers are next

---
*Phase: 03-core-generators*
*Completed: 2026-04-20*
