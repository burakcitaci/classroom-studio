import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { extractText, MAX_UPLOAD } from './extract.js';

async function run() {
  try {
    const file = await readFile(workerData.path as string);
    if (file.length > MAX_UPLOAD) throw new Error('Files are limited to 10 MB.');
    const result = await extractText(file, workerData.extension as string);
    parentPort?.postMessage({ result });
  } catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.message : 'Try uploading a fresh copy.' });
  }
}

void run();
