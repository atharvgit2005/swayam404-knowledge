import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createPng(width, height, colorFn) {
  // Construct raw uncompressed RGBA pixel data
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = colorFn(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(typeAndData), 0);

    return Buffer.concat([len, typeAndData, crc]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        const bit = (byte ^ crc) & 1;
        crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
        byte >>>= 1;
      }
    }
    return (crc ^ 0xffffffff) | 0;
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon generator with sleek dark charcoal background, rounded corners, and electric indigo/purple inner accent
function getPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  const r = w * 0.45;

  // Squircle / rounded box
  const cornerR = w * 0.2;
  const inBox = dx <= cx - 1 && dy <= cy - 1;
  const isCorner = dx > cx - cornerR && dy > cy - cornerR;
  if (isCorner) {
    const cdx = dx - (cx - cornerR);
    const cdy = dy - (cy - cornerR);
    if (cdx * cdx + cdy * cdy > cornerR * cornerR) {
      return [0, 0, 0, 0]; // Transparent outside
    }
  }

  // Inside icon:
  // Center emblem: stylised "S" / "404" badge
  const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (distFromCenter < w * 0.28) {
    // Electric purple / cyan gradient
    const grad = (x + y) / (w + h);
    return [Math.round(139 + grad * 50), Math.round(92 + grad * 80), 246, 255];
  }

  // Dark charcoal body: #0f172a / #1e293b
  const bgGrad = y / h;
  return [Math.round(18 + bgGrad * 12), Math.round(22 + bgGrad * 16), Math.round(36 + bgGrad * 24), 255];
}

const iconsDir = path.resolve(__dirname, '../public/icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const pngBuf = createPng(size, size, getPixel);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngBuf);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
}
