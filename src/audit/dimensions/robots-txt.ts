// src/audit/dimensions/robots-txt.ts
// Checks whether a site's robots.txt explicitly allows the key AI crawlers.
// Re-exports AI_BOTS from src/generators/files/robots-txt.ts — single source of truth.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AI_BOTS } from '../../generators/files/robots-txt.js';
import { isUrl, originFor } from '../types.js';
import type { AuditFinding } from '../types.js';

// Re-export so audit consumers can reference the canonical list.
export { AI_BOTS } from '../../generators/files/robots-txt.js';

function botAlreadyPresent(content: string, botName: string): boolean {
  return new RegExp(`^\\s*user-agent:\\s*${botName}\\s*$`, 'im').test(content);
}

export async function checkRobotsTxtAiAccess(target: string): Promise<AuditFinding> {
  const dimension = 'robots-ai' as const;
  try {
    if (isUrl(target)) {
      const robotsUrl = `${originFor(target)}/robots.txt`;
      let res: Response;
      let text: string;
      try {
        res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
        text = await res.text();
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return { dimension, status: 'warning', severity: 'medium', message: `Could not fetch ${robotsUrl}: ${msg}` };
      }
      if (res.status === 404) {
        return {
          dimension,
          status: 'fail',
          severity: 'high',
          message: 'robots.txt not found (404) — no AI crawler rules defined',
          suggestedToolCall: 'configure_robots_txt',
        };
      }
      const missing = AI_BOTS.filter(b => !botAlreadyPresent(text, b));
      if (missing.length === 0) {
        return { dimension, status: 'pass', severity: 'low', message: 'All AI crawler rules present in robots.txt' };
      }
      return {
        dimension,
        status: 'fail',
        severity: 'high',
        message: `Missing AI crawler rules for: ${missing.join(', ')}`,
        suggestedToolCall: 'configure_robots_txt',
      };
    }

    // Local folder path
    let text: string;
    try {
      text = await fs.readFile(path.join(target, 'robots.txt'), 'utf-8');
    } catch (readErr) {
      const code = (readErr as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          dimension,
          status: 'fail',
          severity: 'high',
          message: 'robots.txt not found in folder root — no AI crawler rules defined',
          suggestedToolCall: 'configure_robots_txt',
        };
      }
      const msg = readErr instanceof Error ? readErr.message : String(readErr);
      return { dimension, status: 'warning', severity: 'medium', message: `Could not read robots.txt: ${msg}` };
    }
    const missing = AI_BOTS.filter(b => !botAlreadyPresent(text, b));
    if (missing.length === 0) {
      return { dimension, status: 'pass', severity: 'low', message: 'All AI crawler rules present in robots.txt' };
    }
    return {
      dimension,
      status: 'fail',
      severity: 'high',
      message: `Missing AI crawler rules for: ${missing.join(', ')}`,
      suggestedToolCall: 'configure_robots_txt',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking robots.txt: ${msg}` };
  }
}
