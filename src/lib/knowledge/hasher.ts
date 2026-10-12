/**
 * SHA-256 Hashing and Integrity Verification for Swayam404 Knowledge Base
 */

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

/**
 * Validates whether a given string is a valid 64-character hexadecimal SHA-256 hash.
 */
export function isValidSha256(hash: string): boolean {
  if (typeof hash !== 'string') return false;
  return SHA256_REGEX.test(hash.trim());
}

/**
 * Deterministically serializes any JSON-serializable value with sorted keys
 * to ensure that identical objects produce identical hash digests.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJsonStringify((val as Record<string, unknown>)[k])
  );
  return '{' + entries.join(',') + '}';
}

/**
 * Computes the SHA-256 hexadecimal digest for raw string, bytes, or JSON-serializable objects.
 * Works in both browser/extension environments and Vitest/Node test environments.
 */
export async function computeSha256(data: string | Uint8Array | object): Promise<string> {
  let bytes: Uint8Array;

  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else if (typeof data === 'object' && data !== null) {
    const canonical = canonicalJsonStringify(data);
    bytes = new TextEncoder().encode(canonical);
  } else {
    bytes = new TextEncoder().encode(String(data));
  }

  // Web Crypto API (Browser, Service Worker, and Node 19+)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      bytes as unknown as BufferSource
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Web Crypto API (crypto.subtle) is required for SHA-256 calculation.');
}

/**
 * Verifies that the computed hash of data matches the expected content hash.
 */
export async function verifyIntegrity(
  data: string | Uint8Array | object,
  expectedHash: string
): Promise<{ matches: boolean; computedHash: string }> {
  if (!isValidSha256(expectedHash)) {
    return { matches: false, computedHash: '' };
  }
  const computedHash = await computeSha256(data);
  return {
    matches: computedHash.toLowerCase() === expectedHash.trim().toLowerCase(),
    computedHash,
  };
}
