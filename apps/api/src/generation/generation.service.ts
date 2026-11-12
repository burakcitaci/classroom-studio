import { BadRequestException, ConflictException, Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Brief, type Generation, type Job, type Question } from '../../../../libs/contracts/src/index.js';
import { parameters, PROMPT_VERSION, type FactPassage, type Generator, validateAssessment } from './assessment/assessment-schema.js';
import { factPassages, isExamReference } from './assessment/exam-reference.js';
import { ProviderError } from '../providers/provider-request.js';
import { retrieve, type VectorIndex } from '../sources/retrieval.js';
import { decode, encode, now, StudioStore, type JobRow } from '../persistence/studio-store.js';
import { StudioConfig } from '../config/studio-config.js';
import { GENERATOR, VECTOR_INDEX } from '../providers/providers.module.js';

interface Input {
  settings: Generation;
  existing?: Question;
}

function briefLimits(brief: Brief): Brief {
  const points = Number(/\b(?:gesamtpunktzahl|gesamtpunkte|total\s+(?:points|marks))\s*[:=]?\s*(\d+)\b/i.exec(brief.brief)?.[1]);
  const minutes = Number(/\b(?:zeitansatz|arbeitszeit|dauer|duration|time\s+limit)\s*[:=]?\s*(\d+)\s*(?:minutes?|minuten|min)\b/i.exec(brief.brief)?.[1]);
  return { ...brief,
    totalPoints: brief.totalPoints ?? (points >= 1 && points <= 500 ? points : null),
    duration: brief.duration ?? (minutes >= 1 && minutes <= 480 ? minutes : null) };
}

@Injectable()
export class GenerationService implements OnApplicationBootstrap {
  private busy = false;
  constructor(
    private readonly store: StudioStore,
    @Inject(VECTOR_INDEX) private readonly index: VectorIndex,
    @Inject(GENERATOR) private readonly generator: Generator,
    private readonly config: StudioConfig,
  ) {}

  async onApplicationBootstrap() {
    for (const row of await this.store.all<JobRow>("SELECT * FROM jobs WHERE stage IN ('retrieving', 'generating', 'validating')")) {
      if (row.stage === 'retrieving') {
        await this.write(row.id, { ...decode<Job>(row.audit), stage: 'queued' });
      } else {
        await this.fail(row, decode(row.audit), 'Generation was interrupted. Start a new attempt to retry.');
      }
    }
    void this.drain();
  }

  async list(id: string) {
    await this.store.document(id);
    return (await this.store.jobRows(id)).map(row => decode<Job>(row.audit));
  }

  async enqueue(id: string, key: string, edit: number, settings: Generation) {
    const job = await this.store.transaction(async () => {
      const doc = await this.store.document(id, true);
      const previous = await this.store.one<JobRow>('SELECT * FROM jobs WHERE doc_id = $1 AND request_key = $2', id, key);
      if (previous) {
        if (encode(decode<Input>(previous.input).settings) !== encode(settings)) {
          throw new ConflictException('This request key already belongs to different generation settings.');
        }
        return decode<Job>(previous.audit);
      }
      if (doc.edit !== edit) throw new ConflictException('The draft changed. Reload the document before generating.');
      const existing = settings.questionId
        ? doc.draft?.sections.flatMap(section => section.questions).find(item => item.id === settings.questionId)
        : undefined;
      if (settings.questionId && !existing) throw new BadRequestException('That question is no longer in this draft.');
      const selected = await this.store.selectedSources(id, settings);
      if (settings.generationModel && !this.generator.listModels) {
        throw new BadRequestException('Enable Ollama mode before selecting a model.');
      }
      const audit: Job = { id: randomUUID(), stage: 'queued', created: now(),
        model: settings.generationModel ?? this.generator.model,
        promptVersion: PROMPT_VERSION, parameters, settings,
        sources: selected.map(({ id, name, type }) => ({ id, name, type })), evidence: [], warnings: [] };
      await this.store.run('INSERT INTO jobs (id, doc_id, request_key, input, base_edit, created, stage, audit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
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
        const row = await this.store.one<JobRow>("SELECT * FROM jobs WHERE stage = 'queued' ORDER BY created, position LIMIT 1");
        if (!row) break;
        const audit = decode<Job>(row.audit);
        audit.stage = 'retrieving';
        row.started = now();
        if (!(await this.store.run("UPDATE jobs SET started = $1, stage = 'retrieving', audit = $2 WHERE id = $3 AND stage = 'queued'",
          row.started, encode(audit), row.id)).changes) continue;
        try {
          await this.process(row, audit);
        } catch (error) {
          await this.fail(row, audit, error instanceof ProviderError ? error.message : 'Generation could not be completed. Review the selected sources and retry.');
        }
      }
    } finally {
      this.busy = false;
      if (await this.store.one("SELECT id FROM jobs WHERE stage = 'queued' LIMIT 1")) void this.drain();
    }
  }

  private async process(row: JobRow, audit: Job) {
    const input = decode<Input>(row.input);
    const { existing } = input;
    const settings = { ...input.settings, brief: briefLimits(input.settings.brief) };
    audit.settings = settings;
    const requested = await this.store.selectedSources(row.doc_id, settings);
    const chunksBySource = new Map(await Promise.all(requested.map(async source => [source.id, await this.store.chunks(source.id)] as const)));
    const chunks = (id: string) => chunksBySource.get(id) ?? [];
    const text = (id: string) => chunks(id).map(chunk => chunk.text).join('\n');
    const examPassages: FactPassage[] = [];
    const selected = requested.map(source => {
      if (settings.brief.documentType?.audience === 'teacher') return source;
      if (source.role === 'format' || source.type !== 'file' || !isExamReference(source.name, text(source.id))) return source;
      if (this.generator.extractFacts && settings.rag !== 'Off') {
        examPassages.push(...factPassages(chunks(source.id)).map(({ ordinal, text }) => ({
          sourceId: source.id, name: source.name, ordinal, text,
        })));
      } else {
        audit.warnings.push('“' + source.name + '” was recognized as an exam and used for format only.');
      }
      return { ...source, role: 'format' as const };
    });
    const formatOnly = selected.some(source => source.role === 'format') &&
      !selected.some(source => source.type === 'file' && source.role !== 'format');
    const retrievalSettings = formatOnly ? { ...settings, rag: 'Off' as const } : settings;
    if (formatOnly && settings.rag !== 'Off' && !examPassages.length) {
      audit.warnings.push('Generated from the brief, format hints and any selected notes because no teaching files were selected.');
    }
    const usable = selected.filter(source => source.type === 'note' || source.status === 'ready' ||
      (source.role !== 'content' && (retrievalSettings.rag === 'Off' || source.role === 'format') && source.chunks > 0));
    if (usable.length < selected.length) {
      audit.warnings.push('Some selected sources are still processing or need attention.');
    }
    const evidence = await retrieve(this.index, row.doc_id, retrievalSettings, usable, chunks, existing?.prompt);
    audit.evidence = evidence;
    if (retrievalSettings.rag !== 'Off' && !evidence.some(item => item.use === 'content') && !examPassages.length) {
      throw new ProviderError('No useful content excerpts were found. Try different materials, choose another mode, or switch to Off.');
    }
    if (selected.some(source => source.role !== 'content') && !evidence.some(item => item.use === 'format')) {
      audit.warnings.push('The selected format sample had no readable passages.');
    }
    if (audit.model !== (settings.generationModel ?? this.generator.model) ||
        (settings.generationModel && !this.generator.listModels) || audit.promptVersion !== PROMPT_VERSION) {
      throw new ProviderError('Generation settings changed after this request was queued. Start a new attempt.');
    }

    const providerWarnings: string[] = [];
    audit.stage = 'generating';
    await this.write(row.id, audit);
    if (this.config.demoDelay) await new Promise(resolve => setTimeout(resolve, this.config.demoDelay));
    if (this.generator.extractFacts && examPassages.length) {
      const facts = await this.generator.extractFacts(settings, examPassages.slice(0, 16));
      audit.usage = facts.usage;
      providerWarnings.push(...(facts.warnings ?? []));
      if (facts.evidence.length) {
        evidence.push(...facts.evidence.slice(0, 40 - evidence.length));
        audit.warnings.push('Past exams supplied source-backed facts and format hints. Original tasks were excluded from drafting.');
      } else {
        const message = 'No supported facts could be extracted from the past exam. Add teaching notes or use the exam as a format reference.';
        if (!evidence.some(item => item.use !== 'format')) throw new ProviderError(message);
        audit.warnings.push(message);
      }
      await this.write(row.id, audit);
    }
    const context = { settings, existing, evidence: evidence.filter(item => item.use !== 'format'),
      format: evidence.filter(item => item.use === 'format'),
      referenceText: usable.filter(source => (settings.brief.documentType?.audience === 'teacher' && retrievalSettings.rag !== 'Off') || source.role === 'format').map(source => text(source.id)) };
    const response = await this.generator.generate(context);
    providerWarnings.push(...(response.warnings ?? []));
    if (audit.usage && response.usage) {
      audit.usage = { input: (audit.usage.input ?? 0) + (response.usage.input ?? 0),
        output: (audit.usage.output ?? 0) + (response.usage.output ?? 0) };
    } else {
      audit.usage ??= response.usage;
    }
    audit.stage = 'validating';
    await this.write(row.id, audit);

    const current = await this.store.document(row.doc_id);
    const draft = validateAssessment(response.output, context, current.draft);
    audit.warnings.push(...draft.warnings);
    draft.warnings = [...new Set(audit.warnings)];
    audit.warnings.push(...new Set(providerWarnings));
    await this.store.transaction(async () => {
      if (existing) {
        audit.preview = draft.sections[0].questions[0];
      } else {
        const { questionId: _questionId, ...snapshotSettings } = settings;
        const version = await this.store.addSnapshot(row.doc_id, 'AI', draft, snapshotSettings, audit.id);
        audit.versionId = version.id;
        const changed = await this.store.run('UPDATE documents SET draft = $1, settings = $2, updated = $3, edit = edit + 1, ready = 0 WHERE id = $4 AND edit = $5',
          encode(draft), encode(snapshotSettings), now(), row.doc_id, row.base_edit);
        if (!changed.changes) audit.warnings.push('Teacher edits were kept. Open the generated version in History.');
      }
      audit.stage = 'succeeded';
      audit.duration = Date.now() - Date.parse(row.started ?? row.created);
      await this.write(row.id, audit);
    });
  }

  private async fail(row: JobRow, audit: Job, error: string) {
    await this.write(row.id, { ...audit, stage: 'failed', duration: Date.now() - Date.parse(row.started ?? row.created), error });
  }

  private async write(id: string, audit: Job) {
    await this.store.run('UPDATE jobs SET stage = $1, audit = $2 WHERE id = $3', audit.stage, encode(audit), id);
  }
}
