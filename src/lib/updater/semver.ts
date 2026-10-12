/**
 * Swayam404 Semantic Versioning Engine
 *
 * Implements strict SemVer 2.0 comparison handling:
 * - Multi-digit components: "1.2.0" < "1.10.0"
 * - Equal versions: "1.0.0" === "1.0.0"
 * - Older vs Newer versions
 * - Prerelease tags: "1.0.0-alpha.1" < "1.0.0"
 * - Malformed version rejection
 */

export interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  raw: string;
}

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parseSemVer(versionStr: string): ParsedSemVer | null {
  if (!versionStr || typeof versionStr !== 'string') {
    return null;
  }

  const trimmed = versionStr.trim();
  const match = trimmed.match(SEMVER_REGEX);
  if (!match) {
    return null;
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    prerelease: match[4] || undefined,
    raw: trimmed,
  };
}

export function isValidSemVer(versionStr: string): boolean {
  return parseSemVer(versionStr) !== null;
}

/**
 * Compares two SemVer strings.
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 * Throws an Error if either string is invalid.
 */
export function compareSemVer(v1: string, v2: string): -1 | 0 | 1 {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);

  if (!p1) {
    throw new Error(`Invalid SemVer format for version 1: "${v1}"`);
  }
  if (!p2) {
    throw new Error(`Invalid SemVer format for version 2: "${v2}"`);
  }

  // 1. Compare Major
  if (p1.major > p2.major) return 1;
  if (p1.major < p2.major) return -1;

  // 2. Compare Minor
  if (p1.minor > p2.minor) return 1;
  if (p1.minor < p2.minor) return -1;

  // 3. Compare Patch
  if (p1.patch > p2.patch) return 1;
  if (p1.patch < p2.patch) return -1;

  // 4. Compare Prerelease
  // Normal release has higher precedence than prerelease (e.g. 1.0.0 > 1.0.0-beta)
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (!p1.prerelease && !p2.prerelease) return 0;

  // Both have prereleases
  if (p1.prerelease && p2.prerelease) {
    if (p1.prerelease === p2.prerelease) return 0;
    return p1.prerelease.localeCompare(p2.prerelease) > 0 ? 1 : -1;
  }

  return 0;
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  try {
    return compareSemVer(remoteVersion, currentVersion) === 1;
  } catch {
    return false;
  }
}
