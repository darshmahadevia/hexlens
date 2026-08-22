import { inspectPng } from './domain/png.ts';
import { inspectWav } from './domain/wav.ts';

// A project-owned 1×1 PNG. The bytes stay in this module so the Sample can be
// restored from a deterministic URL without putting file data in the URL.
export const PNG_SAMPLE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// A deterministic project-owned mono PCM Sample: 8-bit, 8 kHz, eight bytes of audio Payload.
export const WAV_SAMPLE_BASE64 = 'UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAoMDgwKCAYA==';

export function sampleBytes(): Uint8Array {
  const binary = atob(PNG_SAMPLE_BASE64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function sampleInspection() {
  return inspectPng(sampleBytes(), 'hexlens-sample.png');
}

export function wavSampleBytes(): Uint8Array {
  const binary = atob(WAV_SAMPLE_BASE64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function wavSampleInspection() {
  return inspectWav(wavSampleBytes(), 'hexlens-sample.wav');
}
