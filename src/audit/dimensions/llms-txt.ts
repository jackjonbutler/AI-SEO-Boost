// src/audit/dimensions/llms-txt.ts
// Checks whether a site exposes a spec-compliant llms.txt at its root.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isUrl } from '../types.js';
import type { AuditFinding } from '../types.js';

export async function checkLlmsTxt(target: string): Promise<AuditFinding> {
  const dimension = 'llms-txt' as const;
  try {
    if (isUrl(target)) {
      const url = new URL('/llms.txt', target).href;
      let res: Response;
      try {
        res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return { dimension, status: 'warning', severity: 'medium', message: `Could not reach ${url}: ${msg}` };
      }
      if (res.status === 200) {
        return { dimension, status: 'pass', severity: 'low', message: 'llms.txt found at site root' };
      }
      if (res.status === 404) {
        return {
          dimension,
          status: 'fail',
          severity: 'critical',
          message: 'llms.txt missing at site root',
          suggestedToolCall: 'generate_llms_txt',
        };
      }
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: `Unexpected HTTP status ${res.status} when probing ${url}`,
      };
    }

    // Local folder path
    try {
      await fs.access(path.join(target, 'llms.txt'));
      return { dimension, status: 'pass', severity: 'low', message: 'llms.txt found in folder root' };
    } catch (accessErr) {
      const code = (accessErr as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          dimension,
          status: 'fail',
          severity: 'critical',
          message: 'llms.txt missing from folder root',
          suggestedToolCall: 'generate_llms_txt',
        };
      }
      const msg = accessErr instanceof Error ? accessErr.message : String(accessErr);
      return { dimension, status: 'warning', severity: 'medium', message: `Could not check llms.txt: ${msg}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { dimension, status: 'warning', severity: 'medium', message: `Unexpected error checking llms.txt: ${msg}` };
  }
}
