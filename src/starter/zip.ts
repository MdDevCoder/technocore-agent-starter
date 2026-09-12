/**
 * Lightweight, zero-dependency ZIP archive generator (PKZip standard format).
 * Generates standard STORED (uncompressed) .zip files in pure TypeScript.
 *
 * Fully compatible with standard zip utilities (Windows Explorer, unzip, Python zipfile, etc.).
 */

// Precomputed CRC32 table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) {
      c = 0xedb88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  CRC_TABLE[n] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFileEntry {
  path: string;
  content: string | Uint8Array;
}

/**
 * Creates a valid binary ZIP archive from an array of file entries.
 */
export function createZipArchive(files: readonly ZipFileEntry[]): Uint8Array {
  const textEncoder = new TextEncoder();
  const fileRecords: {
    pathBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    offset: number;
  }[] = [];

  const localHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  // Standard DOS timestamp (fixed deterministic date: 2026-09-12 00:00:00)
  const dosTime = (0 << 11) | (0 << 5) | (0 >> 1);
  const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 12;

  for (const file of files) {
    // Normalize path separators to forward slashes
    const normalizedPath = file.path.replace(/\\/g, "/");
    const pathBytes = textEncoder.encode(normalizedPath);
    const dataBytes =
      typeof file.content === "string" ? textEncoder.encode(file.content) : file.content;
    const fileCrc = crc32(dataBytes);

    const record = {
      pathBytes,
      dataBytes,
      crc: fileCrc,
      offset: currentOffset,
    };
    fileRecords.push(record);

    // Local file header (30 bytes + path length + data length)
    const localHeader = new Uint8Array(30 + pathBytes.length + dataBytes.length);
    const view = new DataView(localHeader.buffer);

    // Signature: 0x04034b50 (PK\x03\x04)
    view.setUint32(0, 0x04034b50, true);
    // Version needed to extract: 20 (2.0)
    view.setUint16(4, 20, true);
    // General purpose bit flag: 0x0800 (UTF-8 filename encoding)
    view.setUint16(6, 0x0800, true);
    // Compression method: 0 (STORED)
    view.setUint16(8, 0, true);
    // File last mod time & date
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    // CRC-32
    view.setUint32(14, fileCrc, true);
    // Compressed size
    view.setUint32(18, dataBytes.length, true);
    // Uncompressed size
    view.setUint32(22, dataBytes.length, true);
    // File name length
    view.setUint16(26, pathBytes.length, true);
    // Extra field length
    view.setUint16(28, 0, true);

    // Filename
    localHeader.set(pathBytes, 30);
    // File data
    localHeader.set(dataBytes, 30 + pathBytes.length);

    localHeaders.push(localHeader);
    currentOffset += localHeader.length;
  }

  // Central directory headers
  const centralHeaders: Uint8Array[] = [];
  const centralDirStartOffset = currentOffset;
  let centralDirSize = 0;

  for (const record of fileRecords) {
    const centralHeader = new Uint8Array(46 + record.pathBytes.length);
    const view = new DataView(centralHeader.buffer);

    // Signature: 0x02014b50 (PK\x01\x02)
    view.setUint32(0, 0x02014b50, true);
    // Version made by: 20 (DOS/OS/2)
    view.setUint16(4, 20, true);
    // Version needed to extract: 20 (2.0)
    view.setUint16(6, 20, true);
    // General purpose bit flag: 0x0800 (UTF-8 filename)
    view.setUint16(8, 0x0800, true);
    // Compression method: 0 (STORED)
    view.setUint16(10, 0, true);
    // File last mod time & date
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    // CRC-32
    view.setUint32(16, record.crc, true);
    // Compressed size
    view.setUint32(20, record.dataBytes.length, true);
    // Uncompressed size
    view.setUint32(24, record.dataBytes.length, true);
    // File name length
    view.setUint16(28, record.pathBytes.length, true);
    // Extra field length
    view.setUint16(30, 0, true);
    // File comment length
    view.setUint16(32, 0, true);
    // Disk number start
    view.setUint16(34, 0, true);
    // Internal file attributes
    view.setUint16(36, 0, true);
    // External file attributes
    view.setUint32(38, 0, true);
    // Relative offset of local header
    view.setUint32(42, record.offset, true);

    // Filename
    centralHeader.set(record.pathBytes, 46);

    centralHeaders.push(centralHeader);
    centralDirSize += centralHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  // Signature: 0x06054b50 (PK\x05\x06)
  eocdView.setUint32(0, 0x06054b50, true);
  // Number of this disk: 0
  eocdView.setUint16(4, 0, true);
  // Disk where central directory starts: 0
  eocdView.setUint16(6, 0, true);
  // Total entries on this disk
  eocdView.setUint16(8, fileRecords.length, true);
  // Total entries overall
  eocdView.setUint16(10, fileRecords.length, true);
  // Size of central directory
  eocdView.setUint32(12, centralDirSize, true);
  // Offset of central directory
  eocdView.setUint32(16, centralDirStartOffset, true);
  // Comment length: 0
  eocdView.setUint16(20, 0, true);

  // Total byte size calculation
  const totalLength =
    localHeaders.reduce((acc, h) => acc + h.length, 0) +
    centralHeaders.reduce((acc, h) => acc + h.length, 0) +
    eocd.length;

  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const h of localHeaders) {
    result.set(h, pos);
    pos += h.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}
