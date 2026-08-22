# HexLens

HexLens describes how the bytes in a binary file form meaningful, format-defined parts. This glossary gives those parts consistent names across supported formats.

## Language

**Format**:
The rules that identify and organize a class of binary files, such as PNG or WAV.
_Avoid_: File type, extension

**Inspection**:
The temporary representation of one opened file, including its Structures, Fields, Byte spans, Derived values, and Diagnostics.
_Avoid_: Project, saved analysis

**Sample file**:
A small, known file bundled with HexLens so a user can try an Inspection without opening a local file.
_Avoid_: Fixture in product copy, demo data

**Source preview**:
A rendering or playback of the original file, shown as a reference beside its Inspection and never presented as parsed output.
_Avoid_: Parsed preview, decoded Payload

**Structure**:
A meaningful unit defined by a file format. Use a format's own term, such as chunk or header, when speaking about that format specifically.
_Avoid_: Node, block, chunk as a cross-format term

**Byte span**:
A contiguous portion of a file identified by its starting offset and length.
_Avoid_: Range, segment

**Selection**:
The exact Byte span a user has chosen, preserved even when the interface focuses a related Structure or Field.
_Avoid_: Focus, highlight

**Field**:
A named value encoded within a Structure.
_Avoid_: Property, metadata as a generic name for any parsed value

**Bit field**:
A Field whose value occupies specific bits within one or more bytes.
_Avoid_: Flag when the value is not a single boolean

**Payload**:
Content bytes carried by a Structure that HexLens identifies but does not interpret further.
_Avoid_: Body, blob

**Unmapped span**:
A Byte span that no parsed Structure or Field claims.
_Avoid_: Unknown Structure, invalid bytes

**Derived value**:
An interpreted value calculated from one or more Fields that owns no Byte span of its own.
_Avoid_: Field, synthetic Field

**Diagnostic**:
A severity-rated finding tied to an actual or expected Byte span when file contents are notable, inconsistent, or invalid.
_Avoid_: Parser error, message
