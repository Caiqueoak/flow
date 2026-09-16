import fs from 'node:fs';
import path from 'node:path';

for (const target of ['dist', 'schemas']) fs.rmSync(path.resolve(target), { recursive: true, force: true });
