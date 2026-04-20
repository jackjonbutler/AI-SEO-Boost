/**
 * scripts/smoke-audit-wizard-fork.mjs
 *
 * Smoke test for the audit_ai_seo wizard-fork feature (Phase 7 + Phase 8).
 *
 * Exercises six scenarios against the real audit_ai_seo handler via an
 * in-process MCP Client<->Server pair backed by InMemoryTransport:
 *
 *   Scenario A — Wizard path, accept-all:  client accepts mode='wizard', then accepts all issues
 *   Scenario B — Report path:              client accepts mode='report'  (unchanged from Phase 7)
 *   Scenario C — Fallback path:            client has no elicitation capability (unchanged from Phase 7)
 *   Scenario D — Wizard, deselect-all:     client accepts mode='wizard', then submits empty selection
 *   Scenario E — Wizard, cancel selection: client accepts mode='wizard', then cancels the selection form
 *   Scenario F — All-pass short-circuit:   static check that the all-pass guard string is wired in source
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
// Scenario A: Wizard path — accept all selected issues
// Client advertises elicitation capability.
// First elicit call: mode='wizard'. Second elicit call: accept all pre-selected issues.
// Asserts the response contains the Phase 8 envelope with selectedFindings.
// ---------------------------------------------------------------------------
async function scenarioA() {
  const label = 'Scenario A (wizard path — accept-all)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-a', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  // Stateful two-call handler: first call = mode fork, second call = issue selection.
  let callCount = 0;
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    callCount += 1;
    if (callCount === 1) {
      // First call: mode fork — choose wizard
      return { action: 'accept', content: { mode: 'wizard' } };
    }
    // Second call: issue selection — extract default keys from schema and accept all
    const defaultSelection = req.params?.requestedSchema?.properties?.selectedIssues?.default ?? [];
    return { action: 'accept', content: { selectedIssues: defaultSelection } };
  });

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('Issue selection complete — fix generation lands in Phase 9'),
    label,
    `response missing Phase 8 marker. Got: ${text.slice(0, 300)}`,
  );
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    assert(false, label, `response is not valid JSON: ${text.slice(0, 300)}`);
  }
  assert(
    Array.isArray(parsed.selectedFindings),
    label,
    `parsed response missing 'selectedFindings' array. Got keys: ${Object.keys(parsed).join(', ')}`,
  );
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
// Main
// ---------------------------------------------------------------------------
async function main() {
  await scenarioA();   // wizard accept-all
  await scenarioB();   // report path
  await scenarioC();   // elicitation-unsupported fallback
  await scenarioD();   // wizard deselect-all
  await scenarioE();   // wizard cancel selection
  await scenarioF();   // all-pass short-circuit (static)
  process.stdout.write('SMOKE OK\n');
}

main().catch((err) => {
  process.stderr.write(`SMOKE FAIL: unexpected error — ${err?.message ?? String(err)}\n`);
  process.exit(1);
});
