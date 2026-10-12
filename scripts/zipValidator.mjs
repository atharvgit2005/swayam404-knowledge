/**
 * Swayam404 Zero-Dependency ZIP Inspection & Safety Validator (Node ESM & Web Compatible)
 *
 * Audits ZIP archives before extraction to protect against:
 * - Zip Slip / Path Traversal attacks (entries containing "..", absolute paths, escaping target dir)
 * - Decompression Bombs (excessive uncompressed size or unreasonable entry counts)
 * - Missing required extension bundle assets (manifest.json, background.js, popup.html, content.js)
 */

export const MAX_UNCOMPRESSED_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB limit
export const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;        // 15 MB limit
export const MAX_ENTRY_COUNT = 500;

export const REQUIRED_EXTENSION_FILES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'content.js',
];

/**
 * Parses central directory headers from a raw ZIP buffer in pure JavaScript.
 * Compatible with Node Buffer, Uint8Array, and ArrayBuffer.
 */
export function parseZipEntries(buffer) {
  let uint8;
  if (buffer instanceof Uint8Array) {
    uint8 = buffer;
  } else if (buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer);
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    uint8 = new Uint8Array(buffer);
  }

  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries = [];

  let idx = 0;
  const len = uint8.length;
  while (idx < len - 4) {
    // Central Directory File Header signature: PK\x01\x02 (0x02014b50)
    if (uint8[idx] === 0x50 && uint8[idx + 1] === 0x4b && uint8[idx + 2] === 0x01 && uint8[idx + 3] === 0x02) {
      if (idx + 46 > len) break;

      const uncompressedSize = view.getUint32(idx + 24, true);
      const compressedSize = view.getUint32(idx + 20, true);
      const nameLen = view.getUint16(idx + 28, true);
      const extraLen = view.getUint16(idx + 30, true);
      const commentLen = view.getUint16(idx + 32, true);

      if (idx + 46 + nameLen > len) break;

      const nameBytes = uint8.subarray(idx + 46, idx + 46 + nameLen);
      const name = decoder.decode(nameBytes);

      entries.push({
        name,
        uncompressedSize,
        compressedSize,
      });

      idx += 46 + nameLen + extraLen + commentLen;
    } else {
      idx++;
    }
  }

  return entries;
}

/**
 * Inspects all entries of a ZIP package against security vulnerabilities and required structure.
 */
export function validateZipPackage(buffer, options = {}) {
  const errors = [];
  const entries = parseZipEntries(buffer);

  if (entries.length === 0) {
    return {
      valid: false,
      errors: ['Invalid ZIP archive: No central directory records found.'],
      entries: [],
      totalUncompressedSize: 0,
    };
  }

  if (entries.length > MAX_ENTRY_COUNT) {
    errors.push(`Package exceeds maximum permitted entry count (${entries.length} > ${MAX_ENTRY_COUNT}).`);
  }

  let totalSize = 0;
  const foundFilenames = new Set();

  for (const entry of entries) {
    const rawName = entry.name;
    foundFilenames.add(rawName);

    // 1. Path traversal / Zip Slip checks
    if (rawName.startsWith('/') || rawName.startsWith('\\')) {
      errors.push(`Illegal absolute entry path: "${rawName}"`);
    }

    if (rawName.includes(':')) {
      errors.push(`Illegal drive letter or colon in entry path: "${rawName}"`);
    }

    if (rawName.includes('\0')) {
      errors.push(`Illegal null byte in entry path: "${rawName}"`);
    }

    const segments = rawName.split(/[/\\]/);
    if (segments.some((seg) => seg === '..') || rawName.includes('..')) {
      errors.push(`Zip Slip attempt detected: entry escapes directory root ("${rawName}")`);
    }

    // 2. Resource limits
    totalSize += entry.uncompressedSize;
    if (entry.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
      errors.push(
        `Entry "${rawName}" exceeds single-file size limit (${(entry.uncompressedSize / 1024 / 1024).toFixed(1)} MB > 15 MB).`
      );
    }
  }

  if (totalSize > MAX_UNCOMPRESSED_TOTAL_BYTES) {
    errors.push(
      `Package total uncompressed size exceeds safety threshold (${(totalSize / 1024 / 1024).toFixed(1)} MB > 50 MB).`
    );
  }

  // 3. Required extension bundle assets check
  if (options.requireAssets !== false) {
    for (const reqFile of REQUIRED_EXTENSION_FILES) {
      if (!foundFilenames.has(reqFile)) {
        errors.push(`Missing mandatory extension bundle asset: "${reqFile}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    entries,
    totalUncompressedSize: totalSize,
  };
}
