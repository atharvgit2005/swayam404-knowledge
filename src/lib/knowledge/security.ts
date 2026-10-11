/**
 * Security and version comparison utilities for Swayam404 Knowledge Base
 */

/**
 * Validates a relative file path inside the knowledge-base repository.
 * Strictly rejects path traversal (..), absolute paths, backslashes, null bytes,
 * and malicious patterns that could escape the root repository directory.
 */
export function validateRelativeRepoPath(relativePath: string): {
  isValid: boolean;
  error?: string;
  normalizedPath?: string;
} {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    return { isValid: false, error: 'Path must be a non-empty string.' };
  }

  const clean = relativePath.trim();

  // Reject null bytes
  if (clean.includes('\0')) {
    return { isValid: false, error: 'Path contains forbidden null byte.' };
  }

  // Reject backslashes
  if (clean.includes('\\')) {
    return { isValid: false, error: 'Path contains invalid backslash separator.' };
  }

  // Reject leading slash (absolute path)
  if (clean.startsWith('/') || clean.startsWith('//')) {
    return { isValid: false, error: 'Path must be relative, not absolute.' };
  }

  // Reject Windows drive letters (e.g., C:)
  if (/^[a-zA-Z]:/.test(clean)) {
    return { isValid: false, error: 'Path contains drive letter specification.' };
  }

  // Split into segments and verify no traversal
  const segments = clean.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      return { isValid: false, error: 'Path traversal (..) is strictly prohibited.' };
    }
    if (seg === '.' && segments.length > 1) {
      return { isValid: false, error: 'Current directory reference (.) is invalid in repository path.' };
    }
    if (seg === '' && segments.indexOf(seg) !== segments.length - 1) {
      return { isValid: false, error: 'Empty path segment or redundant slash found.' };
    }
  }

  // Only allow alphanumeric, hyphens, underscores, dots, and slashes
  const validPathRegex = /^[a-zA-Z0-9_\-\./]+$/;
  if (!validPathRegex.test(clean)) {
    return { isValid: false, error: 'Path contains disallowed characters.' };
  }

  return { isValid: true, normalizedPath: clean };
}

/**
 * Validates a public repository root URL for Swayam404.
 * Must be http: or https:, cannot contain credentials/tokens, and must be well-formed.
 */
export function validateRepositoryUrl(rawUrl: string): {
  isValid: boolean;
  error?: string;
  normalizedUrl?: string;
} {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { isValid: false, error: 'Repository URL cannot be empty.' };
  }

  const clean = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return { isValid: false, error: 'Malformed URL format.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Repository URL must use HTTP or HTTPS protocol.' };
  }

  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'Repository URL must not contain embedded authentication credentials.' };
  }

  const normalized = clean.replace(/\/+$/, '');
  return { isValid: true, normalizedUrl: normalized };
}

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Parses a semantic version string deterministically into numeric components.
 */
export function parseSemver(versionStr: string): ParsedSemver | null {
  if (typeof versionStr !== 'string') return null;
  const match = versionStr.trim().match(SEMVER_REGEX);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || undefined,
  };
}

/**
 * Compares two semantic version strings deterministically using integer comparison.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 * Throws an Error if either version is invalid.
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);

  if (!p1) {
    throw new Error(`Invalid semantic version string: '${v1}'`);
  }
  if (!p2) {
    throw new Error(`Invalid semantic version string: '${v2}'`);
  }

  if (p1.major !== p2.major) {
    return p1.major > p2.major ? 1 : -1;
  }
  if (p1.minor !== p2.minor) {
    return p1.minor > p2.minor ? 1 : -1;
  }
  if (p1.patch !== p2.patch) {
    return p1.patch > p2.patch ? 1 : -1;
  }

  // Handle pre-release (standard: version without prerelease has higher precedence)
  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && p2.prerelease) {
    if (p1.prerelease === p2.prerelease) return 0;
    return p1.prerelease.localeCompare(p2.prerelease);
  }

  return 0;
}

/**
 * Checks whether an actual extension/data version meets the minimum required version.
 */
export function isVersionAtLeast(actual: string, required: string): boolean {
  try {
    return compareSemver(actual, required) >= 0;
  } catch {
    return false;
  }
}
