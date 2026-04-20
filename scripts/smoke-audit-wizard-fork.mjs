/**
 * scripts/smoke-audit-wizard-fork.mjs
 *
 * Smoke test for the audit_ai_seo wizard-fork feature (Phases 7, 8, 9).
 *
 * Exercises nine scenarios against the real audit_ai_seo handler via an
 * in-process MCP Client<->Server pair backed by InMemoryTransport:
 *
 *   Scenario A — Wizard path, accept-all:  client accepts mode='wizard', accepts all issues, accepts gap-fills
 *   Scenario B — Report path:              client accepts mode='report'  (unchanged from Phase 7)
 *   Scenario C — Fallback path:            client has no elicitation capability (unchanged from Phase 7)
 *   Scenario D — Wizard, deselect-all:     client accepts mode='wizard', then submits empty selection
 *   Scenario E — Wizard, cancel selection: client accepts mode='wizard', then cancels the selection form
 *   Scenario F — All-pass short-circuit:   static check that the all-pass guard string is wired in source
 *   Scenario G — CTX-01 upfront context:   full businessContext provided; no businessContext keys in gap-fills
 *   Scenario H — CTX-02 lazy gather:       no upfront context; fields asked lazily when needed by tool
 *   Scenario I — CTX-03 carry-forward:     no upfront context; gap-fill schemas have disjoint key sets
 *
 * Run after `npm run build`:
 *   node scripts/smoke-audit-wizard-fork.mjs
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerAllTools } from '../dist/tools/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition, scenario, reason) {
  if (!condition) {
    process.stderr.write(`SMOKE FAIL: ${scenario} - ${reason}\n`);
    process.exit(1);
  }
}

/**
 * Create a fresh McpServer + linked transport pair.
 * Returns { server, serverTransport } ready to connect.
 */
function createServer() {
  const server = new McpServer({ name: 'smoke', version: '0.0.0' });
  registerAllTools(server);
  return server;
}

/**
 * Wire a server and client together over InMemoryTransport.
 * Returns the connected client.
 */
async function connect(server, clientInfo, clientOptions) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client(clientInfo, clientOptions);
  await client.connect(clientTransport);
  return client;
}

// ---------------------------------------------------------------------------
// Helper: synthesize a gap-fill accept response for any requestedSchema.
// Records all property keys into the `seen` Set (pass null to skip tracking).
// Returns string fields as '/tmp/smoke-placeholder', arrays as ['LocalBusiness'].
// ---------------------------------------------------------------------------
function synthesizeGapFillResponse(req, seen) {
  const props = req.params?.requestedSchema?.properties ?? {};
  const content = {};
  for (const [key, schema] of Object.entries(props)) {
    if (seen) seen.add(key);
    if (schema && schema.type === 'array') {
      content[key] = ['LocalBusiness'];
    } else {
      content[key] = '/tmp/smoke-placeholder';
    }
  }
  return { action: 'accept', content };
}

// ---------------------------------------------------------------------------
// Scenario A: Wizard path — accept all selected issues (Phase 9 updated)
// Client advertises elicitation capability.
// Call 1: mode='wizard'. Call 2: accept all pre-selected issues.
// Calls 3+: generic gap-fill accept (Phase 9 accumulator may ask for tool fields).
// Asserts the response contains the Phase 9 envelope with all four keys.
// ---------------------------------------------------------------------------
async function scenarioA() {
  const label = 'Scenario A (wizard path — accept-all, Phase 9 envelope)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-a', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  // Stateful handler: call 1 = mode fork, call 2 = issue selection, calls 3+ = gap-fills.
  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) {
      // First call: mode fork — choose wizard
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    if (callCount === 2) {
      // Second call: issue selection — extract default keys from schema and accept all
      const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
      return { action: 'accept', content: { selectedIssues: defaultSelection } };
    }
    // Calls 3+: Phase 9 gap-fill — accept with synthesized values
    return synthesizeGapFillResponse(req, null);
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Context accumulation complete — tool execution lands in Phase 10'),
    label,
    `response missing Phase 9 marker. Got: ${text.slice(0, 300)}`,
  );
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 300)}`);
  }
  assert(Array.isArray(parsed.selectedFindings), label, `parsed response missing 'selectedFindings' array. Got keys: ${Object.keys(parsed).join(', ')}`);
  assert(Array.isArray(parsed.skippedFindings), label, `parsed response missing 'skippedFindings' array. Got keys: ${Object.keys(parsed).join(', ')}`);
  assert(typeof parsed.accumulatedContext === 'object' && parsed.accumulatedContext !== null, label, `parsed response missing 'accumulatedContext' object`);
  assert(typeof parsed.contextSummary === 'string', label, `parsed response missing 'contextSummary' string`);
  assert(
    parsed.selectedFindings.length > 0,
    label,
    `selectedFindings is empty — expected at least one actionable finding from repo audit`,
  );

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario B: Report path
// Client advertises elicitation capability; handler returns mode='report'.
// Also exercises businessContext pass-through.
// Asserts the response is a JSON AuditReport with target and findings keys.
// ---------------------------------------------------------------------------
async function scenarioB() {
  const label = 'Scenario B (report path)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-b', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  // Register elicitation handler: accept report mode
  client.setRequestHandler(ElicitRequestSchema, async (_req) => ({
    action: 'accept',
    content: { mode: 'report' },
  }));

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: {
      target: process.cwd(),
      businessContext: { businessName: 'Smoke Test Co', businessType: 'test' },
    },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 200)}`);
  }
  assert('target' in parsed, label, `parsed response missing 'target' key`);
  assert('findings' in parsed, label, `parsed response missing 'findings' key`);

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario C: Elicitation-unsupported fallback
// Client has NO elicitation capability — server throws on elicitInput.
// Asserts the tool still returns a valid AuditReport (not an error).
// ---------------------------------------------------------------------------
async function scenarioC() {
  const label = 'Scenario C (fallback path)';
  const server = createServer();
  // No capabilities.elicitation — server will throw, handler should catch and fall back
  const client = await connect(
    server,
    { name: 'smoke-c', version: '0.0.0' },
    { capabilities: {} },
  );

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 200)}`);
  }
  assert('target' in parsed, label, `parsed response missing 'target' key`);
  assert('findings' in parsed, label, `parsed response missing 'findings' key`);

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario D: Wizard path — deselect-all (empty selection)
// Client accepts mode='wizard' on first elicit, then submits empty selectedIssues.
// Asserts the response contains 'No issues selected' and no 'selectedFindings' key.
// ---------------------------------------------------------------------------
async function scenarioD() {
  const label = 'Scenario D (wizard — deselect-all)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-d', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (_req) => {
    callCount += 1;
    if (callCount === 1) {
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    // Second call: user deselected everything
    return { action: 'accept', content: { selectedIssues: [] } };
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('No issues selected'),
    label,
    `response missing 'No issues selected' message. Got: ${text.slice(0, 200)}`,
  );
  assert(
    !text.includes('selectedFindings'),
    label,
    `response unexpectedly contains 'selectedFindings'. Got: ${text.slice(0, 200)}`,
  );

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario E: Wizard path — cancel selection
// Client accepts mode='wizard' on first elicit, then cancels the selection form.
// Asserts the response contains 'Issue selection cancelled' and isError is not true.
// ---------------------------------------------------------------------------
async function scenarioE() {
  const label = 'Scenario E (wizard — cancel selection)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-e', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (_req) => {
    callCount += 1;
    if (callCount === 1) {
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    // Second call: user closed/cancelled the selection form
    return { action: 'cancel', content: {} };
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true — cancel should be graceful, not an error`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Issue selection cancelled'),
    label,
    `response missing 'Issue selection cancelled' message. Got: ${text.slice(0, 200)}`,
  );

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario F: All-pass short-circuit (static verification)
// Verifies the all-pass guard is wired in src/tools/index.ts without needing
// a full passing fixture directory. A future integration test could replace
// this with a runtime check against a fixture that passes all 5 dimensions.
// ---------------------------------------------------------------------------
async function scenarioF() {
  const label = 'Scenario F (all-pass short-circuit)';
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/tools/index.ts', import.meta.url), 'utf-8');
  assert(
    src.includes('All 5 dimensions are passing'),
    label,
    'all-pass guard message not found in src/tools/index.ts',
  );
  assert(
    src.includes('actionableFindings.length === 0'),
    label,
    'all-pass short-circuit condition not found in src/tools/index.ts',
  );
}

// ---------------------------------------------------------------------------
// Scenario G: CTX-01 — upfront businessContext reuse
// Full businessContext provided. Asserts that no businessContext field key
// (businessName, businessType, location, services, website, phoneNumber,
// description) appears in any gap-fill elicitation schema after call 2.
// Tool-specific fields (outputPath, robotsPath, etc.) may still be asked.
// ---------------------------------------------------------------------------
async function scenarioG() {
  const label = 'Scenario G (CTX-01 upfront context — no businessContext field re-ask)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-g', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  const businessContextKeys = new Set([
    'businessName', 'businessType', 'location', 'services',
    'website', 'phoneNumber', 'description',
  ]);

  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) {
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    if (callCount === 2) {
      const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
      return { action: 'accept', content: { selectedIssues: defaultSelection } };
    }
    // Call 3+: gap-fill — assert no businessContext keys appear in schema
    const props = req.params?.requestedSchema?.properties ?? {};
    for (const key of Object.keys(props)) {
      assert(
        !businessContextKeys.has(key),
        label,
        `Gap-fill elicitation (call ${callCount}) asked for businessContext field '${key}' — CTX-01 violated (field was provided upfront)`,
      );
    }
    return synthesizeGapFillResponse(req, null);
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: {
      target: process.cwd(),
      businessContext: {
        businessName: 'Acme Wraps',
        businessType: 'vehicle wrap shop',
        location: 'Denver, CO',
        services: ['Vehicle wraps', 'Fleet graphics'],
        website: 'https://acmewraps.com',
        phoneNumber: '303-555-0100',
        description: "Acme Wraps is Denver's premier vehicle wrap studio.",
      },
    },
  });

  assert(!result.isError, label, `tool returned isError: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Context accumulation complete'),
    label,
    `Phase 9 marker missing. Got: ${text.slice(0, 200)}`,
  );
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 300)}`);
  }
  assert(
    parsed.accumulatedContext?.businessName === 'Acme Wraps',
    label,
    `accumulatedContext.businessName should be 'Acme Wraps', got: ${parsed.accumulatedContext?.businessName}`,
  );

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario H: CTX-02 — lazy gather (no upfront context)
// No businessContext argument. Fields are asked lazily only when a tool needs them.
// Proves that required businessContext fields appear in gap-fills when relevant tools fire,
// and that businessName appears at most once across all gap-fills (CTX-03 implied).
// ---------------------------------------------------------------------------
async function scenarioH() {
  const label = 'Scenario H (CTX-02 lazy gather — no upfront context)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-h', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  let callCount = 0;
  let businessNameAskCount = 0;
  const allPropertiesSeen = [];

  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) {
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    if (callCount === 2) {
      const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
      return { action: 'accept', content: { selectedIssues: defaultSelection } };
    }
    // Call 3+: track all properties seen
    const props = req.params?.requestedSchema?.properties ?? {};
    const keys = Object.keys(props);
    allPropertiesSeen.push(...keys);
    if (keys.includes('businessName')) businessNameAskCount += 1;
    return synthesizeGapFillResponse(req, null);
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Context accumulation complete'),
    label,
    `Phase 9 marker missing. Got: ${text.slice(0, 200)}`,
  );
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 300)}`);
  }

  // Determine which tools fired — if any of the businessName-requiring tools appeared,
  // businessName should have been asked exactly once
  const contextTools = new Set(['generate_llms_txt', 'generate_schema_markup', 'generate_faq_content']);
  const contextToolFired = parsed.selectedFindings?.some(
    (f) => f.suggestedToolCall && contextTools.has(f.suggestedToolCall),
  ) ?? false;

  if (contextToolFired) {
    assert(
      businessNameAskCount >= 1,
      label,
      `businessName should have been asked at least once (contextToolFired=true), but was not asked`,
    );
    assert(
      businessNameAskCount === 1,
      label,
      `businessName was asked ${businessNameAskCount} times — should be asked exactly once (CTX-03 carry-forward)`,
    );
    // Verify the accumulated context received the placeholder value
    assert(
      parsed.accumulatedContext?.businessName === '/tmp/smoke-placeholder',
      label,
      `accumulatedContext.businessName should be '/tmp/smoke-placeholder', got: ${parsed.accumulatedContext?.businessName}`,
    );
  }
  // If no contextTool fired, businessName should not have been asked
  if (!contextToolFired) {
    assert(
      businessNameAskCount === 0,
      label,
      `businessName asked ${businessNameAskCount} times despite no contextTool firing`,
    );
  }

  await client.close();
}

// ---------------------------------------------------------------------------
// Scenario I: CTX-03 — carry-forward proof (disjoint gap-fill key sets)
// No upfront context. Asserts that no property key appears in more than one
// gap-fill elicitation schema — proving each field is asked at most once.
// ---------------------------------------------------------------------------
async function scenarioI() {
  const label = 'Scenario I (CTX-03 carry-forward — disjoint gap-fill schemas)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-i', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  let callCount = 0;
  const seenKeys = new Set();

  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) {
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    if (callCount === 2) {
      const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
      return { action: 'accept', content: { selectedIssues: defaultSelection } };
    }
    // Call 3+: assert every property key in this gap-fill is NEW (not seen before)
    const props = req.params?.requestedSchema?.properties ?? {};
    for (const key of Object.keys(props)) {
      assert(
        !seenKeys.has(key),
        label,
        `Gap-fill call ${callCount} asked for property '${key}' which was already asked in a previous gap-fill — CTX-03 violated`,
      );
      seenKeys.add(key);
    }
    return synthesizeGapFillResponse(req, null);
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Context accumulation complete'),
    label,
    `Phase 9 marker missing. Got: ${text.slice(0, 200)}`,
  );

  await client.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await scenarioA();   // wizard accept-all (Phase 9 envelope)
  await scenarioB();   // report path
  await scenarioC();   // elicitation-unsupported fallback
  await scenarioD();   // wizard deselect-all
  await scenarioE();   // wizard cancel selection
  await scenarioF();   // all-pass short-circuit (static)
  await scenarioG();   // CTX-01 upfront context — no businessContext re-ask
  await scenarioH();   // CTX-02 lazy gather — no upfront context
  await scenarioI();   // CTX-03 carry-forward — disjoint gap-fill schemas
  process.stdout.write('SMOKE OK\n');
}

main().catch((err) => {
  process.stderr.write(`SMOKE FAIL: unexpected error — ${err?.message ?? String(err)}\n`);
  process.exit(1);
});
