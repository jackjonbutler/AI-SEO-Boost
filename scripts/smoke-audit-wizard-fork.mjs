/**
 * scripts/smoke-audit-wizard-fork.mjs
 *
 * Smoke test for the audit_ai_seo wizard-fork feature (Phase 7).
 *
 * Exercises three scenarios against the real audit_ai_seo handler via an
 * in-process MCP Client<->Server pair backed by InMemoryTransport:
 *
 *   Scenario A — Wizard path:   client accepts with mode='wizard'
 *   Scenario B — Report path:   client accepts with mode='report'
 *   Scenario C — Fallback path: client has no elicitation capability
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
// Scenario A: Wizard path
// Client advertises elicitation capability; handler returns mode='wizard'.
// Asserts the response contains the wizard envelope with the '[wizard] Phase 7 stub' marker.
// ---------------------------------------------------------------------------
async function scenarioA() {
  const label = 'Scenario A (wizard path)';
  const server = createServer();
  const client = await connect(
    server,
    { name: 'smoke-a', version: '0.0.0' },
    { capabilities: { elicitation: { form: {} } } },
  );

  // Register elicitation handler: accept wizard mode
  client.setRequestHandler(ElicitRequestSchema, async (_req) => ({
    action: 'accept',
    content: { mode: 'wizard' },
  }));

  const result = await client.callTool({
    name: 'audit_ai_seo',
    arguments: { target: process.cwd() },
  });

  assert(!result.isError, label, `tool returned isError=true: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text ?? '';
  assert(
    text.includes('[wizard] Phase 7 stub'),
    label,
    `response missing '[wizard] Phase 7 stub' marker. Got: ${text.slice(0, 200)}`,
  );
  assert(
    text.includes('"report"'),
    label,
    `response missing '"report"' key in wizard envelope. Got: ${text.slice(0, 200)}`,
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
// Main
// ---------------------------------------------------------------------------
async function main() {
  await scenarioA();
  await scenarioB();
  await scenarioC();
  process.stdout.write('SMOKE OK\n');
}

main().catch((err) => {
  process.stderr.write(`SMOKE FAIL: unexpected error — ${err?.message ?? String(err)}\n`);
  process.exit(1);
});
