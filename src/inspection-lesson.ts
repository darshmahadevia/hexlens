import type { Inspection } from './domain/inspection.ts';
import type { SelectionResolution } from './domain/byte-grid.ts';

export interface InspectionLesson {
  title: string;
  meaning: string;
  why: string;
  reading: string;
  position: string;
}

interface LessonCopy {
  title: string;
  meaning: string;
  why: string;
  reading: string;
}

const LESSONS: Readonly<Record<string, LessonCopy>> = Object.freeze({
  SIGNATURE: {
    title: "The file's ID card",
    meaning: 'A fixed signature identifies the format before a decoder reads the rest of the file.',
    why: 'File names and extensions can be wrong. A signature lets software verify that these bytes really begin a PNG before it trusts the remaining structure.',
    reading: 'For PNG, 89 50 4E 47 names the format. The remaining signature bytes help software catch files damaged by text transfer.',
  },
  IHDR: {
    title: 'The image blueprint',
    meaning: 'IHDR records the width, height, bit depth, color type, and decoding rules needed before reading pixels.',
    why: 'A decoder needs these rules before it can interpret the compressed image stream. PNG therefore requires IHDR to be the first chunk after the signature.',
    reading: 'The chunk starts with its data length and the letters IHDR. Its 13 data bytes describe the image, followed by a CRC check.',
  },
  IDAT: {
    title: 'The compressed picture',
    meaning: 'IDAT holds the compressed image stream. A PNG may divide that stream across several IDAT chunks.',
    why: 'Separating image data into chunks lets PNG keep a consistent container structure while allowing the compressed stream to span more than one chunk.',
    reading: 'HexLens marks the payload and its exact source span. It leaves pixel decoding to an image decoder.',
  },
  IEND: {
    title: 'The full stop',
    meaning: 'IEND marks the end of the PNG datastream. Every complete PNG needs it, even though it has no data payload.',
    why: 'The marker gives a decoder an explicit end boundary. Bytes after IEND are not part of the PNG datastream.',
    reading: 'A zero data length, the letters IEND, and a CRC close the file in a predictable twelve-byte envelope.',
  },
  RIFF: {
    title: "The file's container",
    meaning: 'RIFF gives the WAV file its outer boundary and declares that the contents follow the WAVE format.',
    why: 'RIFF provides a common chunk container. The WAVE identifier tells software which rules to apply to the chunks inside it.',
    reading: 'RIFF and WAVE appear as readable four-byte identifiers. The size field uses little-endian byte order.',
  },
  FMT: {
    title: 'The playback blueprint',
    meaning: 'The fmt chunk explains how to interpret the audio samples, including encoding, channels, sample rate, and bit depth.',
    why: 'Sample bytes have no useful sound meaning on their own. The format values tell a player how to divide, time, and decode them.',
    reading: 'Read the numeric fields as little-endian values. Their combination tells software how many bytes form each moment of audio.',
  },
  DATA: {
    title: 'The recorded signal',
    meaning: 'The data chunk contains the audio sample payload described by the fmt chunk.',
    why: 'Keeping the signal separate from its format description lets software locate the payload and interpret it with the rules declared earlier.',
    reading: 'HexLens identifies the payload boundary without playing meaning into the bytes. The Source preview uses the browser audio decoder.',
  },
  LIST: {
    title: 'The metadata cabinet',
    meaning: 'A LIST chunk groups related metadata entries such as a title, artist, comment, date, or genre.',
    why: 'Grouping optional labels in one named container keeps descriptive metadata separate from the audio format and sample payload.',
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
  const why = supplied?.why ?? (field
    ? `This Field gives software one specific fact needed to interpret the surrounding ${structure?.label ?? 'Structure'}. Its meaning comes from both the encoded value and its position in that Structure.`
    : structure
      ? `This Structure gives the Format a named boundary. That boundary lets software handle its bytes according to one defined purpose.`
      : 'Keeping unmapped bytes visible prevents the Inspection from claiming meaning that the parser has not established.');
  const reading = field
    ? `${supplied?.reading ? `${supplied.reading} ` : ''}${field.explanation} The selected value is ${String(field.value)}. HexLens reads it as ${field.representation}${field.endianness && field.endianness !== 'n/a' ? ` in ${field.endianness} order` : ''}.`
    : supplied?.reading ?? 'Compare the selected bytes with the Structure boundary and any Diagnostics before interpreting them.';
  const start = resolution.selection.offset;
  const end = Math.max(start, start + resolution.selection.length - 1);
  const position = `Offsets ${start} through ${end} of ${inspection.bytes.length.toLocaleString('en-US')} bytes.`;
  return { title, meaning, why, reading, position };
}
