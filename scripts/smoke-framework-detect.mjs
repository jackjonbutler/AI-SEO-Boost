// Smoke test for detectFramework() — validates all 4 confidence levels from the plan.
// Run: node scripts/smoke-framework-detect.mjs
// Expected output: SMOKE OK for each of the 4 cases.

import { detectFramework } from '../dist/audit/framework.js';

let allPassed = true;

function check(label, result, expectedName, expectedConfidence) {
  const nameOk = result.name === expectedName;
  const confOk = result.confidence === expectedConfidence;
  if (nameOk && confOk) {
    console.log(`SMOKE OK: ${label}`);
  } else {
    console.error(`SMOKE FAIL: ${label}`);
    console.error(`  Expected: { name: ${JSON.stringify(expectedName)}, confidence: '${expectedConfidence}' }`);
    console.error(`  Got:      { name: ${JSON.stringify(result.name)}, confidence: '${result.confidence}' }`);
    allPassed = false;
  }
}

// Case 1: 2 strong signals → confidence 'high'
check(
  'Next.js 2-strong → high',
  detectFramework(
    '<html><script id="__NEXT_DATA__">{}</script><link href="/_next/static/chunks/app.js"></html>',
    new Headers()
  ),
  'Next.js',
  'high'
);

// Case 2: no signals → none
check(
  'no signals → none',
  detectFramework('<html>nothing here</html>', new Headers()),
  null,
  'none'
);

// Case 3: 1 strong signal → confidence 'medium'
check(
  'Next.js 1-strong → medium',
  detectFramework('<html><link href="/_next/static/x.js"></html>', new Headers()),
  'Next.js',
  'medium'
);

// Case 4: 1 weak signal (Hugo generator meta) → confidence 'low'
check(
  'Hugo generator meta → low',
  detectFramework('<html><meta name="generator" content="Hugo 0.120"></html>', new Headers()),
  'Hugo',
  'low'
);

if (!allPassed) {
  process.exit(1);
}
