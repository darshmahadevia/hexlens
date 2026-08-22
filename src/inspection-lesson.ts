import type { Inspection } from './domain/inspection.ts';
import type { SelectionResolution } from './domain/byte-grid.ts';

export interface InspectionLesson {
  title: string;
  meaning: string;
  reading: string;
  position: string;
}

interface LessonCopy {
  title: string;
  meaning: string;
  reading: string;
}

const LESSONS: Readonly<Record<string, LessonCopy>> = Object.freeze({
  SIGNATURE: {
    title: "The file's ID card",
    meaning: 'A fixed signature identifies the format before a decoder reads the rest of the file.',
    reading: 'For PNG, 89 50 4E 47 names the format. The remaining signature bytes help software catch files damaged by text transfer.',
  },
  IHDR: {
    title: 'The image blueprint',
    meaning: 'IHDR records the width, height, bit depth, color type, and decoding rules needed before reading pixels.',
    reading: 'The chunk starts with its data length and the letters IHDR. Its 13 data bytes describe the image, followed by a CRC check.',
  },
  IDAT: {
    title: 'The compressed picture',
    meaning: 'IDAT holds the compressed image stream. A PNG may divide that stream across several IDAT chunks.',
    reading: 'HexLens marks the payload and its exact source span. It leaves pixel decoding to an image decoder.',
  },
  IEND: {
    title: 'The full stop',
    meaning: 'IEND marks the end of the PNG datastream. Every complete PNG needs it, even though it has no data payload.',
    reading: 'A zero data length, the letters IEND, and a CRC close the file in a predictable twelve-byte envelope.',
  },
  RIFF: {
    title: "The file's container",
    meaning: 'RIFF gives the WAV file its outer boundary and declares that the contents follow the WAVE format.',
    reading: 'RIFF and WAVE appear as readable four-byte identifiers. The size field uses little-endian byte order.',
  },
  FMT: {
    title: 'The playback blueprint',
    meaning: 'The fmt chunk explains how to interpret the audio samples, including encoding, channels, sample rate, and bit depth.',
    reading: 'Read the numeric fields as little-endian values. Their combination tells software how many bytes form each moment of audio.',
  },
  DATA: {
    title: 'The recorded signal',
    meaning: 'The data chunk contains the audio sample payload described by the fmt chunk.',
    reading: 'HexLens identifies the payload boundary without playing meaning into the bytes. The Source preview uses the browser audio decoder.',
  },
  LIST: {
    title: 'The metadata cabinet',
    meaning: 'A LIST chunk groups related metadata entries such as a title, artist, comment, date, or genre.',
    reading: 'The INFO identifier names the list type. Child chunks then store one labeled text value at a time.',
  },
});

function lessonKey(resolution: SelectionResolution): string {
  const structure = resolution.structure;
  if (!structure) return 'UNMAPPED';
  if (structure.id === 'png-signature') return 'SIGNATURE';
  return (structure.type ?? structure.name ?? structure.kind).toUpperCase();
}

export function lessonFor(inspection: Inspection, resolution: SelectionResolution): InspectionLesson {
  const structure = resolution.structure;
  const field = resolution.field;
  const supplied = LESSONS[lessonKey(resolution)];
  const title = supplied?.title ?? (field ? `How ${field.label} works` : structure?.label ?? 'An unmapped byte span');
  const meaning = supplied?.meaning ?? field?.explanation ?? structure?.description ?? 'No parsed Structure or Field claims this selection.';
  const reading = field
    ? `${field.explanation} HexLens reads this value as ${field.representation}${field.endianness && field.endianness !== 'n/a' ? ` in ${field.endianness} order` : ''}.`
    : supplied?.reading ?? 'Compare the selected bytes with the Structure boundary and any Diagnostics before interpreting them.';
  const start = resolution.selection.offset;
  const end = Math.max(start, start + resolution.selection.length - 1);
  const position = `Offsets ${start} through ${end} of ${inspection.bytes.length.toLocaleString('en-US')} bytes.`;
  return { title, meaning, reading, position };
}
