/**
 * Swayam404 Local Updater SHA-256 Calculator
 *
 * Uses standard Web Crypto API (crypto.subtle), universally available in
 * modern Chrome extensions, Service Workers, and Node.js 19+ runtimes.
 * Does not import Node 'crypto' to avoid Vite generating '__vite-browser-external' chunks.
 */

export async function computeBufferSha256(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === 'function') {
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', uint8 as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Web Crypto API (crypto.subtle) is required for SHA-256 calculation.');
}
