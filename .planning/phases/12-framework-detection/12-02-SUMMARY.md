---
phase: 12-framework-detection
plan: "02"
subsystem: audit-dimensions
tags: [framework-detection, fix-suggestions, llms-txt, robots-txt, markdown]
dependency_graph:
  requires: ["12-01"]
  provides: ["framework-aware-placement-notes"]
  affects: ["src/audit/dimensions/llms-txt.ts", "src/audit/dimensions/robots-txt.ts", "src/audit/dimensions/markdown.ts"]
tech_stack:
  added: []
  patterns: ["optional-parameter-backward-compat", "pure-helper-string-builder"]
key_files:
  modified:
    - src/audit/dimensions/llms-txt.ts
    - src/audit/dimensions/robots-txt.ts
    - src/audit/dimensions/markdown.ts
decisions:
  - "buildPlacementNote helpers are module-scope pure functions — no I/O, easily unit-testable"
  - "llms.txt fallback returns generic 'Place in site root' message (non-empty); robots.txt and markdown fallbacks return '' (existing messages self-sufficient)"
  - "null/undefined framework accepted via FrameworkDetection | null | undefined union — matches fetchAndDetectFramework() return type"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-21"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 12 Plan 02: Framework-Aware Dimension Fix Suggestions Summary

Three dimension check functions extended with optional FrameworkDetection parameter and per-framework placement note helpers for Next.js/Nuxt/Astro (/public/), WordPress (site root via FTP), Shopify (custom route), Hugo/Jekyll (static folder rebuild).

## What Was Built

### checkLlmsTxt — framework-aware fail messages

`buildLlmsTxtPlacementNote(fw)` appended on both fail paths:
- URL 404: `"llms.txt missing at site root. For WordPress: upload llms.txt to your site root..."`
- Local ENOENT: `"llms.txt missing from folder root. Place llms.txt in your site root."` (generic fallback when fw is null)

### checkRobotsTxtAiAccess — framework-aware fail messages

`buildRobotsTxtPlacementNote(fw)` appended on all 4 fail paths:
- URL 404 path
- URL missing bots path
- Local ENOENT path
- Local missing bots path

Returns empty string for null/unknown frameworks (existing messages already sufficient).

### checkMarkdownMirrors — framework-aware fail messages

`buildMarkdownPlacementNote(fw)` appended on both fail paths:
- URL non-200: `"No markdown mirror found for home page. For this framework: generate mirrors into /public/..."`
- Local no .md files: `"No markdown mirror files found in folder root."` (empty suffix when fw is null)

## Verification

- `npx tsc --noEmit` — zero errors (all 3 tasks)
- `npm run build` — zero errors, all 3 dist files emitted
- Parameter declarations confirmed: `framework?: FrameworkDetection | null`
- Helper call counts: llms-txt = 3 occurrences, robots-txt = 5 occurrences, markdown = 3 occurrences

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Add framework-aware fix note to checkLlmsTxt | b2b63c4 |
| 2 | Add framework-aware fix note to checkRobotsTxtAiAccess | a8b196e |
| 3 | Add framework-aware fix note to checkMarkdownMirrors | c305a5f |

## Self-Check: PASSED

- `src/audit/dimensions/llms-txt.ts` — exists, modified
- `src/audit/dimensions/robots-txt.ts` — exists, modified
- `src/audit/dimensions/markdown.ts` — exists, modified
- Commits b2b63c4, a8b196e, c305a5f — all present in git log
