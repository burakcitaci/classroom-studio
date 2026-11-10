import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Generation, type Job, type Question } from '../../../libs/contracts/src/index.js';
import { parameters, PROMPT_VERSION, type Generator, validateAssessment } from './assessment.js';
import { ProviderError } from './ollama.js';
import { retrieve, type VectorIndex } from './retrieval.js';
import { decode, encode, now, Store, type JobRow } from './store.js';

interface Input {
  settings: Generation;
  existing?: Question;
}

export class JobService {
  private busy = false;
  constructor(private readonly store: Store, private readonly index: VectorIndex, private readonly generator: Generator,
    private readonly demoDelay = 0) {}

  recover() {
    for (const row of this.store.all<JobRow>("SELECT * FROM jobs WHERE stage IN ('retrieving', 'generating', 'validating')")) {
      if (row.stage === 'retrieving') {
        this.write(row.id, { ...decode<Job>(row.audit), stage: 'queued' });
      } else {
        this.fail(row, decode(row.audit), 'Generation was interrupted. Start a new attempt to retry.');
      }
    }
    void this.drain();
  }

  list(id: string) {
    this.store.document(id);
    return this.store.jobRows(id).map(row => decode<Job>(row.audit));
  }

  enqueue(id: string, key: string, edit: number, settings: Generation) {
    const job = this.store.transaction(() => {
      const previous = this.store.one<JobRow>('SELECT * FROM jobs WHERE doc_id = ? AND request_key = ?', id, key);
      if (previous) {
        if (encode(decode<Input>(previous.input).settings) !== encode(settings)) {
          throw new ConflictException('This request key already belongs to different generation settings.');
        }
        return decode<Job>(previous.audit);
      }
      const doc = this.store.document(id);
      if (doc.edit !== edit) throw new ConflictException('The draft changed. Reload the document before generating.');
      const existing = settings.questionId
        ? doc.draft?.sections.flatMap(section => section.questions).find(item => item.id === settings.questionId)
        : undefined;
      if (settings.questionId && !existing) throw new BadRequestException('That question is no longer in this draft.');
      const selected = this.store.selectedSources(id, settings);
      const audit: Job = { id: randomUUID(), stage: 'queued', created: now(), model: this.generator.model,
        promptVersion: PROMPT_VERSION, parameters, settings,
        sources: selected.map(({ id, name, type }) => ({ id, name, type })), evidence: [], warnings: [] };
      this.store.run('INSERT INTO jobs (id, doc_id, request_key, input, base_edit, created, stage, audit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        audit.id, id, key, encode({ settings, existing }), edit, audit.created, audit.stage, encode(audit));
      return audit;
    });
    void this.drain();
    return job;
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (;;) {
        const row = this.store.one<JobRow>("SELECT * FROM jobs WHERE stage = 'queued' ORDER BY created, rowid LIMIT 1");
        if (!row) break;
        const audit = decode<Job>(row.audit);
        audit.stage = 'retrieving';
        row.started = now();
        if (!this.store.run("UPDATE jobs SET started = ?, stage = 'retrieving', audit = ? WHERE id = ? AND stage = 'queued'",
          row.started, encode(audit), row.id).changes) continue;
        try {
          await this.process(row, audit);
        } catch (error) {
          this.fail(row, audit, error instanceof ProviderError ? error.message : 'Generation could not be completed. Review the selected sources and retry.');
        }
      }
    } finally { this.busy = false; }
  }

  private async process(row: JobRow, audit: Job) {
    const { settings, existing } = decode<Input>(row.input);
    const selected = this.store.selectedSources(row.doc_id, settings);
    const usable = selected.filter(source => source.type === 'note' || source.status === 'ready' ||
      (source.role !== 'content' && (settings.rag === 'Off' || source.role === 'format') && source.chunks > 0));
    if (usable.length < selected.length) {
      audit.warnings.push('Some selected sources are still processing or need attention.');
    }
    const evidence = await retrieve(this.index, row.doc_id, settings, usable, id => this.store.chunks(id), existing?.prompt);
    audit.evidence = evidence;
    if (settings.rag !== 'Off' && !evidence.some(item => item.use === 'content')) {
      throw new ProviderError('No useful content excerpts were found. Try different materials, choose another mode, or switch to Off.');
    }
    if (selected.some(source => source.role !== 'content') && !evidence.some(item => item.use === 'format')) {
      audit.warnings.push('The selected format sample had no readable passages.');
    }
    if (audit.model !== this.generator.model || audit.promptVersion !== PROMPT_VERSION) {
      throw new ProviderError('Generation settings changed after this request was queued. Start a new attempt.');
    }

    audit.stage = 'generating';
    this.write(row.id, audit);
    if (this.demoDelay) await new Promise(resolve => setTimeout(resolve, this.demoDelay));
    const context = { settings, existing, evidence: evidence.filter(item => item.use !== 'format'),
      format: evidence.filter(item => item.use === 'format') };
    const response = await this.generator.generate(context);
    audit.usage = response.usage;
    audit.stage = 'validating';
    this.write(row.id, audit);

    const current = this.store.document(row.doc_id);
    const draft = validateAssessment(response.output, context, current.draft);
    audit.warnings.push(...draft.warnings);
    draft.warnings = [...new Set(audit.warnings)];
    this.store.transaction(() => {
      if (existing) {
        audit.preview = draft.sections[0].questions[0];
      } else {
        const { questionId: _questionId, ...snapshotSettings } = settings;
        const version = this.store.addSnapshot(row.doc_id, 'AI', draft, snapshotSettings, audit.id);
        audit.versionId = version.id;
        const changed = this.store.run('UPDATE documents SET draft = ?, settings = ?, updated = ?, edit = edit + 1, ready = 0 WHERE id = ? AND edit = ?',
          encode(draft), encode(snapshotSettings), now(), row.doc_id, row.base_edit);
        if (!changed.changes) audit.warnings.push('Teacher edits were kept. Open the generated version in History.');
      }
      audit.stage = 'succeeded';
      audit.duration = Date.now() - Date.parse(row.started ?? row.created);
      this.write(row.id, audit);
    });
  }

  private fail(row: JobRow, audit: Job, error: string) {
    this.write(row.id, { ...audit, stage: 'failed', duration: Date.now() - Date.parse(row.started ?? row.created), error });
  }

  private write(id: string, audit: Job) {
    this.store.run('UPDATE jobs SET stage = ?, audit = ? WHERE id = ?', audit.stage, encode(audit), id);
  }
}
