---
status: accepted
---

# Use Byte spans as the inspection contract

Every format parser will return Structures, Fields, Derived values, Unmapped spans, and Diagnostics linked through Byte spans, and the byte grid, Structure tree, and Field inspector will consume that shared representation. This keeps synchronized selection and new format support consistent, at the cost of fitting format-specific details into a common model instead of custom interface code.
