/**
 * Replace files inside an existing ZIP while copying untouched local entries
 * byte-for-byte. This preserves Excel 365 package metadata (create_version 45,
 * data-descriptor flags, STORED media) that JSZip/Python rewrites drop — which
 * otherwise triggers Excel's "We found a problem with some content" repair dialog.
 */

type ZipCdEntry = {
  name: string;
  localOffset: number;
  rawLocal: Uint8Array;
  compression: number;
  createVersion: number;
  extractVersion: number;
  flag: number;
  modTime: number;
  modDate: number;
  crc: number;
  compSize: number;
  uncompSize: number;
  externalAttr: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function findEocd(view: DataView, length: number): number {
  for (let i = length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new Error("ZIP end-of-central-directory not found.");
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([Uint8Array.from(data)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { deflateRawSync } = await import("node:zlib");
  return new Uint8Array(deflateRawSync(data));
}

function parseEntries(input: Uint8Array): ZipCdEntry[] {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const eocd = findEocd(view, input.length);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const entries: ZipCdEntry[] = [];
  let p = cdOffset;

  for (let n = 0; n < entryCount; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central-directory signature.");
    }
    const createVersion = view.getUint16(p + 4, true);
    const extractVersion = view.getUint16(p + 6, true);
    const flag = view.getUint16(p + 8, true);
    const compression = view.getUint16(p + 10, true);
    const modTime = view.getUint16(p + 12, true);
    const modDate = view.getUint16(p + 14, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const externalAttr = view.getUint32(p + 38, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(input.subarray(p + 46, p + 46 + nameLen));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${name}.`);
    }
    const lhNameLen = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    let dataEnd = dataStart + compSize;
    if (flag & 0x8) {
      dataEnd += view.getUint32(dataEnd, true) === 0x08074b50 ? 16 : 12;
    }

    entries.push({
      name,
      localOffset,
      rawLocal: input.subarray(localOffset, dataEnd),
      compression,
      createVersion,
      extractVersion,
      flag,
      modTime,
      modDate,
      crc,
      compSize,
      uncompSize,
      externalAttr,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function buildLocalEntry(
  name: string,
  data: Uint8Array,
  base: ZipCdEntry,
): Promise<{ local: Uint8Array; meta: ZipCdEntry }> {
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  let compression = base.compression;
  let compressed: Uint8Array;
  if (compression === 0) {
    compressed = data;
  } else {
    compressed = await deflateRaw(data);
    compression = 8;
  }

  // Clear data-descriptor flag; CRC/sizes are written in the local header.
  const flag = base.flag & ~0x8;
  const header = new Uint8Array(30 + nameBytes.length);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, 0x04034b50, true);
  hv.setUint16(4, base.extractVersion, true);
  hv.setUint16(6, flag, true);
  hv.setUint16(8, compression, true);
  hv.setUint16(10, base.modTime, true);
  hv.setUint16(12, base.modDate, true);
  hv.setUint32(14, crc, true);
  hv.setUint32(18, compressed.length, true);
  hv.setUint32(22, data.length, true);
  hv.setUint16(26, nameBytes.length, true);
  hv.setUint16(28, 0, true);
  header.set(nameBytes, 30);

  const local = new Uint8Array(header.length + compressed.length);
  local.set(header, 0);
  local.set(compressed, header.length);

  return {
    local,
    meta: {
      ...base,
      rawLocal: local,
      compression,
      flag,
      crc,
      compSize: compressed.length,
      uncompSize: data.length,
    },
  };
}

/**
 * Return a new ZIP buffer with the given paths replaced. Untouched entries keep
 * their original local-header bytes (Excel 365 version bits, STORED images, etc.).
 */
export async function replaceZipEntries(
  input: Uint8Array,
  replacements: Record<string, Uint8Array | string>,
): Promise<Uint8Array> {
  const entries = parseEntries(input);
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const metas: { meta: ZipCdEntry; offset: number; name: string }[] = [];
  let offset = 0;

  for (const entry of entries) {
    const replacement = replacements[entry.name];
    let local: Uint8Array;
    let meta: ZipCdEntry;
    if (replacement !== undefined) {
      const data =
        typeof replacement === "string" ? encoder.encode(replacement) : replacement;
      const built = await buildLocalEntry(entry.name, data, entry);
      local = built.local;
      meta = built.meta;
    } else {
      local = entry.rawLocal;
      meta = entry;
    }
    locals.push(local);
    metas.push({ meta, offset, name: entry.name });
    offset += local.length;
  }

  const cdParts: Uint8Array[] = [];
  let cdSize = 0;
  for (const { meta, offset: localOffset, name } of metas) {
    const nameBytes = encoder.encode(name);
    const buf = new Uint8Array(46 + nameBytes.length);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, meta.createVersion, true);
    v.setUint16(6, meta.extractVersion, true);
    v.setUint16(8, meta.flag, true);
    v.setUint16(10, meta.compression, true);
    v.setUint16(12, meta.modTime, true);
    v.setUint16(14, meta.modDate, true);
    v.setUint32(16, meta.crc, true);
    v.setUint32(20, meta.compSize, true);
    v.setUint32(24, meta.uncompSize, true);
    v.setUint16(28, nameBytes.length, true);
    v.setUint16(30, 0, true);
    v.setUint16(32, 0, true);
    v.setUint16(34, 0, true);
    v.setUint16(36, 0, true);
    v.setUint32(38, meta.externalAttr, true);
    v.setUint32(42, localOffset, true);
    buf.set(nameBytes, 46);
    cdParts.push(buf);
    cdSize += buf.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, metas.length, true);
  ev.setUint16(10, metas.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let o = 0;
  for (const part of locals) {
    out.set(part, o);
    o += part.length;
  }
  for (const part of cdParts) {
    out.set(part, o);
    o += part.length;
  }
  out.set(eocd, o);
  return out;
}

/** Read one uncompressed file from a ZIP (DEFLATE or STORE). */
export async function readZipFile(input: Uint8Array, path: string): Promise<Uint8Array> {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const entries = parseEntries(input);
  const entry = entries.find((e) => e.name === path);
  if (!entry) throw new Error(`ZIP entry not found: ${path}`);

  const lh = entry.localOffset;
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const compressed = input.subarray(dataStart, dataStart + entry.compSize);

  if (entry.compression === 0) return compressed.slice();
  if (entry.compression !== 8) {
    throw new Error(`Unsupported ZIP compression ${entry.compression} for ${path}.`);
  }

  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([Uint8Array.from(compressed)])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const { inflateRawSync } = await import("node:zlib");
  return new Uint8Array(inflateRawSync(compressed));
}

export async function readZipText(input: Uint8Array, path: string): Promise<string> {
  return new TextDecoder().decode(await readZipFile(input, path));
}
