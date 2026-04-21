// src/audit/index.ts
// Orchestrates all 5 audit dimensions in parallel and returns a severity-sorted AuditReport.

import * as fs from 'node:fs/promises';
import { isUrl } from './types.js';
import type { AuditReport, Severity } from './types.js';
import { checkLlmsTxt } from './dimensions/llms-txt.js';
import { checkRobotsTxtAiAccess } from './dimensions/robots-txt.js';
import { checkSchemaMarkup } from './dimensions/schema.js';
import { checkFaq } from './dimensions/faq.js';
import { checkMarkdownMirrors } from './dimensions/markdown.js';
import { fetchAndDetectFramework } from './framework.js';
import type { BusinessContext } from '../types/index.js';

export async function runAudit(
  target: string,
  businessContext?: BusinessContext | null
): Promise<AuditReport> {
  if (!target || typeof target !== 'string' || target.trim().length === 0) {
    throw new Error('target must be a non-empty string');
  }

  const trimmed = target.trim();
  let probe: string;

  if (isUrl(trimmed)) {
    // Use the origin so all dimensions probe the root, not a deep path.
    probe = new URL(trimmed).origin;
  } else {
    // Local folder — confirm it exists before spawning 5 parallel checks.
    try {
      await fs.access(trimmed);
    } catch {
      throw new Error(`Local target does not exist: ${trimmed}`);
    }
    probe = trimmed;
  }

  // Framework detection runs first so its result can be passed to the 3 framework-aware dimensions.
  // For local targets, fetchAndDetectFramework returns null immediately (no I/O cost).
  const frameworkDetection = await fetchAndDetectFramework(probe);

  const findings = await Promise.all([
    checkLlmsTxt(probe, frameworkDetection),
    checkRobotsTxtAiAccess(probe, frameworkDetection),
    checkSchemaMarkup(probe, businessContext),
    checkFaq(probe),
    checkMarkdownMirrors(probe, frameworkDetection),
  ]);

  // Collect URLs actually probed by dimension checks (DIAG-03).
  // Only dimensions wired with diagnostics (llms-txt, robots-ai) contribute.
  // If no finding has diagnostics, pagesAudited is undefined — not an empty array.
  const probedUrls = findings
    .map(f => f.diagnostics?.checkedUrl)
    .filter((u): u is string => u !== undefined);
  const pagesAudited = probedUrls.length > 0 ? probedUrls : undefined;

  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    target: trimmed,
    generatedAt: new Date().toISOString(),
    findings,
    pagesAudited,
    framework: frameworkDetection,
  };
}
