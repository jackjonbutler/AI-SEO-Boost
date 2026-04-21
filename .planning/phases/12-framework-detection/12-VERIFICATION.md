---
phase: 12-framework-detection
verified: 2026-04-21T08:51:34Z
status: passed
score: 4/4 must-haves verified
---

# Phase 12: Framework Detection Verification Report

**Phase Goal:** Every audit report names the detected web framework with a confidence level, and fix suggestions for file-placement issues reference framework-specific locations rather than a generic instruction.
**Verified:** 2026-04-21T08:51:34Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                     | Status     | Evidence                                                                                 |
|----|-------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------|
| 1  | AuditReport.framework field exists and is populated by runAudit() from fetchAndDetectFramework() | VERIFIED | types.ts:48 declares field; index.ts:37 calls fetchAndDetectFramework; index.ts:63 assigns result to returned report; all 3 framework-aware dimensions receive frameworkDetection |
| 2  | detectFramework() returns { name: null, confidence: 'none' } when no signals match       | VERIFIED   | framework.ts:122-124 explicit early return when scores map is empty                      |
| 3  | WordPress fix messages reference site-root, not /wp-content/; Next.js/Nuxt mention /public/ | VERIFIED | llms-txt.ts:18 WordPress note; llms-txt.ts:15 Next.js/Nuxt note; robots-txt.ts:22 WordPress note; robots-txt.ts:24 Next.js/Nuxt note; markdown.ts:12 Next.js/Nuxt note; markdown.ts:15 WordPress note |
| 4  | detectFramework() requires 2+ independent signals for confidence='high' (FWK-03)         | VERIFIED   | framework.ts:138-144 confidence ladder: totalSignals>=2 → high, strong>=1 → medium, else → low |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                      | Expected                                    | Status   | Details                                                              |
|-----------------------------------------------|---------------------------------------------|----------|----------------------------------------------------------------------|
| `src/audit/types.ts`                          | FrameworkDetection type, AuditReport.framework field | VERIFIED | Lines 9-16 declare FrameworkDetection; line 48 declares framework?: FrameworkDetection \| null |
| `src/audit/framework.ts`                      | detectFramework() + fetchAndDetectFramework() | VERIFIED | 171 lines; both functions exported and substantive; confidence ladder implements FWK-03 |
| `src/audit/dimensions/llms-txt.ts`            | buildLlmsTxtPlacementNote with framework param | VERIFIED | Lines 9-26 implement switch over fw.name; WordPress and Next.js/Nuxt cases correct |
| `src/audit/dimensions/robots-txt.ts`          | buildRobotsTxtPlacementNote with framework param | VERIFIED | Lines 18-35 implement switch over fw.name; WordPress and Next.js/Nuxt/Astro cases correct |
| `src/audit/dimensions/markdown.ts`            | buildMarkdownPlacementNote with framework param | VERIFIED | Lines 9-26 implement switch over fw.name; WordPress and Next.js/Nuxt/Astro cases correct |
| `src/audit/index.ts`                          | fetchAndDetectFramework wired into runAudit  | VERIFIED | Line 37 awaits fetchAndDetectFramework; lines 40, 41, 44 pass result to dimensions; line 63 includes in return |
| `scripts/smoke-phase12-framework.mjs`         | Smoke test covering all 4 success criteria   | VERIFIED | 168 lines; 3 scenarios (local target, real URL, 4 synthetic cases); exercises detectFramework and runAudit |

### Key Link Verification

| From                | To                            | Via                             | Status   | Details                                                           |
|---------------------|-------------------------------|---------------------------------|----------|-------------------------------------------------------------------|
| `index.ts:runAudit` | `framework.ts:fetchAndDetectFramework` | import + direct call line 37 | WIRED | Result stored in frameworkDetection, passed to 3 dimensions and returned in report |
| `index.ts:runAudit` | `llms-txt.ts:checkLlmsTxt`   | second arg: frameworkDetection  | WIRED    | Line 40: checkLlmsTxt(probe, frameworkDetection)                 |
| `index.ts:runAudit` | `robots-txt.ts:checkRobotsTxtAiAccess` | second arg: frameworkDetection | WIRED  | Line 41: checkRobotsTxtAiAccess(probe, frameworkDetection)       |
| `index.ts:runAudit` | `markdown.ts:checkMarkdownMirrors` | second arg: frameworkDetection | WIRED  | Line 44: checkMarkdownMirrors(probe, frameworkDetection)         |
| `llms-txt.ts:buildLlmsTxtPlacementNote` | fail message | string interpolation line 61 | WIRED | Called inside 404 branch and ENOENT branch; result appended to message |
| `robots-txt.ts:buildRobotsTxtPlacementNote` | fail message | string interpolation lines 65, 78, 98 | WIRED | Called in all three failure paths |
| `markdown.ts:buildMarkdownPlacementNote` | fail message | string interpolation lines 51, 67 | WIRED | Called in URL and local failure paths |

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, or stub return patterns found in any of the 6 key files.

### Human Verification Required

None required for automated success criteria. Optional human check:

#### 1. Live URL audit output

**Test:** Run `npx mcp audit_website --target https://wordpress.org` and inspect the returned report.
**Expected:** `report.framework.name === "WordPress"`, `report.framework.confidence` is "high" or "medium", and any llms-txt/robots-ai fail finding message contains "site root" and "not inside /wp-content/".
**Why human:** Requires live network fetch; confidence level depends on what signals WordPress.org actually serves.

## Summary

All four success criteria are fully satisfied in the codebase:

1. `AuditReport.framework` is declared in types.ts and populated in every `runAudit()` call. The field flows from `fetchAndDetectFramework()` through the index orchestrator into the returned report, and the same detection result is passed as a second argument to all three framework-aware dimension checks.

2. `detectFramework()` returns `{ name: null, confidence: 'none' }` via an explicit early return at framework.ts:122-124 when no signals match any framework.

3. All three placement-note helper functions (`buildLlmsTxtPlacementNote`, `buildRobotsTxtPlacementNote`, `buildMarkdownPlacementNote`) have correct WordPress and Next.js/Nuxt cases. WordPress cases consistently say "site root" and explicitly warn against /wp-content/. Next.js/Nuxt cases consistently direct to /public/.

4. The FWK-03 confidence ladder is implemented exactly: `totalSignals >= 2` → high, `strong >= 1` (exactly 1 total) → medium, otherwise → low.

The smoke test at `scripts/smoke-phase12-framework.mjs` exercises all four criteria with synthetic HTML inputs (no network required for the critical cases) and a guarded live-URL scenario B.

---

_Verified: 2026-04-21T08:51:34Z_
_Verifier: Claude (gsd-verifier)_
