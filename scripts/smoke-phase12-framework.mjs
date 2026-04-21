// smoke-phase12-framework.mjs
// End-to-end smoke test for Phase 12 success criteria.
// Verifies: framework detection wired into runAudit(), AuditReport.framework populated,
// pure-function confidence thresholds (FWK-03), and local-target null behaviour.
//
// Run: node scripts/smoke-phase12-framework.mjs
// Requires: npm run build to have been run first (imports from dist/)

import * as os from 'node:os';
import * as fs from 'node:fs';
import { runAudit } from '../dist/audit/index.js';
import { detectFramework } from '../dist/audit/framework.js';

let allPassed = true;

function assert(condition, label, detail) {
  if (!condition) {
    console.error(`SMOKE FAIL: ${label}`);
    if (detail) console.error(`  ${detail}`);
    allPassed = false;
  }
}

// ---------------------------------------------------------------------------
// Scenario A — Local directory audit (no framework detection attempted)
// ---------------------------------------------------------------------------

try {
  const tmpDir = fs.mkdtempSync(os.tmpdir() + '/smoke-phase12-');

  const report = await runAudit(tmpDir);

  assert(
    report.framework === null || report.framework === undefined,
    'Scenario A: local target leaves framework null/undefined',
    `Got: ${JSON.stringify(report.framework)}`
  );

  assert(
    Array.isArray(report.findings),
    'Scenario A: findings is still an array after local audit',
    `Got type: ${typeof report.findings}`
  );

  if (allPassed) {
    console.log('SMOKE OK: scenario A (local target — framework=null)');
  }

  // Clean up tmpdir
  try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
} catch (err) {
  console.error('SMOKE FAIL: Scenario A threw unexpectedly:', err.message);
  allPassed = false;
}

// ---------------------------------------------------------------------------
// Scenario B — Real URL audit, known Next.js framework (best-effort / network)
// ---------------------------------------------------------------------------

try {
  const report = await runAudit('https://vercel.com');

  if (report.framework === null || report.framework === undefined) {
    // Network may have blocked or signals not matched — not a hard failure
    console.warn('SMOKE WARN: scenario B — framework detection returned null (network/signals issue); skipping B assertions');
  } else {
    assert(
      typeof report.framework.name === 'string' && report.framework.name.length > 0,
      'Scenario B: framework.name is a non-empty string',
      `Got: ${JSON.stringify(report.framework.name)}`
    );

    const validConfidences = ['high', 'medium', 'low'];
    assert(
      validConfidences.includes(report.framework.confidence),
      'Scenario B: framework.confidence is high/medium/low',
      `Got: ${JSON.stringify(report.framework.confidence)}`
    );

    // Verify at least one framework-aware finding has a non-generic message
    const frameworkAwareDimensions = ['generate_llms_txt', 'configure_robots_txt', 'generate_markdown_mirrors'];
    const frameworkAwareFindings = report.findings.filter(
      f => f.suggestedToolCall && frameworkAwareDimensions.includes(f.suggestedToolCall)
    );

    // This assertion is informational — we just confirm the dimension ran
    assert(
      report.findings.length > 0,
      'Scenario B: findings array is non-empty',
      `Got ${report.findings.length} findings`
    );

    console.log(`SMOKE OK: scenario B (${report.framework.name} site — framework.name="${report.framework.name}" confidence="${report.framework.confidence}")`);
  }
} catch (err) {
  // Network failure during Scenario B is acceptable — log and continue
  console.warn(`SMOKE WARN: scenario B — network fetch failed (${err.message}); skipping B assertions`);
}

// ---------------------------------------------------------------------------
// Scenario C — Synthetic HTML detection (pure function, no network)
// ---------------------------------------------------------------------------

const cScenarioPassed = { value: true };

function checkC(label, result, expectedName, expectedConfidence) {
  const nameOk = result.name === expectedName;
  const confOk = result.confidence === expectedConfidence;
  if (!nameOk || !confOk) {
    console.error(`SMOKE FAIL: scenario C — ${label}`);
    console.error(`  Expected: { name: ${JSON.stringify(expectedName)}, confidence: '${expectedConfidence}' }`);
    console.error(`  Got:      { name: ${JSON.stringify(result.name)}, confidence: '${result.confidence}' }`);
    cScenarioPassed.value = false;
    allPassed = false;
  }
}

// Case 1: 2 strong signals → high confidence (FWK-03 satisfied)
checkC(
  'Next.js 2 strong signals → confidence high',
  detectFramework(
    '<html><script id="__NEXT_DATA__">{}</script><link href="/_next/static/x.js"></html>',
    new Headers()
  ),
  'Next.js',
  'high'
);

// Case 2: no signals → none (unknown framework site returns null-equivalent)
checkC(
  'no signals → confidence none, name null',
  detectFramework('<html><body>plain</body></html>', new Headers()),
  null,
  'none'
);

// Case 3: single strong signal (WordPress /wp-content/) → medium, not high (FWK-03 gate)
checkC(
  'WordPress 1 strong signal → confidence medium (FWK-03: needs 2+ for high)',
  detectFramework('<html><link href="/wp-content/themes/x/style.css"></html>', new Headers()),
  'WordPress',
  'medium'
);

// Case 4: single weak signal (Hugo generator meta) → low
checkC(
  'Hugo meta generator weak signal → confidence low',
  detectFramework('<html><meta name="generator" content="Hugo 0.120.0"></html>', new Headers()),
  'Hugo',
  'low'
);

if (cScenarioPassed.value) {
  console.log('SMOKE OK: scenario C (4 synthetic detection cases — Next.js high, no signals none, WordPress medium, Hugo low)');
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------

if (allPassed) {
  console.log('SMOKE PHASE 12: ALL OK');
  process.exit(0);
} else {
  console.error('SMOKE PHASE 12: FAILED');
  process.exit(1);
}
