import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { unlinkSync, writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { MAX_SOURCES, MAX_UPLOAD, normalize, splitText } from './extract.js';
import type { VectorIndex } from './retrieval.js';
import { Store, type SourceRow } from './store.js';
import { ProviderError } from './ollama.js';

type Extracted = { text: string; chunks: string[] };
const extensions = new Set(['.pdf', '.docx', '.txt']);

function extractFile(path: string, extension: string): Promise<Extracted> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extraction-worker.js', import.meta.url), {
      workerData: { path, extension }, resourceLimits: { maxOldGenerationSizeMb: 160 },
    });
    const message = 'This file could not be processed within the limit. Upload a shorter text-only copy.';
    const timeout = setTimeout(() => { reject(new Error(message)); void worker.terminate(); }, 14_000);
    worker.once('message', (value: { result?: Extracted; error?: string }) => {
      clearTimeout(timeout);
      if (value.result) resolve(value.result);
      else reject(new Error(value.error ?? message));
    });
    worker.once('error', () => { clearTimeout(timeout); reject(new Error(message)); });
    worker.once('exit', () => { clearTimeout(timeout); reject(new Error(message)); });
  });
}

export class SourceService {
  private busy = false;
  constructor(private readonly store: Store, private readonly index: VectorIndex) {}

  addFile(doc: string, file: Express.Multer.File | undefined) {
    if (!file || !file.size || file.size > MAX_UPLOAD) throw new BadRequestException('Choose a non-empty PDF, DOCX or TXT file up to 10 MB.');
    const base = file.originalname.split(/[/\\]/).at(-1) ?? '';
    const extension = extname(base).toLowerCase();
    if (!extensions.has(extension)) throw new BadRequestException('Upload a PDF, DOCX, or UTF-8 TXT file.');
    const id = randomUUID();
    this.store.transaction(() => {
      this.checkCapacity(doc);
      writeFileSync(this.store.file(id), file.buffer, { flag: 'wx' });
      try {
        this.store.run('INSERT INTO sources (id, doc_id, name, type, file_ext, status) VALUES (?, ?, ?, ?, ?, ?)',
          id, doc, base.replace(/[\u0000-\u001F]/g, '').slice(0, 220), 'file', extension, 'extracting');
      } catch (error) {
        unlinkSync(this.store.file(id));
        throw error;
      }
    });
    void this.drain();
    return this.get(doc, id);
  }

  addNote(doc: string, name: string, input: string) {
    const id = randomUUID();
    const text = normalize(input);
    let chunks: string[];
    try { chunks = splitText(text); }
    catch { throw new BadRequestException('These notes contain too many passages. Combine short paragraphs or paste a shorter extract.'); }
    if (!chunks.length) throw new BadRequestException('Paste some readable notes first.');
    this.store.transaction(() => {
      this.checkCapacity(doc);
      this.store.run('INSERT INTO sources (id, doc_id, name, type, status) VALUES (?, ?, ?, ?, ?)',
        id, doc, name, 'note', 'ready');
      this.storeText(id, { text, chunks });
    });
    return this.get(doc, id);
  }

  retry(doc: string, id: string) {
    if (!this.store.run("UPDATE sources SET status = 'indexing', error = NULL WHERE doc_id = ? AND id = ? AND retryable = 1 AND status = 'error'", doc, id).changes) {
      throw new BadRequestException('Only failed indexing can be retried. For extraction errors, upload a readable copy.');
    }
    void this.drain();
    return this.get(doc, id);
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let source = this.next(); source; source = this.next()) {
        if (source.status === 'extracting') {
          try {
            const result = await extractFile(this.store.file(source.id), source.file_ext!);
            this.store.transaction(() => {
              this.storeText(source!.id, result);
              this.store.run("UPDATE sources SET status = 'indexing' WHERE id = ?", source!.id);
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Upload a fresh copy of this file.';
            this.store.run("UPDATE sources SET status = 'error', error = ? WHERE id = ?", message, source.id);
            continue;
          }
        }
        try {
          await this.index.prepare(source.doc_id, source.id, this.store.chunks(source.id));
          this.store.run("UPDATE sources SET status = 'ready', error = NULL, retryable = 0 WHERE id = ?", source.id);
        } catch (error) {
          const message = error instanceof ProviderError ? error.message : 'The index could not be built. Check Ollama and Qdrant, then retry.';
          this.store.run("UPDATE sources SET status = 'error', error = ?, retryable = 1 WHERE id = ?", message, source.id);
        }
      }
    } finally { this.busy = false; }
  }

  private next() {
    return this.store.one<SourceRow>("SELECT * FROM sources WHERE status IN ('extracting', 'indexing') ORDER BY rowid LIMIT 1");
  }

  private storeText(id: string, result: Extracted) {
    this.store.run('UPDATE sources SET preview = ? WHERE id = ?', result.text.slice(0, 1400), id);
    result.chunks.forEach((chunk, i) => this.store.run('INSERT INTO chunks VALUES (?, ?, ?, ?)', randomUUID(), id, i, chunk));
  }

  private checkCapacity(doc: string) {
    const current = this.store.document(doc);
    if (current.sources.length >= MAX_SOURCES) throw new BadRequestException('This document already has eight sources. Remove an unused source first.');
  }

  private get(doc: string, id: string) {
    const source = this.store.document(doc).sources.find(item => item.id === id);
    if (!source) throw new NotFoundException('Source was not found.');
    return source;
  }

  remove(doc: string, id: string) {
    // Keep authoritative excerpts while active jobs or historical snapshots may refer to them.
    // Removal is reserved for files that failed extraction before any excerpts existed.
    const source = this.get(doc, id);
    if (source.status !== 'error' || source.retryable) throw new BadRequestException('Only unreadable files can be removed.');
    this.store.transaction(() => {
      const current = this.store.document(doc);
      if (current.settings.sources.some(item => item.id === id)) {
        throw new BadRequestException('Unselect the file before removing it.');
      }
      this.store.run('DELETE FROM sources WHERE id = ? AND doc_id = ?', id, doc);
    });
    unlinkSync(this.store.file(id));
    return source;
  }
}
