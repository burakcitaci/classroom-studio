import { BadRequestException, Inject, Injectable, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { uuid } from '../../../../libs/contracts/src/index.js';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { unlinkSync, writeFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { MAX_SOURCES, MAX_UPLOAD, normalize, splitText } from './extract-text.js';
import type { VectorIndex } from './retrieval.js';
import { StudioStore, type SourceRow } from '../persistence/studio-store.js';
import { ProviderError } from '../providers/provider-request.js';
import { VECTOR_INDEX } from '../providers/providers.module.js';

type Extracted = { text: string; chunks: string[] };
const extensions = new Set(['.pdf', '.docx', '.txt']);

function extractFile(path: string, extension: string): Promise<Extracted> {
  return new Promise((resolve, reject) => {
    // Native PDF dependencies can crash a worker thread's entire host process.
    // Keep extraction in a separate, bounded process so the API stays available.
    const worker = fork(new URL('./extraction-worker.js', import.meta.url), [path, extension], {
      execArgv: ['--max-old-space-size=160'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    });
    const message = 'This file could not be processed within the limit. Upload a shorter text-only copy.';
    const timeout = setTimeout(() => { reject(new Error(message)); worker.kill(); }, 14_000);
    worker.once('message', (value: { result?: Extracted; error?: string }) => {
      clearTimeout(timeout);
      if (value.result) resolve(value.result);
      else reject(new Error(value.error ?? message));
    });
    worker.once('error', () => { clearTimeout(timeout); reject(new Error(message)); });
    worker.once('exit', () => { clearTimeout(timeout); reject(new Error(message)); });
  });
}

@Injectable()
export class SourcesService implements OnApplicationBootstrap {
  private busy = false;
  constructor(private readonly store: StudioStore, @Inject(VECTOR_INDEX) private readonly index: VectorIndex) {}

  onApplicationBootstrap() { void this.drain(); }

  async addFile(doc: string, file: Express.Multer.File | undefined) {
    if (!file || !file.size || file.size > MAX_UPLOAD) throw new BadRequestException('Choose a non-empty PDF, DOCX or TXT file up to 10 MB.');
    const base = file.originalname.split(/[/\\]/).at(-1) ?? '';
    const extension = extname(base).toLowerCase();
    if (!extensions.has(extension)) throw new BadRequestException('Upload a PDF, DOCX, or UTF-8 TXT file.');
    const id = randomUUID();
    await this.store.transaction(async () => {
      await this.checkCapacity(doc);
      writeFileSync(this.store.file(id), file.buffer, { flag: 'wx' });
      try {
        await this.store.run('INSERT INTO sources (id, doc_id, name, type, file_ext, status) VALUES ($1, $2, $3, $4, $5, $6)',
          id, doc, base.replace(/[\u0000-\u001F]/g, '').slice(0, 220), 'file', extension, 'extracting');
      } catch (error) {
        unlinkSync(this.store.file(id));
        throw error;
      }
    });
    void this.drain();
    return this.get(doc, id);
  }

  async addNote(doc: string, name: string, input: string) {
    const id = randomUUID();
    const text = normalize(input);
    let chunks: string[];
    try { chunks = splitText(text); }
    catch { throw new BadRequestException('These notes contain too many passages. Combine short paragraphs or paste a shorter extract.'); }
    if (!chunks.length) throw new BadRequestException('Paste some readable notes first.');
    await this.store.transaction(async () => {
      await this.checkCapacity(doc);
      await this.store.run('INSERT INTO sources (id, doc_id, name, type, status) VALUES ($1, $2, $3, $4, $5)',
        id, doc, name, 'note', 'ready');
      await this.storeText(id, { text, chunks });
    });
    return this.get(doc, id);
  }

  async retry(doc: string, id: string) {
    if (!uuid.safeParse(doc).success || !uuid.safeParse(id).success) {
      throw new BadRequestException('Only failed indexing can be retried. For extraction errors, upload a readable copy.');
    }
    if (!(await this.store.run("UPDATE sources SET status = 'indexing', error = NULL WHERE doc_id = $1 AND id = $2 AND retryable = 1 AND status = 'error'", doc, id)).changes) {
      throw new BadRequestException('Only failed indexing can be retried. For extraction errors, upload a readable copy.');
    }
    void this.drain();
    return this.get(doc, id);
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let source = await this.next(); source; source = await this.next()) {
        if (source.status === 'extracting') {
          try {
            const result = await extractFile(this.store.file(source.id), source.file_ext!);
            await this.store.transaction(async () => {
              await this.storeText(source!.id, result);
              await this.store.run("UPDATE sources SET status = 'indexing' WHERE id = $1", source!.id);
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Upload a fresh copy of this file.';
            await this.store.run("UPDATE sources SET status = 'error', error = $1 WHERE id = $2", message, source.id);
            continue;
          }
        }
        try {
          await this.index.prepare(source.doc_id, source.id, await this.store.chunks(source.id));
          await this.store.run("UPDATE sources SET status = 'ready', error = NULL, retryable = 0 WHERE id = $1", source.id);
        } catch (error) {
          const message = error instanceof ProviderError ? error.message : 'The index could not be built. Check Ollama and Qdrant, then retry.';
          await this.store.run("UPDATE sources SET status = 'error', error = $1, retryable = 1 WHERE id = $2", message, source.id);
        }
      }
    } finally {
      this.busy = false;
      if (await this.next()) void this.drain();
    }
  }

  private async next() {
    return this.store.one<SourceRow>("SELECT * FROM sources WHERE status IN ('extracting', 'indexing') ORDER BY position LIMIT 1");
  }

  private async storeText(id: string, result: Extracted) {
    await this.store.run('UPDATE sources SET preview = $1 WHERE id = $2', result.text.slice(0, 1400), id);
    for (const [ordinal, chunk] of result.chunks.entries()) {
      await this.store.run('INSERT INTO chunks VALUES ($1, $2, $3, $4)', randomUUID(), id, ordinal, chunk);
    }
  }

  private async checkCapacity(doc: string) {
    const current = await this.store.document(doc, true);
    if (current.sources.length >= MAX_SOURCES) throw new BadRequestException('This document already has eight sources. Remove an unused source first.');
  }

  private async get(doc: string, id: string) {
    const source = (await this.store.document(doc)).sources.find(item => item.id === id);
    if (!source) throw new NotFoundException('Source was not found.');
    return source;
  }

  async remove(doc: string, id: string) {
    // Keep authoritative excerpts while active jobs or historical snapshots may refer to them.
    // Removal is reserved for files that failed extraction before any excerpts existed.
    const source = await this.get(doc, id);
    if (source.status !== 'error' || source.retryable) throw new BadRequestException('Only unreadable files can be removed.');
    await this.store.transaction(async () => {
      const current = await this.store.document(doc);
      if (current.settings.sources.some(item => item.id === id)) {
        throw new BadRequestException('Unselect the file before removing it.');
      }
      await this.store.run('DELETE FROM sources WHERE id = $1 AND doc_id = $2', id, doc);
    });
    unlinkSync(this.store.file(id));
    return source;
  }
}
