// scripts/smoke-phase13-schema.mjs
// End-to-end regression gate for SCH-01, SCH-02, and SCH-03.
// Tests checkSchemaMarkup() directly via compiled dist/ using local temp HTML fixtures.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSchemaMarkup } from '../dist/audit/dimensions/schema.js';

const tmp = join(tmpdir(), 'smoke-phase13-' + Date.now());
mkdirSync(tmp, { recursive: true });

function writeHtml(dir, types) {
  const ldJson = types.map(t =>
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${t}"}</script>`
  ).join('\n');
  writeFileSync(join(dir, 'index.html'), `<html><head>${ldJson}</head><body></body></html>`);
}

try {
  // Scenario A (SCH-01): SaaS businessContext + SoftwareApplication in HTML → pass
  const dirA = join(tmp, 'saas');
  mkdirSync(dirA);
  writeHtml(dirA, ['SoftwareApplication']);
  const resultA = await checkSchemaMarkup(dirA, { businessName: 'TestApp', businessType: 'saas' });
  assert.equal(resultA.status, 'pass', `SCH-01 SaaS pass: expected pass, got ${resultA.status} — ${resultA.message}`);
  console.log('SMOKE OK: SCH-01 saas + SoftwareApplication → pass');

  // Scenario B (SCH-01): SaaS businessContext + LocalBusiness in HTML → warning (not a subtype match)
  const dirB = join(tmp, 'saas-wrong');
  mkdirSync(dirB);
  writeHtml(dirB, ['LocalBusiness']);
  const resultB = await checkSchemaMarkup(dirB, { businessName: 'TestApp', businessType: 'saas' });
  assert.equal(resultB.status, 'warning', `SCH-01 SaaS wrong type: expected warning, got ${resultB.status}`);
  assert.ok(resultB.suggestedToolCallArgs?.recommendedType === 'SoftwareApplication', `SCH-03: recommendedType should be SoftwareApplication, got ${resultB.suggestedToolCallArgs?.recommendedType}`);
  console.log('SMOKE OK: SCH-01 saas + LocalBusiness → warning + recommendedType=SoftwareApplication');

  // Scenario C (SCH-01): Restaurant businessContext + LocalBusiness in HTML → pass (LocalBusiness accepted as parent)
  const dirC = join(tmp, 'restaurant-parent');
  mkdirSync(dirC);
  writeHtml(dirC, ['LocalBusiness']);
  const resultC = await checkSchemaMarkup(dirC, { businessName: 'Bistro', businessType: 'restaurant' });
  assert.equal(resultC.status, 'pass', `SCH-01 restaurant parent type: expected pass (LocalBusiness accepted for Restaurant), got ${resultC.status} — ${resultC.message}`);
  console.log('SMOKE OK: SCH-01 restaurant + LocalBusiness → pass (parent accepted)');

  // Scenario D (SCH-02): No businessContext + any @type present → pass
  const dirD = join(tmp, 'any-type');
  mkdirSync(dirD);
  writeHtml(dirD, ['Organization']);
  const resultD = await checkSchemaMarkup(dirD, undefined);
  assert.equal(resultD.status, 'pass', `SCH-02 no context + any type: expected pass, got ${resultD.status}`);
  console.log('SMOKE OK: SCH-02 no businessContext + Organization → pass');

  // Scenario E (SCH-02): No businessContext + no JSON-LD → fail
  const dirE = join(tmp, 'no-schema');
  mkdirSync(dirE);
  writeFileSync(join(dirE, 'index.html'), '<html><head></head><body></body></html>');
  const resultE = await checkSchemaMarkup(dirE, undefined);
  assert.equal(resultE.status, 'fail', `SCH-02 no context + no schema: expected fail, got ${resultE.status}`);
  assert.ok(resultE.suggestedToolCallArgs?.recommendedType, `SCH-03: recommendedType should be present on fail, got ${resultE.suggestedToolCallArgs?.recommendedType}`);
  console.log('SMOKE OK: SCH-02 no businessContext + no JSON-LD → fail + recommendedType present');

  // Scenario F (SCH-03): Fail path has suggestedToolCallArgs.recommendedType
  // Also verify for saas fail path explicitly
  const dirF = join(tmp, 'saas-no-schema');
  mkdirSync(dirF);
  writeFileSync(join(dirF, 'index.html'), '<html><head></head><body></body></html>');
  const resultF = await checkSchemaMarkup(dirF, { businessName: 'App', businessType: 'saas' });
  assert.equal(resultF.status, 'fail', `SCH-03 saas fail: expected fail, got ${resultF.status}`);
  assert.equal(resultF.suggestedToolCallArgs?.recommendedType, 'SoftwareApplication', `SCH-03: recommendedType should be SoftwareApplication, got ${resultF.suggestedToolCallArgs?.recommendedType}`);
  console.log('SMOKE OK: SCH-03 saas fail → suggestedToolCallArgs.recommendedType=SoftwareApplication');

  console.log('\nAll Phase 13 smoke scenarios passed. SCH-01, SCH-02, SCH-03 closed.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
