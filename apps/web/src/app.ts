import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { initialSettings, isActive, kinds, modes, roleLabels, roles, totalPoints,
  type Assessment, type Brief, type DocumentSummary, type Evidence, type Generation, type Job,
  type Question, type RagMode, type Revision, type Settings, type Source, type SourceRole, type StudioDocument } from '../../../libs/contracts/src';
import { Icon, type IconName } from './icons';
import { compare, type Side } from './compare';

type Tab = 'brief' | 'editor' | 'history' | 'compare' | 'audit';
type Section = Assessment['sections'][number];
type Copy = 'student' | 'teacher';

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(path: string, options: { method?: string; body?: unknown; key?: string } = {}): Promise<T> {
  const form = options.body instanceof FormData;
  const response = await fetch('/api' + path, {
    method: options.method ?? 'GET',
    headers: { ...(options.body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
    body: form ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new ApiError(typeof value.message === 'string' ? value.message : 'The request could not be completed.', response.status);
  }
  return response.json();
}

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'brief', label: 'Brief & sources', icon: 'book' },
  { id: 'editor', label: 'Editor', icon: 'edit' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'compare', label: 'Compare', icon: 'compare' },
  { id: 'audit', label: 'Generation audit', icon: 'audit' },
];

@Component({
  selector: 'studio-root',
  imports: [FormsModule, Icon],
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  private readonly cd = inject(ChangeDetectorRef);
  readonly kinds = kinds;
  readonly modes = modes;
  readonly roles = roles;
  readonly roleLabels = roleLabels;
  readonly tabs = tabs;
  readonly points = totalPoints;
  readonly modeInfo: Record<RagMode, string> = {
    Off: 'Use your brief and pasted notes.',
    Basic: 'Find excerpts with similar meaning.',
    Advanced: 'Blend meaning and keywords. Remove repeats.',
    Graph: 'Follow related topics and nearby passages.',
  };
  readonly steps = [
    { title: 'Set the brief', text: 'Tell Studio what your class needs.', icon: 'edit' as const },
    { title: 'Add your materials', text: 'Use your notes and sample exams.', icon: 'paperclip' as const },
    { title: 'Make it yours', text: 'Review, refine and export your draft.', icon: 'check' as const },
  ];
  provider = 'demo';
  model = '';
  list: DocumentSummary[] = [];
  filter = 'All types';
  search = '';
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
  conflict = false;
  error = '';
  notice = '';
  showCreate = false;
  createKind: Brief['kind'] = 'Exam';
  showNotes = false;
  noteTitle = 'Teaching notes';
  note = '';
  showTeacher = true;
  showExports = false;
  preview?: Revision;
  previewJob?: Job;
  currentAudit?: string;
  openSource?: string;
  compareLeft = '';
  compareRight = 'working';
  drag = false;
  private timer?: ReturnType<typeof setTimeout>;
  private poller?: ReturnType<typeof setInterval>;
  private savePromise?: Promise<boolean>;
  private refreshing = false;
  private navigation = 0;
  private readonly pop = () => void this.loadLocation();
  private readonly unload = (event: BeforeUnloadEvent) => { if (this.dirty) event.preventDefault(); };

  ngOnInit() {
    window.addEventListener('popstate', this.pop);
    window.addEventListener('beforeunload', this.unload);
    void this.loadLocation();
    void api<{ provider: string; model: string }>('/status').then(status => {
      this.provider = status.provider;
      this.model = status.model;
      this.cd.markForCheck();
    }).catch(() => this.fail('The local API could not be reached. Check that Classroom Studio is running.'));
    this.poller = setInterval(() => { void this.refresh(); }, 1050);
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
    clearInterval(this.poller);
    window.removeEventListener('popstate', this.pop);
    window.removeEventListener('beforeunload', this.unload);
  }

  private fail(error: unknown) {
    this.error = error instanceof Error ? error.message : String(error);
    this.cd.markForCheck();
  }

  private url(id?: string, tab: Tab = 'brief', replace = false) {
    const query = id ? '?document=' + encodeURIComponent(id) + '&view=' + tab : '/';
    if (replace) history.replaceState(null, '', query);
    else history.pushState(null, '', query);
  }

  private async loadLocation() {
    const query = new URLSearchParams(location.search);
    const id = query.get('document');
    const tab = this.tabs.find(item => item.id === query.get('view'))?.id ?? 'brief';
    await this.open(id ?? undefined, tab);
  }

  async open(id?: string, tab: Tab = 'brief', writeUrl = false) {
    if (this.dirty && !await this.flush()) {
      this.url(this.doc?.id, this.tab, true);
      return;
    }
    const token = ++this.navigation;
    this.loading = true;
    this.error = '';
    this.notice = '';
    this.preview = undefined;
    this.previewJob = undefined;
    this.showExports = false;
    this.openSource = undefined;
    this.showNotes = false;
    this.cd.markForCheck();
    try {
      if (id) {
        const [doc, versions, jobs] = await Promise.all([
          api<StudioDocument>('/documents/' + id), api<Revision[]>('/documents/' + id + '/versions'), api<Job[]>('/documents/' + id + '/jobs'),
        ]);
        if (token !== this.navigation) return;
        this.apply(doc);
        this.revisions = versions;
        this.jobs = jobs;
        this.tab = tab;
        this.compareLeft = versions[0]?.id ?? '';
        this.compareRight = 'working';
        this.syncMode();
        this.currentAudit = undefined;
      } else {
        const list = await api<DocumentSummary[]>('/documents');
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
        this.cd.markForCheck();
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
    if (!this.doc) return;
    this.tab = tab;
    this.preview = undefined;
    this.showExports = false;
    this.url(this.doc.id, tab, true);
  }

  get filtered() {
    const term = this.search.toLowerCase().trim();
    return this.list.filter(item => (this.filter === 'All types' || item.kind === this.filter) &&
      [item.title, item.subject, item.grade].some(value => value.toLowerCase().includes(term)));
  }

  get heading() {
    return this.draft?.title ?? (this.settings.brief.subject || 'Untitled ' + this.settings.brief.kind.toLowerCase());
  }

  get active() { return this.jobs.find(isActive); }
  get recent(): Job | undefined { return this.jobs[0]; }
  get activeDraft() { return this.preview?.draft ?? this.draft; }
  get selectedSourceCount() { return this.settings.sources.length; }
  get diff() {
    const left = this.side(this.compareLeft);
    const right = this.side(this.compareRight);
    return left && right ? compare(left, right) : null;
  }

  get sourceDiff() {
    const left = this.side(this.compareLeft);
    const right = this.side(this.compareRight);
    const describe = (side: Side) => side.settings.sources.map(source => this.sourceName(source.id) + ' · ' + roleLabels[source.role])
      .sort().join('\n') || 'No selected sources';
    return left && right ? { left: describe(left), right: describe(right) } : null;
  }

  private side(id: string): Side | undefined {
    if (id === 'working') return this.draft ? { draft: this.draft, settings: this.settings, label: 'Working draft' } : undefined;
    const found = this.revisions.find(row => row.id === id);
    return found ? { ...found, label: 'Version ' + found.number + ' · ' + found.kind } : undefined;
  }

  compareDraft() {
    this.compareLeft = this.revisions[0]?.id ?? '';
    this.compareRight = 'working';
    this.selectTab('compare');
  }

  async create(sample = false) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const settings = initialSettings(sample ? 'Exam' : this.createKind);
      if (sample) Object.assign(settings.brief, { brief: 'Create a Year 7 exam on ecosystems, food chains, decomposers and pollination.',
        subject: 'Biology', grade: 'Year 7', topics: 'Ecosystems and food chains', duration: 35, totalPoints: 20 });
      const doc = await api<StudioDocument>('/documents', { method: 'POST', body: { kind: settings.brief.kind, settings } });
      this.showCreate = false;
      await this.open(doc.id, 'brief', true);
      if (sample) {
        const [notes, exam] = await Promise.all([
          api<string>('/sample/notes'), api<string>('/sample/exam'),
        ]);
        const form = new FormData();
        form.set('file', new File([exam], 'Sample exam.txt', { type: 'text/plain' }));
        const material = new FormData();
        material.set('file', new File([notes], 'Ecosystems teaching materials.txt', { type: 'text/plain' }));
        const example = await api<Source>('/documents/' + doc.id + '/files', { method: 'POST', body: form });
        const content = await api<Source>('/documents/' + doc.id + '/files', { method: 'POST', body: material });
        if (this.doc?.id === doc.id) {
          this.addSelection(example, 'format');
          this.addSelection(content, 'content');
          await this.flush();
          this.notice = 'Sample materials added. When both are ready, generate your first draft.';
        }
      }
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.cd.markForCheck(); }
  }

  change() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 550);
    this.cd.markForCheck();
  }

  private async flush(): Promise<boolean> {
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
        const next = await api<StudioDocument>('/documents/' + id, { method: 'PATCH', body: payload });
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
        this.cd.markForCheck();
      }
    })();
    const saved = await this.savePromise;
    if (saved && this.dirty) return this.flush();
    return saved;
  }

  async resolveConflict(keep: boolean) {
    if (!this.doc) return;
    try {
      const latest = await api<StudioDocument>('/documents/' + this.doc.id);
      this.conflict = false;
      this.error = '';
      if (keep) { this.doc = latest; await this.flush(); }
      else this.apply(latest);
    } catch (error) { this.fail(error); }
    this.cd.markForCheck();
  }

  private async refresh() {
    const current = this.doc;
    if (!current || this.refreshing || this.loading) return;
    this.refreshing = true;
    try {
      const [doc, jobs] = await Promise.all([api<StudioDocument>('/documents/' + current.id), api<Job[]>('/documents/' + current.id + '/jobs')]);
      if (this.doc?.id !== current.id) return;
      const latestSuccess = jobs.find(job => job.versionId);
      const priorSuccess = this.jobs.find(job => job.versionId);
      const becameReady = doc.sources.some(item => item.status === 'ready' && !this.doc?.sources.some(old => old.id === item.id && old.status === 'ready'));
      this.jobs = jobs;
      this.doc.sources = doc.sources;
      if (!this.dirty && !this.savePromise && doc.edit > this.doc.edit) this.apply(doc);
      if (becameReady) this.syncMode();
      if (latestSuccess?.id !== priorSuccess?.id || (latestSuccess && !this.revisions.some(row => row.id === latestSuccess.versionId))) {
        await this.loadVersions(current.id);
        if (!this.compareLeft) this.compareLeft = this.revisions[0]?.id ?? '';
      }
    } catch {
      // Keep the working draft visible while the local service reconnects.
    } finally {
      this.refreshing = false;
      this.cd.markForCheck();
    }
  }

  private async loadVersions(id: string) {
    const versions = await api<Revision[]>('/documents/' + id + '/versions');
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
        const source = await api<Source>('/documents/' + id + '/files', { method: 'POST', body: form });
        if (this.doc?.id === id) this.addSelection(source, 'content');
      }
    } catch (error) { this.fail(error); }
    finally { this.uploading = false; this.cd.markForCheck(); }
  }

  drop(event: DragEvent) {
    event.preventDefault();
    this.drag = false;
    void this.upload(event.dataTransfer?.files ?? null);
  }

  async addNote() {
    if (!this.doc || !this.note.trim()) return;
    const id = this.doc.id;
    try {
      const source = await api<Source>('/documents/' + id + '/notes', { method: 'POST', body: { name: this.noteTitle, text: this.note } });
      if (this.doc?.id !== id) return;
      this.addSelection(source, 'content');
      this.note = '';
      this.showNotes = false;
    } catch (error) { this.fail(error); }
    this.cd.markForCheck();
  }

  async retrySource(source: Source) {
    if (!this.doc) return;
    try {
      await api('/documents/' + this.doc.id + '/sources/' + source.id + '/retry', { method: 'POST' });
      await this.refresh();
    } catch (error) { this.fail(error); }
  }

  async removeSource(source: Source) {
    if (!this.doc) return;
    this.selectSource(source, false);
    if (!await this.flush()) return;
    try {
      await api('/documents/' + this.doc.id + '/sources/' + source.id, { method: 'DELETE' });
      await this.refresh();
    } catch (error) { this.fail(error); }
  }

  async generate(question?: Question) {
    if (!this.doc || this.active || this.busy) return;
    if (!this.settings.brief.brief.trim()) { this.fail('Write a short brief first.'); return; }
    this.error = '';
    this.notice = '';
    this.busy = true;
    try {
      if (!await this.flush()) return;
      const id = this.doc.id;
      const settings: Generation = { ...structuredClone(this.settings), ...(question ? { questionId: question.id } : {}) };
      const payload = { settings, edit: this.doc.edit };
      const signature = JSON.stringify(settings);
      const sessionKey = 'studio-attempt-' + id;
      const pending = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null') as { signature: string; key: string } | null;
      const key = pending?.signature === signature ? pending.key : crypto.randomUUID();
      sessionStorage.setItem(sessionKey, JSON.stringify({ signature, key }));
      try {
        const job = await api<Job>('/documents/' + id + '/jobs', { method: 'POST', key, body: payload });
        sessionStorage.removeItem(sessionKey);
        if (this.doc?.id !== id) return;
        this.jobs = [job, ...this.jobs.filter(item => item.id !== job.id)];
        this.notice = question ? 'Question regeneration queued. Review the result before replacing.' : 'Generation queued. You can keep working while it runs.';
      } catch (error) {
        if (error instanceof ApiError && error.status < 500) sessionStorage.removeItem(sessionKey);
        throw error;
      }
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.cd.markForCheck(); }
  }

  retryGeneration() {
    const id = this.recent?.settings.questionId;
    const question = this.draft?.sections.flatMap(section => section.questions).find(item => item.id === id);
    if (id && !question) { this.fail('The original question is no longer in this draft.'); return; }
    void this.generate(question);
  }

  editBlank() {
    if (!this.draft) {
      this.draft = { title: 'Untitled ' + this.settings.brief.kind.toLowerCase(), instructions: '',
        sections: [{ id: crypto.randomUUID(), title: 'Section 1', instructions: '', questions: [] }],
        teacherNotes: '', evidence: [], warnings: [] };
      this.change();
    }
    this.selectTab('editor');
  }

  addSection() {
    if (!this.draft || this.draft.sections.length >= 8) return;
    this.draft.sections.push({ id: crypto.randomUUID(), title: 'Section ' + (this.draft.sections.length + 1), instructions: '', questions: [] });
    this.change();
  }

  addQuestion(section: Section) {
    if (section.questions.length >= 30 || (this.draft?.sections.flatMap(row => row.questions).length ?? 0) >= 40) return;
    section.questions.push({ id: crypto.randomUUID(), prompt: 'New question', points: 1, lines: 3, answer: '', rubric: '', citations: [] });
    this.change();
  }

  move(section: Section, index: number, offset: number) {
    const next = index + offset;
    if (next < 0 || next >= section.questions.length) return;
    [section.questions[index], section.questions[next]] = [section.questions[next], section.questions[index]];
    this.change();
  }

  moveTo(section: Section, question: Question, id: string) {
    const destination = this.draft?.sections.find(item => item.id === id);
    if (!destination || destination === section || destination.questions.length >= 30) return;
    section.questions = section.questions.filter(item => item.id !== question.id);
    destination.questions.push(question);
    this.change();
  }

  removeQuestion(section: Section, index: number) { section.questions.splice(index, 1); this.change(); }
  removeSection(index: number) {
    if (this.draft && this.draft.sections.length > 1 && !this.draft.sections[index].questions.length) {
      this.draft.sections.splice(index, 1);
      this.change();
    }
  }

  evidenceFor(question: Question): Evidence[] {
    const ids = new Set(question.citations);
    return (this.activeDraft?.evidence ?? []).filter(item => ids.has(item.id));
  }

  get pendingPreviews() {
    return this.jobs.filter(job => job.preview && this.draft?.sections.some(section =>
      section.questions.some(question => question.id === job.settings.questionId)));
  }

  replaceQuestion(job: Job) {
    const section = this.draft?.sections.find(row => row.questions.some(q => q.id === job.settings.questionId));
    if (!section || !job.preview || !this.draft) return;
    const current = section.questions.findIndex(question => question.id === job.settings.questionId);
    section.questions[current] = structuredClone(job.preview);
    const ids = new Set(this.draft.evidence.map(item => item.id));
    this.draft.evidence.push(...job.evidence.filter(item => job.preview?.citations.includes(item.id) && !ids.has(item.id)));
    this.draft.warnings = [...new Set([...this.draft.warnings, ...job.warnings])].slice(0, 24);
    this.previewJob = undefined;
    this.notice = 'Question replaced in the working draft.';
    this.change();
  }

  async saveVersion(kind: 'Teacher' | 'Ready', acceptWarnings = false) {
    if (!this.doc || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      if (!await this.flush()) return;
      const id = this.doc.id;
      const version = await api<Revision>('/documents/' + id + '/versions', { method: 'POST', body: { edit: this.doc.edit, kind, acceptWarnings } });
      if (this.doc?.id !== id) return;
      this.revisions = [version, ...this.revisions];
      this.notice = 'Version ' + version.number + (kind === 'Ready' ? ' is ready.' : ' saved.');
      await this.refresh();
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.cd.markForCheck(); }
  }

  viewVersion(version: Revision) {
    this.selectTab('history');
    this.preview = version;
  }

  async restore(version: Revision) {
    if (!this.doc || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      if (!await this.flush()) return;
      const id = this.doc.id;
      const doc = await api<StudioDocument>('/documents/' + id + '/versions/' + version.id + '/restore',
        { method: 'POST', body: { edit: this.doc.edit } });
      if (this.doc?.id !== id) return;
      this.apply(doc);
      this.syncMode();
      await this.loadVersions(id);
      this.selectTab('editor');
      this.notice = 'Version ' + version.number + ' restored as a new working revision.';
    } catch (error) { this.fail(error); }
    finally { this.busy = false; this.cd.markForCheck(); }
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

  revisionFor(job: Job) { return this.revisions.find(item => item.id === job.versionId); }
  jobRole(job: Job, id: string) {
    const role = job.settings.sources.find(item => item.id === id)?.role;
    return role ? roleLabels[role] : 'Source';
  }
  summaryLabel(item: DocumentSummary) {
    return [item.subject, item.grade].filter(Boolean).join(' · ') || (item.language === 'de' ? 'German' : 'English');
  }
  sourceName(id: string) { return this.doc?.sources.find(item => item.id === id)?.name ?? 'Archived source'; }
  time(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  shortDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
}
