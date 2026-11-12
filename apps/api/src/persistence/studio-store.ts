import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient } from 'pg';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { uuid, documentKind, settingsSchema, type Assessment, type DocumentContextInput, type DocumentSummary, type Job, type Revision, type Settings, type Source, type StudioDocument, type Working } from '../../../../libs/contracts/src/index.js';

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
interface ContextRow {
  class_id: string | null; class_title: string | null; lesson_id: string | null; lesson_title: string | null;
}
const documentQuery = `SELECT d.*, c.title AS class_title, l.title AS lesson_title
  FROM documents d LEFT JOIN classrooms c ON c.id = d.class_id LEFT JOIN lessons l ON l.id = d.lesson_id`;
const contextView = (row: ContextRow) => row.class_id && row.class_title
  ? { classId: row.class_id, classTitle: row.class_title, lessonId: row.lesson_id, lessonTitle: row.lesson_title }
  : null;

interface RevisionRow {
  id: string; number: number; kind: Revision['kind']; created: string; settings: string; draft: string;
  job_id: string | null;
}

export class StudioStore {
  readonly data: string;
  private readonly pool: Pool;
  private readonly connection = new AsyncLocalStorage<PoolClient>();

  private constructor(data: string, databaseUrl: string, schema: string) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Use a valid PostgreSQL schema name.');
    this.data = resolve(data);
    mkdirSync(join(this.data, 'uploads'), { recursive: true });
    this.pool = new Pool({
      connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 5000,
      options: '-c search_path=' + schema,
      types: { getTypeParser: (oid, format) => {
        if (oid === 20) return (value: string) => Number(value);
        if (oid === 114) return (value: string) => value;
        if (oid === 1184) return (value: string) => new Date(value).toISOString();
        return types.getTypeParser(oid, format);
      } },
    });
    this.pool.on('error', () => console.error('PostgreSQL connection interrupted. Check the local database service.'));
  }

  static async connect(data: string, databaseUrl: string, schema: string) {
    const store = new StudioStore(data, databaseUrl, schema);
    try {
      await store.run('CREATE SCHEMA IF NOT EXISTS "' + schema + '"');
      await store.transaction(async () => {
        await store.run("SELECT pg_advisory_xact_lock(hashtext(current_schema()), hashtext('classroom-studio-migrations'))");
        await store.run('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
        const path = resolve('apps/api/migrations');
        for (const file of readdirSync(path).filter(name => name.endsWith('.sql')).sort()) {
          if (await store.one('SELECT name FROM migrations WHERE name = $1', file)) continue;
          await store.query(readFileSync(join(path, file), 'utf8'));
          await store.run('INSERT INTO migrations VALUES ($1)', file);
        }
      });
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  close() { return this.pool.end(); }
  onModuleDestroy() { return this.close(); }

  private query(sql: string, values: unknown[] = []) {
    return (this.connection.getStore() ?? this.pool).query(sql, values);
  }

  async run(sql: string, ...values: unknown[]) {
    const result = await this.query(sql, values);
    return { changes: result.rowCount ?? 0 };
  }

  async one<T>(sql: string, ...values: unknown[]): Promise<T | undefined> {
    return (await this.all<T>(sql, ...values))[0];
  }

  async all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    return (await this.query(sql, values)).rows as T[];
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.connection.getStore()) return work();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      return await this.connection.run(client, async () => {
        const result = await work();
        await client.query('COMMIT');
        return result;
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  file(id: string) { return join(this.data, 'uploads', id); }

  async create(settings: Settings, context?: DocumentContextInput) {
    const id = randomUUID();
    await this.run('INSERT INTO documents (id, updated, settings, class_id, lesson_id) VALUES ($1, $2, $3, $4, $5)',
      id, now(), encode(settings), context?.classId ?? null, context?.lessonId ?? null);
    return this.document(id);
  }

  async list(classId?: string): Promise<DocumentSummary[]> {
    const order = ' ORDER BY d.updated DESC LIMIT 250';
    const rows = classId
      ? await this.all<DocumentRow & ContextRow>(documentQuery + ' WHERE d.class_id = $1' + order, classId)
      : await this.all<DocumentRow & ContextRow>(documentQuery + order);
    return rows.map(row => {
      const { brief } = decode<Settings>(row.settings);
      const draft = row.draft ? decode<Assessment>(row.draft) : null;
      const context = contextView(row);
      const plannedTitle = brief.topics ? brief.topics + ' · ' + documentKind(brief) : brief.subject || brief.brief.slice(0, 75);
      return { id: row.id, updated: row.updated, context, title: draft?.title ?? (plannedTitle || 'Untitled ' + documentKind(brief).toLowerCase()),
        kind: brief.kind, documentType: brief.documentType, subject: brief.subject, grade: brief.grade, language: brief.language,
        status: row.ready ? 'Ready' : draft ? 'Draft' : 'Planning' };
    });
  }

  async document(id: string, lock = false): Promise<StudioDocument> {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Document was not found.');
    const row = await this.one<DocumentRow & ContextRow>(documentQuery + ' WHERE d.id = $1' + (lock ? ' FOR UPDATE OF d' : ''), id);
    if (!row) throw new NotFoundException('Document was not found.');
    return { id: row.id, context: contextView(row), updated: row.updated, edit: row.edit, ready: Boolean(row.ready),
      settings: settingsSchema.parse(decode(row.settings)), draft: row.draft ? decode(row.draft) : null,
      sources: (await this.sourceRows(id)).map(source => ({
        id: source.id, name: source.name, type: source.type, status: source.status, preview: source.preview,
        error: source.error ?? undefined, retryable: Boolean(source.retryable), chunks: source.chunks,
      })) };
  }

  async fileDocument(id: string, edit: number, context: DocumentContextInput): Promise<StudioDocument> {
    return this.transaction(async () => {
      const current = await this.document(id, true);
      if (current.edit !== edit) throw new ConflictException('This document changed. Reload it before filing.');
      if ((current.context?.classId ?? null) === context.classId && (current.context?.lessonId ?? null) === context.lessonId) {
        return current;
      }
      await this.run('UPDATE documents SET class_id = $1, lesson_id = $2, updated = $3, edit = edit + 1 WHERE id = $4',
        context.classId, context.lessonId, now(), id);
      return this.document(id);
    });
  }

  async sourceRows(id: string): Promise<SourceRow[]> {
    return this.all<SourceRow>(`SELECT sources.*, (SELECT COUNT(*) FROM chunks WHERE source_id = sources.id) AS chunks
      FROM sources WHERE doc_id = $1 ORDER BY position`, id);
  }

  async selectedSources(id: string, settings: Settings) {
    const byId = new Map((await this.sourceRows(id)).map(source => [source.id, source]));
    return settings.sources.map(selection => {
      const source = byId.get(selection.id);
      if (!source) throw new BadRequestException('Choose sources from this document.');
      return { ...source, role: selection.role };
    });
  }

  async save(id: string, working: Working): Promise<StudioDocument> {
    return this.transaction(async () => {
      const current = await this.document(id, true);
      if (current.edit !== working.edit) throw new ConflictException('A newer draft exists. Reload it before saving.');
      await this.selectedSources(id, working.settings);
      const settings = encode(working.settings);
      const draft = working.draft ? encode(working.draft) : null;
      if (settings !== encode(current.settings) || draft !== (current.draft ? encode(current.draft) : null)) {
        await this.checkEvidence(id, working.draft, current.draft);
        await this.run('UPDATE documents SET updated = $1, edit = edit + 1, settings = $2, draft = $3, ready = 0 WHERE id = $4',
          now(), settings, draft, id);
      }
      return this.document(id);
    });
  }

  private async checkEvidence(id: string, draft: Assessment | null, current: Assessment | null) {
    if (!draft?.evidence.length) return;
    const evidence = new Map((current?.evidence ?? []).map(item => [item.id, item]));
    if (draft.evidence.some(item => !evidence.has(item.id))) {
      for (const revision of await this.snapshots(id)) {
        for (const item of revision.draft.evidence) if (!evidence.has(item.id)) evidence.set(item.id, item);
      }
      for (const job of await this.jobRows(id)) {
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

  async snapshots(id: string): Promise<Revision[]> {
    await this.document(id);
    return (await this.all<RevisionRow>('SELECT * FROM revisions WHERE doc_id = $1 ORDER BY number DESC', id)).map(row => this.revision(row));
  }

  async snapshot(id: string, version: string): Promise<Revision> {
    if (!uuid.safeParse(id).success || !uuid.safeParse(version).success) throw new NotFoundException('Version was not found.');
    const row = await this.one<RevisionRow>('SELECT * FROM revisions WHERE doc_id = $1 AND id = $2', id, version);
    if (!row) throw new NotFoundException('Version was not found.');
    return this.revision(row);
  }

  async addSnapshot(id: string, kind: Revision['kind'], draft: Assessment, settings: Settings, jobId?: string) {
    return this.transaction(async () => {
      await this.document(id, true);
      const revision = randomUUID();
      await this.run(`INSERT INTO revisions VALUES ($1, $2, (SELECT COALESCE(MAX(number), 0) + 1 FROM revisions WHERE doc_id = $3),
        $4, $5, $6, $7, $8)`, revision, id, id, kind, now(), encode(draft), encode(settings), jobId ?? null);
      return this.snapshot(id, revision);
    });
  }

  private revision(row: RevisionRow): Revision {
    return { id: row.id, number: row.number, kind: row.kind, created: row.created, settings: decode(row.settings),
      draft: decode(row.draft), jobId: row.job_id ?? undefined };
  }

  async commit(id: string, edit: number, kind: 'Teacher' | 'Ready', acceptWarnings: boolean) {
    return this.transaction(async () => {
      const current = await this.document(id, true);
      if (current.edit !== edit) throw new ConflictException('A newer draft exists. Reload it before saving.');
      if (!current.draft) throw new BadRequestException('Generate or add a draft first.');
      if (kind === 'Ready' && current.draft.warnings.length && !acceptWarnings) {
        throw new BadRequestException('Review and acknowledge the warnings before marking this version ready.');
      }
      if (kind === 'Ready' && !current.draft.sections.some(section => section.questions.length)) {
        throw new BadRequestException('Add a question before marking this version ready.');
      }
      const revision = await this.addSnapshot(id, kind, current.draft, current.settings);
      if (kind === 'Ready') await this.run('UPDATE documents SET ready = 1, updated = $1, edit = edit + 1 WHERE id = $2', now(), id);
      return revision;
    });
  }

  async restore(id: string, version: string, edit: number) {
    return this.transaction(async () => {
      const snapshot = await this.snapshot(id, version);
      const changed = await this.run('UPDATE documents SET draft = $1, settings = $2, updated = $3, ready = 0, edit = edit + 1 WHERE id = $4 AND edit = $5',
        encode(snapshot.draft), encode(snapshot.settings), now(), id, edit);
      if (!changed.changes) throw new ConflictException('A newer draft exists. Reload it before restoring.');
      await this.addSnapshot(id, 'Restored', snapshot.draft, snapshot.settings, snapshot.jobId);
      return this.document(id);
    });
  }

  async chunks(sourceId: string) {
    return this.all<Chunk>('SELECT * FROM chunks WHERE source_id = $1 ORDER BY ordinal', sourceId);
  }

  async jobRows(id: string) {
    return this.all<JobRow>('SELECT * FROM jobs WHERE doc_id = $1 ORDER BY created DESC, position DESC', id);
  }
}
