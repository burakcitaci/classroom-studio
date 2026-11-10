import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Hit, VectorIndex } from './retrieval.js';
import type { Chunk } from './store.js';

export const embeddingResponse = z.object({ embeddings: z.array(z.array(z.number()).min(1).max(8192)) });
const hitsResponse = z.object({ result: z.object({ points: z.array(z.object({ id: z.string(), score: z.number() })).max(32) }) });
const countResponse = z.object({ result: z.object({ count: z.number() }) });

export class ProviderError extends Error {}

export async function localRequest(base: string, path: string, options: {
  body?: unknown; method?: string; timeout: number; key?: string; name: string; allowMissing?: boolean;
}): Promise<unknown> {
  try {
    const response = await fetch(new URL(path, base), {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(options.key ? { 'api-key': options.key } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeout),
      redirect: 'error',
    });
    if (response.status === 404 && options.allowMissing) return null;
    if (!response.ok) throw new ProviderError(options.name + ' rejected the request (HTTP ' + response.status + '). Check the local service and model settings.');
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(options.name + ' did not respond. Check that it is running and try again.');
  }
}

export class QdrantIndex implements VectorIndex {
  private readonly collection: string;
  private readonly pending = new Map<string, Promise<void>>();
  private creating?: Promise<void>;

  constructor(private readonly config: { ollamaUrl: string; embedding: string; qdrantUrl: string; qdrantKey?: string }) {
    const hash = createHash('sha256').update(config.ollamaUrl + ':' + config.embedding).digest('hex').slice(0, 16);
    this.collection = '/collections/classroom-studio-v1-' + hash;
  }

  private request(path: string, body?: unknown, method?: string, allowMissing?: boolean) {
    return localRequest(this.config.qdrantUrl, this.collection + path, {
      name: 'Qdrant', key: this.config.qdrantKey, timeout: 10_000, body, method, allowMissing,
    });
  }

  private async embed(input: string[], search: boolean) {
    const prefix = this.config.embedding.startsWith('nomic-embed-text')
      ? (search ? 'search_query: ' : 'search_document: ') : '';
    const result = embeddingResponse.parse(await localRequest(this.config.ollamaUrl, '/api/embed', {
      name: 'Ollama embeddings', timeout: 45_000,
      body: { model: this.config.embedding, input: input.map(text => prefix + text), truncate: true },
    }));
    if (result.embeddings.length !== input.length ||
        result.embeddings.some(vector => vector.length !== result.embeddings[0].length)) {
      throw new ProviderError('Ollama returned incomplete embeddings. Check the embedding model and retry.');
    }
    return result.embeddings;
  }

  private async ensureCollection(size: number) {
    if (!this.creating) {
      this.creating = (async () => {
        if (await this.request('', undefined, 'GET', true) === null) {
          await this.request('', { vectors: { size, distance: 'Cosine' } }, 'PUT');
        }
      })().finally(() => { this.creating = undefined; });
    }
    await this.creating;
  }

  prepare(docId: string, sourceId: string, chunks: Chunk[]) {
    if (!chunks.length) return Promise.resolve();
    const pending = this.pending.get(sourceId);
    if (pending) return pending;
    const indexing = this.index(docId, sourceId, chunks).finally(() => this.pending.delete(sourceId));
    this.pending.set(sourceId, indexing);
    return indexing;
  }

  private filter(docId: string, sourceIds: string[]) {
    return { must: [{ key: 'docId', match: { value: docId } }, { key: 'sourceId', match: { any: sourceIds } }] };
  }

  private async index(docId: string, sourceId: string, chunks: Chunk[]) {
    const filter = this.filter(docId, [sourceId]);
    const count = await this.request('/points/count', { filter, exact: true }, 'POST', true);
    if (count && countResponse.parse(count).result.count === chunks.length) return;

    for (let offset = 0; offset < chunks.length; offset += 20) {
      const batch = chunks.slice(offset, offset + 20);
      const vectors = await this.embed(batch.map(chunk => chunk.text), false);
      if (offset === 0) await this.ensureCollection(vectors[0].length);
      await this.request('/points?wait=true', {
        points: batch.map((chunk, i) => ({ id: chunk.id, vector: vectors[i], payload: { docId, sourceId } })),
      }, 'PUT');
    }
  }

  async search(docId: string, sourceIds: string[], query: string, limit: number): Promise<Hit[]> {
    const [vector] = await this.embed([query], true);
    const result = await this.request('/points/query', {
      query: vector, filter: this.filter(docId, sourceIds), limit, score_threshold: 0.28,
    });
    return hitsResponse.parse(result).result.points;
  }
}
