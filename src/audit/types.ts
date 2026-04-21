// src/audit/types.ts
// Shared types and helpers for the audit engine.
// No I/O here — pure types and URL utilities only.

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AuditDimension = 'llms-txt' | 'schema' | 'robots-ai' | 'faq' | 'markdown-mirrors';

export type FrameworkConfidence = 'high' | 'medium' | 'low' | 'none';

export interface FrameworkDetection {
  /** Detected framework name, e.g. "Next.js", "WordPress", "Nuxt". Null when no signals matched. */
  name: string | null;
  /** Confidence level. 'high' requires 2+ independent signals (FWK-03). */
  confidence: FrameworkConfidence;
}

export interface AuditFindingDiagnostics {
  /** The exact URL that was probed (e.g. "https://example.com/llms.txt"). */
  checkedUrl: string;
  /** HTTP status code received (e.g. 200, 404, 403). */
  httpStatus: number;
  /** Response body byte count from Content-Length header; null if header absent. */
  contentLength: number | null;
  /** Wall-clock milliseconds from request start to response headers received. */
  responseTimeMs: number;
}

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;
  /** Pre-seeded args for wizard tool dispatch. Populated in Phase 15; declared here for type compatibility. */
  suggestedToolCallArgs?: Record<string, unknown>;
  /** HTTP evidence block — present when dimension made a targeted fetch. */
  diagnostics?: AuditFindingDiagnostics;
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
  /** URLs probed during this audit run. Undefined if no dimension captured diagnostics. */
  pagesAudited?: string[];
  /** Detected web framework (Next.js, WordPress, etc.) with confidence level. Null when detection attempted but no signals matched. Undefined when target is local (no detection attempted). */
  framework?: FrameworkDetection | null;
}

/**
 * Returns true if target is an http: or https: URL.
 * All other values (local paths, empty strings, ftp://, etc.) return false.
 */
export function isUrl(target: string): boolean {
  try {
    const u = new URL(target);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Returns the origin of a URL (e.g. 'https://example.com').
 * Callers must only pass URLs that pass isUrl().
 */
export function originFor(url: string): string {
  return new URL(url).origin;
}
