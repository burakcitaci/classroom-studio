import { DocumentTypesStore } from '../document-types/document-types.store';
import { designCopy } from '../../shared/studio-ui';
import { Notifications } from '../../core/notifications';
import { interfaceLocale } from '../../core/i18n/locale';
import { ui } from '../../core/i18n/ui-messages';
import { Injectable, inject, signal, type OnDestroy } from '@angular/core';
import { initialSettings, isActive, briefSchema, kinds, type DocumentType, type Assessment, type Brief, type DocumentContextInput, type DocumentSummary, type Generation, type Job,
  type Question, type RagMode, type Revision, type Settings, type Source, type SourceRole, type StudioDocument } from '../../../../../../libs/contracts/src';
import { ApiError, StudioApi } from '../../core/studio-api';
import { workspaceTabs, type Tab } from './workspace-tabs';

type Copy = 'student' | 'teacher';

@Injectable()
export class WorkspaceStore implements OnDestroy {
  private readonly api = inject(StudioApi);
  readonly documentTypes = inject(DocumentTypesStore);
  get typeTitle() { return this.settings.brief.documentType?.title ?? ui(this.settings.brief.kind); }
  get previewTitle() { return this.settings.brief.documentType?.audience === 'teacher' ? $localize`:@@teacherPreviewTitle:Preview the teacher copy` : $localize`:@@studentPreviewTitle:Preview the student copy`; }
  get selectedDocumentType() { return this.settings.brief.documentType?.id ?? this.settings.brief.kind; }
  chooseDocumentType(value: string) {
    if (!this.planEditing) return;
    const type = this.documentTypes.items().find(item => item.id === value);
    const { documentType: previous, ...brief } = this.settings.brief;
    void previous;
    if (type) this.settings.brief = { ...brief, kind: 'Custom', documentType: this.typeSnapshot(type) };
    else if (kinds.some(kind => kind === value)) this.settings.brief = { ...brief, kind: value as Brief['kind'] };
    else return;
    this.change();
  }
  private typeSnapshot(type: DocumentType) {
    const { id, edit, title, guidance, audience } = type;
    return { id, edit, title, guidance, audience };
  }
  private readonly notifications = inject(Notifications);
  private trackedJob?: { id: string; stage?: Job['stage'] };
  private readonly viewRevision = signal(0);

  provider: 'demo' | 'ollama' | undefined;
  ollamaModels: string[] = [];
  loadingModels = false;
  modelListError = '';
  list: DocumentSummary[] = [];
  section: 'classes' | 'documents' | 'types' = 'classes';
  classId?: string;
  lessonId?: string;
  tab: Tab = 'brief';
  doc?: StudioDocument;
  settings: Settings = initialSettings();
  draft: Assessment | null = null;
  revisions: Revision[] = [];
  jobs: Job[] = [];
  loading = true;
  busy = false;
  uploading = false;
  dirty = false;
  savingPlan = false;
  private planOriginal: Brief | null = null;
  get planEditing() { return this.planOriginal !== null; }
  conflict = false;
  private currentError = '';
  private currentNotice = '';
  get error() { return this.currentError; }
  set error(value: string) {
    this.currentError = value;
    if (!value) { this.notifications.dismiss('workspace-error'); return; }
    this.notifications.error(value, {
      id: 'workspace-error',
      ...(this.conflict ? {
        dismissible: false,
        action: { label: ui('Keep my edits'), onClick: () => { void this.resolveConflict(true); } },
        cancel: { label: ui('Load latest draft'), onClick: () => { void this.resolveConflict(false); } },
      } : {}),
    });
  }
  get notice() { return this.currentNotice; }
  set notice(value: string) {
    this.currentNotice = value;
    if (value) this.notifications.success(value);
  }
  showExports = false;
  preview?: Revision;
  compareLeft = '';
  compareRight = 'working';
  readonly showTeacher = signal(true);
  readonly noteDraft = { open: false, title: $localize`:@@ui_894779e6804f:Teaching notes`, text: '' };
  private timer?: ReturnType<typeof setTimeout>;
  private poller?: ReturnType<typeof setInterval>;
  private savePromise?: Promise<boolean>;
  private refreshing = false;
  private generationEpoch = 0;
  private navigation = 0;
  private readonly pop = () => void this.loadLocation();
  private readonly unload = (event: BeforeUnloadEvent) => { if (this.dirty) event.preventDefault(); };

  // Forms edit the working copy in place. Publish after each coordinated state change.
  get view(): this {
    this.viewRevision();
    return this;
  }

  private publish() {
    this.syncGenerationToast();
    this.viewRevision.update(revision => revision + 1);
  }

  private syncGenerationToast() {
    const active = this.active;
    if (active) {
      if (this.trackedJob?.id === active.id && this.trackedJob.stage === active.stage) return;
      this.trackedJob = { id: active.id, stage: active.stage };
      const label = active.stage === 'queued' ? ui('Queued') : active.stage === 'retrieving' ? ui('Finding source excerpts')
        : active.stage === 'generating' ? ui('Writing your draft') : ui('Checking structure and points');
      this.notifications.loading(label, {
        id: 'generation-progress', description: ui('Progress is saved. You can leave or refresh this page.'),
        action: { label: ui('View audit'), onClick: () => this.selectTab('audit') },
      });
      return;
    }
    if (!this.trackedJob) return;
    const completed = this.jobs.find(job => job.id === this.trackedJob?.id);
    this.trackedJob = undefined;
    if (completed?.stage === 'failed') {
      this.notifications.error(ui('Last attempt failed'), {
        id: 'generation-progress', description: ui(completed.error),
        action: { label: ui('View audit'), onClick: () => this.selectTab('audit') },
        cancel: { label: ui('Retry'), onClick: () => this.retryGeneration() },
      });
    } else if (completed?.stage === 'succeeded') {
      this.notifications.success(completed.settings.questionId ? $localize`:@@replacementReady:Your replacement question is ready to review.` : ui('Your draft is ready to review.'), {
        id: 'generation-progress', action: { label: ui('Open editor'), onClick: () => this.selectTab('editor') },
      });
    } else this.notifications.dismiss('generation-progress');
  }

  toggleExports() {
    this.showExports = !this.showExports;
    this.preview = undefined;
    this.publish();
  }

  connect() {
    void this.documentTypes.load();
    window.addEventListener('popstate', this.pop);
    window.addEventListener('beforeunload', this.unload);
    void this.loadLocation();
    void this.api.request<{ provider: 'demo' | 'ollama' }>('/status').then(status => {
      this.provider = status.provider;
      if (status.provider === 'ollama') void this.loadModels();
      this.publish();
    }).catch(() => this.fail($localize`:@@ui_5047a9efcde3:The local API could not be reached. Check that Classroom Studio is running.`));
    this.poller = setInterval(() => { void this.refresh(); }, 1050);
  }

  async loadModels() {
    if (this.loadingModels) return;
    this.loadingModels = true;
    this.modelListError = '';
    this.publish();
    try {
      this.ollamaModels = await this.api.request<string[]>('/models');
      if (!this.ollamaModels.length) this.modelListError = $localize`:@@ui_03e2d12523e3:No local text generation models found in Ollama.`;
    } catch (error) {
      this.ollamaModels = [];
      this.modelListError = error instanceof Error ? error.message : $localize`:@@ui_3539f1f093d2:Could not load Ollama models.`;
    } finally {
      this.loadingModels = false;
      this.publish();
    }
  }

  get generationModel() {
    const model = this.settings.generationModel;
    return model && this.ollamaModels.includes(model) ? model : '';
  }

  chooseGenerationModel(model: string) {
    if (!this.ollamaModels.includes(model)) return;
    this.settings = { ...this.settings, generationModel: model };
    this.change();
  }

  ngOnDestroy() {
    this.notifications.dismiss('generation-progress');
    clearTimeout(this.timer);
    clearInterval(this.poller);
    window.removeEventListener('popstate', this.pop);
    window.removeEventListener('beforeunload', this.unload);
  }

  private fail(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.publish();
  }

  private url(id?: string, tab: Tab = 'brief', replace = false) {
    const params = new URLSearchParams(id ? { document: id, view: tab } : { view: 'documents' });
    params.set('lang', interfaceLocale);
    const query = '?' + params.toString();
    if (replace) history.replaceState(null, '', query);
    else history.pushState(null, '', query);
  }

  private async loadLocation() {
    const query = new URLSearchParams(location.search);
    const id = query.get('document');
    const view = query.get('view');
    if (view === 'types' && !id) { await this.openTypes(); }
    else if (id || view === 'documents') {
      const tab = workspaceTabs.find(item => item.id === view)?.id ?? 'brief';
      await this.open(id ?? undefined, tab);
    } else {
      await this.openClass(query.get('class') ?? undefined, query.get('lesson') ?? undefined);
    }
  }

  async openTypes(writeUrl = false) {
    if (!this.canLeavePlan()) return;
    if (this.dirty && !await this.flush()) return;
    ++this.navigation;
    this.notifications.dismiss('generation-progress');
    this.trackedJob = undefined;
    this.section = 'types';
    this.classId = undefined;
    this.lessonId = undefined;
    this.doc = undefined;
    this.draft = null;
    this.jobs = [];
    this.preview = undefined;
    this.showExports = false;
    this.error = '';
    this.loading = false;
    if (writeUrl) history.pushState(null, '', '?view=types&lang=' + interfaceLocale);
    this.publish();
  }

  async openClass(classId?: string, lessonId?: string, writeUrl = false) {
    if (!this.canLeavePlan()) { this.url(this.doc?.id, this.tab, true); return; }
    if (this.dirty && !await this.flush()) {
      this.url(this.doc?.id, this.tab, true);
      return;
    }
    ++this.navigation;
    this.notifications.dismiss('generation-progress');
    this.trackedJob = undefined;
    this.section = 'classes';
    this.classId = classId;
    this.lessonId = classId ? lessonId : undefined;
    this.doc = undefined;
    this.draft = null;
    this.jobs = [];
    this.preview = undefined;
    this.showExports = false;
    this.error = '';
    this.notice = '';
    this.loading = false;
    if (writeUrl) {
      const query = new URLSearchParams({ lang: interfaceLocale });
      if (this.classId) query.set('class', this.classId);
      if (this.lessonId) query.set('lesson', this.lessonId);
      history.pushState(null, '', query.size ? '?' + query.toString() : '/');
    }
    this.publish();
  }

  async open(id?: string, tab: Tab = 'brief', writeUrl = false) {
    if (!this.canLeavePlan()) { this.url(this.doc?.id, this.tab, true); return; }
    if (this.dirty && !await this.flush()) {
      this.url(this.doc?.id, this.tab, true);
      return;
    }
    const token = ++this.navigation;
    this.notifications.dismiss('generation-progress');
    this.trackedJob = undefined;
    this.jobs = [];
    this.section = 'documents';
    this.loading = true;
    this.error = '';
    this.notice = '';
    this.preview = undefined;
    this.showExports = false;
    this.noteDraft.open = false;
    this.publish();
    try {
      if (id) {
        const [doc, versions, jobs] = await Promise.all([
          this.api.request<StudioDocument>('/documents/' + id), this.api.request<Revision[]>('/documents/' + id + '/versions'), this.api.request<Job[]>('/documents/' + id + '/jobs'),
        ]);
        if (token !== this.navigation) return;
        this.apply(doc);
        this.revisions = versions;
        this.jobs = jobs;
        this.tab = tab;
        if (tab === 'brief' && !doc.draft && !doc.settings.brief.brief.trim()) this.planOriginal = structuredClone(this.settings.brief);
        this.compareLeft = versions[0]?.id ?? '';
        this.compareRight = 'working';
        this.syncMode();
      } else {
        const list = await this.api.request<DocumentSummary[]>('/documents');
        if (token !== this.navigation) return;
        this.doc = undefined;
        this.list = list;
      }
      if (writeUrl) this.url(id, tab);
    } catch (error) {
      if (token === this.navigation) this.fail(error);
    } finally {
      if (token === this.navigation) {
        this.loading = false;
        this.publish();
      }
    }
  }

  private apply(doc: StudioDocument) {
    this.doc = doc;
    this.settings = structuredClone(doc.settings);
    this.draft = structuredClone(doc.draft);
    this.dirty = false;
    this.conflict = false;
  }

  selectTab(tab: Tab) {
    if (!this.doc || (tab !== this.tab && !this.canLeavePlan())) return;
    if (tab === 'brief' && !this.draft && !this.settings.brief.brief.trim()) this.planOriginal ??= structuredClone(this.settings.brief);
    this.tab = tab;
    this.preview = undefined;
    this.showExports = false;
    this.url(this.doc.id, tab, true);
    this.publish();
  }

  get heading() {
    const { topics, kind, subject } = this.settings.brief;
    return this.draft?.title ?? (topics ? topics + ' · ' + this.typeTitle : subject || $localize`:@@ui_53d5bfdb3865:Untitled ` + this.typeTitle.toLowerCase());
  }

  get active() { return this.jobs.find(isActive); }
  get recent(): Job | undefined { return this.jobs[0]; }

  get selectedSourceCount() { return this.settings.sources.length; }

  compareDraft() {
    this.compareLeft = this.revisions[0]?.id ?? '';
    this.compareRight = 'working';
    this.selectTab('compare');
  }

  async create(kind: string, sample = false, context?: DocumentContextInput): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    try {
      const type = this.documentTypes.items().find(item => item.id === kind);
      const builtin = kinds.find(value => value === kind);
      if (!sample && !type && !builtin) { this.fail($localize`:@@typeUnavailable:This document type is unavailable. Refresh the type list.`); return false; }
      const settings = initialSettings(sample ? 'Exam' : type ? 'Custom' : builtin!);
      if (type && !sample) settings.brief.documentType = this.typeSnapshot(type);
      settings.brief.language = interfaceLocale;
      if (sample) Object.assign(settings.brief, { brief: $localize`:@@ui_92e28b36fde1:Create a Year 7 exam on ecosystems, food chains, decomposers and pollination.`,
        subject: $localize`:@@ui_ffa48e0bbc31:Biology`, grade: $localize`:@@ui_8d4ce3e592ee:Year 7`, topics: $localize`:@@ui_1f5cbd1c9bff:Ecosystems and food chains`, duration: 35, totalPoints: 20 });
      const doc = await this.api.request<StudioDocument>('/documents', { method: 'POST', body: { kind: settings.brief.kind, settings, ...(context ? { context } : {}) } });
      await this.open(doc.id, 'brief', true);
      if (sample) {
        const [notes, exam] = await Promise.all([
          this.api.request<string>('/sample/notes'), this.api.request<string>('/sample/exam'),
        ]);
        const form = new FormData();
        form.set('file', new File([exam], $localize`:@@ui_44b0a67a4544:Sample exam.txt`, { type: 'text/plain' }));
        const material = new FormData();
        material.set('file', new File([notes], $localize`:@@ui_0556751a3d1c:Ecosystems teaching materials.txt`, { type: 'text/plain' }));
        const example = await this.api.request<Source>('/documents/' + doc.id + '/files', { method: 'POST', body: form });
        const content = await this.api.request<Source>('/documents/' + doc.id + '/files', { method: 'POST', body: material });
        if (this.doc?.id === doc.id) {
          this.addSelection(example, 'format');
          this.addSelection(content, 'content');
          await this.flush();
          this.notice = $localize`:@@ui_a5e4bf0d5df2:Sample materials added. When both are ready, generate your first draft.`;
        }
      }
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    } finally { this.busy = false; this.publish(); }
  }

  async fileDocument(context: DocumentContextInput): Promise<boolean> {
    const id = this.doc?.id;
    if (!id || this.busy) return false;
    this.busy = true;
    this.error = '';
    try {
      if (!await this.flush() || this.doc?.id !== id) return false;
      const next = await this.api.request<StudioDocument>('/documents/' + id + '/location', {
        method: 'PATCH', body: { edit: this.doc.edit, context },
      });
      if (this.doc?.id !== id) return false;
      this.apply(next);
      this.notice = next.context ? $localize`:@@ui_e06fe39cd534:Document filed under ` + (next.context.lessonTitle ?? next.context.classTitle) + '.' : $localize`:@@ui_4f7b44ee23dd:Document is now unfiled.`;
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    } finally { this.busy = false; this.publish(); }
  }

  async editPlan() {
    if (!this.doc || this.busy || this.planEditing) return;
    const id = this.doc.id;
    if (!await this.flush() || this.doc?.id !== id || this.planEditing) return;
    clearTimeout(this.timer);
    this.planOriginal = structuredClone(this.settings.brief);
    this.publish();
  }

  cancelPlan() {
    if (!this.planOriginal || this.savingPlan) return;
    this.settings = { ...this.settings, brief: structuredClone(this.planOriginal) };
    this.planOriginal = null;
    this.dirty = Boolean(this.doc && (JSON.stringify(this.settings) !== JSON.stringify(this.doc.settings) ||
      JSON.stringify(this.draft) !== JSON.stringify(this.doc.draft)));
    if (this.dirty) this.change();
    else { this.conflict = false; this.error = ''; this.publish(); }
  }

  async savePlan(): Promise<boolean> {
    if (!this.doc || !this.planEditing || this.busy) return false;
    if (this.conflict) { this.fail(this.currentError); return false; }
    const checked = briefSchema.safeParse(this.settings.brief);
    if (!checked.success) { this.fail($localize`:@@planInvalid:Check the plan fields, including duration and total points.`); return false; }
    if (!checked.data.brief.trim()) { this.fail(ui('Write a short brief first.')); return false; }
    this.settings = { ...this.settings, brief: checked.data };
    this.busy = true;
    this.savingPlan = true;
    this.dirty = true;
    this.error = '';
    this.publish();
    try {
      if (!await this.flush()) return false;
      this.planOriginal = null;
      this.notice = $localize`:@@planSaved:Plan saved.`;
      return true;
    } finally {
      this.savingPlan = false;
      this.busy = false;
      this.publish();
    }
  }

  private canLeavePlan() {
    if (this.savingPlan) return false;
    if (this.planEditing && this.dirty) {
      this.fail($localize`:@@planSaveBeforeLeaving:Save or cancel your plan changes before leaving.`);
      return false;
    }
    this.planOriginal = null;
    return true;
  }

  change() {
    this.dirty = true;
    clearTimeout(this.timer);
    if (!this.planEditing) this.timer = setTimeout(() => { void this.flush(); }, 550);
    this.publish();
  }

  async prepareLocaleChange(): Promise<boolean> {
    if (!this.canLeavePlan()) return false;
    if (this.busy || this.uploading) return false;
    return this.flush();
  }

  private async flush(): Promise<boolean> {
    if (this.planEditing && !this.savingPlan && this.dirty) { this.fail($localize`:@@planSaveBeforeLeaving:Save or cancel your plan changes before leaving.`); return false; }
    clearTimeout(this.timer);
    if (this.savePromise) {
      if (!await this.savePromise) return false;
    }
    if (!this.dirty || !this.doc) return true;
    if (this.conflict) return false;
    const id = this.doc.id;
    const payload = { edit: this.doc.edit, settings: this.settings, draft: this.draft };
    const sent = JSON.stringify(payload);
    this.savePromise = (async () => {
      try {
        const next = await this.api.request<StudioDocument>('/documents/' + id, { method: 'PATCH', body: payload });
        if (this.doc?.id !== id) return true;
        this.doc = next;
        this.dirty = sent !== JSON.stringify(payload) ||
          JSON.stringify(payload.settings) !== JSON.stringify(this.settings) || JSON.stringify(payload.draft) !== JSON.stringify(this.draft);
        return true;
      } catch (error) {
        this.conflict = error instanceof ApiError && error.status === 409;
        this.fail(error);
        return false;
      } finally {
        this.savePromise = undefined;
        this.publish();
      }
    })();
    const saved = await this.savePromise;
    if (saved && this.dirty) return this.flush();
    return saved;
  }

  async resolveConflict(keep: boolean) {
    if (!this.doc) return;
    try {
      const latest = await this.api.request<StudioDocument>('/documents/' + this.doc.id);
      this.conflict = false;
      this.error = '';
      if (keep) { this.doc = latest; if (this.planEditing) await this.savePlan(); else await this.flush(); }
      else { this.planOriginal = null; this.apply(latest); }
    } catch (error) { this.fail(error); }
    this.publish();
  }

  private async refresh() {
    const current = this.doc;
    if (!current || this.refreshing || this.loading) return;
    const generationEpoch = this.generationEpoch;
    this.refreshing = true;
    try {
      const [doc, jobs] = await Promise.all([this.api.request<StudioDocument>('/documents/' + current.id), this.api.request<Job[]>('/documents/' + current.id + '/jobs')]);
      // A poll started before the generation response may omit the new job.
      if (this.doc?.id !== current.id || generationEpoch !== this.generationEpoch) return;
      const latestSuccess = jobs.find(job => job.versionId);
      const priorSuccess = this.jobs.find(job => job.versionId);
      const becameReady = doc.sources.some(item => item.status === 'ready' && !this.doc?.sources.some(old => old.id === item.id && old.status === 'ready'));
      this.jobs = jobs;
      this.doc.sources = doc.sources;
      if (!this.dirty && !this.savePromise && !this.planEditing && doc.edit > this.doc.edit) this.apply(doc);
      if (becameReady) this.syncMode();
      if (latestSuccess?.id !== priorSuccess?.id || (latestSuccess && !this.revisions.some(row => row.id === latestSuccess.versionId))) {
        await this.loadVersions(current.id);
        if (!this.compareLeft) this.compareLeft = this.revisions[0]?.id ?? '';
      }
    } catch {
      // Keep the working draft visible while the local service reconnects.
    } finally {
      this.refreshing = false;
      this.publish();
    }
  }

  private async loadVersions(id: string) {
    const versions = await this.api.request<Revision[]>('/documents/' + id + '/versions');
    if (this.doc?.id === id) this.revisions = versions;
  }

  useAutomaticMode() {
    this.settings.automatic = true;
    this.settings.rag = this.defaultMode();
    this.change();
  }

  private syncMode() {
    if (this.settings.automatic === false || this.defaultMode() === this.settings.rag) return;
    this.settings.rag = this.defaultMode();
    this.change();
  }

  private defaultMode(): RagMode {
    return this.doc?.sources.some(source => source.status === 'ready' && source.type === 'file' &&
      this.settings.sources.some(choice => choice.id === source.id && choice.role !== 'format')) ? 'Basic' : 'Off';
  }

  chooseMode(mode: RagMode) {
    this.settings.automatic = false;
    this.settings.rag = mode;
    this.change();
  }

  selectSource(source: Source, selected: boolean) {
    if (selected) this.addSelection(source, 'content');
    else {
      this.settings.sources = this.settings.sources.filter(item => item.id !== source.id);
      this.syncMode();
      this.change();
    }
  }

  role(id: string) { return this.settings.sources.find(item => item.id === id)?.role; }
  changeRole(id: string, role: SourceRole) {
    const choice = this.settings.sources.find(item => item.id === id);
    if (!choice) return;
    choice.role = role;
    this.syncMode();
    this.change();
  }

  private addSelection(source: Source, role: SourceRole) {
    if (!this.doc) return;
    if (!this.doc.sources.some(item => item.id === source.id)) this.doc.sources.push(source);
    if (!this.role(source.id)) this.settings.sources.push({ id: source.id, role });
    this.syncMode();
    this.change();
  }

  async upload(files: FileList | null) {
    if (!this.doc || !files?.length || this.uploading) return;
    const id = this.doc.id;
    this.uploading = true;
    this.error = '';
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set('file', file);
        const source = await this.api.request<Source>('/documents/' + id + '/files', { method: 'POST', body: form });
        if (this.doc?.id === id) this.addSelection(source, 'content');
      }
    } catch (error) { this.fail(error); }
    finally { this.uploading = false; this.publish(); }
  }

  async addNote() {
    const { title: name, text } = this.noteDraft;
    if (!this.doc || !text.trim()) return;
    const id = this.doc.id;
    try {
      const source = await this.api.request<Source>('/documents/' + id + '/notes', { method: 'POST', body: { name, text } });
      if (this.doc?.id !== id) return;
      if (this.noteDraft.text === text && this.noteDraft.title === name) {
        this.noteDraft.text = '';
        this.noteDraft.open = false;
      }
      this.addSelection(source, 'content');
    } catch (error) {
      this.fail(error);
    }
  }

  async retrySource(source: Source) {
    if (!this.doc) return;
    try {
      await this.api.request('/documents/' + this.doc.id + '/sources/' + source.id + '/retry', { method: 'POST' });
      await this.refresh();
    } catch (error) { this.fail(error); }
  }

  async removeSource(source: Source) {
    if (!this.doc) return;
    this.selectSource(source, false);
    if (!await this.flush()) return;
    try {
      await this.api.request('/documents/' + this.doc.id + '/sources/' + source.id, { method: 'DELETE' });
      await this.refresh();
    } catch (error) { this.fail(error); }
  }

  async generate(question?: Question) {
    if (!this.doc || this.active || this.busy || !this.provider) return;
    if (this.provider === 'ollama' && !this.generationModel) { this.fail($localize`:@@ui_b60ace3c7fbc:Choose an Ollama model before generating.`); return; }
    if (!this.settings.brief.brief.trim()) { this.fail($localize`:@@ui_01d9c7043ed3:Write a short brief first.`); return; }
    this.error = '';
    this.notice = '';
    this.busy = true;
    try {
      const id = this.doc.id;
      if (!await this.flush() || this.doc?.id !== id) return;
      const { generationModel, ...saved } = structuredClone(this.settings);
      const settings: Generation = { ...saved, ...(this.provider === 'ollama' ? { generationModel } : {}),
        ...(question ? { questionId: question.id } : {}) };
      const payload = { settings, edit: this.doc.edit };
      const signature = JSON.stringify(settings);
      const sessionKey = 'studio-attempt-' + id;
      const pending = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null') as { signature: string; key: string } | null;
      const key = pending?.signature === signature ? pending.key : crypto.randomUUID();
      sessionStorage.setItem(sessionKey, JSON.stringify({ signature, key }));
      try {
        const job = await this.api.request<Job>('/documents/' + id + '/jobs', { method: 'POST', key, body: payload });
        sessionStorage.removeItem(sessionKey);
        if (this.doc?.id !== id) return;
        ++this.generationEpoch;
        // Polling can discover this job before POST returns. Keep that newer
        // stage and its notification instead of replaying the queued snapshot.
        if (!this.jobs.some(item => item.id === job.id)) {
          this.trackedJob = { id: job.id };
          this.jobs = [job, ...this.jobs];
        }
        this.currentNotice = question ? $localize`:@@ui_aac93893377e:Question regeneration queued. Review the result before replacing.` : $localize`:@@ui_9c31fd23e911:Generation queued. You can keep working while it runs.`;
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) sessionStorage.removeItem(sessionKey);
        throw error;
      }
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.publish(); }
  }

  retryGeneration() {
    const id = this.recent?.settings.questionId;
    const question = this.draft?.sections.flatMap(section => section.questions).find(item => item.id === id);
    if (id && !question) { this.fail($localize`:@@ui_4201e7ad1170:The original question is no longer in this draft.`); return; }
    void this.generate(question);
  }

  async renameVersion(version: Revision, name: string): Promise<boolean> {
    if (!this.doc) return false;
    const id = this.doc.id;
    try {
      const renamed = await this.api.request<Revision>('/documents/' + id + '/versions/' + version.id, {
        method: 'PATCH', body: { name, nameEdit: version.nameEdit ?? 0 },
      });
      if (this.doc?.id !== id) return false;
      this.revisions = this.revisions.map(item => item.id === renamed.id ? renamed : item);
      if (this.preview?.id === renamed.id) this.preview = renamed;
      this.notice = designCopy.nameSaved;
      this.publish();
      return true;
    } catch (error) { this.fail(error); return false; }
  }

  async saveVersion(kind: 'Teacher' | 'Ready', acceptWarnings = false) {
    if (!this.doc || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      if (!await this.flush()) return;
      const id = this.doc.id;
      const version = await this.api.request<Revision>('/documents/' + id + '/versions', { method: 'POST', body: { edit: this.doc.edit, kind, acceptWarnings } });
      if (this.doc?.id !== id) return;
      this.revisions = [version, ...this.revisions];
      this.notice = $localize`:@@ui_03283ea975df:Version ` + version.number + (kind === 'Ready' ? $localize`:@@ui_618a29e28acf: is ready.` : ui(' saved.'));
      await this.refresh();
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.publish(); }
  }


  viewVersion(version: Revision) {
    this.selectTab('history');
    this.preview = version;
    this.publish();
  }

  async restore(version: Revision) {
    if (!this.doc || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      if (!await this.flush()) return;
      const id = this.doc.id;
      const doc = await this.api.request<StudioDocument>('/documents/' + id + '/versions/' + version.id + '/restore',
        { method: 'POST', body: { edit: this.doc.edit } });
      if (this.doc?.id !== id) return;
      this.apply(doc);
      this.syncMode();
      await this.loadVersions(id);
      this.selectTab('editor');
      this.notice = $localize`:@@ui_03283ea975df:Version ` + version.number + $localize`:@@ui_958dbd450c0b: restored as a new working revision.`;
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.publish(); }
  }

  async export(copy: Copy, format: 'docx' | 'print', version?: Revision) {
    if (!this.doc) return;
    const target = '/api/documents/' + this.doc.id + '/export?copy=' + copy + '&format=' + format +
      (version ? '&version=' + version.id : '');
    const windowRef = format === 'print' ? window.open('about:blank', '_blank') : null;
    if (!version && !await this.flush()) { windowRef?.close(); return; }
    if (format === 'print') {
      if (windowRef) { windowRef.opener = null; windowRef.location.href = target; }
      else location.href = target;
      return;
    }
    const link = document.createElement('a');
    link.href = target;
    link.download = 'classroom-studio-' + copy + '.docx';
    link.click();
  }
}
