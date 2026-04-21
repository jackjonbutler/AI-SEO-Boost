#!/usr/bin/env node
// scripts/smoke-phase15-wizard-integration.mjs
// Offline regression gate for Phase 15: Wizard Integration and Type Safety.
// Asserts all four Phase 15 success criteria hold in the current source tree.
// Run: node scripts/smoke-phase15-wizard-integration.mjs
// Exit 0 = all 4 checks pass; exit 1 = one or more checks failed.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const results = [];

function record(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}${detail ? ': ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// Check 1 — Success criterion 1: SuggestedToolCall literal union exists in
// src/audit/types.ts and AuditFinding.suggestedToolCall is typed as that union.
// ---------------------------------------------------------------------------
{
  const typesPath = path.join(repoRoot, 'src', 'audit', 'types.ts');
  let src;
  try {
    src = readFileSync(typesPath, 'utf-8');
  } catch (err) {
    record(
      'SC-1: SuggestedToolCall literal union declared with all 5 members',
      false,
      `could not read ${typesPath}: ${err.message}`,
    );
    // Skip further SC-1 sub-checks
    src = null;
  }

  if (src !== null) {
    // Sub-check 1a: export type SuggestedToolCall = ... ; exists
    const unionMatch = src.match(/export\s+type\s+SuggestedToolCall\s*=[\s\S]+?;/);
    if (!unionMatch) {
      record(
        'SC-1: SuggestedToolCall literal union declared with all 5 members',
        false,
        'no exported SuggestedToolCall type alias found (regex: /export\\s+type\\s+SuggestedToolCall\\s*=[\\s\\S]+?;/)',
      );
    } else {
      const unionBlock = unionMatch[0];
      const expectedMembers = [
        "'generate_llms_txt'",
        "'configure_robots_txt'",
        "'generate_schema_markup'",
        "'generate_faq_content'",
        "'generate_markdown_mirrors'",
      ];
      const missingMembers = expectedMembers.filter((m) => !unionBlock.includes(m));

      // Sub-check 1b: suggestedToolCall field typed as SuggestedToolCall (not string)
      const fieldTyped = /suggestedToolCall\?\s*:\s*SuggestedToolCall/.test(src);

      if (missingMembers.length > 0) {
        record(
          'SC-1: SuggestedToolCall literal union declared with all 5 members',
          false,
          `union missing members: ${missingMembers.join(', ')}`,
        );
      } else if (!fieldTyped) {
        record(
          'SC-1: SuggestedToolCall literal union declared with all 5 members',
          false,
          'AuditFinding.suggestedToolCall is not typed as SuggestedToolCall (expected: /suggestedToolCall\\?\\s*:\\s*SuggestedToolCall/)',
        );
      } else {
        record('SC-1: SuggestedToolCall literal union declared with all 5 members', true);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — Success criterion 2: Typed Record<SuggestedToolCall, FixHandler>
// dispatch table exists in src/tools/index.ts; switch (toolName) is gone.
// ---------------------------------------------------------------------------
{
  const toolsPath = path.join(repoRoot, 'src', 'tools', 'index.ts');
  let src;
  try {
    src = readFileSync(toolsPath, 'utf-8');
  } catch (err) {
    record(
      'SC-2: Typed Record<SuggestedToolCall, FixHandler> dispatch table with all 5 handlers; TOOL_FIELD_MAP also tightened',
      false,
      `could not read ${toolsPath}: ${err.message}`,
    );
    src = null;
  }

  if (src !== null) {
    const failures = [];

    // Sub-check 2a: switch (toolName) is gone
    if (/switch\s*\(\s*toolName\s*\)/.test(src)) {
      failures.push('switch (toolName) still present — expected it to be replaced by dispatch table');
    }

    // Sub-check 2b: Record<SuggestedToolCall, FixHandler> type literal present
    if (!/Record<SuggestedToolCall,\s*FixHandler>/.test(src)) {
      failures.push('Record<SuggestedToolCall, FixHandler> type literal not found');
    }

    // Sub-check 2c: dispatchTable declared as typed const
    if (!/const\s+dispatchTable\s*:\s*Record<SuggestedToolCall/.test(src)) {
      failures.push('const dispatchTable : Record<SuggestedToolCall...> declaration not found');
    }

    // Sub-check 2d: all 5 members appear as async handler keys
    const handlerPatterns = [
      { re: /generate_llms_txt\s*:\s*async/, name: 'generate_llms_txt' },
      { re: /configure_robots_txt\s*:\s*async/, name: 'configure_robots_txt' },
      { re: /generate_schema_markup\s*:\s*async/, name: 'generate_schema_markup' },
      { re: /generate_faq_content\s*:\s*async/, name: 'generate_faq_content' },
      { re: /generate_markdown_mirrors\s*:\s*async/, name: 'generate_markdown_mirrors' },
    ];
    for (const { re, name } of handlerPatterns) {
      if (!re.test(src)) {
        failures.push(`dispatch table missing handler key: ${name}`);
      }
    }

    // Sub-check 2e: dispatch call site — dispatchTable[toolName](finding) or await dispatchTable[toolName]
    if (
      !/dispatchTable\[toolName\]\s*\(\s*finding\s*\)/.test(src) &&
      !/await\s+dispatchTable\[toolName\]/.test(src)
    ) {
      failures.push('dispatch call site (dispatchTable[toolName](finding) or await dispatchTable[toolName]) not found');
    }

    // Sub-check 2f: TOOL_FIELD_MAP tightened to Record<SuggestedToolCall, ...>
    if (!/TOOL_FIELD_MAP[^:]*:\s*Record<SuggestedToolCall/.test(src)) {
      failures.push('TOOL_FIELD_MAP key type not tightened to Record<SuggestedToolCall, ...>');
    }

    if (failures.length > 0) {
      record(
        'SC-2: Typed Record<SuggestedToolCall, FixHandler> dispatch table with all 5 handlers; TOOL_FIELD_MAP also tightened',
        false,
        failures.join('; '),
      );
    } else {
      record(
        'SC-2: Typed Record<SuggestedToolCall, FixHandler> dispatch table with all 5 handlers; TOOL_FIELD_MAP also tightened',
        true,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — Success criterion 3: Pre-seed block seeds acc from
// finding.suggestedToolCallArgs.recommendedType BEFORE gap-fill elicitation.
// ---------------------------------------------------------------------------
{
  const toolsPath = path.join(repoRoot, 'src', 'tools', 'index.ts');
  let src;
  try {
    src = readFileSync(toolsPath, 'utf-8');
  } catch (err) {
    record(
      'SC-3: acc pre-seeded from finding.suggestedToolCallArgs.recommendedType before gap-fill (guarded)',
      false,
      `could not read ${toolsPath}: ${err.message}`,
    );
    src = null;
  }

  if (src !== null) {
    const failures = [];

    // Sub-check 3a: pre-seed reads finding.suggestedToolCallArgs
    if (!/finding\.suggestedToolCallArgs/.test(src)) {
      failures.push('finding.suggestedToolCallArgs reference not found');
    }

    // Sub-check 3b: specifically reads recommendedType
    if (!/args\[['"]recommendedType['"]\]/.test(src)) {
      failures.push("args['recommendedType'] accessor not found");
    }

    // Sub-check 3c: writes to acc.schemaTypes as an array
    if (!/acc\.schemaTypes\s*=\s*\[/.test(src)) {
      failures.push('acc.schemaTypes = [...] assignment not found');
    }

    // Sub-check 3d: guard prevents overwriting user-supplied values
    if (!/!acc\.schemaTypes/.test(src)) {
      failures.push('!acc.schemaTypes guard not found — pre-seed block may overwrite user-supplied values');
    }

    // Sub-check 3e: pre-seed block appears BEFORE gap-fill elicitation call,
    // within the gap-fill loop (for (const finding of selectedFindings) {...}).
    // Strategy: find the gap-fill loop, then check ordering of pre-seed vs elicitInput
    // within that loop by comparing indexOf positions in the source string.
    if (failures.length === 0) {
      const gapFillLoopRe = /for\s*\(\s*const\s+finding\s+of\s+selectedFindings\s*\)/;
      const gapFillMatch = gapFillLoopRe.exec(src);

      if (!gapFillMatch) {
        failures.push('gap-fill loop (for (const finding of selectedFindings)) not found');
      } else {
        // Find the gap-fill loop (first occurrence) and look within it for ordering.
        // We locate the text after the loop opening bracket to the point where
        // a new for loop starts (the execution loop, which is the second occurrence).
        const loopStart = gapFillMatch.index;

        // Find second occurrence of the same pattern (execution loop)
        const searchAfter = src.indexOf(gapFillMatch[0], loopStart + gapFillMatch[0].length);
        const gapFillLoopBody = searchAfter > loopStart
          ? src.slice(loopStart, searchAfter)
          : src.slice(loopStart);

        const preSeedIdx = gapFillLoopBody.indexOf('finding.suggestedToolCallArgs');
        const elicitIdx = gapFillLoopBody.indexOf('server.server.elicitInput');

        if (preSeedIdx === -1) {
          failures.push('finding.suggestedToolCallArgs not found within gap-fill loop body');
        } else if (elicitIdx === -1) {
          failures.push('server.server.elicitInput not found within gap-fill loop body');
        } else if (preSeedIdx >= elicitIdx) {
          failures.push(
            `pre-seed block (idx ${preSeedIdx}) appears AFTER elicitInput call (idx ${elicitIdx}) — ordering invariant violated`,
          );
        }
        // else: preSeedIdx < elicitIdx — ordering is correct
      }
    }

    if (failures.length > 0) {
      record(
        'SC-3: acc pre-seeded from finding.suggestedToolCallArgs.recommendedType before gap-fill (guarded)',
        false,
        failures.join('; '),
      );
    } else {
      record(
        'SC-3: acc pre-seeded from finding.suggestedToolCallArgs.recommendedType before gap-fill (guarded)',
        true,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4 — Success criterion 4: tsc --noEmit exits with code 0 (zero errors).
// ---------------------------------------------------------------------------
{
  try {
    execSync('npx tsc --noEmit', {
      cwd: repoRoot,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    // execSync throws on non-zero exit code
    record('SC-4: tsc --noEmit exits 0 (zero type errors)', true);
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    if (output.includes('error TS')) {
      record(
        'SC-4: tsc --noEmit exits 0 (zero type errors)',
        false,
        'tsc reported errors:\n' + output.trim(),
      );
    } else {
      // Non-TS error (e.g. npx not found, tsconfig missing)
      record(
        'SC-4: tsc --noEmit exits 0 (zero type errors)',
        false,
        'tsc invocation failed (non-TS error): ' + (err.message || String(err)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
const failures = results.filter((r) => !r.ok);
console.log(`\nPhase 15 smoke: ${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length > 0) {
  console.error('Phase 15 smoke FAILED — WIZ-01 / WIZ-02 / tsc-clean regression detected');
  process.exit(1);
}
console.log('All Phase 15 smoke checks passed. WIZ-01 (dispatch table) and WIZ-02 (pre-seed) confirmed.');
process.exit(0);
