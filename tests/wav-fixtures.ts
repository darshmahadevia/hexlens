/**
 * Small, project-owned WAV byte fixtures. These helpers intentionally expose
 * only format bytes; the parser remains the public seam that interprets them.
 */

export type WavChunk = { id: string; payload: number[]; pad?: boolean };

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

export function le16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

export function le32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function chunk(id: string, payload: number[], includePad = true): number[] {
  const bytes = [...ascii(id), ...le32(payload.length), ...payload];
  if (includePad && payload.length % 2 === 1) bytes.push(0);
  return bytes;
}

export function fmtPayload(options: {
  tag?: number;
  channels?: number;
  sampleRate?: number;
  bitsPerSample?: number;
  blockAlign?: number;
  byteRate?: number;
} = {}): number[] {
  const tag = options.tag ?? 1;
  const channels = options.channels ?? 1;
  const sampleRate = options.sampleRate ?? 8_000;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const blockAlign = options.blockAlign ?? channels * Math.ceil(bitsPerSample / 8);
  const byteRate = options.byteRate ?? sampleRate * blockAlign;
  return [
    ...le16(tag),
    ...le16(channels),
    ...le32(sampleRate),
    ...le32(byteRate),
    ...le16(blockAlign),
    ...le16(bitsPerSample),
  ];
}

export function factPayload(sampleLength = 2): number[] {
  return le32(sampleLength);
}

export function infoPayload(values: Record<string, string>): number[] {
  const bytes = ascii('INFO');
  for (const [id, value] of Object.entries(values)) {
    bytes.push(...chunk(id, [...ascii(value), 0]));
  }
  return bytes;
}

export function wav(chunks: WavChunk[], declaredLength?: number, root = 'RIFF'): Uint8Array {
  const body = [...ascii('WAVE')];
  for (const item of chunks) body.push(...chunk(item.id, item.payload, item.pad !== false));
  return Uint8Array.from([...ascii(root), ...le32(declaredLength ?? body.length), ...body]);
}

export const pcmWav = wav([
  { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) },
  { id: 'data', payload: [0x00, 0x7f, 0xff, 0x40] },
]);

export const floatWav = wav([
  { id: 'fmt ', payload: fmtPayload({ tag: 3, bitsPerSample: 32, blockAlign: 4, byteRate: 32_000 }) },
  { id: 'fact', payload: factPayload(2) },
  { id: 'data', payload: [0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0xbf] },
]);

export const metadataWav = wav([
  { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) },
  { id: 'LIST', payload: infoPayload({ INAM: 'Field note', IART: 'HexLens', ICMT: 'Opaque samples', ICRD: '2026', IGNR: 'Test' }) },
  { id: 'JUNK', payload: [0xde, 0xad, 0xbe, 0xef] },
  { id: 'data', payload: [0x01, 0x02, 0x03] },
]);

export const oddPaddingWav = wav([
  { id: 'JUNK', payload: [0x7f] },
  { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) },
  { id: 'data', payload: [0x01] },
]);

export const missingPaddingWav = wav([
  { id: 'JUNK', payload: [0x7f], pad: false },
]);

export const missingRequiredWav = wav([
  { id: 'JUNK', payload: [0x01, 0x02] },
]);

export const lengthMismatchWav = (() => {
  const bytes = Array.from(wav([
    { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) },
    { id: 'data', payload: [0x01, 0x02] },
  ]));
  bytes.push(0xaa);
  return Uint8Array.from(bytes);
})();

export const truncatedWav = (() => {
  const bytes = pcmWav.slice(0, pcmWav.length - 2);
  return bytes;
})();

export const unsupportedTagWav = wav([
  { id: 'fmt ', payload: fmtPayload({ tag: 2, bitsPerSample: 16 }) },
  { id: 'data', payload: [0x00, 0x01, 0x02, 0x03] },
]);

export const extensibleWav = wav([
  { id: 'fmt ', payload: fmtPayload({ tag: 0xfffe, bitsPerSample: 16 }) },
  { id: 'data', payload: [0x00, 0x01] },
]);

export const unsupportedRiff = Uint8Array.from([
  ...ascii('RF64'),
  ...le32(4),
  ...ascii('WAVE'),
]);

export const unknownBytes = Uint8Array.from([0x01, 0x02, 0x03, 0x04]);
