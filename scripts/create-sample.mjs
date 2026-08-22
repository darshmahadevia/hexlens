import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('public/samples/hexlens-1x1.png');
const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.from(base64, 'base64'));
console.log(`Wrote ${output}`);
