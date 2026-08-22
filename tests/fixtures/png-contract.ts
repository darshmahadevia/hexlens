import { PNG_SIGNATURE } from '../../src/format.ts';

function crc32(values: number[]): number {
  let crc = 0xffffffff;
  for (const value of values) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function chunk(type: string, data: number[] = [], crcOverride?: number): number[] {
  const typeBytes = Array.from(type, (character) => character.charCodeAt(0));
  const crc = crcOverride ?? crc32([...typeBytes, ...data]);
  return [
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
    ...typeBytes,
    ...data,
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ];
}

export function png(chunks: number[][]): Uint8Array {
  return Uint8Array.from([...PNG_SIGNATURE, ...chunks.flat()]);
}

export const ihdrIndexed = chunk('IHDR', [
  0, 0, 0, 1,
  0, 0, 0, 1,
  8,
  3,
  0,
  0,
  0,
]);

export const ihdrRgba = chunk('IHDR', [
  0, 0, 0, 1,
  0, 0, 0, 1,
  8,
  6,
  0,
  0,
  0,
]);

export function textBytes(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

export function iTXt(keyword: string, text: number[], compressed = false): number[] {
  return [
    ...textBytes(keyword), 0,
    compressed ? 1 : 0,
    0,
    ...textBytes('en'), 0,
    ...textBytes('Translated'), 0,
    ...text,
  ];
}

export function validEveryDeclaredChunk(): Uint8Array {
  return png([
    ihdrIndexed,
    chunk('gAMA', [0, 1, 0x86, 0xa0]),
    chunk('sRGB', [0]),
    chunk('pHYs', [0, 0, 0, 0x2b, 0, 0, 0, 0x2b, 1]),
    chunk('PLTE', [0xff, 0, 0, 0, 0xff, 0]),
    chunk('tRNS', [255, 128]),
    chunk('tEXt', [...textBytes('Comment'), 0, ...textBytes('<script>alert(1)</script>')]),
    chunk('iTXt', iTXt('Note', textBytes('plain text'))),
    chunk('IDAT', [0x78, 0x9c, 0x63, 0, 0, 0, 0, 2, 0, 1]),
    chunk('zzZZ', [0xde, 0xad, 0xbe, 0xef]),
    chunk('IEND'),
  ]);
}

export const manifest = {
  signature: { offset: 0, length: 8 },
  ihdr: { offset: 8, length: 25 },
  gamma: { offset: 33, length: 16 },
  srgb: { offset: 49, length: 13 },
  phys: { offset: 62, length: 21 },
  plte: { offset: 83, length: 18 },
  trns: { offset: 101, length: 14 },
  text: { offset: 115, length: 45 },
  itxt: { offset: 160, length: 43 },
  idat: { offset: 203, length: 22 },
  unknown: { offset: 225, length: 16 },
  iend: { offset: 241, length: 12 },
};
