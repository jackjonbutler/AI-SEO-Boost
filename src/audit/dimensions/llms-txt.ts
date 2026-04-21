// src/audit/dimensions/llms-txt.ts
// Checks whether a site exposes a spec-compliant llms.txt at its root.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isUrl } from '../types.js';
import type { AuditFinding, AuditFindingDiagnostics } from '../types.js';

export async function checkLlmsTxt(target: string): Promise<AuditFinding> {
  const dimension = 'llms-txt' as const;
  try {
    if (isUrl(target)) {
      const url = new URL('/llms.txt', target).href;
      let res: Response;
      let responseTimeMs: number;
      try {
        const startMs = Date.now();
        res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        responseTimeMs = Date.now() - startMs;
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return { dimension, status: 'warning', severity: 'medium', message: `Could not reach ${url}: ${msg}` };
      }
      const contentLengthHeader = res.headers.get('content-length');
      const diagnostics: AuditFindingDiagnostics = {
        checkedUrl: url,
        httpStatus: res.status,
        contentLength: contentLengthHeader !== null ? parseInt(contentLengthHeader, 10) : null,
        responseTimeMs,
      };
      if (res.status === 200) {
        return { dimension, status: 'pass', severity: 'low', message: 'llms.txt found at site root', diagnostics };
      }
      if (res.status === 404) {
        return {
          dimension,
          status: 'fail',
          severity: 'critical',
          message: 'llms.txt missing at site root',
          suggestedToolCall: 'generate_llms_txt',
          diagnostics,
        };
      }
      return {
        dimension,
        status: 'warning',
        severity: 'medium',
        message: `HTTP ${res.status} when probing ${url}`,
        diagnostics,
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
