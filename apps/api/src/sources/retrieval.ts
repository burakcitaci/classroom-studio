import { createHash } from 'node:crypto';
import type { Evidence, Settings } from '../../../../libs/contracts/src/index.js';
import type { Chunk, SourceRow } from '../persistence/studio-store.js';

export interface Hit { id: string; score: number }
export interface VectorIndex {
  prepare(docId: string, sourceId: string, chunks: Chunk[]): Promise<void>;
  search(docId: string, sourceIds: string[], query: string, limit: number, corpus: Chunk[]): Promise<Hit[]>;
}

const stopWords = new Set(('the and for with from are this that these those what which when will about your into how use ' +
  'write create give make exam quiz grade worksheet practice test some short each include explain describe students ' +
  'das der die den dem des ein eine einer einen und oder mit für von zum zur wie was auf über sind nach ' +
  'erstelle aufgaben klasse prüfung arbeitsblatt eine einen sollen soll erkläre').split(' '));
export function terms(input: string) {
  return (input.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(word => !stopWords.has(word));
}
const unique = (input: string) => new Set(terms(input));
const shared = (a: Set<string>, b: Set<string>) => [...a].filter(word => b.has(word));
const cosine = (a: Set<string>, b: Set<string>) => shared(a, b).length / Math.sqrt(a.size * b.size || 1);

export class DemoIndex implements VectorIndex {
  async prepare() { /* The demo projection is deterministic and derived from PostgreSQL. */ }

  async search(_docId: string, _sources: string[], query: string, limit: number, corpus: Chunk[]) {
    const vector = unique(query);
    return corpus.map(chunk => ({ id: chunk.id, score: cosine(vector, unique(chunk.text)) }))
      .filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

type Selected = SourceRow & { role: Settings['sources'][number]['role'] };
const title = (item: Evidence) => (item.name + ' §' + (item.ordinal + 1)).slice(0, 260);
const closeText = (a: Set<string>, b: Set<string>) => shared(a, b).length / (new Set([...a, ...b]).size || 1);
function formatId(chunkId: string) {
  const hex = createHash('sha256').update('format:' + chunkId).digest('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

function keywordRank(query: string, documents: Map<string, string[]>) {
  const words = [...unique(query)].slice(0, 55);
  const list = [...documents.entries()];
  const avg = list.reduce((sum, [, doc]) => sum + doc.length, 0) / (list.length || 1);
  const idf = new Map(words.map(word => {
    const df = list.filter(([, doc]) => doc.includes(word)).length;
    return [word, Math.log(1 + (list.length - df + 0.5) / (df + 0.5))];
  }));
  return list.map(([id, doc]) => ({
    id,
    score: words.reduce((sum, word) => {
      const freq = doc.filter(term => term === word).length;
      return sum + (freq ? idf.get(word)! * (freq * 2.2) / (freq + 1.2 * (0.25 + 0.75 * doc.length / (avg || 1))) : 0);
    }, 0),
  })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 32);
}

export async function retrieve(
  index: VectorIndex, docId: string, settings: Settings, selected: Selected[],
  getChunks: (id: string) => Chunk[], extraQuery = '',
): Promise<Evidence[]> {
  const evidence: Evidence[] = [];
  const corpus: Evidence[] = [];
  const eligible: Chunk[] = [];
  const indexed: { sourceId: string; chunks: Chunk[] }[] = [];
  for (const source of selected) {
    const chunks = getChunks(source.id);
    const map = (chunk: Chunk, use: Evidence['use']): Evidence => ({
      id: use === 'format' ? formatId(chunk.id) : chunk.id,
      sourceId: source.id, ordinal: chunk.ordinal, name: source.name, text: chunk.text, use,
    });
    if (source.role !== 'content' && evidence.filter(item => item.use === 'format').length < 8) {
      evidence.push(...chunks.slice(0, 2).map(chunk => map(chunk, 'format')));
    }
    if (source.role === 'format') continue;
    if (source.type === 'note') {
      evidence.push(...chunks.slice(0, 2).map(chunk => map(chunk, 'notes')));
    } else if (settings.rag !== 'Off' && chunks.length) {
      indexed.push({ sourceId: source.id, chunks });
      eligible.push(...chunks);
      corpus.push(...chunks.map(chunk => map(chunk, 'content')));
    }
  }
  if (settings.rag === 'Off' || corpus.length === 0) return evidence;
  for (const entry of indexed) await index.prepare(docId, entry.sourceId, entry.chunks);
  const query = [settings.brief.subject, settings.brief.topics, extraQuery, settings.brief.brief].filter(Boolean).join(' ').slice(0, 4200);
  const vector = await index.search(docId, indexed.map(item => item.sourceId), query, 32, eligible);
  const byId = new Map(corpus.map(item => [item.id, item]));
  const tokenLists = new Map(corpus.map(item => [item.id, terms(item.text)]));
  const vocabularies = new Map([...tokenLists].map(([id, words]) => [id, new Set(words)]));
  const safeVector = vector.filter(hit => byId.has(hit.id));
  if (settings.rag === 'Basic') {
    return [...evidence, ...safeVector.slice(0, settings.topK).map(hit => ({ ...byId.get(hit.id)!, score: hit.score }))];
  }

  const scores = new Map<string, number>();
  for (const ranking of [safeVector, keywordRank(query, tokenLists)]) {
    ranking.forEach((hit, i) => scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (15 + i)));
  }
  const ordered = [...scores].sort((a, b) => b[1] - a[1]);
  const ranked: Evidence[] = [];
  const add = (item: Evidence) => {
    if (ranked.length >= settings.topK || ranked.some(row => row.id === item.id ||
      closeText(vocabularies.get(row.id)!, vocabularies.get(item.id)!) >= 0.75)) return false;
    ranked.push(item);
    return true;
  };

  if (settings.rag === 'Graph' && settings.topK > 1) {
    const anchors = Math.max(1, Math.floor(settings.topK / 2));
    for (const [id, score] of ordered) {
      if (ranked.length >= anchors) break;
      add({ ...byId.get(id)!, score });
    }
    let frontier = ranked.map(item => ({ item, path: [title(item)] }));
    const visited = new Set(ranked.map(item => item.id));
    const budget = 40;
    for (let depth = 0; depth < settings.hops && ranked.length < settings.topK && visited.size < budget; depth++) {
      const next: typeof frontier = [];
      for (const anchor of frontier) {
        const words = vocabularies.get(anchor.item.id)!;
        const neighbors = corpus.filter(item => !visited.has(item.id)).map(item => ({
          item,
          adjacent: item.sourceId === anchor.item.sourceId && Math.abs(item.ordinal - anchor.item.ordinal) === 1,
          topics: shared(words, vocabularies.get(item.id)!).sort((a, b) => b.length - a.length),
        })).filter(row => row.adjacent || row.topics.length >= 2)
          .sort((a, b) => Number(b.adjacent) - Number(a.adjacent) || b.topics.length - a.topics.length).slice(0, 5);
        for (const neighbor of neighbors) {
          if (visited.has(neighbor.item.id) || visited.size >= budget || ranked.length >= settings.topK) continue;
          visited.add(neighbor.item.id);
          const relation = neighbor.adjacent ? 'Nearby passage' : 'Shared topic: ' + neighbor.topics.slice(0, 2).join(', ');
          const path = [...anchor.path, relation.slice(0, 400), title(neighbor.item)];
          add({ ...neighbor.item, path });
          next.push({ item: neighbor.item, path });
        }
      }
      frontier = next;
    }
  }
  for (const [id, score] of ordered) add({ ...byId.get(id)!, score });
  return [...evidence, ...ranked];
}
