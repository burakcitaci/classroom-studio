import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { uuid, type DocumentType, type DocumentTypeInput } from '../../../../libs/contracts/src/index.js';
import { StudioStore, now } from '../persistence/studio-store.js';

type Row = Omit<DocumentType, 'archived'> & { archived: number };
const view = (row: Row): DocumentType => ({ ...row, archived: Boolean(row.archived) });

@Injectable()
export class DocumentTypesService {
  constructor(private readonly store: StudioStore) {}
  async list() { return (await this.store.all<Row>('SELECT * FROM document_types WHERE archived = 0 ORDER BY lower(title), id')).map(view); }
  async get(id: string) {
    if (!uuid.safeParse(id).success) throw new NotFoundException('Document type was not found.');
    const row = await this.store.one<Row>('SELECT * FROM document_types WHERE id = $1', id);
    if (!row) throw new NotFoundException('Document type was not found.');
    return view(row);
  }
  async create(input: DocumentTypeInput) {
    const id = randomUUID();
    try {
      await this.store.run('INSERT INTO document_types (id, title, guidance, audience, updated) VALUES ($1, $2, $3, $4, $5)', id, input.title, input.guidance, input.audience, now());
    } catch (error) { this.rethrow(error); }
    return this.get(id);
  }
  async update(id: string, input: DocumentTypeInput & { edit: number; archived: boolean }) {
    await this.get(id);
    try {
      const changed = await this.store.run('UPDATE document_types SET title = $1, guidance = $2, audience = $3, archived = $4, updated = $5, edit = edit + 1 WHERE id = $6 AND edit = $7',
        input.title, input.guidance, input.audience, Number(input.archived), now(), id, input.edit);
      if (!changed.changes) throw new ConflictException('This document type changed. Reload it before saving.');
    } catch (error) { this.rethrow(error); }
    return this.get(id);
  }
  private rethrow(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ConflictException('A document type with this name already exists.');
    }
    throw error;
  }
}
