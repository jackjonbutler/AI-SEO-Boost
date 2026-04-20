// src/audit/types.ts
// Shared types and helpers for the audit engine.
// No I/O here — pure types and URL utilities only.

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AuditDimension = 'llms-txt' | 'schema' | 'robots-ai' | 'faq' | 'markdown-mirrors';

export interface AuditFinding {
  dimension: AuditDimension;
  status: 'pass' | 'fail' | 'warning';
  severity: Severity;
  message: string;
  suggestedToolCall?: string;
}

export interface AuditReport {
  target: string;
  generatedAt: string;
  findings: AuditFinding[];
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
