---
phase: 03-core-generators
plan: 03
subsystem: api
tags: [robots-txt, mcp, typescript, node-fs, esm]

# Dependency graph
requires:
  - phase: 03-02
    provides: generator pattern (src/generators/files/<name>.ts), tools/index.ts with writeFile already imported
provides:
  - patchRobotsTxt(robotsPath, sitemapUrl?) pure async fn in src/generators/files/robots-txt.ts
  - AI_BOTS constant exported for downstream consumers (audit plan 03-01)
  - configure_robots_txt MCP tool handler wired with real implementation
affects: [03-01-audit, 04-sitemap, downstream consumers of AI_BOTS]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Append-only file mutation: read existing content, detect presence, append only missing blocks"
    - "Case-insensitive multiline RegExp for robots.txt line matching"
    - "ENOENT short-circuit: treat missing file as empty string, single writeFile creates it"

key-files:
  created:
    - src/generators/files/robots-txt.ts
  modified:
    - src/tools/index.ts

key-decisions:
  - "AI_BOTS as const — readonly tuple typing flows through; audit plan may re-export without rename"
  - "ENOENT handled inside patchRobotsTxt; other fs errors (EACCES, EISDIR) rethrow to tool handler catch block"
  - "No robots.txt parsing library — text-in, text-out append-only as per RESEARCH.md Pattern 4"
  - "Trailing newline: content.trimEnd() + newline + additions + newline, then strip leading newlines for empty-file case"
  - "Bot detection: multiline RegExp with 'im' flags — case-insensitive and ^ anchors to full lines"

patterns-established:
  - "Append-only file patcher: never remove, reorder, or re-serialize existing content"
  - "isError:true guard at top of handler for invalid inputs before async work"

# Metrics
duration: 8min
completed: 2026-04-20
---

# Phase 3 Plan 03: robots.txt Patcher Summary

**Append-only robots.txt patcher that adds AI crawler allow-rules (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot) to any existing or new robots.txt without removing or reordering existing rules**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-20T00:00:00Z
- **Completed:** 2026-04-20T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- patchRobotsTxt() implemented as pure append-only async function — never removes or reorders existing content
- AI_BOTS exported as `as const` tuple for downstream audit consumers
- Case-insensitive bot detection via multiline RegExp handles `user-agent: gptbot` and `User-agent: GPTBot` equally
- ENOENT creates a new file; any other fs error rethrows to handler catch block
- Idempotent: second call on a compliant file returns `{ botsAdded: [], sitemapAdded: false }` with no file write
- configure_robots_txt MCP handler replaced stub with real implementation + isError:true pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: patchRobotsTxt + AI_BOTS module** - `eff37b7` (feat)
2. **Task 2: Wire configure_robots_txt tool handler** - `4346567` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/generators/files/robots-txt.ts` - AI_BOTS constant + patchRobotsTxt() append-only patcher
- `src/tools/index.ts` - Added patchRobotsTxt import; replaced configure_robots_txt stub with real handler

## Decisions Made
- AI_BOTS exported as `as const` so the type is `readonly ['GPTBot', ...]` — audit plan can re-export or iterate without rename
- ENOENT handled inside patchRobotsTxt so callers see consistent behavior: missing file = auto-create
- Other fs errors (EACCES, EISDIR) rethrow from patchRobotsTxt and are caught by the tool handler's catch block, returning isError:true with the OS error message
- No robots.txt parsing library used — RESEARCH.md Pattern 4 explicitly warns that structured parse + re-serialize breaks round-tripping (comments, whitespace lost)
- Trailing newline handling: `content.trimEnd() + '\n' + additions.join('\n') + '\n'` with `.replace(/^\n+/, '')` for empty-file edge case

## Verification Results

### Scenario 1: Fresh file creation
```
result: {"botsAdded":["GPTBot","ClaudeBot","PerplexityBot","Google-Extended","CCBot"],"sitemapAdded":true}
```
File created with 5 User-agent/Allow blocks + Sitemap line.

### Scenario 2: Preserve existing content
Existing `User-agent: *`, `Disallow: /admin/`, and `# My comment` all present in output after patch.

### Scenario 3: Idempotent re-run
```
result: {"botsAdded":[],"sitemapAdded":false}
```
No file write, no duplicates.

### Scenario 4: Case-insensitive detection
File pre-seeded with `user-agent: gptbot` (lowercase) — GPTBot not added again. botsAdded only contains the 4 remaining bots.

### Scenario 5: Invalid input (empty robotsPath)
Returns `isError: true` with descriptive message. Handler does not throw.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- patchRobotsTxt and AI_BOTS are ready for use by 03-01 audit plan
- configure_robots_txt MCP tool is fully operational
- All 3 Phase 3 plans now complete: 03-01 (research), 03-02 (llms.txt), 03-03 (robots.txt)
- Phase 3 generators complete — Phase 4 (sitemap + markdown mirrors) can begin

---
*Phase: 03-core-generators*
*Completed: 2026-04-20*
