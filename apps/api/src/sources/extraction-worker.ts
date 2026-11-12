import { readFile } from 'node:fs/promises';
import { extractText, MAX_UPLOAD } from './extract-text.js';

async function run() {
  try {
    const [, , path, extension] = process.argv;
    if (!path || !extension) throw new Error('Missing extraction input.');
    const file = await readFile(path);
    if (file.length > MAX_UPLOAD) throw new Error('Files are limited to 10 MB.');
    const result = await extractText(file, extension);
    process.send?.({ result });
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : 'Try uploading a fresh copy.' });
  } finally {
    if (process.connected) process.disconnect?.();
  }
}

void run();
