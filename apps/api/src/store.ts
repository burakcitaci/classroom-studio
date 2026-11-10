import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { settingsSchema, type Assessment, type DocumentSummary, type Job, type Revision, type Settings, type Source, type StudioDocument, type Working } from '../../../libs/contracts/src/index.js';

export const now = () => new Date().toISOString();
export const encode = (value: unknown) => JSON.stringify(value);
export const decode = <T>(value: string): T => JSON.parse(value) as T;

export interface Chunk { id: string; source_id: string; ordinal: number; text: string }
export interface SourceRow {
  id: string; doc_id: string; name: string; type: Source['type']; file_ext: string | null;
  status: Source['status']; preview: string; error: string | null; retryable: number; chunks: number;
}
export interface JobRow {
  id: string; doc_id: string; input: string; base_edit: number; created: string;
  started: string | null; stage: Job['stage']; audit: string;
}
interface DocumentRow {
  id: string; updated: string; edit: number; ready: number; settings: string; draft: string | null;
}
interface RevisionRow {
  id: string; number: number; kind: Revision['kind']; created: string; settings: string; draft: string;
  job_id: string | null;
}

export class Store {
  readonly data: string;
  private readonly db: DatabaseSync;

  constructor(data = process.env['STUDIO_DATA'] || '.studio') {
    this.data = resolve(data);
    mkdirSync(join(this.data, 'uploads'), { recursive: true });
    this.db = new DatabaseSync(join(this.data, 'studio.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
    const path = resolve('apps/api/migrations');
    for (const file of readdirSync(path).filter(name => name.endsWith('.sql')).sort()) {
      this.transaction(() => {
        if (this.one('SELECT name FROM migrations WHERE name = ?', file)) return;
        this.db.exec(readFileSync(join(path, file), 'utf8'));
        this.run('INSERT INTO migrations VALUES (?)', file);
      });
    }
  }

  close() { this.db.close(); }
  run(sql: string, ...values: SQLInputValue[]) { return this.db.prepare(sql).run(...values); }
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...values) as T | undefined;
  }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as T[]; }

  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  file(id: string) { return join(this.data, 'uploads', id); }

  create(settings: Settings) {
    const id = randomUUID();
    this.run('INSERT INTO documents (id, updated, settings) VALUES (?, ?, ?)', id, now(), encode(settings));
    return this.document(id);
  }

  list(): DocumentSummary[] {
    return this.all<DocumentRow>('SELECT * FROM documents ORDER BY updated DESC LIMIT 250').map(row => {
      const { brief } = decode<Settings>(row.settings);
      const draft = row.draft ? decode<Assessment>(row.draft) : null;
      return { id: row.id, updated: row.updated, title: draft?.title ?? (brief.subject || brief.brief.slice(0, 75) || 'Untitled ' + brief.kind.toLowerCase()),
        kind: brief.kind, subject: brief.subject, grade: brief.grade, language: brief.language,
        status: row.ready ? 'Ready' : draft ? 'Draft' : 'Planning' };
    });
  }

  document(id: string): StudioDocument {
    const row = this.one<DocumentRow>('SELECT * FROM documents WHERE id = ?', id);
    if (!row) throw new NotFoundException('Document was not found.');
    return { id: row.id, updated: row.updated, edit: row.edit, ready: Boolean(row.ready),
      settings: settingsSchema.parse(decode(row.settings)), draft: row.draft ? decode(row.draft) : null,
      sources: this.sourceRows(id).map(source => ({
        id: source.id, name: source.name, type: source.type, status: source.status, preview: source.preview,
        error: source.error ?? undefined, retryable: Boolean(source.retryable), chunks: source.chunks,
      })) };
  }

  sourceRows(id: string): SourceRow[] {
    return this.all<SourceRow>(`SELECT sources.*, (SELECT COUNT(*) FROM chunks WHERE source_id = sources.id) AS chunks
      FROM sources WHERE doc_id = ? ORDER BY rowid`, id);
  }

  selectedSources(id: string, settings: Settings) {
    const byId = new Map(this.sourceRows(id).map(source => [source.id, source]));
    return settings.sources.map(selection => {
      const source = byId.get(selection.id);
      if (!source) throw new BadRequestException('Choose sources from this document.');
      return { ...source, role: selection.role };
    });
  }

  save(id: string, working: Working): StudioDocument {
    return this.transaction(() => {
      const current = this.document(id);
      if (current.edit !== working.edit) throw new ConflictException('A newer draft exists. Reload it before saving.');
      this.selectedSources(id, working.settings);
      const settings = encode(working.settings);
      const draft = working.draft ? encode(working.draft) : null;
      if (settings !== encode(current.settings) || draft !== (current.draft ? encode(current.draft) : null)) {
        this.checkEvidence(id, working.draft, current.draft);
        this.run('UPDATE documents SET updated = ?, edit = edit + 1, settings = ?, draft = ?, ready = 0 WHERE id = ?',
          now(), settings, draft, id);
      }
      return this.document(id);
    });
  }

  private checkEvidence(id: string, draft: Assessment | null, current: Assessment | null) {
    if (!draft?.evidence.length) return;
    const evidence = new Map((current?.evidence ?? []).map(item => [item.id, item]));
    if (draft.evidence.some(item => !evidence.has(item.id))) {
      for (const revision of this.snapshots(id)) {
        for (const item of revision.draft.evidence) if (!evidence.has(item.id)) evidence.set(item.id, item);
      }
      for (const job of this.jobRows(id)) {
        const audit = decode<Job>(job.audit);
        if (!audit.preview) continue;
        for (const item of audit.evidence) if (!evidence.has(item.id)) evidence.set(item.id, item);
      }
    }
    if (draft.evidence.some(item => {
      const known = evidence.get(item.id);
      return !known || known.sourceId !== item.sourceId || known.text !== item.text ||
        known.name !== item.name || known.ordinal !== item.ordinal || known.use !== item.use;
    })) {
      throw new BadRequestException('Evidence must match a saved excerpt for this assessment.');
    }
  }

  snapshots(id: string): Revision[] {
    this.document(id);
    return this.all<RevisionRow>('SELECT * FROM revisions WHERE doc_id = ? ORDER BY number DESC', id).map(row => this.revision(row));
  }

  snapshot(id: string, version: string): Revision {
    const row = this.one<RevisionRow>('SELECT * FROM revisions WHERE doc_id = ? AND id = ?', id, version);
    if (!row) throw new NotFoundException('Version was not found.');
    return this.revision(row);
  }

  addSnapshot(id: string, kind: Revision['kind'], draft: Assessment, settings: Settings, jobId?: string) {
    const revision = randomUUID();
    this.run(`INSERT INTO revisions VALUES (?, ?, (SELECT COALESCE(MAX(number), 0) + 1 FROM revisions WHERE doc_id = ?),
      ?, ?, ?, ?, ?)`, revision, id, id, kind, now(), encode(draft), encode(settings), jobId ?? null);
    return this.snapshot(id, revision);
  }

  private revision(row: RevisionRow): Revision {
    return { id: row.id, number: row.number, kind: row.kind, created: row.created, settings: decode(row.settings),
      draft: decode(row.draft), jobId: row.job_id ?? undefined };
  }

  commit(id: string, edit: number, kind: 'Teacher' | 'Ready', acceptWarnings: boolean) {
    return this.transaction(() => {
      const current = this.document(id);
      if (current.edit !== edit) throw new ConflictException('A newer draft exists. Reload it before saving.');
      if (!current.draft) throw new BadRequestException('Generate or add a draft first.');
      if (kind === 'Ready' && current.draft.warnings.length && !acceptWarnings) {
        throw new BadRequestException('Review and acknowledge the warnings before marking this version ready.');
      }
      if (kind === 'Ready' && !current.draft.sections.some(section => section.questions.length)) {
        throw new BadRequestException('Add a question before marking this version ready.');
      }
      const revision = this.addSnapshot(id, kind, current.draft, current.settings);
      if (kind === 'Ready') this.run('UPDATE documents SET ready = 1, updated = ?, edit = edit + 1 WHERE id = ?', now(), id);
      return revision;
    });
  }

  restore(id: string, version: string, edit: number) {
    return this.transaction(() => {
      const snapshot = this.snapshot(id, version);
      const changed = this.run('UPDATE documents SET draft = ?, settings = ?, updated = ?, ready = 0, edit = edit + 1 WHERE id = ? AND edit = ?',
        encode(snapshot.draft), encode(snapshot.settings), now(), id, edit);
      if (!changed.changes) throw new ConflictException('A newer draft exists. Reload it before restoring.');
      this.addSnapshot(id, 'Restored', snapshot.draft, snapshot.settings, snapshot.jobId);
      return this.document(id);
    });
  }

  chunks(sourceId: string) {
    return this.all<Chunk>('SELECT * FROM chunks WHERE source_id = ? ORDER BY ordinal', sourceId);
  }

  jobRows(id: string) {
    return this.all<JobRow>('SELECT * FROM jobs WHERE doc_id = ? ORDER BY created DESC, rowid DESC', id);
  }
}
